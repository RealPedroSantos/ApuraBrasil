(() => {
  'use strict';

  // Integração do mapa enviado: ApuraBrasil Brazil Drilldown Map v1.2.0.
  // Preserva toda a UI/apuração existente e troca somente o renderer geográfico visível.
  // Hierarquia: Brasil -> Estado -> Cidade -> Bairro TSE.
  const BRAZIL_BOUNDS = { minLon:-74.5, maxLon:-28, minLat:-34.5, maxLat:6 };
  const CANVAS = { width:1000, height:870 };
  const PALETTE = ['#ef233c','#f02b3b','#e11d48','#df8e97','#e49aa3','#2463eb','#2f6df2','#477de8','#7fa3e6','#8bb0ea'];
  const D3_DELAUNAY_URL = 'https://cdn.jsdelivr.net/npm/d3-delaunay@6/dist/d3-delaunay.min.js';
  const clamp = (v,min,max) => Math.max(min,Math.min(max,v));
  const digits = v => String(v ?? '').replace(/\D/g,'');
  const norm = v => String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

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
      .ab-drilldown-host{position:relative;width:100%;height:100%;min-height:0;background:#e8e8e5;overflow:hidden;border-radius:8px}
      .ab-drilldown-host svg{display:block;width:100%;height:100%;min-height:0;user-select:none;touch-action:manipulation}
      .ab-drilldown-region{vector-effect:non-scaling-stroke;stroke:#fff;stroke-width:1.35;stroke-linejoin:round;cursor:pointer;transition:fill .16s ease,opacity .16s ease,filter .16s ease,stroke-width .16s ease}
      .ab-drilldown-region:hover{filter:brightness(.96)}
      .ab-drilldown-region.is-dimmed{opacity:.34}
      .ab-drilldown-region.is-selected{stroke:#0f172a;stroke-width:2.2}
      .ab-neighborhood-label{pointer-events:none;fill:#111827;font-weight:800;text-anchor:middle;dominant-baseline:middle;paint-order:stroke fill;stroke:rgba(255,255,255,.96);stroke-width:3px;stroke-linejoin:round;letter-spacing:.01em}
      .ab-neighborhood-label.is-dimmed{opacity:.32}
      .ab-map-level{position:absolute;top:10px;right:10px;z-index:3;border-radius:999px;background:rgba(38,62,71,.88);padding:5px 9px;color:#fff;font-size:9px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;backdrop-filter:blur(7px)}
      .ab-map-loading{position:absolute;inset:0;z-index:7;display:none;align-items:center;justify-content:center;background:rgba(244,244,242,.78);color:#475569;font-size:12px;backdrop-filter:blur(2px)}
      .ab-map-loading.show{display:flex}
      .ab-map-notice{position:absolute;left:50%;bottom:14px;z-index:6;width:min(620px,calc(100% - 28px));transform:translateX(-50%);border:1px solid #dbe1e8;border-radius:9px;background:rgba(255,255,255,.97);padding:9px 11px;color:#475569;box-shadow:0 6px 22px rgba(15,23,42,.08);font-size:10px;line-height:1.4;text-align:center;display:none}
      .ab-map-notice.show{display:block}
      @media(max-width:720px){.ab-map-notice{font-size:9px;bottom:8px}}
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
  let currentBoundaryFeature = null;
  let currentSource = null;

  async function api(url) {
    const response = await fetch(url,{headers:{Accept:'application/json'}});
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.ok === false) throw new Error(payload.detail || payload.error || `HTTP ${response.status}`);
    return payload;
  }

  function project([lon,lat]) {
    return [
      ((lon-BRAZIL_BOUNDS.minLon)/(BRAZIL_BOUNDS.maxLon-BRAZIL_BOUNDS.minLon))*CANVAS.width,
      ((BRAZIL_BOUNDS.maxLat-lat)/(BRAZIL_BOUNDS.maxLat-BRAZIL_BOUNDS.minLat))*CANVAS.height
    ];
  }

  function unproject([x,y]) {
    return [
      BRAZIL_BOUNDS.minLon + (x/CANVAS.width)*(BRAZIL_BOUNDS.maxLon-BRAZIL_BOUNDS.minLon),
      BRAZIL_BOUNDS.maxLat - (y/CANVAS.height)*(BRAZIL_BOUNDS.maxLat-BRAZIL_BOUNDS.minLat)
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

  function walkCoords(coords,visitor) {
    if (!Array.isArray(coords)) return;
    if (coords.length >= 2 && typeof coords[0] === 'number' && typeof coords[1] === 'number') return visitor(coords);
    coords.forEach(child => walkCoords(child,visitor));
  }

  function geometryBounds(geometry) {
    let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
    walkCoords(geometry?.coordinates,coord => {
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

  function projectedRingCentroid(ring) {
    if (!Array.isArray(ring) || ring.length < 3) return null;
    const points=ring.map(project); let twiceArea=0,cx=0,cy=0;
    for(let i=0;i<points.length;i++){
      const [x1,y1]=points[i], [x2,y2]=points[(i+1)%points.length], cross=x1*y2-x2*y1;
      twiceArea+=cross; cx+=(x1+x2)*cross; cy+=(y1+y2)*cross;
    }
    if(Math.abs(twiceArea)<.000001){
      const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);
      return{x:(Math.min(...xs)+Math.max(...xs))/2,y:(Math.min(...ys)+Math.max(...ys))/2,area:0};
    }
    return{x:cx/(3*twiceArea),y:cy/(3*twiceArea),area:Math.abs(twiceArea/2)};
  }

  function geometryLabelPoint(geometry) {
    let rings=[];
    if(geometry?.type==='Polygon'&&geometry.coordinates?.[0])rings=[geometry.coordinates[0]];
    else if(geometry?.type==='MultiPolygon')rings=(geometry.coordinates||[]).map(poly=>poly?.[0]).filter(Boolean);
    const candidates=rings.map(projectedRingCentroid).filter(Boolean).sort((a,b)=>b.area-a.area);
    if(candidates.length)return candidates[0];
    const [a,b,c,d]=geometryBounds(geometry);
    return{x:(a+c)/2,y:(b+d)/2,area:Math.max(0,(c-a)*(d-b))};
  }

  function paddedViewBox(bounds,padding=.08) {
    const [minX,minY,maxX,maxY]=bounds;
    const w=Math.max(1,maxX-minX),h=Math.max(1,maxY-minY);
    let x=minX-w*padding,y=minY-h*padding,width=w*(1+padding*2),height=h*(1+padding*2);
    const targetRatio=CANVAS.width/CANVAS.height,currentRatio=width/height;
    if(currentRatio>targetRatio){const wanted=width/targetRatio;y-=(wanted-height)/2;height=wanted;}
    else{const wanted=height*targetRatio;x-=(wanted-width)/2;width=wanted;}
    return[x,y,width,height];
  }

  function ease(t){return t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;}
  function applyViewBox(){svg.setAttribute('viewBox',viewBox.map(v=>Number(v).toFixed(2)).join(' '));}
  function animateViewBox(target,duration=380){
    cancelAnimationFrame(viewAnimation);
    const from=[...viewBox],start=performance.now();
    return new Promise(resolve=>{
      const tick=now=>{
        const p=clamp((now-start)/Math.max(1,duration),0,1),e=ease(p);
        viewBox=from.map((v,i)=>v+(target[i]-v)*e);applyViewBox();
        if(p<1)viewAnimation=requestAnimationFrame(tick);else{viewBox=[...target];applyViewBox();resolve();}
      };
      viewAnimation=requestAnimationFrame(tick);
    });
  }

  function featureName(feature){
    const p=feature?.properties||{};
    return String(p.name||p.nome||p.NM_BAIRRO||p.NM_MUN||p.NM_MUNICIPIO||p.NM_SUBDIST||'Região');
  }

  function featureCode(feature,currentLevel=level){
    const p=feature?.properties||{};
    if(currentLevel==='states')return String(p.code||p.CD_UF||p.cd_geocuf||p.sigla||feature.id||featureName(feature));
    if(currentLevel==='municipalities')return String(p.code||p.cd_geocmu||p.CD_MUN||p.CD_GEOCMU||feature.id||featureName(feature));
    return String(p.TSE_BAIRRO_ID||p.CD_BAIRRO||p.cd_bairro||p.CD_SUBDIST||p.CD_GEOCODI||p.code||feature.id||featureName(feature));
  }

  function deterministicColor(key){
    let hash=0;const text=String(key);
    for(let i=0;i<text.length;i++)hash=((hash<<5)-hash+text.charCodeAt(i))|0;
    return PALETTE[Math.abs(hash)%PALETTE.length];
  }

  function showTip(event,feature){
    if(!tooltip)return;
    const stageRect=stage.getBoundingClientRect();
    let x=event.clientX-stageRect.left,y=event.clientY-stageRect.top;
    x=Math.max(55,Math.min(stageRect.width-55,x));y=Math.max(42,Math.min(stageRect.height-10,y));
    const p=feature?.properties||{};
    if(level==='neighborhoods'&&p.FONTE==='TSE'){
      tooltip.innerHTML=`<strong>${escapeHtml(featureName(feature))}</strong><br><small>TSE · ${Number(p.QTD_LOCAIS||0)} locais · ${Number(p.QTD_SECOES||0)} seções</small>`;
    }else tooltip.textContent=featureName(feature);
    tooltip.style.left=`${x}px`;tooltip.style.top=`${y}px`;tooltip.classList.add('show');
  }
  function hideTip(){tooltip?.classList.remove('show');}

  function paint(){
    const active=hoveredCode||selectedCode;
    svg.querySelectorAll('.ab-drilldown-region').forEach((path,index)=>{
      const feature=features[index];if(!feature)return;
      const code=featureCode(feature);
      path.setAttribute('fill',deterministicColor(code));
      path.classList.toggle('is-dimmed',Boolean(active&&code!==active));
      path.classList.toggle('is-selected',code===selectedCode);
    });
    svg.querySelectorAll('.ab-neighborhood-label').forEach(label=>label.classList.toggle('is-dimmed',Boolean(active&&label.dataset.code!==active)));
  }

  function render(items){
    features=items||[];hoveredCode=null;selectedCode=null;svg.replaceChildren();
    let clipId=null;
    if(level==='neighborhoods'&&currentBoundaryFeature?.geometry){
      clipId=`ab-city-clip-${Math.random().toString(36).slice(2)}`;
      const defs=document.createElementNS('http://www.w3.org/2000/svg','defs');
      const clip=document.createElementNS('http://www.w3.org/2000/svg','clipPath');clip.id=clipId;
      const shape=document.createElementNS('http://www.w3.org/2000/svg','path');shape.setAttribute('d',geometryToPath(currentBoundaryFeature.geometry));
      clip.appendChild(shape);defs.appendChild(clip);svg.appendChild(defs);
      const bg=document.createElementNS('http://www.w3.org/2000/svg','path');bg.setAttribute('d',geometryToPath(currentBoundaryFeature.geometry));bg.setAttribute('fill','#f8fafc');bg.setAttribute('stroke','#334155');bg.setAttribute('stroke-width','2');bg.setAttribute('vector-effect','non-scaling-stroke');bg.setAttribute('pointer-events','none');svg.appendChild(bg);
    }

    const fragment=document.createDocumentFragment();
    features.forEach(feature=>{
      const pathData=geometryToPath(feature.geometry);if(!pathData)return;
      const code=featureCode(feature),path=document.createElementNS('http://www.w3.org/2000/svg','path');
      path.setAttribute('d',pathData);path.setAttribute('class','ab-drilldown-region');path.dataset.code=code;path.dataset.name=featureName(feature);path.tabIndex=0;path.setAttribute('role','button');
      if(clipId)path.setAttribute('clip-path',`url(#${clipId})`);
      path.addEventListener('pointerenter',e=>{hoveredCode=code;paint();showTip(e,feature);});
      path.addEventListener('pointermove',e=>showTip(e,feature));
      path.addEventListener('pointerleave',()=>{hoveredCode=null;paint();hideTip();});
      path.addEventListener('click',()=>drill(feature));
      path.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();drill(feature);}});
      fragment.appendChild(path);
    });
    svg.appendChild(fragment);

    if(level==='neighborhoods'){
      const labels=document.createDocumentFragment();
      const allBounds=currentBoundaryFeature?geometryBounds(currentBoundaryFeature.geometry):mergeBounds(features);
      const mapWidth=Math.max(1,allBounds[2]-allBounds[0]),baseFont=clamp(mapWidth/32,5.2,15);
      for(const feature of features){
        const name=featureName(feature),code=featureCode(feature),point=geometryLabelPoint(feature.geometry);
        if(point.area<18)continue;
        const [a,b,c,d]=geometryBounds(feature.geometry),fw=Math.max(1,c-a),fh=Math.max(1,d-b);
        const font=clamp(Math.min(baseFont,fw/Math.max(4,name.length*.48),fh/2.2),4,baseFont);
        const text=document.createElementNS('http://www.w3.org/2000/svg','text');text.setAttribute('x',point.x);text.setAttribute('y',point.y);text.setAttribute('class','ab-neighborhood-label');text.setAttribute('font-size',font);text.dataset.code=code;text.textContent=name;
        if(clipId)text.setAttribute('clip-path',`url(#${clipId})`);labels.appendChild(text);
      }
      svg.appendChild(labels);
      if(currentBoundaryFeature){const outline=document.createElementNS('http://www.w3.org/2000/svg','path');outline.setAttribute('d',geometryToPath(currentBoundaryFeature.geometry));outline.setAttribute('fill','none');outline.setAttribute('stroke','#0f172a');outline.setAttribute('stroke-width','2');outline.setAttribute('vector-effect','non-scaling-stroke');outline.setAttribute('pointer-events','none');svg.appendChild(outline);}
    }
    paint();
  }

  function setLoading(on){loading.classList.toggle('show',Boolean(on));}
  function showNotice(message,timeout=7000){
    clearTimeout(noticeTimer);notice.textContent=message;notice.classList.add('show');
    if(timeout>0)noticeTimer=setTimeout(()=>notice.classList.remove('show'),timeout);
  }
  function hideNotice(){clearTimeout(noticeTimer);notice.classList.remove('show');}

  function levelLabel(){return level==='states'?'Estados':level==='municipalities'?'Cidades':'Bairros TSE';}
  function updateVisibleChrome(){
    levelBadge.textContent=levelLabel();
    if(mapHint)mapHint.textContent='Brasil → Estado → Cidade → Bairro TSE • geografia territorial + cadastro TSE';
    if(level==='states'){
      if(mapTitle)mapTitle.textContent='Brasil';
      if(mapSubtitle)mapSubtitle.textContent='Passe o cursor ou toque sobre um estado para identificá-lo';
    }else if(level==='municipalities'){
      const stateItem=history.find(x=>x.level==='states');
      if(stateItem&&mapTitle)mapTitle.textContent=stateItem.name;
      if(mapSubtitle)mapSubtitle.textContent='Clique em uma cidade para abrir os bairros do cadastro eleitoral do TSE';
    }else{
      const city=history.find(x=>x.level==='municipalities');
      if(city&&mapTitle)mapTitle.textContent=city.name;
      if(mapSubtitle)mapSubtitle.textContent='Bairros conforme NM_BAIRRO dos locais de votação do TSE';
    }
  }

  async function ensureDelaunay(){
    if(globalThis.d3?.Delaunay)return globalThis.d3.Delaunay;
    if(globalThis.__abDashboardDelaunayPromise)return globalThis.__abDashboardDelaunayPromise;
    globalThis.__abDashboardDelaunayPromise=new Promise((resolve,reject)=>{
      const s=document.createElement('script');s.src=D3_DELAUNAY_URL;s.async=true;
      s.onload=()=>globalThis.d3?.Delaunay?resolve(globalThis.d3.Delaunay):reject(new Error('Gerador das áreas eleitorais não inicializou.'));
      s.onerror=()=>reject(new Error('Não foi possível carregar o gerador das áreas eleitorais.'));
      document.head.appendChild(s);
    });
    return globalThis.__abDashboardDelaunayPromise;
  }

  async function loadNeighborhoods(cityItem,stateItem){
    const uf=String(stateItem?.abbr||stateItem?.feature?.properties?.abbr||stateItem?.feature?.properties?.sigla||'').toUpperCase();
    const municipalityName=String(cityItem?.name||featureName(cityItem?.feature)||'').trim();
    const boundaryFeature=cityItem?.feature||null;
    if(!uf||uf.length!==2||!municipalityName||!boundaryFeature?.geometry)throw new Error('Não foi possível identificar a UF, a cidade ou o contorno municipal.');

    const payload=await api(`/api/polling-places?uf=${encodeURIComponent(uf)}&municipalityName=${encodeURIComponent(municipalityName)}`);
    const groups=new Map();
    for(const place of payload.places||[]){
      const bairroName=String(place.neighborhood||'').trim()||'SEM BAIRRO INFORMADO';
      const key=norm(bairroName)||'sem bairro informado';
      if(!groups.has(key))groups.set(key,{id:`${uf}:${norm(municipalityName)}:${key}`,name:bairroName,locations:[],zones:new Set(),sections:new Set(),places:0});
      const group=groups.get(key);group.places++;
      if(place.zone)group.zones.add(String(place.zone));
      for(const section of place.sections||[])if(section)group.sections.add(String(section));
      const lat=Number(place.latitude),lon=Number(place.longitude);
      if(Number.isFinite(lat)&&Number.isFinite(lon)&&lat>=-35&&lat<=7&&lon>=-75&&lon<=-28)group.locations.push({lat,lon,name:place.name||'',address:place.address||''});
    }
    const neighborhoods=[...groups.values()];
    if(!neighborhoods.length)throw new Error(`O TSE não retornou bairros/locais de votação para ${municipalityName}/${uf}.`);

    const cityBounds=geometryBounds(boundaryFeature.geometry),cityCenter=[(cityBounds[0]+cityBounds[2])/2,(cityBounds[1]+cityBounds[3])/2];
    const points=neighborhoods.map((group,index)=>{
      let x,y,coordSource='TSE';
      if(group.locations.length){const projected=group.locations.map(loc=>project([loc.lon,loc.lat]));x=projected.reduce((s,p)=>s+p[0],0)/projected.length;y=projected.reduce((s,p)=>s+p[1],0)/projected.length;}
      else{const angle=(Math.PI*2*index)/Math.max(1,neighborhoods.length),radius=Math.min(cityBounds[2]-cityBounds[0],cityBounds[3]-cityBounds[1])*.22;x=cityCenter[0]+Math.cos(angle)*radius;y=cityCenter[1]+Math.sin(angle)*radius;coordSource='TSE_SEM_COORDENADA';}
      const jitter=index*.00017;return{group,x:x+jitter,y:y+jitter,coordSource};
    });

    const Delaunay=await ensureDelaunay();
    const delaunay=Delaunay.from(points,d=>d.x,d=>d.y),voronoi=delaunay.voronoi(cityBounds),out=[];
    points.forEach((record,index)=>{
      const polygon=voronoi.cellPolygon(index);if(!polygon||polygon.length<3)return;
      const ring=polygon.map(unproject);if(ring.length&&(ring[0][0]!==ring[ring.length-1][0]||ring[0][1]!==ring[ring.length-1][1]))ring.push([...ring[0]]);
      const g=record.group;
      out.push({type:'Feature',id:g.id,properties:{TSE_BAIRRO_ID:g.id,NM_BAIRRO:g.name,NM_MUNICIPIO:municipalityName,SG_UF:uf,FONTE:'TSE',GEOMETRIA:'APROXIMADA_VORONOI_LOCAIS_VOTACAO',QTD_LOCAIS:g.places,QTD_ZONAS:g.zones.size,QTD_SECOES:g.sections.size,COORDENADAS:record.coordSource,LOCAIS:g.locations.slice(0,50)},geometry:{type:'Polygon',coordinates:[ring]}});
    });
    if(!out.length)throw new Error(`Os bairros do TSE foram encontrados para ${municipalityName}, mas não foi possível desenhar a camada eleitoral.`);
    return{features:out,boundaryFeature,source:'TSE'};
  }

  async function loadLevel(nextLevel,parent,{reset=false}={}){
    setLoading(true);hideNotice();
    try{
      let nextFeatures=[],boundary=null,source=null;
      if(nextLevel==='states'){
        const payload=await api('/api/geo?level=states');nextFeatures=payload.geojson?.features||[];
      }else if(nextLevel==='municipalities'){
        const stateItem=parent||history.find(x=>x.level==='states');
        const payload=await api(`/api/geo?level=municipalities&state=${encodeURIComponent(stateItem.code)}`);nextFeatures=payload.geojson?.features||[];
      }else{
        const stateItem=history.find(x=>x.level==='states'),cityItem=parent||history.find(x=>x.level==='municipalities');
        const result=await loadNeighborhoods(cityItem,stateItem);nextFeatures=result.features;boundary=result.boundaryFeature;source=result.source;
      }
      if(!nextFeatures.length)throw new Error('Não há geometria disponível para este recorte.');
      level=nextLevel;currentBoundaryFeature=boundary;currentSource=source;render(nextFeatures);
      const target=paddedViewBox(boundary&&nextLevel==='neighborhoods'?geometryBounds(boundary.geometry):mergeBounds(nextFeatures),reset?.06:.08);
      if(reset){viewBox=target;applyViewBox();}else await animateViewBox(target);
      updateVisibleChrome();
      if(level==='neighborhoods'&&currentSource==='TSE')showNotice('Bairros/nomenclatura: TSE (NM_BAIRRO dos locais de votação). As divisões internas são áreas eleitorais aproximadas por proximidade dos locais de votação, recortadas ao limite do município.',8000);
      return true;
    }finally{setLoading(false);}
  }

  function findLegacyRegion(name,code){
    const target=norm(name),codeText=String(code||'');
    const all=[...legacyMap.querySelectorAll('.geo-region')];
    return all.find(path=>codeText&&String(path.dataset.code||'')===codeText)||all.find(path=>norm(path.dataset.name)===target)||null;
  }

  function waitFor(test,timeout=5500){
    return new Promise(resolve=>{const start=performance.now();const tick=()=>{if(test())return resolve(true);if(performance.now()-start>timeout)return resolve(false);setTimeout(tick,60);};tick();});
  }

  async function syncLegacyForward(feature){
    const name=featureName(feature),code=featureCode(feature),path=findLegacyRegion(name,code);
    if(!path)return false;
    internalSync=true;path.click();
    if(level==='states')await waitFor(()=>legacyMap.querySelectorAll('.geo-region').length>30&&norm(mapTitle?.textContent)===norm(name));
    else if(level==='municipalities')await waitFor(()=>norm(scopeTitle?.textContent)===norm(name));
    internalSync=false;return true;
  }

  async function drill(feature){
    const code=featureCode(feature),name=featureName(feature);selectedCode=code;paint();
    if(level==='neighborhoods'){
      if(selectionStatus)selectionStatus.textContent=`${name} • bairro TSE selecionado • resultados do município`;
      return;
    }
    const previousFeatures=features,previousLevel=level,previousView=[...viewBox],previousBoundary=currentBoundaryFeature,previousSource=currentSource;
    const ok=await syncLegacyForward(feature);if(!ok)showNotice('A área foi aberta no mapa, mas a seleção eleitoral não pôde ser sincronizada automaticamente.');
    await animateViewBox(paddedViewBox(geometryBounds(feature.geometry),.10));
    const item={level,code,name,feature,abbr:String(feature.properties?.abbr||feature.properties?.sigla||'').toUpperCase()};history.push(item);
    const next=previousLevel==='states'?'municipalities':'neighborhoods';
    try{const success=await loadLevel(next,item);if(!success)throw new Error('Falha ao abrir o próximo nível.');}
    catch(error){history.pop();level=previousLevel;features=previousFeatures;currentBoundaryFeature=previousBoundary;currentSource=previousSource;render(features);viewBox=previousView;applyViewBox();updateVisibleChrome();showNotice(error.message||'Não foi possível abrir o próximo nível.');}
  }

  async function goBackVisible(){
    if(!history.length)return;
    history.pop();const target=history.length?(history[history.length-1].level==='states'?'municipalities':'neighborhoods'):'states';const parent=history.length?history[history.length-1]:null;
    try{await loadLevel(target,parent);}catch(error){showNotice(error.message);}
  }

  async function resetVisible(){
    history=[];selectedCode=null;hoveredCode=null;currentBoundaryFeature=null;currentSource=null;
    try{await loadLevel('states',null,{reset:true});}catch(error){showNotice(error.message);}
  }

  svg.addEventListener('click',event=>{if(event.target===svg&&level!=='states')resetButton?.click();});
  backButton?.addEventListener('click',()=>{if(!internalSync)setTimeout(goBackVisible,0);});
  resetButton?.addEventListener('click',()=>{if(!internalSync)setTimeout(resetVisible,0);});

  citySelect?.addEventListener('change',()=>{
    if(internalSync||level!=='municipalities'||!citySelect.value)return;
    setTimeout(()=>{const option=citySelect.options[citySelect.selectedIndex],feature=features.find(f=>String(featureCode(f,'municipalities'))===String(citySelect.value))||features.find(f=>norm(featureName(f))===norm(option?.textContent));if(feature)drill(feature);},0);
  });

  breadcrumb?.addEventListener('click',event=>{
    const button=event.target.closest('[data-crumb]');if(!button||internalSync)return;const target=button.dataset.crumb;
    setTimeout(()=>{if(target==='br')resetVisible();else if(target==='state'&&level==='neighborhoods')goBackVisible();},0);
  });

  resetVisible();
})();
