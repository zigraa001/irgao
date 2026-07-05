// IraGo app — 05-map.js
// (extracted from app.html; part of the concatenated app.bundle.js)

// ── Map Init ──
function initMap() {
  if (map) return;
  map = L.map('map', { zoomControl: false }).setView([28.6139, 77.2090], 12);
  L.control.zoom({ position: 'topright' }).addTo(map);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors',
    maxZoom: 18
  }).addTo(map);

  // Click to set locations
  map.on('click', function(e) {
    if (mapPickTarget) {
      var target = mapPickTarget;
      mapPickTarget = null;
      if (target === 'pickup') setPickup(e.latlng, 'Map Pin (Pickup)');
      else setDest(e.latlng, 'Map Pin (Destination)');
      return;
    }
    if (!pickupCoord) {
      setPickup(e.latlng, 'Map Pin (Pickup)');
    } else if (!destCoord) {
      setDest(e.latlng, 'Map Pin (Destination)');
    }
  });

  // Pause ride auto-follow when the user manually pans/zooms the map, and
  // resume it RIDE_FOLLOW_RESUME_MS later. Without this, the map kept yanking
  // back to the plane every GPS tick while the user was exploring.
  function noteManualMapMove() {
    userMovedMapAt = Date.now();
    updateFollowPill();
  }
  map.on('dragstart', noteManualMapMove);
  map.on('zoomstart', function (e) {
    // Ignore programmatic zooms (panTo/fitBounds) — only user gestures count.
    if (!programmaticMapMove) noteManualMapMove();
  });

  // Add suggestion dropdown behavior
  setupAutocomplete('pickup-input', 'pickup-suggest', function (name, coord) { setPickup(coord, name); }, 'pickup');
  setupAutocomplete('dest-input', 'dest-suggest', function (name, coord) { setDest(coord, name); }, 'dest');

  // Render initial popular routes
  renderPopularRoutes('taxi');
  bindMapZoneLoader(map, bookingZoneLayers, { showAltitude: false });
  setTimeout(function () {
    refreshMapZones(map, bookingZoneLayers, { showAltitude: false });
  }, 600);

  // Tick the follow-pill countdown once a second while a ride is active.
  setInterval(updateFollowPill, 1000);

  // Leaflet caches the container size at init and never re-measures on its own.
  // #map is flex:1 inside .booking-body, so its width changes whenever the 420px
  // booking panel shows/hides, when the flex layout settles after first paint,
  // and when web fonts reflow the nav — but NONE of those fire a window 'resize'
  // event. With a stale cached width, Leaflet only loads tiles for part of the
  // container → the BLANK UNLOADED STRIP on the right, and (after payment)
  // fitRouteBounds framing the route against the wrong width so the plane sits in
  // the dead zone and looks frozen.
  //
  // ResizeObserver fires on EVERY real container size change — not just window
  // resizes — so it is the robust fix. The setTimeouts + window listener stay as
  // a fallback for the very first paint and for browsers without ResizeObserver.
  function fixMapSize() { if (map) map.invalidateSize(false); }
  setTimeout(fixMapSize, 60);
  setTimeout(fixMapSize, 300);
  setTimeout(fixMapSize, 800);
  window.addEventListener('resize', fixMapSize);
  if (typeof ResizeObserver !== 'undefined') {
    var mapEl = document.getElementById('map');
    if (mapEl) {
      var mapResizeObserver = new ResizeObserver(function () { fixMapSize(); });
      mapResizeObserver.observe(mapEl);
    }
  }
}

// Small on-map pill showing whether the map is auto-following the plane or
// paused after a manual pan (with a live countdown to resume). Also makes the
// 30s-pause behaviour visible so it's obvious it's working.
function updateFollowPill() {
  var pill = document.getElementById('map-follow-pill');
  // Only relevant during an active ride (tracking panel visible + following on).
  var tracking = document.getElementById('tracking-panel');
  var active = rideFollowOn && tracking && tracking.classList.contains('active');
  if (!active) {
    if (pill) pill.style.display = 'none';
    return;
  }
  if (!pill) {
    pill = document.createElement('div');
    pill.id = 'map-follow-pill';
    pill.style.cssText =
      'position:absolute;top:12px;left:50%;transform:translateX(-50%);z-index:1000;' +
      'background:rgba(30,58,95,0.92);color:#fff;font:600 12px/1 Inter,sans-serif;' +
      'padding:7px 14px;border-radius:99px;box-shadow:0 2px 8px rgba(0,0,0,0.25);pointer-events:none;';
    var mapEl = document.getElementById('map');
    if (mapEl) mapEl.appendChild(pill);
  }
  var remaining = RIDE_FOLLOW_RESUME_MS - (Date.now() - userMovedMapAt);
  if (remaining > 0) {
    pill.textContent = 'Map paused · auto-follow in ' + Math.ceil(remaining / 1000) + 's';
    pill.style.background = 'rgba(180,83,9,0.92)';
  } else {
    pill.textContent = 'Following your plane';
    pill.style.background = 'rgba(30,58,95,0.92)';
  }
  pill.style.display = 'block';
}

