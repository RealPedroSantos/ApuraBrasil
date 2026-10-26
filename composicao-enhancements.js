(() => {
  'use strict';

  // Mandatos iniciados em 2023 que continuam até 2031.
  // Atualizado após o 2º turno de 2026, incluindo as substituições decorrentes
  // das eleições estaduais: AM (Cheila Moreira), MG (Alex Diniz) e PR (Luís Felipe Cunha).
  const INCUMBENTS = [
    {uf:'AC',name:'Alan Rick',party:'REPUBLICANOS'},
    {uf:'AL',name:'Renan Filho',party:'MDB'},
    {uf:'AM',name:'Cheila Moreira',party:'PT'},
    {uf:'AP',name:'Davi Alcolumbre',party:'UNIÃO'},
    {uf:'BA',name:'Otto Alencar',party:'PSD'},
    {uf:'CE',name:'Camilo Santana',party:'PT'},
    {uf:'DF',name:'Damares Alves',party:'REPUBLICANOS'},
    {uf:'ES',name:'Magno Malta',party:'PL'},
    {uf:'GO',name:'Wilder Morais',party:'PL'},
    {uf:'MA',name:'Ana Paula Lobato',party:'PSB'},
    {uf:'MG',name:'Alex Diniz',party:'PL'},
    {uf:'MS',name:'Tereza Cristina',party:'PP'},
    {uf:'MT',name:'Wellington Fagundes',party:'PL'},
    {uf:'PA',name:'Beto Faro',party:'PT'},
    {uf:'PB',name:'Efraim Filho',party:'PL'},
    {uf:'PE',name:'Teresa Leitão',party:'PT'},
    {uf:'PI',name:'Jussara Lima',party:'PSD'},
    {uf:'PR',name:'Luís Felipe Cunha',party:'PL'},
    {uf:'RJ',name:'Romário',party:'S/PARTIDO'},
    {uf:'RN',name:'Rogerio Marinho',party:'PL'},
    {uf:'RO',name:'Jaime Bagattoli',party:'PL'},
    {uf:'RR',name:'Dr. Hiran',party:'PP'},
    {uf:'RS',name:'Hamilton Mourão',party:'REPUBLICANOS'},
    {uf:'SC',name:'Jorge Seif',party:'PL'},
    {uf:'SE',name:'Laércio Oliveira',party:'PP'},
    {uf:'SP',name:'Astronauta Marcos Pontes',party:'PL'},
    {uf:'TO',name:'Professora Dorinha Seabra',party:'UNIÃO'}
  ];

  const COLORS={PL:'#165dff',PT:'#e31d2b',PSD:'#ef8d22',NOVO:'#e86e1c',MDB:'#3e9278',PSOL:'#d5b913',PDT:'#d34646',PSB:'#d5a51d',PP:'#3471bf','UNIÃO':'#207da5',REPUBLICANOS:'#587cca',AVANTE:'#7b1bd1','MISSÃO':'#6e58a0',PCB:'#8d2737',PSTU:'#b82d3d',UP:'#bd20c8',PCO:'#7a2530',DC:'#23847b','S/PARTIDO':'#7d8589'};
  const $=id=>document.getElementById(id);
  const ufSelect=$('ufSelect');
  const partyComposition=$('partyComposition');
  const projectedList=$('projectedList');
  const namesTitle=$('namesTitle');

  if(!ufSelect||!partyComposition||!projectedList)return;

  const esc=v=>String(v??'').replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]));
  const color=party=>{
    const key=String(party||'').toUpperCase();
    if(COLORS[key])return COLORS[key];
    let h=0;for(const c of key)h=(h*31+c.charCodeAt(0))%360;
    return `hsl(${h||205} 45% 48%)`;
  };

  function view(){return document.querySelector('.mode.active[data-office]')?.dataset.office||'deputado-federal';}
  function currentIncumbents(){return ufSelect.value==='BR'?INCUMBENTS:INCUMBENTS.filter(x=>x.uf===ufSelect.value);}

  function calculateGeometry(totalSeats,width=600,height=330){
    const safeSeats=Math.max(1,Number(totalSeats||1));
    const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
    const cx=width/2,baselineY=height-18,outerRadius=Math.min(width*.46,height*.88);
    const rings=clamp(Math.round(Math.sqrt(safeSeats)/1.55),safeSeats<=40?2:3,safeSeats>=900?16:13);
    const innerRadius=outerRadius*clamp(.43-Math.log10(safeSeats+1)*.035,.30,.45);
    const ringGap=rings===1?0:(outerRadius-innerRadius)/(rings-1);
    const radii=Array.from({length:rings},(_,i)=>innerRadius+i*ringGap);
    const weights=radii.map(r=>Math.max(1,Math.PI*r)),sum=weights.reduce((a,b)=>a+b,0),exact=weights.map(w=>w/sum*safeSeats),counts=exact.map(Math.floor);
    let missing=safeSeats-counts.reduce((a,b)=>a+b,0);
    exact.map((v,i)=>({i,f:v-Math.floor(v)})).sort((a,b)=>b.f-a.f).slice(0,missing).forEach(({i})=>counts[i]++);
    const seats=[];
    radii.forEach((radius,ringIndex)=>{
      const count=counts[ringIndex];
      const edgePad=.025;
      for(let i=0;i<count;i++){
        const t=count===1?.5:i/(count-1),angle=Math.PI+edgePad+t*(Math.PI-edgePad*2);
        seats.push({x:cx+Math.cos(angle)*radius,y:baselineY+Math.sin(angle)*radius,radius,ringIndex});
      }
    });
    seats.sort((a,b)=>Math.abs(a.x-b.x)>.001?a.x-b.x:a.radius-b.radius);
    return seats;
  }

  function addStateBackdrop(visual,total){
    const svg=visual?.querySelector('.ab-parliament-svg');
    if(!svg||svg.querySelector('.ab-seat-backdrop'))return;
    const NS='http://www.w3.org/2000/svg';
    const active=[...svg.querySelectorAll('.ab-seat')];
    if(!active.length||active.length>=total)return;
    const geometry=calculateGeometry(total);
    const group=document.createElementNS(NS,'g');
    group.classList.add('ab-seat-backdrop-group');
    const r=total>450?3.4:total>100?5:7;
    geometry.forEach(point=>{
      const circle=document.createElementNS(NS,'circle');
      circle.classList.add('ab-seat-backdrop');
      circle.setAttribute('cx',point.x);circle.setAttribute('cy',point.y);circle.setAttribute('r',r);
      group.appendChild(circle);
    });
    svg.insertBefore(group,svg.firstChild);
  }

  function colorIncumbentSeats(visual,incumbents){
    const svg=visual?.querySelector('.ab-parliament-svg');
    if(!svg||!incumbents.length)return;
    const seats=[...svg.querySelectorAll('.ab-seat')];
    if(!seats.length)return;
    const fixed=seats.slice(Math.max(0,seats.length-incumbents.length));
    fixed.forEach((seat,index)=>{
      const senator=incumbents[index];if(!senator)return;
      seat.setAttribute('fill',color(senator.party));
      seat.setAttribute('fill-opacity','1');
      seat.dataset.abIncumbent='1';
      seat.dataset.abFinalParty=senator.party;
      seat.style.pointerEvents='none';
      let title=seat.querySelector('title');
      if(!title){title=document.createElementNS('http://www.w3.org/2000/svg','title');seat.appendChild(title);}
      title.textContent=`${senator.name} • ${senator.party} • ${senator.uf} • mandato vigente até 2031`;
    });
  }

  function updateSenateCenter(visual){
    const total=ufSelect.value==='BR'?81:3;
    const legacy=visual?.querySelector('.chamber-center-label');
    const svg=visual?.querySelector('.ab-parliament-svg');
    const count=svg?.querySelector('.ab-center-count')||legacy?.querySelector('strong');
    const label=svg?.querySelector('.ab-center-label')||legacy?.querySelector('span');
    if(count)count.textContent=String(total);
    if(label&&!label.querySelector?.('tspan'))label.textContent='COMPOSIÇÃO 2027';
  }

  function splitCenterLabels(){
    const mappings={
      'CADEIRAS PROJETADAS':['CADEIRAS','PROJETADAS'],
      'VAGAS DE 2026 PROJETADAS':['VAGAS DE 2026','PROJETADAS'],
      'VAGAS 2026':['VAGAS DE 2026','PROJETADAS'],
      'CADEIRAS SIMULADAS':['CADEIRAS','SIMULADAS'],
      'VAGAS SIMULADAS':['VAGAS','SIMULADAS'],
      'COMPOSIÇÃO 2027':['COMPOSIÇÃO','2027']
    };
    document.querySelectorAll('.ab-center-label').forEach(label=>{
      const raw=String(label.textContent||'').trim().replace(/\s+/g,' ');
      const lines=mappings[raw];
      if(!lines||label.querySelector('tspan'))return;
      const x=label.getAttribute('x')||'300';
      label.textContent='';
      lines.forEach((line,index)=>{
        const tspan=document.createElementNS('http://www.w3.org/2000/svg','tspan');
        tspan.setAttribute('x',x);
        tspan.setAttribute('dy',index===0?'-.15em':'1.18em');
        tspan.textContent=line;
        label.appendChild(tspan);
      });
    });
  }

  function incumbentPartyCounts(incumbents){
    const map=new Map();
    incumbents.forEach(item=>map.set(item.party,(map.get(item.party)||0)+1));
    return map;
  }

  function combinePartyComposition(incumbents){
    if(!incumbents.length||partyComposition.querySelector('.ab-combined-party-row'))return;
    const map=new Map();
    partyComposition.querySelectorAll('.party-row').forEach(row=>{
      const party=row.querySelector('.party-name')?.textContent?.trim()||'';
      const seats=Number(row.querySelector('.party-seats strong')?.textContent?.replace(/\D/g,'')||0);
      if(party)map.set(party,(map.get(party)||0)+seats);
    });
    for(const [party,seats] of incumbentPartyCounts(incumbents))map.set(party,(map.get(party)||0)+seats);
    const total=[...map.values()].reduce((a,b)=>a+b,0),max=Math.max(1,...map.values());
    const rows=[...map.entries()].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0],'pt-BR'));
    partyComposition.innerHTML=rows.map(([party,seats],index)=>`<div class="party-row ab-combined-party-row" style="animation-delay:${Math.min(index*20,220)}ms"><div class="party-main"><div class="party-name"><i class="party-dot" style="background:${color(party)}"></i>${esc(party)}</div><div class="party-bar"><i style="width:${seats/max*100}%;background:${color(party)}"></i></div></div><div class="party-seats"><strong>${seats}</strong><span>${total?`${(seats/total*100).toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1})}% da composição exibida`:'cadeiras'}</span></div></div>`).join('');
  }

  function combineSenateLegend(visual,incumbents){
    const legend=visual?.closest('.chamber-card')?.querySelector('.chamber-legend');
    if(!legend||!incumbents.length||legend.querySelector('.ab-combined-senate-legend'))return;
    const map=new Map();
    legend.querySelectorAll('.legend-item').forEach(item=>{
      const raw=String(item.textContent||'').trim().replace(/\s+/g,' ');
      const match=raw.match(/^(.*)\s+(\d+)$/);
      if(!match)return;
      const party=match[1].trim();
      if(/^(em disputa|mandato|senado não renovado)/i.test(party))return;
      map.set(party,(map.get(party)||0)+Number(match[2]||0));
    });
    for(const [party,seats] of incumbentPartyCounts(incumbents))map.set(party,(map.get(party)||0)+seats);
    const rows=[...map.entries()].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0],'pt-BR'));
    legend.innerHTML=rows.map(([party,seats],index)=>`<span class="legend-item ${index===0?'ab-combined-senate-legend':''}"><i class="legend-dot" style="background:${color(party)}"></i>${esc(party)} ${seats}</span>`).join('');
  }

  function appendIncumbentNames(incumbents){
    if(!incumbents.length||projectedList.querySelector('.ab-incumbent-card'))return;
    const cards=incumbents.map(item=>`<article class="projected-card ab-incumbent-card"><div class="rank-badge">${esc(item.uf)}</div><div class="projected-main"><strong>${esc(item.name)}</strong><span>${esc(item.party)} • mandato 2023–2031</span></div><div class="seat-status"><strong>MANDATO VIGENTE</strong><span>cadeira não está em disputa em 2026</span></div></article>`).join('');
    projectedList.insertAdjacentHTML('beforeend',cards);
    if(namesTitle&&!namesTitle.textContent.startsWith('Parlamentares do '))namesTitle.textContent='Eleitos em 2026 + mandatos vigentes';
  }

  function projectedSenateCount(visual){
    const raw=visual?.querySelector('.ab-center-count')?.textContent||visual?.querySelector('.chamber-center-label strong')?.textContent||'';
    const n=Number(String(raw).replace(/\D/g,''));
    return Number.isFinite(n)?n:0;
  }

  function updateSummary(incumbents,senateProjected){
    const cards=[...document.querySelectorAll('#seatSummary .summary-card')];
    const currentView=view();
    if(currentView==='senador'&&cards.length>=4){
      const total=ufSelect.value==='BR'?81:3;
      const fixed=incumbents.length;
      cards[0].querySelector('span')&&(cards[0].querySelector('span').textContent='CADEIRAS DO SENADO');
      cards[0].querySelector('strong')&&(cards[0].querySelector('strong').textContent=String(total));
      cards[1].querySelector('span')&&(cards[1].querySelector('span').textContent='ELEITOS EM 2026');
      cards[1].querySelector('strong')&&(cards[1].querySelector('strong').textContent=String(Math.max(0,total-fixed)));
      cards[2].querySelector('span')&&(cards[2].querySelector('span').textContent='MANDATOS ATÉ 2031');
      cards[2].querySelector('strong')&&(cards[2].querySelector('strong').textContent=String(fixed));
      return;
    }
    if(currentView==='congresso'&&cards.length>=4){
      const total=ufSelect.value==='BR'?81:3;
      const composed=Math.min(total,Math.max(0,senateProjected)+incumbents.length);
      cards[2].querySelector('span')&&(cards[2].querySelector('span').textContent='SENADO 2027');
      cards[2].querySelector('strong')&&(cards[2].querySelector('strong').textContent=`${composed}/${total}`);
    }
  }

  function apply(){
    const currentView=view(),stateScope=ufSelect.value!=='BR',incumbents=(currentView==='senador'||currentView==='congresso')?currentIncumbents():[];
    document.body.classList.toggle('ab-state-scope',stateScope);

    if(stateScope){
      if(currentView==='deputado-federal')addStateBackdrop($('chamberVisual'),513);
      else if(currentView==='senador')addStateBackdrop($('chamberVisual'),81);
      else if(currentView==='congresso'){
        addStateBackdrop($('chamberVisual'),513);
        addStateBackdrop($('secondaryChamberVisual'),81);
      }
    }

    const senateVisual=currentView==='senador'?$('chamberVisual'):currentView==='congresso'?$('secondaryChamberVisual'):null;
    const senateProjected=senateVisual?projectedSenateCount(senateVisual):0;

    if(currentView==='senador')colorIncumbentSeats($('chamberVisual'),incumbents);
    else if(currentView==='congresso')colorIncumbentSeats($('secondaryChamberVisual'),incumbents);

    if(incumbents.length){
      combinePartyComposition(incumbents);
      combineSenateLegend(senateVisual,incumbents);
      appendIncumbentNames(incumbents);
      updateSummary(incumbents,senateProjected);
      updateSenateCenter(senateVisual);
    }
    splitCenterLabels();
  }

  let timer=null;
  function schedule(delay=35){clearTimeout(timer);timer=setTimeout(apply,delay);}
  const observer=new MutationObserver(()=>schedule());
  observer.observe(document.body,{subtree:true,childList:true,characterData:true});
  ufSelect.addEventListener('change',()=>schedule(80));
  document.querySelector('.projection-controls')?.addEventListener('click',()=>schedule(80));
  schedule(500);
})();
