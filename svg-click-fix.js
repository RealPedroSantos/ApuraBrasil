(() => {
  'use strict';

  // SVGElement does not expose HTMLElement.click() consistently across browsers.
  // The drilldown map synchronizes its visible SVG with the hidden electoral map,
  // so provide an equivalent synthetic click for SVG paths when needed.
  if (typeof SVGElement === 'undefined' || typeof MouseEvent === 'undefined') return;
  if (typeof SVGElement.prototype.click === 'function') return;

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
})();
