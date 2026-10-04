(() => {
  'use strict';

  const OFFICE_LABELS = {
    presidente: 'Presidente',
    governador: 'Governador',
    senador: 'Senador',
    'deputado-federal': 'Deputado Federal',
    'deputado-estadual': 'Deputado Estadual'
  };

  const PARTY_COLORS = {
    PL:'#165dff', PT:'#e31d2b', PSD:'#ef8d22', NOVO:'#e86e1c', MDB:'#3e9278',
    PSOL:'#d5b913', PDT:'#d34646', PSB:'#d5a51d', PP:'#3471bf', 'UNIÃO':'#207da5',
    REPUBLICANOS:'#587cca', AVANTE:'#7b1bd1', PCB:'#8d2737', PSTU:'#b82d3d', UP:'#bd20c8',
    PCO:'#7a2530', DC:'#23847b', 'MISSÃO':'#6e58a0', DEMOCRATA:'#25838d'
  };

  const state = {
    office: 'presidente',
    level: 'br',
    selectedState: null,
    selectedMunicipality: null,
    selectedDistrict: null,
    states: [], municipalities: [], districts: [],
    currentGeo: null,
    lastResult: null,
    tooltipTimer: null
  };

  const $ = (id) => document.getElementById(id);
  const els = {
    feedStatus:$('feedStatus'), bottomSource:$('bottomSource'), clock:$('clock'),
    map:$('map'), mapStage:$('mapStage'), mapTooltip:$('mapTooltip'), mapTitle:$('mapTitle'), mapSubtitle:$('mapSubtitle'),
    breadcrumb:$('breadcrumb'), scopeTitle:$('scopeTitle'), scopeSubtitle:$('scopeSubtitle'), selectionStatus:$('selectionStatus'),
    resultSummary:$('resultSummary'), candidateList:$('candidateList'), citySelect:$('citySelect'), cityHelp:$('cityHelp'),
    districtList:$('districtList'), zoneList:$('zoneList'), refreshButton:$('refreshButton'), backButton:$('backButton'), resetButton:$('resetButton')
  };

  const escapeHtml = (value) => String(value ?? '').replace(/[&<>\"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]));
  const fmt = (value) => new Intl.NumberFormat('pt-BR').format(Number(value || 0));
  const pct = (value) => `${Number(value || 0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})}%`;

  function partyColor(party) {
    const key = String(party || '').toUpperCase();
    if (PARTY_COLORS[key]) return PARTY_COLORS[key];
    let hash = 0;
    for (const char of key) hash = (hash * 31 + char.charCodeAt(0)) % 360;
    return `hsl(${hash || 205} 62% 46%)`;
  }

  async function api(url) {
    const response = await fetch(url,{headers:{Accept:'application/json'}});
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.ok === false) throw new Error(payload.detail || payload.error || `HTTP ${response.status}`);
    return payload;
  }

  function scopeName() {
    return state.selectedDistrict?.name || state.selectedMunicipality?.name || state.selectedState?.name || 'Brasil';
  }

  function setSourceStatus(text, good=true) {
    els.feedStatus.textContent = text;
    els.bottomSource.textContent = text;
    document.querySelectorAll('.status-dot').forEach(dot => dot.classList.toggle('bad',!good));
  }

  function updateTitles() {
    const scope = scopeName();
    els.scopeTitle.textContent = scope;
    els.scopeSubtitle.textContent = OFFICE_LABELS[state.office];
    els.selectionStatus.textContent = `${scope} • ${OFFICE_LABELS[state.office]}`;
    renderBreadcrumb();
  }

  function renderBreadcrumb() {
    const parts = [{label:'Brasil',action:'br'}];
    if (state.selectedState) parts.push({label:state.selectedState.name,action:'state'});
    if (state.selectedMunicipality) parts.push({label:state.selectedMunicipality.name,action:'municipality'});
    if (state.selectedDistrict) parts.push({label:state.selectedDistrict.name,action:null});
    els.breadcrumb.innerHTML = parts.map((part,index) => {
      const sep = index ? '<span class="crumb-sep">›</span>' : '';
      return part.action ? `${sep}<button type="button" data-crumb="${part.action}">${escapeHtml(part.label)}</button>` : `${sep}<span>${escapeHtml(part.label)}</span>`;
    }).join('');
    els.breadcrumb.querySelectorAll('[data-crumb]').forEach(button => button.addEventListener('click',() => goTo(button.dataset.crumb)));
  }

  function flattenCoordinates(value,out=[]) {
    if (!Array.isArray(value)) return out;
    if (value.length >= 2 && typeof value[0] === 'number' && typeof value[1] === 'number') { out.push([value[0],value[1]]); return out; }
    value.forEach(child => flattenCoordinates(child,out));
    return out;
  }

  function geoBounds(geojson) {
    const points=[];
    (geojson?.features || []).forEach(feature => flattenCoordinates(feature?.geometry?.coordinates,points));
    if (!points.length) return {minLon:-74,maxLon:-34,minLat:-34,maxLat:6};
    return {
      minLon:Math.min(...points.map(p=>p[0])), maxLon:Math.max(...points.map(p=>p[0])),
      minLat:Math.min(...points.map(p=>p[1])), maxLat:Math.max(...points.map(p=>p[1]))
    };
  }

  function projector(bounds,width,height,padding) {
    const lonSpan=Math.max(.001,bounds.maxLon-bounds.minLon), latSpan=Math.max(.001,bounds.maxLat-bounds.minLat);
    const scale=Math.min((width-padding*2)/lonSpan,(height-padding*2)/latSpan);
    const usedW=lonSpan*scale, usedH=latSpan*scale, ox=(width-usedW)/2, oy=(height-usedH)/2;
    return ([lon,lat]) => [ox+(lon-bounds.minLon)*scale,oy+(bounds.maxLat-lat)*scale];
  }

  function ringPath(ring,project) {
    if (!Array.isArray(ring) || !ring.length) return '';
    return ring.map((point,index) => { const [x,y]=project(point); return `${index?'L':'M'}${x.toFixed(2)},${y.toFixed(2)}`; }).join(' ')+' Z';
  }

  function geometryPath(geometry,project) {
    if (!geometry) return '';
    if (geometry.type === 'Polygon') return (geometry.coordinates || []).map(ring => ringPath(ring,project)).join(' ');
    if (geometry.type === 'MultiPolygon') return (geometry.coordinates || []).flatMap(poly => poly.map(ring => ringPath(ring,project))).join(' ');
    return '';
  }

  function selectedCode(level) {
    if (level === 'municipalities') return state.selectedMunicipality?.code;
    if (level === 'districts') return state.selectedDistrict?.code;
    return null;
  }

  function showTooltip(name,event,region) {
    clearTimeout(state.tooltipTimer);
    const stageRect=els.mapStage.getBoundingClientRect();
    let x,y;
    if (event?.clientX != null) { x=event.clientX-stageRect.left; y=event.clientY-stageRect.top; }
    else {
      const rect=region.getBoundingClientRect();
      x=rect.left+rect.width/2-stageRect.left; y=rect.top-stageRect.top;
    }
    x=Math.max(55,Math.min(stageRect.width-55,x));
    y=Math.max(42,Math.min(stageRect.height-10,y));
    els.mapTooltip.textContent=name;
    els.mapTooltip.style.left=`${x}px`; els.mapTooltip.style.top=`${y}px`;
    els.mapTooltip.classList.add('show');
  }

  function hideTooltip(delay=0) {
    clearTimeout(state.tooltipTimer);
    state.tooltipTimer=setTimeout(() => els.mapTooltip.classList.remove('show'),delay);
  }

  function bindRegion(region,name) {
    region.addEventListener('pointerenter',event => showTooltip(name,event,region));
    region.addEventListener('pointermove',event => showTooltip(name,event,region));
    region.addEventListener('pointerleave',() => hideTooltip());
    region.addEventListener('focus',() => showTooltip(name,null,region));
    region.addEventListener('blur',() => hideTooltip());
    region.addEventListener('touchstart',event => { const touch=event.touches?.[0]; showTooltip(name,touch || null,region); hideTooltip(1400); },{passive:true});
  }

  function renderGeo(payload,level) {
    state.currentGeo={payload,level};
    const geojson=payload?.geojson || {type:'FeatureCollection',features:[]};
    const features=geojson.features || [];
    if (!features.length) { els.map.innerHTML='<div class="empty-state">Não há geometria disponível para este recorte.</div>'; return; }
    const width=900,height=650,project=projector(geoBounds(geojson),width,height,level==='states'?40:25),selected=String(selectedCode(level)||'');
    const paths=features.map(feature => {
      const props=feature.properties || {},code=String(props.code || ''),name=String(props.name || code || 'Área');
      const selectedClass=selected && selected===code ? ' selected' : '';
      return `<path tabindex="0" role="button" class="geo-region${selectedClass}" data-code="${escapeHtml(code)}" data-name="${escapeHtml(name)}" d="${geometryPath(feature.geometry,project)}" aria-label="${escapeHtml(name)}"></path>`;
    }).join('');
    els.map.innerHTML=`<svg class="vector-map" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet" aria-label="Mapa ilustrado"><g>${paths}</g></svg>`;
    els.map.querySelectorAll('.geo-region').forEach(region => {
      const feature=features.find(item => String(item.properties?.code || '')===String(region.dataset.code));
      if (!feature) return;
      const props=feature.properties || {},name=String(props.name || region.dataset.name || 'Área');
      bindRegion(region,name);
      const activate=() => {
        if (level==='states') selectState({code:props.code,name:props.name,abbr:props.abbr});
        else if (level==='municipalities') selectMunicipality({code:props.code,name:props.name});
        else if (level==='districts') selectDistrict({code:props.code,name:props.name});
      };
      region.addEventListener('click',activate);
      region.addEventListener('keydown',event => { if (event.key==='Enter'||event.key===' ') { event.preventDefault(); activate(); } });
    });
  }

  function renderDistrictFallback() {
    els.map.innerHTML=`<div class="empty-state"><div><strong>${escapeHtml(state.selectedMunicipality?.name || '')}</strong><br>Malha distrital indisponível neste momento. Use a lista de distritos ao lado.</div></div>`;
  }

  async function loadStates() {
    state.level='br'; state.selectedState=null; state.selectedMunicipality=null; state.selectedDistrict=null;
    els.mapTitle.textContent='Brasil'; els.mapSubtitle.textContent='Passe o cursor ou toque sobre um estado para identificá-lo';
    els.map.innerHTML='<div class="loading">Carregando Brasil...</div>';
    try { const payload=await api('/api/geo?level=states'); state.states=payload.items || []; renderGeo(payload,'states'); }
    catch(error){ els.map.innerHTML=`<div class="error-state">${escapeHtml(error.message)}</div>`; }
  }

  async function loadMunicipalities() {
    const uf=state.selectedState;
    els.mapTitle.textContent=uf.name; els.mapSubtitle.textContent='Passe o cursor sobre um município; toque para abrir os distritos';
    els.map.innerHTML='<div class="loading">Carregando municípios...</div>';
    const payload=await api(`/api/geo?level=municipalities&state=${encodeURIComponent(uf.code)}`);
    state.municipalities=payload.items || [];
    els.citySelect.disabled=false;
    els.citySelect.innerHTML='<option value="">Selecione um município</option>'+state.municipalities.map(city=>`<option value="${escapeHtml(city.code)}">${escapeHtml(city.name)}</option>`).join('');
    els.cityHelp.textContent=`${fmt(state.municipalities.length)} municípios disponíveis.`;
    renderGeo(payload,'municipalities');
  }

  async function loadDistricts() {
    const city=state.selectedMunicipality;
    els.mapTitle.textContent=city.name; els.mapSubtitle.textContent='Município subdividido por distritos oficiais do IBGE';
    els.map.innerHTML='<div class="loading">Abrindo distritos...</div>';
    els.districtList.innerHTML='<div class="loading">Carregando distritos...</div>';
    try {
      const payload=await api(`/api/geo?level=districts&municipality=${encodeURIComponent(city.code)}&uf=${encodeURIComponent(state.selectedState.abbr)}`);
      state.districts=payload.items || [];
      renderDistrictChoices();
      if (payload.geometryAvailable && payload.geojson?.features?.length) renderGeo(payload,'districts'); else renderDistrictFallback();
    } catch(error) {
      els.districtList.innerHTML=`<div class="error-state">${escapeHtml(error.message)}</div>`; renderDistrictFallback();
    }
  }

  function renderDistrictChoices() {
    els.districtList.innerHTML=state.districts.length ? state.districts.map(district=>`<button class="district-choice ${String(state.selectedDistrict?.code||'')===String(district.code)?'active':''}" type="button" data-district="${escapeHtml(district.code)}">${escapeHtml(district.name)}</button>`).join('') : '<div class="empty-state">Sem distritos cadastrados.</div>';
    els.districtList.querySelectorAll('[data-district]').forEach(button=>button.addEventListener('click',()=>{
      const item=state.districts.find(d=>String(d.code)===String(button.dataset.district)); if(item) selectDistrict(item);
    }));
  }

  async function selectState(item) {
    state.selectedState={code:String(item.code),name:item.name||item.abbr,abbr:String(item.abbr||'').toUpperCase()};
    state.selectedMunicipality=null; state.selectedDistrict=null; state.level='state'; state.municipalities=[]; state.districts=[];
    els.zoneList.innerHTML='<div class="empty-state">Selecione um município para abrir zonas e seções.</div>'; els.districtList.innerHTML='';
    updateTitles(); setTab('candidates');
    await Promise.allSettled([loadMunicipalities(),loadResult()]);
  }

  async function selectMunicipality(item) {
    state.selectedMunicipality={code:String(item.code),name:item.name||String(item.code)}; state.selectedDistrict=null; state.level='municipality';
    els.citySelect.value=state.selectedMunicipality.code; updateTitles();
    const result=await loadResult();
    await Promise.allSettled([loadDistricts(),loadZones(result?.municipalityCode)]);
  }

  function selectDistrict(item) {
    state.selectedDistrict={code:String(item.code),name:item.name||String(item.code)}; state.level='district'; updateTitles(); renderDistrictChoices();
    if (state.currentGeo?.level==='districts') renderGeo(state.currentGeo.payload,'districts');
    renderResult(state.lastResult);
  }

  function buildResultQuery() {
    const params=new URLSearchParams({action:'result',office:state.office});
    if (state.selectedState) params.set('uf',state.selectedState.abbr.toLowerCase());
    if (state.selectedMunicipality) { params.set('municipalityName',state.selectedMunicipality.name); params.set('municipalityCode',state.selectedMunicipality.code); }
    return params;
  }

  async function loadResult() {
    updateTitles();
    if (state.office!=='presidente' && !state.selectedState) {
      state.lastResult=null; els.resultSummary.innerHTML='<div class="empty-state">Selecione um estado para visualizar este cargo.</div>'; els.candidateList.innerHTML='<div class="empty-state">Aguardando uma UF.</div>'; return null;
    }
    els.resultSummary.innerHTML='<div class="loading">Consultando a totalização oficial...</div>'; els.candidateList.innerHTML='<div class="loading">Carregando candidatos...</div>';
    try { const result=await api(`/api/results?${buildResultQuery().toString()}`); state.lastResult=result; renderResult(result); setSourceStatus('Fonte oficial conectada',true); return result; }
    catch(error){ setSourceStatus('Fonte temporariamente indisponível',false); els.resultSummary.innerHTML=`<div class="error-state">${escapeHtml(error.message)}</div>`; els.candidateList.innerHTML='<div class="empty-state">Sem dados neste momento.</div>'; return null; }
  }

  function initials(name) { return String(name||'?').split(/\s+/).filter(Boolean).slice(0,2).map(w=>w[0]).join('').toUpperCase(); }

  function renderResult(result) {
    if (!result) return;
    const sections=result.sections||{}, electorate=result.electorate||{}, votes=result.votes||{};
    const total=Math.max(0,Number(sections.total||0)), totalized=Math.max(0,Number(sections.totalized||0)), remaining=Math.max(0,total-totalized);
    const progress=Math.max(0,Math.min(100,Number(sections.percentage || (total ? totalized/total*100 : 0))));
    const districtNote=state.selectedDistrict ? `<div class="district-scope-note"><strong>${escapeHtml(state.selectedDistrict.name)}</strong>: o mapa já está filtrado por distrito. A soma exata de votos distritais será exibida somente após a associação oficial de seções/locais de votação ao distrito; até lá os números abaixo permanecem do município.</div>` : '';
    els.resultSummary.innerHTML=`<div class="totalization">
      ${districtNote}
      <div class="total-head"><div class="total-main"><small>Seções totalizadas</small><strong>${pct(progress)}</strong></div><div class="total-state"><b>${result.final?'ENCERRADA':'EM ANDAMENTO'}</b><span>TSE ${escapeHtml(result.generatedTime||'')}</span></div></div>
      <div class="section-counters"><div class="section-counter done"><span>APURADAS</span><strong>${fmt(totalized)}</strong><small>de ${fmt(total)} seções</small></div><div class="section-counter pending"><span>FALTAM APURAR</span><strong>${fmt(remaining)}</strong><small>${pct(100-progress)} restantes</small></div></div>
      <div class="total-progress"><i style="width:${progress}%"></i></div>
      <div class="summary-metrics"><div class="summary-metric"><span>Comparecimento</span><b>${fmt(electorate.turnout)}</b></div><div class="summary-metric"><span>Abstenções</span><b>${fmt(electorate.abstentions)}</b></div><div class="summary-metric"><span>Válidos</span><b>${fmt(votes.valid)}</b></div><div class="summary-metric"><span>Brancos + nulos</span><b>${fmt((votes.blank||0)+(votes.null||0))}</b></div></div>
    </div>`;

    const candidates=result.candidates||[],limit=state.office.startsWith('deputado')?80:20;
    els.candidateList.innerHTML=candidates.length ? candidates.slice(0,limit).map((candidate,index)=>{
      const color=partyColor(candidate.party),width=Math.max(0,Math.min(100,Number(candidate.percentage||0))),name=candidate.ballotName||candidate.name||'Candidato';
      const photo=candidate.photoUrl ? `<img src="${escapeHtml(candidate.photoUrl)}" alt="Foto de ${escapeHtml(name)}" loading="lazy" onload="this.parentElement.classList.add('photo-loaded')" onerror="this.remove()">` : '';
      return `<article class="candidate-card" style="animation-delay:${Math.min(index*35,280)}ms"><div class="candidate-avatar">${photo}<span class="avatar-fallback">${escapeHtml(initials(name))}</span></div><div class="candidate-main"><div class="candidate-name">${escapeHtml(name)}</div><div class="candidate-subline"><span class="party-chip" style="background:${color}">${escapeHtml(candidate.party||'—')}</span><span class="candidate-number">Nº ${escapeHtml(candidate.number||'—')}</span></div><div class="candidate-bar"><i style="width:${width}%;background:${color}"></i><span>${fmt(candidate.votes)} votos</span></div></div><div class="candidate-score"><strong>${pct(candidate.percentage)}</strong><small>${fmt(candidate.votes)} votos</small>${candidate.status?`<span class="candidate-status">${escapeHtml(candidate.status)}</span>`:''}</div></article>`;
    }).join('') : '<div class="empty-state">Ainda não há votos computados para este recorte.</div>';
  }

  async function loadZones(municipalityCode) {
    if (!state.selectedState || !municipalityCode) { els.zoneList.innerHTML='<div class="empty-state">Zonas ainda não disponíveis.</div>'; return; }
    els.zoneList.innerHTML='<div class="loading">Carregando zonas e seções...</div>';
    try {
      const params=new URLSearchParams({action:'zones',uf:state.selectedState.abbr.toLowerCase(),municipalityCode:String(municipalityCode)}),payload=await api(`/api/results?${params}`),zones=payload.zones||[];
      els.zoneList.innerHTML=zones.length ? `<div class="zone-grid">${zones.map(zone=>`<article class="zone-card"><div class="zone-card-head"><h4>Zona ${escapeHtml(zone.code)}</h4><small>${fmt(zone.sections.length)} seções</small></div><div class="section-pills">${zone.sections.map(section=>`<span class="section-pill">${escapeHtml(section.number)}</span>`).join('')}</div></article>`).join('')}</div>` : '<div class="empty-state">Nenhuma zona encontrada.</div>';
    } catch(error){ els.zoneList.innerHTML=`<div class="error-state">${escapeHtml(error.message)}</div>`; }
  }

  function setTab(tab) {
    document.querySelectorAll('.detail-tab').forEach(button=>button.classList.toggle('active',button.dataset.tab===tab));
    document.querySelectorAll('.detail-panel').forEach(panel=>panel.classList.toggle('active',panel.dataset.panel===tab));
  }

  async function goTo(target) {
    if (target==='br') {
      state.selectedState=null; state.selectedMunicipality=null; state.selectedDistrict=null; state.municipalities=[]; state.districts=[]; state.level='br';
      els.citySelect.disabled=true; els.citySelect.innerHTML='<option>Selecione primeiro um estado</option>'; els.cityHelp.textContent='Toque em um estado no mapa.'; els.districtList.innerHTML=''; els.zoneList.innerHTML='<div class="empty-state">Selecione um município para carregar zonas e seções.</div>';
      updateTitles(); await Promise.allSettled([loadStates(),loadResult()]); return;
    }
    if (target==='state' && state.selectedState) {
      state.selectedMunicipality=null; state.selectedDistrict=null; state.districts=[]; state.level='state'; els.districtList.innerHTML=''; els.zoneList.innerHTML='<div class="empty-state">Selecione um município.</div>'; updateTitles(); await Promise.allSettled([loadMunicipalities(),loadResult()]); return;
    }
    if (target==='municipality' && state.selectedMunicipality) { state.selectedDistrict=null; state.level='municipality'; updateTitles(); await Promise.allSettled([loadDistricts(),loadResult()]); }
  }

  document.querySelectorAll('.office-btn[data-office]').forEach(button=>button.addEventListener('click',async()=>{
    document.querySelectorAll('.office-btn[data-office]').forEach(item=>item.classList.remove('active')); button.classList.add('active'); state.office=button.dataset.office; updateTitles(); await loadResult();
  }));
  document.querySelectorAll('.detail-tab').forEach(button=>button.addEventListener('click',()=>setTab(button.dataset.tab)));
  els.citySelect.addEventListener('change',()=>{ const city=state.municipalities.find(item=>String(item.code)===String(els.citySelect.value)); if(city) selectMunicipality(city); });
  els.refreshButton.addEventListener('click',()=>loadResult()); els.resetButton.addEventListener('click',()=>goTo('br'));
  els.backButton.addEventListener('click',()=>{ if(state.selectedDistrict)return goTo('municipality'); if(state.selectedMunicipality)return goTo('state'); if(state.selectedState)return goTo('br'); });

  function tickClock(){ els.clock.textContent=new Intl.DateTimeFormat('pt-BR',{hour:'2-digit',minute:'2-digit',second:'2-digit'}).format(new Date()); }
  tickClock(); setInterval(tickClock,1000); setInterval(()=>{ if(!document.hidden) loadResult(); },30000);
  updateTitles(); setTab('candidates'); Promise.allSettled([loadStates(),loadResult()]);
})();
