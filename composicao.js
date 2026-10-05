(() => {
  'use strict';

  const UFS=[['AC','Acre'],['AL','Alagoas'],['AP','Amapá'],['AM','Amazonas'],['BA','Bahia'],['CE','Ceará'],['DF','Distrito Federal'],['ES','Espírito Santo'],['GO','Goiás'],['MA','Maranhão'],['MT','Mato Grosso'],['MS','Mato Grosso do Sul'],['MG','Minas Gerais'],['PA','Pará'],['PB','Paraíba'],['PR','Paraná'],['PE','Pernambuco'],['PI','Piauí'],['RJ','Rio de Janeiro'],['RN','Rio Grande do Norte'],['RS','Rio Grande do Sul'],['RO','Rondônia'],['RR','Roraima'],['SC','Santa Catarina'],['SP','São Paulo'],['SE','Sergipe'],['TO','Tocantins']];
  const COLORS={PL:'#165dff',PT:'#e31d2b',PSD:'#ef8d22',NOVO:'#e86e1c',MDB:'#3e9278',PSOL:'#d5b913',PDT:'#d34646',PSB:'#d5a51d',PP:'#3471bf','UNIÃO':'#207da5',REPUBLICANOS:'#587cca',AVANTE:'#7b1bd1','MISSÃO':'#6e58a0',PCB:'#8d2737',PSTU:'#b82d3d',UP:'#bd20c8',PCO:'#7a2530',DC:'#23847b',DEMOCRATA:'#25838d'};
  const CAMARA_TOTAL=513;
  const SENADO_TOTAL=81;
  const SENADO_DISPUTA_2026=54;

  let view='deputado-federal',loading=false;
  const ufSelect=document.getElementById('ufSelect');
  const partyComposition=document.getElementById('partyComposition');
  const projectedList=document.getElementById('projectedList');
  const seatSummary=document.getElementById('seatSummary');
  const compositionTitle=document.getElementById('compositionTitle');
  const projectionProgress=document.getElementById('projectionProgress');
  const chamberArea=document.getElementById('chamberArea');
  const chamberVisual=document.getElementById('chamberVisual');
  const chamberTitle=document.getElementById('chamberTitle');
  const chamberCount=document.getElementById('chamberCount');
  const chamberLegend=document.getElementById('chamberLegend');
  const secondaryChamberCard=document.getElementById('secondaryChamberCard');
  const secondaryChamberVisual=document.getElementById('secondaryChamberVisual');
  const secondaryChamberTitle=document.getElementById('secondaryChamberTitle');
  const secondaryChamberCount=document.getElementById('secondaryChamberCount');
  const secondaryChamberLegend=document.getElementById('secondaryChamberLegend');

  UFS.forEach(([uf,name])=>{const option=document.createElement('option');option.value=uf;option.textContent=`${uf} — ${name}`;ufSelect.appendChild(option);});

  const fmt=v=>new Intl.NumberFormat('pt-BR').format(Number(v||0));
  const esc=v=>String(v??'').replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]));
  const pct=v=>`${Number(v||0).toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1})}%`;

  function color(party){const key=String(party||'').toUpperCase();if(COLORS[key])return COLORS[key];let h=0;for(const c of key)h=(h*31+c.charCodeAt(0))%360;return `hsl(${h||205} 60% 45%)`;}
  async function api(url){const r=await fetch(url,{headers:{Accept:'application/json'}});const p=await r.json().catch(()=>({}));if(!r.ok||p.ok===false)throw new Error(p.detail||p.error||`HTTP ${r.status}`);return p;}
  async function resultFor(office,uf){return api(`/api/results?action=result&office=${encodeURIComponent(office)}&uf=${uf.toLowerCase()}`);}

  function projectDeputies(result,uf){
    const winners=[];
    for(const group of result.groups||[]){
      const seats=Math.max(0,Number(group.seats||0));
      if(!seats)continue;
      const candidates=(result.candidates||[]).filter(c=>String(c.coalition||'')===String(group.name||'')).sort((a,b)=>Number(b.votes||0)-Number(a.votes||0));
      candidates.slice(0,seats).forEach((candidate,index)=>winners.push({...candidate,uf,allocation:group.name||candidate.party,seatInGroup:index+1,official:String(candidate.electedFlag||'').toLowerCase()==='s'}));
    }
    return winners;
  }

  function projectSenate(result,uf){
    return (result.candidates||[]).slice().sort((a,b)=>Number(b.votes||0)-Number(a.votes||0)).slice(0,2).map((candidate,index)=>({...candidate,uf,allocation:candidate.party,seatInGroup:index+1,official:String(candidate.electedFlag||'').toLowerCase()==='s'}));
  }

  function titleText(uf){
    const where=uf==='BR'?'Brasil':uf;
    if(view==='deputado-federal')return `Câmara dos Deputados • ${where}`;
    if(view==='senador')return `Senado Federal • ${where}`;
    if(view==='congresso')return `Congresso Nacional • ${where}`;
    return `Assembleia Legislativa • ${where}`;
  }

  function sectionStats(results){
    let total=0,totalized=0;
    results.forEach(({result})=>{total+=Number(result.sections?.total||0);totalized+=Number(result.sections?.totalized||0);});
    return {total,totalized,percentage:total?totalized/total*100:0};
  }

  function partyCounts(winners){
    const map=new Map();
    winners.forEach(w=>map.set(w.party||'Sem sigla',(map.get(w.party||'Sem sigla')||0)+1));
    return [...map.entries()].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0],'pt-BR'));
  }

  function seatPositions(total){
    if(total<=0)return[];
    const rows=total>450?12:total>250?10:total>120?8:total>70?6:5;
    const weights=Array.from({length:rows},(_,i)=>0.75+i*0.28);
    const sum=weights.reduce((a,b)=>a+b,0);
    const counts=weights.map(w=>Math.floor(total*w/sum));
    let assigned=counts.reduce((a,b)=>a+b,0),cursor=rows-1;
    while(assigned<total){counts[cursor]++;assigned++;cursor--;if(cursor<0)cursor=rows-1;}
    while(assigned>total){const i=counts.findIndex(c=>c>1);if(i<0)break;counts[i]--;assigned--;}
    const points=[];
    counts.forEach((count,row)=>{
      const radius=rows===1?82:35+(55*row/(rows-1));
      for(let i=0;i<count;i++){
        const t=count===1 ? 0.5 : i/(count-1);
        const angle=Math.PI*(.07+.86*t);
        points.push({x:50+Math.cos(angle)*radius*.5,y:93-Math.sin(angle)*radius*.83,row});
      }
    });
    return points;
  }

  function buildSeatAssignments(total,winners,{fixedNeutral=0,fixedNeutralLabel='Mandato não renovado',pendingLabel='Em apuração'}={}){
    const counts=partyCounts(winners);
    const assignments=[];
    counts.forEach(([party,seats])=>{for(let i=0;i<seats;i++)assignments.push({party,color:color(party),kind:'party'});});
    const roomForProjected=Math.max(0,total-fixedNeutral);
    while(assignments.length<roomForProjected)assignments.push({party:pendingLabel,color:'#aeb5b8',kind:'neutral'});
    if(assignments.length>roomForProjected)assignments.length=roomForProjected;
    for(let i=0;i<fixedNeutral;i++)assignments.push({party:fixedNeutralLabel,color:'#d2d5d6',kind:'neutral'});
    while(assignments.length<total)assignments.push({party:pendingLabel,color:'#aeb5b8',kind:'neutral'});
    return assignments;
  }

  function renderLegend(target,winners,extra=[]){
    const items=partyCounts(winners).slice(0,12).map(([party,seats])=>({label:`${party} ${seats}`,color:color(party)})).concat(extra);
    target.innerHTML=items.map(item=>`<span class="legend-item"><i class="legend-dot" style="background:${item.color}"></i>${esc(item.label)}</span>`).join('');
  }

  function renderChamber({visual,titleEl,countEl,legendEl,title,total,winners,fixedNeutral=0,fixedNeutralLabel='Mandato não renovado',pendingLabel='Em apuração',centerLabel}){
    titleEl.textContent=title;
    countEl.textContent=`${fmt(total)} cadeiras`;
    const assignments=buildSeatAssignments(total,winners,{fixedNeutral,fixedNeutralLabel,pendingLabel});
    const points=seatPositions(total);
    const size=total>450?5.2:total>250?6:total>120?7.5:total>80?8.5:10;
    visual.innerHTML=points.map((point,i)=>{
      const seat=assignments[i]||{color:'#aeb5b8',kind:'neutral',party:pendingLabel};
      return `<i class="seat-dot ${seat.kind==='neutral'?'neutral':''}" title="${esc(seat.party)}" style="left:${point.x}%;top:${point.y}%;width:${size}px;height:${size}px;background:${seat.color};animation-delay:${Math.min(i*2,420)}ms"></i>`;
    }).join('')+`<div class="chamber-center-label"><strong>${fmt(winners.length)}</strong><span>${esc(centerLabel||'CADEIRAS PROJETADAS')}</span></div>`;
    const extra=[];
    const projectedCapacity=Math.max(0,total-fixedNeutral);
    if(winners.length<projectedCapacity)extra.push({label:`${pendingLabel} ${projectedCapacity-winners.length}`,color:'#aeb5b8'});
    if(fixedNeutral)extra.push({label:`${fixedNeutralLabel} ${fixedNeutral}`,color:'#d2d5d6'});
    renderLegend(legendEl,winners,extra);
  }

  function renderPartyRows(winners,totalHouse){
    const parties=partyCounts(winners),maxSeats=Math.max(1,...parties.map(([,seats])=>seats));
    partyComposition.innerHTML=parties.length?parties.map(([party,seats],i)=>`<div class="party-row" style="animation-delay:${Math.min(i*25,250)}ms"><div class="party-main"><div class="party-name"><i class="party-dot" style="background:${color(party)}"></i>${esc(party)}</div><div class="party-bar"><i style="width:${seats/maxSeats*100}%;background:${color(party)}"></i></div></div><div class="party-seats"><strong>${fmt(seats)}</strong><span>${totalHouse?`${(seats/totalHouse*100).toLocaleString('pt-BR',{maximumFractionDigits:1})}% da casa`:'cadeiras'}</span></div></div>`).join(''):'<div class="summary-card">Ainda não há vagas projetadas pelo arquivo parcial do TSE.</div>';
  }

  function renderNames(winners){
    const sorted=winners.slice().sort((a,b)=>String(a.uf).localeCompare(String(b.uf))||Number(b.votes||0)-Number(a.votes||0));
    projectedList.innerHTML=sorted.length?sorted.map((c,i)=>`<article class="projected-card" style="animation-delay:${Math.min(i*18,260)}ms"><div class="rank-badge">${esc(c.uf)}</div><div class="projected-main"><strong>${esc(c.ballotName||c.name)}</strong><span>${esc(c.party||'—')} • ${fmt(c.votes)} votos • ${esc(c.allocation||'')}</span></div><div class="seat-status"><strong class="${c.official?'official':'projected'}">${c.official?'OFICIAL':'PROJEÇÃO'}</strong><span>${c.official?'marcado eleito pelo TSE':'se terminasse agora'}</span></div></article>`).join(''):'<div class="summary-card">Nenhum nome em faixa neste momento.</div>';
  }

  function renderStandard(results,requestedCount,office){
    const winners=[];
    results.forEach(({uf,result})=>winners.push(...(office==='senador'?projectSenate(result,uf):projectDeputies(result,uf)));
    const stats=sectionStats(results),officialCount=winners.filter(w=>w.official).length,uf=ufSelect.value;
    let totalHouse=winners.length,fixedNeutral=0,title='',centerLabel='CADEIRAS PROJETADAS';
    if(office==='deputado-federal'&&uf==='BR'){totalHouse=CAMARA_TOTAL;title='Câmara dos Deputados';}
    else if(office==='deputado-federal'){totalHouse=Math.max(winners.length,results.reduce((n,x)=>n+(x.result.groups||[]).reduce((s,g)=>s+Number(g.seats||0),0),0));title=`Bancada federal • ${uf}`;}
    else if(office==='senador'&&uf==='BR'){totalHouse=SENADO_TOTAL;fixedNeutral=SENADO_TOTAL-SENADO_DISPUTA_2026;title='Senado Federal';centerLabel='CADEIRAS EM DISPUTA PROJETADAS';}
    else if(office==='senador'){totalHouse=3;fixedNeutral=1;title=`Senado • ${uf}`;centerLabel='CADEIRAS EM DISPUTA PROJETADAS';}
    else {totalHouse=Math.max(winners.length,results.reduce((n,x)=>n+(x.result.groups||[]).reduce((s,g)=>s+Number(g.seats||0),0),0));title=`Assembleia Legislativa • ${uf}`;}
    const pending=Math.max(0,totalHouse-fixedNeutral-winners.length);
    seatSummary.innerHTML=`<div class="summary-card"><span>CADEIRAS DA CASA</span><strong>${fmt(totalHouse)}</strong></div><div class="summary-card"><span>PROJETADAS AGORA</span><strong>${fmt(winners.length)}</strong></div><div class="summary-card"><span>A DEFINIR / NÃO PROJETADAS</span><strong>${fmt(pending)}</strong></div><div class="summary-card"><span>SEÇÕES TOTALIZADAS</span><strong>${pct(stats.percentage)}</strong></div>`;
    chamberArea.classList.remove('dual');secondaryChamberCard.classList.add('hidden');
    renderChamber({visual:chamberVisual,titleEl:chamberTitle,countEl:chamberCount,legendEl:chamberLegend,title,total:totalHouse,winners,fixedNeutral,fixedNeutralLabel:'Mandato não renovado em 2026',centerLabel});
    renderPartyRows(winners,totalHouse);
    renderNames(winners);
    projectionProgress.textContent=`${results.length}/${requestedCount} UFs carregadas • ${officialCount} já marcados pelo TSE`;
  }

  function renderCongress(deputyResults,senateResults,requestedCount){
    const deputies=[],senators=[];
    deputyResults.forEach(({uf,result})=>deputies.push(...projectDeputies(result,uf)));
    senateResults.forEach(({uf,result})=>senators.push(...projectSenate(result,uf)));
    const all=[...deputies,...senators],uf=ufSelect.value;
    const stats=sectionStats(deputyResults.length?deputyResults:senateResults);
    const houseTotal=uf==='BR'?CAMARA_TOTAL:Math.max(deputies.length,deputyResults.reduce((n,x)=>n+(x.result.groups||[]).reduce((s,g)=>s+Number(g.seats||0),0),0));
    const senateTotal=uf==='BR'?SENADO_TOTAL:3;
    const senateFixed=uf==='BR'?27:1;
    seatSummary.innerHTML=`<div class="summary-card"><span>CONGRESSO NACIONAL</span><strong>${fmt(houseTotal+senateTotal)}</strong></div><div class="summary-card"><span>CÂMARA PROJETADA</span><strong>${fmt(deputies.length)} / ${fmt(houseTotal)}</strong></div><div class="summary-card"><span>SENADO EM DISPUTA</span><strong>${fmt(senators.length)} / ${fmt(senateTotal-senateFixed)}</strong></div><div class="summary-card"><span>SEÇÕES TOTALIZADAS</span><strong>${pct(stats.percentage)}</strong></div>`;
    chamberArea.classList.add('dual');secondaryChamberCard.classList.remove('hidden');
    renderChamber({visual:chamberVisual,titleEl:chamberTitle,countEl:chamberCount,legendEl:chamberLegend,title:uf==='BR'?'Câmara dos Deputados':`Bancada federal • ${uf}`,total:houseTotal,winners:deputies,centerLabel:'DEPUTADOS PROJETADOS'});
    renderChamber({visual:secondaryChamberVisual,titleEl:secondaryChamberTitle,countEl:secondaryChamberCount,legendEl:secondaryChamberLegend,title:uf==='BR'?'Senado Federal':`Senado • ${uf}`,total:senateTotal,winners:senators,fixedNeutral:senateFixed,fixedNeutralLabel:'Mandato não renovado em 2026',centerLabel:'SENADORES PROJETADOS'});
    renderPartyRows(all,houseTotal+senateTotal);
    renderNames(all);
    projectionProgress.textContent=`Câmara ${deputyResults.length}/${requestedCount} UFs • Senado ${senateResults.length}/${requestedCount} UFs`;
  }

  async function loadProjection(){
    if(loading)return;
    loading=true;
    const uf=ufSelect.value;
    compositionTitle.textContent=titleText(uf);
    partyComposition.innerHTML='<div class="summary-card">Calculando composição...</div>';
    projectedList.innerHTML='<div class="summary-card">Carregando candidatos...</div>';
    seatSummary.innerHTML='';chamberVisual.innerHTML='';secondaryChamberVisual.innerHTML='';

    if(view==='deputado-estadual'&&uf==='BR'){
      projectionProgress.textContent='Selecione uma UF';
      partyComposition.innerHTML='<div class="summary-card">A composição de Assembleia é estadual. Selecione uma UF.</div>';
      projectedList.innerHTML='';
      chamberVisual.innerHTML='<div class="chamber-center-label"><span>SELECIONE UM ESTADO</span></div>';
      loading=false;return;
    }

    const targets=uf==='BR'?UFS.map(([code])=>code):[uf];
    projectionProgress.textContent=`0/${targets.length} UFs`;

    try{
      if(view==='congresso'){
        const deputySettled=await Promise.allSettled(targets.map(code=>resultFor('deputado-federal',code).then(result=>({uf:code,result}))));
        const senateSettled=await Promise.allSettled(targets.map(code=>resultFor('senador',code).then(result=>({uf:code,result}))));
        const deputies=deputySettled.filter(x=>x.status==='fulfilled').map(x=>x.value);
        const senate=senateSettled.filter(x=>x.status==='fulfilled').map(x=>x.value);
        renderCongress(deputies,senate,targets.length);
      }else{
        const settled=await Promise.allSettled(targets.map(code=>resultFor(view,code).then(result=>({uf:code,result}))));
        const ok=settled.filter(x=>x.status==='fulfilled').map(x=>x.value);
        renderStandard(ok,targets.length,view);
      }
    }catch(error){
      console.error('composition load failed',error);
      projectionProgress.textContent='Falha ao carregar';
      partyComposition.innerHTML='<div class="summary-card">Não foi possível carregar a composição agora.</div>';
      projectedList.innerHTML='<div class="summary-card">Tente novamente em alguns segundos.</div>';
    }finally{loading=false;}
  }

  document.querySelectorAll('.mode').forEach(button=>button.addEventListener('click',()=>{
    document.querySelectorAll('.mode').forEach(b=>b.classList.remove('active'));
    button.classList.add('active');view=button.dataset.office;
    if(view==='deputado-estadual'&&ufSelect.value==='BR')ufSelect.value='RJ';
    loadProjection();
  }));
  ufSelect.addEventListener('change',loadProjection);
  document.getElementById('refreshProjection').addEventListener('click',loadProjection);
  function tick(){document.getElementById('projectionClock').textContent=new Intl.DateTimeFormat('pt-BR',{hour:'2-digit',minute:'2-digit',second:'2-digit'}).format(new Date());}
  tick();setInterval(tick,1000);setInterval(()=>{if(!document.hidden)loadProjection();},30000);loadProjection();
})();