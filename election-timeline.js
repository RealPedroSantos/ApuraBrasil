(() => {
  'use strict';
  const stage=document.getElementById('mapStage');
  if(!stage)return;

  const YEARS=[];
  for(let year=2000;year<=2030;year+=2){
    YEARS.push({year,type:year%4===0?'municipal':'geral',current:year===2026,future:year>2026,integrated:year===2022||year===2026});
  }

  const wrap=document.createElement('section');
  wrap.className='election-timeline';
  wrap.setAttribute('aria-label','Linha do tempo eleitoral');
  wrap.innerHTML='<div class="timeline-head"><strong>Eleições</strong><span id="timelineStatus">2026 • Geral • atual</span></div><div class="timeline-scroll" id="timelineScroll"></div>';
  stage.appendChild(wrap);
  const scroll=wrap.querySelector('#timelineScroll'),status=wrap.querySelector('#timelineStatus');
  let selected=2026,archiveRequest=0;

  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmt=v=>new Intl.NumberFormat('pt-BR').format(Number(v||0));
  const pct=v=>`${Number(v||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})}%`;
  function label(item){if(item.current)return'ATUAL';if(item.future)return'FUTURA';if(item.year===2022)return'TSE';return'ARQUIVO';}
  function render(){scroll.innerHTML=YEARS.map(item=>`<button type="button" class="timeline-year ${item.year===selected?'active':''} ${item.future?'future':item.current?'current':'past'} ${item.integrated?'integrated':'archive'}" data-year="${item.year}" aria-pressed="${item.year===selected?'true':'false'}"><strong>${item.year}</strong><small>${item.type==='geral'?'GERAL':'MUNIC.'}</small><em>${label(item)}</em></button>`).join('');requestAnimationFrame(()=>scroll.querySelector('.timeline-year.active')?.scrollIntoView({block:'nearest',inline:'center'}));}
  function updateStatus(item){const type=item.type==='geral'?'Geral':'Municipal',mode=item.current?'atual':item.future?'futura':item.year===2022?'arquivo oficial TSE':'arquivo histórico';status.textContent=`${item.year} • ${type} • ${mode}`;}
  function currentScopeIsBrasil(){return [...document.querySelectorAll('#breadcrumb button,#breadcrumb span')].filter(el=>!el.classList.contains('crumb-sep')).map(el=>el.textContent.trim()).filter(Boolean).length<=1;}
  function setSource(text,good=true){const feed=document.getElementById('feedStatus'),bottom=document.getElementById('bottomSource');if(feed)feed.textContent=text;if(bottom)bottom.textContent=text;document.querySelectorAll('.status-dot').forEach(dot=>dot.classList.toggle('bad',!good));}
  function archiveNotice(message){const summary=document.getElementById('resultSummary'),list=document.getElementById('candidateList');if(summary)summary.innerHTML=`<div class="timeline-placeholder"><span class="eyebrow">ARQUIVO OFICIAL • 2022</span><strong>Presidente • 2º turno</strong><p>${esc(message)}</p></div>`;if(list)list.innerHTML='<div class="empty-state">O arquivo nacional de 2022 está disponível no nível Brasil.</div>';}
  function renderHistoricalResult(result){
    const summary=document.getElementById('resultSummary'),list=document.getElementById('candidateList');if(!summary||!list)return;
    const s=result.sections||{},e=result.electorate||{},v=result.votes||{},total=Number(s.total||0),totalized=Number(s.totalized||0),remaining=Math.max(0,total-totalized),progress=Number(s.percentage||0);
    summary.innerHTML=`<div class="totalization historical-totalization"><div class="total-head"><div class="total-main"><small>Seções totalizadas</small><strong>${pct(progress)}</strong><span class="history-result-badge">ARQUIVO 2022 • 2º TURNO</span></div><div class="total-state"><b>${result.final?'ENCERRADA':'ARQUIVO'}</b><span>TSE ${esc(result.generatedDate||'')} ${esc(result.generatedTime||'')}</span></div></div><div class="section-counters"><div class="section-counter done"><span>APURADAS</span><strong>${fmt(totalized)}</strong><small>de ${fmt(total)} seções</small></div><div class="section-counter pending"><span>FALTAM APURAR</span><strong>${fmt(remaining)}</strong><small>${pct(Math.max(0,100-progress))} restantes</small></div></div><div class="total-progress"><i style="width:${Math.max(0,Math.min(100,progress))}%"></i></div><div class="summary-metrics"><div class="summary-metric"><span>Comparecimento</span><b>${fmt(e.turnout)}</b></div><div class="summary-metric"><span>Abstenções</span><b>${fmt(e.abstentions)}</b></div><div class="summary-metric"><span>Válidos</span><b>${fmt(v.valid)}</b></div><div class="summary-metric"><span>Brancos + nulos</span><b>${fmt(Number(v.blank||0)+Number(v.null||0))}</b></div></div></div>`;
    const candidates=result.candidates||[];
    list.innerHTML=candidates.length?candidates.map((c,index)=>{const name=c.ballotName||c.name||'Candidato',width=Math.max(0,Math.min(100,Number(c.percentage||0))),initials=String(name).split(/\s+/).filter(Boolean).slice(0,2).map(w=>w[0]).join('').toUpperCase();return`<article class="candidate-card historical-card" style="animation-delay:${Math.min(index*35,180)}ms"><div class="candidate-avatar"><span class="avatar-fallback">${esc(initials)}</span></div><div class="candidate-main"><div class="candidate-name">${esc(name)}</div><div class="candidate-subline"><span class="party-chip historical-chip">ARQUIVO</span><span class="candidate-number">2022 • 2º turno</span></div><div class="candidate-bar"><i style="width:${width}%;background:#405b65"></i><span>${fmt(c.votes)} votos</span></div></div><div class="candidate-score"><strong>${pct(c.percentage)}</strong><small>${fmt(c.votes)} votos</small></div></article>`;}).join(''):'<div class="empty-state">Nenhum registro encontrado no arquivo histórico.</div>';
  }
  async function load2022Archive(){
    const id=++archiveRequest;
    if(!currentScopeIsBrasil()){archiveNotice('O arquivo nacional integrado de 2022 está disponível no nível Brasil. Os recortes por UF, município e seção serão ligados progressivamente aos arquivos permanentes do Portal de Dados Abertos do TSE.');setSource('Arquivo TSE 2022 • nível Brasil',true);return;}
    if(document.querySelector('.office-btn.active[data-office]')?.dataset.office!=='presidente'){archiveNotice('Nesta etapa, o arquivo histórico integrado de 2022 está disponível para Presidente no nível Brasil. Os demais cargos permanecem identificados como arquivo histórico até a normalização das bases por UF.');setSource('Arquivo TSE 2022 • integração parcial',true);return;}
    const summary=document.getElementById('resultSummary'),list=document.getElementById('candidateList');if(summary)summary.innerHTML='<div class="loading">Abrindo arquivo oficial de 2022…</div>';if(list)list.innerHTML='<div class="loading">Carregando resultado arquivado…</div>';
    try{const r=await fetch('/api/historical?year=2022&office=president&round=2',{headers:{Accept:'application/json'}}),data=await r.json().catch(()=>({}));if(id!==archiveRequest||selected!==2022)return;if(!r.ok||data.ok===false)throw new Error(data.detail||data.error||`HTTP ${r.status}`);renderHistoricalResult(data);setSource('Arquivo oficial TSE 2022',true);window.dispatchEvent(new CustomEvent('apura:historical-result-loaded',{detail:{year:2022,result:data}}));}
    catch(error){if(id!==archiveRequest)return;archiveNotice(`Não foi possível abrir o arquivo histórico agora: ${error.message}`);setSource('Arquivo TSE temporariamente indisponível',false);}
  }
  function selectYear(year,dispatch=true){const item=YEARS.find(x=>x.year===Number(year));if(!item)return;selected=item.year;render();updateStatus(item);document.documentElement.dataset.electionYear=String(item.year);document.documentElement.dataset.electionPeriod=item.future?'future':item.current?'current':'past';if(dispatch)window.dispatchEvent(new CustomEvent('apura:set-election-year',{detail:{year:item.year,type:item.type,integrated:item.integrated,future:item.future}}));}

  scroll.addEventListener('click',e=>{const button=e.target.closest('[data-year]');if(button)selectYear(Number(button.dataset.year));});
  window.addEventListener('apura:election-year-changed',e=>{const item=YEARS.find(x=>x.year===Number(e.detail?.year));if(!item)return;selected=item.year;render();updateStatus(item);if(item.year===2022)setTimeout(load2022Archive,0);else archiveRequest++;});
  document.querySelector('.office-nav')?.addEventListener('click',()=>{if(selected===2022)setTimeout(load2022Archive,180);});
  document.getElementById('resetButton')?.addEventListener('click',()=>{if(selected===2022)setTimeout(load2022Archive,220);});
  selectYear(2026,false);
})();