(() => {
  'use strict';

  const KEY = 'apurabrasil.customLogo';

  function getSavedLogo() {
    try { return localStorage.getItem(KEY) || ''; } catch { return ''; }
  }

  function applyLogo() {
    const saved = getSavedLogo();
    if (!saved) return;

    document.querySelectorAll('.brand-logo, .projection-logo').forEach((img) => {
      if (!(img instanceof HTMLImageElement)) return;
      img.src = saved;
      img.dataset.customLogo = 'true';
    });

    document.querySelectorAll('.brand-temp').forEach((placeholder) => {
      const img = document.createElement('img');
      img.className = 'brand-logo';
      img.alt = 'Apura Brasil';
      img.src = saved;
      img.dataset.customLogo = 'true';
      placeholder.replaceWith(img);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyLogo, { once: true });
  } else {
    applyLogo();
  }

  window.addEventListener('storage', (event) => {
    if (event.key === KEY) applyLogo();
  });

  window.ApuraBrasilLogo = {
    key: KEY,
    get: getSavedLogo,
    apply: applyLogo
  };
})();
