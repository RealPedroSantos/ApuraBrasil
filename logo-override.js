(() => {
  'use strict';

  const KEY = 'apurabrasil.customLogo';
  const DEFAULT_LOGO = '/assets/logo-apura-current.svg?v=20261025-0235';
  const SELECTOR = '.brand-logo, .projection-logo';
  let applying = false;

  function getSavedLogo() {
    try {
      return String(localStorage.getItem(KEY) || '').trim();
    } catch {
      return '';
    }
  }

  function desiredLogo() {
    return getSavedLogo() || DEFAULT_LOGO;
  }

  function setLogoSource(img, source) {
    if (!(img instanceof HTMLImageElement) || !source) return;
    if (img.getAttribute('src') !== source) img.setAttribute('src', source);
    if (source === DEFAULT_LOGO) delete img.dataset.customLogo;
    else img.dataset.customLogo = '1';
  }

  function applyLogo(root = document) {
    if (applying) return;
    applying = true;
    try {
      const source = desiredLogo();

      if (root instanceof HTMLImageElement && root.matches(SELECTOR)) {
        setLogoSource(root, source);
      }

      root.querySelectorAll?.(SELECTOR).forEach((img) => setLogoSource(img, source));

      root.querySelectorAll?.('.brand-temp').forEach((placeholder) => {
        const img = document.createElement('img');
        img.className = 'brand-logo';
        img.alt = 'Apura Brasil';
        setLogoSource(img, source);
        placeholder.replaceWith(img);
      });
    } finally {
      applying = false;
    }
  }

  function saveLogo(source) {
    try {
      if (source) localStorage.setItem(KEY, source);
      else localStorage.removeItem(KEY);
    } catch {
      return false;
    }
    applyLogo();
    return getSavedLogo() === String(source || '').trim();
  }

  const observer = new MutationObserver((mutations) => {
    if (applying) return;
    const expected = desiredLogo();
    for (const mutation of mutations) {
      if (mutation.type === 'attributes') {
        const img = mutation.target;
        if (img instanceof HTMLImageElement && img.matches(SELECTOR) && img.getAttribute('src') !== expected) {
          applyLogo(img);
        }
        continue;
      }
      for (const node of mutation.addedNodes) {
        if (!(node instanceof Element)) continue;
        if (node.matches?.(SELECTOR) || node.querySelector?.(SELECTOR) || node.matches?.('.brand-temp') || node.querySelector?.('.brand-temp')) {
          applyLogo(node);
        }
      }
    }
  });

  function start() {
    applyLogo();
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['src']
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();

  window.addEventListener('pageshow', () => applyLogo());
  window.addEventListener('storage', (event) => {
    if (event.key === KEY) applyLogo();
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) applyLogo();
  });

  window.ApuraBrasilLogo = {
    key: KEY,
    get: getSavedLogo,
    set: saveLogo,
    apply: applyLogo,
    reset: () => saveLogo('')
  };
})();