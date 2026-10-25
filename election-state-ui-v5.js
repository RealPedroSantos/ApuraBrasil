(() => {
  'use strict';
  if (window.__apuraElectionStateUIV5) return;
  window.__apuraElectionStateUIV5 = true;

  const normalize = (text) => String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'')
    .toLowerCase()
    .replace(/\s+/g,' ')
    .trim();

  function cleanCandidateName(card) {
    const el = card?.querySelector?.('.candidate-name');
    if (!el) return '';
    const clone = el.cloneNode(true);
    clone.querySelectorAll('.elected-badge').forEach(node => node.remove());
    return clone.textContent.trim();
  }

  function isOfficiallyElected(card) {
    if (!card) return false;
    if (card.classList.contains('is-elected')) return true;
    const status = normalize(card.querySelector?.('.candidate-status')?.textContent || '');
    if (!status) return false;
    if (status.includes('nao eleito') || status.includes('2o turno') || status.includes('suplente')) return false;
    return status.includes('eleit');
  }

  function electedIndex() {
    const entries = [];
    document.querySelectorAll('#candidateList .candidate-card').forEach(card => {
      const name = cleanCandidateName(card);
      if (name) entries.push({name, key:normalize(name), elected:isOfficiallyElected(card)});
    });
    return entries;
  }

  function decorateHighlights(index) {
    document.querySelectorAll('#candidateHighlights .highlight-card').forEach((card, position) => {
      const explicitName = card.dataset.candidateName || card.querySelector('.highlight-name')?.textContent || '';
      const key = normalize(explicitName);
      const match = index.find(item => item.key === key) || index[position];
      const elected = Boolean(match?.elected);
      card.classList.toggle('is-elected', elected);
      let badge = card.querySelector('.highlight-elected-badge');
      if (elected && !badge) {
        badge = document.createElement('span');
        badge.className = 'highlight-elected-badge';
        badge.setAttribute('aria-label','Candidato eleito');
        badge.textContent = '✓ ELEITO';
        card.querySelector('.highlight-info')?.appendChild(badge);
      } else if (!elected) {
        badge?.remove();
      }
    });
  }

  function decoratePeek(index) {
    document.querySelectorAll('.mobile-map-peek-candidates span').forEach(row => {
      const rowText = normalize(row.textContent || '');
      const match = index.find(item => rowText.startsWith(item.key));
      const elected = Boolean(match?.elected);
      row.classList.toggle('is-elected', elected);
      let badge = row.querySelector('.peek-elected-badge');
      if (elected && !badge) {
        badge = document.createElement('i');
        badge.className = 'peek-elected-badge';
        badge.textContent = 'ELEITO';
        const score = row.querySelector('b');
        if (score) row.insertBefore(badge, score);
        else row.appendChild(badge);
      } else if (!elected) {
        badge?.remove();
      }
    });
  }

  function sync() {
    const index = electedIndex();
    decorateHighlights(index);
    decoratePeek(index);
  }

  let timer = 0;
  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(sync, 30);
  };

  const observer = new MutationObserver(schedule);
  observer.observe(document.documentElement, {
    childList:true,
    subtree:true,
    characterData:true,
    attributes:true,
    attributeFilter:['class']
  });

  window.addEventListener('apura:candidate-highlights-rendered', schedule);
  window.addEventListener('apura:map-result-focus', schedule);
  window.addEventListener('pageshow', schedule, {passive:true});
  schedule();
})();