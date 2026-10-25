(() => {
  'use strict';

  const root = document.documentElement;
  const STORAGE_KEY = 'apurabrasil.mobile.screen';
  const VALID_SCREENS = new Set(['map', 'results', 'places', 'zones', 'more']);

  const isMobile = () => root.classList.contains('mobile-ui') || window.matchMedia?.('(max-width: 900px)').matches;

  const icons = {
    map: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 6 5-2 8 3 5-2v13l-5 2-8-3-5 2V6Z"/><path d="M8 4v13M16 7v13"/></svg>',
    results: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19V9M10 19V5M16 19v-7M22 19H2"/></svg>',
    places: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></svg>',
    zones: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/><circle cx="8" cy="6" r="1.8"/><circle cx="15" cy="12" r="1.8"/><circle cx="10" cy="18" r="1.8"/></svg>',
    more: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg>'
  };

  function readScreen() {
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY);
      if (VALID_SCREENS.has(saved)) return saved;
    } catch {}
    return 'map';
  }

  function rememberScreen(screen) {
    try { sessionStorage.setItem(STORAGE_KEY, screen); } catch {}
  }

  function detailTab(name) {
    return document.querySelector(`.detail-tab[data-tab="${name}"]`);
  }

  function createBottomNav(shell) {
    if (document.getElementById('mobileAppNav')) return document.getElementById('mobileAppNav');
    const nav = document.createElement('nav');
    nav.id = 'mobileAppNav';
    nav.className = 'mobile-app-nav';
    nav.setAttribute('aria-label', 'Navegação do aplicativo');
    nav.innerHTML = [
      ['map', 'Mapa'],
      ['results', 'Resultados'],
      ['places', 'Localidades'],
      ['zones', 'Seções'],
      ['more', 'Mais']
    ].map(([screen, label]) => `
      <button type="button" data-mobile-screen-target="${screen}" aria-label="${label}">
        <span class="mobile-nav-icon">${icons[screen]}</span>
        <span>${label}</span>
      </button>`).join('');
    const footer = shell.querySelector('.status-bar');
    shell.insertBefore(nav, footer || null);
    return nav;
  }

  function createContextHeader(resultsPanel) {
    if (resultsPanel.querySelector('.mobile-context-header')) return;
    const header = document.createElement('div');
    header.className = 'mobile-context-header';
    header.innerHTML = '<div><span class="mobile-context-eyebrow">APURABRASIL</span><strong id="mobileContextTitle">Localidades</strong></div><button type="button" id="mobileContextBack">Mapa</button>';
    resultsPanel.insertBefore(header, resultsPanel.firstChild);
    header.querySelector('#mobileContextBack')?.addEventListener('click', () => setScreen('map'));
  }

  function createMorePanel(main) {
    let panel = main.querySelector('.mobile-more-panel');
    if (panel) return panel;
    panel = document.createElement('section');
    panel.className = 'mobile-more-panel';
    panel.innerHTML = `
      <div class="mobile-more-head">
        <span>APURABRASIL</span>
        <h2>Mais</h2>
        <p>Acesso rápido às demais áreas da apuração.</p>
      </div>
      <div class="mobile-more-list">
        <a href="/composicao" class="mobile-more-action"><strong>Composição</strong><span>Senado e Câmara</span><b>›</b></a>
        <button type="button" class="mobile-more-action" data-more-action="brasil"><strong>Voltar ao Brasil</strong><span>Limpar o recorte atual do mapa</span><b>›</b></button>
        <button type="button" class="mobile-more-action" data-more-action="refresh"><strong>Atualizar apuração</strong><span>Buscar dados oficiais novamente</span><b>↻</b></button>
      </div>
      <div class="mobile-source-card"><span class="status-dot"></span><div><strong>Fonte oficial</strong><small id="mobileSourceText">TSE conectado</small></div></div>`;
    main.appendChild(panel);
    panel.querySelector('[data-more-action="brasil"]')?.addEventListener('click', () => {
      document.getElementById('resetButton')?.click();
      setScreen('map');
    });
    panel.querySelector('[data-more-action="refresh"]')?.addEventListener('click', () => {
      document.getElementById('refreshButton')?.click();
      setScreen('results');
    });
    return panel;
  }

  function createMapPreview(mapPanel) {
    let preview = mapPanel.querySelector('.mobile-map-result-card');
    if (preview) return preview;
    preview = document.createElement('button');
    preview.type = 'button';
    preview.className = 'mobile-map-result-card';
    preview.setAttribute('aria-label', 'Abrir resultados deste recorte');
    preview.innerHTML = '<span class="mobile-map-result-label">APURAÇÃO</span><strong>Carregando resultado…</strong><small>Toque para abrir Resultados</small>';
    preview.addEventListener('click', () => setScreen('results'));
    mapPanel.appendChild(preview);
    return preview;
  }

  function syncSource() {
    const source = document.getElementById('feedStatus')?.textContent?.trim() || document.getElementById('bottomSource')?.textContent?.trim() || 'Fonte oficial';
    const target = document.getElementById('mobileSourceText');
    if (target) target.textContent = source;
  }

  function renderMapPreview(result) {
    if (!result || result.available === false) return;
    const preview = document.querySelector('.mobile-map-result-card');
    if (!preview) return;
    const leader = result.candidates?.[0];
    const scope = document.getElementById('scopeTitle')?.textContent?.trim() || 'Brasil';
    const progress = Number(result.sections?.percentage || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const leaderPct = Number(leader?.percentage || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const leaderName = leader?.ballotName || leader?.name || 'Sem votos computados';
    preview.innerHTML = `
      <span class="mobile-map-result-label">${scope} · ${progress}% APURADO</span>
      <strong>${leaderName}</strong>
      <small>${leader ? `${leaderPct}% · toque para ver todos os resultados` : 'Toque para abrir Resultados'}</small>`;
  }

  function syncContextHeader(screen) {
    const title = document.getElementById('mobileContextTitle');
    if (!title) return;
    if (screen === 'places') title.textContent = 'Localidades';
    else if (screen === 'zones') title.textContent = 'Zonas e seções';
  }

  function syncNav(screen) {
    document.querySelectorAll('[data-mobile-screen-target]').forEach(button => {
      const active = button.dataset.mobileScreenTarget === screen;
      button.classList.toggle('active', active);
      button.setAttribute('aria-current', active ? 'page' : 'false');
    });
  }

  function setScreen(screen, options = {}) {
    if (!VALID_SCREENS.has(screen)) screen = 'map';
    root.dataset.mobileScreen = screen;
    root.classList.add('mobile-app-ready');
    syncNav(screen);
    syncContextHeader(screen);
    if (options.remember !== false) rememberScreen(screen);

    if (screen === 'results') detailTab('candidates')?.click();
    if (screen === 'places') detailTab('places')?.click();
    if (screen === 'zones') detailTab('zones')?.click();

    requestAnimationFrame(() => {
      window.dispatchEvent(new Event('resize'));
      const scroller = screen === 'results'
        ? document.getElementById('candidateList')
        : screen === 'places'
          ? document.querySelector('.detail-panel[data-panel="places"]')
          : screen === 'zones'
            ? document.querySelector('.detail-panel[data-panel="zones"]')
            : null;
      if (scroller && options.keepScroll !== true) scroller.scrollTop = 0;
    });
  }

  function mount() {
    const shell = document.querySelector('.app-shell');
    const main = document.querySelector('.main-grid');
    const mapPanel = document.querySelector('.map-panel');
    const resultsPanel = document.querySelector('.results-panel');
    if (!shell || !main || !mapPanel || !resultsPanel) return;

    createBottomNav(shell);
    createContextHeader(resultsPanel);
    createMorePanel(main);
    createMapPreview(mapPanel);

    document.getElementById('mobileAppNav')?.addEventListener('click', event => {
      const button = event.target.closest('[data-mobile-screen-target]');
      if (!button) return;
      setScreen(button.dataset.mobileScreenTarget);
    });

    document.addEventListener('click', event => {
      if (!isMobile()) return;
      const tab = event.target.closest('.detail-tab[data-tab]');
      if (!tab) return;
      const mapped = tab.dataset.tab === 'candidates' ? 'results' : tab.dataset.tab === 'places' ? 'places' : tab.dataset.tab === 'zones' ? 'zones' : null;
      if (mapped && root.dataset.mobileScreen !== mapped) setScreen(mapped, { keepScroll: true });
    }, true);

    const sourceObserver = new MutationObserver(syncSource);
    const feed = document.getElementById('feedStatus');
    if (feed) sourceObserver.observe(feed, { childList: true, subtree: true, characterData: true });

    window.addEventListener('apura:result-year-loaded', event => {
      renderMapPreview(event.detail?.result);
      syncSource();
    });
    window.addEventListener('apura:election-year-changed', event => renderMapPreview(event.detail?.result));
    window.addEventListener('apura:historical-result-loaded', event => renderMapPreview(event.detail?.result));

    setScreen(readScreen(), { remember: false, keepScroll: true });
    syncSource();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true });
  else mount();
})();
