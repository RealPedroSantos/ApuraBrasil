(() => {
  'use strict';

  const VISUAL_IDS = ['chamberVisual', 'secondaryChamberVisual'];
  const state = new WeakMap();

  function injectStyles() {
    if (document.getElementById('seatInteractionStyles')) return;
    const style = document.createElement('style');
    style.id = 'seatInteractionStyles';
    style.textContent = `
      .chamber-visual .seat-dot{cursor:pointer;transition:opacity .16s ease,filter .16s ease,box-shadow .16s ease,scale .16s ease;outline:none;}
      .chamber-visual .seat-dot:hover,.chamber-visual .seat-dot:focus-visible,.chamber-visual .seat-dot.is-selected{scale:1.55;filter:saturate(1.18) brightness(1.06);box-shadow:0 0 0 2px #fff,0 0 0 4px #263e47,0 5px 14px rgba(0,0,0,.25);z-index:8;}
      .chamber-visual.is-filtering .seat-dot:not(.is-party-match){opacity:.12!important;filter:saturate(.2);}
      .chamber-visual.is-filtering .seat-dot.is-party-match{opacity:1!important;scale:1.12;z-index:4;}
      .seat-interaction-card{position:absolute;left:8px;top:8px;z-index:20;max-width:min(260px,calc(100% - 16px));padding:8px 10px;border:1px solid rgba(38,62,71,.25);border-radius:8px;background:rgba(255,255,255,.96);box-shadow:0 5px 18px rgba(0,0,0,.12);pointer-events:none;opacity:0;transform:translateY(-3px);transition:opacity .15s ease,transform .15s ease;color:#172027;}
      .seat-interaction-card.is-visible{opacity:1;transform:none;}
      .seat-interaction-card strong{display:block;font-size:12px;line-height:1.15;}
      .seat-interaction-card span{display:block;margin-top:3px;font-size:9px;line-height:1.25;color:#667075;font-weight:700;}
      .chamber-legend .legend-item{cursor:pointer;border-radius:999px;padding:3px 5px;transition:background .15s ease,opacity .15s ease;user-select:none;}
      .chamber-legend .legend-item:hover,.chamber-legend .legend-item:focus-visible{background:#e6e9e9;outline:none;}
      .chamber-legend .legend-item.is-active{background:#263e47;color:#fff;}
      .chamber-legend.is-filtering .legend-item:not(.is-active){opacity:.42;}
      @media(max-width:720px){
        .chamber-visual .seat-dot:hover{scale:1;box-shadow:0 0 0 1px rgba(0,0,0,.08);}
        .chamber-visual .seat-dot.is-selected,.chamber-visual .seat-dot:focus-visible{scale:1.7;box-shadow:0 0 0 2px #fff,0 0 0 4px #263e47,0 4px 12px rgba(0,0,0,.28);}
        .seat-interaction-card{left:6px;top:6px;padding:7px 8px;}
      }
      @media(prefers-reduced-motion:reduce){.chamber-visual .seat-dot,.seat-interaction-card,.chamber-legend .legend-item{transition:none!important;}}
    `;
    document.head.appendChild(style);
  }

  function normalizeParty(value) {
    return String(value || '').trim().replace(/\s+/g, ' ');
  }

  function compactSeat(seat) {
    if (!(seat instanceof HTMLElement)) return;

    if (seat.dataset.compactSeat !== '1') {
      const left = Number.parseFloat(seat.style.left);
      const top = Number.parseFloat(seat.style.top);
      const width = Number.parseFloat(seat.style.width);
      if ([left, top, width].every(Number.isFinite)) {
        const mobile = window.matchMedia('(max-width: 720px)').matches;
        const xFactor = mobile ? 0.86 : 0.82;
        const yFactor = mobile ? 0.91 : 0.88;
        const sizeFactor = mobile ? 1.42 : 1.60;
        const baseline = 93;

        seat.style.left = `${50 + (left - 50) * xFactor}%`;
        seat.style.top = `${baseline - (baseline - top) * yFactor}%`;
        seat.style.width = `${width * sizeFactor}px`;
        seat.style.height = `${width * sizeFactor}px`;
        seat.dataset.compactSeat = '1';
      }
    }

    if (seat.dataset.interactiveSeat === '1') return;
    seat.dataset.interactiveSeat = '1';
    seat.dataset.party = normalizeParty(seat.getAttribute('title')) || 'Em disputa';
    seat.tabIndex = 0;
    seat.setAttribute('role', 'button');
    seat.setAttribute('aria-label', `Cadeira de ${seat.dataset.party}`);
  }

  function ensureCard(visual) {
    let card = visual.querySelector(':scope > .seat-interaction-card');
    if (!card) {
      card = document.createElement('div');
      card.className = 'seat-interaction-card';
      card.setAttribute('aria-live', 'polite');
      visual.appendChild(card);
    }
    return card;
  }

  function compactVisual(visual) {
    if (!visual) return;
    visual.querySelectorAll('.seat-dot').forEach(compactSeat);
    ensureCard(visual);
  }

  function seatDetails(visual, seat) {
    const seats = [...visual.querySelectorAll('.seat-dot')];
    const party = normalizeParty(seat.dataset.party || seat.getAttribute('title')) || 'Em disputa';
    const sameParty = seats.filter(item => normalizeParty(item.dataset.party || item.getAttribute('title')) === party);
    const globalIndex = Math.max(0, seats.indexOf(seat)) + 1;
    const partyIndex = Math.max(0, sameParty.indexOf(seat)) + 1;
    return { party, globalIndex, partyIndex, partyTotal: sameParty.length, total: seats.length };
  }

  function showSeat(visual, seat, pinned = false) {
    if (!seat) return;
    const info = seatDetails(visual, seat);
    const card = ensureCard(visual);
    card.innerHTML = `<strong>${info.party}</strong><span>Cadeira ${info.partyIndex} de ${info.partyTotal} deste grupo • posição ${info.globalIndex} de ${info.total}${pinned ? ' • selecionada' : ''}</span>`;
    card.classList.add('is-visible');
  }

  function hideCard(visual) {
    const current = state.get(visual);
    if (current?.pinnedSeat || current?.party) return;
    visual.querySelector('.seat-interaction-card')?.classList.remove('is-visible');
  }

  function clearSeatSelection(visual) {
    visual.querySelectorAll('.seat-dot.is-selected').forEach(el => el.classList.remove('is-selected'));
    const current = state.get(visual) || {};
    current.pinnedSeat = null;
    state.set(visual, current);
  }

  function clearPartyFilter(visual, legend) {
    visual.classList.remove('is-filtering');
    visual.querySelectorAll('.seat-dot.is-party-match').forEach(el => el.classList.remove('is-party-match'));
    legend?.classList.remove('is-filtering');
    legend?.querySelectorAll('.legend-item.is-active').forEach(el => el.classList.remove('is-active'));
    const current = state.get(visual) || {};
    current.party = null;
    state.set(visual, current);
  }

  function applyPartyFilter(visual, legend, party, sourceItem) {
    const normalized = normalizeParty(party);
    const current = state.get(visual) || {};
    if (current.party === normalized) {
      clearPartyFilter(visual, legend);
      if (!current.pinnedSeat) visual.querySelector('.seat-interaction-card')?.classList.remove('is-visible');
      return;
    }

    clearSeatSelection(visual);
    clearPartyFilter(visual, legend);
    current.party = normalized;
    state.set(visual, current);

    const matches = [...visual.querySelectorAll('.seat-dot')].filter(seat => normalizeParty(seat.dataset.party) === normalized);
    visual.classList.add('is-filtering');
    matches.forEach(seat => seat.classList.add('is-party-match'));
    legend?.classList.add('is-filtering');
    sourceItem?.classList.add('is-active');

    const card = ensureCard(visual);
    card.innerHTML = `<strong>${normalized}</strong><span>${matches.length} ${matches.length === 1 ? 'cadeira destacada' : 'cadeiras destacadas'} • toque novamente na legenda para limpar</span>`;
    card.classList.add('is-visible');
  }

  function legendParty(item) {
    return normalizeParty(item?.textContent).replace(/\s+\d+\s*$/, '');
  }

  function bindLegend(visual) {
    const card = visual.closest('.chamber-card');
    const legend = card?.querySelector('.chamber-legend');
    if (!legend || legend.dataset.interactiveLegend === '1') return;
    legend.dataset.interactiveLegend = '1';

    legend.addEventListener('click', event => {
      const item = event.target.closest('.legend-item');
      if (!item) return;
      applyPartyFilter(visual, legend, legendParty(item), item);
    });

    legend.addEventListener('keydown', event => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      const item = event.target.closest('.legend-item');
      if (!item) return;
      event.preventDefault();
      applyPartyFilter(visual, legend, legendParty(item), item);
    });

    const makeFocusable = () => {
      legend.querySelectorAll('.legend-item').forEach(item => {
        item.tabIndex = 0;
        item.setAttribute('role', 'button');
        item.setAttribute('aria-label', `Destacar ${legendParty(item)}`);
      });
    };
    makeFocusable();
    new MutationObserver(makeFocusable).observe(legend, { childList: true, subtree: true });
  }

  function bindVisual(visual) {
    if (!visual || visual.dataset.interactiveVisual === '1') return;
    visual.dataset.interactiveVisual = '1';
    state.set(visual, { pinnedSeat: null, party: null });
    compactVisual(visual);
    bindLegend(visual);

    visual.addEventListener('pointerover', event => {
      const seat = event.target.closest('.seat-dot');
      if (!seat || !visual.contains(seat)) return;
      const current = state.get(visual);
      if (current?.pinnedSeat || current?.party) return;
      showSeat(visual, seat, false);
    });

    visual.addEventListener('pointerout', event => {
      const seat = event.target.closest('.seat-dot');
      if (!seat) return;
      hideCard(visual);
    });

    visual.addEventListener('focusin', event => {
      const seat = event.target.closest('.seat-dot');
      if (!seat) return;
      const current = state.get(visual);
      if (!current?.party) showSeat(visual, seat, Boolean(current?.pinnedSeat === seat));
    });

    visual.addEventListener('click', event => {
      const seat = event.target.closest('.seat-dot');
      const legend = visual.closest('.chamber-card')?.querySelector('.chamber-legend');
      if (!seat) {
        if (event.target === visual) {
          clearSeatSelection(visual);
          clearPartyFilter(visual, legend);
          visual.querySelector('.seat-interaction-card')?.classList.remove('is-visible');
        }
        return;
      }

      clearPartyFilter(visual, legend);
      const current = state.get(visual) || {};
      if (current.pinnedSeat === seat) {
        seat.classList.remove('is-selected');
        current.pinnedSeat = null;
        state.set(visual, current);
        visual.querySelector('.seat-interaction-card')?.classList.remove('is-visible');
        return;
      }

      clearSeatSelection(visual);
      seat.classList.add('is-selected');
      current.pinnedSeat = seat;
      state.set(visual, current);
      showSeat(visual, seat, true);
    });

    visual.addEventListener('keydown', event => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      const seat = event.target.closest('.seat-dot');
      if (!seat) return;
      event.preventDefault();
      seat.click();
    });

    const observer = new MutationObserver(() => {
      const current = state.get(visual) || {};
      current.pinnedSeat = null;
      current.party = null;
      state.set(visual, current);
      compactVisual(visual);
      bindLegend(visual);
    });
    observer.observe(visual, { childList: true, subtree: false });
  }

  function init() {
    injectStyles();
    VISUAL_IDS.map(id => document.getElementById(id)).forEach(bindVisual);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
