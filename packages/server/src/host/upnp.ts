// Minimal UPnP IGD client: find the home router via SSDP and ask it to forward a TCP port.
// Only Node built-ins (the server ships as a single exe), XML handled with small regex helpers.
import dgram from 'node:dgram';
import http from 'node:http';
import https from 'node:https';
import os from 'node:os';

export const SSDP_ADDRESS = '239.255.255.250';
export const SSDP_PORT = 1900;

/** Search targets sent in the M-SEARCH, most specific first. */
export const SSDP_SEARCH_TARGETS = [
  'urn:schemas-upnp-org:device:InternetGatewayDevice:1',
  'urn:schemas-upnp-org:device:InternetGatewayDevice:2',
  'urn:schemas-upnp-org:service:WANIPConnection:1',
];

/** WAN services that can add port mappings, in order of preference. */
export const WAN_SERVICE_TYPES = [
  'urn:schemas-upnp-org:service:WANIPConnection:1',
  'urn:schemas-upnp-org:service:WANIPConnection:2',
  'urn:schemas-upnp-org:service:WANPPPConnection:1',
];

export interface Gateway {
  /** URL of the device description XML (from the SSDP LOCATION header). */
  location: string;
  /** Absolute URL that SOAP requests are POSTed to. */
  controlUrl: string;
  /** e.g. urn:schemas-upnp-org:service:WANIPConnection:1 */
  serviceType: string;
}

export type PortProtocol = 'TCP' | 'UDP';

/** Error returned by the router (SOAP fault), with the UPnP error code when there is one. */
export class UpnpError extends Error {
  readonly code: number | null;
  constructor(message: string, code: number | null = null) {
    super(message);
    this.name = 'UpnpError';
    this.code = code;
  }
}

// ---------------------------------------------------------------------------------------------
// Small text/XML helpers (exported for tests)

export const decodeXmlEntities = (s: string): string =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCharCode(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&amp;/g, '&');

export const escapeXml = (s: string): string =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

const tagRegex = (tag: string, flags = 'i'): RegExp =>
  new RegExp(`<(?:[\\w-]+:)?${tag}\\b[^>]*>([\\s\\S]*?)</(?:[\\w-]+:)?${tag}\\s*>`, flags);

/** Text of the first `<tag>` (any namespace prefix), entity-decoded and trimmed; null if absent. */
export const xmlTagText = (xml: string, tag: string): string | null => {
  const m = tagRegex(tag).exec(xml);
  return m ? decodeXmlEntities(m[1].trim()) : null;
};

/** Inner XML of every `<tag>` element (non-nested tags only, e.g. `<service>`). */
export const xmlBlocks = (xml: string, tag: string): string[] =>
  Array.from(xml.matchAll(tagRegex(tag, 'gi')), (m) => m[1]);

export interface SsdpResponse {
  statusLine: string;
  /** Header names are lower-cased. */
  headers: Record<string, string>;
}

/** Parse an SSDP (HTTP-over-UDP) response. Returns null for anything that is not a 200 reply. */
export const parseSsdpResponse = (text: string): SsdpResponse | null => {
  const lines = text.split(/\r?\n/);
  const statusLine = lines[0]?.trim() ?? '';
  if (!/^HTTP\/1\.[01]\s+200\b/i.test(statusLine)) return null;
  const headers: Record<string, string> = {};
  for (const line of lines.slice(1)) {
    const i = line.indexOf(':');
    if (i <= 0) continue;
    headers[line.slice(0, i).trim().toLowerCase()] = line.slice(i + 1).trim();
  }
  return { statusLine, headers };
};

export const buildMSearch = (st: string, mx = 2): string =>
  [
    'M-SEARCH * HTTP/1.1',
    `HOST: ${SSDP_ADDRESS}:${SSDP_PORT}`,
    'MAN: "ssdp:discover"',
    `MX: ${mx}`,
    `ST: ${st}`,
    '',
    '',
  ].join('\r\n');

/** Resolve a (possibly relative) controlURL against URLBase, falling back to the description URL. */
export const resolveControlUrl = (
  controlUrl: string,
  location: string,
  urlBase?: string | null,
): string => {
  const base = urlBase && /^https?:\/\//i.test(urlBase) ? urlBase : location;
  return new URL(controlUrl, base).href;
};

/** Find the WAN connection service in a device description XML. */
export const parseDeviceDescription = (xml: string, location: string): Gateway | null => {
  const services = xmlBlocks(xml, 'service').map((block) => ({
    serviceType: xmlTagText(block, 'serviceType') ?? '',
    controlUrl: xmlTagText(block, 'controlURL') ?? '',
  }));
  const urlBase = xmlTagText(xml, 'URLBase');
  for (const wanted of WAN_SERVICE_TYPES) {
    const svc = services.find((s) => s.serviceType === wanted && s.controlUrl);
    if (svc) {
      return {
        location,
        serviceType: svc.serviceType,
        controlUrl: resolveControlUrl(svc.controlUrl, location, urlBase),
      };
    }
  }
  return null;
};

