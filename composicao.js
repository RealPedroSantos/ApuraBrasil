(() => {
  'use strict';

  const S = window.ApuraLegislativeSimulator;
  if (!S) throw new Error('Motor de simulação legislativa não carregado.');

  const UFS=[['AC','Acre'],['AL','Alagoas'],['AP','Amapá'],['AM','Amazonas'],['BA','Bahia'],['CE','Ceará'],['DF','Distrito Federal'],['ES','Espírito Santo'],['GO','Goiás'],['MA','Maranhão'],['MT','Mato Grosso'],['MS','Mato Grosso do Sul'],['MG','Minas Gerais'],['PA','Pará'],['PB','Paraíba'],['PR','Paraná'],['PE','Pernambuco'],['PI','Piauí'],['RJ','Rio de Janeiro'],['RN','Rio Grande do Norte'],['RS','Rio Grande do Sul'],['RO','Rondônia'],['RR','Roraima'],['SC','Santa Catarina'],['SP','São Paulo'],['SE','Sergipe'],['TO','Tocantins']];
  const COLORS={PL:'#165dff',PT:'#e31d2b',PSD:'#ef8d22',NOVO:'#e86e1c',MDB:'#3e9278',PSOL:'#d5b913',PDT:'#d34646',PSB:'#d5a51d',PP:'#3471bf','UNIÃO':'#207da5',REPUBLICANOS:'#587cca',AVANTE:'#7b1bd1','MISSÃO':'#6e58a0',PCB:'#8d2737',PSTU:'#b82d3d',UP:'#bd20c8',PCO:'#7a2530',DC:'#23847b'};
  const CAMARA_TOTAL=513, SENADO_TOTAL=81, SENADO_DISPUTA=54;

  let view='deputado-federal';
  let simulationMode='live';
  let loading=false;
  let generation=0;
  let data={primary:[],secondary:[]};
  let scenarioModifiers={};
  const cache=new Map();

  const $=id=>document.getElementById(id);
  const ufSelect=$('ufSelect');
  const partyComposition=$('partyComposition');
  const projectedList=$('projectedList');
  const seatSummary=$('seatSummary');
  const compositionTitle=$('compositionTitle');
  const projectionProgress=$('projectionProgress');
  const chamberArea=$('chamberArea');
  const chamberVisual=$('chamberVisual');
  const chamberTitle=$('chamberTitle');
  const chamberCount=$('chamberCount');
  const chamberLegend=$('chamberLegend');
  const secondaryChamberCard=$('secondaryChamberCard');
  const secondaryChamberVisual=$('secondaryChamberVisual');
  const secondaryChamberTitle=$('secondaryChamberTitle');
  const secondaryChamberCount=$('secondaryChamberCount');
  const secondaryChamberLegend=$('secondaryChamberLegend');
  const scenarioPanel=$('scenarioPanel');
  const scenarioControls=$('scenarioControls');
  const scenarioNote=$('scenarioNote');
  const namesTitle=$('namesTitle');
  const modeDisclaimer=$('modeDisclaimer');

  UFS.forEach(([uf,name])=>{const option=document.createElement('option');option.value=uf;option.textContent=`${uf} — ${name}`;ufSelect.appendChild(option);});

  const fmt=v=>new Intl.NumberFormat('pt-BR',{maximumFractionDigits:0}).format(Number(v||0));
  const pct=(v,d=1)=>`${Number(v||0).toLocaleString('pt-BR',{minimumFractionDigits:d,maximumFractionDigits:d})}%`;
  const esc=v=>String(v??'').replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]));
  const color=party=>{const key=String(party||'').toUpperCase();if(COLORS[key])return COLORS[key];let h=0;for(const c of key)h=(h*31+c.charCodeAt(0))%360;return `hsl(${h||205} 60% 45%)`;};
  const majority=total=>Math.floor(total/2)+1;

  async function api(url){
    const response=await fetch(url,{headers:{Accept:'application/json'}});
    const payload=await response.json().catch(()=>({}));
    if(!response.ok||payload.ok===false)throw new Error(payload.detail||payload.error||`HTTP ${response.status}`);
    return payload;
  }

  async function resultFor(office,uf,force=false){
    const key=`${office}:${uf}`;
    const cached=cache.get(key);
    if(!force&&cached&&Date.now()-cached.at<15000)return cached.result;
    const result=await api(`/api/results?action=result&office=${encodeURIComponent(office)}&uf=${uf.toLowerCase()}`);
    cache.set(key,{at:Date.now(),result});
    return result;
  }

  async function loadOffice(office,targets,force=false){
    const settled=await Promise.allSettled(targets.map(code=>resultFor(office,code,force).then(result=>({uf:code,result}))));
    return settled.filter(x=>x.status==='fulfilled').map(x=>x.value);
  }

  function titleText(){
    const uf=ufSelect.value;
    const where=uf==='BR'?'Brasil':uf;
    if(view==='deputado-federal')return `Câmara dos Deputados • ${where}`;
    if(view==='senador')return `Senado Federal • ${where}`;
    if(view==='congresso')return `Congresso Nacional • ${where}`;
    return `${uf==='DF'?'Câmara Legislativa':'Assembleia Legislativa'} • ${where}`;
  }

  function sectionStats(results){
    let total=0,totalized=0;
    for(const {result} of results||[]){total+=Number(result.sections?.total||0);totalized+=Number(result.sections?.totalized||0);}
    return {total,totalized,percentage:total?totalized/total*100:0};
  }

  function official(candidate){return String(candidate?.electedFlag||'').toLowerCase()==='s';}

  function projectProportional(results,office,modifiers={}){
    const winners=[];
    const details=[];
    for(const item of results){
      const projection=S.allocateProportional(item.result,S.stateSeats(item.uf,office),modifiers,item.uf);
      projection.winners.forEach(w=>winners.push({...w,official:official(w)}));
      details.push({uf:item.uf,projection});
    }
    return {winners,details};
  }

  function projectSenate(results,modifiers={}){
    const winners=[];
    const details=[];
    for(const item of results){
      const projection=S.projectSenate(item.result,item.uf,modifiers);
      projection.winners.forEach(w=>winners.push({...w,official:official(w)}));
      details.push({uf:item.uf,projection});
    }
    return {winners,details};
  }

  function partyCountsMap(winners){return new Map(S.partyCounts(winners));}

  function seatPositions(total){
    if(total<=0)return[];
    const rows=total>450?12:total>250?10:total>120?8:total>70?6:5;
    const weights=Array.from({length:rows},(_,i)=>0.75+i*0.28);
    const sum=weights.reduce((a,b)=>a+b,0);
    const counts=weights.map(w=>Math.floor(total*w/sum));
    let assigned=counts.reduce((a,b)=>a+b,0),cursor=rows-1;
    while(assigned<total){counts[cursor]++;assigned++;cursor--;if(cursor<0)cursor=rows-1;}
    const points=[];
    counts.forEach((count,row)=>{
      const radius=rows===1?82:35+(55*row/(rows-1));
      for(let i=0;i<count;i++){
        const t=count===1?.5:i/(count-1),angle=Math.PI*(.07+.86*t);
        points.push({x:50+Math.cos(angle)*radius*.5,y:93-Math.sin(angle)*radius*.83});
      }
    });
    return points;
  }

  function renderLegend(target,winners,extra=[]){
    const items=S.partyCounts(winners).slice(0,12).map(([party,seats])=>({label:`${party} ${seats}`,color:color(party)})).concat(extra);
    target.innerHTML=items.map(item=>`<span class="legend-item"><i class="legend-dot" style="background:${item.color}"></i>${esc(item.label)}</span>`).join('');
  }

  function renderChamber({visual,titleEl,countEl,legendEl,title,total,winners,fixedNeutral=0,centerLabel='CADEIRAS PROJETADAS',neutralLabel='Mandato não renovado'}){
    titleEl.textContent=title;
    countEl.textContent=`${fmt(total)} cadeiras`;
    const assignments=[];
    for(const [party,seats] of S.partyCounts(winners))for(let i=0;i<seats;i++)assignments.push({party,color:color(party),kind:'party'});
    const activeCapacity=Math.max(0,total-fixedNeutral);
    while(assignments.length<activeCapacity)assignments.push({party:'Em disputa',color:'#aeb5b8',kind:'neutral'});
    if(assignments.length>activeCapacity)assignments.length=activeCapacity;
    for(let i=0;i<fixedNeutral;i++)assignments.push({party:neutralLabel,color:'#d2d5d6',kind:'neutral'});
    const points=seatPositions(total),size=total>450?5.2:total>250?6:total>120?7.5:total>80?8.5:10;
    visual.innerHTML=points.map((point,i)=>{
      const seat=assignments[i]||{party:'Em disputa',color:'#aeb5b8',kind:'neutral'};
      return `<i class="seat-dot ${seat.kind==='neutral'?'neutral':''}" title="${esc(seat.party)}" style="left:${point.x}%;top:${point.y}%;width:${size}px;height:${size}px;background:${seat.color};animation-delay:${Math.min(i*2,420)}ms"></i>`;
    }).join('')+`<div class="chamber-center-label"><strong>${fmt(winners.length)}</strong><span>${esc(centerLabel)}</span></div>`;
    const extra=[];
    if(winners.length<activeCapacity)extra.push({label:`Em disputa ${activeCapacity-winners.length}`,color:'#aeb5b8'});
    if(fixedNeutral)extra.push({label:`${neutralLabel} ${fixedNeutral}`,color:'#d2d5d6'});
    renderLegend(legendEl,winners,extra);
  }

  function summaryCards(items){
    seatSummary.innerHTML=items.map(item=>`<div class="summary-card"><span>${esc(item.label)}</span><strong>${esc(item.value)}</strong>${item.sub?`<small>${esc(item.sub)}</small>`:''}</div>`).join('');
  }

  function renderPartyRows(winners,totalHouse){
    const parties=S.partyCounts(winners),max=Math.max(1,...parties.map(([,v])=>v));
    partyComposition.innerHTML=parties.length?parties.map(([party,seats],i)=>`<div class="party-row" style="animation-delay:${Math.min(i*20,220)}ms"><div class="party-main"><div class="party-name"><i class="party-dot" style="background:${color(party)}"></i>${esc(party)}</div><div class="party-bar"><i style="width:${seats/max*100}%;background:${color(party)}"></i></div></div><div class="party-seats"><strong>${fmt(seats)}</strong><span>${totalHouse?`${pct(seats/totalHouse*100)} da casa`:'cadeiras'}</span></div></div>`).join(''):'<div class="empty-state">Ainda não há cadeiras projetadas com os dados disponíveis.</div>';
  }

  function renderComparison(baseWinners,scenarioWinners,totalHouse){
    const base=partyCountsMap(baseWinners),sim=partyCountsMap(scenarioWinners);
    const parties=[...new Set([...base.keys(),...sim.keys()])].sort((a,b)=>(sim.get(b)||0)-(sim.get(a)||0));
    partyComposition.innerHTML=`<div class="comparison-head"><span>PARTIDO</span><span>BASE</span><span>CENÁRIO</span><span>Δ</span></div>`+parties.map(party=>{
      const a=base.get(party)||0,b=sim.get(party)||0,d=b-a;
      return `<div class="comparison-row"><span><i class="party-dot" style="background:${color(party)}"></i>${esc(party)}</span><b>${a}</b><b>${b}</b><b class="${d>0?'delta-up':d<0?'delta-down':''}">${d>0?'+':''}${d}</b></div>`;
    }).join('')+`<div class="comparison-foot">Maioria absoluta: ${majority(totalHouse)} cadeiras.</div>`;
  }

  function renderNames(winners,{scenario=false}={}){
    const sorted=winners.slice().sort((a,b)=>String(a.uf).localeCompare(String(b.uf))||Number(b.votes||0)-Number(a.votes||0));
    projectedList.innerHTML=sorted.length?sorted.map((c,i)=>`<article class="projected-card" style="animation-delay:${Math.min(i*12,220)}ms"><div class="rank-badge">${esc(c.uf)}</div><div class="projected-main"><strong>${esc(c.ballotName||c.name)}</strong><span>${esc(c.party||'—')} • ${fmt(c.votes)} votos • ${esc(c.allocation||'')}</span></div><div class="seat-status"><strong class="${scenario?'scenario-status':c.official?'official':'projected'}">${scenario?'CENÁRIO':c.official?'OFICIAL':'PROJEÇÃO'}</strong><span>${scenario?'hipótese editada':c.official?'marcado eleito pelo TSE':esc(c.seatMethod||'se terminasse agora')}</span></div></article>`).join(''):'<div class="empty-state">Nenhum nome em faixa neste momento.</div>';
  }

  function syntheticWinners(stats,capacity){
    const winners=[];
    for(const stat of stats){
      for(let i=0;i<stat.median&&winners.length<capacity;i++)winners.push({party:stat.party,uf:'BR',ballotName:stat.party,votes:0});
    }
    return winners;
  }

  function renderForecastNames(forecast){
    const uncertain=forecast.candidateChance.filter(x=>x.chance>0&&x.chance<99.5);
    const certain=forecast.candidateChance.filter(x=>x.chance>=99.5);
    const chosen=[...uncertain.sort((a,b)=>Math.abs(a.chance-50)-Math.abs(b.chance-50)),...certain].slice(0,120);
    projectedList.innerHTML=chosen.length?chosen.map(item=>{
      const c=item.candidate;
      return `<article class="projected-card forecast-card"><div class="rank-badge">${esc(c.uf||'')}</div><div class="projected-main"><strong>${esc(c.ballotName||c.name)}</strong><span>${esc(c.party||'—')} • ${fmt(c.votes)} votos</span></div><div class="seat-status"><strong class="forecast-status">${pct(item.chance,0)}</strong><span>nos cenários simulados</span></div></article>`;
    }).join(''):'<div class="empty-state">Sem candidatos suficientes para estimar a faixa neste momento.</div>';
  }

  function renderForecastRows(forecast){
    partyComposition.innerHTML=`<div class="forecast-head"><span>PARTIDO</span><span>P10</span><span>MEDIANA</span><span>P90</span></div>`+forecast.partyStats.map(stat=>`<div class="forecast-row"><span><i class="party-dot" style="background:${color(stat.party)}"></i>${esc(stat.party)}</span><b>${stat.p10}</b><b>${stat.median}</b><b>${stat.p90}</b></div>`).join('');
  }

  function topAllocationControls(){
    if(view==='senador')return S.aggregateSenatePartyShares(data.primary).slice(0,12);
    if(view==='congresso'){
      const house=S.aggregateGroupShares(data.primary).slice(0,8).map(x=>({...x,prefix:'Câmara'}));
      const senate=S.aggregateSenatePartyShares(data.secondary).slice(0,6).map(x=>({...x,prefix:'Senado',senate:true}));
      return [...house,...senate];
    }
    return S.aggregateGroupShares(data.primary).slice(0,12);
  }

  function renderScenarioControls(){
    const controls=topAllocationControls();
    scenarioPanel.classList.remove('hidden');
    scenarioNote.textContent=view==='senador'?'Ajuste a força nacional/estadual de cada partido. A ordem dos dois mais votados é recalculada em tempo real.':'Ajuste a votação relativa dos agrupamentos. O sistema recalcula QE, QP, sobras e candidatos em faixa.';
    scenarioControls.innerHTML=controls.map(item=>{
      const storageKey=(item.senate?'S:':'P:')+item.key;
      const swing=Math.round(((scenarioModifiers[storageKey]||1)-1)*100);
      return `<div class="scenario-row"><div class="scenario-label"><strong>${item.prefix?`<small>${esc(item.prefix)}</small> `:''}${esc(item.key)}</strong><span>${pct(item.share)} da base</span></div><button type="button" class="swing-step" data-key="${esc(storageKey)}" data-step="-1">−</button><input class="swing-input" data-key="${esc(storageKey)}" type="number" min="-80" max="200" step="1" value="${swing}" aria-label="Variação de ${esc(item.key)}"><span class="swing-unit">%</span><button type="button" class="swing-step" data-key="${esc(storageKey)}" data-step="1">+</button></div>`;
    }).join('');
  }

  function currentModifiers(kind='P'){
    const out={};
    for(const [key,value] of Object.entries(scenarioModifiers)){
      if(key.startsWith(`${kind}:`))out[key.slice(2)]=value;
    }
    return out;
  }

  function handleScenarioInput(key,value){
    const bounded=Math.max(-80,Math.min(200,Number(value)||0));
    scenarioModifiers[key]=1+bounded/100;
    renderCurrent();
  }

  function renderLive(){
    scenarioPanel.classList.add('hidden');
    modeDisclaimer.textContent='Projeção matemática com os votos parciais disponíveis. Não equivale à proclamação oficial de eleitos.';
    namesTitle.textContent='Projetados neste momento';
    const stats=sectionStats(data.primary.length?data.primary:data.secondary);
    const uf=ufSelect.value;

    if(view==='deputado-federal'||view==='deputado-estadual'){
      const p=projectProportional(data.primary,view);
      const total=uf==='BR'?CAMARA_TOTAL:S.stateSeats(uf,view);
      const biggest=S.partyCounts(p.winners)[0]||['—',0];
      summaryCards([{label:'CADEIRAS DA CASA',value:fmt(total)},{label:'MAIOR PARTIDO',value:`${biggest[0]} ${biggest[1]}`},{label:'MAIORIA ABSOLUTA',value:fmt(majority(total))},{label:'SEÇÕES TOTALIZADAS',value:pct(stats.percentage)}]);
      chamberArea.classList.remove('dual');secondaryChamberCard.classList.add('hidden');
      renderChamber({visual:chamberVisual,titleEl:chamberTitle,countEl:chamberCount,legendEl:chamberLegend,title:view==='deputado-federal'?(uf==='BR'?'Câmara dos Deputados':`Bancada federal • ${uf}`):(uf==='DF'?'Câmara Legislativa do DF':`Assembleia Legislativa • ${uf}`),total,winners:p.winners});
      renderPartyRows(p.winners,total);renderNames(p.winners);
      const qes=p.details.map(x=>x.projection.qe).filter(Boolean);
      projectionProgress.textContent=`${data.primary.length}/${uf==='BR'?27:1} UFs carregadas${qes.length===1?` • QE ${fmt(qes[0])}`:''}`;
      return;
    }

    if(view==='senador'){
      const p=projectSenate(data.primary),total=uf==='BR'?SENADO_TOTAL:3,fixed=uf==='BR'?27:1;
      const biggest=S.partyCounts(p.winners)[0]||['—',0];
      summaryCards([{label:'CADEIRAS DO SENADO',value:fmt(total)},{label:'EM DISPUTA EM 2026',value:fmt(total-fixed)},{label:'MAIOR PARTIDO NAS VAGAS',value:`${biggest[0]} ${biggest[1]}`},{label:'SEÇÕES TOTALIZADAS',value:pct(stats.percentage)}]);
      chamberArea.classList.remove('dual');secondaryChamberCard.classList.add('hidden');
      renderChamber({visual:chamberVisual,titleEl:chamberTitle,countEl:chamberCount,legendEl:chamberLegend,title:uf==='BR'?'Senado Federal':`Senado • ${uf}`,total,winners:p.winners,fixedNeutral:fixed,centerLabel:'VAGAS DE 2026 PROJETADAS',neutralLabel:'Mandatos não renovados'});
      renderPartyRows(p.winners,total);renderNames(p.winners);
      projectionProgress.textContent=`${data.primary.length}/${uf==='BR'?27:1} UFs carregadas • 2 vagas por UF`;
      return;
    }

    const dep=projectProportional(data.primary,'deputado-federal'),sen=projectSenate(data.secondary),all=[...dep.winners,...sen.winners];
    const houseTotal=uf==='BR'?CAMARA_TOTAL:S.stateSeats(uf,'deputado-federal'),senTotal=uf==='BR'?81:3,senFixed=uf==='BR'?27:1;
    summaryCards([{label:'CONGRESSO',value:fmt(houseTotal+senTotal)},{label:'CÂMARA PROJETADA',value:`${dep.winners.length}/${houseTotal}`},{label:'SENADO 2026',value:`${sen.winners.length}/${senTotal-senFixed}`},{label:'SEÇÕES TOTALIZADAS',value:pct(stats.percentage)}]);
    chamberArea.classList.add('dual');secondaryChamberCard.classList.remove('hidden');
    renderChamber({visual:chamberVisual,titleEl:chamberTitle,countEl:chamberCount,legendEl:chamberLegend,title:'Câmara dos Deputados',total:houseTotal,winners:dep.winners});
    renderChamber({visual:secondaryChamberVisual,titleEl:secondaryChamberTitle,countEl:secondaryChamberCount,legendEl:secondaryChamberLegend,title:'Senado Federal',total:senTotal,winners:sen.winners,fixedNeutral:senFixed,centerLabel:'VAGAS 2026',neutralLabel:'Mandatos não renovados'});
    renderPartyRows(all,houseTotal+senTotal);renderNames(all);
    projectionProgress.textContent=`Câmara ${data.primary.length}/${uf==='BR'?27:1} UFs • Senado ${data.secondary.length}/${uf==='BR'?27:1} UFs`;
  }

  function renderScenario(){
    renderScenarioControls();
    modeDisclaimer.textContent='Cenário hipotético. Os controles alteram a votação relativa e recalculam a distribuição; não é previsão oficial.';
    namesTitle.textContent='Eleitos no cenário simulado';
    const stats=sectionStats(data.primary.length?data.primary:data.secondary),uf=ufSelect.value;

    if(view==='deputado-federal'||view==='deputado-estadual'){
      const base=projectProportional(data.primary,view),sim=projectProportional(data.primary,view,currentModifiers('P'));
      const total=uf==='BR'?CAMARA_TOTAL:S.stateSeats(uf,view),biggest=S.partyCounts(sim.winners)[0]||['—',0];
      summaryCards([{label:'CADEIRAS',value:fmt(total)},{label:'MAIOR PARTIDO NO CENÁRIO',value:`${biggest[0]} ${biggest[1]}`},{label:'MAIORIA ABSOLUTA',value:fmt(majority(total))},{label:'SEÇÕES DA BASE',value:pct(stats.percentage)}]);
      chamberArea.classList.remove('dual');secondaryChamberCard.classList.add('hidden');
      renderChamber({visual:chamberVisual,titleEl:chamberTitle,countEl:chamberCount,legendEl:chamberLegend,title:'Plenário do cenário',total,winners:sim.winners,centerLabel:'CADEIRAS SIMULADAS'});
      renderComparison(base.winners,sim.winners,total);renderNames(sim.winners,{scenario:true});
      projectionProgress.textContent='Cenário manual • atualização instantânea';
      return;
    }

    if(view==='senador'){
      const base=projectSenate(data.primary),sim=projectSenate(data.primary,currentModifiers('S'));
      const total=uf==='BR'?81:3,fixed=uf==='BR'?27:1,biggest=S.partyCounts(sim.winners)[0]||['—',0];
      summaryCards([{label:'CADEIRAS DO SENADO',value:fmt(total)},{label:'VAGAS SIMULADAS',value:fmt(sim.winners.length)},{label:'MAIOR PARTIDO NAS VAGAS',value:`${biggest[0]} ${biggest[1]}`},{label:'SEÇÕES DA BASE',value:pct(stats.percentage)}]);
      chamberArea.classList.remove('dual');secondaryChamberCard.classList.add('hidden');
      renderChamber({visual:chamberVisual,titleEl:chamberTitle,countEl:chamberCount,legendEl:chamberLegend,title:'Senado no cenário',total,winners:sim.winners,fixedNeutral:fixed,centerLabel:'VAGAS SIMULADAS',neutralLabel:'Mandatos não renovados'});
      renderComparison(base.winners,sim.winners,total);renderNames(sim.winners,{scenario:true});
      projectionProgress.textContent='Cenário manual • votação majoritária recalculada';
      return;
    }

    const baseDep=projectProportional(data.primary,'deputado-federal'),baseSen=projectSenate(data.secondary);
    const simDep=projectProportional(data.primary,'deputado-federal',currentModifiers('P')),simSen=projectSenate(data.secondary,currentModifiers('S'));
    const baseAll=[...baseDep.winners,...baseSen.winners],simAll=[...simDep.winners,...simSen.winners];
    const houseTotal=uf==='BR'?513:S.stateSeats(uf,'deputado-federal'),senTotal=uf==='BR'?81:3,senFixed=uf==='BR'?27:1;
    summaryCards([{label:'CONGRESSO',value:fmt(houseTotal+senTotal)},{label:'CÂMARA NO CENÁRIO',value:fmt(simDep.winners.length)},{label:'SENADO NO CENÁRIO',value:fmt(simSen.winners.length)},{label:'SEÇÕES DA BASE',value:pct(stats.percentage)}]);
    chamberArea.classList.add('dual');secondaryChamberCard.classList.remove('hidden');
    renderChamber({visual:chamberVisual,titleEl:chamberTitle,countEl:chamberCount,legendEl:chamberLegend,title:'Câmara no cenário',total:houseTotal,winners:simDep.winners,centerLabel:'CADEIRAS SIMULADAS'});
    renderChamber({visual:secondaryChamberVisual,titleEl:secondaryChamberTitle,countEl:secondaryChamberCount,legendEl:secondaryChamberLegend,title:'Senado no cenário',total:senTotal,winners:simSen.winners,fixedNeutral:senFixed,centerLabel:'VAGAS SIMULADAS',neutralLabel:'Mandatos não renovados'});
    renderComparison(baseAll,simAll,houseTotal+senTotal);renderNames(simAll,{scenario:true});
    projectionProgress.textContent='Cenário manual do Congresso';
  }

  function renderForecast(){
    scenarioPanel.classList.add('hidden');
    namesTitle.textContent='Probabilidade nos cenários simulados';
    modeDisclaimer.textContent='Monte Carlo experimental baseado na apuração atual. A incerteza diminui conforme mais seções são totalizadas; não é pesquisa eleitoral.';
    const stats=sectionStats(data.primary.length?data.primary:data.secondary),uf=ufSelect.value;

    partyComposition.innerHTML='<div class="loading-card">Executando cenários probabilísticos…</div>';
    projectedList.innerHTML='<div class="loading-card">Calculando chances por candidato…</div>';
    projectionProgress.textContent='Simulando 250 cenários…';

    setTimeout(()=>{
      if(simulationMode!=='forecast')return;
      if(view==='deputado-federal'||view==='deputado-estadual'){
        const forecast=S.monteCarloProportional(data.primary,view,250),total=uf==='BR'?513:S.stateSeats(uf,view),synthetic=syntheticWinners(forecast.partyStats,total);
        summaryCards([{label:'CENÁRIOS',value:fmt(forecast.runs)},{label:'CADEIRAS',value:fmt(total)},{label:'MAIORIA ABSOLUTA',value:fmt(majority(total))},{label:'SEÇÕES TOTALIZADAS',value:pct(stats.percentage)}]);
        chamberArea.classList.remove('dual');secondaryChamberCard.classList.add('hidden');
        renderChamber({visual:chamberVisual,titleEl:chamberTitle,countEl:chamberCount,legendEl:chamberLegend,title:'Mediana dos cenários',total,winners:synthetic,centerLabel:'MEDIANA SIMULADA'});
        renderForecastRows(forecast);renderForecastNames(forecast);
        projectionProgress.textContent=`${forecast.runs} cenários • faixa P10–P90`;
        return;
      }
      if(view==='senador'){
        const forecast=S.monteCarloSenate(data.primary,250),total=uf==='BR'?81:3,fixed=uf==='BR'?27:1,synthetic=syntheticWinners(forecast.partyStats,total-fixed);
        summaryCards([{label:'CENÁRIOS',value:fmt(forecast.runs)},{label:'VAGAS EM DISPUTA',value:fmt(total-fixed)},{label:'MANDATOS MANTIDOS',value:fmt(fixed)},{label:'SEÇÕES TOTALIZADAS',value:pct(stats.percentage)}]);
        chamberArea.classList.remove('dual');secondaryChamberCard.classList.add('hidden');
        renderChamber({visual:chamberVisual,titleEl:chamberTitle,countEl:chamberCount,legendEl:chamberLegend,title:'Senado • mediana dos cenários',total,winners:synthetic,fixedNeutral:fixed,centerLabel:'MEDIANA 2026',neutralLabel:'Mandatos não renovados'});
        renderForecastRows(forecast);renderForecastNames(forecast);
        projectionProgress.textContent=`${forecast.runs} cenários • faixa P10–P90`;
        return;
      }
      const a=S.monteCarloProportional(data.primary,'deputado-federal',180),b=S.monteCarloSenate(data.secondary,180);
      const map=new Map();
      for(const x of a.partyStats)map.set(x.party,{party:x.party,p10:x.p10,median:x.median,p90:x.p90});
      for(const x of b.partyStats){const r=map.get(x.party)||{party:x.party,p10:0,median:0,p90:0};r.p10+=x.p10;r.median+=x.median;r.p90+=x.p90;map.set(x.party,r);}
      const combined={runs:180,partyStats:[...map.values()].sort((x,y)=>y.median-x.median),candidateChance:[...a.candidateChance,...b.candidateChance].sort((x,y)=>y.chance-x.chance)};
      const houseTotal=uf==='BR'?513:S.stateSeats(uf,'deputado-federal'),senTotal=uf==='BR'?81:3,senFixed=uf==='BR'?27:1;
      const synthetic=syntheticWinners(combined.partyStats,houseTotal+senTotal-senFixed);
      summaryCards([{label:'CENÁRIOS',value:fmt(combined.runs)},{label:'CONGRESSO',value:fmt(houseTotal+senTotal)},{label:'MAIORIA ABSOLUTA',value:fmt(majority(houseTotal+senTotal))},{label:'SEÇÕES TOTALIZADAS',value:pct(stats.percentage)}]);
      chamberArea.classList.remove('dual');secondaryChamberCard.classList.add('hidden');
      renderChamber({visual:chamberVisual,titleEl:chamberTitle,countEl:chamberCount,legendEl:chamberLegend,title:'Congresso • mediana das vagas de 2026',total:houseTotal+senTotal,winners:synthetic,fixedNeutral:senFixed,centerLabel:'MEDIANA SIMULADA',neutralLabel:'Senado não renovado'});
      renderForecastRows(combined);renderForecastNames(combined);
      projectionProgress.textContent='180 cenários combinados • faixa P10–P90';
    },30);
  }

  function renderCurrent(){
    compositionTitle.textContent=titleText();
    document.body.dataset.simulationMode=simulationMode;
    if(simulationMode==='scenario')renderScenario();
    else if(simulationMode==='forecast')renderForecast();
    else renderLive();
  }

  async function loadProjection(force=false){
    if(loading)return;
    loading=true;
    const myGeneration=++generation;
    const uf=ufSelect.value;
    const targets=uf==='BR'?UFS.map(x=>x[0]):[uf];
    compositionTitle.textContent=titleText();
    projectionProgress.textContent='Carregando dados do TSE…';
    partyComposition.innerHTML='<div class="loading-card">Calculando composição…</div>';
    projectedList.innerHTML='<div class="loading-card">Preparando nomes em faixa…</div>';
    try{
      if(view==='congresso'){
        const [deputies,senate]=await Promise.all([loadOffice('deputado-federal',targets,force),loadOffice('senador',targets,force)]);
        if(myGeneration!==generation)return;
        data={primary:deputies,secondary:senate};
      }else{
        const office=view;
        const results=await loadOffice(office,targets,force);
        if(myGeneration!==generation)return;
        data={primary:results,secondary:[]};
      }
      if(!data.primary.length&&!(view==='congresso'&&data.secondary.length))throw new Error('Nenhum resultado disponível para a seleção.');
      renderCurrent();
    }catch(error){
      console.error('composition load failed',error);
      projectionProgress.textContent='Falha ao carregar';
      seatSummary.innerHTML='';
      partyComposition.innerHTML=`<div class="empty-state"><strong>Não foi possível carregar a simulação.</strong><span>${esc(error.message||'Tente novamente.')}</span></div>`;
      projectedList.innerHTML='<div class="empty-state">Use “Atualizar” para tentar novamente.</div>';
    }finally{loading=false;}
  }

  document.querySelectorAll('.mode[data-office]').forEach(button=>button.addEventListener('click',()=>{
    document.querySelectorAll('.mode[data-office]').forEach(b=>b.classList.remove('active'));
    button.classList.add('active');view=button.dataset.office;
    scenarioModifiers={};
    if(view==='deputado-estadual'&&ufSelect.value==='BR')ufSelect.value='RJ';
    loadProjection();
  }));

  document.querySelectorAll('.simulation-mode').forEach(button=>button.addEventListener('click',()=>{
    document.querySelectorAll('.simulation-mode').forEach(b=>b.classList.remove('active'));
    button.classList.add('active');simulationMode=button.dataset.simulation;
    renderCurrent();
  }));

  ufSelect.addEventListener('change',()=>{scenarioModifiers={};loadProjection();});
  $('refreshProjection').addEventListener('click',()=>loadProjection(true));
  $('resetScenario').addEventListener('click',()=>{scenarioModifiers={};renderCurrent();});

  scenarioControls.addEventListener('input',event=>{
    const input=event.target.closest('.swing-input');if(!input)return;
    handleScenarioInput(input.dataset.key,input.value);
  });
  scenarioControls.addEventListener('click',event=>{
    const button=event.target.closest('.swing-step');if(!button)return;
    const input=scenarioControls.querySelector(`.swing-input[data-key="${CSS.escape(button.dataset.key)}"]`);if(!input)return;
    input.value=Number(input.value||0)+Number(button.dataset.step||0);
    handleScenarioInput(button.dataset.key,input.value);
  });

  function tick(){ $('projectionClock').textContent=new Intl.DateTimeFormat('pt-BR',{hour:'2-digit',minute:'2-digit',second:'2-digit'}).format(new Date()); }
  tick();setInterval(tick,1000);
  setInterval(()=>{if(!document.hidden&&!loading&&simulationMode!=='scenario')loadProjection(true);},30000);
  loadProjection();
})();
