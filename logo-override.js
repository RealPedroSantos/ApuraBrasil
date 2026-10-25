(() => {
  'use strict';

  const KEY = 'apurabrasil.customLogo';
  const DEFAULT_LOGO = '/assets/logo-apurabrasil.svg';
  const SELECTOR = '.brand-logo, .projection-logo';
  let applying = false;

  function getSavedLogo() {
    try { return localStorage.getItem(KEY) || ''; } catch { return ''; }
  }

  function setLogoSource(img, source, custom) {
    if (!(img instanceof HTMLImageElement) || !source) return;
    if (img.getAttribute('src') !== source) img.setAttribute('src', source);
    if (custom) img.dataset.customLogo = 'true';
    else delete img.dataset.customLogo;
  }

  function applyLogo(root = document) {
    if (applying) return;
    applying = true;
    try {
      const saved = getSavedLogo();
      const source = saved || DEFAULT_LOGO;

      if (root instanceof HTMLImageElement && root.matches(SELECTOR)) {
        setLogoSource(root, source, Boolean(saved));
      }

      root.querySelectorAll?.(SELECTOR).forEach((img) => setLogoSource(img, source, Boolean(saved)));

      root.querySelectorAll?.('.brand-temp').forEach((placeholder) => {
        const img = document.createElement('img');
        img.className = 'brand-logo';
        img.alt = 'Apura Brasil';
        setLogoSource(img, source, Boolean(saved));
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
      applyLogo();
      return true;
    } catch {
      return false;
    }
  }

  const observer = new MutationObserver((mutations) => {
    if (applying) return;
    const saved = getSavedLogo();
    for (const mutation of mutations) {
      if (mutation.type === 'attributes') {
        const img = mutation.target;
        if (img instanceof HTMLImageElement && img.matches(SELECTOR)) {
          const expected = saved || DEFAULT_LOGO;
          if (img.getAttribute('src') !== expected) applyLogo(img);
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

  window.addEventListener('storage', (event) => { if (event.key === KEY) applyLogo(); });
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
