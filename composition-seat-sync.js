(() => {
  'use strict';

  const VISUAL_IDS = ['chamberVisual', 'secondaryChamberVisual'];
  const stateBySvg = new WeakMap();
  const PARTY_COLORS = {
    PL:'#165dff',PT:'#e31d2b',PSD:'#ef8d22',NOVO:'#e86e1c',MDB:'#3e9278',PSOL:'#d5b913',PDT:'#d34646',PSB:'#d5a51d',PP:'#3471bf',
    'UNIÃO':'#207da5',REPUBLICANOS:'#587cca',AVANTE:'#7b1bd1','MISSÃO':'#6e58a0',PCB:'#8d2737',PSTU:'#b82d3d',UP:'#bd20c8',PCO:'#7a2530',DC:'#23847b','S/PARTIDO':'#7d8589'
  };
  const probe = document.createElement('span');
  let scheduled = false;

  function normalizeParty(value) {
    return String(value || '').trim().replace(/\s+/g, ' ');
  }

  function normalizeColor(value) {
    probe.style.color = '';
    probe.style.color = String(value || '');
    return String(probe.style.color || value || '').trim().toLowerCase();
  }

  function activeView() {
    return document.querySelector('.mode.active[data-office]')?.dataset.office || 'deputado-federal';
  }

  function isSenateVisual(visual) {
    const view = activeView();
    return (view === 'senador' && visual.id === 'chamberVisual') ||
      (view === 'congresso' && visual.id === 'secondaryChamberVisual');
  }

  function buildColorPartyMap() {
    const map = new Map();
    for (const [party, value] of Object.entries(PARTY_COLORS)) map.set(normalizeColor(value), party);

    document.querySelectorAll('#partyComposition .party-row').forEach(row => {
      const party = normalizeParty(row.querySelector('.party-name')?.textContent);
      const dot = row.querySelector('.party-dot');
      const value = dot?.style.background || dot?.style.backgroundColor || (dot ? getComputedStyle(dot).backgroundColor : '');
      if (party && value) map.set(normalizeColor(value), party);
    });
    return map;
  }

  function cardParty(card) {
    const raw = normalizeParty(card.querySelector('.projected-main span')?.textContent);
    return normalizeParty(raw.split('•')[0]);
  }

  function ensureMandateKey() {
    const panel = document.querySelector('.projected-panel');
    const head = panel?.querySelector(':scope > .panel-head');
    if (!panel || !head) return;
    const senateContext = activeView() === 'senador' || activeView() === 'congresso';
    let key = panel.querySelector('#abMandateKey');
    if (!senateContext) {
      key?.remove();
      return;
    }
    if (!key) {
      key = document.createElement('div');
      key.id = 'abMandateKey';
      key.className = 'ab-mandate-key';
      key.innerHTML = '<span class="ab-key-new"><i></i>Eleito 2026</span><span class="ab-key-projected"><i></i>Projeção 2026</span><span class="ab-key-incumbent"><i></i>Mandato vigente</span>';
      head.insertAdjacentElement('afterend', key);
    }
  }

  function markSidebarKinds() {
    ensureMandateKey();
    const senateContext = activeView() === 'senador' || activeView() === 'congresso';
    document.querySelectorAll('#projectedList .projected-card').forEach(card => {
      card.classList.remove('ab-new-2026-card', 'ab-projected-2026-card');
      const status = card.querySelector('.seat-status strong');
      const detail = card.querySelector('.seat-status span');
      if (card.classList.contains('ab-incumbent-card')) {
        card.dataset.abMandateKind = 'incumbent';
        return;
      }
      const official = status?.classList.contains('official') || normalizeParty(status?.textContent).toUpperCase() === 'OFICIAL';
      if (official) {
        card.classList.add('ab-new-2026-card');
        card.dataset.abMandateKind = 'new';
        if (senateContext && status) status.textContent = 'ELEITO 2026';
        if (senateContext && detail) detail.textContent = 'novo mandato • eleito pelo TSE';
      } else {
        card.classList.add('ab-projected-2026-card');
        card.dataset.abMandateKind = 'projected';
        if (senateContext && status && normalizeParty(status.textContent).toUpperCase() === 'PROJEÇÃO') status.textContent = 'PROJEÇÃO 2026';
      }
    });
  }

  function sidebarFilter(party) {
    const list = document.getElementById('projectedList');
    const panel = list?.closest('.projected-panel');
    const title = document.getElementById('namesTitle');
    if (!list || !panel || !title) return;
    if (!title.dataset.abSeatSyncDefault || !title.textContent.startsWith('Parlamentares do ')) {
      title.dataset.abSeatSyncDefault = title.textContent;
    }
    list.querySelectorAll('.projected-card').forEach(card => {
      card.classList.toggle('ab-party-member', cardParty(card) === party);
    });
    panel.classList.add('ab-party-filtered');
    title.textContent = `Parlamentares do ${party}`;
  }

  function clearSidebar() {
    const list = document.getElementById('projectedList');
    const panel = list?.closest('.projected-panel');
    const title = document.getElementById('namesTitle');
    panel?.classList.remove('ab-party-filtered');
    list?.querySelectorAll('.projected-card.ab-party-member').forEach(card => card.classList.remove('ab-party-member'));
    if (title?.dataset.abSeatSyncDefault) title.textContent = title.dataset.abSeatSyncDefault;
  }

  function seatsFor(svg) {
    return [...svg.querySelectorAll('.ab-seat')];
  }

  function nearestSeat(event, svg) {
    const matrix = svg.getScreenCTM?.();
    if (!matrix) return null;
    let point;
    try {
      const p = svg.createSVGPoint();
      p.x = event.clientX;
      p.y = event.clientY;
      point = p.matrixTransform(matrix.inverse());
    } catch {
      return null;
    }
    let best = null;
    let bestDistance = Infinity;
    for (const seat of seatsFor(svg)) {
      const cx = Number(seat.getAttribute('cx'));
      const cy = Number(seat.getAttribute('cy'));
      const r = Number(seat.getAttribute('r') || 5);
      const dx = point.x - cx;
      const dy = point.y - cy;
      const distance = dx * dx + dy * dy;
      const limit = Math.max(10, r * 2.8);
      if (distance <= limit * limit && distance < bestDistance) {
        bestDistance = distance;
        best = seat;
      }
    }
    return best;
  }

  function partySeatCount(svg, party) {
    return seatsFor(svg).filter(seat => seat.dataset.abFinalParty === party).length;
  }

  function restoreCenter(svg, state) {
    const count = svg.querySelector('.ab-center-count');
    const label = svg.querySelector('.ab-center-label');
    if (count) count.textContent = state.defaultCount;
    if (label) label.textContent = state.defaultLabel;
  }

  function paint(svg) {
    const state = stateBySvg.get(svg);
    if (!state) return;
    const party = state.hoveredParty || state.selectedParty;
    const seatList = seatsFor(svg);
    seatList.forEach(seat => {
      const on = !party || seat.dataset.abFinalParty === party;
      seat.style.opacity = on ? '1' : '.15';
      seat.style.filter = on ? 'none' : 'saturate(.18)';
      const selected = Boolean(state.selectedParty && seat.dataset.abFinalParty === state.selectedParty);
      seat.setAttribute('stroke', selected ? '#263e47' : 'transparent');
      seat.setAttribute('stroke-width', selected ? '1.5' : '0');
    });

    const count = svg.querySelector('.ab-center-count');
    const label = svg.querySelector('.ab-center-label');
    if (party) {
      if (count) count.textContent = String(partySeatCount(svg, party));
      if (label) label.textContent = party.toUpperCase();
    } else {
      restoreCenter(svg, state);
    }

    syncLegend(svg);
  }

  function clearOtherSelections(exceptSvg) {
    for (const id of VISUAL_IDS) {
      const svg = document.getElementById(id)?.querySelector('.ab-parliament-svg');
      if (!svg || svg === exceptSvg) continue;
      const state = stateBySvg.get(svg);
      if (!state) continue;
      state.selectedParty = null;
      state.hoveredParty = null;
      paint(svg);
    }
  }

  function toggleParty(svg, party) {
    if (!party) return;
    const state = stateBySvg.get(svg);
    if (!state) return;
    if (state.selectedParty === party) {
      state.selectedParty = null;
      state.hoveredParty = null;
      clearSidebar();
      paint(svg);
      return;
    }
    clearOtherSelections(svg);
    state.selectedParty = party;
    state.hoveredParty = null;
    sidebarFilter(party);
    paint(svg);
  }

  function legendParty(item) {
    return normalizeParty(item?.textContent).replace(/\s+\d+\s*$/, '');
  }

  function syncLegend(svg) {
    const visual = svg.closest('.chamber-visual');
    const legend = visual?.closest('.chamber-card')?.querySelector('.chamber-legend');
    const state = stateBySvg.get(svg);
    if (!legend || !state) return;
    const active = state.hoveredParty || state.selectedParty;

    legend.querySelectorAll('.legend-item').forEach(item => {
      const party = legendParty(item);
      const count = partySeatCount(svg, party);
      if (!count && /^(mandato|senado não renovado)/i.test(party)) {
        item.style.display = 'none';
        return;
      }
      item.style.display = '';
      if (count) {
        const textNode = [...item.childNodes].find(node => node.nodeType === Node.TEXT_NODE);
        if (textNode) textNode.nodeValue = `${party} ${count}`;
      }
      item.style.opacity = active && active !== party ? '.35' : '1';
      item.classList.toggle('ab-active', Boolean(state.selectedParty && state.selectedParty === party));
      if (item.dataset.abSeatSyncBound === '1') return;
      item.dataset.abSeatSyncBound = '1';
      item.addEventListener('mouseenter', event => {
        event.stopImmediatePropagation();
        const current = stateBySvg.get(svg);
        if (!current || current.selectedParty || !partySeatCount(svg, party)) return;
        current.hoveredParty = party;
        paint(svg);
      }, true);
      item.addEventListener('mouseleave', event => {
        event.stopImmediatePropagation();
        const current = stateBySvg.get(svg);
        if (!current || current.selectedParty) return;
        current.hoveredParty = null;
        paint(svg);
      }, true);
      item.addEventListener('click', event => {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (partySeatCount(svg, party)) toggleParty(svg, party);
      }, true);
    });
  }

  function bindSvg(svg) {
    if (svg.dataset.abSeatSyncBound === '1') return;
    svg.dataset.abSeatSyncBound = '1';
    svg.addEventListener('mousemove', event => {
      event.stopImmediatePropagation();
      const state = stateBySvg.get(svg);
      if (!state || state.selectedParty) return;
      const seat = nearestSeat(event, svg);
      const party = seat?.dataset.abFinalParty || null;
      if (party !== state.hoveredParty) {
        state.hoveredParty = party;
        svg.style.cursor = party ? 'pointer' : 'default';
        paint(svg);
      }
    }, true);
    svg.addEventListener('mouseleave', event => {
      event.stopImmediatePropagation();
      const state = stateBySvg.get(svg);
      if (!state || state.selectedParty) return;
      state.hoveredParty = null;
      svg.style.cursor = 'default';
      paint(svg);
    }, true);
    svg.addEventListener('click', event => {
      event.preventDefault();
      event.stopImmediatePropagation();
      const seat = nearestSeat(event, svg);
      const party = seat?.dataset.abFinalParty || null;
      if (!party) {
        const state = stateBySvg.get(svg);
        if (state?.selectedParty) {
          state.selectedParty = null;
          state.hoveredParty = null;
          clearSidebar();
          paint(svg);
        }
        return;
      }
      toggleParty(svg, party);
    }, true);
  }

  function syncVisual(visual, colorPartyMap) {
    const svg = visual.querySelector('.ab-parliament-svg');
    if (!svg) return;
    let state = stateBySvg.get(svg);
    if (!state) {
      state = {
        selectedParty: null,
        hoveredParty: null,
        defaultCount: normalizeParty(svg.querySelector('.ab-center-count')?.textContent),
        defaultLabel: normalizeParty(svg.querySelector('.ab-center-label')?.textContent)
      };
      stateBySvg.set(svg, state);
    }

    seatsFor(svg).forEach(seat => {
      const fill = normalizeColor(seat.getAttribute('fill') || getComputedStyle(seat).fill);
      seat.dataset.abFinalParty = colorPartyMap.get(fill) || '';
    });

    if (isSenateVisual(visual)) visual.dataset.abFinalComposition = '1';
    bindSvg(svg);
    paint(svg);
  }

  function injectStyles() {
    if (document.getElementById('abSeatSyncStyles')) return;
    const style = document.createElement('style');
    style.id = 'abSeatSyncStyles';
    style.textContent = `
      .ab-mandate-key{display:flex;flex-wrap:wrap;gap:10px 14px;padding:0 2px 2px;font-size:9px;font-weight:850;color:#5e686d;}
      .ab-mandate-key span{display:inline-flex;align-items:center;gap:5px;white-space:nowrap;}
      .ab-mandate-key i{width:9px;height:9px;border-radius:2px;display:inline-block;}
      .ab-key-new i{background:#2f9b61}.ab-key-projected i{background:#d89119}.ab-key-incumbent i{background:#315f88}
      .projected-card.ab-new-2026-card{border-left:5px solid #2f9b61;background:#f3faf6;}
      .projected-card.ab-projected-2026-card{border-left:5px solid #d89119;background:#fff9ec;}
      .projected-card.ab-incumbent-card{border:1px solid #c5cacc;border-left:5px solid #315f88;background:#f2f6fb;}
      .projected-card.ab-new-2026-card .rank-badge{background:#e0f2e7;color:#17653d;}
      .projected-card.ab-projected-2026-card .rank-badge{background:#faedcf;color:#7b5310;}
      .projected-card.ab-incumbent-card .rank-badge{background:#e3edf7;color:#315f88;}
      .projected-card.ab-incumbent-card .seat-status strong{color:#315f88!important;}
      .projected-card.ab-new-2026-card .seat-status strong{color:#2f9b61!important;}
      .projected-card.ab-projected-2026-card .seat-status strong{color:#9a6917!important;}
    `;
    document.head.appendChild(style);
  }

  function syncAll() {
    scheduled = false;
    injectStyles();
    markSidebarKinds();
    const map = buildColorPartyMap();
    VISUAL_IDS.map(id => document.getElementById(id)).filter(Boolean).forEach(visual => syncVisual(visual, map));
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(syncAll);
  }

  function init() {
    injectStyles();
    schedule();
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['fill', 'class']
    });
    document.getElementById('ufSelect')?.addEventListener('change', () => setTimeout(schedule, 80));
    document.querySelector('.projection-controls')?.addEventListener('click', () => setTimeout(schedule, 80));
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();