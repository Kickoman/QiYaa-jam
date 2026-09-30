export function parseTrustedProxies(value: string | undefined): ReadonlySet<string> {
  return new Set(
    (value ?? "127.0.0.1")
      .split(",")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0),
  );
}

export function clientIp(
  remoteAddress: string | undefined,
  realIpHeader: string | string[] | undefined,
  trustedProxies: ReadonlySet<string>,
): string {
  const peer = (remoteAddress ?? "").replace(/^::ffff:/, "");
  const header = Array.isArray(realIpHeader) ? realIpHeader[0] : realIpHeader;
  if (trustedProxies.has(peer) && header !== undefined && header.trim().length > 0) {
    return header.trim();
  }
  return peer;
}
