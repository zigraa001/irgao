(function () {
  // Vision page constellation - full viewport fixed background
  const canvas = document.createElement('canvas');
  canvas.style.cssText = `
    position:fixed; top:0; left:0;
    width:100vw; height:100vh;
    pointer-events:none; z-index:0;
  `;
  document.body.prepend(canvas);

  const ctx = canvas.getContext('2d');
  let mouse = { x: -999, y: -999 };
  let nodes = [];
  const MAX_NODES = 75;
  const CONNECTION_DIST = 135;
  const REPEL_DIST = 115;
  const REPEL_FORCE = 0.55;

  function resize() {
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  window.addEventListener('resize', resize, { passive: true });
  resize();

  window.addEventListener('mousemove', e => {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
  });

  // Click burst
  window.addEventListener('click', e => {
    for (let i = 0; i < 8; i++) {
      if (nodes.length >= MAX_NODES + 8) nodes.shift();
      const angle = (i / 8) * Math.PI * 2;
      const speed = 1.5 + Math.random();
      nodes.push({
        x: e.clientX, y: e.clientY,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        r: 2 + Math.random(),
        opacity: 0.8,
        born: true,
      });
    }
  });

  function spawnNode() {
    return {
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      vx: (Math.random() - 0.5) * 0.4,
      vy: (Math.random() - 0.5) * 0.4,
      r: 1.5 + Math.random(),
      opacity: 0.35 + Math.random() * 0.4,
    };
  }

  for (let i = 0; i < MAX_NODES; i++) nodes.push(spawnNode());

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    nodes.forEach((n, i) => {
      // Mouse repulsion
      const dx = n.x - mouse.x;
      const dy = n.y - mouse.y;
      const d  = Math.hypot(dx, dy);
      if (d < REPEL_DIST && d > 0) {
        const force = ((REPEL_DIST - d) / REPEL_DIST) * REPEL_FORCE;
        n.vx += (dx / d) * force;
        n.vy += (dy / d) * force;
      }

      n.vx *= 0.98;
      n.vy *= 0.98;
      n.x  += n.vx;
      n.y  += n.vy;

      if (n.x < 0 || n.x > canvas.width)  n.vx *= -1;
      if (n.y < 0 || n.y > canvas.height) n.vy *= -1;
      n.x = Math.max(0, Math.min(canvas.width,  n.x));
      n.y = Math.max(0, Math.min(canvas.height, n.y));

      // Born nodes fade opacity
      if (n.born) {
        n.opacity *= 0.995;
      }

      // Connections
      for (let j = i + 1; j < nodes.length; j++) {
        const m = nodes[j];
        const dist = Math.hypot(n.x - m.x, n.y - m.y);
        if (dist < CONNECTION_DIST) {
          const lineOpacity = (1 - dist / CONNECTION_DIST) * 0.25;
          ctx.beginPath();
          ctx.moveTo(n.x, n.y);
          ctx.lineTo(m.x, m.y);
          ctx.strokeStyle = `rgba(255,255,255,${lineOpacity})`;
          ctx.lineWidth = 0.8;
          ctx.stroke();
        }
      }

      // Mouse highlight
      const mouseDist = Math.hypot(n.x - mouse.x, n.y - mouse.y);
      const highlighted = mouseDist < 100;

      if (highlighted) {
        const g = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, 12);
        g.addColorStop(0, 'rgba(255,255,255,0.25)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.beginPath();
        ctx.arc(n.x, n.y, 12, 0, Math.PI * 2);
        ctx.fillStyle = g;
        ctx.fill();
      }

      ctx.beginPath();
      ctx.arc(n.x, n.y, highlighted ? n.r * 1.9 : n.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,255,255,${highlighted ? 0.9 : n.opacity * 0.6})`;
      ctx.fill();
    });

    requestAnimationFrame(draw);
  }

  draw();
})();
