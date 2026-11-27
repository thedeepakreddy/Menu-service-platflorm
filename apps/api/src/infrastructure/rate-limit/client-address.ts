import { BlockList, isIP } from 'node:net';

/**
 * Which client a request is counted against (decision D-037; audit D-04, D-05).
 *
 * Trust model, in order:
 *  1. The TCP peer (socket address) is the client, unless it is a configured TRUSTED PROXY.
 *  2. If the peer is a trusted proxy, `X-Forwarded-For` is read from the RIGHT: each address
 *     appended by a trusted proxy is skipped; the first untrusted address is the client. A
 *     client can prepend anything it likes to the header, but cannot forge the entries that
 *     trusted proxies append after it. A malformed header falls back to the peer address.
 *  3. The web BFF calls the API server-to-server, so every browser behind it would share the
 *     BFF's address. It forwards the browser's address in `X-Platform-Client-Address`, which is
 *     honoured ONLY on a request that also carries the valid BFF credential.
 *
 * `X-Forwarded-For` from an untrusted peer and the BFF header without the credential are ignored
 * entirely (never "partially trusted"). IPv6 clients are keyed by their /64 prefix, because one
 * host typically controls a whole /64 and could otherwise rotate through 2^64 keys.
 */
export const CLIENT_ADDRESS_HEADER = 'x-platform-client-address';

export type TrustedProxies = { list: BlockList; empty: boolean };

/** Parses a comma-separated list of IP addresses and CIDR ranges. Throws on anything invalid. */
export function parseTrustedProxies(entries: readonly string[]): TrustedProxies {
  const list = new BlockList();
  for (const entry of entries) {
    const [address = '', prefix] = entry.split('/');
    const family = isIP(address);
    if (family === 0) throw new Error('invalid trusted proxy entry');
    const type = family === 4 ? 'ipv4' : 'ipv6';
    if (prefix === undefined) {
      list.addAddress(address, type);
    } else {
      const bits = Number(prefix);
      const max = family === 4 ? 32 : 128;
      if (!/^\d{1,3}$/.test(prefix) || bits < 0 || bits > max) {
        throw new Error('invalid trusted proxy entry');
      }
      list.addSubnet(address, bits, type);
    }
  }
  return { list, empty: entries.length === 0 };
}

/** Strips the IPv4-mapped IPv6 prefix so `::ffff:1.2.3.4` and `1.2.3.4` are one client. */
export function normalizeAddress(address: string): string | undefined {
  const trimmed = address.trim();
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(trimmed);
  const candidate = mapped?.[1] ?? trimmed;
  return isIP(candidate) === 0 ? undefined : candidate;
}

function isTrusted(address: string, proxies: TrustedProxies): boolean {
  if (proxies.empty) return false;
  return proxies.list.check(address, isIP(address) === 4 ? 'ipv4' : 'ipv6');
}

/** The rate-limit key for an address: IPv4 as is, IPv6 by its /64 prefix. */
export function addressKey(address: string): string {
  if (isIP(address) !== 6) return address;
  const groups = expandIpv6(address);
  return groups === undefined ? address : `${groups.slice(0, 4).join(':')}::/64`;
}

function expandIpv6(address: string): string[] | undefined {
  const [head = '', tail] = address.split('::');
  const left = head === '' ? [] : head.split(':');
  const right = tail === undefined || tail === '' ? [] : tail.split(':');
  if (tail === undefined && left.length !== 8) return undefined;
  const missing = 8 - left.length - right.length;
  if (missing < 0) return undefined;
  return [...left, ...Array<string>(missing).fill('0'), ...right].map((g) =>
    g.toLowerCase().padStart(4, '0'),
  );
}

export type ClientAddressInput = {
  socketAddress: string | undefined;
  forwardedFor: string | undefined;
  bffForwarded: string | undefined;
  bffAuthenticated: boolean;
};

/** The client address a request is attributed to (see the trust model above). */
export function clientAddress(input: ClientAddressInput, proxies: TrustedProxies): string {
  const peer = normalizeAddress(input.socketAddress ?? '') ?? 'unknown';
  let client = peer;
  if (peer !== 'unknown' && isTrusted(peer, proxies) && input.forwardedFor !== undefined) {
    const hops = input.forwardedFor.split(',').map(normalizeAddress);
    if (hops.length > 0 && hops.length <= 32 && hops.every((h) => h !== undefined)) {
      const chain = hops;
      let candidate: string | undefined;
      for (let i = chain.length - 1; i >= 0; i -= 1) {
        const hop = chain[i] ?? peer;
        candidate = hop;
        if (!isTrusted(hop, proxies)) break;
      }
      client = candidate ?? peer;
    }
  }
  if (input.bffAuthenticated && input.bffForwarded !== undefined) {
    const forwarded = normalizeAddress(input.bffForwarded);
    if (forwarded !== undefined) client = forwarded;
  }
  return client;
}
