(function () {

  // ─── Enhanced scroll reveal with smooth movement ───
  const revealEls = document.querySelectorAll('.reveal');
  
  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        // Add a micro-delay based on element position for natural cascade
        const rect = entry.target.getBoundingClientRect();
        const delayFromPosition = Math.max(0, (rect.left / window.innerWidth) * 100);
        entry.target.style.transitionDelay = `${delayFromPosition}ms`;
        
        entry.target.classList.add('revealed');
        revealObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.08, rootMargin: '0px 0px -80px 0px' });

  revealEls.forEach(el => revealObserver.observe(el));

  // ─── Section label reveal ───
  const sectionLabels = document.querySelectorAll('.section-label');
  const labelObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('revealed');
        labelObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.3, rootMargin: '0px 0px -40px 0px' });

  sectionLabels.forEach(el => labelObserver.observe(el));

  // ─── Animated counters ───
  function animateCounter(el) {
    const target = parseFloat(el.dataset.target);
    const suffix = el.dataset.suffix || '';
    const prefix = el.dataset.prefix || '';
    const duration = 1800;
    const start = performance.now();

    function update(now) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      // Smoother easing
      const eased = 1 - Math.pow(1 - progress, 4);
      const value = eased * target;

      el.textContent = prefix + (Number.isInteger(target)
        ? Math.floor(value).toLocaleString('en-IN')
        : value.toFixed(1)) + suffix;

      if (progress < 1) requestAnimationFrame(update);
    }

    requestAnimationFrame(update);
  }

  const counterObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        animateCounter(entry.target);
        counterObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.5 });

  document.querySelectorAll('[data-target]').forEach(el => {
    counterObserver.observe(el);
  });

  // ─── Step line draw ───
  const stepLine = document.querySelector('.step-line');
  if (stepLine) {
    const lineObserver = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting) {
        stepLine.classList.add('drawn');
        lineObserver.disconnect();
      }
    }, { threshold: 0.3 });
    const target = stepLine.closest('section') || stepLine;
    lineObserver.observe(target);
  }

  // ─── Timeline line draw (Vision page) ───
  const timelineLine = document.querySelector('.timeline-line');
  if (timelineLine) {
    const tlObserver = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting) {
        timelineLine.classList.add('drawn');
        tlObserver.disconnect();
      }
    }, { threshold: 0.2 });
    tlObserver.observe(timelineLine.closest('section') || timelineLine);
  }

  // Timeline dots appear on scroll
  document.querySelectorAll('.timeline-dot').forEach(dot => {
    const dotObs = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting) {
        dot.classList.add('visible');
        dotObs.disconnect();
      }
    }, { threshold: 0.5 });
    dotObs.observe(dot);
  });

  // ─── Manifesto word-by-word reveal (Vision page) ───
  const manifestoWords = document.querySelectorAll('.manifesto-word');
  if (manifestoWords.length > 0) {
    manifestoWords.forEach((word, i) => {
      setTimeout(() => {
        word.classList.add('visible');
      }, 200 + i * 80);
    });
  }

  // ─── Drag-to-scroll horizontal containers ───
  document.querySelectorAll('.scroll-container').forEach(container => {
    let isDown = false, startX = 0, scrollLeft = 0;

    container.addEventListener('mousedown', e => {
      isDown = true;
      startX = e.pageX - container.offsetLeft;
      scrollLeft = container.scrollLeft;
    });
    document.addEventListener('mouseup', () => { isDown = false; });
    container.addEventListener('mousemove', e => {
      if (!isDown) return;
      e.preventDefault();
      const x = e.pageX - container.offsetLeft;
      container.scrollLeft = scrollLeft - (x - startX) * 1.5;
    });
  });

})();