export const buildSoapEnvelope = (
  action: string,
  serviceType: string,
  args: Record<string, string | number>,
): string => {
  const body = Object.entries(args)
    .map(([k, v]) => `<${k}>${escapeXml(String(v))}</${k}>`)
    .join('');
  return (
    '<?xml version="1.0" encoding="utf-8"?>' +
    '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" ' +
    's:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">' +
    `<s:Body><u:${action} xmlns:u="${escapeXml(serviceType)}">${body}</u:${action}></s:Body>` +
    '</s:Envelope>'
  );
};

const UPNP_ERROR_TEXT: Record<number, string> = {
  401: 'Invalid action',
  402: 'Invalid arguments',
  501: 'Action failed',
  606: 'Action not authorized (UPnP port changes may be locked in the router settings)',
  714: 'No such port mapping',
  715: 'Wildcard not permitted in source IP',
  716: 'Wildcard not permitted in external port',
  718: 'Port is already forwarded to another device (ConflictInMappingEntry)',
  724: 'Internal and external port must be the same',
  725: 'Router only supports permanent port mappings (OnlyPermanentLeasesSupported)',
  726: 'Remote host must be a wildcard',
  727: 'External port must be a wildcard',
  728: 'Router has no free port mapping slots',
  729: 'Conflicts with another port mapping mechanism',
  732: 'Wildcard not permitted in internal port',
};

/** Extract `{ code, description }` from a SOAP fault body; null if the body is not a fault. */
export const parseSoapFault = (
  xml: string,
): { code: number | null; description: string } | null => {
  if (!/<(?:[\w-]+:)?Fault\b/i.test(xml)) return null;
  const codeText = xmlTagText(xml, 'errorCode');
  const code = codeText && /^\d+$/.test(codeText) ? Number(codeText) : null;
  const description =
    xmlTagText(xml, 'errorDescription') ?? xmlTagText(xml, 'faultstring') ?? 'SOAP fault';
  return { code, description };
};

/** Human-readable message for a router fault. */
export const describeFault = (action: string, code: number | null, description: string): string => {
  const known = code !== null ? UPNP_ERROR_TEXT[code] : undefined;
  const detail = known ?? description;
  return `Router rejected ${action}: ${detail}${code !== null ? ` (UPnP error ${code})` : ''}`;
};

// ---------------------------------------------------------------------------------------------
// Addresses

const parseIpv4 = (ip: string): number[] | null => {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  const nums = parts.map((p) => (/^\d{1,3}$/.test(p) ? Number(p) : NaN));
  return nums.every((n) => n >= 0 && n <= 255) ? nums : null;
};

const ipv4ToInt = (ip: string): number | null => {
  const p = parseIpv4(ip);
  return p ? ((p[0] << 24) | (p[1] << 16) | (p[2] << 8) | p[3]) >>> 0 : null;
};

/**
 * True for addresses that are not reachable from the internet: RFC1918, CGNAT (100.64.0.0/10),
 * link-local, loopback, "this network" and IPv6 ULA/link-local/loopback. Invalid input is
 * treated as not public (true).
 */
export const isPrivateOrCgnatIp = (ip: string): boolean => {
  const v4 = parseIpv4(ip.startsWith('::ffff:') ? ip.slice(7) : ip);
  if (v4) {
    const [a, b] = v4;
    return (
      a === 10 ||
      a === 127 ||
      a === 0 ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254)
    );
  }
  const v6 = ip.toLowerCase();
  if (!v6.includes(':')) return true;
  return v6 === '::1' || v6 === '::' || /^f[cd]/.test(v6) || /^fe[89ab]/.test(v6);
};

/** Are two IPv4 addresses in the same subnet for the given netmask? */
export const sameSubnet = (a: string, b: string, netmask: string): boolean => {
  const x = ipv4ToInt(a);
  const y = ipv4ToInt(b);
  const m = ipv4ToInt(netmask);
  if (x === null || y === null || m === null) return false;
  return (x & m) >>> 0 === (y & m) >>> 0;
};

type InterfaceMap = NodeJS.Dict<os.NetworkInterfaceInfo[]>;

/**
 * The local IPv4 address the router should forward to: the interface on the same subnet as the
 * gateway, else the first non-internal IPv4 address, else null.
 */
