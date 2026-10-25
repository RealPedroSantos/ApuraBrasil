(() => {
  'use strict';

  const root = document.documentElement;
  const isMobile = () => root.classList.contains('mobile-ui') || matchMedia('(max-width:900px)').matches || ((navigator.maxTouchPoints || 0) > 0 && innerWidth <= 1180);

  const icons = {
    map:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 6 5-2 8 3 5-2v13l-5 2-8-3-5 2Z"/><path d="M8 4v13M16 7v13"/></svg>',
    results:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19V9M12 19V5M19 19v-7"/><path d="M3 19h18"/></svg>',
    places:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></svg>',
    zones:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16M4 12h16M4 19h16"/><path d="M7 3v4M12 10v4M17 17v4"/></svg>',
    composition:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19h16M6 16h12M8 13h8M10 10h4"/><circle cx="6" cy="7" r="1.5"/><circle cx="10" cy="5" r="1.5"/><circle cx="14" cy="5" r="1.5"/><circle cx="18" cy="7" r="1.5"/></svg>'
  };

  function href(view) {
    if (view === 'composition') return '/composicao';
    return `/?mobileView=${encodeURIComponent(view)}`;
  }

  function ensure() {
    if (!document.querySelector('.projection-app') || document.querySelector('.composition-bottom-nav')) return;
    const nav = document.createElement('nav');
    nav.className = 'composition-bottom-nav';
    nav.setAttribute('aria-label', 'Navegação principal');
    const entries = [
      ['map','Mapa'],
      ['results','Resultados'],
      ['places','Localidades'],
      ['zones','Seções'],
      ['composition','Composição']
    ];
    nav.innerHTML = entries.map(([view,label]) => `<a href="${href(view)}" class="${view === 'composition' ? 'is-active' : ''}" ${view === 'composition' ? 'aria-current="page"' : ''}>${icons[view]}<span>${label}</span></a>`).join('');
    document.body.appendChild(nav);
    sync();
  }

  function sync() {
    const nav = document.querySelector('.composition-bottom-nav');
    if (!nav) return;
    nav.hidden = !isMobile();
    document.body.classList.toggle('has-composition-bottom-nav', isMobile());
  }

  function init() {
    ensure();
    sync();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once:true });
  else init();
  addEventListener('resize', sync, { passive:true });
  addEventListener('orientationchange', sync, { passive:true });
})();
