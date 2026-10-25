(() => {
  'use strict';
  const root = document.documentElement;
  const validViews = new Set(['map','results','places','zones']);
  let activeView = 'map';
  let resizeRaf = 0;

  const isMobile = () => window.innerWidth <= 900 || ((navigator.maxTouchPoints || 0) > 0 && window.innerWidth <= 1180);

  const icons = {
    map:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 6 5-2 8 3 5-2v13l-5 2-8-3-5 2Z"/><path d="M8 4v13M16 7v13"/></svg>',
    results:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19V9M12 19V5M19 19v-7"/><path d="M3 19h18"/></svg>',
    places:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></svg>',
    zones:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16M4 12h16M4 19h16"/><path d="M7 3v4M12 10v4M17 17v4"/></svg>'
  };

  function ensureNav(){
    if(document.querySelector('.mobile-bottom-nav-v3')) return;
    const nav=document.createElement('nav');
    nav.className='mobile-bottom-nav-v3';
    nav.setAttribute('aria-label','Navegação mobile');
    const items=[['map','Mapa'],['results','Resultados'],['places','Localidades'],['zones','Seções']];
    nav.innerHTML=items.map(([view,label])=>`<button type="button" data-mobile-v3-target="${view}" aria-label="${label}">${icons[view]}<span>${label}</span></button>`).join('');
    nav.addEventListener('click',e=>{const b=e.target.closest('[data-mobile-v3-target]');if(b)setView(b.dataset.mobileV3Target,true)});
    document.body.appendChild(nav);
  }

  function ensureHistoryButton(){
    const actions=document.querySelector('.map-actions');
    if(!actions || document.getElementById('mobileHistoryButton')) return;
    const b=document.createElement('button');
    b.id='mobileHistoryButton';
    b.type='button';
    b.textContent='Histórico';
    b.setAttribute('aria-expanded','false');
    b.addEventListener('click',()=>{
      const open=!root.classList.contains('mobile-history-open');
      root.classList.toggle('mobile-history-open',open);
      b.setAttribute('aria-expanded',open?'true':'false');
    });
    actions.insertBefore(b,actions.firstChild);
  }

  function syncNav(){
    document.querySelectorAll('[data-mobile-v3-target]').forEach(b=>{
      const on=b.dataset.mobileV3Target===activeView;
      b.classList.toggle('is-active',on);
      if(on)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');
    });
  }

  function activateTab(name){
    const tab=document.querySelector(`.detail-tab[data-tab="${name}"]`);
    if(tab && !tab.classList.contains('active')) tab.click();
  }

  function setView(view,user=false){
    if(!validViews.has(view)) view='map';
    activeView=view;
    root.dataset.mobileView=view;
    root.classList.remove('mobile-history-open');
    document.getElementById('mobileHistoryButton')?.setAttribute('aria-expanded','false');
    if(view==='results') activateTab('candidates');
    if(view==='places') activateTab('places');
    if(view==='zones') activateTab('zones');
    syncNav();
    if(view==='map') requestAnimationFrame(()=>{window.dispatchEvent(new Event('resize'));setTimeout(()=>window.dispatchEvent(new Event('resize')),90)});
    if(user){
      const scroller=view==='map'?document.querySelector('.map-panel'):document.querySelector('.detail-panel.active');
      scroller?.scrollTo?.({top:0,behavior:'auto'});
    }
  }

  function fixLogo(){
    const img=document.querySelector('.brand-logo');
    if(!img || img.dataset.mobileFallbackBound) return;
    img.dataset.mobileFallbackBound='1';
    img.addEventListener('error',()=>{
      if(img.dataset.mobileFallbackApplied) return;
      img.dataset.mobileFallbackApplied='1';
      img.src='/assets/logo-apurabrasil.svg';
    });
  }

  function apply(){
    const mobile=isMobile();
    root.classList.toggle('mobile-ui-v3',mobile);
    root.classList.toggle('mobile-ui',mobile);
    root.classList.toggle('mobile-portrait',mobile && innerHeight>=innerWidth);
    root.classList.toggle('mobile-landscape',mobile && innerHeight<innerWidth);
    root.dataset.uiMode=mobile?'mobile':'desktop';
    if(mobile){
      root.dataset.mobileView=activeView;
      ensureNav();
      ensureHistoryButton();
      fixLogo();
      syncNav();
    }else{
      root.classList.remove('mobile-history-open');
      delete root.dataset.mobileView;
    }
  }

  function init(){
    apply();
    document.addEventListener('click',e=>{
      if(!root.classList.contains('mobile-ui-v3')) return;
      const tab=e.target.closest('.detail-tab[data-tab]');
      if(!tab) return;
      const map={candidates:'results',places:'places',zones:'zones'};
      if(map[tab.dataset.tab]){activeView=map[tab.dataset.tab];root.dataset.mobileView=activeView;syncNav()}
    });
    window.addEventListener('pageshow',apply,{passive:true});
    window.addEventListener('resize',()=>{cancelAnimationFrame(resizeRaf);resizeRaf=requestAnimationFrame(apply)},{passive:true});
    window.addEventListener('orientationchange',apply,{passive:true});
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init,{once:true}); else init();
})();
