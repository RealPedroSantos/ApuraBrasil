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

  function render() {
    const cards = [...list.querySelectorAll('.candidate-card')].slice(0,4);
    if (!cards.length) {
      host.innerHTML = '';
      stage.classList.remove('highlight-ready');
      return;
    }

    host.innerHTML = cards.map((card,index) => {
      const name = card.querySelector('.candidate-name')?.textContent?.trim() || 'Candidato';
      const party = card.querySelector('.party-chip')?.textContent?.trim() || '—';
      const number = cleanNumber(card.querySelector('.candidate-number')?.textContent || '—');
      const score = card.querySelector('.candidate-score strong')?.textContent?.trim() || '0,00%';
      const percent = Math.max(0,Math.min(100,parsePercent(score)));
      const chip = card.querySelector('.party-chip');
      const color = chip ? getComputedStyle(chip).backgroundColor : '#165dff';
      const img = card.querySelector('.candidate-avatar img');
      const photo = img?.src ? `<img src="${img.src}" alt="Foto de ${name}" loading="lazy" onload="this.parentElement.classList.add('photo-loaded')" onerror="this.remove()">` : '';
      const fallback = name.split(/\s+/).filter(Boolean).slice(0,2).map(word => word[0]).join('').toUpperCase();

      return `<article class="highlight-card" style="animation-delay:${index*55}ms">
        <div class="highlight-ring" style="--pct:${percent};--candidate-color:${color}">
          <div class="highlight-ring-inner"><div class="highlight-photo">${photo}<span class="highlight-fallback">${fallback}</span></div></div>
        </div>
        <div class="highlight-info">
          <div class="highlight-name">${name}</div>
          <div class="highlight-subline"><span class="highlight-party" style="background:${color}">${party}</span><span class="highlight-number">Nº ${number}</span></div>
        </div>
        <div class="highlight-percent">${score}</div>
      </article>`;
    }).join('');

    stage.classList.add('highlight-ready');
  }

  let timer;
  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(render,40);
  };

  new MutationObserver(schedule).observe(list,{childList:true,subtree:true,attributes:true,attributeFilter:['style','class','src']});
  window.addEventListener('resize',schedule,{passive:true});
  schedule();
})();