(() => {
  'use strict';

  const list = document.getElementById('candidateList');
  const host = document.getElementById('candidateHighlights');
  const stage = document.getElementById('mapStage');
  if (!list || !host || !stage) return;

  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const normalize = (text) => String(text || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
  const parsePercent = (text) => {
    const match = String(text || '').match(/([\d.,]+)\s*%/);
    return match ? Number(match[1].replace(/\./g,'').replace(',','.')) || 0 : 0;
  };
  const cleanNumber = (text) => String(text || '').replace(/^N[ºo°]?\s*/i,'').trim();

  function isOfficiallyElected(card) {
    if (card.classList.contains('is-elected')) return true;
    const status = normalize(card.querySelector('.candidate-status')?.textContent || '');
    if (!status || status.includes('nao eleito') || status.includes('2o turno') || status.includes('suplente')) return false;
    return status.includes('eleit');
  }

  function cleanName(card) {
    const el = card.querySelector('.candidate-name');
    if (!el) return 'Candidato';
    const clone = el.cloneNode(true);
    clone.querySelectorAll('.elected-badge').forEach(node => node.remove());
    return clone.textContent.trim() || 'Candidato';
  }

  let lastSignature = '';

  function cardData(card) {
    const name = cleanName(card);
    const party = card.querySelector('.party-chip')?.textContent?.trim() || '—';
    const number = cleanNumber(card.querySelector('.candidate-number')?.textContent || '—');
    const score = card.querySelector('.candidate-score strong')?.textContent?.trim() || '0,00%';
    const chip = card.querySelector('.party-chip');
    const color = chip ? getComputedStyle(chip).backgroundColor : '#165dff';
    const img = card.querySelector('.candidate-avatar img');
    const photoSrc = img?.getAttribute('src') || '';
    const elected = isOfficiallyElected(card);
    return {name,party,number,score,color,photoSrc,elected};
  }

  function render() {
    const cards = [...list.querySelectorAll('.candidate-card')].slice(0,4);
    const data = cards.map(cardData);
    const signature = data.map(item => [item.name,item.party,item.number,item.score,item.photoSrc,item.elected?'1':'0'].join('\u001f')).join('\u001e');
    if (signature === lastSignature) return;
    lastSignature = signature;

    if (!cards.length) {
      host.replaceChildren();
      stage.classList.remove('highlight-ready');
      return;
    }

    host.innerHTML = data.map((item,index) => {
      const percent = Math.max(0,Math.min(100,parsePercent(item.score)));
      const photo = item.photoSrc ? `<img src="${escapeHtml(item.photoSrc)}" alt="Foto de ${escapeHtml(item.name)}" loading="eager" decoding="async" onload="this.parentElement.classList.add('photo-loaded')" onerror="this.remove()">` : '';
      const fallback = item.name.split(/\s+/).filter(Boolean).slice(0,2).map(word => word[0]).join('').toUpperCase();
      const electedBadge = item.elected ? '<span class="highlight-elected-badge" aria-label="Candidato eleito">✓ ELEITO</span>' : '';

      return `<article class="highlight-card${item.elected?' is-elected':''}" data-candidate-name="${escapeHtml(item.name)}" style="animation-delay:${index*55}ms">
        <div class="highlight-ring" style="--pct:${percent};--candidate-color:${escapeHtml(item.color)}">
          <div class="highlight-ring-inner"><div class="highlight-photo">${photo}<span class="highlight-fallback">${escapeHtml(fallback)}</span></div></div>
        </div>
        <div class="highlight-info">
          <div class="highlight-name">${escapeHtml(item.name)}</div>
          <div class="highlight-subline"><span class="highlight-party" style="background:${escapeHtml(item.color)}">${escapeHtml(item.party)}</span><span class="highlight-number">Nº ${escapeHtml(item.number)}</span></div>
          ${electedBadge}
        </div>
        <div class="highlight-percent">${escapeHtml(item.score)}</div>
      </article>`;
    }).join('');

    stage.classList.add('highlight-ready');
    window.dispatchEvent(new CustomEvent('apura:candidate-highlights-rendered'));
  }

  let timer;
  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(render,40);
  };

  new MutationObserver(schedule).observe(list,{
    childList:true,
    subtree:true,
    characterData:true,
    attributes:true,
    attributeFilter:['src']
  });
  window.addEventListener('resize',schedule,{passive:true});
  schedule();
})();