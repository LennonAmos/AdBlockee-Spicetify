// Playlist "Recent ads" cards are not served through the ad-slot endpoint.
// Spotify loads them with a separate POST /leavebehinds/ads request, then
// renders the section. Short-circuit only that request. Other Spotify calls,
// including their authorization headers, are passed through untouched.
const LEAVEBEHIND_ADS = /\/leavebehinds\/(?:mock\/)?ads(?:[?#]|$)/;

export function isLeavebehindAdsRequest(input) {
  const url = typeof input === "string" ? input : input?.url;
  return typeof url === "string" && LEAVEBEHIND_ADS.test(url);
}

export function installLeavebehindBlock(host) {
  if (typeof host.fetch !== "function") return () => {};
  if (host.fetch.__adblockee) return host.fetch.__adblockeeRestore ?? (() => {});
  const original = host.fetch.bind(host);
  const wrapped = async function(input, init) {
    if (!isLeavebehindAdsRequest(input)) return original(input, init);
    return new host.Response(JSON.stringify({ leavebehindAds: [] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  const restore = () => { if (host.fetch === wrapped) host.fetch = original; };
  wrapped.__adblockee = true;
  wrapped.__adblockeeRestore = restore;
  host.fetch = wrapped;
  return restore;
}
