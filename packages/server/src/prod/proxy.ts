// Which address does a player really connect from? Behind a reverse proxy (Caddy on the rented
// server) every connection arrives from the proxy, so the per-IP limits and IP bans would treat
// all players as one person. The proxy writes the real address into X-Forwarded-For; we believe
// that header ONLY when the connection itself comes from a proxy we trust. Anybody else could
// put anything in it.
import net from 'node:net';
import type http from 'node:http';
import { isLoopback } from '../app';

/** "::ffff:1.2.3.4" (IPv4 written as IPv6) -> "1.2.3.4" */
export const normalizeIp = (ip: string): string => {
  const m = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
  return m ? m[1] : ip;
};

/**
 * Build a check from TRUST_PROXY entries: "loopback", single IPs ("10.0.0.2", "::1") or CIDR
 * ranges ("172.29.77.0/24"). Throws on anything else so a typo can't silently trust everyone.
 */
export const makeProxyTrust = (entries: string[]): ((ip: string) => boolean) => {
  if (!entries.length) return () => false;
  const list = new net.BlockList();
  let loopback = false;
  for (const e of entries) {
    if (e === 'loopback') {
      loopback = true;
      continue;
    }
    const [addr, bits] = e.split('/');
    const family = net.isIPv4(addr) ? 'ipv4' : net.isIPv6(addr) ? 'ipv6' : null;
    if (!family) throw new Error(`TRUST_PROXY: "${e}" is not an IP address or range`);
    if (bits === undefined) list.addAddress(addr, family);
    else {
      const prefix = Number(bits);
      const max = family === 'ipv4' ? 32 : 128;
      if (!Number.isInteger(prefix) || prefix < 0 || prefix > max)
        throw new Error(`TRUST_PROXY: bad range "${e}"`);
      list.addSubnet(addr, prefix, family);
    }
  }
  return (raw: string) => {
    const ip = normalizeIp(raw);
    if (loopback && isLoopback(raw)) return true;
    const family = net.isIPv4(ip) ? 'ipv4' : net.isIPv6(ip) ? 'ipv6' : null;
    return family !== null && list.check(ip, family);
  };
};

/**
 * The player's address for a request. From a trusted proxy: the right-most X-Forwarded-For
 * entry (the one our proxy added). Otherwise the socket address. Returns '' if unknown.
 */
export const forwardedClientIp = (
  req: http.IncomingMessage,
  trusted: (ip: string) => boolean,
): string => {
  const remote = req.socket.remoteAddress ?? '';
  if (!remote || !trusted(remote)) return '';
  const header = req.headers['x-forwarded-for'];
  const value = Array.isArray(header) ? header.join(',') : (header ?? '');
  const last = value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .pop();
  return last && net.isIP(normalizeIp(last)) ? normalizeIp(last) : '';
};
