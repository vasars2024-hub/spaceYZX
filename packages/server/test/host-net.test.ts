import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import type { ChildProcess } from 'node:child_process';
import type { AddressInfo } from 'node:net';
import {
  addPortMapping,
  deletePortMapping,
  discoverGateway,
  getExternalIp,
  isPrivateOrCgnatIp,
  mapPort,
  parseDeviceDescription,
  parseSoapFault,
  parseSsdpResponse,
  pickLocalAddress,
  resolveControlUrl,
  UpnpError,
  type Gateway,
  type SsdpSocket,
} from '../src/host/upnp';
import {
  ensureCloudflared,
  parseTunnelUrl,
  quickTunnelArgs,
  sha256File,
  startQuickTunnel,
  verifyFileSha256,
  type QuickTunnel,
} from '../src/host/tunnel';
import { setupConnectivity, type ConnectivityDeps } from '../src/host/connectivity';

// ---------------------------------------------------------------------------------------------
// Fixtures

const igdXml = (urlBase = ''): string => `<?xml version="1.0"?>
<root xmlns="urn:schemas-upnp-org:device-1-0">
  <specVersion><major>1</major><minor>0</minor></specVersion>
  ${urlBase ? `<URLBase>${urlBase}</URLBase>` : ''}
  <device>
    <deviceType>urn:schemas-upnp-org:device:InternetGatewayDevice:1</deviceType>
    <friendlyName>Home Router</friendlyName>
    <serviceList>
      <service>
        <serviceType>urn:schemas-upnp-org:service:Layer3Forwarding:1</serviceType>
        <serviceId>urn:upnp-org:serviceId:L3Forwarding1</serviceId>
        <controlURL>/upnp/control/L3F</controlURL>
        <eventSubURL>/upnp/event/L3F</eventSubURL>
        <SCPDURL>/L3F.xml</SCPDURL>
      </service>
    </serviceList>
    <deviceList>
      <device>
        <deviceType>urn:schemas-upnp-org:device:WANDevice:1</deviceType>
        <serviceList>
          <service>
            <serviceType>urn:schemas-upnp-org:service:WANCommonInterfaceConfig:1</serviceType>
            <serviceId>urn:upnp-org:serviceId:WANCommonIFC1</serviceId>
            <controlURL>/upnp/control/WANCommonIFC1</controlURL>
            <eventSubURL>/upnp/event/WANCommonIFC1</eventSubURL>
            <SCPDURL>/WANCIFC.xml</SCPDURL>
          </service>
        </serviceList>
        <deviceList>
          <device>
            <deviceType>urn:schemas-upnp-org:device:WANConnectionDevice:1</deviceType>
            <serviceList>
              <service>
                <serviceType>urn:schemas-upnp-org:service:WANIPConnection:1</serviceType>
                <serviceId>urn:upnp-org:serviceId:WANIPConn1</serviceId>
                <controlURL>/upnp/control/WANIPConn1</controlURL>
                <eventSubURL>/upnp/event/WANIPConn1</eventSubURL>
                <SCPDURL>/WANIPCn.xml</SCPDURL>
              </service>
            </serviceList>
          </device>
        </deviceList>
      </device>
    </deviceList>
  </device>
</root>`;

const ssdpReply = (location: string): string =>
  [
    'HTTP/1.1 200 OK',
    'CACHE-CONTROL: max-age=120',
    'ST: urn:schemas-upnp-org:device:InternetGatewayDevice:1',
    'USN: uuid:12345678-1234-1234-1234-123456789abc::urn:schemas-upnp-org:device:InternetGatewayDevice:1',
    'EXT:',
    'SERVER: Linux/3.14 UPnP/1.0 MiniUPnPd/2.1',
    `LOCATION: ${location}`,
    '',
    '',
  ].join('\r\n');

// ---------------------------------------------------------------------------------------------
// A fake Internet Gateway Device on 127.0.0.1

interface FakeIgd {
  base: string;
  mappings: Map<string, { client: string; lease: number }>;
  actions: string[];
  soapActions: string[];
  externalIp: string;
  permanentOnly: boolean;
}

const fake: FakeIgd = {
  base: '',
  mappings: new Map(),
  actions: [],
  soapActions: [],
  externalIp: '203.0.113.7',
  permanentOnly: false,
};
let server: http.Server;

