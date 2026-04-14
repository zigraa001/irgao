// ─── NAVBAR SCROLL + ACTIVE HIGHLIGHT ───
(function() {
  const navbar = document.getElementById('navbar');
  const navLinks = document.querySelectorAll('.navbar-links .nav-link[data-section]');

  // Switch navbar to 'scrolled' mode after passing the hero
  if (navbar) {
    const heroSection = document.getElementById('home') || document.querySelector('.hero') || document.querySelector('.team-hero') || document.querySelector('.vision-hero');
    if (heroSection) {
      const checkScroll = () => {
        const threshold = heroSection.offsetHeight - navbar.offsetHeight;
        navbar.classList.toggle('scrolled', window.scrollY > threshold);
      };
      window.addEventListener('scroll', checkScroll, { passive: true });
      checkScroll(); // run on load
    } else {
      // On inner pages without a hero, navbar should always be solid
      navbar.classList.add('scrolled');
    }
  }

  // ─── ACTIVE NAV HIGHLIGHTING ───
  if (navLinks.length > 0) {
    const sections = Array.from(navLinks)
      .map(link => document.getElementById(link.dataset.section))
      .filter(Boolean);

    const onScroll = () => {
      const scrollMid = window.scrollY + window.innerHeight / 3;
      let active = null;
      sections.forEach(sec => {
        if (sec.offsetTop <= scrollMid) active = sec.id;
      });
      navLinks.forEach(link => {
        link.classList.toggle('active', link.dataset.section === active);
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  // ─── MOBILE TOGGLE ───
  const toggle = document.getElementById('navToggle');
  const drawer = document.getElementById('navDrawer');
  if (toggle && drawer) {
    toggle.addEventListener('click', () => {
      const isOpen = drawer.classList.toggle('open');
      // Animate hamburger to X
      toggle.classList.toggle('active', isOpen);
    });
    drawer.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => {
        drawer.classList.remove('open');
        toggle.classList.remove('active');
      });
    });
  }

  // ─── HAMBURGER → X ANIMATION ───
  const style = document.createElement('style');
  style.textContent = `
    .navbar-toggle.active span:nth-child(1) { transform: translateY(7px) rotate(45deg); }
    .navbar-toggle.active span:nth-child(2) { opacity: 0; transform: scaleX(0); }
    .navbar-toggle.active span:nth-child(3) { transform: translateY(-7px) rotate(-45deg); }
  `;
  document.head.appendChild(style);

  // ─── BACK TO TOP BUTTON ───
  const scrollToTopBtn = document.getElementById('scrollToTopBtn');
  if (scrollToTopBtn) {
    window.addEventListener('scroll', () => {
      scrollToTopBtn.classList.toggle('visible', window.scrollY > 500);
    }, { passive: true });
    scrollToTopBtn.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  // ─── SMOOTH SCROLL for anchor links ───
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', (e) => {
      const targetId = anchor.getAttribute('href').slice(1);
      const target = document.getElementById(targetId);
      if (target) {
        e.preventDefault();
        const offset = 90; // navbar height + buffer
        const top = target.getBoundingClientRect().top + window.scrollY - offset;
        window.scrollTo({ top, behavior: 'smooth' });
      }
    });
  });
})();
