(function () {
  var toggle = document.getElementById('navToggle');
  var links = document.getElementById('navLinks');
  var nav = document.querySelector('.nav');
  if (toggle && links) {
    toggle.addEventListener('click', function () {
      var open = links.classList.toggle('is-open');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    links.querySelectorAll('a').forEach(function (a) {
      a.addEventListener('click', function () {
        links.classList.remove('is-open');
        toggle.setAttribute('aria-expanded', 'false');
      });
    });
  }
  function solidNav() {
    if (!nav) return;
    nav.classList.toggle('is-solid', window.scrollY > 24);
  }
  solidNav();
  window.addEventListener('scroll', solidNav, { passive: true });
})();

(function () {
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var sel = '.section h2, .section-body, .routes-header, .route-card, .feature-item, .features h2, .booking-inner, .footer-inner, .bullet-list, .contact-wrap';
  var nodes = document.querySelectorAll(sel);
  if (!nodes.length) return;
  if (reduce) {
    Array.prototype.forEach.call(nodes, function (el) { el.classList.add('is-in'); });
    return;
  }
  document.querySelectorAll('.routes-grid, .features-grid').forEach(function (grid) {
    Array.prototype.forEach.call(grid.children, function (child, i) {
      child.style.transitionDelay = (i * 0.08) + 's';
    });
  });
  Array.prototype.forEach.call(nodes, function (el) { el.classList.add('reveal'); });
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-in');
      io.unobserve(entry.target);
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
  Array.prototype.forEach.call(nodes, function (el) { io.observe(el); });
})();