const arg = (body: string, name: string): string =>
  new RegExp(`<${name}>([^<]*)</${name}>`).exec(body)?.[1] ?? '';

const soapOk = (action: string, inner = ''): string =>
  `<?xml version="1.0"?><s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body>` +
  `<u:${action}Response xmlns:u="urn:schemas-upnp-org:service:WANIPConnection:1">${inner}` +
  `</u:${action}Response></s:Body></s:Envelope>`;

const soapFault = (code: number, desc: string): string =>
  `<?xml version="1.0"?><s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" ` +
  `s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/"><s:Body><s:Fault>` +
  `<faultcode>s:Client</faultcode><faultstring>UPnPError</faultstring><detail>` +
  `<UPnPError xmlns="urn:schemas-upnp-org:control-1-0"><errorCode>${code}</errorCode>` +
  `<errorDescription>${desc}</errorDescription></UPnPError></detail></s:Fault></s:Body></s:Envelope>`;

beforeAll(async () => {
  server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c: Buffer) => (body += c.toString('utf8')));
    req.on('end', () => {
      if (req.method === 'GET' && req.url === '/rootDesc.xml') {
        res.writeHead(200, { 'Content-Type': 'text/xml' }).end(igdXml());
        return;
      }
      if (req.method !== 'POST' || req.url !== '/upnp/control/WANIPConn1') {
        res.writeHead(404).end();
        return;
      }
      const soapAction = String(req.headers.soapaction ?? '');
      fake.soapActions.push(soapAction);
      const action = /#(\w+)"$/.exec(soapAction)?.[1] ?? '';
      fake.actions.push(action);
      const send = (status: number, xml: string): void => {
        res.writeHead(status, { 'Content-Type': 'text/xml; charset="utf-8"' }).end(xml);
      };
      if (action === 'GetExternalIPAddress') {
        send(
          200,
          soapOk(action, `<NewExternalIPAddress>${fake.externalIp}</NewExternalIPAddress>`),
        );
      } else if (action === 'AddPortMapping') {
        const key = `${arg(body, 'NewExternalPort')}/${arg(body, 'NewProtocol')}`;
        const client = arg(body, 'NewInternalClient');
        const lease = Number(arg(body, 'NewLeaseDuration'));
        const existing = fake.mappings.get(key);
        if (existing && existing.client !== client) {
          send(500, soapFault(718, 'ConflictInMappingEntry'));
        } else if (fake.permanentOnly && lease !== 0) {
          send(500, soapFault(725, 'OnlyPermanentLeasesSupported'));
        } else {
          fake.mappings.set(key, { client, lease });
          send(200, soapOk(action));
        }
      } else if (action === 'DeletePortMapping') {
        const key = `${arg(body, 'NewExternalPort')}/${arg(body, 'NewProtocol')}`;
        if (fake.mappings.delete(key)) send(200, soapOk(action));
        else send(500, soapFault(714, 'NoSuchEntryInArray'));
      } else {
        send(500, soapFault(401, 'Invalid Action'));
      }
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  fake.base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => new Promise<void>((r) => server.close(() => r())));

/** SSDP socket that answers every M-SEARCH with the given replies (no real network). */
const fakeSocketFactory =
  (replies: string[], sent: string[] = []) =>
  (): SsdpSocket => {
    const ee = new EventEmitter();
    const socket: SsdpSocket = {
      on: (event: string, listener: (...args: never[]) => void) =>
        ee.on(event, listener as (...args: unknown[]) => void),
      send: (msg, _port, _address, cb) => {
        sent.push(msg);
        cb?.(null);
        setImmediate(() => {
          for (const r of replies) ee.emit('message', Buffer.from(r), { address: '127.0.0.1' });
        });
      },
      close: () => ee.removeAllListeners(),
    };
    return socket;
  };

// ---------------------------------------------------------------------------------------------

describe('SSDP and device description parsing', () => {
  it('parses an SSDP response', () => {
    const res = parseSsdpResponse(ssdpReply('http://192.168.1.1:5000/rootDesc.xml'));
    expect(res?.headers.location).toBe('http://192.168.1.1:5000/rootDesc.xml');
    expect(res?.headers.st).toBe('urn:schemas-upnp-org:device:InternetGatewayDevice:1');
    expect(parseSsdpResponse('M-SEARCH * HTTP/1.1\r\nST: x\r\n\r\n')).toBeNull();
    expect(parseSsdpResponse('HTTP/1.1 404 Not Found\r\n\r\n')).toBeNull();
  });

  it('finds WANIPConnection:1 inside nested deviceLists', () => {
    const gw = parseDeviceDescription(igdXml(), 'http://192.168.1.1:5000/rootDesc.xml');
    expect(gw).toEqual({
      location: 'http://192.168.1.1:5000/rootDesc.xml',
      serviceType: 'urn:schemas-upnp-org:service:WANIPConnection:1',
      controlUrl: 'http://192.168.1.1:5000/upnp/control/WANIPConn1',
    });
  });

  it('prefers URLBase and falls back to WANPPPConnection', () => {
    const gw = parseDeviceDescription(
      igdXml('http://192.168.0.1:49152/'),
      'http://192.168.0.1:1900/desc.xml',
    );
    expect(gw?.controlUrl).toBe('http://192.168.0.1:49152/upnp/control/WANIPConn1');

    const ppp = igdXml().replace('WANIPConnection:1', 'WANPPPConnection:1');
    expect(parseDeviceDescription(ppp, 'http://10.0.0.1/d.xml')?.serviceType).toBe(
      'urn:schemas-upnp-org:service:WANPPPConnection:1',
    );
    const none = igdXml().replace('WANIPConnection:1', 'Something:1');
    expect(parseDeviceDescription(none, 'http://10.0.0.1/d.xml')).toBeNull();
  });

  it('resolves control URLs', () => {
    const loc = 'http://192.168.1.1:5000/desc/root.xml';
    expect(resolveControlUrl('/ctl/IPConn', loc)).toBe('http://192.168.1.1:5000/ctl/IPConn');
    expect(resolveControlUrl('ctl/IPConn', loc)).toBe('http://192.168.1.1:5000/desc/ctl/IPConn');
    expect(resolveControlUrl('http://192.168.1.1:80/x', loc)).toBe('http://192.168.1.1/x');
    expect(resolveControlUrl('/x', loc, 'http://192.168.1.1:49000')).toBe(
      'http://192.168.1.1:49000/x',
    );
    expect(resolveControlUrl('/x', loc, '')).toBe('http://192.168.1.1:5000/x');
  });

  it('parses SOAP faults', () => {
    expect(parseSoapFault(soapFault(718, 'ConflictInMappingEntry'))).toEqual({
      code: 718,
      description: 'ConflictInMappingEntry',
    });
    expect(parseSoapFault(soapOk('AddPortMapping'))).toBeNull();
  });
});

describe('UPnP against a fake router', () => {
  it('discovers the gateway via (fake) SSDP', async () => {
    const sent: string[] = [];
    const gw = await discoverGateway({
      timeoutMs: 1000,
      socketFactory: fakeSocketFactory(
        ['garbage', ssdpReply(`${fake.base}/missing.xml`), ssdpReply(`${fake.base}/rootDesc.xml`)],
        sent,
      ),
    });
    expect(gw.controlUrl).toBe(`${fake.base}/upnp/control/WANIPConn1`);
    expect(sent[0]).toMatch(/^M-SEARCH \* HTTP\/1\.1\r\n/);
    expect(sent.some((m) => m.includes('ST: urn:schemas-upnp-org:service:WANIPConnection:1'))).toBe(
      true,
    );
  });

  it('reports when no router answers', async () => {
    await expect(
      discoverGateway({ timeoutMs: 50, socketFactory: fakeSocketFactory([]) }),
    ).rejects.toThrow(/No UPnP router/);
  });

  const gw = (): Gateway => ({
    location: `${fake.base}/rootDesc.xml`,
    controlUrl: `${fake.base}/upnp/control/WANIPConn1`,
    serviceType: 'urn:schemas-upnp-org:service:WANIPConnection:1',
  });

  it('adds, reads and deletes a port mapping', async () => {
    fake.mappings.clear();
    expect(await getExternalIp(gw())).toBe('203.0.113.7');
    const r = await addPortMapping(gw(), {
      externalPort: 7777,
      internalPort: 7777,
      internalClient: '192.168.1.20',
    });
    expect(r.leaseSeconds).toBe(3600);
    expect(fake.mappings.get('7777/TCP')).toEqual({ client: '192.168.1.20', lease: 3600 });
    expect(fake.soapActions).toContain(
      '"urn:schemas-upnp-org:service:WANIPConnection:1#AddPortMapping"',
    );
    await deletePortMapping(gw(), 7777, 'TCP');
    expect(fake.mappings.size).toBe(0);
  });

  it('turns a 718 fault into a readable UpnpError', async () => {
    fake.mappings.clear();
    fake.mappings.set('7777/TCP', { client: '192.168.1.99', lease: 0 });
    const err = await addPortMapping(gw(), {
      externalPort: 7777,
      internalPort: 7777,
      internalClient: '192.168.1.20',
    }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(UpnpError);
    expect((err as UpnpError).code).toBe(718);
    expect((err as UpnpError).message).toMatch(/already forwarded to another device/);
    fake.mappings.clear();
  });

  it('retries with a permanent lease on 725', async () => {
    fake.permanentOnly = true;
    try {
      const r = await addPortMapping(gw(), {
        externalPort: 7778,
        internalPort: 7778,
        internalClient: '192.168.1.20',
      });
      expect(r.leaseSeconds).toBe(0);
      expect(fake.mappings.get('7778/TCP')?.lease).toBe(0);
    } finally {
      fake.permanentOnly = false;
      fake.mappings.clear();
    }
  });

  it('mapPort renews and removes', async () => {
    const handle = await mapPort(gw(), {
      externalPort: 7779,
      internalPort: 7779,
      internalClient: '192.168.1.20',
      leaseSeconds: 600,
    });
    expect(handle.leaseSeconds).toBe(600);
    fake.mappings.delete('7779/TCP');
    await handle.renew();
    expect(fake.mappings.has('7779/TCP')).toBe(true);
    await handle.remove();
    expect(fake.mappings.has('7779/TCP')).toBe(false);
    await handle.remove(); // idempotent, never throws
  });
});

describe('addresses', () => {
  it.each([
    ['10.1.2.3', true],
    ['172.16.0.1', true],
    ['172.31.255.255', true],
    ['172.32.0.1', false],
    ['192.168.1.1', true],
    ['100.64.0.1', true],
    ['100.127.255.254', true],
    ['100.128.0.1', false],
    ['169.254.10.10', true],
    ['127.0.0.1', true],
    ['0.0.0.0', true],
    ['8.8.8.8', false],
    ['203.0.113.7', false],
    ['::1', true],
    ['fe80::1', true],
    ['fd12:3456::1', true],
    ['2001:db8::1', false],
    ['not an ip', true],
  ])('isPrivateOrCgnatIp(%s) = %s', (ip, expected) => {
    expect(isPrivateOrCgnatIp(ip)).toBe(expected);
  });

  it('picks the local address on the gateway subnet', () => {
    const nic = (address: string, netmask: string, internal = false): os.NetworkInterfaceInfo => ({
      address,
      netmask,
      family: 'IPv4',
      mac: '00:00:00:00:00:00',
      internal,
      cidr: null,
    });
    const ifaces = {
      lo: [nic('127.0.0.1', '255.0.0.0', true)],
      vpn: [nic('10.8.0.2', '255.255.255.0')],
      wifi: [nic('192.168.1.20', '255.255.255.0')],
    };
    expect(pickLocalAddress('192.168.1.1', ifaces)).toBe('192.168.1.20');
    expect(pickLocalAddress('172.20.0.1', ifaces)).toBe('10.8.0.2');
    expect(pickLocalAddress('192.168.1.1', { lo: ifaces.lo })).toBeNull();
  });
});

describe('cloudflared', () => {
  it('parses the quick tunnel URL from real log lines', () => {
    const lines = [
      '2026-09-24T12:00:00Z INF Requesting new quick Tunnel on trycloudflare.com...',
      '2026-09-24T12:00:01Z INF +--------------------------------------------------------------------------------------------+',
      '2026-09-24T12:00:01Z INF |  Your quick Tunnel has been created! Visit it at (it may take some time to be reachable):  |',
      '2026-09-24T12:00:01Z INF |  https://seasonal-deck-organisms-sf.trycloudflare.com                                      |',
      '2026-09-24T12:00:01Z ERR failed to request quick Tunnel: Post "https://api.trycloudflare.com/tunnel": dial tcp',
    ];
    expect(lines.map(parseTunnelUrl)).toEqual([
      null,
      null,
      null,
      'https://seasonal-deck-organisms-sf.trycloudflare.com',
      null,
    ]);
    expect(quickTunnelArgs(7777)).toEqual([
      'tunnel',
      '--url',
      'http://127.0.0.1:7777',
      '--no-autoupdate',
    ]);
  });

  it('verifies checksums and downloads via a temp file', async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'syz-cf-'));
    try {
      const payload = Buffer.from('pretend this is cloudflared');
      const good = createHash('sha256').update(payload).digest('hex');
      const file = path.join(dir, 'x.bin');
      writeFileSync(file, payload);
      expect(await sha256File(file)).toBe(good);
      expect(await verifyFileSha256(file, good)).toBe(true);
      expect(await verifyFileSha256(file, '0'.repeat(64))).toBe(false);

      let fetches = 0;
      const fetchImpl = async (url: string): Promise<Response> => {
        fetches++;
        expect(url).toMatch(
          /^https:\/\/github\.com\/cloudflare\/cloudflared\/releases\/download\//,
        );
        return new Response(payload);
      };
      const opts = { fetchImpl, platform: 'linux', asset: { asset: 'cf', sha256: good } };
      const bin = await ensureCloudflared(dir, opts);
      expect(await verifyFileSha256(bin, good)).toBe(true);
      expect(await ensureCloudflared(dir, opts)).toBe(bin);
      expect(fetches).toBe(1); // reused the verified file

      const badDir = path.join(dir, 'bad');
      await expect(
        ensureCloudflared(badDir, { ...opts, asset: { asset: 'cf', sha256: 'a'.repeat(64) } }),
      ).rejects.toThrow(/checksum/);
      expect(readdirSync(path.join(badDir, 'bin'))).toEqual([]); // temp file deleted

      await expect(
        ensureCloudflared(dir, { ...opts, asset: { asset: 'cf', sha256: 'TODO' } }),
      ).rejects.toThrow(/refusing/);
      await expect(ensureCloudflared(dir, { ...opts, asset: null })).rejects.toThrow(
        /not supported/,
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('startQuickTunnel resolves the URL and stops the process', async () => {
    const child = Object.assign(new EventEmitter(), {
      stdout: new PassThrough(),
      stderr: new PassThrough(),
      exitCode: null as number | null,
      signalCode: null as string | null,
      pid: 1234,
      killed: false,
      kill() {
        this.killed = true;
        this.signalCode = 'SIGTERM';
        return true;
      },
    });
    let spawned: string[] = [];
    const t = startQuickTunnel('/bin/cloudflared', 7777, {
      platform: 'linux',
      spawnImpl: (_cmd, args) => {
        spawned = args;
        return child as unknown as ChildProcess;
      },
    });
    child.stderr.write('2026-09-24T12:00:00Z INF Requesting new quick Tunnel...\n');
    child.stderr.write('2026-09-24T12:00:01Z INF |  https://brave-lime-cat.trycloudflare.com  |\n');
    await expect(t.url).resolves.toBe('https://brave-lime-cat.trycloudflare.com');
    expect(spawned).toContain('http://127.0.0.1:7777');
    t.stop();
    expect(child.killed).toBe(true);
  });

  it('startQuickTunnel rejects if cloudflared exits early', async () => {
    const child = Object.assign(new EventEmitter(), {
      stdout: new PassThrough(),
      stderr: new PassThrough(),
      exitCode: null,
      signalCode: null,
      kill: () => true,
    });
    const t = startQuickTunnel('/bin/cloudflared', 7777, {
      spawnImpl: () => child as unknown as ChildProcess,
    });
    child.stderr.write('ERR failed to request quick Tunnel\n');
    setImmediate(() => child.emit('exit', 1, null));
    await expect(t.url).rejects.toThrow(/exited before the tunnel was ready/);
  });
});

describe('setupConnectivity', () => {
  const gateway: Gateway = {
    location: 'http://192.168.1.1:5000/rootDesc.xml',
    controlUrl: 'http://192.168.1.1:5000/ctl',
    serviceType: 'urn:schemas-upnp-org:service:WANIPConnection:1',
  };

  const makeDeps = (over: Partial<ConnectivityDeps> = {}) => {
    const calls: string[] = [];
    const deps: ConnectivityDeps = {
      lanAddresses: () => ['192.168.1.20'],
      discoverGateway: async () => gateway,
      localAddressFor: () => '192.168.1.20',
      getExternalIp: async () => '203.0.113.7',
      mapPort: async (_gw, opts) => {
        calls.push(`map ${opts.externalPort}->${opts.internalClient}`);
        return {
          gateway,
          externalPort: opts.externalPort,
          internalClient: opts.internalClient,
          leaseSeconds: 3600,
          renew: async () => {},
          remove: async () => {
            calls.push('unmap');
          },
        };
      },
      ensureCloudflared: async () => {
        calls.push('ensure');
        return '/data/bin/cloudflared';
      },
      startQuickTunnel: (): QuickTunnel => {
        calls.push('tunnel');
        return {
          url: Promise.resolve('https://brave-lime-cat.trycloudflare.com'),
          stop: () => calls.push('stop'),
        };
      },
      ...over,
    };
    return { deps, calls };
  };

  it('uses UPnP when the router cooperates', async () => {
    const { deps, calls } = makeDeps();
    const s = await setupConnectivity({ port: 7777, dataDir: '/data', deps });
    expect(s.method).toBe('upnp');
    expect(s.publicUrl).toBe('http://203.0.113.7:7777');
    expect(s.lanUrls).toEqual(['http://192.168.1.20:7777']);
    expect(s.reason).toMatch(/router opened port 7777 automatically/);
    await s.cleanup();
    expect(calls).toEqual(['map 7777->192.168.1.20', 'unmap']);
  });

  it('falls back to a tunnel when UPnP fails', async () => {
    const { deps, calls } = makeDeps({
      discoverGateway: async () => {
        throw new Error('No UPnP router answered');
      },
    });
    const s = await setupConnectivity({ port: 7777, dataDir: '/data', deps });
    expect(s.method).toBe('tunnel');
    expect(s.publicUrl).toBe('https://brave-lime-cat.trycloudflare.com');
    expect(s.reason).toBe(
      "Your router doesn't support automatic port opening, so a Cloudflare tunnel is used; ping may be a little higher.",
    );
    await s.cleanup();
    expect(calls).toEqual(['ensure', 'tunnel', 'stop']);
  });

  it('explains a port conflict', async () => {
    const { deps } = makeDeps({
      mapPort: async () => {
        throw new UpnpError('conflict', 718);
      },
    });
    const s = await setupConnectivity({ port: 7777, dataDir: '/data', deps });
    expect(s.method).toBe('tunnel');
    expect(s.reason).toMatch(/^Port 7777 is already forwarded to another device/);
  });

  it('stays LAN-only when the tunnel is disabled', async () => {
    const { deps, calls } = makeDeps({
      discoverGateway: async () => {
        throw new Error('No UPnP router answered');
      },
    });
    const s = await setupConnectivity({ port: 7777, dataDir: '/data', deps, allowTunnel: false });
    expect(s.method).toBe('lan-only');
    expect(s.publicUrl).toBeNull();
    expect(s.lanUrls).toEqual(['http://192.168.1.20:7777']);
    expect(s.reason).toMatch(/only players on your network can join/);
    expect(calls).toEqual([]);
    await s.cleanup();
  });

  it('treats a CGNAT external address as UPnP failure and uses the tunnel', async () => {
    const { deps, calls } = makeDeps({ getExternalIp: async () => '100.72.1.5' });
    const s = await setupConnectivity({ port: 7777, dataDir: '/data', deps });
    expect(s.method).toBe('tunnel');
    expect(s.reason).toMatch(/CGNAT/);
    expect(s.reason).toMatch(/Cloudflare tunnel is used/);
    expect(calls).not.toContain('map 7777->192.168.1.20');
  });

  it('is LAN-only when the tunnel also fails', async () => {
    const { deps } = makeDeps({
      discoverGateway: async () => {
        throw new Error('No UPnP router answered');
      },
      ensureCloudflared: async () => {
        throw new Error('Downloading cloudflared failed: HTTP 404');
      },
    });
    const s = await setupConnectivity({ port: 7777, dataDir: '/data', deps });
    expect(s.method).toBe('lan-only');
    expect(s.reason).toMatch(/tunnel could not start \(Downloading cloudflared failed: HTTP 404\)/);
  });
});
