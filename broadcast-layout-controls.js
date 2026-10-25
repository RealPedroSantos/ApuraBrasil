(() => {
  'use strict';

  if (window.__apuraBrasilBroadcastControlsInstalled) return;

  function isBroadcastEmbed() {
    try {
      return window.parent !== window && window.parent.location.pathname.startsWith('/ao-vivo');
    } catch {
      return false;
    }
  }

  if (!isBroadcastEmbed()) return;
  window.__apuraBrasilBroadcastControlsInstalled = true;

  const parentDoc = window.parent.document;
  const STORAGE_COLUMNS = 'apurabrasil.broadcast.columns.v1';
  const STORAGE_OFFICE = 'apurabrasil.broadcast.office.v1';
  const DEFAULT_RATIOS = [0.25, 0.33, 0.42];
  const GAP = 9;
  const OFFICE_LABELS = { presidente: 'Presidente', governador: 'Governador' };

  let grid = null;
  let leftPanel = null;
  let mapPanel = null;
  let resultsPanel = null;
  let dividerA = null;
  let dividerB = null;
  let ratios = readRatios();
  let resizeObserver = null;

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function readRatios() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_COLUMNS) || 'null');
      if (Array.isArray(parsed) && parsed.length === 3 && parsed.every(Number.isFinite)) {
        const sum = parsed.reduce((total, value) => total + value, 0);
        if (sum > 0.98 && sum < 1.02 && parsed.every(value => value > 0.1)) return parsed;
      }
    } catch {}
    return [...DEFAULT_RATIOS];
  }

  function saveRatios() {
    try { localStorage.setItem(STORAGE_COLUMNS, JSON.stringify(ratios)); } catch {}
  }

  function readOffice() {
    try {
      const office = localStorage.getItem(STORAGE_OFFICE);
      if (office === 'governador' || office === 'presidente') return office;
    } catch {}
    return 'presidente';
  }

  function saveOffice(office) {
    try { localStorage.setItem(STORAGE_OFFICE, office); } catch {}
  }

  function installChildStyle() {
    if (document.getElementById('broadcastLayoutControlsStyle')) return;
    const style = document.createElement('style');
    style.id = 'broadcastLayoutControlsStyle';
    style.textContent = `
      html.broadcast-layout-enabled .main-grid{
        transition:grid-template-columns .22s cubic-bezier(.2,.75,.25,1)!important;
      }
      html.broadcast-layout-enabled .main-grid.broadcast-resizing{
        transition:none!important;
        user-select:none!important;
      }
      html.broadcast-layout-enabled .broadcast-resizer{
        position:absolute!important;
        top:0!important;
        bottom:0!important;
        width:14px!important;
        z-index:80!important;
        cursor:col-resize!important;
        touch-action:none!important;
        background:transparent!important;
        outline:none!important;
      }
      html.broadcast-layout-enabled .broadcast-resizer::before{
        content:'';
        position:absolute;
        left:6px;
        top:8%;
        bottom:8%;
        width:2px;
        border-radius:999px;
        background:rgba(21,63,73,.18);
        transition:width .18s ease,background-color .18s ease,box-shadow .18s ease,opacity .18s ease;
      }
      html.broadcast-layout-enabled .broadcast-resizer:hover::before,
      html.broadcast-layout-enabled .broadcast-resizer:focus-visible::before,
      html.broadcast-layout-enabled .broadcast-resizer.is-active::before{
        width:4px;
        left:5px;
        background:#164b56;
        box-shadow:0 0 0 3px rgba(22,75,86,.08);
      }
      html.broadcast-layout-enabled .mobile-map-carousel-card,
      html.broadcast-layout-enabled .candidate-card,
      html.broadcast-layout-enabled .summary-box,
      html.broadcast-layout-enabled .details-tabs,
      html.broadcast-layout-enabled .map-head{
        transition:transform .28s cubic-bezier(.2,.75,.25,1),opacity .28s ease,border-color .28s ease,background-color .28s ease!important;
      }
      html.broadcast-layout-enabled .map-canvas svg path{
        transition:fill .42s cubic-bezier(.2,.75,.25,1),stroke .3s ease,opacity .3s ease!important;
      }
      html.broadcast-layout-enabled.broadcast-office-switching .main-grid{
        opacity:.94;
        transition:opacity .16s ease!important;
      }
      @media(prefers-reduced-motion:reduce){
        html.broadcast-layout-enabled .main-grid,
        html.broadcast-layout-enabled .mobile-map-carousel-card,
        html.broadcast-layout-enabled .candidate-card,
        html.broadcast-layout-enabled .summary-box,
        html.broadcast-layout-enabled .details-tabs,
        html.broadcast-layout-enabled .map-head,
        html.broadcast-layout-enabled .map-canvas svg path,
        html.broadcast-layout-enabled .broadcast-resizer::before{transition:none!important}
      }
    `;
    document.head.appendChild(style);
    document.documentElement.classList.add('broadcast-layout-enabled');
  }

  function installParentStyle() {
    let style = parentDoc.getElementById('broadcastWhiteHeaderStyle');
    if (!style) {
      style = parentDoc.createElement('style');
      style.id = 'broadcastWhiteHeaderStyle';
      parentDoc.head.appendChild(style);
    }
    style.textContent = `
      .studio-head{
        grid-template-columns:auto minmax(0,1fr) auto auto auto!important;
        background:#fff!important;
        color:#071522!important;
        border-bottom:1px solid #d7dfe2!important;
        box-shadow:0 1px 0 rgba(7,21,34,.04)!important;
      }
      .studio-head .brand img{filter:none!important}
      .studio-head .brand-divider{background:#d5dde0!important}
      .studio-title{color:#071522!important}
      .studio-title small{color:#65767d!important}
      .round-switch,.broadcast-office-switch{
        display:flex!important;
        align-items:center!important;
        gap:3px!important;
        padding:3px!important;
        border:1px solid #d3dadd!important;
        border-radius:9px!important;
        background:#f5f7f7!important;
        white-space:nowrap!important;
      }
      .round-switch button,.broadcast-office-switch button{
        appearance:none!important;
        border:0!important;
        border-radius:6px!important;
        background:transparent!important;
        color:#53636a!important;
        padding:6px 9px!important;
        font:800 10px/1 inherit!important;
        cursor:pointer!important;
        transition:background-color .18s ease,color .18s ease,transform .18s ease!important;
      }
      .round-switch button.active,.broadcast-office-switch button.active{
        background:#071522!important;
        color:#fff!important;
      }
      .round-switch button:active,.broadcast-office-switch button:active{transform:scale(.97)!important}
      .round-switch button:focus-visible,.broadcast-office-switch button:focus-visible{outline:2px solid #164b56!important;outline-offset:2px!important}
      .live-state{color:#405158!important}
      .live-state .clock{color:#071522!important}
      .live-dot{background:#2f9b61!important}
      @media(max-width:1120px){
        .studio-head{gap:8px!important}
        .broadcast-office-switch button,.round-switch button{padding:5px 7px!important;font-size:9px!important}
        .studio-title small{display:none!important}
      }
      @media(max-width:760px){.broadcast-office-switch{display:none!important}}
      @media(prefers-reduced-motion:reduce){.round-switch button,.broadcast-office-switch button{transition:none!important}}
    `;
  }

  function ensureParentOfficeSwitch() {
    installParentStyle();
    const head = parentDoc.querySelector('.studio-head');
    const roundSwitch = head?.querySelector('.round-switch');
    if (!head || !roundSwitch) return;

    let officeSwitch = head.querySelector('.broadcast-office-switch');
    if (!officeSwitch) {
      officeSwitch = parentDoc.createElement('div');
      officeSwitch.className = 'broadcast-office-switch';
      officeSwitch.setAttribute('role', 'group');
      officeSwitch.setAttribute('aria-label', 'Cargo da eleição');
      officeSwitch.innerHTML = `
        <button type="button" data-broadcast-office="presidente">Presidente</button>
        <button type="button" data-broadcast-office="governador">Governador</button>`;
      head.insertBefore(officeSwitch, roundSwitch);
      officeSwitch.addEventListener('click', event => {
        const button = event.target.closest('[data-broadcast-office]');
        if (!button) return;
        selectOffice(button.dataset.broadcastOffice);
      });
    }
    syncParentOffice(readOffice());
  }

  function syncParentOffice(office) {
    const officeSwitch = parentDoc.querySelector('.broadcast-office-switch');
    officeSwitch?.querySelectorAll('[data-broadcast-office]').forEach(button => {
      const active = button.dataset.broadcastOffice === office;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    const small = parentDoc.querySelector('.studio-title small');
    if (small) small.textContent = `${OFFICE_LABELS[office] || 'Presidente'} • Eleições 2026`;
  }

  function selectOffice(office) {
    if (!(office in OFFICE_LABELS)) return;
    saveOffice(office);
    syncParentOffice(office);
    const button = document.querySelector(`.office-btn[data-office="${office}"]`);
    if (!button) return;
    if (button.classList.contains('active')) return;

    document.documentElement.classList.add('broadcast-office-switching');
    button.click();
    window.setTimeout(() => document.documentElement.classList.remove('broadcast-office-switching'), 340);
  }

  function syncOfficeFromApp() {
    const active = document.querySelector('.office-btn[data-office].active');
    const office = active?.dataset.office;
    if (!(office in OFFICE_LABELS)) return;
    saveOffice(office);
    syncParentOffice(office);
  }

  function createDivider(name, label) {
    const divider = document.createElement('div');
    divider.className = 'broadcast-resizer';
    divider.dataset.divider = name;
    divider.tabIndex = 0;
    divider.setAttribute('role', 'separator');
    divider.setAttribute('aria-orientation', 'vertical');
    divider.setAttribute('aria-label', label);
    divider.addEventListener('dblclick', resetColumns);
    divider.addEventListener('keydown', event => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      const direction = event.key === 'ArrowRight' ? 1 : -1;
      nudgeDivider(name, direction * (event.shiftKey ? 48 : 18));
    });
    divider.addEventListener('pointerdown', event => beginDrag(name, divider, event));
    return divider;
  }

  function panelMinimums(available) {
    return {
      left: Math.min(280, available * 0.2),
      center: Math.min(360, available * 0.26),
      right: Math.min(500, available * 0.34)
    };
  }

  function widthsFromRatios() {
    if (!grid) return null;
    const available = Math.max(1, grid.clientWidth - GAP * 2);
    return {
      available,
      left: available * ratios[0],
      center: available * ratios[1],
      right: available * ratios[2]
    };
  }

  function normalizeWidths(left, center, right, available) {
    const mins = panelMinimums(available);
    left = Math.max(mins.left, left);
    center = Math.max(mins.center, center);
    right = Math.max(mins.right, right);
    const total = left + center + right;
    if (total > available) {
      const excess = total - available;
      const shrinkable = Math.max(1,
        (left - mins.left) + (center - mins.center) + (right - mins.right));
      left -= excess * ((left - mins.left) / shrinkable);
      center -= excess * ((center - mins.center) / shrinkable);
      right -= excess * ((right - mins.right) / shrinkable);
    }
    const sum = left + center + right;
    return [left / sum, center / sum, right / sum];
  }

  function setPanelZoom(panel, scale) {
    if (!panel) return;
    const safeScale = clamp(scale, 0.86, 1.14);
    panel.style.setProperty('zoom', safeScale.toFixed(3), 'important');
    panel.style.setProperty('width', `${(100 / safeScale).toFixed(3)}%`, 'important');
    panel.style.setProperty('height', `${(100 / safeScale).toFixed(3)}%`, 'important');
    panel.style.setProperty('justify-self', 'start', 'important');
    panel.style.setProperty('align-self', 'start', 'important');
  }

  function applyPanelZoom(widths) {
    const leftBase = widths.available * DEFAULT_RATIOS[0];
    const centerBase = widths.available * DEFAULT_RATIOS[1];
    const rightBase = widths.available * DEFAULT_RATIOS[2];
    setPanelZoom(leftPanel, widths.left / leftBase);
    setPanelZoom(mapPanel, widths.center / centerBase);
    setPanelZoom(resultsPanel, widths.right / rightBase);
  }

  function applyLayout({ persist = false } = {}) {
    if (!grid || !leftPanel || !mapPanel || !resultsPanel) return;
    const available = Math.max(1, grid.clientWidth - GAP * 2);
    ratios = normalizeWidths(
      available * ratios[0],
      available * ratios[1],
      available * ratios[2],
      available
    );
    const widths = widthsFromRatios();
    if (!widths) return;

    grid.style.setProperty(
      'grid-template-columns',
      `${widths.left}px ${widths.center}px ${widths.right}px`,
      'important'
    );
    grid.style.setProperty('gap', `${GAP}px`, 'important');
    grid.style.setProperty('position', 'relative', 'important');

    const dividerOneX = widths.left + GAP / 2;
    const dividerTwoX = widths.left + GAP + widths.center + GAP / 2;
    if (dividerA) dividerA.style.left = `${dividerOneX - 7}px`;
    if (dividerB) dividerB.style.left = `${dividerTwoX - 7}px`;

    dividerA?.setAttribute('aria-valuenow', Math.round(ratios[0] * 100));
    dividerB?.setAttribute('aria-valuenow', Math.round((ratios[0] + ratios[1]) * 100));
    applyPanelZoom(widths);
    if (persist) saveRatios();
  }

  function nudgeDivider(name, delta) {
    const widths = widthsFromRatios();
    if (!widths) return;
    const mins = panelMinimums(widths.available);

    if (name === 'a') {
      const pair = widths.left + widths.center;
      const nextLeft = clamp(widths.left + delta, mins.left, pair - mins.center);
      ratios = [nextLeft / widths.available, (pair - nextLeft) / widths.available, widths.right / widths.available];
    } else {
      const pair = widths.center + widths.right;
      const nextCenter = clamp(widths.center + delta, mins.center, pair - mins.right);
      ratios = [widths.left / widths.available, nextCenter / widths.available, (pair - nextCenter) / widths.available];
    }
    applyLayout({ persist: true });
  }

  function beginDrag(name, divider, event) {
    if (event.button !== undefined && event.button !== 0) return;
    const widths = widthsFromRatios();
    if (!widths) return;
    const mins = panelMinimums(widths.available);
    const startX = event.clientX;
    const start = { ...widths };

    grid.classList.add('broadcast-resizing');
    divider.classList.add('is-active');
    divider.setPointerCapture?.(event.pointerId);

    const move = moveEvent => {
      const delta = moveEvent.clientX - startX;
      if (name === 'a') {
        const pair = start.left + start.center;
        const nextLeft = clamp(start.left + delta, mins.left, pair - mins.center);
        ratios = [nextLeft / start.available, (pair - nextLeft) / start.available, start.right / start.available];
      } else {
        const pair = start.center + start.right;
        const nextCenter = clamp(start.center + delta, mins.center, pair - mins.right);
        ratios = [start.left / start.available, nextCenter / start.available, (pair - nextCenter) / start.available];
      }
      applyLayout();
    };

    const end = () => {
      divider.removeEventListener('pointermove', move);
      divider.removeEventListener('pointerup', end);
      divider.removeEventListener('pointercancel', end);
      divider.classList.remove('is-active');
      grid.classList.remove('broadcast-resizing');
      saveRatios();
    };

    divider.addEventListener('pointermove', move);
    divider.addEventListener('pointerup', end, { once: true });
    divider.addEventListener('pointercancel', end, { once: true });
  }

  function resetColumns() {
    ratios = [...DEFAULT_RATIOS];
    applyLayout({ persist: true });
  }

  function ensureGridControls() {
    const nextGrid = document.querySelector('.main-grid');
    const nextLeft = nextGrid?.querySelector('.broadcast-candidates-column');
    const nextMap = nextGrid?.querySelector('.map-panel');
    const nextResults = nextGrid?.querySelector('.results-panel');
    if (!nextGrid || !nextLeft || !nextMap || !nextResults) return false;

    grid = nextGrid;
    leftPanel = nextLeft;
    mapPanel = nextMap;
    resultsPanel = nextResults;

    installChildStyle();
    if (!dividerA || !dividerA.isConnected) {
      dividerA = createDivider('a', 'Redimensionar widgets e mapa');
      grid.appendChild(dividerA);
    }
    if (!dividerB || !dividerB.isConnected) {
      dividerB = createDivider('b', 'Redimensionar mapa e apuração');
      grid.appendChild(dividerB);
    }

    if (!resizeObserver) {
      resizeObserver = new ResizeObserver(() => applyLayout());
      resizeObserver.observe(grid);
    }
    applyLayout();
    return true;
  }

  function applyInitialOffice() {
    const desired = readOffice();
    const button = document.querySelector(`.office-btn[data-office="${desired}"]`);
    if (button && !button.classList.contains('active')) button.click();
    syncOfficeFromApp();
  }

  function boot() {
    ensureParentOfficeSwitch();
    installChildStyle();
    let attempts = 0;
    const timer = window.setInterval(() => {
      attempts += 1;
      ensureParentOfficeSwitch();
      ensureGridControls();
      if (attempts === 2 || attempts === 6) applyInitialOffice();
      if (attempts > 20 && grid) window.clearInterval(timer);
    }, 250);

    document.querySelector('.office-nav')?.addEventListener('click', event => {
      if (event.target.closest('.office-btn[data-office]')) window.setTimeout(syncOfficeFromApp, 0);
    });

    window.addEventListener('resize', () => applyLayout());
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
