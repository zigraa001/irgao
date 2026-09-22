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
    "IIT Mandi North Campus": [31.78129, 76.99751],
    "IIT Mandi South Campus": [31.77314, 76.9843],
    "Alder Mess": [31.78138, 76.99998],
    "A19 Block": [31.7813, 77.00008],
    "North Campus Library": [31.78086, 76.99832],
    "A18 Block": [31.78093, 76.99929],
    "A17 Block": [31.78118, 76.99931],
    "A14 Block": [31.78057, 76.99773],
    "A13 Block": [31.78074, 76.99774],
    "Tulsi Mess": [31.78053, 76.9967],
    "Tragopan Canteen": [31.78053, 76.99682],
    "A11 Block": [31.78015, 76.99622],
    "A10 Block": [31.78036, 76.99599],
    "A9 Block": [31.77995, 76.99506],
    "Peepal Mess": [31.78224, 77.00054],
    "Gym": [31.78232, 77.00081],
    "B28 Hostel": [31.78151, 76.99985],
    "B24 Hostel": [31.78205, 76.99995],
    "B26 Hostel": [31.78179, 77.00019],
    "B25 Hostel": [31.78159, 76.99966],
    "B17 Hostel": [31.78189, 76.99937],
    "B10 Hostel": [31.78144, 76.99895],
    "Oak Mess": [31.78177, 76.99891],
    "Monal Canteen": [31.78188, 76.99902],
    "B9 Hostel": [31.78178, 76.9984],
    "B8 Hostel": [31.78174, 76.99789],
    "B12 Hostel": [31.78128, 76.99836],
    "B11 Hostel": [31.78145, 76.99799],
    "B18 Hostel": [31.781, 76.9977],
    "B15 Hostel": [31.78084, 76.99705],
    "B19 Hostel": [31.78121, 76.99727],
    "B16 Hostel": [31.78159, 76.99673],
    "Pine Mess": [31.78089, 76.99654],
    "Drongo Canteen": [31.78099, 76.99654],
    "B23 Hostel": [31.78118, 76.99656],
    "B14 Hostel": [31.78073, 76.99614],
    "B21 Hostel": [31.78102, 76.99585],
    "B13 Hostel": [31.78074, 76.99551],
    "B20 Hostel": [31.78147, 76.99621],
    "B22 Hostel": [31.78111, 76.99554],
    "Sports Complex": [31.78075, 76.99487],
    "Health Centre": [31.7805, 76.9944],
    "Fountain Area": [31.78051, 76.9937],
    "Village Square": [31.78108, 76.99445],
    "Auditorium Complex": [31.78092, 76.99418],
    "C V Raman Guest House": [31.7815, 76.99429],
    "Faculty Quarters": [31.78261, 76.9979],
    "STAC Gravity": [31.78133, 76.9942],
    "Mind Tree School": [31.78376, 77.00225],
    "A1 Block": [31.77524, 76.98542],
    "A3 Block": [31.77501, 76.98514],
    "AMRC Block A2": [31.77506, 76.98575],
    "B1 Hostel": [31.77258, 76.98408],
    "B2 Hostel": [31.77227, 76.98404],
    "B3 Hostel": [31.772, 76.98402],
    "B4 Hostel": [31.77229, 76.9844],
    "Parashar Hostel (B6)": [31.77175, 76.98324],
    "C-1 Faculty Block": [31.77243, 76.98496],
    "Chandrataal Annexe": [31.77311, 76.98549],
    "Cedar Mess": [31.77329, 76.98505],
    "South Campus Medical Unit": [31.77329, 76.98569],
    "South Gate Canteen": [31.77545, 76.9863],
    "Kamand Hospital": [31.77673, 76.98742],
  };

  var HILL = {
    Mandi: 1, Kullu: 1, Shimla: 1, Solan: 1, Manali: 1, Dharamshala: 1, Jammu: 1,
    "Mandi Town": 1, "IIT Mandi North Campus": 1, "IIT Mandi South Campus": 1,
    "Alder Mess": 1, "A19 Block": 1, "North Campus Library": 1, "A18 Block": 1,
    "A17 Block": 1, "A14 Block": 1, "A13 Block": 1, "Tulsi Mess": 1, "Tragopan Canteen": 1,
    "A11 Block": 1, "A10 Block": 1, "A9 Block": 1, "Peepal Mess": 1, "Gym": 1,
    "B28 Hostel": 1, "B24 Hostel": 1, "B26 Hostel": 1, "B25 Hostel": 1, "B17 Hostel": 1,
    "B10 Hostel": 1, "Oak Mess": 1, "Monal Canteen": 1, "B9 Hostel": 1, "B8 Hostel": 1,
    "B12 Hostel": 1, "B11 Hostel": 1, "B18 Hostel": 1, "B15 Hostel": 1, "B19 Hostel": 1,
    "B16 Hostel": 1, "Pine Mess": 1, "Drongo Canteen": 1, "B23 Hostel": 1, "B14 Hostel": 1,
    "B21 Hostel": 1, "B13 Hostel": 1, "B20 Hostel": 1, "B22 Hostel": 1, "Sports Complex": 1,
    "Health Centre": 1, "Fountain Area": 1, "Village Square": 1, "Auditorium Complex": 1,
    "C V Raman Guest House": 1, "Faculty Quarters": 1, "STAC Gravity": 1, "Mind Tree School": 1,
    "A1 Block": 1, "A3 Block": 1,
    "AMRC Block A2": 1, "B1 Hostel": 1, "B2 Hostel": 1, "B3 Hostel": 1, "B4 Hostel": 1,
    "Parashar Hostel (B6)": 1, "C-1 Faculty Block": 1, "Chandrataal Annexe": 1,
    "Cedar Mess": 1, "South Campus Medical Unit": 1, "South Gate Canteen": 1,
    "Kamand Hospital": 1,
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
    ["Alder Mess", "IIT Mandi"],
    ["A19 Block", "IIT Mandi"],
    ["North Campus Library", "IIT Mandi"],
    ["A18 Block", "IIT Mandi"],
    ["A17 Block", "IIT Mandi"],
    ["A14 Block", "IIT Mandi"],
    ["A13 Block", "IIT Mandi"],
    ["Tulsi Mess", "IIT Mandi"],
    ["Tragopan Canteen", "IIT Mandi"],
    ["A11 Block", "IIT Mandi"],
    ["A10 Block", "IIT Mandi"],
    ["A9 Block", "IIT Mandi"],
    ["Peepal Mess", "IIT Mandi"],
    ["Gym", "IIT Mandi"],
    ["B28 Hostel", "IIT Mandi"],
    ["B24 Hostel", "IIT Mandi"],
    ["B26 Hostel", "IIT Mandi"],
    ["B25 Hostel", "IIT Mandi"],
    ["B17 Hostel", "IIT Mandi"],
    ["B10 Hostel", "IIT Mandi"],
    ["Oak Mess", "IIT Mandi"],
    ["Monal Canteen", "IIT Mandi"],
    ["B9 Hostel", "IIT Mandi"],
    ["B8 Hostel", "IIT Mandi"],
    ["B12 Hostel", "IIT Mandi"],
    ["B11 Hostel", "IIT Mandi"],
    ["B18 Hostel", "IIT Mandi"],
    ["B15 Hostel", "IIT Mandi"],
    ["B19 Hostel", "IIT Mandi"],
    ["B16 Hostel", "IIT Mandi"],
    ["Pine Mess", "IIT Mandi"],
    ["Drongo Canteen", "IIT Mandi"],
    ["B23 Hostel", "IIT Mandi"],
    ["B14 Hostel", "IIT Mandi"],
    ["B21 Hostel", "IIT Mandi"],
    ["B13 Hostel", "IIT Mandi"],
    ["B20 Hostel", "IIT Mandi"],
    ["B22 Hostel", "IIT Mandi"],
    ["Sports Complex", "IIT Mandi"],
    ["Health Centre", "IIT Mandi"],
    ["Fountain Area", "IIT Mandi"],
    ["Village Square", "IIT Mandi"],
    ["Auditorium Complex", "IIT Mandi"],
    ["C V Raman Guest House", "IIT Mandi"],
    ["Faculty Quarters", "IIT Mandi"],
    ["STAC Gravity", "IIT Mandi"],
    ["Mind Tree School", "IIT Mandi"],
    ["A1 Block", "IIT Mandi"],
    ["A3 Block", "IIT Mandi"],
    ["AMRC Block A2", "IIT Mandi"],
    ["B1 Hostel", "IIT Mandi"],
    ["B2 Hostel", "IIT Mandi"],
    ["B3 Hostel", "IIT Mandi"],
    ["B4 Hostel", "IIT Mandi"],
    ["Parashar Hostel (B6)", "IIT Mandi"],
    ["C-1 Faculty Block", "IIT Mandi"],
    ["Chandrataal Annexe", "IIT Mandi"],
    ["Cedar Mess", "IIT Mandi"],
    ["South Campus Medical Unit", "IIT Mandi"],
    ["South Gate Canteen", "IIT Mandi"],
    ["Kamand Hospital", "IIT Mandi"],
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

  var FRONT_CITIES = ["Chandigarh", "Mandi", "Delhi", "Mumbai", "Bengaluru", "Chennai", "Shimla"];
  var FEATURED = [
    "Chandigarh|Mandi",
    "Chandigarh|Shimla",
    "Chandigarh|Kullu",
    "Delhi|Agra",
    "Mumbai|Pune",
    "Bengaluru|Chennai",
    "Mandi Town|IIT Mandi North Campus",
  ];

  function optionHtml(names, selected) {
    return names.map(function (n) {
      return '<option value="' + n.replace(/"/g, "") + '"' + (n === selected ? " selected" : "") + ">" + n + "</option>";
    }).join("");
  }

  function fillBookingCities() {
    var fromSel = document.getElementById("fromSel");
    var toSel = document.getElementById("toSel");
    if (!fromSel || !toSel) return;
    fromSel.innerHTML = optionHtml(FRONT_CITIES, "Chandigarh");
    toSel.innerHTML = optionHtml(FRONT_CITIES, "Mandi");
  }

  function ensureCity(sel, name) {
    if (!sel || !name) return;
    var i;
    for (i = 0; i < sel.options.length; i++) {
      if (sel.options[i].value === name) {
        sel.value = name;
        return;
      }
    }
    sel.appendChild(new Option(name, name, false, true));
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

  function filtered() {
    return FEATURED.map(function (key) {
      var i;
      for (i = 0; i < SECTORS.length; i++) {
        if (SECTORS[i].from + "|" + SECTORS[i].to === key) return SECTORS[i];
      }
      return null;
    }).filter(Boolean);
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
      map.fitBounds(bounds, { padding: [28, 28], maxZoom: 6 });
    } else {
      map.setView([22.5, 79], 5);
    }
  }

  function render() {
    var list = filtered();
    var grid = document.getElementById("sector-grid");
    var meta = document.getElementById("sector-meta");
    if (grid) {
      grid.innerHTML = list.map(cardHtml).join("");
    }
    if (meta) meta.textContent = "";
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
      ensureCity(fromSel, s.from);
      ensureCity(toSel, s.to);
    } else {
      if (modeSel && modeSel.value === "drones") {
        modeSel.value = "air-taxi";
        modeSel.dispatchEvent(new Event("change"));
      }
      ensureCity(fromSel, s.from);
      ensureCity(toSel, s.to);
    }
  }

  function mount() {
    var grid = document.getElementById("sector-grid");
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
      if (window.IraGoBasemap) IraGoBasemap.add(map, { maxZoom: 12 });
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
