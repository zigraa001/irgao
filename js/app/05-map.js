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

  // Default the source to IIT Madras campus when nothing is selected yet, so
  // the pickup field is pre-filled and the map opens centred on IITM. suppress
  // skips the landing-point picker popup. This also short-circuits the GPS
  // auto-pickup (guarded on !pickupCoord) so IITM stays the default.
  if (!pickupCoord) setPickup(IITM_COORD, 'IIT Madras Campus', true);

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

  // Auto-detect GPS for pickup on load (user can still edit)
  if (navigator.geolocation && !pickupCoord) {
    navigator.geolocation.getCurrentPosition(
      async function (pos) {
        if (pickupCoord) return; // user already picked something
        var lat = pos.coords.latitude;
        var lng = pos.coords.longitude;
        var name = 'My Location (' + lat.toFixed(4) + ', ' + lng.toFixed(4) + ')';
        try {
          var r = await fetch(
            'https://nominatim.openstreetmap.org/reverse?format=json&lat=' + lat + '&lon=' + lng,
            { headers: { 'Accept-Language': 'en' } }
          );
          var d = await r.json();
          if (d && d.display_name) {
            var a = d.address || {};
            name = a.suburb || a.neighbourhood || a.village || a.town || a.city || d.display_name.split(',')[0];
            name = name + ', ' + (a.city || a.town || a.county || '');
            name = name.trim().replace(/,\s*$/, '');
          }
        } catch (e) { /* keep coords as name */ }
        if (pickupCoord) return;
        setPickup([lat, lng], name);
        map.setView([lat, lng], 14);
      },
      function () { /* silent fail — user can enter manually */ },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
    );
  }
}

// Small on-map pill showing whether the map is auto-following the plane or
// paused after a manual pan (with a live countdown to resume). Also makes the
// 30s-pause behaviour visible so it's obvious it's working.
var FOLLOW_PILL_PLANE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M17.8 19.2L16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.4-.1.9.3 1.1L11 12l-2 3H6l-1 1 3 2 2 3 1-1v-3l3-2 3.7 7.3c.2.4.7.5 1.1.3l.5-.3c.4-.2.6-.7.5-1.1z"/></svg>';
var FOLLOW_PILL_MAP = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/></svg>';

