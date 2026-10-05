(() => {
  'use strict';

  function normalize(text) {
    return String(text || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  }

  function isOfficiallyElected(statusText) {
    const status = normalize(statusText);
    if (!status) return false;
    if (status.includes('nao eleito')) return false;
    if (status.includes('2o turno') || status.includes('2º turno')) return false;
    if (status.includes('suplente')) return false;
    return status.includes('eleit');
  }

  function decorate(card) {
    if (!(card instanceof Element) || !card.matches('.candidate-card')) return;
    const statusEl = card.querySelector('.candidate-status');
    const elected = isOfficiallyElected(statusEl?.textContent || '');

    card.classList.toggle('is-elected', elected);

    const existing = card.querySelector('.elected-badge');
    if (!elected) {
      existing?.remove();
      return;
    }

    if (!existing) {
      const name = card.querySelector('.candidate-name');
      if (name) {
        const badge = document.createElement('span');
        badge.className = 'elected-badge';
        badge.textContent = 'ELEITO';
        badge.setAttribute('aria-label', 'Candidato eleito');
        name.appendChild(badge);
      }
    }
  }

  function scan(root = document) {
    root.querySelectorAll?.('.candidate-card').forEach(decorate);
  }

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (!(node instanceof Element)) continue;
        if (node.matches?.('.candidate-card')) decorate(node);
        scan(node);
      }
      if (mutation.type === 'characterData') {
        const card = mutation.target.parentElement?.closest?.('.candidate-card');
        if (card) decorate(card);
      }
    }
  });

  scan();
  observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
})();
