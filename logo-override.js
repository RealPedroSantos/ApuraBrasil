(() => {
  'use strict';

  const KEY = 'apurabrasil.customLogo';
  const DEFAULT_LOGO = '/assets/logo-apura-current.svg?v=20261025-0224';
  const SELECTOR = '.brand-logo, .projection-logo';
  let applying = false;

  function getSavedLogo() {
    return '';
  }

  function setLogoSource(img, source) {
    if (!(img instanceof HTMLImageElement) || !source) return;
    if (img.getAttribute('src') !== source) img.setAttribute('src', source);
    delete img.dataset.customLogo;
  }

  function applyLogo(root = document) {
    if (applying) return;
    applying = true;
    try {
      const source = DEFAULT_LOGO;

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

  function clearLocalOverride() {
    try { localStorage.removeItem(KEY); } catch {}
  }

  function saveLogo(source) {
    try {
      if (source) localStorage.setItem(KEY, source);
      else localStorage.removeItem(KEY);
    } catch {}
    applyLogo();
    return true;
  }

  const observer = new MutationObserver((mutations) => {
    if (applying) return;
    for (const mutation of mutations) {
      if (mutation.type === 'attributes') {
        const img = mutation.target;
        if (img instanceof HTMLImageElement && img.matches(SELECTOR) && img.getAttribute('src') !== DEFAULT_LOGO) {
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
    clearLocalOverride();
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

  window.addEventListener('pageshow', applyLogo);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) applyLogo(); });

  window.ApuraBrasilLogo = {
    key: KEY,
    get: getSavedLogo,
    set: saveLogo,
    apply: applyLogo,
    reset: () => saveLogo('')
  };
})();