function paddedBoundsFromMap(targetMap, padRatio) {
  if (padRatio == null) padRatio = 0.12;
  const b = targetMap.getBounds();
  const sw = b.getSouthWest();
  const ne = b.getNorthEast();
  const latPad = (ne.lat - sw.lat) * padRatio;
  const lngPad = (ne.lng - sw.lng) * padRatio;
  return {
    swLat: sw.lat - latPad,
    swLng: sw.lng - lngPad,
    neLat: ne.lat + latPad,
    neLng: ne.lng + lngPad,
  };
}

function boundsQueryString(bounds) {
  return (
    'swLat=' + encodeURIComponent(bounds.swLat) +
    '&swLng=' + encodeURIComponent(bounds.swLng) +
    '&neLat=' + encodeURIComponent(bounds.neLat) +
    '&neLng=' + encodeURIComponent(bounds.neLng)
  );
}

async function fetchFlightZonesForBounds(bounds) {
  const u = AUTH.user;
  const role = (u && u.role) || 'customer';
  const key =
    role + '|' +
    bounds.swLat.toFixed(3) + ',' + bounds.swLng.toFixed(3) + ',' +
    bounds.neLat.toFixed(3) + ',' + bounds.neLng.toFixed(3);
  if (flightZoneFetchCache.has(key)) return flightZoneFetchCache.get(key);
  try {
    const res = await apiFetch('/api/zones?' + boundsQueryString(bounds));
    const data = await res.json().catch(function () { return {}; });
    const zones = res.ok && Array.isArray(data.zones) ? data.zones : [];
    if (res.ok) flightZoneFetchCache.set(key, zones);
    if (flightZoneFetchCache.size > 32) {
      const oldest = flightZoneFetchCache.keys().next().value;
      flightZoneFetchCache.delete(oldest);
    }
    return zones;
  } catch (e) {
    return [];
  }
}

function styleForZone(z, targetMap) {
  const base = ZONE_STYLES[z.zoneType] || ZONE_STYLES.restricted;
  const zoom = targetMap.getZoom();
  if (z.zoneType === 'flight_corridor') {
    return {
      color: base.color,
      fillColor: base.fillColor,
      fillOpacity: zoom < 7 ? 0.5 : zoom < 10 ? 0.4 : 0.32,
      weight: zoom < 7 ? 5 : zoom < 10 ? 4 : 3,
      dashArray: base.dashArray || '12 8',
      opacity: 1,
    };
  }
  if (z.zoneType === 'restricted') {
    return Object.assign({}, base, {
      fillOpacity: zoom < 8 ? 0.62 : 0.52,
      weight: zoom < 8 ? 5 : 4,
      opacity: 1,
    });
  }
  return Object.assign({}, base, { opacity: 1 });
}

function countZonesByType(zones) {
  const counts = { flight_corridor: 0, restricted: 0, no_fly: 0 };
  zones.forEach(function (z) {
    if (counts[z.zoneType] != null) counts[z.zoneType] += 1;
  });
  return counts;
}

function updateOperatorZoneBadge(zones) {
  const label = document.getElementById('op-zone-badge-label');
  const legendCount = document.getElementById('op-map-legend-count');
  const c = countZonesByType(zones);
  const parts = [];
  if (c.flight_corridor) parts.push(c.flight_corridor + ' corridor' + (c.flight_corridor === 1 ? '' : 's'));
  if (c.restricted) parts.push(c.restricted + ' restricted');
  if (c.no_fly) parts.push(c.no_fly + ' no-fly');
  const summary = parts.length ? parts.join(' · ') : 'no airspace in view — zoom or pan';
  if (label) label.textContent = 'Live GPS · ' + summary;
  if (legendCount) legendCount.textContent = zones.length ? zones.length + ' zone(s) loaded' : '';
}

async function refreshMapZones(targetMap, layerStore, options) {
  if (!targetMap) return;
  options = options || {};
  const bounds = paddedBoundsFromMap(targetMap);
  const zones = await fetchFlightZonesForBounds(bounds);
  drawZonesOnMap(targetMap, zones, layerStore, options.showAltitude !== false);
  if (options.altitudeHostId) {
    renderZoneAltitudeStack(zones, options.altitudeHostId);
  }
  if (targetMap === opSelfMap) {
    updateOperatorZoneBadge(zones);
  } else if (targetMap === map) {
    const countEl = document.getElementById('booking-map-legend-count');
    if (countEl) {
      const c = countZonesByType(zones);
      const parts = [];
      if (c.flight_corridor) parts.push(c.flight_corridor + ' corridor' + (c.flight_corridor === 1 ? '' : 's'));
      if (c.restricted) parts.push(c.restricted + ' restricted');
      if (c.no_fly) parts.push(c.no_fly + ' no-fly');
      countEl.textContent = parts.length ? parts.join(' · ') : '';
    }
  }
}

