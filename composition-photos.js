(() => {
  'use strict';

  const photos = new Map();
  const senatePhotos = new Map();
  const nativeFetch = window.fetch.bind(window);

  const norm = value => String(value || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();

  function keys(uf, ...names) {
    const state = String(uf || '').toUpperCase();
    return names.filter(Boolean).map(name => `${state}|${norm(name)}`);
  }

  function rememberCandidate(candidate, uf) {
    const photoUrl = String(candidate?.photoUrl || '').trim();
    if (!photoUrl) return;
    keys(uf, candidate?.ballotName, candidate?.name).forEach(key => photos.set(key, photoUrl));
  }

  function inspectResultPayload(payload, url) {
    if (!payload || !Array.isArray(payload.candidates)) return;
    let uf = String(payload.scope || '').toUpperCase();
    if (!/^[A-Z]{2}$/.test(uf)) {
      try { uf = new URL(url, location.href).searchParams.get('uf')?.toUpperCase() || ''; } catch {}
    }
    payload.candidates.forEach(candidate => rememberCandidate(candidate, uf));
    queueScan();
  }

  window.fetch = async (...args) => {
    const response = await nativeFetch(...args);
    try {
      const raw = typeof args[0] === 'string' ? args[0] : args[0]?.url || '';
      if (raw.includes('/api/results') && raw.includes('action=result')) {
        response.clone().json().then(payload => inspectResultPayload(payload, raw)).catch(() => {});
      }
    } catch {}
    return response;
  };

  async function loadSenatePhotos() {
    try {
      const response = await nativeFetch('/api/senators', { cache: 'force-cache' });
      if (!response.ok) return;
      const payload = await response.json();
      for (const senator of payload?.senators || []) {
        const photoUrl = String(senator?.photoUrl || '').trim();
        if (!photoUrl) continue;
        keys(senator.uf, senator.name, senator.fullName).forEach(key => senatePhotos.set(key, photoUrl));
      }
      queueScan();
    } catch (error) {
      console.warn('ApuraBrasil: fotos do Senado indisponíveis.', error);
    }
  }

  function cardInfo(card) {
    const badge = card.querySelector('.rank-badge');
    const uf = String(badge?.dataset.uf || badge?.textContent || '').trim().toUpperCase();
    if (badge && /^[A-Z]{2}$/.test(uf)) badge.dataset.uf = uf;
    const name = card.querySelector('.projected-main strong')?.textContent?.trim() || '';
    return { badge, uf, name };
  }

  function lookup(uf, name) {
    const key = `${String(uf || '').toUpperCase()}|${norm(name)}`;
    return photos.get(key) || senatePhotos.get(key) || '';
  }

  function putPhoto(card) {
    const { badge, uf, name } = cardInfo(card);
    if (!badge || !uf || !name || badge.querySelector('img')) return;
    const photoUrl = lookup(uf, name);
    if (!photoUrl) return;

    const fallback = uf;
    const img = document.createElement('img');
    img.className = 'projected-photo';
    img.alt = name;
    img.loading = 'lazy';
    img.decoding = 'async';
    img.referrerPolicy = 'no-referrer';
    img.addEventListener('error', () => {
      img.remove();
      badge.classList.remove('has-photo');
      badge.textContent = fallback;
    }, { once: true });
    badge.textContent = '';
    badge.classList.add('has-photo');
    badge.appendChild(img);
    img.src = photoUrl;
  }

  function scan(root = document) {
    if (root instanceof Element && root.matches?.('.projected-card')) putPhoto(root);
    root.querySelectorAll?.('.projected-card').forEach(putPhoto);
  }

  let raf = 0;
  function queueScan() {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => scan());
  }

  const observer = new MutationObserver(mutations => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (!(node instanceof Element)) continue;
        scan(node);
      }
    }
    queueScan();
  });

  function init() {
    observer.observe(document.body, { childList: true, subtree: true });
    loadSenatePhotos();
    scan();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
