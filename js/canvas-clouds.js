(function () {
  const section = document.getElementById('air-shuttle');
  if (!section) return;

  const canvas = document.createElement('canvas');
  canvas.style.cssText = `
    position:absolute; top:0; left:0;
    width:100%; height:100%;
    pointer-events:none; z-index:0;
  `;
  section.style.position = 'relative';
  section.prepend(canvas);

  const ctx = canvas.getContext('2d');

  function resize() {
    canvas.width  = section.offsetWidth;
    canvas.height = section.offsetHeight;
  }
  window.addEventListener('resize', () => { resize(); initClouds(); }, { passive: true });
  resize();

  // Stars - top 50% only
  const stars = Array.from({ length: 120 }, () => ({
    x: Math.random(),
    y: Math.random() * 0.5,
    r: 0.4 + Math.random() * 1.2,
    phase: Math.random() * Math.PI * 2,
    speed: 0.005 + Math.random() * 0.008,
  }));

  // Cloud factory
  function makeCloud(layer) {
    const w = layer === 0
      ? 200 + Math.random() * 180
      : 80  + Math.random() * 110;
    return {
      x: Math.random() * (canvas.width + w),
      y: canvas.height * (layer === 0
        ? 0.48 + Math.random() * 0.42
        : 0.58 + Math.random() * 0.32),
      w,
      h: w * 0.35,
      speed: layer === 0 ? 8 + Math.random() * 8 : 20 + Math.random() * 14,
      opacity: layer === 0 ? 0.055 : 0.038,
      layer,
      blobs: Array.from({ length: 6 }, () => ({
        ox: (Math.random() - 0.5) * w * 0.8,
        oy: (Math.random() - 0.5) * w * 0.18,
        rx: w * (0.28 + Math.random() * 0.38),
        ry: w * (0.14 + Math.random() * 0.16),
      })),
    };
  }

  let clouds = [];
  function initClouds() {
    clouds = [
      ...Array.from({ length: 5 }, () => makeCloud(0)),
      ...Array.from({ length: 5 }, () => makeCloud(1)),
    ];
  }
  initClouds();

  let last = performance.now();

  function draw(now) {
    const dt = (now - last) / 1000;
    last = now;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Stars
    stars.forEach(s => {
      s.phase += s.speed;
      const opacity = 0.18 + Math.sin(s.phase) * 0.18;
      ctx.beginPath();
      ctx.arc(s.x * canvas.width, s.y * canvas.height, s.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(15, 23, 42, ${opacity})`;
      ctx.fill();
    });

    // Horizon gradient line
    const horizonY = canvas.height * 0.5;
    const horizGrd = ctx.createLinearGradient(0, 0, canvas.width, 0);
    horizGrd.addColorStop(0,   'rgba(245,158,11,0)');
    horizGrd.addColorStop(0.3, 'rgba(245,158,11,0.06)');
    horizGrd.addColorStop(0.7, 'rgba(245,158,11,0.06)');
    horizGrd.addColorStop(1,   'rgba(245,158,11,0)');
    ctx.beginPath();
    ctx.moveTo(0, horizonY);
    ctx.lineTo(canvas.width, horizonY);
    ctx.strokeStyle = horizGrd;
    ctx.lineWidth = 1;
    ctx.stroke();

    // Subtle horizon glow
    const hGrd = ctx.createRadialGradient(
      canvas.width / 2, horizonY, 0,
      canvas.width / 2, horizonY, canvas.width * 0.4
    );
    hGrd.addColorStop(0, 'rgba(245,158,11,0.04)');
    hGrd.addColorStop(1, 'rgba(245,158,11,0)');
    ctx.fillStyle = hGrd;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Clouds: bg layer first, then fg
    [0, 1].forEach(layer => {
      clouds.filter(c => c.layer === layer).forEach(cloud => {
        cloud.x -= cloud.speed * dt;
        if (cloud.x + cloud.w < -120) {
          cloud.x = canvas.width + cloud.w + 60;
          cloud.y = canvas.height * (layer === 0
            ? 0.48 + Math.random() * 0.42
            : 0.58 + Math.random() * 0.32);
        }

        const color = layer === 0
          ? `rgba(245,158,11,${cloud.opacity})`
          : `rgba(15, 23, 42, ${cloud.opacity})`;

        cloud.blobs.forEach(blob => {
          ctx.beginPath();
          ctx.ellipse(
            cloud.x + blob.ox, cloud.y + blob.oy,
            blob.rx, blob.ry,
            0, 0, Math.PI * 2
          );
          ctx.fillStyle = color;
          ctx.fill();
        });
      });
    });

    requestAnimationFrame(draw);
  }

  requestAnimationFrame(draw);
})();
