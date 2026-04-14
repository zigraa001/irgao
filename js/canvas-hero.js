(function () {
  const canvas = document.getElementById('heroCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  const CITIES = [
    { name: 'Delhi',       x: 0.42, y: 0.22 },
    { name: 'Mumbai',      x: 0.26, y: 0.52 },
    { name: 'Bangalore',   x: 0.38, y: 0.70 },
    { name: 'Chennai',     x: 0.48, y: 0.72 },
    { name: 'Kolkata',     x: 0.64, y: 0.40 },
    { name: 'Hyderabad',   x: 0.42, y: 0.60 },
    { name: 'Ahmedabad',   x: 0.24, y: 0.40 },
    { name: 'Pune',        x: 0.28, y: 0.56 },
    { name: 'Jaipur',      x: 0.36, y: 0.28 },
    { name: 'Leh',         x: 0.38, y: 0.10 },
    { name: 'Kochi',       x: 0.36, y: 0.80 },
    { name: 'Goa',         x: 0.28, y: 0.65 },
    { name: 'Bhubaneswar', x: 0.57, y: 0.52 },
    { name: 'Nagpur',      x: 0.44, y: 0.48 },
  ];

  /* ROUTES: Starting from 3 primary hubs to ensure variety without overcrowding */
  const ROUTES = [
    /* Delhi Hub (0) */
    [0, 1],  /* Delhi -> Mumbai */
    [0, 2],  /* Delhi -> Bangalore */
    [0, 4],  /* Delhi -> Kolkata */
    [0, 3],  /* Delhi -> Chennai */
    [0, 9],  /* Delhi -> Leh */
    [0, 8],  /* Delhi -> Jaipur */
    
    /* Bangalore Hub (2) */
    [2, 0],  /* Bangalore -> Delhi */
    [2, 1],  /* Bangalore -> Mumbai */
    [2, 5],  /* Bangalore -> Hyderabad */
    [2, 3],  /* Bangalore -> Chennai */
    [2, 10], /* Bangalore -> Kochi */
    [2, 11], /* Bangalore -> Goa */

    /* Mumbai Hub (1) */
    [1, 0],  /* Mumbai -> Delhi */
    [1, 2],  /* Mumbai -> Bangalore */
    [1, 5],  /* Mumbai -> Hyderabad */
    [1, 6],  /* Mumbai -> Ahmedabad */
    [1, 7],  /* Mumbai -> Pune */
    [1, 11]  /* Mumbai -> Goa */
  ];

  const MAX_FLIGHTS = 6;
  const flights = [];

  function resize() {
    canvas.width  = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
  }
  window.addEventListener('resize', resize, { passive: true });
  resize();

  function getCityPos(city) {
    return { x: city.x * canvas.width, y: city.y * canvas.height };
  }

  function getControlPoint(p1, p2) {
    const mx = (p1.x + p2.x) / 2;
    const my = (p1.y + p2.y) / 2;
    const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    return { x: mx, y: my - dist * 0.32 };
  }

  function bezierPoint(p1, cp, p2, t) {
    const mt = 1 - t;
    return {
      x: mt * mt * p1.x + 2 * mt * t * cp.x + t * t * p2.x,
      y: mt * mt * p1.y + 2 * mt * t * cp.y + t * t * p2.y,
    };
  }

  function spawnFlight() {
    const route = ROUTES[Math.floor(Math.random() * ROUTES.length)];
    flights.push({
      from: route[0],
      to: route[1],
      progress: 0,
      speed: 0.0025 + Math.random() * 0.002,
      trail: [],
    });
  }

  for (let i = 0; i < MAX_FLIGHTS; i++) {
    spawnFlight();
    flights[i].progress = Math.random();
  }

  const pulses = {};
  function triggerPulse(cityIdx) {
    pulses[cityIdx] = { scale: 1, opacity: 0.9 };
  }

  function drawCity(city, index) {
    const p = getCityPos(city);

    // ambient glow
    const grd = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 20);
    grd.addColorStop(0, 'rgba(30,64,175,0.3)');
    grd.addColorStop(1, 'rgba(30,64,175,0)');
    ctx.beginPath();
    ctx.arc(p.x, p.y, 20, 0, Math.PI * 2);
    ctx.fillStyle = grd;
    ctx.fill();

    // Pulse ring
    const pulse = pulses[index];
    if (pulse) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 6 * pulse.scale, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(56,189,248,${pulse.opacity})`;
      ctx.lineWidth = 1;
      ctx.stroke();
      pulse.scale += 0.07;
      pulse.opacity -= 0.022;
      if (pulse.opacity <= 0) delete pulses[index];
    }

    // Core dot
    ctx.beginPath();
    ctx.arc(p.x, p.y, 3.5, 0, Math.PI * 2);
    ctx.fillStyle = '#1E40AF';
    ctx.fill();

    // Label
    ctx.fillStyle = 'rgba(15, 23, 42, 0.45)';
    ctx.font = '500 10px Inter, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(city.name, p.x + 7, p.y + 4);
  }

  function drawFlight(flight) {
    const from = CITIES[flight.from];
    const to   = CITIES[flight.to];
    const p1   = getCityPos(from);
    const p2   = getCityPos(to);
    const cp   = getControlPoint(p1, p2);

    // Ghost route
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.quadraticCurveTo(cp.x, cp.y, p2.x, p2.y);
    ctx.strokeStyle = 'rgba(30,64,175,0.06)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 8]);
    ctx.stroke();
    ctx.setLineDash([]);

    // Drawn portion
    const steps = 80;
    const end = Math.floor(flight.progress * steps);
    if (end > 0) {
      ctx.beginPath();
      const startPt = bezierPoint(p1, cp, p2, 0);
      ctx.moveTo(startPt.x, startPt.y);
      for (let i = 1; i <= end; i++) {
        const pt = bezierPoint(p1, cp, p2, i / steps);
        ctx.lineTo(pt.x, pt.y);
      }
      ctx.strokeStyle = 'rgba(30,64,175,0.55)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    // Trail dots
    flight.trail.forEach((pos, i) => {
      const ratio = i / flight.trail.length;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, ratio * 2.2, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(56,189,248,${ratio * 0.55})`;
      ctx.fill();
    });

    // Aircraft
    const pos = bezierPoint(p1, cp, p2, flight.progress);

    const aGrd = ctx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, 22);
    aGrd.addColorStop(0, 'rgba(30,64,175,0.55)');
    aGrd.addColorStop(1, 'rgba(30,64,175,0)');
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, 22, 0, Math.PI * 2);
    ctx.fillStyle = aGrd;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(pos.x, pos.y, 4.5, 0, Math.PI * 2);
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();

    // Update trail
    flight.trail.push({ x: pos.x, y: pos.y });
    if (flight.trail.length > 14) flight.trail.shift();

    flight.progress += flight.speed;

    if (flight.progress >= 1) {
      triggerPulse(flight.to);
      flight.progress = 0;
      flight.trail = [];
      const newRoute = ROUTES[Math.floor(Math.random() * ROUTES.length)];
      flight.from = newRoute[0];
      flight.to   = newRoute[1];
    }
  }

  // Atmospheric shimmer glows
  const shimmers = Array.from({ length: 5 }, () => ({
    x: 0.2 + Math.random() * 0.6,
    y: 0.2 + Math.random() * 0.6,
    phase: Math.random() * Math.PI * 2,
    speed: 0.007 + Math.random() * 0.006,
  }));

  function drawShimmers() {
    shimmers.forEach(s => {
      s.phase += s.speed;
      const opacity = 0.025 + Math.sin(s.phase) * 0.02;
      const cx = s.x * canvas.width;
      const cy = s.y * canvas.height;
      const grd = ctx.createRadialGradient(cx, cy, 0, cx, cy, 70);
      grd.addColorStop(0, `rgba(30,64,175,${opacity})`);
      grd.addColorStop(1, 'rgba(30,64,175,0)');
      ctx.beginPath();
      ctx.ellipse(cx, cy, 70, 10, 0, 0, Math.PI * 2);
      ctx.fillStyle = grd;
      ctx.fill();
    });
  }

  function animate() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawShimmers();

    // Ghost routes under everything
    ROUTES.forEach(r => {
      const p1 = getCityPos(CITIES[r[0]]);
      const p2 = getCityPos(CITIES[r[1]]);
      const cp = getControlPoint(p1, p2);
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.quadraticCurveTo(cp.x, cp.y, p2.x, p2.y);
      ctx.strokeStyle = 'rgba(30,64,175,0.04)';
      ctx.lineWidth = 0.5;
      ctx.setLineDash([3, 10]);
      ctx.stroke();
      ctx.setLineDash([]);
    });

    flights.forEach(f => drawFlight(f));
    CITIES.forEach((city, i) => drawCity(city, i));

    requestAnimationFrame(animate);
  }

  animate();
})();
