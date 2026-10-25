(() => {
  'use strict';

  if (window.__apuraBrasilBroadcastControlsV2Installed) return;

  function isBroadcastEmbed() {
    try {
      return window.parent !== window && window.parent.location.pathname.startsWith('/ao-vivo');
    } catch {
      return false;
    }
  }

  if (!isBroadcastEmbed()) return;
  window.__apuraBrasilBroadcastControlsV2Installed = true;

  const parentDoc = window.parent.document;
  const STORAGE_COLUMNS = 'apurabrasil.broadcast.columns.v2';
  const STORAGE_OFFICE = 'apurabrasil.broadcast.office.v1';
  const DEFAULT_RATIOS = [0.25, 0.33, 0.42];
  const GAP = 10;
  const OFFICE_LABELS = { presidente: 'Presidente', governador: 'Governador' };

  let grid;
  let leftPanel;
  let mapPanel;
  let resultsPanel;
  let dividerA;
  let dividerB;
  let resizeObserver;
  let ratios = readRatios();
  let raf = 0;

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  function readRatios() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_COLUMNS) || 'null');
      if (Array.isArray(parsed) && parsed.length === 3 && parsed.every(Number.isFinite)) {
        const sum = parsed.reduce((a, b) => a + b, 0);
        if (sum > .995 && sum < 1.005 && parsed.every(v => v >= .16 && v <= .56)) return parsed;
      }
    } catch {}
    return [...DEFAULT_RATIOS];
  }

  function saveRatios() {
    try { localStorage.setItem(STORAGE_COLUMNS, JSON.stringify(ratios)); } catch {}
  }

  function readOffice() {
    try {
      const value = localStorage.getItem(STORAGE_OFFICE);
      return value === 'governador' ? 'governador' : 'presidente';
    } catch {
      return 'presidente';
    }
  }

  function saveOffice(office) {
    try { localStorage.setItem(STORAGE_OFFICE, office); } catch {}
  }

  function installChildStyles() {
    if (document.getElementById('broadcastLayoutControlsV2Style')) return;
    const style = document.createElement('style');
    style.id = 'broadcastLayoutControlsV2Style';
    style.textContent = `
      html.broadcast-layout-v2 .main-grid{
        position:relative!important;
        overflow:hidden!important;
        transition:grid-template-columns .24s cubic-bezier(.2,.75,.25,1)!important;
      }
      html.broadcast-layout-v2 .main-grid.broadcast-resizing{
        transition:none!important;
        user-select:none!important;
        cursor:col-resize!important;
      }
      html.broadcast-layout-v2 .broadcast-resizer-v2{
        position:absolute!important;
        top:0!important;
        bottom:0!important;
        z-index:120!important;
        width:18px!important;
        transform:translateX(-9px)!important;
        cursor:col-resize!important;
        touch-action:none!important;
        background:transparent!important;
        outline:none!important;
      }
      html.broadcast-layout-v2 .broadcast-resizer-v2::before{
        content:'';
        position:absolute;
        left:8px;
        top:5%;
        bottom:5%;
        width:2px;
        border-radius:999px;
        background:rgba(22,75,86,.24);
        transition:width .16s ease,left .16s ease,background-color .16s ease,box-shadow .16s ease;
      }
      html.broadcast-layout-v2 .broadcast-resizer-v2:hover::before,
      html.broadcast-layout-v2 .broadcast-resizer-v2:focus-visible::before,
      html.broadcast-layout-v2 .broadcast-resizer-v2.is-active::before{
        width:4px;
        left:7px;
        background:#164b56;
        box-shadow:0 0 0 3px rgba(22,75,86,.09);
      }
      html.broadcast-layout-v2 .broadcast-scaled-panel{
        transform-origin:top left!important;
        box-sizing:border-box!important;
        min-width:0!important;
        transition:transform .18s cubic-bezier(.2,.75,.25,1),width .18s cubic-bezier(.2,.75,.25,1),height .18s cubic-bezier(.2,.75,.25,1)!important;
      }
      html.broadcast-layout-v2 .main-grid.broadcast-resizing .broadcast-scaled-panel{
        transition:none!important;
      }
      html.broadcast-layout-v2 .mobile-map-carousel-card,
      html.broadcast-layout-v2 .candidate-card,
      html.broadcast-layout-v2 .summary-box,
      html.broadcast-layout-v2 .details-tabs,
      html.broadcast-layout-v2 .map-head{
        transition:opacity .24s ease,border-color .24s ease,background-color .24s ease!important;
      }
      html.broadcast-layout-v2 .map-canvas svg path{
        transition:fill .44s cubic-bezier(.2,.75,.25,1),stroke .28s ease,opacity .28s ease!important;
      }
      html.broadcast-layout-v2.broadcast-office-switching .main-grid{opacity:.95;transition:opacity .16s ease!important}
      @media(prefers-reduced-motion:reduce){
        html.broadcast-layout-v2 .main-grid,
        html.broadcast-layout-v2 .broadcast-scaled-panel,
        html.broadcast-layout-v2 .mobile-map-carousel-card,
        html.broadcast-layout-v2 .candidate-card,
        html.broadcast-layout-v2 .summary-box,
        html.broadcast-layout-v2 .details-tabs,
        html.broadcast-layout-v2 .map-head,
        html.broadcast-layout-v2 .map-canvas svg path,
        html.broadcast-layout-v2 .broadcast-resizer-v2::before{transition:none!important}
      }
    `;
    document.head.appendChild(style);
    document.documentElement.classList.add('broadcast-layout-v2');
  }

  function installParentStyles() {
    let style = parentDoc.getElementById('broadcastWhiteHeaderStyleV2');
    if (!style) {
      style = parentDoc.createElement('style');
      style.id = 'broadcastWhiteHeaderStyleV2';
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
        display:flex!important;align-items:center!important;gap:3px!important;padding:3px!important;
        border:1px solid #d3dadd!important;border-radius:9px!important;background:#f5f7f7!important;white-space:nowrap!important
      }
      .round-switch button,.broadcast-office-switch button{
        appearance:none!important;border:0!important;border-radius:6px!important;background:transparent!important;
        color:#53636a!important;padding:6px 9px!important;font:800 10px/1 inherit!important;cursor:pointer!important;
        transition:background-color .18s ease,color .18s ease,transform .18s ease!important
      }
      .round-switch button.active,.broadcast-office-switch button.active{background:#071522!important;color:#fff!important}
      .round-switch button:active,.broadcast-office-switch button:active{transform:scale(.97)!important}
      .round-switch button:focus-visible,.broadcast-office-switch button:focus-visible{outline:2px solid #164b56!important;outline-offset:2px!important}
      .live-state{color:#405158!important}.live-state .clock{color:#071522!important}.live-dot{background:#2f9b61!important}
      @media(max-width:1120px){.studio-head{gap:8px!important}.broadcast-office-switch button,.round-switch button{padding:5px 7px!important;font-size:9px!important}.studio-title small{display:none!important}}
      @media(max-width:760px){.broadcast-office-switch{display:none!important}}
      @media(prefers-reduced-motion:reduce){.round-switch button,.broadcast-office-switch button{transition:none!important}}
    `;
  }

  function syncParentOffice(office) {
    parentDoc.querySelectorAll('[data-broadcast-office]').forEach(button => {
      const active = button.dataset.broadcastOffice === office;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    const subtitle = parentDoc.querySelector('.studio-title small');
    if (subtitle) subtitle.textContent = `${OFFICE_LABELS[office] || 'Presidente'} • Eleições 2026`;
  }

  function selectOffice(office) {
    if (!(office in OFFICE_LABELS)) return;
    saveOffice(office);
    syncParentOffice(office);
    const button = document.querySelector(`.office-btn[data-office="${office}"]`);
    if (!button || button.classList.contains('active')) return;
    document.documentElement.classList.add('broadcast-office-switching');
    button.click();
    window.setTimeout(() => document.documentElement.classList.remove('broadcast-office-switching'), 320);
  }

  function ensureOfficeSwitch() {
    installParentStyles();
    const header = parentDoc.querySelector('.studio-head');
    const roundSwitch = header?.querySelector('.round-switch');
    if (!header || !roundSwitch) return;
    let officeSwitch = header.querySelector('.broadcast-office-switch');
    if (!officeSwitch) {
      officeSwitch = parentDoc.createElement('div');
      officeSwitch.className = 'broadcast-office-switch';
      officeSwitch.setAttribute('role', 'group');
      officeSwitch.setAttribute('aria-label', 'Cargo da eleição');
      officeSwitch.innerHTML = '<button type="button" data-broadcast-office="presidente">Presidente</button><button type="button" data-broadcast-office="governador">Governador</button>';
      header.insertBefore(officeSwitch, roundSwitch);
      officeSwitch.addEventListener('click', event => {
        const button = event.target.closest('[data-broadcast-office]');
        if (button) selectOffice(button.dataset.broadcastOffice);
      });
    }
    syncParentOffice(readOffice());
  }

  function panelMins(available) {
    return {
      left: Math.min(300, available * .21),
      center: Math.min(390, available * .27),
      right: Math.min(520, available * .35)
    };
  }

  function normalizeWidths(left, center, right, available) {
    const min = panelMins(available);
    left = Math.max(min.left, left);
    center = Math.max(min.center, center);
    right = Math.max(min.right, right);
    let sum = left + center + right;
    if (sum > available) {
      const shrinkable = Math.max(1, (left - min.left) + (center - min.center) + (right - min.right));
      const excess = sum - available;
      left -= excess * ((left - min.left) / shrinkable);
      center -= excess * ((center - min.center) / shrinkable);
      right -= excess * ((right - min.right) / shrinkable);
    }
    sum = left + center + right;
    return [left / sum, center / sum, right / sum];
  }

  function widths() {
    if (!grid) return null;
    const available = Math.max(1, grid.clientWidth - GAP * 2);
    return {
      available,
      left: available * ratios[0],
      center: available * ratios[1],
      right: available * ratios[2]
    };
  }

  function scalePanel(panel, scale) {
    if (!panel) return;
    const safe = clamp(scale, .90, 1.10);
    panel.classList.add('broadcast-scaled-panel');
    panel.style.removeProperty('zoom');
    panel.style.setProperty('transform', `scale(${safe.toFixed(4)})`, 'important');
    panel.style.setProperty('width', `${(100 / safe).toFixed(4)}%`, 'important');
    panel.style.setProperty('height', `${(100 / safe).toFixed(4)}%`, 'important');
    panel.style.setProperty('justify-self', 'start', 'important');
    panel.style.setProperty('align-self', 'start', 'important');
  }

  function applyScales(w) {
    scalePanel(leftPanel, w.left / (w.available * DEFAULT_RATIOS[0]));
    scalePanel(mapPanel, w.center / (w.available * DEFAULT_RATIOS[1]));
    scalePanel(resultsPanel, w.right / (w.available * DEFAULT_RATIOS[2]));
  }

  function applyLayout({ persist = false } = {}) {
    if (!grid || !leftPanel || !mapPanel || !resultsPanel) return;
    const available = Math.max(1, grid.clientWidth - GAP * 2);
    ratios = normalizeWidths(available * ratios[0], available * ratios[1], available * ratios[2], available);
    const w = widths();
    if (!w) return;

    grid.style.setProperty('grid-template-columns', `${w.left}px ${w.center}px ${w.right}px`, 'important');
    grid.style.setProperty('gap', `${GAP}px`, 'important');

    if (dividerA) dividerA.style.left = `${w.left + GAP / 2}px`;
    if (dividerB) dividerB.style.left = `${w.left + GAP + w.center + GAP / 2}px`;

    dividerA?.setAttribute('aria-valuenow', String(Math.round(ratios[0] * 100)));
    dividerB?.setAttribute('aria-valuenow', String(Math.round((ratios[0] + ratios[1]) * 100)));
    applyScales(w);
    if (persist) saveRatios();
  }

  function scheduleLayout(persist = false) {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => applyLayout({ persist }));
  }

  function resetColumns() {
    ratios = [...DEFAULT_RATIOS];
    try { localStorage.removeItem(STORAGE_COLUMNS); } catch {}
    scheduleLayout(true);
  }

  function nudge(name, delta) {
    const w = widths();
    if (!w) return;
    const min = panelMins(w.available);
    if (name === 'a') {
      const pair = w.left + w.center;
      const nextLeft = clamp(w.left + delta, min.left, pair - min.center);
      ratios = [nextLeft / w.available, (pair - nextLeft) / w.available, w.right / w.available];
    } else {
      const pair = w.center + w.right;
      const nextCenter = clamp(w.center + delta, min.center, pair - min.right);
      ratios = [w.left / w.available, nextCenter / w.available, (pair - nextCenter) / w.available];
    }
    scheduleLayout(true);
  }

  function createDivider(name, label) {
    const node = document.createElement('div');
    node.className = 'broadcast-resizer-v2';
    node.dataset.divider = name;
    node.tabIndex = 0;
    node.setAttribute('role', 'separator');
    node.setAttribute('aria-orientation', 'vertical');
    node.setAttribute('aria-label', label);
    node.addEventListener('dblclick', resetColumns);
    node.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
      event.preventDefault();
      nudge(name, (event.key === 'ArrowRight' ? 1 : -1) * (event.shiftKey ? 42 : 16));
    });
    node.addEventListener('pointerdown', event => startDrag(name, node, event));
    return node;
  }

  function startDrag(name, divider, event) {
    if (event.button != null && event.button !== 0) return;
    const start = widths();
    if (!start) return;
    const min = panelMins(start.available);
    const startX = event.clientX;
    grid.classList.add('broadcast-resizing');
    divider.classList.add('is-active');
    divider.setPointerCapture?.(event.pointerId);

    const move = e => {
      const delta = e.clientX - startX;
      if (name === 'a') {
        const pair = start.left + start.center;
        const nextLeft = clamp(start.left + delta, min.left, pair - min.center);
        ratios = [nextLeft / start.available, (pair - nextLeft) / start.available, start.right / start.available];
      } else {
        const pair = start.center + start.right;
        const nextCenter = clamp(start.center + delta, min.center, pair - min.right);
        ratios = [start.left / start.available, nextCenter / start.available, (pair - nextCenter) / start.available];
      }
      scheduleLayout(false);
    };

    const end = () => {
      divider.removeEventListener('pointermove', move);
      divider.removeEventListener('pointerup', end);
      divider.removeEventListener('pointercancel', end);
      divider.classList.remove('is-active');
      grid.classList.remove('broadcast-resizing');
      saveRatios();
      scheduleLayout(false);
    };

    divider.addEventListener('pointermove', move);
    divider.addEventListener('pointerup', end, { once: true });
    divider.addEventListener('pointercancel', end, { once: true });
  }

  function ensureGrid() {
    const nextGrid = document.querySelector('.main-grid');
    const nextLeft = nextGrid?.querySelector('.broadcast-candidates-column');
    const nextMap = nextGrid?.querySelector('.map-panel');
    const nextResults = nextGrid?.querySelector('.results-panel');
    if (!nextGrid || !nextLeft || !nextMap || !nextResults) return false;

    grid = nextGrid;
    leftPanel = nextLeft;
    mapPanel = nextMap;
    resultsPanel = nextResults;
    installChildStyles();

    grid.querySelectorAll('.broadcast-resizer').forEach(node => node.remove());
    if (!dividerA?.isConnected) {
      dividerA = createDivider('a', 'Redimensionar widgets e mapa');
      grid.appendChild(dividerA);
    }
    if (!dividerB?.isConnected) {
      dividerB = createDivider('b', 'Redimensionar mapa e apuração');
      grid.appendChild(dividerB);
    }

    if (!resizeObserver) {
      resizeObserver = new ResizeObserver(() => scheduleLayout(false));
      resizeObserver.observe(grid);
    }
    scheduleLayout(false);
    return true;
  }

  function applyInitialOffice() {
    const desired = readOffice();
    const button = document.querySelector(`.office-btn[data-office="${desired}"]`);
    if (button && !button.classList.contains('active')) button.click();
    syncParentOffice(desired);
  }

  function boot() {
    ensureOfficeSwitch();
    installChildStyles();
    let attempts = 0;
    const timer = setInterval(() => {
      attempts += 1;
      ensureOfficeSwitch();
      const ready = ensureGrid();
      if (attempts === 2 || attempts === 6) applyInitialOffice();
      if (ready && attempts > 18) clearInterval(timer);
    }, 220);

    document.querySelector('.office-nav')?.addEventListener('click', event => {
      const button = event.target.closest('.office-btn[data-office]');
      if (!button) return;
      const office = button.dataset.office;
      if (!(office in OFFICE_LABELS)) return;
      saveOffice(office);
      setTimeout(() => syncParentOffice(office), 0);
    });

    addEventListener('resize', () => scheduleLayout(false));
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
