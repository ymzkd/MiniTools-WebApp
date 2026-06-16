// crypto.randomUUID() is only exposed in secure contexts (HTTPS or localhost).
// When this app is served over plain HTTP (e.g. an internal Dokploy/Tailscale
// host at http://<name>.sslip.io), crypto.randomUUID is undefined and calling it
// throws "crypto.randomUUID is not a function", crashing components that use it
// (useToast, useImageManager). crypto.getRandomValues IS available in insecure
// contexts, so we build a RFC 4122 v4 fallback on top of it.
if (typeof crypto !== 'undefined' && typeof crypto.randomUUID !== 'function') {
  const hex: string[] = [];
  for (let i = 0; i < 256; i++) hex.push((i + 0x100).toString(16).slice(1));

  crypto.randomUUID = function randomUUID() {
    const b = crypto.getRandomValues(new Uint8Array(16));
    b[6] = (b[6] & 0x0f) | 0x40; // version 4
    b[8] = (b[8] & 0x3f) | 0x80; // variant 10xx
    return (
      hex[b[0]] + hex[b[1]] + hex[b[2]] + hex[b[3]] + '-' +
      hex[b[4]] + hex[b[5]] + '-' +
      hex[b[6]] + hex[b[7]] + '-' +
      hex[b[8]] + hex[b[9]] + '-' +
      hex[b[10]] + hex[b[11]] + hex[b[12]] + hex[b[13]] + hex[b[14]] + hex[b[15]]
    ) as `${string}-${string}-${string}-${string}-${string}`;
  };
}
