(() => {
  'use strict';

  // Adaptador do pacote enviado pelo usuário: apurabrasil-parliament-chart v1.0.0.
  // Mantém o renderer/geometria do pacote e conecta aos dados/DOM atuais do Apura Brasil.
  const VISUAL_IDS = ['chamberVisual', 'secondaryChamberVisual'];
  const runtimes = new WeakMap();
  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  let savedNamesTitle = '';

  function calculateGeometry(totalSeats, width = 600, height = 330) {
    const safeSeats = Math.max(1, Number(totalSeats || 1));
    const cx = width / 2;
    const baselineY = height - 18;
    const outerRadius = Math.min(width * 0.46, height * 0.88);
    const rings = clamp(
      Math.round(Math.sqrt(safeSeats) / 1.55),
      safeSeats <= 40 ? 2 : 3,
      safeSeats >= 900 ? 16 : 13
    );
    const innerRadius = outerRadius * clamp(
      0.43 - Math.log10(safeSeats + 1) * 0.035,
      0.30,
      0.45
    );
    const ringGap = rings === 1 ? 0 : (outerRadius - innerRadius) / (rings - 1);
    const radii = Array.from({ length: rings }, (_, i) => innerRadius + i * ringGap);
    const weights = radii.map((r) => Math.max(1, Math.PI * r));
    const sumWeights = weights.reduce((a, b) => a + b, 0);
    const exact = weights.map((w) => (w / sumWeights) * safeSeats);
    const counts = exact.map(Math.floor);

    let missing = safeSeats - counts.reduce((a, b) => a + b, 0);
    exact
      .map((v, i) => ({ i, f: v - Math.floor(v) }))
      .sort((a, b) => b.f - a.f)
      .slice(0, missing)
      .forEach(({ i }) => counts[i]++);

    let minArcGap = Infinity;
    radii.forEach((r, i) => {
      const n = counts[i];
      if (n > 1) minArcGap = Math.min(minArcGap, (Math.PI * r) / (n - 1));
    });

    const seatRadius = clamp(
      Number.isFinite(minArcGap) ? minArcGap * 0.34 : 10,
      safeSeats > 700 ? 2.5 : 3.25,
      safeSeats < 100 ? 11.5 : 7.2
    );
    const hoverRadius = clamp(seatRadius * 2.5, 10, 25);
    const edgePad = clamp(seatRadius / outerRadius * 0.8, 0.015, 0.08);
    const seats = [];

    radii.forEach((radius, ringIndex) => {
      const count = counts[ringIndex];
      for (let i = 0; i < count; i++) {
        const t = count === 1 ? 0.5 : i / (count - 1);
        const angle = Math.PI + edgePad + t * (Math.PI - edgePad * 2);
        seats.push({
          x: cx + Math.cos(angle) * radius,
          y: baselineY + Math.sin(angle) * radius,
          angle,
          radius,
          ringIndex,
        });
      }
    });

    seats.sort((a, b) => {
      if (Math.abs(a.x - b.x) > 0.001) return a.x - b.x;
      return a.radius - b.radius;
    });

    const centerCountY = baselineY - innerRadius * 0.28;
    const centerLabelY = centerCountY + clamp(width * 0.035, 18, 25);
    return { width, height, cx, seatRadius, hoverRadius, centerCountY, centerLabelY, seats };
  }

  function injectStyles() {
    if (document.getElementById('apuraParliamentPackageAdapterStyles')) return;
    const style = document.createElement('style');
    style.id = 'apuraParliamentPackageAdapterStyles';
    style.textContent = `
      .chamber-visual{isolation:isolate;}
      .chamber-visual .ab-parliament-svg{display:block;width:100%;height:100%;overflow:visible;touch-action:manipulation;}
      .chamber-visual .ab-seat{pointer-events:none;transform-box:fill-box;transform-origin:center;transition:opacity .14s ease,r .14s ease,stroke .14s ease,filter .14s ease;}
      .chamber-visual .ab-center-count{fill:#172027;font-weight:850;font-variant-numeric:tabular-nums;pointer-events:none;}
      .chamber-visual .ab-center-label{fill:#6e767b;font-weight:800;letter-spacing:.055em;pointer-events:none;}
      .chamber-legend .legend-item{cursor:pointer;border-radius:999px;padding:3px 5px;transition:opacity .14s ease,background .14s ease,color .14s ease;user-select:none;}
      .chamber-legend .legend-item.ab-active{background:#263e47;color:#fff;}
      .projected-panel.ab-party-filtered .projected-card{display:none;}
      .projected-panel.ab-party-filtered .projected-card.ab-party-member{display:grid;}
      @media(prefers-reduced-motion:reduce){.chamber-visual .ab-seat{transition:none!important;}}
    `;
    document.head.appendChild(style);
  }

  function normalizeParty(value) {
    return String(value || '').trim().replace(/\s+/g, ' ');
  }

  function isNeutralParty(name) {
    const p = normalizeParty(name).toLowerCase();
    return !p || p === 'não definido' || p.startsWith('em disputa') || p.startsWith('mandato') || p.startsWith('senado não renovado');
  }

  function colorOf(el) {
    const inline = el.style.background || el.style.backgroundColor;
    if (inline) return inline;
    return getComputedStyle(el).backgroundColor || '#94a3b8';
  }

  function groupsFromLegacySeats(legacySeats) {
    const groups = [];
    const byName = new Map();
    for (const seat of legacySeats) {
      const name = normalizeParty(seat.getAttribute('title')) || 'Não definido';
      let group = byName.get(name);
      if (!group) {
        group = {
          id: `party-${groups.length}-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
          name,
          color: colorOf(seat),
          seats: 0,
        };
        groups.push(group);
        byName.set(name, group);
      }
      group.seats++;
    }
    return groups;
  }

  function defaultCenterInfo(visual, totalSeats) {
    const oldLabel = visual.querySelector('.chamber-center-label');
    const count = normalizeParty(oldLabel?.querySelector('strong')?.textContent) || String(totalSeats);
    const label = normalizeParty(oldLabel?.querySelector('span')?.textContent) || 'CADEIRAS';
    return { count, label };
  }

  function assignGroups(geometrySeats, groups) {
    const seats = geometrySeats.map(s => ({ ...s }));
    let cursor = 0;
    for (const group of groups) {
      for (let i = 0; i < group.seats && cursor < seats.length; i++, cursor++) {
        Object.assign(seats[cursor], {
          groupId: group.id,
          groupName: group.name,
          color: group.color,
        });
      }
    }
    while (cursor < seats.length) {
      Object.assign(seats[cursor++], {
        groupId: '__unassigned__',
        groupName: 'Não definido',
        color: '#94a3b8',
      });
    }
    return seats;
  }

  function createSvg(visual, runtime) {
    const NS = 'http://www.w3.org/2000/svg';
    const { geometry: g, seats } = runtime;
    const svg = document.createElementNS(NS, 'svg');
    svg.classList.add('ab-parliament-svg');
    svg.setAttribute('viewBox', `0 0 ${g.width} ${g.height}`);
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    svg.setAttribute('aria-label', `${runtime.title}, ${seats.length} cadeiras`);

    runtime.seatElements = seats.map((seat, index) => {
      const circle = document.createElementNS(NS, 'circle');
      circle.classList.add('ab-seat');
      circle.setAttribute('cx', seat.x);
      circle.setAttribute('cy', seat.y);
      circle.setAttribute('r', g.seatRadius);
      circle.setAttribute('fill', seat.color);
      circle.dataset.groupId = seat.groupId;
      circle.style.opacity = '0';
      circle.style.transform = 'scale(.05)';
      svg.appendChild(circle);
      const delay = Math.min(700, (index / Math.max(1, seats.length - 1)) * 700);
      requestAnimationFrame(() => {
        setTimeout(() => {
          circle.style.transition = 'transform 220ms cubic-bezier(.2,.8,.2,1),opacity 180ms ease,r 140ms ease,stroke 140ms ease,filter 140ms ease';
          circle.style.opacity = '1';
          circle.style.transform = 'scale(1)';
        }, delay);
      });
      return circle;
    });

    const countText = document.createElementNS(NS, 'text');
    countText.classList.add('ab-center-count');
    countText.setAttribute('x', g.cx);
    countText.setAttribute('y', g.centerCountY);
    countText.setAttribute('text-anchor', 'middle');
    countText.setAttribute('font-size', clamp(g.width * 0.075, 30, 48));
    countText.textContent = runtime.defaultCount;
    svg.appendChild(countText);
    runtime.countText = countText;

    const labelText = document.createElementNS(NS, 'text');
    labelText.classList.add('ab-center-label');
    labelText.setAttribute('x', g.cx);
    labelText.setAttribute('y', g.centerLabelY);
    labelText.setAttribute('text-anchor', 'middle');
    labelText.setAttribute('font-size', clamp(g.width * 0.022, 10, 13));
    labelText.textContent = runtime.defaultLabel;
    svg.appendChild(labelText);
    runtime.labelText = labelText;

    return svg;
  }

  function nearestSeat(event, runtime) {
    const rect = runtime.svg.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const g = runtime.geometry;
    const x = ((event.clientX - rect.left) / rect.width) * g.width;
    const y = ((event.clientY - rect.top) / rect.height) * g.height;
    const radius = g.hoverRadius;
    let nearest = null;
    let best = radius * radius;
    for (const seat of runtime.seats) {
      const dx = x - seat.x;
      const dy = y - seat.y;
      const d = dx * dx + dy * dy;
      if (d <= best) {
        best = d;
        nearest = seat;
      }
    }
    return nearest;
  }

  function currentActive(runtime) {
    return runtime.hoveredId || runtime.selectedId;
  }

  function paint(runtime) {
    const active = currentActive(runtime);
    runtime.seatElements.forEach((el, i) => {
      const seat = runtime.seats[i];
      const on = !active || active === seat.groupId;
      el.style.opacity = on ? '1' : '.18';
      el.style.filter = on ? 'none' : 'saturate(.25)';
      el.setAttribute('r', String(runtime.geometry.seatRadius + (runtime.hoveredId === seat.groupId ? 0.8 : 0)));
      el.setAttribute('stroke', runtime.selectedId === seat.groupId ? '#263e47' : 'transparent');
      el.setAttribute('stroke-width', runtime.selectedId === seat.groupId ? '1.4' : '0');
    });

    const group = runtime.groups.find(g => g.id === active) || null;
    runtime.countText.textContent = group ? String(group.seats) : runtime.defaultCount;
    runtime.labelText.textContent = group ? group.name.toUpperCase() : runtime.defaultLabel;
    bindAndPaintLegend(runtime);
  }

  function legendParty(item) {
    return normalizeParty(item?.textContent).replace(/\s+\d+\s*$/, '');
  }

  function bindAndPaintLegend(runtime) {
    const legend = runtime.visual.closest('.chamber-card')?.querySelector('.chamber-legend');
    if (!legend) return;
    runtime.legend = legend;
    const active = currentActive(runtime);
    const activeGroup = runtime.groups.find(g => g.id === active);

    legend.querySelectorAll('.legend-item').forEach(item => {
      const party = legendParty(item);
      const group = runtime.groups.find(g => g.name === party);
      item.style.opacity = activeGroup && activeGroup.name !== party ? '.35' : '1';
      item.classList.toggle('ab-active', Boolean(runtime.selectedId && group?.id === runtime.selectedId));
      if (item.dataset.abPackageBound === '1') return;
      item.dataset.abPackageBound = '1';
      item.tabIndex = isNeutralParty(party) ? -1 : 0;
      item.addEventListener('mouseenter', () => {
        const rt = runtimes.get(runtime.visual);
        const g = rt?.groups.find(x => x.name === party);
        if (!rt || !g || rt.selectedId || isNeutralParty(g.name)) return;
        rt.hoveredId = g.id;
        paint(rt);
      });
      item.addEventListener('mouseleave', () => {
        const rt = runtimes.get(runtime.visual);
        if (!rt || rt.selectedId) return;
        rt.hoveredId = null;
        paint(rt);
      });
      item.addEventListener('click', () => {
        const rt = runtimes.get(runtime.visual);
        const g = rt?.groups.find(x => x.name === party);
        if (rt && g && !isNeutralParty(g.name)) toggleSelection(rt, g.id);
      });
      item.addEventListener('keydown', e => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        const rt = runtimes.get(runtime.visual);
        const g = rt?.groups.find(x => x.name === party);
        if (rt && g && !isNeutralParty(g.name)) {
          e.preventDefault();
          toggleSelection(rt, g.id);
        }
      });
    });
  }

  function extractCardParty(card) {
    const raw = normalizeParty(card.querySelector('.projected-main span')?.textContent);
    return normalizeParty(raw.split('•')[0]);
  }

  function filterSidebar(group) {
    const list = document.getElementById('projectedList');
    const panel = list?.closest('.projected-panel');
    const title = document.getElementById('namesTitle');
    if (!list || !panel || !title) return;

    if (!savedNamesTitle || !title.textContent.startsWith('Parlamentares do ')) {
      savedNamesTitle = title.textContent;
    }

    list.querySelectorAll('.projected-card').forEach(card => {
      const match = extractCardParty(card) === group.name;
      card.classList.toggle('ab-party-member', match);
    });
    panel.classList.add('ab-party-filtered');
    title.textContent = `Parlamentares do ${group.name}`;
  }

  function clearSidebar() {
    const list = document.getElementById('projectedList');
    const panel = list?.closest('.projected-panel');
    const title = document.getElementById('namesTitle');
    panel?.classList.remove('ab-party-filtered');
    list?.querySelectorAll('.projected-card.ab-party-member').forEach(card => card.classList.remove('ab-party-member'));
    if (title && savedNamesTitle) title.textContent = savedNamesTitle;
  }

  function clearOtherSelections(exceptRuntime) {
    for (const id of VISUAL_IDS) {
      const v = document.getElementById(id);
      const rt = v ? runtimes.get(v) : null;
      if (!rt || rt === exceptRuntime) continue;
      rt.selectedId = null;
      rt.hoveredId = null;
      paint(rt);
    }
  }

  function toggleSelection(runtime, groupId) {
    const group = runtime.groups.find(g => g.id === groupId);
    if (!group || isNeutralParty(group.name)) return;
    if (runtime.selectedId === groupId) {
      runtime.selectedId = null;
      runtime.hoveredId = null;
      clearSidebar();
      paint(runtime);
      return;
    }
    clearOtherSelections(runtime);
    runtime.selectedId = groupId;
    runtime.hoveredId = null;
    filterSidebar(group);
    paint(runtime);
  }

  function attachSvgEvents(runtime) {
    const svg = runtime.svg;
    svg.addEventListener('mousemove', event => {
      if (runtime.selectedId) return;
      const seat = nearestSeat(event, runtime);
      const next = seat && !isNeutralParty(seat.groupName) ? seat.groupId : null;
      if (next !== runtime.hoveredId) {
        runtime.hoveredId = next;
        svg.style.cursor = next ? 'pointer' : 'default';
        paint(runtime);
      }
    });
    svg.addEventListener('mouseleave', () => {
      if (runtime.selectedId) return;
      runtime.hoveredId = null;
      svg.style.cursor = 'default';
      paint(runtime);
    });
    svg.addEventListener('click', event => {
      const seat = nearestSeat(event, runtime);
      if (!seat || isNeutralParty(seat.groupName)) {
        if (runtime.selectedId) {
          runtime.selectedId = null;
          runtime.hoveredId = null;
          clearSidebar();
          paint(runtime);
        }
        return;
      }
      toggleSelection(runtime, seat.groupId);
    });
  }

  function adaptVisual(visual) {
    const legacySeats = [...visual.querySelectorAll(':scope > .seat-dot')];
    if (!legacySeats.length) {
      const runtime = runtimes.get(visual);
      if (runtime) bindAndPaintLegend(runtime);
      return;
    }

    const previous = runtimes.get(visual);
    const totalSeats = legacySeats.length;
    const groups = groupsFromLegacySeats(legacySeats);
    const center = defaultCenterInfo(visual, totalSeats);
    const width = 600;
    const height = 330;
    const geometry = calculateGeometry(totalSeats, width, height);
    const seats = assignGroups(geometry.seats, groups);
    const title = normalizeParty(visual.closest('.chamber-card')?.querySelector('.chamber-head strong')?.textContent) || 'Parlamento';
    const previousSelectedName = previous?.title === title
      ? previous.groups.find(g => g.id === previous.selectedId)?.name || null
      : null;

    const runtime = {
      visual,
      title,
      groups,
      geometry,
      seats,
      seatElements: [],
      hoveredId: null,
      selectedId: null,
      defaultCount: center.count,
      defaultLabel: center.label,
      svg: null,
      countText: null,
      labelText: null,
    };

    if (previousSelectedName) {
      runtime.selectedId = groups.find(g => g.name === previousSelectedName)?.id || null;
    }

    const svg = createSvg(visual, runtime);
    runtime.svg = svg;
    visual.replaceChildren(svg);
    runtimes.set(visual, runtime);
    attachSvgEvents(runtime);
    bindAndPaintLegend(runtime);
    paint(runtime);

    if (runtime.selectedId) {
      const group = groups.find(g => g.id === runtime.selectedId);
      if (group) filterSidebar(group);
    }
  }

  let scheduled = false;
  function scheduleAdapt() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      VISUAL_IDS.map(id => document.getElementById(id)).filter(Boolean).forEach(adaptVisual);
      const title = document.getElementById('namesTitle');
      if (title && !title.textContent.startsWith('Parlamentares do ')) savedNamesTitle = title.textContent;
    });
  }

  function init() {
    injectStyles();
    scheduleAdapt();
    const observer = new MutationObserver(scheduleAdapt);
    observer.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
