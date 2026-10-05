(() => {
  'use strict';

  const VISUAL_IDS = ['chamberVisual', 'secondaryChamberVisual'];

  function compactSeat(seat) {
    if (!(seat instanceof HTMLElement) || seat.dataset.compactSeat === '1') return;

    const left = Number.parseFloat(seat.style.left);
    const top = Number.parseFloat(seat.style.top);
    const width = Number.parseFloat(seat.style.width);
    if (![left, top, width].every(Number.isFinite)) return;

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

  function compactVisual(visual) {
    if (!visual) return;
    visual.querySelectorAll('.seat-dot').forEach(compactSeat);
  }

  function bindVisual(visual) {
    if (!visual) return;
    compactVisual(visual);
    const observer = new MutationObserver(() => compactVisual(visual));
    observer.observe(visual, { childList: true, subtree: true });
  }

  function init() {
    VISUAL_IDS.map(id => document.getElementById(id)).forEach(bindVisual);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
