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
  let resolvedOnce = false;

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

  function setLogoVisible(img, visible) {
    if (!(img instanceof HTMLImageElement)) return;
    img.style.setProperty('visibility', visible ? 'visible' : 'hidden', 'important');
    img.style.setProperty('opacity', visible ? '1' : '0', 'important');
  }

  function hideLogoTargets(root = document) {
    if (root instanceof HTMLImageElement && root.matches(SELECTOR)) setLogoVisible(root, false);
    root.querySelectorAll?.(SELECTOR).forEach(img => setLogoVisible(img, false));
  }

  function preload(source) {
    return new Promise(resolve => {
      if (!source) return resolve(false);
      const img = new Image();
      let settled = false;
      const finish = ok => {
        if (settled) return;
        settled = true;
        resolve(ok);
      };
      img.onload = () => finish(true);
      img.onerror = () => finish(false);
      img.src = source;
      if (img.complete && img.naturalWidth > 0) finish(true);
      setTimeout(() => finish(false), 5000);
    });
  }

  function setLogoSource(img, source, reveal = resolvedOnce) {
    if (!(img instanceof HTMLImageElement) || !source) return;
    if (!reveal) setLogoVisible(img, false);
    if (img.getAttribute('src') !== source) img.setAttribute('src', source);
    img.alt = 'Apura Brasil';
    if (source.includes('/assets/logo-apura-current.svg')) delete img.dataset.customLogo;
    else img.dataset.customLogo = '1';
    styleLogo(img);
    if (reveal) setLogoVisible(img, true);
  }

  function removeSyntheticWordmark(root = document) {
    if (root instanceof Element && root.matches?.('.mobile-wordmark-v4')) root.remove();
    root.querySelectorAll?.('.mobile-wordmark-v4').forEach(node => node.remove());
  }

  function applyLogo(root = document, reveal = resolvedOnce) {
    if (applying) return;
    applying = true;
    try {
      const source = desiredLogo();

      if (root instanceof HTMLImageElement && root.matches(SELECTOR)) setLogoSource(root, source, reveal);
      root.querySelectorAll?.(SELECTOR).forEach(img => setLogoSource(img, source, reveal));

      root.querySelectorAll?.('.brand-temp').forEach(placeholder => {
        const img = document.createElement('img');
        img.className = 'brand-logo';
        setLogoSource(img, source, reveal);
        placeholder.replaceWith(img);
      });

      removeSyntheticWordmark(root);
    } finally {
      applying = false;
    }
  }

  async function resolveAndReveal(source, custom = false) {
    let chosen = String(source || '').trim() || DEFAULT_LOGO;
    let ok = await preload(chosen);
    if (!ok && chosen !== DEFAULT_LOGO) {
      chosen = getLocalLogo() || DEFAULT_LOGO;
      ok = await preload(chosen);
    }
    globalLogo = chosen;
    globalCustom = Boolean(custom && chosen === source);
    resolvedOnce = true;
    applyLogo(document, true);
    document.documentElement.classList.add('apura-logo-ready');
    window.dispatchEvent(new CustomEvent('apura:logo-updated', { detail: { url: chosen, custom: globalCustom } }));
    return { url: chosen, custom: globalCustom, loaded: ok };
  }

  async function refreshGlobal(force = false) {
    if (refreshPromise && !force) return refreshPromise;
    if (!resolvedOnce) hideLogoTargets();
    refreshPromise = fetch(`/api/logo?t=${Date.now()}`, { cache: 'no-store', credentials: 'same-origin' })
      .then(response => response.ok ? response.json() : Promise.reject(new Error(`HTTP ${response.status}`)))
      .then(data => resolveAndReveal(String(data?.url || DEFAULT_LOGO).trim() || DEFAULT_LOGO, Boolean(data?.custom)))
      .catch(async error => {
        console.warn('ApuraBrasil: não foi possível consultar a logo global.', error);
        const fallback = getLocalLogo() || DEFAULT_LOGO;
        const result = await resolveAndReveal(fallback, false);
        return { ...result, offline: true };
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
    if (!globalCustom && resolvedOnce) {
      globalLogo = normalized || DEFAULT_LOGO;
      applyLogo(document, true);
    }
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

    if (shouldApply) applyLogo(document, resolvedOnce);
  });

  function start() {
    normalizeLegacyState();
    hideLogoTargets();
    removeSyntheticWordmark(document);
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['src', 'class']
    });
    refreshGlobal();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();

  window.addEventListener('pageshow', () => refreshGlobal(true));
  window.addEventListener('resize', () => applyLogo(document, resolvedOnce), { passive: true });
  window.addEventListener('orientationchange', () => applyLogo(document, resolvedOnce), { passive: true });
  window.addEventListener('storage', event => {
    if (event.key === LOCAL_KEY && !globalCustom) refreshGlobal(true);
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
    apply: () => applyLogo(document, resolvedOnce),
    refresh: refreshGlobal,
    isGlobalCustom: () => globalCustom,
    isReady: () => resolvedOnce,
    resetLocal: () => {
      const ok = clearLocalLogo();
      refreshGlobal(true);
      return ok;
    }
  };
})();
