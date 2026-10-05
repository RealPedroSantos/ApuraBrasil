(() => {
  'use strict';
  const mapHead=document.querySelector('.map-head');
  const mapStage=document.getElementById('mapStage');
  const breadcrumb=document.getElementById('breadcrumb');
  if(!mapHead||!mapStage||!breadcrumb)return;

  const UFS={acre:'AC',alagoas:'AL',amapa:'AP',amazonas:'AM',bahia:'BA',ceara:'CE','distrito federal':'DF','espirito santo':'ES',goias:'GO',maranhao:'MA','mato grosso':'MT','mato grosso do sul':'MS','minas gerais':'MG',para:'PA',paraiba:'PB',parana:'PR',pernambuco:'PE',piaui:'PI','rio de janeiro':'RJ','rio grande do norte':'RN','rio grande do sul':'RS',rondonia:'RO',roraima:'RR','santa catarina':'SC','sao paulo':'SP',sergipe:'SE',tocantins:'TO'};
  const norm=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmt=v=>new Intl.NumberFormat('pt-BR').format(Number(v||0));
  let data=null,dataKey='',mode='districts',filterNeighborhood='',preloadTimer=null;

  const switcher=document.createElement('div');
  switcher.className='municipal-layer-switch';
  switcher.setAttribute('aria-label','Camada do município');
  switcher.innerHTML='<button type="button" class="municipal-layer-btn active" data-municipal-layer="districts">Distritos</button><button type="button" class="municipal-layer-btn" data-municipal-layer="neighborhoods">Bairros</button><button type="button" class="municipal-layer-btn" data-municipal-layer="places">Locais de votação</button>';
  const searchWrap=document.querySelector('.geo-search-wrap');
  if(searchWrap)searchWrap.appendChild(switcher);else mapHead.insertAdjacentElement('afterend',switcher);

  const overlay=document.createElement('section');
  overlay.className='municipal-data-layer';
  overlay.setAttribute('aria-live','polite');
  overlay.innerHTML='<div class="municipal-layer-head"><div class="municipal-layer-title"><strong>Camada municipal</strong><span>Dados territoriais e eleitorais</span></div><span class="derived-badge">APURAÇÃO DERIVADA</span></div><div class="municipal-layer-body"></div>';
  mapStage.appendChild(overlay);
  const body=overlay.querySelector('.municipal-layer-body');
  const title=overlay.querySelector('.municipal-layer-title strong');
  const subtitle=overlay.querySelector('.municipal-layer-title span');

  function context(){
    const parts=[...breadcrumb.querySelectorAll('button,span')].filter(el=>!el.classList.contains('crumb-sep')).map(el=>el.textContent.trim()).filter(Boolean);
    if(parts.length<3)return null;
    const stateName=parts[1],municipality=parts[2];
    return {stateName,uf:UFS[norm(stateName)]||'',municipality};
  }
  function expose(){window.ApuraMunicipalData=data?{...data,context:context()}:null;window.dispatchEvent(new CustomEvent('apura:municipal-data',{detail:window.ApuraMunicipalData}));}
  function updateVisibility(){
    const ctx=context();
    switcher.classList.toggle('show',!!ctx);
    if(!ctx){mode='districts';overlay.classList.remove('open');switcher.querySelectorAll('button').forEach((b,i)=>b.classList.toggle('active',i===0));}
  }
  async function loadData(){
    const ctx=context();if(!ctx||!ctx.uf)throw new Error('Não foi possível identificar a UF do município.');
    const key=`${ctx.uf}|${norm(ctx.municipality)}`;
    if(data&&dataKey===key)return data;
    if(overlay.classList.contains('open'))body.innerHTML='<div class="municipal-layer-loading">Carregando bairros e locais de votação do TSE…</div>';
    const response=await fetch(`/api/polling-places?uf=${encodeURIComponent(ctx.uf)}&municipalityName=${encodeURIComponent(ctx.municipality)}`,{headers:{Accept:'application/json'}});
    const payload=await response.json().catch(()=>({}));
    if(!response.ok||payload.ok===false)throw new Error(payload.detail||payload.error||'Não foi possível carregar os locais de votação.');
    const current=context();
    if(!current||`${current.uf}|${norm(current.municipality)}`!==key)return payload;
    data=payload;dataKey=key;filterNeighborhood='';expose();return data;
  }
  function preload(){
    clearTimeout(preloadTimer);
    const ctx=context();if(!ctx||!ctx.uf)return;
    const key=`${ctx.uf}|${norm(ctx.municipality)}`;
    if(data&&dataKey===key)return;
    preloadTimer=setTimeout(()=>loadData().catch(()=>{}),420);
  }
  function note(){return '<div class="municipal-layer-note"><strong>APURAÇÃO DERIVADA.</strong> Bairro não é uma abrangência oficial de totalização do TSE. O ApuraBrasil relaciona locais e seções; os votos por bairro só serão exibidos quando a votação detalhada por seção estiver disponível e vinculada com segurança.</div>';}
  function renderNeighborhoods(){
    title.textContent=`Bairros • ${data?.municipality||context()?.municipality||''}`;
    subtitle.textContent='Cadastro dos locais de votação do TSE • camada derivada';
    const list=data?.neighborhoods||[];
    body.innerHTML=note()+(list.length?`<div class="neighborhood-grid">${list.map(n=>`<button type="button" class="neighborhood-card" data-neighborhood="${esc(n.name)}" style="text-align:left;cursor:pointer"><strong>${esc(n.name)}</strong><div class="n-meta"><span>${fmt(n.places)} locais</span><span>${fmt(n.sections)} seções</span><span>${fmt(n.electorate)} eleitores</span><span>${n.zones?.length?`Zonas ${esc(n.zones.join(', '))}`:''}</span></div><div class="n-status">VOTAÇÃO POR BAIRRO: aguardando votos detalhados das seções</div></button>`).join('')}</div>`:'<div class="municipal-layer-error">Nenhum bairro informado no cadastro do TSE para este município.</div>');
  }
  function renderPlaces(neighborhood=''){
    filterNeighborhood=neighborhood||'';
    title.textContent=`Locais de votação • ${data?.municipality||context()?.municipality||''}`;
    subtitle.textContent=filterNeighborhood?`Bairro: ${filterNeighborhood}`:'Endereço e bairro conforme cadastro eleitoral do TSE';
    const list=(data?.places||[]).filter(p=>!filterNeighborhood||norm(p.neighborhood)===norm(filterNeighborhood));
    body.innerHTML=(filterNeighborhood?`<div class="municipal-layer-note"><button type="button" id="clearNeighborhoodFilter" style="border:0;background:none;padding:0;font:inherit;font-weight:900;cursor:pointer">← Todos os bairros</button> • ${fmt(list.length)} locais em <strong>${esc(filterNeighborhood)}</strong></div>`:'')+(list.length?`<div class="place-list">${list.map(p=>`<article class="place-card" data-place="${esc(p.code)}" data-zone="${esc(p.zone)}"><div class="place-zone">Zona ${esc(p.zone)}<br>Local ${esc(p.code)}</div><div class="place-main"><strong>${esc(p.name||`Local ${p.code}`)}</strong><span>${esc(p.address||'Endereço não informado')}${p.zipCode?` • CEP ${esc(p.zipCode)}`:''}</span><span>${fmt(p.sections?.length||0)} seções • ${fmt(p.electorate)} eleitores</span></div><div class="place-bairro">${esc(p.neighborhood||'Bairro não informado')}</div></article>`).join('')}</div>`:'<div class="municipal-layer-error">Nenhum local de votação encontrado para este recorte.</div>');
    body.querySelector('#clearNeighborhoodFilter')?.addEventListener('click',()=>renderPlaces(''));
  }
  async function show(nextMode){
    mode=nextMode;
    switcher.querySelectorAll('[data-municipal-layer]').forEach(btn=>btn.classList.toggle('active',btn.dataset.municipalLayer===mode));
    if(mode==='districts'){overlay.classList.remove('open');return;}
    overlay.classList.add('open');
    try{await loadData();if(mode==='neighborhoods')renderNeighborhoods();else renderPlaces(filterNeighborhood);}catch(error){body.innerHTML=`<div class="municipal-layer-error">${esc(error.message)}</div>`;}
  }
  switcher.addEventListener('click',e=>{const btn=e.target.closest('[data-municipal-layer]');if(btn)show(btn.dataset.municipalLayer);});
  body.addEventListener('click',e=>{const card=e.target.closest('[data-neighborhood]');if(!card)return;show('places').then(()=>renderPlaces(card.dataset.neighborhood));});
  new MutationObserver(()=>{
    updateVisibility();
    const ctx=context();
    if(ctx&&dataKey&&dataKey!==`${ctx.uf}|${norm(ctx.municipality)}`){data=null;dataKey='';expose();}
    if(!ctx){clearTimeout(preloadTimer);overlay.classList.remove('open');}
    else preload();
  }).observe(breadcrumb,{childList:true,subtree:true});
  updateVisibility();preload();
})();