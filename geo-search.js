(() => {
  'use strict';
  const mapPanel=document.querySelector('.map-panel');
  const mapHead=document.querySelector('.map-head');
  const mapStage=document.getElementById('mapStage');
  const zoneList=document.getElementById('zoneList');
  if(!mapPanel||!mapHead||!mapStage)return;

  const wrap=document.createElement('div');
  wrap.className='geo-search-wrap';
  wrap.innerHTML='<div class="geo-search-box"><span class="geo-search-icon">⌕</span><input id="geoSearchInput" class="geo-search-input" type="search" autocomplete="off" spellcheck="false" placeholder="Buscar estado, município, distrito, zona ou seção"><button class="geo-search-clear" type="button" aria-label="Limpar busca">×</button><div id="geoSearchResults" class="geo-search-results" role="listbox"></div></div>';
  mapHead.insertAdjacentElement('afterend',wrap);
  const input=wrap.querySelector('#geoSearchInput');
  const results=wrap.querySelector('#geoSearchResults');
  const clear=wrap.querySelector('.geo-search-clear');
  let timer=null,requestId=0,items=[];

  const norm=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const wait=ms=>new Promise(r=>setTimeout(r,ms));
  async function waitFor(fn,timeout=18000){const start=Date.now();while(Date.now()-start<timeout){const value=typeof fn==='function'?fn():document.querySelector(fn);if(value)return value;await wait(90);}throw new Error('Tempo esgotado ao abrir a localidade.');}
  function typeLabel(type){return ({state:'Estado',municipality:'Município',district:'Distrito',zone:'Zona',section:'Seção'})[type]||type;}
  function typeIcon(type){return ({state:'UF',municipality:'M',district:'D',zone:'Z',section:'S'})[type]||'•';}
  function subtitle(item){
    if(item.type==='state')return item.abbr||item.name;
    if(item.type==='municipality')return `${item.abbr||''} • ${item.stateName||''}`;
    if(item.type==='district')return `${item.municipalityName||''} • ${item.abbr||''}`;
    if(item.type==='zone')return `${item.municipalityName||'Município atual'} • Zona ${item.zone}`;
    if(item.type==='section')return `${item.municipalityName||'Município atual'} • Zona ${item.zone}`;
    return '';
  }
  function render(list,message=''){
    items=list||[];
    if(message){results.innerHTML=`<div class="geo-search-loading">${esc(message)}</div>`;results.classList.add('open');return;}
    if(!items.length){results.innerHTML='<div class="geo-search-empty">Nenhum local encontrado.</div>';results.classList.add('open');return;}
    results.innerHTML=items.map((item,i)=>`<button type="button" class="geo-search-item" data-index="${i}" role="option"><span class="geo-search-type">${typeIcon(item.type)}</span><span class="geo-search-copy"><strong>${esc(item.label||item.name||'')}</strong><span>${esc(subtitle(item))}</span></span><span class="geo-search-kind">${typeLabel(item.type)}</span></button>`).join('');
    results.classList.add('open');
  }
  function currentMunicipality(){
    const crumbs=[...document.querySelectorAll('#breadcrumb button,#breadcrumb span')].map(el=>el.textContent.trim()).filter(Boolean);
    return crumbs.length>=3?crumbs[2]:document.getElementById('mapTitle')?.textContent?.trim()||'';
  }
  function localElectionMatches(q){
    const out=[];
    if(!zoneList)return out;
    const nq=norm(q),zoneMatch=nq.match(/(?:zona\s*)?(\d{1,4})$/),sectionMatch=nq.match(/(?:secao\s*)?(\d{1,4})$/);
    const asksZone=nq.includes('zona');
    const asksSection=nq.includes('secao');
    const city=currentMunicipality();
    if(asksZone&&zoneMatch){
      const wanted=zoneMatch[1];
      [...zoneList.querySelectorAll('.zone-card')].forEach(card=>{const text=card.querySelector('h4')?.textContent||'';const m=text.match(/(\d+)/);if(m&&m[1].includes(wanted))out.push({type:'zone',label:`Zona ${m[1]}`,zone:m[1],municipalityName:city});});
    }
    if(asksSection&&sectionMatch){
      const wanted=sectionMatch[1];
      [...zoneList.querySelectorAll('.zone-card')].forEach(card=>{const z=(card.querySelector('h4')?.textContent||'').match(/(\d+)/)?.[1]||'';[...card.querySelectorAll('.section-pill')].forEach(pill=>{const n=pill.textContent.trim();if(n===wanted||n.startsWith(wanted))out.push({type:'section',label:`Seção ${n}`,section:n,zone:z,municipalityName:city});});});
    }
    return out.slice(0,10);
  }
  async function search(q){
    const my=++requestId;
    if(norm(q).length<2){results.classList.remove('open');return;}
    render([], 'Buscando localidades…');
    const local=localElectionMatches(q);
    try{
      const response=await fetch(`/api/geo?level=search&q=${encodeURIComponent(q)}`,{headers:{Accept:'application/json'}});
      const payload=await response.json();
      if(my!==requestId)return;
      const remote=(payload.items||[]).map(x=>({...x,label:x.name}));
      render([...local,...remote].slice(0,18));
    }catch{
      if(my!==requestId)return;
      render(local);
    }
  }
  function navStatus(text){const el=document.createElement('div');el.className='geo-search-nav-status';el.textContent=text;mapStage.appendChild(el);return()=>el.remove();}
  async function clickRegion(code){
    const region=await waitFor(()=>[...document.querySelectorAll('#map .geo-region')].find(el=>String(el.dataset.code)===String(code)));
    region.click();return region;
  }
  async function navigateGeo(item){
    const done=navStatus(`Abrindo ${item.name}…`);
    results.classList.remove('open');
    try{
      document.getElementById('resetButton')?.click();
      await waitFor(()=>document.querySelector('#map .geo-region'));
      await clickRegion(item.stateCode||item.code);
      if(item.type==='state')return;
      await waitFor(()=>[...document.querySelectorAll('#map .geo-region')].some(el=>String(el.dataset.code)===String(item.municipalityCode)));
      await clickRegion(item.municipalityCode);
      if(item.type==='municipality')return;
      await waitFor(()=>[...document.querySelectorAll('#map .geo-region')].some(el=>String(el.dataset.code)===String(item.districtCode||item.code)),25000);
      await clickRegion(item.districtCode||item.code);
    }finally{done();input.value='';}
  }
  async function navigateElection(item){
    results.classList.remove('open');
    const tab=document.querySelector('.detail-tab[data-tab="zones"]');tab?.click();
    await wait(80);
    const cards=[...document.querySelectorAll('#zoneList .zone-card')];
    const card=cards.find(c=>(c.querySelector('h4')?.textContent||'').match(/(\d+)/)?.[1]===String(item.zone));
    if(!card)return;
    let target=card;
    if(item.type==='section')target=[...card.querySelectorAll('.section-pill')].find(p=>p.textContent.trim()===String(item.section))||card;
    target.scrollIntoView({behavior:'smooth',block:'center'});target.classList.add('search-target');setTimeout(()=>target.classList.remove('search-target'),2600);
    input.value='';
  }
  results.addEventListener('click',async e=>{const btn=e.target.closest('[data-index]');if(!btn)return;const item=items[Number(btn.dataset.index)];if(!item)return;try{if(item.type==='zone'||item.type==='section')await navigateElection(item);else await navigateGeo(item);}catch(error){const done=navStatus(error.message||'Não foi possível abrir o local.');setTimeout(done,1800);}});
  input.addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(()=>search(input.value),180);});
  input.addEventListener('focus',()=>{if(input.value.trim().length>=2)search(input.value);});
  input.addEventListener('keydown',e=>{if(e.key==='Escape'){results.classList.remove('open');input.blur();}if(e.key==='Enter'){const first=results.querySelector('[data-index]');if(first){e.preventDefault();first.click();}}});
  clear.addEventListener('click',()=>{input.value='';results.classList.remove('open');input.focus();});
  document.addEventListener('pointerdown',e=>{if(!wrap.contains(e.target))results.classList.remove('open');});
})();