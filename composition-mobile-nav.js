(() => {
  'use strict';

  const root = document.documentElement;
  const isMobile = () => root.classList.contains('mobile-ui') || matchMedia('(max-width:900px)').matches || ((navigator.maxTouchPoints || 0) > 0 && innerWidth <= 1180);

  const icons = {
    map:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 6 5-2 8 3 5-2v13l-5 2-8-3-5 2Z"/><path d="M8 4v13M16 7v13"/></svg>',
    results:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19V9M12 19V5M19 19v-7"/><path d="M3 19h18"/></svg>',
    places:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></svg>',
    zones:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16M4 12h16M4 19h16"/><path d="M7 3v4M12 10v4M17 17v4"/></svg>',
    more:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/></svg>'
  };

  function mainHref(view) {
    return `/?mobileView=${encodeURIComponent(view)}`;
  }

  function closeSheet() {
    root.classList.remove('composition-more-open');
    syncMore();
  }

  function syncMore() {
    const open = root.classList.contains('composition-more-open');
    document.querySelector('.composition-bottom-nav [data-target="more"]')?.classList.toggle('is-active', true);
    const sheet = document.querySelector('.composition-more-sheet');
    if (sheet) sheet.hidden = !open || !isMobile();
  }

  function ensure() {
    if (!document.querySelector('.projection-app') || document.querySelector('.composition-bottom-nav')) return;

    const nav = document.createElement('nav');
    nav.className = 'composition-bottom-nav';
    nav.setAttribute('aria-label', 'Menu principal');
    nav.innerHTML = [
      ['map','Mapa'],['results','Resultados'],['places','Localidades'],['zones','Seções']
    ].map(([view,label]) => `<a href="${mainHref(view)}" data-target="${view}">${icons[view]}<span>${label}</span></a>`).join('') +
      `<button type="button" data-target="more" class="is-active" aria-current="page" aria-label="Mais">${icons.more}<span>Mais</span></button>`;

    const sheet = document.createElement('section');
    sheet.className = 'composition-more-sheet';
    sheet.setAttribute('aria-label', 'Mais opções');
    sheet.hidden = true;
    sheet.innerHTML = '<strong>Composição</strong><button type="button" data-action="refresh">Atualizar projeção</button><a href="/?mobileView=map">Voltar à apuração</a>';

    nav.addEventListener('click', event => {
      const more = event.target.closest('[data-target="more"]');
      if (!more) return;
      root.classList.toggle('composition-more-open');
      syncMore();
    });

    sheet.addEventListener('click', event => {
      const action = event.target.closest('[data-action]')?.dataset.action;
      if (action === 'refresh') {
        document.getElementById('refreshProjection')?.click();
        closeSheet();
      }
    });

    document.body.append(sheet, nav);
    sync();
  }

  function sync() {
    const mobile = isMobile();
    const nav = document.querySelector('.composition-bottom-nav');
    const sheet = document.querySelector('.composition-more-sheet');
    if (!nav) return;
    nav.hidden = !mobile;
    if (!mobile) root.classList.remove('composition-more-open');
    if (sheet) sheet.hidden = !mobile || !root.classList.contains('composition-more-open');
    document.body.classList.toggle('has-composition-bottom-nav', mobile);
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
