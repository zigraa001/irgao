// Background map for every Leaflet view.
// Reads GOOGLE_MAPS_API_KEY from the server and draws Google roadmap tiles
// through Leaflet.GoogleMutant. Falls back to OpenStreetMap when the key is
// missing or the Google script fails.
(function (root) {
  var MUTANT =
    "https://unpkg.com/leaflet.gridlayer.googlemutant@0.16.0/dist/Leaflet.GoogleMutant.js";
  var OSM = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
  var pending = null;

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = src;
      s.async = true;
      s.onload = function () { resolve(); };
      s.onerror = function () { reject(new Error("failed to load " + src)); };
      document.head.appendChild(s);
    });
  }

  function loadGoogle(key) {
    return new Promise(function (resolve, reject) {
      if (root.google && root.google.maps && root.google.maps.Map) {
        resolve();
        return;
      }
      var timer = setTimeout(function () {
        reject(new Error("Google Maps timed out"));
      }, 12000);
      root.__iragoGoogleMapsReady = function () {
        clearTimeout(timer);
        if (root.google && root.google.maps && root.google.maps.Map) {
          resolve();
          return;
        }
        if (root.google && root.google.maps && root.google.maps.importLibrary) {
          root.google.maps.importLibrary("maps").then(function () { resolve(); }).catch(reject);
          return;
        }
        reject(new Error("google.maps.Map missing"));
      };
      var s = document.createElement("script");
      s.src =
        "https://maps.googleapis.com/maps/api/js?v=weekly&callback=__iragoGoogleMapsReady&key=" +
        encodeURIComponent(key);
      s.async = true;
      s.onerror = function () {
        clearTimeout(timer);
        reject(new Error("Google Maps script failed"));
      };
      document.head.appendChild(s);
    });
  }

  function prepare() {
    if (pending) return pending;
    pending = fetch("/api/config/maps", { credentials: "same-origin" })
      .then(function (r) { return r.json(); })
      .then(function (cfg) {
        if (!cfg || cfg.provider !== "google" || !cfg.apiKey) return "osm";
        return loadScript(MUTANT)
          .then(function () { return loadGoogle(cfg.apiKey); })
          .then(function () { return "google"; });
      })
      .catch(function (err) {
        console.warn("[maps] Google Maps unavailable, using OpenStreetMap", err);
        return "osm";
      });
    return pending;
  }

  function addOsm(map, maxZoom) {
    return root.L.tileLayer(OSM, {
      attribution: "&copy; OpenStreetMap contributors",
      maxZoom: Math.min(maxZoom, 19),
    }).addTo(map);
  }

  function hideLeafletLogo(map) {
    if (map.attributionControl) map.attributionControl.setPrefix(false);
  }

  function add(map, options) {
    options = options || {};
    var maxZoom = options.maxZoom || 20;
    if (!map || !root.L || map._iragoBasemap) return;
    hideLeafletLogo(map);
    map._iragoBasemap = "pending";
    prepare().then(function (mode) {
      try {
        if (mode === "google" && root.L.gridLayer && root.L.gridLayer.googleMutant) {
          var layer = root.L.gridLayer.googleMutant({
            type: options.type || "roadmap",
            maxZoom: maxZoom,
          });
          layer.addTo(map);
          map._iragoBasemap = layer;
          return;
        }
      } catch (err) {
        console.warn("[maps] Google layer failed, using OpenStreetMap", err);
      }
      map._iragoBasemap = addOsm(map, maxZoom);
    });
  }

  root.IraGoBasemap = { add: add };
})(window);
