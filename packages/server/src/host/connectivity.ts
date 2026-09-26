// Decides how friends reach this host: LAN, then UPnP port forwarding, then a Cloudflare quick
// tunnel. Every external effect goes through `deps` so the whole flow is testable.
import { lanAddresses } from '../net-info';
import {
  discoverGateway,
  getExternalIp,
  isPrivateOrCgnatIp,
  mapPort,
  pickLocalAddress,
  UpnpError,
  type Gateway,
  type MapPortOptions,
  type PortMappingHandle,
} from './upnp';
import { ensureCloudflared, startQuickTunnel, type QuickTunnel } from './tunnel';

export type ConnectivityMethod = 'upnp' | 'tunnel' | 'lan-only';

export interface ConnectivityStatus {
  /** Links for players on the same network, e.g. http://192.168.1.20:7777 */
  lanUrls: string[];
  /** Invite link for players on the internet, or null if there is none. */
  publicUrl: string | null;
  method: ConnectivityMethod;
  /** Plain-language explanation for the dashboard. */
  reason: string;
  /** Undo everything (remove the port mapping / stop the tunnel). Never throws. */
  cleanup(): Promise<void>;
}

export interface ConnectivityDeps {
  lanAddresses(): string[];
  discoverGateway(): Promise<Gateway>;
  /** Local IPv4 address on the gateway's network, or null. */
  localAddressFor(gw: Gateway): string | null;
  getExternalIp(gw: Gateway): Promise<string>;
  mapPort(gw: Gateway, opts: MapPortOptions): Promise<PortMappingHandle>;
  ensureCloudflared(dataDir: string, log: (msg: string) => void): Promise<string>;
  startQuickTunnel(binPath: string, port: number, log: (msg: string) => void): QuickTunnel;
}

export const defaultConnectivityDeps: ConnectivityDeps = {
  lanAddresses,
  discoverGateway: () => discoverGateway(),
  localAddressFor: (gw) => pickLocalAddress(new URL(gw.location).hostname),
  getExternalIp,
  mapPort,
  ensureCloudflared: (dataDir, log) => ensureCloudflared(dataDir, { log }),
  startQuickTunnel: (bin, port, log) => startQuickTunnel(bin, port, { log }),
};

export interface SetupConnectivityOptions {
  port: number;
  dataDir: string;
  log?: (msg: string) => void;
  allowTunnel?: boolean;
  deps?: Partial<ConnectivityDeps>;
}

/** A reason phrase (no trailing period) explaining why UPnP did not work. */
export const describeUpnpFailure = (err: unknown, port: number): string => {
  if (err instanceof UpnpError) {
    if (err.code === 718)
      return `Port ${port} is already forwarded to another device on your network`;
    if (err.code === 606) return 'Your router blocks automatic port opening';
    if (err.code === 728) return 'Your router has no free slots for automatic port opening';
    return `Your router refused to open port ${port} automatically`;
  }
  const msg = err instanceof Error ? err.message : String(err);
  if (/No UPnP router|cannot open ports|discovery failed/i.test(msg)) {
    return "Your router doesn't support automatic port opening";
  }
  return `Automatic port opening didn't work (${msg})`;
};

const CGNAT_REASON =
  'Your internet provider shares one public address between several homes (CGNAT or a second ' +
  'router), so opening a port on your router would not help';

export const setupConnectivity = async (
  opts: SetupConnectivityOptions,
): Promise<ConnectivityStatus> => {
  const { port, dataDir, allowTunnel = true } = opts;
  const log = opts.log ?? (() => {});
  const deps: ConnectivityDeps = { ...defaultConnectivityDeps, ...opts.deps };

  let lanIps: string[] = [];
  try {
    lanIps = deps.lanAddresses();
  } catch (err) {
    log(`Could not list network addresses: ${(err as Error).message}`);
  }
  const lanUrls = lanIps.map((ip) => `http://${ip}:${port}`);
  const noop = async (): Promise<void> => {};

  // 1) UPnP: ask the router to forward the port.
  let upnpReason: string;
  try {
    const gw = await deps.discoverGateway();
    const externalIp = await deps.getExternalIp(gw);
    if (isPrivateOrCgnatIp(externalIp)) {
      upnpReason = CGNAT_REASON;
      log(`UPnP: router's external address ${externalIp} is not public (double NAT / CGNAT)`);
    } else {
      const internalClient = deps.localAddressFor(gw) ?? lanIps[0];
      if (!internalClient) throw new Error('No local network address found');
      const mapping = await deps.mapPort(gw, {
        externalPort: port,
        internalPort: port,
        internalClient,
        protocol: 'TCP',
        description: 'Lethal Recoil',
        leaseSeconds: 3600,
        log,
      });
      log(`UPnP: forwarded port ${port} to ${internalClient}; public address ${externalIp}`);
      return {
        lanUrls,
        publicUrl: `http://${externalIp}:${port}`,
        method: 'upnp',
        reason: `Your router opened port ${port} automatically, so friends connect directly (best ping).`,
        cleanup: () => mapping.remove(),
      };
    }
  } catch (err) {
    upnpReason = describeUpnpFailure(err, port);
    log(`UPnP: ${err instanceof Error ? err.message : String(err)}`);
  }

  // 2) Cloudflare quick tunnel.
  if (!allowTunnel) {
    return {
      lanUrls,
      publicUrl: null,
      method: 'lan-only',
      reason: `${upnpReason}, and the Cloudflare tunnel is turned off, so only players on your network can join.`,
      cleanup: noop,
    };
  }
  let tunnel: QuickTunnel | null = null;
  try {
    const bin = await deps.ensureCloudflared(dataDir, log);
    tunnel = deps.startQuickTunnel(bin, port, log);
    const publicUrl = await tunnel.url;
    const t = tunnel;
    log(`Cloudflare tunnel ready: ${publicUrl}`);
    return {
      lanUrls,
      publicUrl,
      method: 'tunnel',
      reason: `${upnpReason}, so a Cloudflare tunnel is used; ping may be a little higher.`,
      cleanup: async () => t.stop(),
    };
  } catch (err) {
    tunnel?.stop();
    const msg = err instanceof Error ? err.message.split('\n')[0] : String(err);
    log(`Cloudflare tunnel failed: ${msg}`);
    return {
      lanUrls,
      publicUrl: null,
      method: 'lan-only',
      reason: `${upnpReason}, and the Cloudflare tunnel could not start (${msg}), so only players on your network can join.`,
      cleanup: noop,
    };
  }
};