function updateFollowPill() {
  var pill = document.getElementById('map-follow-pill');
  var tracking = document.getElementById('tracking-panel');
  var active = rideFollowOn && tracking && tracking.classList.contains('active');
  if (!active) {
    if (pill) pill.style.display = 'none';
    return;
  }
  if (!pill) {
    pill = document.createElement('div');
    pill.id = 'map-follow-pill';
    pill.className = 'map-follow-pill';
    var mapEl = document.getElementById('map');
    if (mapEl) mapEl.appendChild(pill);
  }
  var remaining = RIDE_FOLLOW_RESUME_MS - (Date.now() - userMovedMapAt);
  if (remaining > 0) {
    pill.innerHTML = FOLLOW_PILL_MAP + ' Map paused &middot; auto-follow in ' + Math.ceil(remaining / 1000) + 's';
    pill.classList.add('map-follow-pill--paused');
  } else {
    pill.innerHTML = FOLLOW_PILL_PLANE + ' Following your plane';
    pill.classList.remove('map-follow-pill--paused');
  }
  pill.style.display = 'flex';
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
    host.innerHTML = '<h4>Airspace altitude bands</h4><div class="op-empty-sub">No zones configured.</div>';
    return;
  }
  const maxAlt = Math.max.apply(null, zones.map(function (z) { return z.maxAltitudeM; }).concat([500]));
  host.innerHTML =
    '<h4>Airspace altitude bands</h4>' +
    zones.map(function (z) {
      const pctBase = (z.minAltitudeM / maxAlt) * 100;
      const pctH = Math.max(((z.maxAltitudeM - z.minAltitudeM) / maxAlt) * 100, 4);
      return '<div class="zone-alt-row">' +
        '<div class="zone-alt-label">' + escapeHtml(z.name) + '</div>' +
        '<div class="zone-alt-bar-track">' +
          '<div class="zone-alt-bar zone-alt-bar--' + z.zoneType + '" style="bottom:' + pctBase + '%;height:' + pctH + '%"></div>' +
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

function adminLiveChip(dotClass, value, label) {
  return '<span class="admin-live-chip">' +
    '<span class="admin-live-chip-dot ' + dotClass + '"></span>' +
    '<span>' + value + ' ' + label + '</span>' +
  '</span>';
}

function adminLiveSkeleton(count) {
  var html = '';
  for (var i = 0; i < count; i++) {
    html += '<div class="admin-live-skeleton">' +
      '<div class="adm-skeleton" style="height:14px;width:' + (50 + (i * 7) % 20) + '%;border-radius:4px;margin-bottom:8px"></div>' +
      '<div class="adm-skeleton" style="height:12px;width:' + (60 + (i * 11) % 25) + '%;border-radius:4px"></div>' +
    '</div>';
  }
  return html;
}

function adminFleetSkeleton(count) {
  var html = '';
  for (var i = 0; i < count; i++) {
    html += '<div class="admin-live-skeleton">' +
      '<div style="display:flex;gap:8px;align-items:center">' +
        '<div class="adm-skeleton" style="width:32px;height:32px;border-radius:50%;flex-shrink:0"></div>' +
        '<div style="flex:1">' +
          '<div class="adm-skeleton" style="height:14px;width:' + (45 + (i * 9) % 20) + '%;border-radius:4px;margin-bottom:6px"></div>' +
          '<div class="adm-skeleton" style="height:12px;width:' + (55 + (i * 13) % 25) + '%;border-radius:4px"></div>' +
        '</div>' +
      '</div>' +
    '</div>';
  }
  return html;
}

function pilotInitials(name) {
  var parts = String(name || '').trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return (parts[0] || '?').substring(0, 2).toUpperCase();
}

async function refreshAdminLiveFlights() {
  const listEl = document.getElementById('admin-live-list');
  const fleetEl = document.getElementById('admin-fleet-list');
  const metaEl = document.getElementById('admin-live-meta');
  const flightCountEl = document.getElementById('admin-live-flight-count');
  const fleetCountEl = document.getElementById('admin-live-fleet-count');
  if (!listEl) return;
  try {
    const res = await apiFetch('/api/admin/live-flights');
    const data = await res.json().catch(function () { return {}; });
    if (!res.ok) throw new Error('load failed');
    const flights = Array.isArray(data.flights) ? data.flights : [];
    const fleet = Array.isArray(data.fleet) ? data.fleet : [];
    const dispatching = Array.isArray(data.dispatching) ? data.dispatching : [];
    if (metaEl) {
      metaEl.innerHTML =
        adminLiveChip('admin-live-chip-dot--green', flights.length, flights.length === 1 ? 'flight' : 'flights') +
        adminLiveChip('admin-live-chip-dot--blue', fleet.length, fleet.length === 1 ? 'pilot GPS' : 'pilots GPS') +
        (dispatching.length ? adminLiveChip('admin-live-chip-dot--amber', dispatching.length, 'dispatching') : '');
    }
    if (flightCountEl) flightCountEl.textContent = flights.length + dispatching.length;
    if (fleetCountEl) fleetCountEl.textContent = fleet.length;
    if (!flights.length) {
      listEl.innerHTML = '<div class="adm-empty"><div class="adm-empty-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="32" height="32"><path d="M12 19V5M5 12l7-7 7 7" stroke-linecap="round" stroke-linejoin="round"/></svg></div><div class="adm-empty-title">No live flights right now</div><div class="adm-empty-sub">Dispatches will appear here as they go live.</div></div>';
    } else {
      listEl.innerHTML = flights.map(function (f) {
        var op = f.operator;
        var gps = op && op.lat != null
          ? op.lat.toFixed(4) + ', ' + op.lng.toFixed(4)
          : 'GPS pending';
        var statusDot = f.status === 'dispatching' ? 'admin-live-chip-dot--amber' : 'admin-live-chip-dot--blue';
        return (
          '<div class="admin-flight-card">' +
            '<div class="admin-flight-top">' +
              '<span class="admin-live-chip-dot ' + statusDot + '" style="margin-top:2px"></span>' +
              '<span class="admin-flight-route">' + escapeHtml(f.pickup.name) + ' → ' + escapeHtml(f.dest.name) + '</span>' +
            '</div>' +
            '<div class="admin-flight-status">' + statusBadgeHtml(f.status) + '</div>' +
            '<div class="admin-flight-meta">' +
              '<div class="admin-flight-meta-row">' +
                '<span>IRG-' + String(f.id).padStart(5, '0') + '</span>' +
                '<span>·</span>' +
                '<span>' + escapeHtml(f.customer.name) + '</span>' +
              '</div>' +
              '<div class="admin-flight-meta-row">' +
                '<span>Pilot: ' + escapeHtml(op ? op.name : 'Unassigned') + '</span>' +
                '<span class="admin-flight-time">' + gps + '</span>' +
              '</div>' +
              '<div class="admin-flight-meta-row">' +
                '<span>' + escapeHtml(f.service) + ' · ' + (f.distanceKm != null ? f.distanceKm + ' km' : '—') +
                (f.carbonSavedKg != null ? ' · CO₂ ' + f.carbonSavedKg + ' kg' : '') + '</span>' +
              '</div>' +
            '</div>' +
          '</div>'
        );
      }).join('');
    }
    if (fleetEl) {
      if (!fleet.length) {
        fleetEl.innerHTML = '<div class="adm-empty"><div class="adm-empty-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="32" height="32"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2" stroke-linecap="round" stroke-linejoin="round"/></svg></div><div class="adm-empty-title">No pilots reporting GPS</div><div class="adm-empty-sub">On-duty pilots will appear here.</div></div>';
      } else {
        fleetEl.innerHTML = fleet.map(function (p) {
          var gps = p.lat != null ? p.lat.toFixed(4) + ', ' + p.lng.toFixed(4) : '—';
          var gpsFresh = p.lat != null;
          var status = p.inTransit
            ? statusBadgeHtml(p.tripStatus || 'flying')
            : '<span class="op-status-badge op-badge--green">Available</span>';
          return (
            '<div class="admin-fleet-row">' +
              '<div class="admin-fleet-avatar">' + pilotInitials(p.name) + '</div>' +
              '<div>' +
                '<div class="admin-fleet-name">' + escapeHtml(p.name) + '</div>' +
                '<div class="admin-fleet-gps">' +
                  '<span class="admin-fleet-gps-dot ' + (gpsFresh ? 'admin-fleet-gps-fresh' : 'admin-fleet-gps-stale') + '"></span>' +
                  gps +
                '</div>' +
              '</div>' +
              '<div class="admin-fleet-status">' + status + '</div>' +
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
    listEl.innerHTML = '<div class="adm-empty"><div class="adm-empty-title">Could not load live flights</div><div class="adm-empty-sub">Check your connection and try again.</div></div>';
    if (fleetEl) fleetEl.innerHTML = '<div class="adm-empty"><div class="adm-empty-title">Could not load fleet</div><div class="adm-empty-sub">Check your connection and try again.</div></div>';
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
  var lastPhotonResults = [];
  var photonPending = false;

  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-expanded', 'false');
  input.setAttribute('aria-controls', suggestId);
  input.setAttribute('aria-autocomplete', 'list');
  dropdown.setAttribute('role', 'listbox');

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

  function showDd() {
    dropdown.style.display = 'block';
    input.setAttribute('aria-expanded', 'true');
  }

  function hideDd() {
    dropdown.style.display = 'none';
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
  }

  function wireItems(container) {
    var items = container.querySelectorAll('.loc-suggest-item');
    for (var j = 0; j < items.length; j++) {
      (function (el) {
        el.addEventListener('mousedown', function (e) {
          e.preventDefault();
          pickItem(parseInt(el.getAttribute('data-idx')));
        });
      })(items[j]);
    }
  }

  function optionId(idx) { return suggestId + '-opt-' + idx; }

  function renderDropdown(vertiports, photonResults, query) {
    activeIdx = -1;
    var q = (query || '').trim();
    currentMatches = [];

    currentMatches.push({ name: MAP_PICK_OPTION });

    vertiports.forEach(function (v) { currentMatches.push(v); });

    if (photonResults && photonResults.length) {
      currentMatches.push({ name: PHOTON_SEARCH_OPTION });
      photonResults.forEach(function (r) { currentMatches.push(r); });
    }

    var html = '';
    currentMatches.forEach(function (m, idx) {
      if (m.name === MAP_PICK_OPTION) {
        html += '<div class="loc-suggest-item loc-suggest-map" role="option" id="' + optionId(idx) + '" data-idx="' + idx + '">' +
          mapSvg + '<span class="loc-suggest-name">Choose on map</span></div>';
        if (q.length < 1) {
          html += '<div class="loc-suggest-label">Near IIT Madras</div>';
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
        html += '<div class="loc-suggest-item loc-suggest-photon" role="option" id="' + optionId(idx) + '" data-idx="' + idx + '">' +
          globeSvg +
          '<div class="loc-suggest-text"><span class="loc-suggest-name">' + highlightMatch(m.name, q) + '</span>' +
          (m.address ? '<span class="loc-suggest-addr">' + escapeHtml(m.address) + '</span>' : '') +
          '</div></div>';
      } else {
        html += '<div class="loc-suggest-item" role="option" id="' + optionId(idx) + '" data-idx="' + idx + '">' +
          pinSvg + '<span class="loc-suggest-name">' + highlightMatch(m.name, q) + '</span></div>';
      }
    });

    if (q.length >= 2 && !vertiports.length && (!photonResults || !photonResults.length) && !photonPending) {
      html += '<div class="loc-suggest-empty">No matching places</div>';
    }

    dropdown.innerHTML = html;
    showDd();
    input.removeAttribute('aria-activedescendant');
    wireItems(dropdown);
  }

  function showPhotonLoading() {
    var existing = dropdown.querySelector('.loc-suggest-photon-loading');
    if (existing) existing.remove();
    if (dropdown.style.display === 'none') return;
    var label = dropdown.querySelector('.loc-suggest-label-search');
    if (!label) {
      dropdown.insertAdjacentHTML('beforeend',
        '<div class="loc-suggest-label loc-suggest-label-search">' + searchSvg + ' Search results</div>');
    }
    var afterLabel = dropdown.querySelector('.loc-suggest-label-search');
    if (afterLabel) {
      afterLabel.insertAdjacentHTML('afterend',
        '<div class="loc-suggest-photon-loading">' +
          '<span class="lp-picker-spinner"></span> Searching...' +
        '</div>');
    }
  }

  function patchPhotonResults(results, query) {
    var q = (query || '').trim();
    var oldActiveIsPhoton = activeIdx >= 0 && currentMatches[activeIdx] && currentMatches[activeIdx].photon;

    var spliceAt = -1;
    for (var i = 0; i < currentMatches.length; i++) {
      if (currentMatches[i].name === PHOTON_SEARCH_OPTION) { spliceAt = i; break; }
    }
    if (spliceAt >= 0) currentMatches.length = spliceAt;

    if (results && results.length) {
      currentMatches.push({ name: PHOTON_SEARCH_OPTION });
      results.forEach(function (r) { currentMatches.push(r); });
    }

    var toRemove = dropdown.querySelectorAll('.loc-suggest-label-search, .loc-suggest-photon, .loc-suggest-photon-loading');
    for (var r = 0; r < toRemove.length; r++) toRemove[r].remove();

    if (results && results.length) {
      var emptyEl = dropdown.querySelector('.loc-suggest-empty');
      if (emptyEl) emptyEl.remove();
    }

    var html = '';
    if (results && results.length) {
      html += '<div class="loc-suggest-label loc-suggest-label-search">' + searchSvg + ' Search results</div>';
      for (var j = 0; j < results.length; j++) {
        var mIdx = currentMatches.length - results.length + j;
        var item = results[j];
        html += '<div class="loc-suggest-item loc-suggest-photon" role="option" id="' + optionId(mIdx) + '" data-idx="' + mIdx + '">' +
          globeSvg +
          '<div class="loc-suggest-text"><span class="loc-suggest-name">' + highlightMatch(item.name, q) + '</span>' +
          (item.address ? '<span class="loc-suggest-addr">' + escapeHtml(item.address) + '</span>' : '') +
          '</div></div>';
      }
    }

    if (html) {
      dropdown.insertAdjacentHTML('beforeend', html);
      var newItems = dropdown.querySelectorAll('.loc-suggest-photon');
      for (var k = 0; k < newItems.length; k++) {
        (function (el) {
          el.addEventListener('mousedown', function (e) {
            e.preventDefault();
            pickItem(parseInt(el.getAttribute('data-idx')));
          });
        })(newItems[k]);
      }
    }

    if (oldActiveIsPhoton) {
      activeIdx = -1;
      input.removeAttribute('aria-activedescendant');
    }
  }

  function getLocalMatches(query) {
    var q = (query || '').trim();
    var names = Object.keys(demoLocations);
    var scored = [];
    if (q.length < 1) {
      // No query yet: surface the vertiports closest to IIT Madras so opening
      // the destination (or pickup) field shows locations near IITM by default.
      scored = names.map(function (n) {
        var c = demoLocations[n];
        return { name: n, dist: haversineKmClient(IITM_COORD[0], IITM_COORD[1], c[0], c[1]) };
      });
      scored.sort(function (a, b) { return a.dist - b.dist; });
      scored = scored.slice(0, 6).map(function (o) { return { name: o.name, score: 0 }; });
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
    lastPhotonResults = [];

    if (photonTimer) clearTimeout(photonTimer);
    if (photonAbort) { photonAbort.abort(); photonAbort = null; }

    photonPending = true;
    photonTimer = setTimeout(function () {
      showPhotonLoading();
      var center = map ? map.getCenter() : { lat: 20.5937, lng: 78.9629 };
      var controller = new AbortController();
      photonAbort = controller;

      var url = 'https://photon.komoot.io/api/?q=' + encodeURIComponent(q) +
        '&lat=' + center.lat + '&lon=' + center.lng + '&limit=5&lang=en';

      fetch(url, { signal: controller.signal })
        .then(function (res) { return res.json(); })
        .then(function (data) {
          photonAbort = null;
          photonPending = false;
          if (input.value.trim() !== q) return;

          var results = [];
          if (data.features && data.features.length) {
            results = data.features.map(function (feat) {
              var props = feat.properties;
              var name = props.name || props.street || 'Unknown';
              var addrParts = [props.street, props.city || props.town, props.state, props.country].filter(Boolean);
              var address = addrParts.join(', ');
              var coords = feat.geometry.coordinates;
              return { name: name, address: address, coord: [coords[1], coords[0]], photon: true };
            });
          }

          lastPhotonResults = results;
          patchPhotonResults(results, q);
        })
        .catch(function () {
          photonAbort = null;
          photonPending = false;
          var loadingEl = dropdown.querySelector('.loc-suggest-photon-loading');
          if (loadingEl) loadingEl.remove();
        });
    }, 350);
  }

  function render(query) {
    var q = (query || '').trim();
    var localMatches = getLocalMatches(q);
    var cachedPhoton = (q === lastPhotonQuery && lastPhotonResults.length) ? lastPhotonResults : [];
    photonPending = (q.length >= 2 && !cachedPhoton.length);
    renderDropdown(localMatches, cachedPhoton, q);

    if (q.length >= 2) {
      searchPhoton(q);
    }
  }

  function pickItem(idx) {
    if (idx < 0 || idx >= currentMatches.length) return;
    var match = currentMatches[idx];
    if (match.name === MAP_PICK_OPTION) { hideDd(); currentMatches = []; startMapPick(target); return; }
    if (match.name === PHOTON_SEARCH_OPTION) return;

    hideDd();
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
    for (var i = 0; i < items.length; i++) {
      items[i].classList.remove('active');
      items[i].removeAttribute('aria-selected');
    }
    activeIdx = idx;
    if (idx >= 0 && idx < items.length) {
      items[idx].classList.add('active');
      items[idx].setAttribute('aria-selected', 'true');
      items[idx].scrollIntoView({ block: 'nearest' });
      input.setAttribute('aria-activedescendant', items[idx].id);
    } else {
      input.removeAttribute('aria-activedescendant');
    }
  }

  input.addEventListener('input', function () { render(this.value); });
  input.addEventListener('focus', function () {
    render(this.value);
  });
  input.addEventListener('blur', function () {
    setTimeout(function () { hideDd(); }, 150);
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
      hideDd();
    }
  });
}

// ── Landing Point Picker (Overpass API) ──
var landingZoneLayers = [];
var landingZoneCache = new Map();
var landingZoneFetchAbort = null;
var pendingLandingPick = null;
var _currentLandingZones = [];

var LZ_ICONS = {
  helipad: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><path d="M8 8v8m8-8v8m-8-4h8"/></svg>',
  park: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 22v-6m0 0c-3 0-5-2.2-5-5s2-5 5-5 5 2.2 5 5-2 5-5 5z"/></svg>',
  pitch: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><path d="M4 22v-7"/></svg>',
  parking: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M9 17V7h4a3 3 0 0 1 0 6H9"/></svg>',
  ground: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="5" r="3"/><path d="M3 17l4-4 3 3 4-4 4 4"/><path d="M3 21h18"/></svg>',
  rooftop: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 21h18"/><path d="M5 21V7l7-4 7 4v14"/><path d="M9 21v-6h6v6"/></svg>',
};

var LANDING_ZONE_CATEGORIES = {
  helipad:    { label: 'Helipad',       cssClass: 'lp-cat-helipad',  priority: 1 },
  park:       { label: 'Park / Garden', cssClass: 'lp-cat-park',     priority: 2 },
  pitch:      { label: 'Sports Field',  cssClass: 'lp-cat-pitch',    priority: 3 },
  parking:    { label: 'Parking Lot',   cssClass: 'lp-cat-parking',  priority: 4 },
  ground:     { label: 'Open Ground',   cssClass: 'lp-cat-ground',   priority: 5 },
  rooftop:    { label: 'Rooftop',       cssClass: 'lp-cat-rooftop',  priority: 6 },
};

function classifyOsmElement(tags) {
  if (!tags) return null;
  if (tags.aeroway === 'helipad') return 'helipad';
  if (tags.leisure === 'pitch' || tags.leisure === 'recreation_ground') return 'pitch';
  if (tags.leisure === 'park' || tags.leisure === 'garden' || tags.leisure === 'playground' || tags.leisure === 'common') return 'park';
  if (tags.amenity === 'parking' && tags.parking !== 'underground' && tags.parking !== 'multi-storey') return 'parking';
  if (tags.landuse === 'grass' || tags.landuse === 'meadow' || tags.landuse === 'village_green' ||
      tags.landuse === 'recreation_ground' || tags.landuse === 'brownfield' || tags.landuse === 'greenfield' ||
      tags.natural === 'grassland' || tags.natural === 'heath' || tags.natural === 'sand') return 'ground';
  if (tags.building === 'hospital' || tags.building === 'commercial' || tags.building === 'retail' ||
      tags.building === 'industrial' || tags.building === 'warehouse' || tags.building === 'civic' ||
      tags.building === 'stadium' || tags.building === 'university' || tags.building === 'office' ||
      tags.building === 'public') return 'rooftop';
  return null;
}

function getElementCenter(el) {
  if (el.center) return [el.center.lat, el.center.lon];
  if (el.lat != null && el.lon != null) return [el.lat, el.lon];
  if (el.bounds) return [(el.bounds.minlat + el.bounds.maxlat) / 2, (el.bounds.minlon + el.bounds.maxlon) / 2];
  if (el.geometry && el.geometry.length) {
    var sumLat = 0, sumLon = 0;
    el.geometry.forEach(function (p) { sumLat += p.lat; sumLon += p.lon; });
    return [sumLat / el.geometry.length, sumLon / el.geometry.length];
  }
  return null;
}

function getElementName(el) {
  if (!el.tags) return '';
  return el.tags.name || el.tags['name:en'] || el.tags.description || '';
}

function estimateArea(el) {
  if (!el.geometry || el.geometry.length < 3) return 0;
  var coords = el.geometry;
  var area = 0;
  for (var i = 0, j = coords.length - 1; i < coords.length; j = i++) {
    area += (coords[j].lon + coords[i].lon) * (coords[j].lat - coords[i].lat);
  }
  area = Math.abs(area) / 2;
  var midLat = coords[0].lat * Math.PI / 180;
  return area * (111320 * Math.cos(midLat)) * 111320;
}

function buildOverpassQuery(lat, lon, radius) {
  return '[out:json][timeout:25];(' +
    'node["aeroway"="helipad"](around:' + radius + ',' + lat + ',' + lon + ');' +
    'way["aeroway"="helipad"](around:' + radius + ',' + lat + ',' + lon + ');' +
    'way["leisure"~"park|garden|playground|pitch|recreation_ground|common"](around:' + radius + ',' + lat + ',' + lon + ');' +
    'relation["leisure"~"park|garden|playground|pitch|recreation_ground|common"](around:' + radius + ',' + lat + ',' + lon + ');' +
    'way["landuse"~"grass|meadow|village_green|brownfield|greenfield|recreation_ground"](around:' + radius + ',' + lat + ',' + lon + ');' +
    'way["natural"~"grassland|heath|sand"](around:' + radius + ',' + lat + ',' + lon + ');' +
    'way["amenity"="parking"]["parking"!~"underground|multi-storey"](around:' + radius + ',' + lat + ',' + lon + ');' +
    'way["building"~"hospital|commercial|retail|industrial|warehouse|civic|stadium|university|office|public"](around:' + radius + ',' + lat + ',' + lon + ');' +
    ');out center body geom;';
}

function clearLandingZones() {
  landingZoneLayers.forEach(function (layer) { if (map) map.removeLayer(layer); });
  landingZoneLayers = [];
}

function hideLandingPicker() {
  var picker = document.getElementById('landing-point-picker');
  if (picker) picker.hidden = true;
  clearLandingZones();
  if (landingZoneFetchAbort) { landingZoneFetchAbort.abort(); landingZoneFetchAbort = null; }
  pendingLandingPick = null;
  _currentLandingZones = [];
}

function skipLandingPick() {
  hideLandingPicker();
}

function selectLandingPoint(lat, lon, name, target) {
  hideLandingPicker();
  if (target === 'pickup') {
    pickupCoord = [lat, lon];
    document.getElementById('pickup-input').value = name;
    document.getElementById('pickup-input').classList.add('has-value');
    if (pickupMarker) map.removeLayer(pickupMarker);
    pickupMarker = createMarker(pickupCoord, 'pickup').addTo(map);
    map.setView(pickupCoord, 16);
  } else {
    destCoord = [lat, lon];
    document.getElementById('dest-input').value = name;
    document.getElementById('dest-input').classList.add('has-value');
    if (destMarker) map.removeLayer(destMarker);
    destMarker = createMarker(destCoord, 'dest').addTo(map);
    map.setView(destCoord, 16);
  }
  captureBookingDraft();
  if (pickupCoord && destCoord) {
    drawRoute();
    refreshNearbyTaxis();
  }
}

async function showLandingPicker(lat, lon, target, locationName) {
  if (!map) return;

  var panelLoc = document.getElementById('panel-locations');
  if (panelLoc && (panelLoc.hidden || panelLoc.style.display === 'none')) return;

  // Don't scan landing points for a route outside the eVTOL range: the
  // out-of-range message already covers it, and setDest/setPickup would
  // otherwise re-open this "Scanning..." spinner after searchRides ran.
  var env = (typeof currentRouteEnvelope === 'function') ? currentRouteEnvelope() : null;
  if (env && !env.withinRange) { hideLandingPicker(); return; }

  pendingLandingPick = { target: target, origCoord: [lat, lon], origName: locationName };

  var picker = document.getElementById('landing-point-picker');
  var loading = document.getElementById('lp-picker-loading');
  var list = document.getElementById('lp-picker-list');
  var empty = document.getElementById('lp-picker-empty');
  var label = document.getElementById('lp-picker-label');

  if (!picker) return;
  label.textContent = target === 'pickup'
    ? 'Choose landing point near your pickup'
    : 'Choose landing point near destination';
  picker.hidden = false;
  loading.hidden = false;
  list.innerHTML = '';
  list.hidden = true;
  empty.hidden = true;
  empty.textContent = 'No landing points found nearby. Using selected location.';

  var cacheKey = lat.toFixed(3) + ',' + lon.toFixed(3);
  var zones;

  if (landingZoneCache.has(cacheKey)) {
    zones = landingZoneCache.get(cacheKey);
  } else {
    if (landingZoneFetchAbort) { landingZoneFetchAbort.abort(); landingZoneFetchAbort = null; }
    var controller = new AbortController();
    landingZoneFetchAbort = controller;
    var query = buildOverpassQuery(lat, lon, 2000);

    try {
      var res = await fetch('https://overpass-api.de/api/interpreter', {
        method: 'POST',
        body: 'data=' + encodeURIComponent(query),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        signal: controller.signal,
      });
      var data = await res.json();
      landingZoneFetchAbort = null;

      zones = [];
      if (data.elements && data.elements.length) {
        data.elements.forEach(function (el) {
          var cat = classifyOsmElement(el.tags);
          if (!cat) return;
          var center = getElementCenter(el);
          if (!center) return;
          var name = getElementName(el);
          var area = estimateArea(el);
          var catInfo = LANDING_ZONE_CATEGORIES[cat];
          if (cat === 'rooftop' && area < 500) return;
          if (cat !== 'helipad' && cat !== 'rooftop' && area < 200) return;
          zones.push({
            cat: cat,
            name: name || catInfo.label,
            center: center,
            area: area,
            priority: catInfo.priority,
            geometry: el.geometry,
          });
        });
      }

      zones.sort(function (a, b) {
        if (a.priority !== b.priority) return a.priority - b.priority;
        var distA = haversineKmClient(lat, lon, a.center[0], a.center[1]);
        var distB = haversineKmClient(lat, lon, b.center[0], b.center[1]);
        return distA - distB;
      });

      var seen = new Set();
      zones = zones.filter(function (z) {
        var key = z.center[0].toFixed(4) + ',' + z.center[1].toFixed(4);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      if (zones.length > 15) zones = zones.slice(0, 15);

      if (landingZoneCache.size > 20) {
        var oldest = landingZoneCache.keys().next().value;
        landingZoneCache.delete(oldest);
      }
      landingZoneCache.set(cacheKey, zones);

    } catch (e) {
      landingZoneFetchAbort = null;
      if (e.name === 'AbortError') return;
      loading.hidden = true;
      empty.textContent = 'Could not scan landing points. Using selected location.';
      empty.hidden = false;
      return;
    }
  }

  loading.hidden = true;

  // The pick may have been superseded while the Overpass request was in flight:
  // hideLandingPicker() (called by searchRides / resetBooking) nulls
  // pendingLandingPick, so bail rather than crash reading its origCoord.
  if (!pendingLandingPick) return;

  if (!zones.length) {
    empty.hidden = false;
    return;
  }

  _currentLandingZones = zones;
  clearLandingZones();
  var bounds = [[lat, lon]];

  zones.forEach(function (z, idx) {
    var catInfo = LANDING_ZONE_CATEGORIES[z.cat];
    var iconHtml =
      '<div class="lz-marker ' + catInfo.cssClass + '">' +
        '<span class="lz-marker-icon">' + LZ_ICONS[z.cat] + '</span>' +
      '</div>';
    var marker = L.marker(z.center, {
      icon: L.divIcon({
        html: iconHtml, className: 'lz-marker-wrap ' + catInfo.cssClass,
        iconSize: [28, 28], iconAnchor: [14, 14],
      }),
    }).addTo(map);
    marker.on('click', function () {
      selectLandingPoint(z.center[0], z.center[1], z.name, target);
    });
    landingZoneLayers.push(marker);
    bounds.push(z.center);
  });

  if (bounds.length > 1) {
    programmaticMapMove = true;
    map.fitBounds(L.latLngBounds(bounds).pad(0.15));
    setTimeout(function () { programmaticMapMove = false; }, 400);
  }

  list.innerHTML = zones.map(function (z, idx) {
    var catInfo = LANDING_ZONE_CATEGORIES[z.cat];
    var dist = haversineKmClient(lat, lon, z.center[0], z.center[1]);
    var distLabel = dist < 1 ? Math.round(dist * 1000) + ' m away' : dist.toFixed(1) + ' km away';
    var areaLabel = z.area > 0 ? (z.area > 10000 ? (z.area / 10000).toFixed(1) + ' ha' : Math.round(z.area) + ' m²') : '';

    return '<button type="button" class="lp-item" data-idx="' + idx + '">' +
      '<div class="lp-item-icon ' + catInfo.cssClass + '">' + LZ_ICONS[z.cat] + '</div>' +
      '<div class="lp-item-info">' +
        '<div class="lp-item-name">' + escapeHtml(z.name) + '</div>' +
        '<div class="lp-item-meta">' +
          '<span class="lp-item-cat ' + catInfo.cssClass + '">' + catInfo.label + '</span>' +
          '<span class="lp-item-dot">·</span>' +
          '<span>' + distLabel + '</span>' +
          (areaLabel ? '<span class="lp-item-dot">·</span><span>' + areaLabel + '</span>' : '') +
        '</div>' +
      '</div>' +
      '<svg class="lp-item-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>' +
    '</button>';
  }).join('');
  list.hidden = false;

  var items = list.querySelectorAll('.lp-item');
  items.forEach(function (el, i) {
    el.addEventListener('click', function () {
      selectLandingPoint(zones[i].center[0], zones[i].center[1], zones[i].name, target);
    });
    el.addEventListener('mouseenter', function () {
      if (landingZoneLayers[i]) {
        landingZoneLayers[i].setZIndexOffset(500);
      }
    });
    el.addEventListener('mouseleave', function () {
      if (landingZoneLayers[i]) {
        landingZoneLayers[i].setZIndexOffset(0);
      }
    });
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

function setPickup(latlng, name, suppress) {
  pickupCoord = Array.isArray(latlng) ? latlng : [latlng.lat, latlng.lng];
  document.getElementById('pickup-input').value = name;
  document.getElementById('pickup-input').classList.add('has-value');
  if (pickupMarker) map.removeLayer(pickupMarker);
  pickupMarker = createMarker(pickupCoord, 'pickup').addTo(map);
  if (pickupCoord && destCoord) drawRoute();
  else map.setView(pickupCoord, 15);
  captureBookingDraft();
  refreshNearbyTaxis();
  updateRefineChips();
  if (!suppress) showLandingPicker(pickupCoord[0], pickupCoord[1], 'pickup', name);
}

function setDest(latlng, name, suppress) {
  destCoord = Array.isArray(latlng) ? latlng : [latlng.lat, latlng.lng];
  document.getElementById('dest-input').value = name;
  document.getElementById('dest-input').classList.add('has-value');
  if (destMarker) map.removeLayer(destMarker);
  destMarker = createMarker(destCoord, 'dest').addTo(map);
  if (pickupCoord && destCoord) drawRoute();
  else map.setView(destCoord, 15);
  captureBookingDraft();
  if (pickupCoord && destCoord) refreshNearbyTaxis();
  updateRefineChips();
  if (!suppress) showLandingPicker(destCoord[0], destCoord[1], 'dest', name);
}

function updateRefineChips() {
  var container = document.getElementById('panel-locations');
  if (!container) return;
  var row = document.getElementById('lp-refine-row');
  if (!row) {
    row = document.createElement('div');
    row.id = 'lp-refine-row';
    row.className = 'lp-refine-row';
    var picker = document.getElementById('landing-point-picker');
    if (picker) container.insertBefore(row, picker);
    else container.appendChild(row);
  }
  var html = '';
  if (pickupCoord) {
    html += '<button type="button" class="lp-refine-chip" id="lp-refine-pickup">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12">' +
      '<path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/></svg>' +
      ' Refine pickup spot</button>';
  }
  if (destCoord) {
    html += '<button type="button" class="lp-refine-chip" id="lp-refine-dest">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12">' +
      '<path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/></svg>' +
      ' Refine destination spot</button>';
  }
  row.innerHTML = html;
  row.hidden = !html;
  var pickupBtn = document.getElementById('lp-refine-pickup');
  if (pickupBtn) {
    pickupBtn.addEventListener('click', function () {
      showLandingPicker(pickupCoord[0], pickupCoord[1], 'pickup', document.getElementById('pickup-input').value);
    });
  }
  var destBtn = document.getElementById('lp-refine-dest');
  if (destBtn) {
    destBtn.addEventListener('click', function () {
      showLandingPicker(destCoord[0], destCoord[1], 'dest', document.getElementById('dest-input').value);
    });
  }
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
    showToast('Geolocation is not supported by your browser', 'error');
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
      document.getElementById('pickup-input').classList.add('gps-filled');
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

