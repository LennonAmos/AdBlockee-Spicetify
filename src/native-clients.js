const SERVICES = {
  settings: new Set(["spotify.ads.esperanto.proto.Settings", "spotify.ads.esperanto.settings.proto.Settings"]),
  slots: new Set(["spotify.ads.esperanto.proto.Slots", "spotify.ads.esperanto.slots.proto.Slots"]),
  testing: new Set(["spotify.ads.esperanto.proto.Testing", "spotify.ads.esperanto.testing.proto.Testing"]),
};

// Resolve only generated ad-service modules. Loading every webpack factory
// executes unrelated application code and is unnecessary for these controls.
export function resolveNativeClients(host, transport) {
  if (typeof transport?.callSingle !== "function") return undefined;
  const queue = [host.rspackChunk, host.webpackChunkclient_web, host.rspackChunkclient_web]
    .find(value => Array.isArray(value));
  if (!queue) return undefined;
  let runtime;
  const chunk = [[Symbol("AdBlockee native services")], {}, value => { runtime = value; }];
  queue.push(chunk);
  if (queue[queue.length - 1] === chunk) queue.pop();
  if (typeof runtime !== "function" || !runtime.m) return undefined;
  const found = {};
  for (const [id, factory] of Object.entries(runtime.m)) {
    const source = String(factory);
    if (!Object.values(SERVICES).some(ids => [...ids].some(service => source.includes(service)))) continue;
    const exports = runtime(id);
    for (const Client of Object.values(exports ?? {})) {
      if (typeof Client !== "function") continue;
      for (const [kind, ids] of Object.entries(SERVICES)) {
        if (!found[kind] && ids.has(Client.SERVICE_ID)) found[kind] = new Client(transport);
      }
    }
  }
  return Object.keys(found).length ? found : undefined;
}

export function supportsNegativePlaytime(client, seconds) {
  const type = client?.constructor?.METHODS?.addPlaytime?.requestType;
  if (!type?.encode || !type?.decode || !type?.fromPartial) return false;
  try {
    const encoded = type.encode(type.fromPartial({ seconds })).finish();
    return Number(type.decode(encoded).seconds) === seconds;
  } catch { return false; }
}