function bindMapZoneLoader(targetMap, layerStore, options) {
  if (!targetMap || targetMap._zonesLoaderBound) return;
  targetMap._zonesLoaderBound = true;
  function onMapViewChange() {
    let timer = mapZoneRefreshTimers.get(targetMap);
    if (timer) clearTimeout(timer);
    timer = setTimeout(function () {
      refreshMapZones(targetMap, layerStore, options);
    }, 200);
    mapZoneRefreshTimers.set(targetMap, timer);
  }
  targetMap.on('moveend zoomend', onMapViewChange);
  window.addEventListener('resize', function () {
    if (!targetMap || !targetMap.getContainer || !targetMap.getContainer()) return;
    scheduleMapZoneRefresh(targetMap, layerStore, options, 150);
  });
}

function geoJsonToLeafletLatLngs(geometry) {
  if (!geometry || geometry.type !== 'Polygon' || !geometry.coordinates || !geometry.coordinates[0]) {
    return null;
  }
  return geometry.coordinates[0].map(function (c) { return [c[1], c[0]]; });
}

function zonePopupHtml(z, showAltitude) {
  let html =
    '<strong>' + escapeHtml(z.name) + '</strong><br>' +
    'Type: ' + escapeHtml((z.zoneType || '').replace(/_/g, ' '));
  if (showAltitude && z.minAltitudeM != null && z.maxAltitudeM != null) {
    html += '<br>Altitude: ' + z.minAltitudeM + '–' + z.maxAltitudeM + ' m AGL';
  }
  return html;
}

// Hard cap on polygons drawn per viewport. The backend already caps the rows
// returned; this guards the Leaflet render path when a low-zoom pan still
// intersects many zones (e.g. half of India). Safety-critical types
// (no_fly > restricted > corridor) are kept first when trimming.
const MAX_ZONES_DRAWN = 120;
// Skip zones whose bbox projects to less than this many CSS pixels — they are
// sub-pixel and invisible anyway, so drawing them is pure compute waste.
const MIN_ZONE_PX = 2;

function zonePixelSize(targetMap, z) {
  if (z.minLat == null || z.maxLat == null || z.minLng == null || z.maxLng == null) {
    return null;
  }
  const sw = targetMap.latLngToContainerPoint(L.latLng(z.minLat, z.minLng));
  const ne = targetMap.latLngToContainerPoint(L.latLng(z.maxLat, z.maxLng));
  return { w: Math.abs(ne.x - sw.x), h: Math.abs(ne.y - sw.y) };
}

function drawZonesOnMap(targetMap, zones, layerStore, showAltitude) {
  if (!targetMap) return;
  const withAlt = showAltitude !== false;
  layerStore.forEach(function (layer) { targetMap.removeLayer(layer); });
  layerStore.length = 0;

  // Cull sub-pixel zones first (saves the most Leaflet work at low zoom),
  // then cap the remainder keeping the most safety-relevant types on top.
  const visible = zones.filter(function (z) {
    const px = zonePixelSize(targetMap, z);
    if (!px) return true; // no bbox → keep, let geometry path decide
    return px.w >= MIN_ZONE_PX || px.h >= MIN_ZONE_PX;
  });

  const sorted = visible.slice().sort(function (a, b) {
    return (ZONE_DRAW_ORDER[a.zoneType] || 0) - (ZONE_DRAW_ORDER[b.zoneType] || 0);
  });

  // If still over the cap, drop from the bottom of the draw order (corridors
  // first) since no_fly/restricted are smaller and safety-critical.
  const toDraw = sorted.length > MAX_ZONES_DRAWN ? sorted.slice(0, MAX_ZONES_DRAWN) : sorted;

  toDraw.forEach(function (z) {
    const latlngs = geoJsonToLeafletLatLngs(z.geometry);
    if (!latlngs) return;
    const style = styleForZone(z, targetMap);
    const poly = L.polygon(latlngs, style).addTo(targetMap);
    poly.bindPopup(zonePopupHtml(z, withAlt));
    layerStore.push(poly);
  });
  layerStore.forEach(function (layer) {
    if (layer.bringToFront) layer.bringToFront();
  });
}

function renderZoneAltitudeStack(zones, hostId) {
  const host = document.getElementById(hostId);
  if (!host) return;
  if (!zones.length) {
    host.innerHTML = '<h4>Altitude (3D)</h4><div class="op-empty-sub">No zones configured.</div>';
    return;
  }
  const maxAlt = Math.max.apply(null, zones.map(function (z) { return z.maxAltitudeM; }).concat([500]));
  host.innerHTML =
    '<h4>Altitude (3D)</h4>' +
    zones.map(function (z) {
      const pctBase = (z.minAltitudeM / maxAlt) * 100;
      const pctH = Math.max(((z.maxAltitudeM - z.minAltitudeM) / maxAlt) * 100, 4);
      const style = ZONE_STYLES[z.zoneType] || ZONE_STYLES.restricted;
      return '<div class="zone-alt-row">' +
        '<div class="zone-alt-label">' + escapeHtml(z.name) + '</div>' +
        '<div class="zone-alt-bar-track">' +
          '<div class="zone-alt-bar" style="bottom:' + pctBase + '%;height:' + pctH + '%;background:' + style.fillColor + ';border-color:' + style.color + '"></div>' +
        '</div>' +
        '<div class="zone-alt-range">' + z.minAltitudeM + '–' + z.maxAltitudeM + ' m</div>' +
      '</div>';
    }).join('');
}

