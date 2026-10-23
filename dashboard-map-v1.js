(() => {
  'use strict';

  // Integração do mapa enviado: ApuraBrasil Brazil Drilldown Map v1.1.0.
  // Mantém a UI eleitoral existente e substitui apenas o renderer geográfico visível.
  const BRAZIL_BOUNDS = { minLon:-74.5, maxLon:-28, minLat:-34.5, maxLat:6 };
  const CANVAS = { width:1000, height:870 };
  const PALETTE = ['#ef233c','#f02b3b','#e11d48','#df8e97','#e49aa3','#2463eb','#2f6df2','#477de8','#7fa3e6','#8bb0ea'];
  const SHPJS_URL = 'https://unpkg.com/shpjs@6.2.0/dist/shp.min.js';
  const NEIGHBORHOOD_ZIP = 'https://geoftp.ibge.gov.br/organizacao_do_territorio/malhas_territoriais/malhas_de_setores_censitarios__divisoes_intramunicipais/censo_2022/bairros/shp/UF/{UF}_bairros_CD2022.zip';
  const neighborhoodCache = new Map();
  const clamp = (v,min,max) => Math.max(min,Math.min(max,v));
  const digits = (v) => String(v ?? '').replace(/\D/g,'');
  const norm = (v) => String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();

  const legacyMap = document.getElementById('map');
  const stage = document.getElementById('mapStage');
  const tooltip = document.getElementById('mapTooltip');
  const mapTitle = document.getElementById('mapTitle');
  const mapSubtitle = document.getElementById('mapSubtitle');
  const mapHint = document.getElementById('mapHint');
  const selectionStatus = document.getElementById('selectionStatus');
  const scopeTitle = document.getElementById('scopeTitle');
  const backButton = document.getElementById('backButton');
  const resetButton = document.getElementById('resetButton');
  const citySelect = document.getElementById('citySelect');
  const breadcrumb = document.getElementById('breadcrumb');

  if (!legacyMap || !stage) return;

  function injectStyles() {
    if (document.getElementById('abDrilldownMapStyles')) return;
    const style = document.createElement('style');
    style.id = 'abDrilldownMapStyles';
    style.textContent = `
      #map{display:none!important}
      .ab-drilldown-host{position:relative;width:100%;min-height:540px;background:#f4f4f2;overflow:hidden;border-radius:2px}
      .ab-drilldown-host svg{display:block;width:100%;height:540px;user-select:none;touch-action:manipulation}
      .ab-drilldown-region{vector-effect:non-scaling-stroke;stroke:#fff;stroke-width:1.35;stroke-linejoin:round;cursor:pointer;transition:fill .16s ease,opacity .16s ease,filter .16s ease,stroke-width .16s ease}
      .ab-drilldown-region:hover{filter:brightness(.96)}
      .ab-drilldown-region.is-dimmed{opacity:.34}
      .ab-drilldown-region.is-selected{stroke:#0f172a;stroke-width:2.2}
      .ab-map-level{position:absolute;top:10px;right:10px;z-index:3;border-radius:999px;background:rgba(38,62,71,.88);padding:5px 9px;color:#fff;font-size:9px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;backdrop-filter:blur(7px)}
      .ab-map-loading{position:absolute;inset:0;z-index:4;display:none;align-items:center;justify-content:center;background:rgba(244,244,242,.78);color:#475569;font-size:12px;backdrop-filter:blur(2px)}
      .ab-map-loading.show{display:flex}
      .ab-map-notice{position:absolute;left:50%;bottom:14px;z-index:5;width:min(540px,calc(100% - 28px));transform:translateX(-50%);border:1px solid #dbe1e8;border-radius:9px;background:rgba(255,255,255,.97);padding:9px 11px;color:#475569;box-shadow:0 6px 22px rgba(15,23,42,.08);font-size:10px;line-height:1.4;text-align:center;display:none}
      .ab-map-notice.show{display:block}
      @media(max-width:720px){.ab-drilldown-host{min-height:470px}.ab-drilldown-host svg{height:470px}}
    `;
    document.head.appendChild(style);
  }

  injectStyles();
  legacyMap.setAttribute('aria-hidden','true');

  const host = document.createElement('div');
  host.className = 'ab-drilldown-host';
  host.innerHTML = `
    <svg viewBox="0 0 ${CANVAS.width} ${CANVAS.height}" preserveAspectRatio="xMidYMid meet" aria-label="Mapa interativo do Brasil"></svg>
    <div class="ab-map-level">Estados</div>
    <div class="ab-map-loading">Carregando mapa...</div>
    <div class="ab-map-notice"></div>`;
  stage.insertBefore(host, legacyMap.nextSibling);

  const svg = host.querySelector('svg');
  const levelBadge = host.querySelector('.ab-map-level');
  const loading = host.querySelector('.ab-map-loading');
  const notice = host.querySelector('.ab-map-notice');

  let level = 'states';
  let history = [];
  let features = [];
  let hoveredCode = null;
  let selectedCode = null;
  let viewBox = [0,0,CANVAS.width,CANVAS.height];
  let viewAnimation = null;
  let noticeTimer = null;
  let internalSync = false;

  function api(url) {
    return fetch(url,{headers:{Accept:'application/json'}}).then(async response => {
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.ok === false) throw new Error(payload.detail || payload.error || `HTTP ${response.status}`);
      return payload;
    });
  }

  function project([lon,lat]) {
    return [
      ((lon-BRAZIL_BOUNDS.minLon)/(BRAZIL_BOUNDS.maxLon-BRAZIL_BOUNDS.minLon))*CANVAS.width,
      ((BRAZIL_BOUNDS.maxLat-lat)/(BRAZIL_BOUNDS.maxLat-BRAZIL_BOUNDS.minLat))*CANVAS.height
    ];
  }

  function ringToPath(ring) {
    if (!ring?.length) return '';
    return ring.map((coord,i) => {
      const [x,y] = project(coord);
      return `${i ? 'L':'M'}${x.toFixed(2)},${y.toFixed(2)}`;
    }).join(' ') + ' Z';
  }

  function geometryToPath(geometry) {
    if (!geometry) return '';
    if (geometry.type === 'Polygon') return geometry.coordinates.map(ringToPath).join(' ');
    if (geometry.type === 'MultiPolygon') return geometry.coordinates.flatMap(poly => poly.map(ringToPath)).join(' ');
    return '';
  }

  function walkCoords(coords, visitor) {
    if (!Array.isArray(coords)) return;
    if (coords.length >= 2 && typeof coords[0] === 'number' && typeof coords[1] === 'number') return visitor(coords);
    coords.forEach(child => walkCoords(child,visitor));
  }

  function geometryBounds(geometry) {
    let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
    walkCoords(geometry?.coordinates, coord => {
      const [x,y]=project(coord);
      minX=Math.min(minX,x); minY=Math.min(minY,y); maxX=Math.max(maxX,x); maxY=Math.max(maxY,y);
    });
    return Number.isFinite(minX) ? [minX,minY,maxX,maxY] : [0,0,CANVAS.width,CANVAS.height];
  }

  function mergeBounds(items) {
    let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
    for (const feature of items || []) {
      const [a,b,c,d]=geometryBounds(feature.geometry);
      minX=Math.min(minX,a); minY=Math.min(minY,b); maxX=Math.max(maxX,c); maxY=Math.max(maxY,d);
    }
    return Number.isFinite(minX) ? [minX,minY,maxX,maxY] : [0,0,CANVAS.width,CANVAS.height];
  }

  function paddedViewBox(bounds,padding=.08) {
    const [minX,minY,maxX,maxY]=bounds;
    const w=Math.max(1,maxX-minX), h=Math.max(1,maxY-minY);
    let x=minX-w*padding, y=minY-h*padding, width=w*(1+padding*2), height=h*(1+padding*2);
    const targetRatio=CANVAS.width/CANVAS.height, currentRatio=width/height;
    if (currentRatio>targetRatio) {
      const wanted=width/targetRatio; y-=(wanted-height)/2; height=wanted;
    } else {
      const wanted=height*targetRatio; x-=(wanted-width)/2; width=wanted;
    }
    return [x,y,width,height];
  }

  function ease(t) { return t<.5 ? 4*t*t*t : 1-Math.pow(-2*t+2,3)/2; }
  function applyViewBox() { svg.setAttribute('viewBox',viewBox.map(v=>Number(v).toFixed(2)).join(' ')); }
  function animateViewBox(target,duration=380) {
    cancelAnimationFrame(viewAnimation);
    const from=[...viewBox], start=performance.now();
    return new Promise(resolve => {
      const tick = now => {
        const p=clamp((now-start)/Math.max(1,duration),0,1),e=ease(p);
        viewBox=from.map((v,i)=>v+(target[i]-v)*e); applyViewBox();
        if (p<1) viewAnimation=requestAnimationFrame(tick); else { viewBox=[...target]; applyViewBox(); resolve(); }
      };
      viewAnimation=requestAnimationFrame(tick);
    });
  }

  function featureName(feature) {
    const p=feature?.properties || {};
    return String(p.name || p.nome || p.NM_BAIRRO || p.NM_MUN || p.NM_MUNICIP || p.NM_SUBDIST || 'Região');
  }

  function featureCode(feature, currentLevel=level) {
    const p=feature?.properties || {};
    if (currentLevel==='states') return String(p.code || p.CD_UF || p.cd_geocuf || p.sigla || feature.id || featureName(feature));
    if (currentLevel==='municipalities') return String(p.code || p.cd_geocmu || p.CD_MUN || p.CD_GEOCMU || feature.id || featureName(feature));
    return String(p.CD_BAIRRO || p.cd_bairro || p.CD_SUBDIST || p.CD_GEOCODI || p.code || feature.id || featureName(feature));
  }

  function deterministicColor(key) {
    let hash=0; const text=String(key);
    for (let i=0;i<text.length;i++) hash=((hash<<5)-hash+text.charCodeAt(i))|0;
    return PALETTE[Math.abs(hash)%PALETTE.length];
  }

  function showTip(event,feature) {
    if (!tooltip) return;
    const stageRect=stage.getBoundingClientRect();
    let x=event.clientX-stageRect.left,y=event.clientY-stageRect.top;
    x=Math.max(55,Math.min(stageRect.width-55,x)); y=Math.max(42,Math.min(stageRect.height-10,y));
    tooltip.textContent=featureName(feature); tooltip.style.left=`${x}px`; tooltip.style.top=`${y}px`; tooltip.classList.add('show');
  }
  function hideTip() { tooltip?.classList.remove('show'); }

  function paint() {
    const active=hoveredCode || selectedCode;
    svg.querySelectorAll('.ab-drilldown-region').forEach((path,index) => {
      const feature=features[index]; if (!feature) return;
      const code=featureCode(feature);
      path.setAttribute('fill',deterministicColor(code));
      path.classList.toggle('is-dimmed',Boolean(active && code!==active));
      path.classList.toggle('is-selected',code===selectedCode);
    });
  }

  function render(items) {
    features=items || [];
    hoveredCode=null; selectedCode=null; svg.replaceChildren();
    const fragment=document.createDocumentFragment();
    features.forEach(feature => {
      const pathData=geometryToPath(feature.geometry); if (!pathData) return;
      const code=featureCode(feature);
      const path=document.createElementNS('http://www.w3.org/2000/svg','path');
      path.setAttribute('d',pathData); path.setAttribute('class','ab-drilldown-region');
      path.dataset.code=code; path.dataset.name=featureName(feature); path.tabIndex=0; path.setAttribute('role','button');
      path.addEventListener('pointerenter',e=>{hoveredCode=code;paint();showTip(e,feature)});
      path.addEventListener('pointermove',e=>showTip(e,feature));
      path.addEventListener('pointerleave',()=>{hoveredCode=null;paint();hideTip()});
      path.addEventListener('click',()=>drill(feature));
      path.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();drill(feature)}});
      fragment.appendChild(path);
    });
    svg.appendChild(fragment); paint();
  }

  function setLoading(on) { loading.classList.toggle('show',Boolean(on)); }
  function showNotice(message) {
    clearTimeout(noticeTimer); notice.textContent=message; notice.classList.add('show');
    noticeTimer=setTimeout(()=>notice.classList.remove('show'),5200);
  }

  function levelLabel() { return level==='states'?'Estados':level==='municipalities'?'Cidades':'Bairros'; }
  function updateVisibleChrome() {
    levelBadge.textContent=levelLabel();
    mapHint && (mapHint.textContent=`Brasil → Estado → Cidade → Bairro • limites administrativos oficiais`);
    if (level==='states') {
      mapTitle && (mapTitle.textContent='Brasil');
      mapSubtitle && (mapSubtitle.textContent='Passe o cursor ou toque sobre um estado para identificá-lo');
    } else if (level==='municipalities') {
      const stateItem=history.find(x=>x.level==='states');
      if (stateItem) mapTitle && (mapTitle.textContent=stateItem.name);
      mapSubtitle && (mapSubtitle.textContent='Clique em uma cidade para abrir os bairros');
    } else {
      const city=history.find(x=>x.level==='municipalities');
      if (city) mapTitle && (mapTitle.textContent=city.name);
      mapSubtitle && (mapSubtitle.textContent='Bairros oficiais do Censo 2022 / IBGE');
    }
  }

  async function ensureShp() {
    if (globalThis.shp) return globalThis.shp;
    if (globalThis.__abDashboardShpPromise) return globalThis.__abDashboardShpPromise;
    globalThis.__abDashboardShpPromise=new Promise((resolve,reject)=>{
      const s=document.createElement('script'); s.src=SHPJS_URL; s.async=true;
      s.onload=()=>globalThis.shp?resolve(globalThis.shp):reject(new Error('Leitor de bairros não inicializou.'));
      s.onerror=()=>reject(new Error('Não foi possível carregar o leitor da malha de bairros.'));
      document.head.appendChild(s);
    });
    return globalThis.__abDashboardShpPromise;
  }

  function normalizeCollection(value) {
    if (Array.isArray(value)) return value.find(x=>x?.features) || null;
    return value?.features ? value : null;
  }

  async function loadNeighborhoods(cityItem,stateItem) {
    const uf=String(stateItem?.abbr || '').toUpperCase();
    const cityCode=digits(cityItem?.code);
    if (!uf || uf.length!==2 || !cityCode) throw new Error('Não foi possível identificar UF/cidade para carregar bairros.');
    let collection=neighborhoodCache.get(uf);
    if (!collection) {
      const shp=await ensureShp();
      const raw=await shp(NEIGHBORHOOD_ZIP.replaceAll('{UF}',uf));
      collection=normalizeCollection(raw);
      if (!collection) throw new Error(`A malha de bairros de ${uf} não pôde ser interpretada.`);
      neighborhoodCache.set(uf,collection);
    }
    const filtered=(collection.features || []).filter(feature => {
      const p=feature.properties || {};
      return digits(p.CD_MUN || p.cd_mun || p.CD_GEOCMU)===cityCode;
    });
    if (!filtered.length) throw new Error(`${cityItem.name} não possui bairros oficiais representados na malha do IBGE.`);
    return filtered;
  }

  async function loadLevel(nextLevel,parent,{reset=false}={}) {
    setLoading(true);
    try {
      let nextFeatures=[];
      if (nextLevel==='states') {
        const payload=await api('/api/geo?level=states'); nextFeatures=payload.geojson?.features || [];
      } else if (nextLevel==='municipalities') {
        const stateItem=parent || history.find(x=>x.level==='states');
        const payload=await api(`/api/geo?level=municipalities&state=${encodeURIComponent(stateItem.code)}`);
        nextFeatures=payload.geojson?.features || [];
      } else {
        const stateItem=history.find(x=>x.level==='states');
        const cityItem=parent || history.find(x=>x.level==='municipalities');
        nextFeatures=await loadNeighborhoods(cityItem,stateItem);
      }
      if (!nextFeatures.length) throw new Error('Não há geometria disponível para este recorte.');
      level=nextLevel; render(nextFeatures);
      const target=paddedViewBox(mergeBounds(nextFeatures),reset?.06:.08);
      if (reset) { viewBox=target; applyViewBox(); } else await animateViewBox(target);
      updateVisibleChrome();
      return true;
    } finally { setLoading(false); }
  }

  function findLegacyRegion(name) {
    const target=norm(name);
    return [...legacyMap.querySelectorAll('.geo-region')].find(path=>norm(path.dataset.name)===target) || null;
  }

  function waitFor(test,timeout=5500) {
    return new Promise(resolve => {
      const start=performance.now();
      const tick=()=>{
        if (test()) return resolve(true);
        if (performance.now()-start>timeout) return resolve(false);
        setTimeout(tick,60);
      };
      tick();
    });
  }

  async function syncLegacyForward(feature) {
    const name=featureName(feature), path=findLegacyRegion(name);
    if (!path) return false;
    internalSync=true;
    path.click();
    if (level==='states') await waitFor(()=>legacyMap.querySelectorAll('.geo-region').length>30 && norm(mapTitle?.textContent)===norm(name));
    else if (level==='municipalities') await waitFor(()=>norm(scopeTitle?.textContent)===norm(name));
    internalSync=false;
    return true;
  }

  async function drill(feature) {
    const code=featureCode(feature),name=featureName(feature);
    selectedCode=code; paint();
    if (level==='neighborhoods') {
      selectionStatus && (selectionStatus.textContent=`${name} • bairro selecionado • resultados do município`);
      return;
    }

    const previousFeatures=features,previousLevel=level,previousView=[...viewBox];
    const ok=await syncLegacyForward(feature);
    if (!ok) showNotice('A área foi aberta no mapa, mas a seleção eleitoral não pôde ser sincronizada automaticamente.');
    await animateViewBox(paddedViewBox(geometryBounds(feature.geometry),.10));

    const item={level,code,name,feature,abbr:String(feature.properties?.abbr || feature.properties?.sigla || '').toUpperCase()};
    history.push(item);
    const next=previousLevel==='states'?'municipalities':'neighborhoods';
    try {
      const success=await loadLevel(next,item);
      if (!success) throw new Error('Falha ao abrir o próximo nível.');
    } catch(error) {
      history.pop(); level=previousLevel; features=previousFeatures; render(features); viewBox=previousView; applyViewBox(); updateVisibleChrome();
      showNotice(error.message || 'Não foi possível abrir o próximo nível.');
    }
  }

  async function goBackVisible() {
    if (!history.length) return;
    history.pop();
    const target=history.length ? (history[history.length-1].level==='states'?'municipalities':'neighborhoods') : 'states';
    const parent=history.length ? history[history.length-1] : null;
    try { await loadLevel(target,parent); } catch(error) { showNotice(error.message); }
  }

  async function resetVisible() {
    history=[]; selectedCode=null; hoveredCode=null;
    try { await loadLevel('states',null,{reset:true}); } catch(error) { showNotice(error.message); }
  }

  svg.addEventListener('click',event=>{
    if (event.target===svg && level!=='states') resetButton?.click();
  });

  backButton?.addEventListener('click',()=>{ if (!internalSync) setTimeout(goBackVisible,0); });
  resetButton?.addEventListener('click',()=>{ if (!internalSync) setTimeout(resetVisible,0); });

  citySelect?.addEventListener('change',()=>{
    if (internalSync || level!=='municipalities' || !citySelect.value) return;
    setTimeout(()=>{
      const option=citySelect.options[citySelect.selectedIndex];
      const feature=features.find(f=>norm(featureName(f))===norm(option?.textContent));
      if (feature) drill(feature);
    },0);
  });

  breadcrumb?.addEventListener('click',event=>{
    const button=event.target.closest('[data-crumb]'); if (!button || internalSync) return;
    const target=button.dataset.crumb;
    setTimeout(()=>{
      if (target==='br') resetVisible();
      else if (target==='state' && level==='neighborhoods') goBackVisible();
    },0);
  });

  resetVisible();
})();
