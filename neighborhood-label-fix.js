(() => {
  'use strict';

  if (window.__abNeighborhoodLabelFixInstalled) return;
  window.__abNeighborhoodLabelFixInstalled = true;

  const style = document.createElement('style');
  style.id = 'abNeighborhoodLabelFixStyles';
  style.textContent = `
    #mapStage .ab-neighborhood-label:not(.ab-label-ready){opacity:0!important}
    #mapStage .ab-neighborhood-label.ab-label-ready{transition:opacity .12s ease}
  `;
  document.head.appendChild(style);

  let timer = null;
  let applying = false;

  function schedule(delay = 70) {
    clearTimeout(timer);
    timer = setTimeout(applyFix, delay);
  }

  function applyFix() {
    if (applying) return;
    const svg = document.querySelector('.ab-drilldown-host svg');
    if (!svg) return;
    const labels = [...svg.querySelectorAll('.ab-neighborhood-label')];
    if (!labels.length) return;

    applying = true;
    try {
      const rect = svg.getBoundingClientRect();
      const vb = svg.viewBox?.baseVal;
      if (!vb || !vb.width || !vb.height || !rect.width || !rect.height) return;

      const scale = Math.max(.001, Math.min(rect.width / vb.width, rect.height / vb.height));
      const targetFontPx = labels.length > 55 ? 7 : labels.length > 35 ? 7.5 : labels.length > 20 ? 8 : 9;
      const fontUnits = targetFontPx / scale;
      const strokeUnits = 1.35 / scale;
      const collisionPad = 2 / scale;
      const placed = [];
      const pathByCode = new Map([...svg.querySelectorAll('.ab-drilldown-region')].map(path => [path.dataset.code || '', path]));

      for (const label of labels) {
        label.classList.remove('ab-label-ready');
        label.style.display = '';
        label.setAttribute('font-size', fontUnits.toFixed(3));
        label.setAttribute('dominant-baseline', 'middle');
        label.style.strokeWidth = `${strokeUnits.toFixed(3)}px`;
      }

      for (const label of labels) {
        const path = pathByCode.get(label.dataset.code || '');
        if (!path) {
          label.style.display = 'none';
          continue;
        }

        let cellBox, labelBox;
        try {
          cellBox = path.getBBox();
          labelBox = label.getBBox();
        } catch {
          label.style.display = 'none';
          continue;
        }

        const cellWidthPx = cellBox.width * scale;
        const cellHeightPx = cellBox.height * scale;
        const labelWidthPx = labelBox.width * scale;
        const labelHeightPx = labelBox.height * scale;

        if (
          cellWidthPx < 34 ||
          cellHeightPx < 15 ||
          labelWidthPx > cellWidthPx * .92 ||
          labelHeightPx > cellHeightPx * .82
        ) {
          label.style.display = 'none';
          continue;
        }

        const box = {
          l: labelBox.x - collisionPad,
          r: labelBox.x + labelBox.width + collisionPad,
          t: labelBox.y - collisionPad,
          b: labelBox.y + labelBox.height + collisionPad
        };
        const collides = placed.some(other => !(box.r < other.l || box.l > other.r || box.b < other.t || box.t > other.b));
        if (collides) {
          label.style.display = 'none';
          continue;
        }

        placed.push(box);
        label.classList.add('ab-label-ready');
      }
    } finally {
      applying = false;
    }
  }

  const stage = document.getElementById('mapStage');
  if (stage) {
    const observer = new MutationObserver(mutations => {
      if (applying) return;
      if (mutations.some(m => m.type === 'childList' || (m.type === 'attributes' && m.attributeName === 'viewBox'))) schedule();
    });
    observer.observe(stage, { childList: true, subtree: true, attributes: true, attributeFilter: ['viewBox'] });
  }

  window.addEventListener('resize', () => schedule(100), { passive: true });
  schedule(0);
})();