export const pickLocalAddress = (
  gatewayIp: string,
  interfaces: InterfaceMap = os.networkInterfaces(),
): string | null => {
  const candidates: os.NetworkInterfaceInfo[] = [];
  for (const infos of Object.values(interfaces)) {
    for (const info of infos ?? []) {
      if (info.family === 'IPv4' && !info.internal) candidates.push(info);
    }
  }
  const match = candidates.find((i) => sameSubnet(i.address, gatewayIp, i.netmask));
  if (match) return match.address;
  return candidates.find((i) => !i.address.startsWith('169.254.'))?.address ?? null;
};

// ---------------------------------------------------------------------------------------------
// HTTP

interface HttpResult {
  status: number;
  body: string;
}

const MAX_BODY_BYTES = 1024 * 1024;

const httpRequest = (
  url: string,
  opts: { method?: string; headers?: Record<string, string>; body?: string; timeoutMs?: number },
): Promise<HttpResult> =>
  new Promise((resolve, reject) => {
    const u = new URL(url);
    const lib = u.protocol === 'https:' ? https : http;
    const body = opts.body !== undefined ? Buffer.from(opts.body, 'utf8') : undefined;
    const req = lib.request(
      u,
      {
        method: opts.method ?? 'GET',
        headers: { ...opts.headers, ...(body ? { 'Content-Length': String(body.length) } : {}) },
        timeout: opts.timeoutMs ?? 5000,
      },
      (res) => {
        const chunks: Buffer[] = [];
        let size = 0;
        res.on('data', (c: Buffer) => {
          size += c.length;
          if (size > MAX_BODY_BYTES) req.destroy(new Error(`Response from ${url} is too large`));
          else chunks.push(c);
        });
        res.on('end', () =>
          resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString('utf8') }),
        );
        res.on('error', reject);
      },
    );
    req.on('timeout', () => req.destroy(new Error(`Request to ${url} timed out`)));
    req.on('error', reject);
    req.end(body);
  });

/** Fetch and parse a device description; null if it has no usable WAN service. */
export const fetchGateway = async (location: string, timeoutMs = 5000): Promise<Gateway | null> => {
  const res = await httpRequest(location, { timeoutMs });
  if (res.status !== 200) return null;
  return parseDeviceDescription(res.body, location);
};

/** POST a SOAP action to the gateway. Throws UpnpError on faults. Returns the response XML. */
export const soapRequest = async (
  gw: Gateway,
  action: string,
  args: Record<string, string | number>,
  timeoutMs = 5000,
): Promise<string> => {
  const res = await httpRequest(gw.controlUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/xml; charset="utf-8"',
      SOAPAction: `"${gw.serviceType}#${action}"`,
    },
    body: buildSoapEnvelope(action, gw.serviceType, args),
    timeoutMs,
  });
  const fault = parseSoapFault(res.body);
  if (fault) throw new UpnpError(describeFault(action, fault.code, fault.description), fault.code);
  if (res.status !== 200) throw new UpnpError(`Router answered ${action} with HTTP ${res.status}`);
  return res.body;
};

// ---------------------------------------------------------------------------------------------
// Discovery

/** The subset of dgram.Socket that discovery uses (injectable for tests). */
export interface SsdpSocket {
  on(event: 'message', listener: (msg: Buffer, rinfo: { address: string }) => void): unknown;
  on(event: 'error', listener: (err: Error) => void): unknown;
  send(msg: string, port: number, address: string, cb?: (err: Error | null) => void): void;
  close(): void;
}

export interface DiscoverOptions {
  timeoutMs?: number;
  socketFactory?: () => SsdpSocket;
}

const defaultSocket = (): SsdpSocket => dgram.createSocket({ type: 'udp4', reuseAddr: true });

/**
 * Find the router's WAN connection service via SSDP multicast. Rejects with a readable error if
 * no UPnP router answers within `timeoutMs`.
 */
export const discoverGateway = ({
  timeoutMs = 2500,
  socketFactory = defaultSocket,
}: DiscoverOptions = {}): Promise<Gateway> =>
  new Promise((resolve, reject) => {
    const socket = socketFactory();
    const seen = new Set<string>();
    let pending = 0;
    let timedOut = false;
    let done = false;
    let lastError: string | null = null;

    const finish = (err: Error | null, gw?: Gateway): void => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try {
        socket.close();
      } catch {
        /* already closed */
      }
      if (gw) resolve(gw);
      else reject(err ?? new Error('No UPnP router found'));
    };
    const failIfIdle = (): void => {
      if (!timedOut || pending > 0) return;
      finish(
        new Error(
          seen.size === 0
            ? 'No UPnP router answered (UPnP may be turned off in the router settings)'
            : `A UPnP device answered but it cannot open ports${lastError ? ` (${lastError})` : ''}`,
        ),
      );
    };
    const timer = setTimeout(() => {
      timedOut = true;
      failIfIdle();
    }, timeoutMs);

    socket.on('error', (err) => finish(new Error(`UPnP discovery failed: ${err.message}`)));
    socket.on('message', (msg) => {
      const res = parseSsdpResponse(msg.toString('utf8'));
      const location = res?.headers.location;
      if (!location || seen.has(location) || done) return;
      seen.add(location);
      pending++;
      fetchGateway(location, Math.max(1000, timeoutMs))
        .then((gw) => {
          if (gw) finish(null, gw);
          else lastError = 'no WAN connection service in its description';
        })
        .catch((err: Error) => {
          lastError = err.message;
        })
        .finally(() => {
          pending--;
          failIfIdle();
        });
    });

    for (const st of SSDP_SEARCH_TARGETS) {
      socket.send(buildMSearch(st), SSDP_PORT, SSDP_ADDRESS, (err) => {
        if (err) lastError = err.message;
      });
    }
  });

