/* IraGo PAN-India sectors. Target air time at 250 km/h cruise. */
(function (root) {
  var AIR_KMH = 250;
  var CITIES = {
    Delhi: [28.6139, 77.209],
    Agra: [27.1767, 78.0081],
    Chandigarh: [30.7333, 76.7794],
    Mandi: [31.7086, 76.9319],
    Kullu: [31.9579, 77.1095],
    Shimla: [31.1048, 77.1734],
    Solan: [30.9045, 77.0967],
    Manali: [32.2432, 77.1892],
    Dharamshala: [32.219, 76.3234],
    Jaipur: [26.9124, 75.7873],
    Udaipur: [24.5854, 73.7125],
    Kolhapur: [16.705, 74.2433],
    Mumbai: [19.076, 72.8777],
    Pune: [18.5204, 73.8567],
    Nagpur: [21.1458, 79.0882],
    Jalandhar: [31.326, 75.5762],
    Jammu: [32.7266, 74.8571],
    Amritsar: [31.634, 74.8723],
    Gwalior: [26.2183, 78.1828],
    Lucknow: [26.8467, 80.9462],
    Ayodhya: [26.799, 82.204],
    Haridwar: [29.9457, 78.1642],
    Ludhiana: [30.901, 75.8573],
    Surat: [21.1702, 72.8311],
    Ahmedabad: [23.0225, 72.5714],
    Gandhinagar: [23.2156, 72.6369],
    Hyderabad: [17.385, 78.4867],
    Chennai: [13.0827, 80.2707],
    Kochi: [9.9312, 76.2673],
    Bengaluru: [12.9716, 77.5946],
    Mysuru: [12.2958, 76.6394],
    Bhopal: [23.2599, 77.4126],
    Indore: [22.7196, 75.8577],
    Visakhapatnam: [17.6868, 83.2185],
    "Chennai CBD": [13.0827, 80.2707],
    "Chennai Airport": [12.9941, 80.1709],
    "OMR IT Corridor": [12.8996, 80.2289],
    Mahabalipuram: [12.6208, 80.1945],
    "Bengaluru Airport": [13.1986, 77.7066],
    "Electronic City": [12.839, 77.677],
    "Mandi Town": [31.7082, 76.9315],
    "IIT Mandi North Campus": [31.7759, 76.986],
    "IIT Mandi South Campus": [31.7685, 76.9938],
  };

  var HILL = {
    Mandi: 1, Kullu: 1, Shimla: 1, Solan: 1, Manali: 1, Dharamshala: 1, Jammu: 1,
    "Mandi Town": 1, "IIT Mandi North Campus": 1, "IIT Mandi South Campus": 1,
  };

  var PAIRS = [
    ["Delhi", "Agra", "north"],
    ["Chandigarh", "Mandi", "himalaya"],
    ["Chandigarh", "Kullu", "himalaya"],
    ["Chandigarh", "Shimla", "himalaya"],
    ["Solan", "Chandigarh", "himalaya"],
    ["Shimla", "Manali", "himalaya"],
    ["Shimla", "Dharamshala", "himalaya"],
    ["Dharamshala", "Chandigarh", "himalaya"],
    ["Jaipur", "Udaipur", "west"],
    ["Kolhapur", "Mumbai", "west"],
    ["Mumbai", "Pune", "west"],
    ["Pune", "Nagpur", "west"],
    ["Jalandhar", "Delhi", "north"],
    ["Jammu", "Chandigarh", "himalaya"],
    ["Amritsar", "Chandigarh", "north"],
    ["Gwalior", "Delhi", "north"],
    ["Delhi", "Lucknow", "north"],
    ["Delhi", "Ayodhya", "north"],
    ["Delhi", "Haridwar", "north"],
    ["Delhi", "Ludhiana", "north"],
    ["Surat", "Ahmedabad", "west"],
    ["Surat", "Gandhinagar", "west"],
    ["Hyderabad", "Chennai", "south"],
    ["Chennai", "Kochi", "south"],
    ["Bengaluru", "Mysuru", "south"],
    ["Bengaluru", "Chennai", "south"],
    ["Bhopal", "Delhi", "north"],
    ["Indore", "Mumbai", "west"],
    ["Indore", "Delhi", "north"],
    ["Visakhapatnam", "Hyderabad", "south"],
    ["Chennai CBD", "OMR IT Corridor", "south"],
    ["Chennai Airport", "Mahabalipuram", "south"],
    ["Bengaluru Airport", "Electronic City", "south"],
    ["Mandi Town", "IIT Mandi North Campus", "drone"],
    ["Mandi Town", "IIT Mandi South Campus", "drone"],
  ];

  var CAMPUS_PADS = [
    ["Mandi Town", "IIT Mandi"],
    ["IIT Mandi North Campus", "IIT Mandi"],
    ["IIT Mandi South Campus", "IIT Mandi"],
    ["IIT Madras Main Gate", "IIT Madras"],
    ["Taramani Gate", "IIT Madras"],
    ["Gajendra Circle", "IIT Madras"],
    ["Central Library", "IIT Madras"],
    ["Himalaya Mess", "IIT Madras"],
    ["CRC / Academic Complex", "IIT Madras"],
    ["SAC", "IIT Madras"],
    ["Hostel Zone", "IIT Madras"],
    ["NAC-2 / MInT", "IIT Madras"],
    ["Department of Aerospace", "IIT Madras"],
  ];

  function hav(a, b) {
    var R = 6371;
    var p1 = (a[0] * Math.PI) / 180;
    var p2 = (b[0] * Math.PI) / 180;
    var dLat = ((b[0] - a[0]) * Math.PI) / 180;
    var dLng = ((b[1] - a[1]) * Math.PI) / 180;
    var x = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(p1) * Math.cos(p2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * R * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  }

  function fmtMin(m) {
    m = Math.max(1, Math.round(m));
    if (m < 60) return m + " min";
    var h = Math.floor(m / 60);
    var r = m % 60;
    return r ? h + " h " + r + " m" : h + " h";
  }

  var SECTORS = PAIRS.map(function (p) {
    var from = p[0];
    var to = p[1];
    var region = p[2];
    var a = CITIES[from];
    var b = CITIES[to];
    var km = a && b ? hav(a, b) : 0;
    var air = (km / AIR_KMH) * 60;
    var hill = HILL[from] || HILL[to];
    var road = (km / (hill ? 32 : 50)) * 60;
    return {
      from: from,
      to: to,
      region: region,
      drone: region === "drone",
      km: Math.round(km),
      airMin: air,
      airLabel: fmtMin(air),
      roadLabel: fmtMin(road),
      under2h: air <= 120,
    };
  });

  var FLIGHT_CITIES = Object.keys(CITIES).filter(function (n) {
    return n.indexOf("IIT Mandi") === -1 && n !== "Mandi Town";
  }).sort();

  function optionHtml(names, selected) {
    return names.map(function (n) {
      return '<option value="' + n.replace(/"/g, "") + '"' + (n === selected ? " selected" : "") + ">" + n + "</option>";
    }).join("");
  }

  function fillBookingCities() {
    var fromSel = document.getElementById("fromSel");
    var toSel = document.getElementById("toSel");
    if (!fromSel || !toSel) return;
    fromSel.innerHTML = optionHtml(FLIGHT_CITIES, "Chandigarh");
    toSel.innerHTML = optionHtml(FLIGHT_CITIES, "Mandi");
  }

  function campusHtml(selected) {
    var groups = {};
    CAMPUS_PADS.forEach(function (p) {
      groups[p[1]] = groups[p[1]] || [];
      groups[p[1]].push(p[0]);
    });
    return Object.keys(groups).map(function (label) {
      return '<optgroup label="' + label + '">' + optionHtml(groups[label], selected) + "</optgroup>";
    }).join("");
  }

  var map;
  var layer;
  var activeChip = "all";
  var query = "";

  function filtered() {
    var q = query.trim().toLowerCase();
    return SECTORS.filter(function (s) {
      if (activeChip !== "all" && s.region !== activeChip) return false;
      if (!q) return true;
      return (s.from + " " + s.to).toLowerCase().indexOf(q) !== -1;
    });
  }

  function cardHtml(s, i) {
    return '<button type="button" class="route-card sector-card" data-i="' + i + '" style="color:inherit;text-decoration:none;text-align:left;cursor:pointer;width:100%;font:inherit">' +
      '<div class="route-from-to">' +
        '<div><span class="route-dot"></span><div class="route-city">' + s.from + "</div></div>" +
        '<div class="route-line"></div>' +
        '<div style="text-align:right"><span class="route-dot"></span><div class="route-city">' + s.to + "</div></div>" +
      "</div>" +
      '<div class="route-stats">' +
        '<div><div class="route-stat-big">' + s.airLabel + '</div><div class="route-stat-sm">by air</div></div>' +
        '<div style="text-align:right"><div class="route-stat-big">' + s.km + ' km</div><div class="route-stat-sm">' + s.roadLabel + " by road</div></div>" +
      "</div></button>";
  }

  function paintMap(list) {
    if (!map || typeof L === "undefined") return;
    if (!layer) layer = L.layerGroup().addTo(map);
    layer.clearLayers();
    var bounds = [];
    list.forEach(function (s) {
      var a = CITIES[s.from];
      var b = CITIES[s.to];
      if (!a || !b) return;
      bounds.push(a, b);
      var color = s.drone ? "#eb6110" : "#007ae5";
      L.polyline([a, b], { color: color, weight: 2.5, opacity: 0.85 }).addTo(layer);
      L.circleMarker(a, { radius: 4, color: color, fillColor: "#fff", fillOpacity: 1, weight: 2 }).addTo(layer);
      L.circleMarker(b, { radius: 4, color: color, fillColor: "#fff", fillOpacity: 1, weight: 2 }).addTo(layer);
    });
    if (bounds.length) {
      var droneOnly = list.length && list.every(function (s) { return s.drone; });
      map.fitBounds(bounds, { padding: [28, 28], maxZoom: droneOnly ? 13 : 7 });
    } else {
      map.setView([22.5, 79], 5);
    }
  }

  function render() {
    var list = filtered();
    var grid = document.getElementById("sector-grid");
    var meta = document.getElementById("sector-meta");
    if (grid) {
      grid.innerHTML = list.map(cardHtml).join("") || '<p class="section-body">No hop matches that search.</p>';
    }
    if (meta) {
      meta.textContent = list.length + " sectors";
    }
    paintMap(list);
  }

  function applySector(s) {
    var modeSel = document.getElementById("modeSel");
    var fromSel = document.getElementById("fromSel");
    var toSel = document.getElementById("toSel");
    if (!fromSel || !toSel) return;
    if (s.drone) {
      if (modeSel) {
        modeSel.value = "drones";
        modeSel.dispatchEvent(new Event("change"));
      }
      fromSel.value = s.from;
      toSel.value = s.to;
    } else {
      if (modeSel && modeSel.value === "drones") {
        modeSel.value = "air-taxi";
        modeSel.dispatchEvent(new Event("change"));
      }
      fromSel.value = s.from;
      toSel.value = s.to;
    }
  }

  function mount() {
    var region = document.getElementById("sector-region");
    var q = document.getElementById("sector-q");
    var grid = document.getElementById("sector-grid");
    if (region) {
      region.addEventListener("change", function () {
        activeChip = region.value || "all";
        render();
      });
    }
    if (q) {
      q.addEventListener("input", function () {
        query = q.value;
        render();
      });
    }
    if (grid) {
      grid.addEventListener("click", function (e) {
        var btn = e.target.closest("[data-i]");
        if (!btn) return;
        var s = filtered()[Number(btn.getAttribute("data-i"))];
        if (s) applySector(s);
      });
    }
    var el = document.getElementById("sector-map");
    if (el && typeof L !== "undefined") {
      map = L.map(el, {
        zoomControl: false,
        attributionControl: false,
        scrollWheelZoom: false,
        dragging: false,
        tap: false,
        doubleClickZoom: false,
        boxZoom: false,
        keyboard: false,
        touchZoom: false,
      }).setView([22.5, 79], 5);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 12,
      }).addTo(map);
      setTimeout(function () { map.invalidateSize(); }, 200);
    }
    render();
  }

  root.IRAGO_SECTORS = {
    cities: CITIES,
    sectors: SECTORS,
    campusPads: CAMPUS_PADS,
    fillBookingCities: fillBookingCities,
    campusHtml: campusHtml,
    mount: mount,
    applySector: applySector,
  };
})(window);
