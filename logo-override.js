(() => {
  'use strict';

  const LOCAL_KEY = 'apurabrasil.customLogo.v2';
  const LEGACY_KEY = 'apurabrasil.customLogo';
  const DEFAULT_LOGO = '/assets/logo-apura-current.svg?v=20261025-official';
  const SELECTOR = '.brand-logo, .projection-logo';
  let globalLogo = '';
  let globalCustom = false;
  let applying = false;
  let refreshPromise = null;

  function getLocalLogo() {
    try { return String(localStorage.getItem(LOCAL_KEY) || '').trim(); } catch { return ''; }
  }

  function clearLocalLogo() {
    try {
      localStorage.removeItem(LOCAL_KEY);
      localStorage.removeItem(LEGACY_KEY);
      return true;
    } catch {
      return false;
    }
  }

  function desiredLogo() {
    return globalLogo || getLocalLogo() || DEFAULT_LOGO;
  }

  function isMobileHeader() {
    return document.documentElement.classList.contains('mobile-app-v4') ||
      window.matchMedia?.('(max-width: 900px)')?.matches || false;
  }

  function normalizeLegacyState() {
    try {
      const legacy = String(localStorage.getItem(LEGACY_KEY) || '').trim();
      if (legacy && !localStorage.getItem(LOCAL_KEY)) localStorage.setItem(LOCAL_KEY, legacy);
      localStorage.removeItem(LEGACY_KEY);
    } catch {}
  }

  function styleLogo(img) {
    if (!(img instanceof HTMLImageElement)) return;

    if (img.classList.contains('brand-logo') && isMobileHeader()) {
      img.style.setProperty('display', 'block', 'important');
      img.style.setProperty('width', 'clamp(118px, 38vw, 170px)', 'important');
      img.style.setProperty('height', '42px', 'important');
      img.style.setProperty('max-width', '100%', 'important');
      img.style.setProperty('max-height', '42px', 'important');
      img.style.setProperty('object-fit', 'contain', 'important');
      img.style.setProperty('object-position', 'left center', 'important');
      img.style.setProperty('flex', '0 1 auto', 'important');
    } else if (img.classList.contains('brand-logo')) {
      ['display','width','height','max-width','max-height','object-fit','object-position','flex']
        .forEach(property => img.style.removeProperty(property));
    }
  }

  function setLogoSource(img, source) {
    if (!(img instanceof HTMLImageElement) || !source) return;
    if (img.getAttribute('src') !== source) img.setAttribute('src', source);
    img.alt = 'Apura Brasil';
    if (source.includes('/assets/logo-apura-current.svg')) delete img.dataset.customLogo;
    else img.dataset.customLogo = '1';
    styleLogo(img);
  }

  function removeSyntheticWordmark(root = document) {
    if (root instanceof Element && root.matches?.('.mobile-wordmark-v4')) root.remove();
    root.querySelectorAll?.('.mobile-wordmark-v4').forEach(node => node.remove());
  }

  function applyLogo(root = document) {
    if (applying) return;
    applying = true;
    try {
      const source = desiredLogo();

      if (root instanceof HTMLImageElement && root.matches(SELECTOR)) setLogoSource(root, source);
      root.querySelectorAll?.(SELECTOR).forEach(img => setLogoSource(img, source));

      root.querySelectorAll?.('.brand-temp').forEach(placeholder => {
        const img = document.createElement('img');
        img.className = 'brand-logo';
        setLogoSource(img, source);
        placeholder.replaceWith(img);
      });

      removeSyntheticWordmark(root);
    } finally {
      applying = false;
    }
  }

  async function refreshGlobal(force = false) {
    if (refreshPromise && !force) return refreshPromise;
    refreshPromise = fetch(`/api/logo?t=${Date.now()}`, { cache: 'no-store', credentials: 'same-origin' })
      .then(response => response.ok ? response.json() : Promise.reject(new Error(`HTTP ${response.status}`)))
      .then(data => {
        globalLogo = String(data?.url || DEFAULT_LOGO).trim() || DEFAULT_LOGO;
        globalCustom = Boolean(data?.custom);
        applyLogo();
        window.dispatchEvent(new CustomEvent('apura:logo-updated', { detail: { url: globalLogo, custom: globalCustom } }));
        return { url: globalLogo, custom: globalCustom };
      })
      .catch(error => {
        console.warn('ApuraBrasil: não foi possível consultar a logo global.', error);
        applyLogo();
        return { url: desiredLogo(), custom: globalCustom, offline: true };
      })
      .finally(() => { refreshPromise = null; });
    return refreshPromise;
  }

  function saveLocalLogo(source) {
    const normalized = String(source || '').trim();
    try {
      if (normalized) localStorage.setItem(LOCAL_KEY, normalized);
      else localStorage.removeItem(LOCAL_KEY);
    } catch {
      return false;
    }
    if (!globalCustom) applyLogo();
    return getLocalLogo() === normalized;
  }

  const observer = new MutationObserver(mutations => {
    if (applying) return;
    let shouldApply = false;

    for (const mutation of mutations) {
      if (mutation.type === 'attributes') {
        if (mutation.target === document.documentElement ||
            (mutation.target instanceof HTMLImageElement && mutation.target.matches(SELECTOR))) {
          shouldApply = true;
          break;
        }
      }

      for (const node of mutation.addedNodes) {
        if (!(node instanceof Element)) continue;
        if (node.matches?.(SELECTOR) || node.querySelector?.(SELECTOR) ||
            node.matches?.('.brand-temp,.mobile-wordmark-v4') ||
            node.querySelector?.('.brand-temp,.mobile-wordmark-v4')) {
          shouldApply = true;
          break;
        }
      }
      if (shouldApply) break;
    }

    if (shouldApply) applyLogo();
  });

  function start() {
    normalizeLegacyState();
    applyLogo();
    refreshGlobal();
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['src', 'class']
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();

  window.addEventListener('pageshow', () => refreshGlobal(true));
  window.addEventListener('resize', () => applyLogo(), { passive: true });
  window.addEventListener('orientationchange', () => applyLogo(), { passive: true });
  window.addEventListener('storage', event => {
    if (event.key === LOCAL_KEY) applyLogo();
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) refreshGlobal(true);
  });

  window.ApuraBrasilLogo = {
    key: LOCAL_KEY,
    default: DEFAULT_LOGO,
    get: desiredLogo,
    current: desiredLogo,
    getLocal: getLocalLogo,
    setLocal: saveLocalLogo,
    clearLocal: clearLocalLogo,
    apply: applyLogo,
    refresh: refreshGlobal,
    isGlobalCustom: () => globalCustom,
    resetLocal: () => {
      const ok = clearLocalLogo();
      applyLogo();
      return ok;
    }
  };
})();