async function initAdminLiveFlights() {
  const el = document.getElementById('admin-live-map');
  if (el && !adminLiveMap) {
    adminLiveMap = L.map('admin-live-map', { zoomControl: true }).setView([22.5, 79.0], 5);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 18,
    }).addTo(adminLiveMap);
    attachAdminMapZoomProfiles();
  }
  await refreshAdminLiveFlights();
  if (adminLivePollInterval) clearInterval(adminLivePollInterval);
  adminLivePollInterval = setInterval(refreshAdminLiveFlights, 5000);
  setTimeout(function () {
    if (adminLiveMap) adminLiveMap.invalidateSize();
  }, 200);
}

function toggleAdminMapFullscreen() {
  const wrap = document.getElementById('admin-live-map-wrap');
  if (!wrap) return;
  const isFs = wrap.classList.toggle('fs');
  document.body.classList.toggle('admin-map-fs', isFs);
  const btn = document.getElementById('admin-live-map-fs');
  if (btn) btn.title = isFs ? 'Exit fullscreen' : 'Fullscreen';
  // Leaflet needs a re-layout after the container resizes.
  setTimeout(function () { if (adminLiveMap) adminLiveMap.invalidateSize(); }, 60);
  setTimeout(function () { if (adminLiveMap) adminLiveMap.invalidateSize(); }, 320);
}

document.addEventListener('keydown', function (e) {
  if (e.key === 'Escape') {
    const wrap = document.getElementById('admin-live-map-wrap');
    if (wrap && wrap.classList.contains('fs')) toggleAdminMapFullscreen();
  }
});

async function refreshAdminLiveFlights() {
  const listEl = document.getElementById('admin-live-list');
  const fleetEl = document.getElementById('admin-fleet-list');
  const metaEl = document.getElementById('admin-live-meta');
  if (!listEl) return;
  try {
    const res = await apiFetch('/api/admin/live-flights');
    const data = await res.json().catch(function () { return {}; });
    if (!res.ok) throw new Error('load failed');
    const flights = Array.isArray(data.flights) ? data.flights : [];
    const fleet = Array.isArray(data.fleet) ? data.fleet : [];
    const dispatching = Array.isArray(data.dispatching) ? data.dispatching : [];
    if (metaEl) {
      metaEl.textContent =
        flights.length + ' active flight(s) · ' +
        fleet.length + ' pilot(s) reporting GPS · ' +
        dispatching.length + ' dispatching · updates every 5s';
    }
    if (!flights.length) {
      listEl.innerHTML = '<div class="op-empty"><div class="op-empty-sub">No flights in transit right now.</div></div>';
    } else {
      listEl.innerHTML = flights.map(function (f) {
        const op = f.operator;
        const gps = op && op.lat != null
          ? op.lat.toFixed(4) + ', ' + op.lng.toFixed(4)
          : 'GPS pending';
        return (
          '<div class="admin-flight-card">' +
            '<div class="admin-flight-top">' +
              '<div class="admin-flight-route">' + escapeHtml(f.pickup.name) + ' → ' + escapeHtml(f.dest.name) + '</div>' +
              statusBadgeHtml(f.status) +
            '</div>' +
            '<div class="admin-flight-meta">' +
              'IRG-' + String(f.id).padStart(5, '0') + ' · ' + escapeHtml(f.customer.name) +
              '<br>Pilot: ' + escapeHtml(op ? op.name : 'Unassigned') + ' · ' + gps +
              '<br>' + escapeHtml(f.service) + ' · ' + (f.distanceKm != null ? f.distanceKm + ' km' : '—') +
              (f.carbonSavedKg != null ? ' · CO₂ saved ' + f.carbonSavedKg + ' kg' : '') +
            '</div>' +
          '</div>'
        );
      }).join('');
    }
    if (fleetEl) {
      if (!fleet.length) {
        fleetEl.innerHTML = '<div class="op-empty"><div class="op-empty-sub">No pilots reporting GPS yet.</div></div>';
      } else {
        fleetEl.innerHTML = fleet.map(function (p) {
          const gps = p.lat != null ? p.lat.toFixed(4) + ', ' + p.lng.toFixed(4) : '—';
          const status = p.inTransit
            ? statusBadgeHtml(p.tripStatus || 'flying')
            : '<span class="op-status-badge op-badge--green">Available</span>';
          return (
            '<div class="admin-fleet-row">' +
              '<div><b>' + escapeHtml(p.name) + '</b><br>' + gps + '</div>' +
              '<div>' + status + '</div>' +
            '</div>'
          );
        }).join('');
      }
    }
    if (adminLiveMap) {
      const activePilotKeys = new Set();
      const points = [];
      fleet.forEach(function (p) {
        if (p.lat == null) return;
        const key = 'admin-pilot-' + p.operatorId;
        activePilotKeys.add(key);
        const icon = p.inTransit
          ? '<div class="nearby-taxi-marker">✈️</div>'
          : '<div class="nearby-taxi-marker">🛬</div>';
        const label =
          escapeHtml(p.name) +
          (p.inTransit ? ' · in transit' : ' · available') +
          '<br>~' + (p.lat.toFixed(4) + ', ' + p.lng.toFixed(4));
        setAnimatedMapMarker(key, adminLiveMap, p.lat, p.lng, icon, label);
        // Zoom-gated profile: clicking a pilot marker opens their profile
        // drawer once the admin has zoomed in close enough (zoom >= 10).
        const entry = animatedMarkers.get(key);
        if (entry && !entry._profileClick) {
          entry._profileClick = true;
          entry.layer.on('click', function (ev) {
            L.DomEvent.stopPropagation(ev);
            if (adminLiveMap && adminLiveMap._iragoZoomProfileEnabled) {
              openAdminUserDrawer(p.operatorId);
            } else {
              adminLiveMap && adminLiveMap.fitBounds(L.latLngBounds([p.lat, p.lng], [p.lat, p.lng]).pad(0.4));
            }
          });
        }
        points.push([p.lat, p.lng]);
      });
      animatedMarkers.forEach(function (_entry, key) {
        if (key.indexOf('admin-pilot-') === 0 && !activePilotKeys.has(key)) {
          removeAnimatedMapMarker(key);
        }
      });
      flights.forEach(function (f) {
        if (f.pickup && f.pickup.lat != null) points.push([f.pickup.lat, f.pickup.lng]);
        if (f.dest && f.dest.lat != null) points.push([f.dest.lat, f.dest.lng]);
      });
      if (points.length) {
        adminLiveMap.fitBounds(L.latLngBounds(points).pad(0.12));
      }
    }
  } catch (e) {
    listEl.innerHTML = '<div class="op-empty"><div class="op-empty-sub">Could not load live flights.</div></div>';
    if (fleetEl) fleetEl.innerHTML = '<div class="op-empty"><div class="op-empty-sub">Could not load fleet.</div></div>';
  }
}

