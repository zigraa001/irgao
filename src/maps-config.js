// Public map config for the browser. The Maps JavaScript API key is meant to
// be used in the page (restrict it by HTTP referrer in Google Cloud). When the
// key is unset, the client keeps the OpenStreetMap tiles.
function mapsClientConfig(env = process.env) {
  const key = String(env.GOOGLE_MAPS_API_KEY || "").trim();
  if (!key) return { provider: "osm" };
  return { provider: "google", apiKey: key };
}

module.exports = { mapsClientConfig };
