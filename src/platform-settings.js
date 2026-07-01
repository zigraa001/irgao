// Platform-wide runtime settings (in-memory, admin-togglable).
// Persists only for the lifetime of the process — a DB-backed version can
// replace the backing store later without changing the interface.

const defaults = {
  emergencyNoFlyBypass: true,
  // When on, every paid booking auto-assigns a demo pilot and runs the full
  // animated ride lifecycle (no real dispatch). Lets the app be demoed end to
  // end without live operators online.
  demoMode: true,
};

const settings = { ...defaults };

function get(key) {
  return settings[key];
}

function set(key, value) {
  if (!(key in defaults)) throw new Error(`Unknown setting: ${key}`);
  settings[key] = value;
}

function all() {
  return { ...settings };
}

module.exports = { get, set, all };
