(() => {
  'use strict';
  if (window.__apuraMobileAppV4) return;
  window.__apuraMobileAppV4 = true;

  const root=document.documentElement;
  const views=new Set(['map','results','places','zones']);
  const requestedView=new URLSearchParams(location.search).get('mobileView');
  let activeView=views.has(requestedView)?requestedView:'map';
  let raf=0;
  let peekRaf=0;

  const isMobile=()=>window.innerWidth<=900||((navigator.maxTouchPoints||0)>0&&window.innerWidth<=1180);
  const icons={
    map:'<svg viewBox="0 0 24 24"><path d="m3 6 5-2 8 3 5-2v13l-5 2-8-3-5 2Z"/><path d="M8 4v13M16 7v13"/></svg>',
    results:'<svg viewBox="0 0 24 24"><path d="M5 19V9M12 19V5M19 19v-7"/><path d="M3 19h18"/></svg>',
    places:'<svg viewBox="0 0 24 24"><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></svg>',
    zones:'<svg viewBox="0 0 24 24"><path d="M4 5h16M4 12h16M4 19h16"/><path d="M7 3v4M12 10v4M17 17v4"/></svg>',
    more:'<svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/></svg>'
  };

  function removeSyntheticWordmark(){
    document.querySelectorAll('.mobile-wordmark-v4').forEach(node=>node.remove());
  }

  function activateTab(name){
    const tab=document.querySelector(`.detail-tab[data-tab="${name}"]`);
    if(tab&&!tab.classList.contains('active'))tab.click();
  }

  function closeSheets(){
    root.classList.remove('mobile-more-open','mobile-history-open-v4');
  }

  function syncNav(){
    document.querySelectorAll('[data-mobile-v4-target]').forEach(button=>{
      const target=button.dataset.mobileV4Target;
      const on=target===activeView&&!root.classList.contains('mobile-more-open');
      button.classList.toggle('is-active',on);
      if(on)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');
    });
    const more=document.querySelector('[data-mobile-v4-target="more"]');
    more?.classList.toggle('is-active',root.classList.contains('mobile-more-open'));
  }

  function setView(view,user=true){
    if(!views.has(view))view='map';
    activeView=view;root.dataset.mobileView=view;closeSheets();
    if(view==='results')activateTab('candidates');
    if(view==='places')activateTab('places');
    if(view==='zones')activateTab('zones');
    syncNav();
    if(view==='map')requestAnimationFrame(()=>{window.dispatchEvent(new Event('resize'));setTimeout(()=>window.dispatchEvent(new Event('resize')),80);});
    if(user){
      const scroller=view==='map'?document.querySelector('.map-panel'):document.querySelector('.detail-panel.active');
      scroller?.scrollTo?.({top:0,behavior:'auto'});
    }
  }

  function ensureNav(){
    if(document.querySelector('.mobile-app-nav-v4'))return;
    const nav=document.createElement('nav');nav.className='mobile-app-nav-v4';nav.setAttribute('aria-label','Menu principal');
    const items=[['map','Mapa'],['results','Resultados'],['places','Localidades'],['zones','Seções'],['more','Mais']];
    nav.innerHTML=items.map(([key,label])=>`<button type="button" data-mobile-v4-target="${key}" aria-label="${label}">${icons[key]}<span>${label}</span></button>`).join('');
    nav.addEventListener('click',event=>{
      const b=event.target.closest('[data-mobile-v4-target]');if(!b)return;
      const target=b.dataset.mobileV4Target;
      if(target==='more'){
        root.classList.toggle('mobile-more-open');root.classList.remove('mobile-history-open-v4');syncNav();return;
      }
      setView(target,true);
    });
    document.body.appendChild(nav);
  }

  function ensureMoreSheet(){
    if(document.querySelector('.mobile-more-sheet-v4'))return;
    const sheet=document.createElement('section');sheet.className='mobile-more-sheet-v4';sheet.setAttribute('aria-label','Mais opções');
    sheet.innerHTML='<button type="button" data-v4-action="history">Histórico eleitoral</button><a href="/composicao">Composição</a><button type="button" data-v4-action="refresh">Atualizar dados</button><button type="button" data-v4-action="brazil">Voltar ao Brasil</button>';
    sheet.addEventListener('click',event=>{
      const action=event.target.closest('[data-v4-action]')?.dataset.v4Action;
      if(!action)return;
      root.classList.remove('mobile-more-open');
      if(action==='history')root.classList.add('mobile-history-open-v4');
      if(action==='refresh')document.getElementById('refreshButton')?.click();
      if(action==='brazil'){document.getElementById('resetButton')?.click();setView('map',true);}
      syncNav();
    });
    document.body.appendChild(sheet);
  }

  function candidatePeek(){
    const cards=[...document.querySelectorAll('#candidateList .candidate-card')].slice(0,2);
    if(!cards.length)return [];
    return cards.map(card=>({name:card.querySelector('.candidate-name')?.textContent?.trim()||'Candidato',score:card.querySelector('.candidate-score strong')?.textContent?.trim()||'0,00%'}));
  }

  function ensurePeek(){
    const stage=document.getElementById('mapStage');if(!stage||stage.querySelector('.mobile-map-peek-v4'))return;
    const peek=document.createElement('div');peek.className='mobile-map-peek-v4';peek.setAttribute('role','button');peek.tabIndex=0;
    peek.innerHTML='<div class="mobile-map-peek-main"><span class="mobile-map-peek-kicker">Resultado total</span><strong class="mobile-map-peek-title">Brasil</strong><div class="mobile-map-peek-candidates"></div></div><button type="button" class="mobile-map-peek-open" aria-label="Abrir resultados">›</button>';
    const open=()=>setView('results',true);
    peek.addEventListener('click',open);peek.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();open();}});
    stage.appendChild(peek);updatePeek();
  }

  function updatePeek(detail){
    cancelAnimationFrame(peekRaf);peekRaf=requestAnimationFrame(()=>{
      const peek=document.querySelector('.mobile-map-peek-v4');if(!peek)return;
      const title=detail?.name||document.getElementById('scopeTitle')?.textContent?.trim()||document.getElementById('mapTitle')?.textContent?.trim()||'Brasil';
      const active=detail?.active===true;
      const cands=detail?.candidates?.length?detail.candidates.slice(0,2).map(c=>({name:c.ballotName||c.name||'Candidato',score:`${Number(c.percentage||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})}%`})):candidatePeek();
      const kicker=peek.querySelector('.mobile-map-peek-kicker'),heading=peek.querySelector('.mobile-map-peek-title'),row=peek.querySelector('.mobile-map-peek-candidates');
      if(kicker)kicker.textContent=active?'Resultado do bairro':'Resultado total';
      if(heading)heading.textContent=title;
      if(row)row.innerHTML=cands.length?cands.map(c=>`<span>${escapeHtml(c.name)} <b>${escapeHtml(c.score)}</b></span>`).join(''):'<span>Toque no mapa para explorar a apuração</span>';
    });
  }

  function escapeHtml(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}

  function bindPeekUpdates(){
    window.addEventListener('apura:map-result-focus',event=>updatePeek(event.detail||{}));
    const nodes=[document.getElementById('scopeTitle'),document.getElementById('candidateList')].filter(Boolean);
    if(nodes.length){const observer=new MutationObserver(()=>updatePeek());nodes.forEach(node=>observer.observe(node,{childList:true,subtree:true,characterData:true}));}
  }

  function apply(){
    const mobile=isMobile();
    root.classList.toggle('mobile-app-v4',mobile);
    root.classList.toggle('mobile-portrait',mobile&&innerHeight>=innerWidth);
    root.classList.toggle('mobile-landscape',mobile&&innerHeight<innerWidth);
    root.dataset.uiMode=mobile?'mobile':'desktop';
    removeSyntheticWordmark();
    if(mobile){root.dataset.mobileView=activeView;ensureNav();ensureMoreSheet();ensurePeek();syncNav();updatePeek();}
    else{root.classList.remove('mobile-more-open','mobile-history-open-v4');delete root.dataset.mobileView;}
  }

  function init(){
    apply();bindPeekUpdates();
    if(views.has(requestedView))requestAnimationFrame(()=>setView(requestedView,false));
    document.addEventListener('click',event=>{
      if(!root.classList.contains('mobile-app-v4'))return;
      const tab=event.target.closest('.detail-tab[data-tab]');if(!tab)return;
      const map={candidates:'results',places:'places',zones:'zones'};
      if(map[tab.dataset.tab]){activeView=map[tab.dataset.tab];root.dataset.mobileView=activeView;syncNav();}
    });
    window.addEventListener('pageshow',apply,{passive:true});
    window.addEventListener('resize',()=>{cancelAnimationFrame(raf);raf=requestAnimationFrame(apply);},{passive:true});
    window.addEventListener('orientationchange',apply,{passive:true});
  }

  window.ApuraMobileV4={setView};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();