// When set ('pickup' | 'dest'), the next map click sets that location.
var mapPickTarget = null;

function startMapPick(target) {
  mapPickTarget = target;
  var input = document.getElementById(target === 'pickup' ? 'pickup-input' : 'dest-input');
  var dropdown = document.getElementById(target === 'pickup' ? 'pickup-suggest' : 'dest-suggest');
  if (dropdown) dropdown.style.display = 'none';
  if (input) input.blur();
  showToast(target === 'pickup' ? 'Tap the map to set your pickup point' : 'Tap the map to set your destination', 'info');
}

var MAP_PICK_OPTION = '__map_pick__';
var PHOTON_SEARCH_OPTION = '__photon__';

function setupAutocomplete(inputId, suggestId, callback, target) {
  var input = document.getElementById(inputId);
  var dropdown = document.getElementById(suggestId);
  if (!input || !dropdown) return;
  var activeIdx = -1;
  var currentMatches = [];
  var photonTimer = null;
  var photonAbort = null;
  var lastPhotonQuery = '';

  function highlightMatch(name, query) {
    if (!query) return escapeHtml(name);
    var lower = name.toLowerCase();
    var idx = lower.indexOf(query.toLowerCase());
    if (idx < 0) return escapeHtml(name);
    var before = escapeHtml(name.substring(0, idx));
    var match = escapeHtml(name.substring(idx, idx + query.length));
    var after = escapeHtml(name.substring(idx + query.length));
    return before + '<span class="loc-suggest-match">' + match + '</span>' + after;
  }

  function scoreName(name, keywords) {
    var lower = name.toLowerCase();
    var score = 0;
    for (var i = 0; i < keywords.length; i++) {
      var k = keywords[i];
      if (!k) continue;
      if (lower.indexOf(k) === 0) score += 3;
      else if (lower.indexOf(k) >= 0) score += 1;
      else {
        var parts = lower.split(/[\s,]+/);
        var found = false;
        for (var j = 0; j < parts.length; j++) {
          if (parts[j].indexOf(k) === 0) { score += 2; found = true; break; }
        }
        if (!found) return 0;
      }
    }
    return score;
  }

  var pinSvg = '<svg class="loc-suggest-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="10" r="3"/><path d="M12 2a8 8 0 0 0-8 8c0 5.4 7 12 8 12s8-6.6 8-12a8 8 0 0 0-8-8z"/></svg>';
  var mapSvg = '<svg class="loc-suggest-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2-6-2z"/><path d="M9 4v14m6-12v14"/></svg>';
  var searchSvg = '<svg class="loc-suggest-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>';
  var globeSvg = '<svg class="loc-suggest-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>';

  function renderDropdown(vertiports, photonResults, query) {
    activeIdx = -1;
    var q = (query || '').trim();
    currentMatches = [];

    // Always start with "Choose on map"
    currentMatches.push({ name: MAP_PICK_OPTION });

    // Add vertiport matches
    vertiports.forEach(function (v) { currentMatches.push(v); });

    // Add photon results
    if (photonResults && photonResults.length) {
      currentMatches.push({ name: PHOTON_SEARCH_OPTION });
      photonResults.forEach(function (r) { currentMatches.push(r); });
    }

    var html = '';
    currentMatches.forEach(function (m, idx) {
      if (m.name === MAP_PICK_OPTION) {
        html += '<div class="loc-suggest-item loc-suggest-map" data-idx="' + idx + '">' +
          mapSvg + '<span class="loc-suggest-name">Choose on map</span></div>';
        if (q.length < 1) {
          html += '<div class="loc-suggest-label">Popular vertiports</div>';
        } else if (vertiports.length) {
          html += '<div class="loc-suggest-label">IraGo vertiports</div>';
        }
        return;
      }
      if (m.name === PHOTON_SEARCH_OPTION) {
        html += '<div class="loc-suggest-label loc-suggest-label-search">' + searchSvg + ' Search results</div>';
        return;
      }
      if (m.photon) {
        html += '<div class="loc-suggest-item loc-suggest-photon" data-idx="' + idx + '">' +
          globeSvg +
          '<div class="loc-suggest-text"><span class="loc-suggest-name">' + highlightMatch(m.name, q) + '</span>' +
          (m.address ? '<span class="loc-suggest-addr">' + escapeHtml(m.address) + '</span>' : '') +
          '</div></div>';
      } else {
        html += '<div class="loc-suggest-item" data-idx="' + idx + '">' +
          pinSvg + '<span class="loc-suggest-name">' + highlightMatch(m.name, q) + '</span></div>';
      }
    });

    if (q.length >= 2 && !vertiports.length && (!photonResults || !photonResults.length)) {
      html += '<div class="loc-suggest-empty">No matching places</div>';
    }

    dropdown.innerHTML = html;
    dropdown.style.display = 'block';

    var items = dropdown.querySelectorAll('.loc-suggest-item');
    for (var j = 0; j < items.length; j++) {
      (function (el) {
        var idx = parseInt(el.getAttribute('data-idx'));
        el.onmousedown = function (e) {
          e.preventDefault();
          pickItem(idx);
        };
      })(items[j]);
    }
  }

  function getLocalMatches(query) {
    var q = (query || '').trim();
    var names = Object.keys(demoLocations);
    var scored = [];
    if (q.length < 1) {
      scored = names.slice(0, 6).map(function (n) { return { name: n, score: 0 }; });
    } else {
      var keywords = q.toLowerCase().split(/\s+/);
      for (var i = 0; i < names.length; i++) {
        var s = scoreName(names[i], keywords);
        if (s > 0) scored.push({ name: names[i], score: s });
      }
      scored.sort(function (a, b) { return b.score - a.score; });
      scored = scored.slice(0, 5);
    }
    return scored;
  }

  function searchPhoton(query) {
    var q = (query || '').trim();
    if (q.length < 2) return;
    if (q === lastPhotonQuery) return;
    lastPhotonQuery = q;

    if (photonTimer) clearTimeout(photonTimer);
    if (photonAbort) { photonAbort.abort(); photonAbort = null; }

    photonTimer = setTimeout(function () {
      var center = map ? map.getCenter() : { lat: 20.5937, lng: 78.9629 };
      var controller = new AbortController();
      photonAbort = controller;

      var url = 'https://photon.komoot.io/api/?q=' + encodeURIComponent(q) +
        '&lat=' + center.lat + '&lon=' + center.lng + '&limit=5&lang=en';

      fetch(url, { signal: controller.signal })
        .then(function (res) { return res.json(); })
        .then(function (data) {
          photonAbort = null;
          if (!data.features || !data.features.length) return;
          if (input.value.trim() !== q) return;

          var results = data.features.map(function (feat) {
            var props = feat.properties;
            var name = props.name || props.street || 'Unknown';
            var addrParts = [props.street, props.city || props.town, props.state, props.country].filter(Boolean);
            var address = addrParts.join(', ');
            var coords = feat.geometry.coordinates;
            return { name: name, address: address, coord: [coords[1], coords[0]], photon: true };
          });

          var localMatches = getLocalMatches(q);
          renderDropdown(localMatches, results, q);
        })
        .catch(function () { photonAbort = null; });
    }, 350);
  }

  function render(query) {
    var q = (query || '').trim();
    var localMatches = getLocalMatches(q);
    renderDropdown(localMatches, [], q);

    if (q.length >= 2) {
      searchPhoton(q);
    }
  }

  function pickItem(idx) {
    if (idx < 0 || idx >= currentMatches.length) return;
    var match = currentMatches[idx];
    if (match.name === MAP_PICK_OPTION) { dropdown.style.display = 'none'; currentMatches = []; startMapPick(target); return; }
    if (match.name === PHOTON_SEARCH_OPTION) return;

    dropdown.style.display = 'none';
    var name = match.name;
    var coord = match.photon ? match.coord : demoLocations[name];
    if (!coord) return;
    currentMatches = [];
    input.value = name;
    input.classList.add('has-value');
    callback(name, coord);
  }

  function setActive(idx) {
    var items = dropdown.querySelectorAll('.loc-suggest-item');
    for (var i = 0; i < items.length; i++) items[i].classList.remove('active');
    activeIdx = idx;
    if (idx >= 0 && idx < items.length) {
      items[idx].classList.add('active');
      items[idx].scrollIntoView({ block: 'nearest' });
    }
  }

  input.addEventListener('input', function () { render(this.value); });
  input.addEventListener('focus', function () {
    render(this.value);
  });
  input.addEventListener('blur', function () {
    setTimeout(function () { dropdown.style.display = 'none'; }, 150);
  });
  input.addEventListener('keydown', function (e) {
    if (dropdown.style.display === 'none' || !currentMatches.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      var next = activeIdx + 1;
      while (next < currentMatches.length && (currentMatches[next].name === PHOTON_SEARCH_OPTION)) next++;
      if (next < currentMatches.length) setActive(next); else setActive(0);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      var prev = activeIdx - 1;
      while (prev >= 0 && (currentMatches[prev].name === PHOTON_SEARCH_OPTION)) prev--;
      if (prev >= 0) setActive(prev); else setActive(currentMatches.length - 1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (activeIdx >= 0) pickItem(activeIdx);
      else if (currentMatches.length === 1) pickItem(0);
    } else if (e.key === 'Escape') {
      dropdown.style.display = 'none';
    }
  });
}

function createMarker(latlng, type) {
  const div = document.createElement('div');
  div.className = 'custom-marker';
  div.innerHTML = `<div class="marker-${type}"></div>`;
  return L.marker(latlng, {
    icon: L.divIcon({ html: div.outerHTML, className: '', iconSize: [14, 14], iconAnchor: [7, 7] })
  });
}

function setPickup(latlng, name) {
  pickupCoord = Array.isArray(latlng) ? latlng : [latlng.lat, latlng.lng];
  document.getElementById('pickup-input').value = name;
  document.getElementById('pickup-input').classList.add('has-value');
  if (pickupMarker) map.removeLayer(pickupMarker);
  pickupMarker = createMarker(pickupCoord, 'pickup').addTo(map);
  if (pickupCoord && destCoord) drawRoute();
  else map.setView(pickupCoord, 13);
  captureBookingDraft();
  refreshNearbyTaxis();
}

function setDest(latlng, name) {
  destCoord = Array.isArray(latlng) ? latlng : [latlng.lat, latlng.lng];
  document.getElementById('dest-input').value = name;
  document.getElementById('dest-input').classList.add('has-value');
  if (destMarker) map.removeLayer(destMarker);
  destMarker = createMarker(destCoord, 'dest').addTo(map);
  if (pickupCoord && destCoord) drawRoute();
  else map.setView(destCoord, 13);
  captureBookingDraft();
  if (pickupCoord && destCoord) refreshNearbyTaxis();
}

function drawRoute() {
  if (routeLine) map.removeLayer(routeLine);
  aircraftMarkers.forEach(m => map.removeLayer(m));
  aircraftMarkers = [];

  // Use actual avoidance route when available
  if (currentRoute && currentRoute.segments && currentRoute.segments.length) {
    drawRouteFromPlan();
    onRouteReady();
    return;
  }

  // Fallback: curved flight path
  const midLat = (pickupCoord[0] + destCoord[0]) / 2;
  const midLng = (pickupCoord[1] + destCoord[1]) / 2;
  const dist = Math.sqrt(Math.pow(pickupCoord[0] - destCoord[0], 2) + Math.pow(pickupCoord[1] - destCoord[1], 2));
  const arcHeight = dist * 0.3;
  const perpLat = -(destCoord[1] - pickupCoord[1]);
  const perpLng = destCoord[0] - pickupCoord[0];
  const perpLen = Math.sqrt(perpLat * perpLat + perpLng * perpLng) || 1;
  const ctrlLat = midLat + (perpLat / perpLen) * arcHeight;
  const ctrlLng = midLng + (perpLng / perpLen) * arcHeight;

  const points = [];
  for (let t = 0; t <= 1; t += 0.03) {
    const lat = (1-t)*(1-t)*pickupCoord[0] + 2*(1-t)*t*ctrlLat + t*t*destCoord[0];
    const lng = (1-t)*(1-t)*pickupCoord[1] + 2*(1-t)*t*ctrlLng + t*t*destCoord[1];
    points.push([lat, lng]);
  }

  routeLine = L.polyline(points, {
    color: currentService === 'golden' ? '#EF4444' : currentService === 'shuttle' ? '#10B981' : '#3B82F6',
    weight: 3,
    opacity: 0.7,
    dashArray: '10 6',
    className: 'flight-path'
  }).addTo(map);

  const bounds = L.latLngBounds([pickupCoord, destCoord]).pad(0.3);
  map.fitBounds(bounds);
  onRouteReady();
}

function drawRouteFromPlan() {
  if (!currentRoute || !currentRoute.segments || !currentRoute.segments.length) return;
  if (routeLine) map.removeLayer(routeLine);
  aircraftMarkers.forEach(function (m) { map.removeLayer(m); });
  aircraftMarkers = [];

  var serviceColor = currentService === 'golden' ? '#EF4444' : currentService === 'shuttle' ? '#10B981' : '#3B82F6';
  var layers = [];

  currentRoute.segments.forEach(function (seg) {
    var color = (seg.crossedRestricted && seg.crossedRestricted.length) ? '#F59E0B' : serviceColor;
    var line = L.polyline(
      [[seg.from.lat, seg.from.lng], [seg.to.lat, seg.to.lng]],
      { color: color, weight: 3.5, opacity: 0.85, dashArray: (seg.crossedRestricted && seg.crossedRestricted.length) ? '8 5' : null }
    );
    layers.push(line);
  });

  routeLine = L.layerGroup(layers).addTo(map);

  if (currentRoute.waypoints) {
    currentRoute.waypoints.forEach(function (wp, i) {
      if (i === 0 || i === currentRoute.waypoints.length - 1) return;
      L.circleMarker([wp.lat, wp.lng], {
        radius: 4, color: '#fff', fillColor: '#F59E0B', fillOpacity: 1, weight: 2
      }).addTo(map);
    });
  }

  if (pickupCoord && destCoord) {
    map.fitBounds(L.latLngBounds([pickupCoord, destCoord]).pad(0.3));
  }
}

function routeReasonLabel(reason) {
  var labels = {
    rerouted_around_no_fly: 'Route adjusted to avoid no-fly zone',
    rerouted_no_fly_and_overfly_restricted: 'Rerouted around no-fly + climbing over restricted zone',
    overfly_restricted_least_fuel: 'Climbing over restricted zone (least fuel option)',
    rerouted_around_restricted: 'Routing around restricted zone (least fuel option)',
  };
  return labels[reason] || '';
}

// When pickup + drop are both set: show nearby taxis (10 km) and fare options with CO₂.
function onRouteReady() {
  captureBookingDraft();
  renderDemoTaxisOnMap();
  startDemoTaxiDrift();
  refreshNearbyTaxis();
  if (bookingDraftReady()) searchRides();
}

function swapLocations() {
  const tmpCoord = pickupCoord;
  const tmpName = document.getElementById('pickup-input').value;
  pickupCoord = destCoord;
  destCoord = tmpCoord;
  document.getElementById('pickup-input').value = document.getElementById('dest-input').value;
  document.getElementById('dest-input').value = tmpName;
  if (pickupMarker) map.removeLayer(pickupMarker);
  if (destMarker) map.removeLayer(destMarker);
  if (pickupCoord) pickupMarker = createMarker(pickupCoord, 'pickup').addTo(map);
  if (destCoord) destMarker = createMarker(destCoord, 'dest').addTo(map);
  if (pickupCoord && destCoord) drawRoute();
  captureBookingDraft();
}

function useCurrentLocation() {
  if (!navigator.geolocation) {
    alert('Geolocation is not supported by your browser.');
    return;
  }
  const btn = document.querySelector('.loc-gps-btn');
  if (btn) { btn.classList.add('gps-loading'); btn.disabled = true; }
  navigator.geolocation.getCurrentPosition(
    async function (pos) {
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      // Reverse geocode with Nominatim to get a readable place name
      let name = 'My Location (' + lat.toFixed(4) + ', ' + lng.toFixed(4) + ')';
      try {
        const r = await fetch(
          'https://nominatim.openstreetmap.org/reverse?format=json&lat=' + lat + '&lon=' + lng,
          { headers: { 'Accept-Language': 'en' } }
        );
        const d = await r.json();
        if (d && d.display_name) {
          // Use suburb/city/town for a short, friendly name
          const a = d.address || {};
          name = a.suburb || a.neighbourhood || a.village || a.town || a.city || d.display_name.split(',')[0];
          name = name + ', ' + (a.city || a.town || a.county || '');
        }
      } catch (e) { /* keep coordinates as name */ }
      setPickup([lat, lng], name.trim().replace(/,\s*$/, ''));
      map.setView([lat, lng], 14);
      if (btn) { btn.classList.remove('gps-loading'); btn.disabled = false; }
    },
    function (err) {
      if (btn) { btn.classList.remove('gps-loading'); btn.disabled = false; }
      const msgs = {
        1: 'Location access denied. Please allow location in your browser settings.',
        2: 'Location unavailable. Try again or enter manually.',
        3: 'Location request timed out.',
      };
      showAuthError('booking-error', msgs[err.code] || 'Could not get your location.');
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
  );
}

