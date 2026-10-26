(() => {
  'use strict';

  const STORAGE_KEY = 'apurabrasil.round.2026';
  const SECOND_ROUND_ONLY_OFFICES = new Set(['presidente','governador']);

  function readRound() {
    try {
      const saved = Number(localStorage.getItem(STORAGE_KEY));
      if (saved === 1 || saved === 2) return saved;
    } catch {}
    return 2;
  }

  let currentRound = readRound();
  let selectorSync = () => {};

  function saveRound(round) {
    currentRound = round === 1 ? 1 : 2;
    try { localStorage.setItem(STORAGE_KEY, String(currentRound)); } catch {}
  }

  function refreshCurrentData(previousRound, source = 'selector') {
    const detail = {
      round: currentRound,
      previousRound,
      source
    };

    window.dispatchEvent(new CustomEvent('apura:round-changed', { detail }));

    // O dashboard já possui uma rotina própria de atualização. Acioná-la mantém
    // mapa, UF/município/distrito, zoom, abas, filtros e scroll intactos.
    requestAnimationFrame(() => {
      const refreshButton = document.getElementById('refreshButton');
      if (refreshButton) refreshButton.click();
    });
  }

  function setRound(round, source = 'api') {
    const next = Number(round);
    if (next !== 1 && next !== 2) return currentRound;
    if (next === currentRound) {
      selectorSync();
      return currentRound;
    }

    const previousRound = currentRound;
    saveRound(next);
    selectorSync();
    refreshCurrentData(previousRound, source);
    return currentRound;
  }

  const nativeFetch = window.fetch.bind(window);
  window.fetch = function(input, init) {
    try {
      const raw = typeof input === 'string' ? input : input?.url;
      if (raw) {
        const url = new URL(raw, window.location.origin);
        if (url.origin === window.location.origin && url.pathname === '/api/results') {
          const year = Number(url.searchParams.get('year') || 2026);
          const office = url.searchParams.get('office') || 'presidente';
          if (year === 2026) {
            // Cargos legislativos continuam vinculados ao 1º turno, mas isso não
            // altera a seleção global do usuário. Assim, voltar para Presidente
            // mantém exatamente o turno que estava selecionado.
            const effectiveRound = currentRound === 2 && !SECOND_ROUND_ONLY_OFFICES.has(office) ? 1 : currentRound;
            url.searchParams.set('round', String(effectiveRound));
            input = url.pathname + url.search;
          }
        }
      }
    } catch {}
    return nativeFetch(input, init);
  };

  function buildSelector() {
    if (document.getElementById('roundSelector')) return;
    const anchor = document.querySelector('.source-status') || document.querySelector('.topbar');
    if (!anchor) return;

    const wrap = document.createElement('div');
    wrap.id = 'roundSelector';
    wrap.className = 'round-selector';
    wrap.setAttribute('role','group');
    wrap.setAttribute('aria-label','Turno da eleição de 2026');
    wrap.innerHTML = `
      <button type="button" data-round="1">1º turno</button>
      <button type="button" data-round="2">2º turno</button>`;

    anchor.parentNode.insertBefore(wrap, anchor);

    const style = document.createElement('style');
    style.textContent = `
      .round-selector{display:flex;align-items:center;gap:4px;padding:3px;border:1px solid rgba(15,23,42,.16);border-radius:10px;background:#fff;white-space:nowrap}
      .round-selector button{appearance:none;border:0;background:transparent;color:#475569;font:700 12px/1 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;padding:8px 10px;border-radius:7px;cursor:pointer}
      .round-selector button.active{background:#0f172a;color:#fff}
      .round-selector button:focus-visible{outline:2px solid #2563eb;outline-offset:2px}
      @media(max-width:900px){.round-selector{order:3;width:100%;justify-content:center}.round-selector button{flex:1}}
    `;
    document.head.appendChild(style);

    selectorSync = function sync() {
      wrap.querySelectorAll('[data-round]').forEach(button => {
        const active = Number(button.dataset.round) === currentRound;
        button.classList.toggle('active', active);
        button.setAttribute('aria-pressed', active ? 'true' : 'false');
      });
    };

    wrap.addEventListener('click', event => {
      const button = event.target.closest('[data-round]');
      if (!button) return;
      setRound(Number(button.dataset.round), 'selector');
    });

    selectorSync();
  }

  // Sincroniza contextos irmãos (por exemplo, iframe da Central ao Vivo) sem
  // reinicializar o documento ou reconstruir o mapa.
  window.addEventListener('storage', event => {
    if (event.key !== STORAGE_KEY) return;
    const next = Number(event.newValue);
    if (next !== 1 && next !== 2 || next === currentRound) return;
    const previousRound = currentRound;
    currentRound = next;
    selectorSync();
    refreshCurrentData(previousRound, 'storage');
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', buildSelector, {once:true});
  else buildSelector();

  window.ApuraBrasilRound = {
    get: () => currentRound,
    set: round => setRound(round, 'api'),
    refresh: () => refreshCurrentData(currentRound, 'api-refresh')
  };
})();
