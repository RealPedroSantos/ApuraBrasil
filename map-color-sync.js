(() => {
  'use strict';

  const legacyMap = document.getElementById('map');
  const stage = document.getElementById('mapStage');
  const candidateList = document.getElementById('candidateList');
  if (!legacyMap || !stage) return;

  const norm = value => String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g,' ')
    .trim();

  function currentLeaderColor() {
    const chip = candidateList?.querySelector('.candidate-card .party-chip');
    if (!chip) return '';
    return chip.style.backgroundColor || chip.style.background || getComputedStyle(chip).backgroundColor || '';
  }

  function legacyIndex() {
    const byCode = new Map();
    const byName = new Map();
    legacyMap.querySelectorAll('.geo-region').forEach(region => {
      const code = String(region.dataset.code || '');
      const name = norm(region.dataset.name || '');
      if (code) byCode.set(code, region);
      if (name) byName.set(name, region);
    });
    return {byCode, byName};
  }

  function syncColors() {
    const visible = stage.querySelectorAll('.ab-drilldown-region');
    if (!visible.length) return;
    const {byCode, byName} = legacyIndex();
    const fallback = currentLeaderColor();

    visible.forEach(region => {
      const code = String(region.dataset.code || '');
      const name = norm(region.dataset.name || '');
      const source = byCode.get(code) || byName.get(name);
      let fill = region.dataset.voteColor || '';
      if (!fill && source) {
        fill = source.style.fill || getComputedStyle(source).fill || '';
        if (!fill || fill === 'none' || fill === 'rgba(0, 0, 0, 0)') fill = '';
      }
      if (!fill && fallback) fill = fallback;
      if (fill) region.style.setProperty('fill', fill, 'important');
    });
  }

  let timer = null;
  function schedule(delay = 18) {
    clearTimeout(timer);
    timer = setTimeout(syncColors, delay);
  }

  const observer = new MutationObserver(() => schedule());
  observer.observe(legacyMap, {subtree:true, childList:true, attributes:true, attributeFilter:['style','class']});
  observer.observe(stage, {subtree:true, childList:true});
  if (candidateList) observer.observe(candidateList, {subtree:true, childList:true, attributes:true, attributeFilter:['style','class']});

  document.querySelector('.office-nav')?.addEventListener('click', () => schedule(80));
  document.getElementById('refreshButton')?.addEventListener('click', () => schedule(30));
  window.addEventListener('apura:election-year-changed', () => schedule(30));
  window.addEventListener('resize', () => schedule(30), {passive:true});

  schedule(120);
})();