// ---------------------------------------------------------------------------------------------
// Actions

export interface PortMappingOptions {
  externalPort: number;
  internalPort: number;
  internalClient: string;
  protocol?: PortProtocol;
  description?: string;
  leaseSeconds?: number;
}

/**
 * Ask the router to forward `externalPort` to `internalClient:internalPort`. If the router only
 * supports permanent leases (725) it retries with lease 0. Resolves with the lease actually used.
 */
export const addPortMapping = async (
  gw: Gateway,
  {
    externalPort,
    internalPort,
    internalClient,
    protocol = 'TCP',
    description = 'Lethal Recoil',
    leaseSeconds = 3600,
  }: PortMappingOptions,
): Promise<{ leaseSeconds: number }> => {
  const send = (lease: number): Promise<string> =>
    soapRequest(gw, 'AddPortMapping', {
      NewRemoteHost: '',
      NewExternalPort: externalPort,
      NewProtocol: protocol,
      NewInternalPort: internalPort,
      NewInternalClient: internalClient,
      NewEnabled: 1,
      NewPortMappingDescription: description,
      NewLeaseDuration: lease,
    });
  try {
    await send(leaseSeconds);
    return { leaseSeconds };
  } catch (err) {
    if (err instanceof UpnpError && err.code === 725 && leaseSeconds !== 0) {
      await send(0);
      return { leaseSeconds: 0 };
    }
    throw err;
  }
};

export const deletePortMapping = async (
  gw: Gateway,
  externalPort: number,
  protocol: PortProtocol = 'TCP',
): Promise<void> => {
  await soapRequest(gw, 'DeletePortMapping', {
    NewRemoteHost: '',
    NewExternalPort: externalPort,
    NewProtocol: protocol,
  });
};

export const getExternalIp = async (gw: Gateway): Promise<string> => {
  const xml = await soapRequest(gw, 'GetExternalIPAddress', {});
  const ip = xmlTagText(xml, 'NewExternalIPAddress');
  if (!ip) throw new UpnpError('Router did not report its external IP address');
  return ip;
};

// ---------------------------------------------------------------------------------------------
// Mapping handle with automatic renewal

export interface PortMappingHandle {
  readonly gateway: Gateway;
  readonly externalPort: number;
  readonly internalClient: string;
  /** Lease the router accepted (0 = permanent until removed). */
  readonly leaseSeconds: number;
  /** Re-add the mapping (refreshes the lease). */
  renew(): Promise<void>;
  /** Stop renewing and delete the mapping (never throws). */
  remove(): Promise<void>;
}

export interface MapPortOptions extends PortMappingOptions {
  /** How often to re-add the mapping; default 30 minutes. */
  renewEveryMs?: number;
  log?: (msg: string) => void;
}

/** Add a port mapping and keep it alive until `remove()` is called. */
export const mapPort = async (gw: Gateway, opts: MapPortOptions): Promise<PortMappingHandle> => {
  const log = opts.log ?? (() => {});
  const protocol = opts.protocol ?? 'TCP';
  const first = await addPortMapping(gw, opts);
  let lease = first.leaseSeconds;
  let removed = false;

  const renew = async (): Promise<void> => {
    if (removed) return;
    const r = await addPortMapping(gw, { ...opts, leaseSeconds: lease });
    lease = r.leaseSeconds;
  };
  const timer = setInterval(
    () => {
      renew().catch((err: Error) => log(`UPnP: could not renew port mapping: ${err.message}`));
    },
    opts.renewEveryMs ?? 30 * 60 * 1000,
  );
  timer.unref();

  return {
    gateway: gw,
    externalPort: opts.externalPort,
    internalClient: opts.internalClient,
    get leaseSeconds() {
      return lease;
    },
    renew,
    remove: async () => {
      if (removed) return;
      removed = true;
      clearInterval(timer);
      try {
        await deletePortMapping(gw, opts.externalPort, protocol);
      } catch (err) {
        log(`UPnP: could not remove port mapping: ${(err as Error).message}`);
      }
    },
  };
};
