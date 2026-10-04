(() => {
  'use strict';
  const UFS=[['AC','Acre'],['AL','Alagoas'],['AP','Amapá'],['AM','Amazonas'],['BA','Bahia'],['CE','Ceará'],['DF','Distrito Federal'],['ES','Espírito Santo'],['GO','Goiás'],['MA','Maranhão'],['MT','Mato Grosso'],['MS','Mato Grosso do Sul'],['MG','Minas Gerais'],['PA','Pará'],['PB','Paraíba'],['PR','Paraná'],['PE','Pernambuco'],['PI','Piauí'],['RJ','Rio de Janeiro'],['RN','Rio Grande do Norte'],['RS','Rio Grande do Sul'],['RO','Rondônia'],['RR','Roraima'],['SC','Santa Catarina'],['SP','São Paulo'],['SE','Sergipe'],['TO','Tocantins']];
  const COLORS={PL:'#165dff',PT:'#e31d2b',PSD:'#ef8d22',NOVO:'#e86e1c',MDB:'#3e9278',PSOL:'#d5b913',PDT:'#d34646',PSB:'#d5a51d',PP:'#3471bf','UNIÃO':'#207da5',REPUBLICANOS:'#587cca',AVANTE:'#7b1bd1'};
  let office='deputado-federal',loading=false;
  const ufSelect=document.getElementById('ufSelect'),partyComposition=document.getElementById('partyComposition'),projectedList=document.getElementById('projectedList'),seatSummary=document.getElementById('seatSummary'),compositionTitle=document.getElementById('compositionTitle'),projectionProgress=document.getElementById('projectionProgress');
  UFS.forEach(([uf,name])=>{const option=document.createElement('option');option.value=uf;option.textContent=`${uf} — ${name}`;ufSelect.appendChild(option);});
  const fmt=v=>new Intl.NumberFormat('pt-BR').format(Number(v||0));
  const esc=v=>String(v??'').replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]));
  function color(party){const key=String(party||'').toUpperCase();if(COLORS[key])return COLORS[key];let h=0;for(const c of key)h=(h*31+c.charCodeAt(0))%360;return `hsl(${h||205} 60% 45%)`;}
  async function api(url){const r=await fetch(url,{headers:{Accept:'application/json'}});const p=await r.json().catch(()=>({}));if(!r.ok||p.ok===false)throw new Error(p.detail||p.error||`HTTP ${r.status}`);return p;}
  async function resultFor(uf){return api(`/api/results?action=result&office=${encodeURIComponent(office)}&uf=${uf.toLowerCase()}`);}
  function projectDeputies(result,uf){const winners=[];for(const group of result.groups||[]){const seats=Math.max(0,Number(group.seats||0));if(!seats)continue;const candidates=(result.candidates||[]).filter(c=>String(c.coalition||'')===String(group.name||'')).sort((a,b)=>Number(b.votes||0)-Number(a.votes||0));candidates.slice(0,seats).forEach((candidate,index)=>winners.push({...candidate,uf,allocation:group.name||candidate.party,seatInGroup:index+1,official:String(candidate.electedFlag||'').toLowerCase()==='s'}));}return winners;}
  function projectSenate(result,uf){return (result.candidates||[]).slice().sort((a,b)=>Number(b.votes||0)-Number(a.votes||0)).slice(0,2).map((candidate,index)=>({...candidate,uf,allocation:candidate.party,seatInGroup:index+1,official:String(candidate.electedFlag||'').toLowerCase()==='s'}));}
  function projectedFromResult(result,uf){return office==='senador'?projectSenate(result,uf):projectDeputies(result,uf);}
  function titleText(uf){const label=office==='deputado-federal'?'Câmara Federal':office==='senador'?'Senado':'Assembleia Legislativa';return `${label} • ${uf==='BR'?'Brasil':uf}`;}
  function render(results,requestedCount){
    const winners=[];let totalSections=0,totalized=0,officialCount=0;
    results.forEach(({uf,result})=>{winners.push(...projectedFromResult(result,uf));totalSections+=Number(result.sections?.total||0);totalized+=Number(result.sections?.totalized||0);});
    officialCount=winners.filter(w=>w.official).length;
    const pct=totalSections?totalized/totalSections*100:0;
    const byParty=new Map();winners.forEach(w=>byParty.set(w.party,(byParty.get(w.party)||0)+1));
    const parties=[...byParty.entries()].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0],'pt-BR'));
    const maxSeats=Math.max(1,...parties.map(([,seats])=>seats));
    seatSummary.innerHTML=`<div class="summary-card"><span>CADEIRAS PROJETADAS</span><strong>${fmt(winners.length)}</strong></div><div class="summary-card"><span>JÁ MARCADAS PELO TSE</span><strong>${fmt(officialCount)}</strong></div><div class="summary-card"><span>SEÇÕES TOTALIZADAS</span><strong>${pct.toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1})}%</strong></div>`;
    partyComposition.innerHTML=parties.length?parties.map(([party,seats],i)=>`<div class="party-row" style="animation-delay:${Math.min(i*25,250)}ms"><div class="party-main"><div class="party-name"><i class="party-dot" style="background:${color(party)}"></i>${esc(party||'Sem sigla')}</div><div class="party-bar"><i style="width:${seats/maxSeats*100}%;background:${color(party)}"></i></div></div><div class="party-seats"><strong>${fmt(seats)}</strong><span>cadeiras</span></div></div>`).join(''):'<div class="summary-card">Ainda não há vagas projetadas pelo arquivo parcial do TSE.</div>';
    winners.sort((a,b)=>String(a.uf).localeCompare(String(b.uf))||Number(b.votes||0)-Number(a.votes||0));
    projectedList.innerHTML=winners.length?winners.map((c,i)=>`<article class="projected-card" style="animation-delay:${Math.min(i*18,260)}ms"><div class="rank-badge">${esc(c.uf)}</div><div class="projected-main"><strong>${esc(c.ballotName||c.name)}</strong><span>${esc(c.party||'—')} • ${fmt(c.votes)} votos • ${esc(c.allocation||'')}</span></div><div class="seat-status"><strong class="${c.official?'official':'projected'}">${c.official?'OFICIAL':'PROJEÇÃO'}</strong><span>${c.official?'marcado eleito pelo TSE':'se terminasse agora'}</span></div></article>`).join(''):'<div class="summary-card">Nenhum nome em faixa neste momento.</div>';
    projectionProgress.textContent=`${results.length}/${requestedCount} UFs carregadas`;
  }
  async function loadProjection(){
    if(loading)return;loading=true;const uf=ufSelect.value;compositionTitle.textContent=titleText(uf);partyComposition.innerHTML='<div class="summary-card">Calculando composição...</div>';projectedList.innerHTML='<div class="summary-card">Carregando candidatos...</div>';seatSummary.innerHTML='';
    if(office==='deputado-estadual'&&uf==='BR'){projectionProgress.textContent='Selecione uma UF';partyComposition.innerHTML='<div class="summary-card">A composição de Assembleia é estadual. Selecione uma UF.</div>';projectedList.innerHTML='';loading=false;return;}
    const targets=uf==='BR'?UFS.map(([code])=>code):[uf];projectionProgress.textContent=`0/${targets.length} UFs`;
    const settled=await Promise.allSettled(targets.map(code=>resultFor(code).then(result=>({uf:code,result}))));
    const ok=settled.filter(x=>x.status==='fulfilled').map(x=>x.value);render(ok,targets.length);loading=false;
  }
  document.querySelectorAll('.mode').forEach(button=>button.addEventListener('click',()=>{document.querySelectorAll('.mode').forEach(b=>b.classList.remove('active'));button.classList.add('active');office=button.dataset.office;loadProjection();}));
  ufSelect.addEventListener('change',loadProjection);document.getElementById('refreshProjection').addEventListener('click',loadProjection);
  function tick(){document.getElementById('projectionClock').textContent=new Intl.DateTimeFormat('pt-BR',{hour:'2-digit',minute:'2-digit',second:'2-digit'}).format(new Date());}tick();setInterval(tick,1000);setInterval(()=>{if(!document.hidden)loadProjection();},30000);loadProjection();
})();
