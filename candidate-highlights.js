(() => {
  'use strict';

  const list = document.getElementById('candidateList');
  const host = document.getElementById('candidateHighlights');
  const stage = document.getElementById('mapStage');
  if (!list || !host || !stage) return;

  const parsePercent = (text) => {
    const match = String(text || '').match(/([\d.,]+)\s*%/);
    return match ? Number(match[1].replace(/\./g,'').replace(',','.')) || 0 : 0;
  };

  const cleanNumber = (text) => String(text || '').replace(/^Nº\s*/i,'').trim();
  const normalizePhotoUrl = (url) => String(url || '').replace(/(\/ele2026\/6257\/fotos\/)(?:ac|al|ap|am|ba|ce|df|es|go|ma|mt|ms|mg|pa|pb|pr|pe|pi|rj|rn|rs|ro|rr|sc|sp|se|to|zz)(\/)/i,'$1br$2');
  let lastSignature = '';

  function cardData(card) {
    const name = card.querySelector('.candidate-name')?.textContent?.trim() || 'Candidato';
    const party = card.querySelector('.party-chip')?.textContent?.trim() || '—';
    const number = cleanNumber(card.querySelector('.candidate-number')?.textContent || '—');
    const score = card.querySelector('.candidate-score strong')?.textContent?.trim() || '0,00%';
    const chip = card.querySelector('.party-chip');
    const color = chip ? getComputedStyle(chip).backgroundColor : '#165dff';
    const img = card.querySelector('.candidate-avatar img');
    const photoSrc = normalizePhotoUrl(img?.getAttribute('src') || '');
    return {name,party,number,score,color,photoSrc};
  }

  function render() {
    const cards = [...list.querySelectorAll('.candidate-card')].slice(0,4);
    const data = cards.map(cardData);
    const signature = data.map(item => [item.name,item.party,item.number,item.score,item.photoSrc].join('\u001f')).join('\u001e');

    if (signature === lastSignature) return;
    lastSignature = signature;

    if (!cards.length) {
      host.replaceChildren();
      stage.classList.remove('highlight-ready');
      return;
    }

    host.innerHTML = data.map((item,index) => {
      const percent = Math.max(0,Math.min(100,parsePercent(item.score)));
      const photo = item.photoSrc ? `<img src="${item.photoSrc}" alt="Foto de ${item.name}" loading="eager" decoding="async" onload="this.parentElement.classList.add('photo-loaded')" onerror="this.remove()">` : '';
      const fallback = item.name.split(/\s+/).filter(Boolean).slice(0,2).map(word => word[0]).join('').toUpperCase();

      return `<article class="highlight-card" style="animation-delay:${index*55}ms">
        <div class="highlight-ring" style="--pct:${percent};--candidate-color:${item.color}">
          <div class="highlight-ring-inner"><div class="highlight-photo">${photo}<span class="highlight-fallback">${fallback}</span></div></div>
        </div>
        <div class="highlight-info">
          <div class="highlight-name">${item.name}</div>
          <div class="highlight-subline"><span class="highlight-party" style="background:${item.color}">${item.party}</span><span class="highlight-number">Nº ${item.number}</span></div>
        </div>
        <div class="highlight-percent">${item.score}</div>
      </article>`;
    }).join('');

    stage.classList.add('highlight-ready');
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
