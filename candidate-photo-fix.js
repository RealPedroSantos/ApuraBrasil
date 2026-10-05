(() => {
  'use strict';

  const PRESIDENT_ELECTION = '/ele2026/6257/fotos/';

  function normalizePhoto(img) {
    if (!(img instanceof HTMLImageElement)) return;
    const raw = img.getAttribute('src') || '';
    if (!raw.includes(PRESIDENT_ELECTION)) return;

    const fixed = raw.replace(/(\/ele2026\/6257\/fotos\/)(?:ac|al|ap|am|ba|ce|df|es|go|ma|mt|ms|mg|pa|pb|pr|pe|pi|rj|rn|rs|ro|rr|sc|sp|se|to|zz)(\/)/i, '$1br$2');
    if (fixed === raw) return;

    img.removeAttribute('onerror');
    img.setAttribute('src', fixed);
    img.dataset.photoScopeFixed = 'br';
    img.addEventListener('error', () => img.remove(), { once: true });
  }

  function scan(root = document) {
    root.querySelectorAll?.('.candidate-avatar img, .highlight-photo img').forEach(normalizePhoto);
  }

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'attributes' && mutation.target instanceof HTMLImageElement) {
        normalizePhoto(mutation.target);
        continue;
      }
      for (const node of mutation.addedNodes) {
        if (!(node instanceof Element)) continue;
        if (node.matches?.('.candidate-avatar img, .highlight-photo img')) normalizePhoto(node);
        scan(node);
      }
    }
  });

  scan();
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['src']
  });
})();
