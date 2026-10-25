(() => {
  'use strict';

  // SVGElement does not expose HTMLElement.click() consistently across browsers.
  // The drilldown map synchronizes its visible SVG with the hidden electoral map,
  // so provide an equivalent synthetic click for SVG paths when needed.
  if (typeof SVGElement !== 'undefined' && typeof MouseEvent !== 'undefined' && typeof SVGElement.prototype.click !== 'function') {
    Object.defineProperty(SVGElement.prototype, 'click', {
      configurable: true,
      writable: true,
      value: function click() {
        this.dispatchEvent(new MouseEvent('click', {
          bubbles: true,
          cancelable: true,
          view: window
        }));
      }
    });
  }

  // Clicking the empty background of the visible drilldown map must behave like
  // "Voltar": Bairro -> Cidade -> Estado -> Brasil. The renderer itself still
  // has a legacy reset-to-Brasil handler, so intercept the background click in
  // capture phase before that handler receives it.
  document.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof SVGSVGElement)) return;
    if (!target.matches('.ab-drilldown-host > svg')) return;

    const host = target.closest('.ab-drilldown-host');
    const level = String(host?.querySelector('.ab-map-level')?.textContent || '').trim().toLowerCase();
    if (!level || level === 'estados') return;

    const backButton = document.getElementById('backButton');
    if (!backButton) return;

    event.preventDefault();
    event.stopPropagation();
    backButton.click();
  }, true);
})();
