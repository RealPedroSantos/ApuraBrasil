(() => {
  const root = document.documentElement;
  const coarse = () => window.matchMedia?.('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
  const narrow = () => window.matchMedia?.('(max-width: 900px)').matches || window.innerWidth <= 900;
  const tabletLike = () => coarse() && window.innerWidth <= 1180;

  const requestedView = new URLSearchParams(location.search).get('mobileView');
  const validViews = new Set(['map', 'results', 'places', 'zones']);
  let activeView = validViews.has(requestedView) ? requestedView : 'map';
  let raf = 0;

  function applyMode() {
    const isMobile = narrow() || tabletLike();
    const isPortrait = window.innerHeight >= window.innerWidth;

    root.classList.toggle('mobile-ui', isMobile);
    root.classList.toggle('mobile-portrait', isMobile && isPortrait);
    root.classList.toggle('mobile-landscape', isMobile && !isPortrait);
    root.dataset.uiMode = isMobile ? 'mobile' : 'desktop';

    if (isMobile && document.querySelector('.app-shell')) {
      root.dataset.mobileView = activeView;
      syncBottomNav();
    } else {
      delete root.dataset.mobileView;
    }
  }

  function refreshMode() {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(applyMode);
  }

  function ensureV2Styles() {
    if (document.querySelector('link[data-mobile-ui-v2]')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/mobile-ui-v2.css';
    link.dataset.mobileUiV2 = 'true';
    document.head.appendChild(link);
  }

  function iconFor(view) {
    const icons = {
      map: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 6 5-2 8 3 5-2v13l-5 2-8-3-5 2Z"/><path d="M8 4v13M16 7v13"/></svg>',
      results: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19V9M12 19V5M19 19v-7"/><path d="M3 19h18"/></svg>',
      places: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></svg>',
      zones: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16M4 12h16M4 19h16"/><path d="M7 3v4M12 10v4M17 17v4"/></svg>'
    };
    return icons[view] || '';
  }

  function ensureBottomNav() {
    const shell = document.querySelector('.app-shell');
    if (!shell || document.querySelector('.mobile-bottom-nav')) return;

    const nav = document.createElement('nav');
    nav.className = 'mobile-bottom-nav';
    nav.setAttribute('aria-label', 'Navegação mobile');

    const entries = [
      ['map', 'Mapa'],
      ['results', 'Resultados'],
      ['places', 'Localidades'],
      ['zones', 'Seções']
    ];

    nav.innerHTML = entries.map(([view, label]) => (
      `<button type="button" data-mobile-target="${view}" aria-label="${label}">${iconFor(view)}<span>${label}</span></button>`
    )).join('');

    nav.addEventListener('click', (event) => {
      const button = event.target.closest('[data-mobile-target]');
      if (!button) return;
      setMobileView(button.dataset.mobileTarget, true);
    });

    shell.appendChild(nav);
  }

  function syncBottomNav() {
    const nav = document.querySelector('.mobile-bottom-nav');
    if (!nav) return;

    nav.querySelectorAll('[data-mobile-target]').forEach((button) => {
      const selected = button.dataset.mobileTarget === activeView;
      button.classList.toggle('is-active', selected);
      if (selected) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    });
  }

  function activateDetailTab(tabName) {
    const tab = document.querySelector(`.detail-tab[data-tab="${tabName}"]`);
    if (tab && !tab.classList.contains('active')) tab.click();
  }

  function setMobileView(view, userInitiated = false) {
    if (!validViews.has(view)) view = 'map';

    activeView = view;
    if (root.classList.contains('mobile-ui')) root.dataset.mobileView = view;

    if (view === 'results') activateDetailTab('candidates');
    if (view === 'places') activateDetailTab('places');
    if (view === 'zones') activateDetailTab('zones');

    syncBottomNav();

    if (view === 'map') {
      requestAnimationFrame(() => {
        window.dispatchEvent(new Event('resize'));
        setTimeout(() => window.dispatchEvent(new Event('resize')), 80);
      });
    }

    if (userInitiated) {
      const activePanel = view === 'map'
        ? document.querySelector('.map-panel')
        : document.querySelector('.detail-panel.active');
      activePanel?.scrollTo?.({ top: 0, behavior: 'auto' });
    }
  }

  function initMobileDashboard() {
    ensureV2Styles();
    ensureBottomNav();
    applyMode();

    if (validViews.has(requestedView)) {
      requestAnimationFrame(() => setMobileView(requestedView, false));
    }

    document.addEventListener('click', (event) => {
      if (!root.classList.contains('mobile-ui')) return;
      const tab = event.target.closest('.detail-tab[data-tab]');
      if (!tab) return;
      const map = {
        candidates: 'results',
        places: 'places',
        zones: 'zones'
      };
      if (map[tab.dataset.tab]) {
        activeView = map[tab.dataset.tab];
        root.dataset.mobileView = activeView;
        syncBottomNav();
      }
    });
  }

  applyMode();
  window.addEventListener('resize', refreshMode, { passive: true });
  window.addEventListener('orientationchange', refreshMode, { passive: true });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMobileDashboard, { once: true });
  } else {
    initMobileDashboard();
  }
})();
