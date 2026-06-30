// Platform-wide runtime settings (in-memory, admin-togglable).
// Persists only for the lifetime of the process — a DB-backed version can
// replace the backing store later without changing the interface.

const defaults = {
  emergencyNoFlyBypass: true,
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
