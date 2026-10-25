(() => {
  'use strict';
  if (window.__apuraNeighborhoodResultsUIV2) return;
  window.__apuraNeighborhoodResultsUIV2 = true;

  const COLORS={PL:'#165dff',PT:'#e31d2b',PSD:'#ef8d22',NOVO:'#e86e1c',MDB:'#3e9278',PSOL:'#d5b913',PDT:'#d34646',PSB:'#d5a51d',PP:'#3471bf','UNIÃO':'#207da5',REPUBLICANOS:'#587cca',AVANTE:'#7b1bd1',PCB:'#8d2737',PSTU:'#b82d3d',UP:'#bd20c8',PCO:'#7a2530',DC:'#23847b','MISSÃO':'#6e58a0',DEMOCRATA:'#25838d'};
  const UFS={ACRE:'AC',ALAGOAS:'AL',AMAPA:'AP',AMAZONAS:'AM',BAHIA:'BA',CEARA:'CE','DISTRITO FEDERAL':'DF','ESPIRITO SANTO':'ES',GOIAS:'GO',MARANHAO:'MA','MATO GROSSO':'MT','MATO GROSSO DO SUL':'MS','MINAS GERAIS':'MG',PARA:'PA',PARAIBA:'PB',PARANA:'PR',PERNAMBUCO:'PE',PIAUI:'PI','RIO DE JANEIRO':'RJ','RIO GRANDE DO NORTE':'RN','RIO GRANDE DO SUL':'RS',RONDONIA:'RO',RORAIMA:'RR','SANTA CATARINA':'SC','SAO PAULO':'SP',SERGIPE:'SE',TOCANTINS:'TO'};
  const LABELS={presidente:'Presidente',governador:'Governador',senador:'Senador','deputado-federal':'Deputado Federal','deputado-estadual':'Deputado Estadual'};
  const cache=new Map();
  const inflight=new Map();
  let activeName='';
  let hoverTimer=0;
  let leaveTimer=0;
  let baseline=null;
  let baselineKey='';

  const norm=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]+/g,' ').trim();
  const digits=v=>String(v??'').replace(/\D/g,'');
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmt=v=>new Intl.NumberFormat('pt-BR').format(Number(v||0));
  const pct=v=>`${Number(v||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})}%`;
  const level=()=>String(document.querySelector('.ab-map-level')?.textContent||'').trim();
  const office=()=>document.querySelector('.office-btn[data-office].active')?.dataset.office||'presidente';
  const year=()=>Number(window.ApuraElectionYear||2026);
  const round=()=>Number(window.ApuraBrasilRound?.get?.()||1);
  const color=party=>{const k=String(party||'').toUpperCase();if(COLORS[k])return COLORS[k];let h=0;for(const c of k)h=(h*31+c.charCodeAt(0))%360;return `hsl(${h||205} 62% 46%)`;};
  const initials=n=>String(n||'?').split(/\s+/).filter(Boolean).slice(0,2).map(x=>x[0]).join('').toUpperCase();
  const normalizePhotoUrl=url=>String(url||'').replace(/(\/ele2026\/6257\/fotos\/)(?:ac|al|ap|am|ba|ce|df|es|go|ma|mt|ms|mg|pa|pb|pr|pe|pi|rj|rn|rs|ro|rr|sc|sp|se|to|zz)(\/)/i,'$1br$2');

  async function api(url){
    const r=await fetch(url,{headers:{Accept:'application/json'}});
    const j=await r.json().catch(()=>({}));
    if(!r.ok||j.ok===false)throw new Error(j.detail||j.error||`HTTP ${r.status}`);
    return j;
  }

  function context(){
    if(level()!=='Bairros TSE')return null;
    const city=String(document.getElementById('mapTitle')?.textContent||'').trim();
    const crumbs=[...document.querySelectorAll('#breadcrumb button,#breadcrumb span')].map(x=>String(x.textContent||'').trim()).filter(x=>x&&x!=='›');
    const uf=UFS[norm(crumbs[1]||'')]||'';
    const municipalityCode=digits(document.getElementById('citySelect')?.value||'');
    return city&&uf?{city,uf,municipalityCode,office:office(),year:year(),round:round()}:null;
  }

  const key=c=>c?[c.year,c.round,c.office,c.uf,c.municipalityCode||norm(c.city)].join('|'):'';
  function metaMap(municipal){const m=new Map();for(const c of municipal?.candidates||[]){if(c.sequence)m.set(`seq:${c.sequence}`,c);if(c.number)m.set(`num:${c.number}`,c);}return m;}

  function captureBaseline(force=false){
    const c=context();
    if(!c)return;
    const k=key(c);
    if(!force&&baseline&&baselineKey===k)return;
    const summary=document.getElementById('resultSummary');
    const list=document.getElementById('candidateList');
    const scope=document.getElementById('scopeTitle');
    const sub=document.getElementById('scopeSubtitle');
    const status=document.getElementById('selectionStatus');
    if(!summary||!list||!scope)return;
    baseline={summary:summary.innerHTML,list:list.innerHTML,scope:scope.textContent,sub:sub?.textContent||'',status:status?.textContent||''};
    baselineKey=k;
  }

  function restoreTotal(){
    clearTimeout(hoverTimer);activeName='';
    if(!baseline||baselineKey!==key(context()))return;
    const summary=document.getElementById('resultSummary'),list=document.getElementById('candidateList'),scope=document.getElementById('scopeTitle'),sub=document.getElementById('scopeSubtitle'),status=document.getElementById('selectionStatus');
    if(summary)summary.innerHTML=baseline.summary;
    if(list)list.innerHTML=baseline.list;
    if(scope)scope.textContent=baseline.scope;
    if(sub)sub.textContent=baseline.sub;
    if(status)status.textContent=baseline.status;
    window.dispatchEvent(new CustomEvent('apura:map-result-focus',{detail:{active:false,name:baseline.scope||document.getElementById('mapTitle')?.textContent||'Total',type:'total'}}));
  }

  function unavailable(msg,name){
    const s=document.getElementById('resultSummary'),l=document.getElementById('candidateList'),scope=document.getElementById('scopeTitle');
    if(scope&&name)scope.textContent=name;
    if(s)s.innerHTML=`<div class="empty-state"><div><strong>Resultado por bairro</strong><br>${esc(msg)}</div></div>`;
    if(l)l.innerHTML='<div class="empty-state">Aguardando dados oficiais do TSE para este recorte.</div>';
  }

  function paint(data){
    if(level()!=='Bairros TSE')return;
    const meta=metaMap(data.municipal),byName=new Map((data.neighborhoods.neighborhoods||[]).map(n=>[norm(n.name),n]));
    requestAnimationFrame(()=>{
      document.querySelectorAll('.ab-drilldown-region').forEach(region=>{
        const n=byName.get(norm(region.dataset.name));if(!n?.winner)return;
        const m=meta.get(n.winner.sequence?`seq:${n.winner.sequence}`:`num:${n.winner.number}`)||{};
        const fill=color(m.party||'');
        region.dataset.voteColor=fill;
        if(region.style.fill!==fill)region.style.setProperty('fill',fill,'important');
      });
    });
  }

  function render(data,name){
    if(level()!=='Bairros TSE'||!name)return;
    const n=(data.neighborhoods.neighborhoods||[]).find(x=>norm(x.name)===norm(name));
    if(!n)return unavailable('Bairro não localizado no cadastro eleitoral do TSE.',name);
    if(!data.neighborhoods.available){unavailable(data.neighborhoods.notice||'O TSE ainda não publicou a votação por seção deste turno.',n.name);return;}
    const meta=metaMap(data.municipal),cands=(n.candidates||[]).map(c=>({...meta.get(c.sequence?`seq:${c.sequence}`:`num:${c.number}`),...c}));
    const scope=document.getElementById('scopeTitle'),sub=document.getElementById('scopeSubtitle'),status=document.getElementById('selectionStatus'),summary=document.getElementById('resultSummary'),list=document.getElementById('candidateList');
    if(scope)scope.textContent=n.name;
    if(sub)sub.textContent=`Bairro TSE • ${LABELS[data.context.office]||data.context.office} • ${data.context.year}`;
    if(status)status.textContent=`${n.name} • TSE • ${fmt(n.sections.totalized)} seções • ${fmt(n.places)} locais de votação`;
    if(summary)summary.innerHTML=`<div class="totalization neighborhood-totalization"><div class="total-head"><div class="total-main"><small>Seções do bairro totalizadas</small><strong>${pct(n.sections.percentage)}</strong><span class="history-result-badge">TSE • SEÇÃO</span></div><div class="total-state"><b>${n.sections.percentage>=100?'ENCERRADA':'EM ANDAMENTO'}</b><span>TSE ${esc(data.neighborhoods.generatedTime||'')}</span></div></div><div class="section-counters"><div class="section-counter done"><span>APURADAS</span><strong>${fmt(n.sections.totalized)}</strong><small>de ${fmt(n.sections.total)} seções</small></div><div class="section-counter pending"><span>FALTAM APURAR</span><strong>${fmt(Math.max(0,n.sections.total-n.sections.totalized))}</strong><small>${pct(100-n.sections.percentage)} restantes</small></div></div><div class="total-progress"><i style="width:${Math.max(0,Math.min(100,n.sections.percentage))}%"></i></div></div>`;
    const limit=data.context.office.startsWith('deputado')?80:20;
    if(list)list.innerHTML=cands.length?cands.slice(0,limit).map((c,i)=>{const col=color(c.party),w=Math.max(0,Math.min(100,Number(c.percentage||0))),display=c.ballotName||c.name||'Candidato',photoUrl=normalizePhotoUrl(c.photoUrl),photo=photoUrl?`<img src="${esc(photoUrl)}" alt="Foto de ${esc(display)}" loading="lazy" decoding="async" onload="this.parentElement.classList.add('photo-loaded')" onerror="this.remove()">`:'';return `<article class="candidate-card" style="animation-delay:${Math.min(i*16,120)}ms"><div class="candidate-avatar">${photo}<span class="avatar-fallback">${esc(initials(display))}</span></div><div class="candidate-main"><div class="candidate-name">${esc(display)}</div><div class="candidate-subline"><span class="party-chip" style="background:${col}">${esc(c.party||'—')}</span><span class="candidate-number">Nº ${esc(c.number||'—')}</span></div><div class="candidate-bar"><i style="width:${w}%;background:${col}"></i><span>${fmt(c.votes)} votos</span></div></div><div class="candidate-score"><strong>${pct(c.percentage)}</strong><small>${fmt(c.votes)} votos</small></div></article>`;}).join(''):'<div class="empty-state">Nenhum voto computado neste bairro para o cargo selecionado.</div>';
    window.dispatchEvent(new CustomEvent('apura:map-result-focus',{detail:{active:true,name:n.name,type:'neighborhood',candidates:cands.slice(0,2),sections:n.sections}}));
  }

  async function load(force=false){
    const c=context();if(!c||c.year!==2026)return null;
    const k=key(c);
    if(!force&&cache.has(k)){const data=cache.get(k);paint(data);return data;}
    if(!force&&inflight.has(k))return inflight.get(k);

    const task=(async()=>{
      const rq=new URLSearchParams({action:'result',office:c.office,year:String(c.year),round:String(c.round),uf:c.uf.toLowerCase(),municipalityName:c.city});
      const municipalPromise=api(`/api/results?${rq}`);
      let neighborhoodsPromise=null;
      if(c.municipalityCode){
        const nq=new URLSearchParams({year:String(c.year),round:String(c.round),office:c.office,uf:c.uf,municipalityCode:c.municipalityCode,municipalityName:c.city});
        neighborhoodsPromise=api(`/api/neighborhood-results?${nq}`);
      }
      const municipal=await municipalPromise;
      const municipalityCode=c.municipalityCode||digits(municipal.municipalityCode||'');
      if(!municipalityCode)throw new Error('Código do município não retornado pelo TSE.');
      if(!neighborhoodsPromise){
        const nq=new URLSearchParams({year:String(c.year),round:String(c.round),office:c.office,uf:c.uf,municipalityCode,municipalityName:c.city});
        neighborhoodsPromise=api(`/api/neighborhood-results?${nq}`);
      }
      const neighborhoods=await neighborhoodsPromise;
      const data={context:{...c,municipalityCode},municipal,neighborhoods};
      cache.set(k,data);paint(data);return data;
    })();

    inflight.set(k,task);
    try{return await task;}finally{inflight.delete(k);}
  }

  function focusRegion(region,delay=45){
    if(!region||level()!=='Bairros TSE')return;
    const name=String(region.dataset.name||'').trim();if(!name)return;
    clearTimeout(leaveTimer);clearTimeout(hoverTimer);
    captureBaseline();
    activeName=name;
    hoverTimer=setTimeout(async()=>{
      const data=cache.get(key(context()))||await load(false).catch(()=>null);
      if(activeName!==name)return;
      if(data)render(data,name);else unavailable('Dados por bairro indisponíveis no momento.',name);
    },delay);
  }

  const stage=document.getElementById('mapStage');
  stage?.addEventListener('pointerover',e=>{
    const region=e.target.closest?.('.ab-drilldown-region');
    if(region&&level()==='Bairros TSE')focusRegion(region,e.pointerType==='touch'?0:45);
  });
  stage?.addEventListener('pointerout',e=>{
    const region=e.target.closest?.('.ab-drilldown-region');if(!region||level()!=='Bairros TSE'||e.pointerType==='touch')return;
    const next=e.relatedTarget?.closest?.('.ab-drilldown-region');
    if(next)return;
    clearTimeout(leaveTimer);leaveTimer=setTimeout(restoreTotal,85);
  });
  stage?.addEventListener('pointerdown',e=>{
    if(level()!=='Bairros TSE')return;
    const region=e.target.closest?.('.ab-drilldown-region');
    if(region)focusRegion(region,0);else restoreTotal();
  },{passive:true});

  document.addEventListener('click',e=>{
    if(e.target.closest?.('.office-btn[data-office]')&&level()==='Bairros TSE'){
      activeName='';baseline=null;baselineKey='';setTimeout(()=>{captureBaseline(true);load(true).catch(()=>{});},220);
    }
  });

  document.getElementById('refreshButton')?.addEventListener('click',()=>{
    if(level()!=='Bairros TSE')return;
    const name=activeName;
    setTimeout(async()=>{
      if(!name){captureBaseline(true);return;}
      const data=await load(true).catch(()=>null);if(data&&activeName===name)render(data,name);
    },100);
  },true);

  window.addEventListener('apura:election-year-changed',()=>{
    activeName='';baseline=null;baselineKey='';setTimeout(()=>{captureBaseline(true);load(true).catch(()=>{});},120);
  });

  const badge=document.querySelector('.ab-map-level');
  if(badge)new MutationObserver(()=>{
    clearTimeout(hoverTimer);clearTimeout(leaveTimer);activeName='';baseline=null;baselineKey='';
    if(level()==='Bairros TSE'){
      setTimeout(()=>captureBaseline(true),120);
      const prefetch=()=>load(false).catch(()=>{});
      if('requestIdleCallback'in window)requestIdleCallback(prefetch,{timeout:350});else setTimeout(prefetch,60);
    }
  }).observe(badge,{subtree:true,childList:true,characterData:true});

  const style=document.createElement('style');
  style.textContent='.ab-drilldown-region{transition:fill .055s ease,opacity .08s ease,filter .08s ease,stroke-width .08s ease!important}.neighborhood-source-note{margin-top:6px;font-size:9px;color:#64748b;text-align:right}';
  document.head.appendChild(style);
})();
