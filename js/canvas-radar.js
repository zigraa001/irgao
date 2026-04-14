(function () {
  const section = document.getElementById('golden-hours');
  if (!section) return;

  const canvas = document.createElement('canvas');
  canvas.style.cssText = `
    position:absolute; top:0; left:0;
    width:100%; height:100%;
    pointer-events:none; z-index:0;
    opacity:0.6;
  `;
  section.style.position = 'relative';
  section.prepend(canvas);

  const ctx = canvas.getContext('2d');
  let angle = 0;
  const rings = [];

  function resize() {
    canvas.width  = section.offsetWidth;
    canvas.height = section.offsetHeight;
  }
  window.addEventListener('resize', resize, { passive: true });
  resize();

  function spawnRing() {
    rings.push({ r: 0, opacity: 0.45 });
  }
  setInterval(spawnRing, 1800);

  let pinOpacity = 1;
  let pinDir = -1;

  // Random blips that appear on the radar
  const blips = Array.from({ length: 4 }, () => ({
    angle: Math.random() * Math.PI * 2,
    dist: 0.2 + Math.random() * 0.6,
    opacity: 0,
    phase: Math.random() * Math.PI * 2
  }));

  function draw() {
    const W = canvas.width;
    const H = canvas.height;
    const cx = W * 0.72;
    const cy = H * 0.5;
    const maxR = Math.min(W, H) * 0.52;

    ctx.clearRect(0, 0, W, H);

    // Coordinate grid
    ctx.strokeStyle = 'rgba(239,68,68,0.04)';
    ctx.lineWidth = 0.5;
    for (let x = 0; x < W; x += 60) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    }
    for (let y = 0; y < H; y += 60) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }

    // Crosshair lines
    ctx.strokeStyle = 'rgba(239,68,68,0.06)';
    ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.moveTo(cx, cy - maxR); ctx.lineTo(cx, cy + maxR); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx - maxR, cy); ctx.lineTo(cx + maxR, cy); ctx.stroke();

    // Concentric rings
    [0.25, 0.45, 0.65, 0.85, 1.0].forEach(r => {
      ctx.beginPath();
      ctx.arc(cx, cy, maxR * r, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(239,68,68,0.09)';
      ctx.lineWidth = 0.8;
      ctx.stroke();
    });

    // Sweep trail (fading wedge)
    const trailLength = 1.3;
    for (let i = 0; i < 50; i++) {
      const a = angle - (i / 50) * trailLength;
      const opacity = ((50 - i) / 50) * 0.14;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, maxR, a, a + trailLength / 50);
      ctx.closePath();
      ctx.fillStyle = `rgba(239,68,68,${opacity})`;
      ctx.fill();
    }

    // Sweep line
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(angle) * maxR, cy + Math.sin(angle) * maxR);
    ctx.strokeStyle = 'rgba(239,68,68,0.75)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Sweep glow at tip
    const tipX = cx + Math.cos(angle) * maxR;
    const tipY = cy + Math.sin(angle) * maxR;
    const tipGrd = ctx.createRadialGradient(tipX, tipY, 0, tipX, tipY, 20);
    tipGrd.addColorStop(0, 'rgba(239,68,68,0.4)');
    tipGrd.addColorStop(1, 'rgba(239,68,68,0)');
    ctx.beginPath();
    ctx.arc(tipX, tipY, 20, 0, Math.PI * 2);
    ctx.fillStyle = tipGrd;
    ctx.fill();

    // Expanding rings
    rings.forEach(ring => {
      ctx.beginPath();
      ctx.arc(cx, cy, ring.r, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(239,68,68,${ring.opacity})`;
      ctx.lineWidth = 1;
      ctx.stroke();
      ring.r += 1.4;
      ring.opacity -= 0.0038;
    });
    for (let i = rings.length - 1; i >= 0; i--) {
      if (rings[i].opacity <= 0) rings.splice(i, 1);
    }

    // Radar blips
    blips.forEach(blip => {
      blip.phase += 0.03;
      // Show blip when sweep passes over it (approximate)
      const angleDiff = ((angle - blip.angle) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
      if (angleDiff < 0.2) {
        blip.opacity = 1;
      }
      blip.opacity *= 0.985;

      if (blip.opacity > 0.05) {
        const bx = cx + Math.cos(blip.angle) * maxR * blip.dist;
        const by = cy + Math.sin(blip.angle) * maxR * blip.dist;
        const bGrd = ctx.createRadialGradient(bx, by, 0, bx, by, 8);
        bGrd.addColorStop(0, `rgba(239,68,68,${blip.opacity})`);
        bGrd.addColorStop(1, 'rgba(239,68,68,0)');
        ctx.beginPath();
        ctx.arc(bx, by, 8, 0, Math.PI * 2);
        ctx.fillStyle = bGrd;
        ctx.fill();
        ctx.beginPath();
        ctx.arc(bx, by, 2.5, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,120,120,${blip.opacity})`;
        ctx.fill();
      }
    });

    // Center blinking pin
    pinOpacity += pinDir * 0.018;
    if (pinOpacity <= 0.15) pinDir = 1;
    if (pinOpacity >= 1)    pinDir = -1;

    const pinGrd = ctx.createRadialGradient(cx, cy, 0, cx, cy, 20);
    pinGrd.addColorStop(0, `rgba(239,68,68,${pinOpacity * 0.55})`);
    pinGrd.addColorStop(1, 'rgba(239,68,68,0)');
    ctx.beginPath();
    ctx.arc(cx, cy, 20, 0, Math.PI * 2);
    ctx.fillStyle = pinGrd;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(cx, cy, 5, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(239,68,68,${pinOpacity})`;
    ctx.fill();

    // Inner pin ring
    ctx.beginPath();
    ctx.arc(cx, cy, 9, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(239,68,68,${pinOpacity * 0.4})`;
    ctx.lineWidth = 1;
    ctx.stroke();

    angle += 0.009;
    requestAnimationFrame(draw);
  }

  draw();
})();
