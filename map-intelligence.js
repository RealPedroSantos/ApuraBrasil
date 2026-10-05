(() => {
  'use strict';

  const map=document.getElementById('map');
  const stage=document.getElementById('mapStage');
  const tooltip=document.getElementById('mapTooltip');
  const candidateList=document.getElementById('candidateList');
  if(!map||!stage||!tooltip||!candidateList)return;

  const PARTY_COLORS={PL:'#165dff',PT:'#e31d2b',PSD:'#ef8d22',NOVO:'#e86e1c',MDB:'#3e9278',PSOL:'#d5b913',PDT:'#d34646',PSB:'#d5a51d',PP:'#3471bf','UNIÃO':'#207da5',REPUBLICANOS:'#587cca',AVANTE:'#7b1bd1','MISSÃO':'#6e58a0',PCB:'#8d2737',PSTU:'#b82d3d',UP:'#bd20c8',PCO:'#7a2530',DC:'#23847b'};
  const STATES={acre:'AC',alagoas:'AL',amapa:'AP',amazonas:'AM',bahia:'BA',ceara:'CE','distrito federal':'DF','espirito santo':'ES',goias:'GO',maranhao:'MA','mato grosso':'MT','mato grosso do sul':'MS','minas gerais':'MG',para:'PA',paraiba:'PB,',parana:'PR',pernambuco:'PE',piaui:'PI','rio de janeiro':'RJ','rio grande do norte':'RN','rio grande do sul':'RS',rondonia:'RO',roraima:'RR','santa catarina':'SC','sao paulo':'SP',sergipe:'SE',tocantins:'TO'};
  STATES.paraiba='PB';

  let mode='leaders';
  let forceCandidate=null;
  let generation=0;
  let timer=null;
  const cache=new Map();

  const panel=document.createElement('div');
  panel.className='map-intel-panel';
  panel.innerHTML='<div class="map-intel-controls"><button class="map-intel-btn active" data-intel-mode="leaders">Líderes</button><button class="map-intel-btn" data-intel-mode="force">Força do candidato</button></div><div class="map-intel-status">Preparando mapa inteligente…</div><div class="map-intel-legend"></div>';
  stage.appendChild(panel);
  const status=panel.querySelector('.map-intel-status');
  const legend=panel.querySelector('.map-intel-legend');
  const leaderBtn=panel.querySelector('[data-intel-mode="leaders"]');
  const forceBtn=panel.querySelector('[data-intel-mode="force"]');

  const norm=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  const pct=v=>`${Number(v||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})}%`;
  const office=()=>document.querySelector('.office-btn.active[data-office]')?.dataset.office||'presidente';
  const partyColor=p=>{
    const key=String(p||'').toUpperCase();
    if(PARTY_COLORS[key])return PARTY_COLORS[key];
    let h=0;for(const c of key)h=(h*31+c.charCodeAt(0))%360;
    return `hsl(${h||205} 62% 46%)`;
  };

  function hexMix(hex,amount){
    if(!/^#[0-9a-f]{6}$/i.test(hex))return hex;
    const n=parseInt(hex.slice(1),16),r=(n>>16)&255,g=(n>>8)&255,b=n&255;
    const bg=[226,229,228];
    const mix=(c,i)=>Math.round(bg[i]+(c-bg[i])*Math.max(0,Math.min(1,amount)));
    return `rgb(${mix(r,0)},${mix(g,1)},${mix(b,2)})`;
  }

  function level(){
    const region=map.querySelector('.geo-region');
    const len=String(region?.dataset.code||'').length;
    if(!region)return 'none';
    if(len<=2)return 'states';
    if(len<=7)return 'municipalities';
    return 'districts';
  }

  function currentUf(){
    const texts=[...document.querySelectorAll('#breadcrumb button,#breadcrumb span')].map(x=>norm(x.textContent));
    for(const t of texts){if(STATES[t])return STATES[t];}
    const title=norm(document.getElementById('mapTitle')?.textContent);
    return STATES[title]||'';
  }

  async function fetchResult({officeName,uf,municipalityName}){
    const key=[officeName,uf||'',norm(municipalityName||'')].join('|');
    const hit=cache.get(key);
    if(hit&&Date.now()-hit.at<20000)return hit.data;
    const params=new URLSearchParams({action:'result',office:officeName});
    if(uf)params.set('uf',uf.toLowerCase());
    if(municipalityName)params.set('municipalityName',municipalityName);
    const response=await fetch(`/api/results?${params}`,{headers:{Accept:'application/json'}});
    const data=await response.json().catch(()=>({}));
    if(!response.ok||data.ok===false)throw new Error(data.error||`HTTP ${response.status}`);
    cache.set(key,{at:Date.now(),data});
    return data;
  }

  function findForceCandidate(result){
    if(!forceCandidate)return null;
    const list=result?.candidates||[];
    return list.find(c=>norm(c.ballotName||c.name)===forceCandidate.name&&norm(c.party)===forceCandidate.party)
      ||list.find(c=>norm(c.ballotName||c.name)===forceCandidate.name)
      ||null;
  }

  function summary(result,currentLevel,currentOffice){
    const candidates=(result?.candidates||[]).slice().sort((a,b)=>Number(b.votes||0)-Number(a.votes||0));
    const completion=Math.max(0,Math.min(100,Number(result?.sections?.percentage||0)));
    if(mode==='force'&&forceCandidate){
      const c=findForceCandidate(result);
      if(!c)return {fill:'#d9dddc',label:'Sem votos para o candidato selecionado',key:'sem dados',color:'#d9dddc'};
      const strength=Math.max(.18,Math.min(1,.18+(Number(c.percentage||0)/60)*.82));
      const certainty=.52+.48*(completion/100);
      const base=partyColor(c.party);
      return {fill:hexMix(base,strength*certainty),key:`${c.ballotName||c.name}|${c.party}`,legend:c.ballotName||c.name,color:base,leader:c,runner:null,margin:null,completion,force:true};
    }
    const leader=candidates[0],runner=candidates[1];
    if(!leader)return {fill:'#d9dddc',label:'Sem dados',key:'sem dados',color:'#d9dddc'};
    const margin=Math.max(0,Number(leader.percentage||0)-Number(runner?.percentage||0));
    const strength=Math.max(.28,Math.min(1,.28+(margin/25)*.72));
    const certainty=.52+.48*(completion/100);
    const base=partyColor(leader.party);
    const legislative=currentOffice==='senador'||currentOffice.startsWith('deputado');
    const legendLabel=(currentLevel==='states'&&currentOffice!=='presidente')?(leader.party||leader.ballotName):leader.ballotName||leader.name;
    return {fill:hexMix(base,strength*certainty),key:`${legendLabel}|${leader.party}`,legend:legendLabel,color:base,leader,runner,margin,completion,force:false,legislative};
  }

  function detailHtml(area,s){
    if(!s?.leader)return `<span class="intel-area">${area}</span><span class="intel-detail">Sem dados eleitorais disponíveis.</span>`;
    if(s.force){
      return `<span class="intel-area">${area}</span><span class="intel-leader">${s.leader.ballotName||s.leader.name} • ${pct(s.leader.percentage)}</span><span class="intel-detail">${s.leader.party||'—'} • ${Number(s.leader.votes||0).toLocaleString('pt-BR')} votos • ${pct(s.completion)} apurado</span>`;
    }
    const runner=s.runner?` • 2º: ${s.runner.ballotName||s.runner.name} ${pct(s.runner.percentage)}`:'';
    const prefix=s.legislative?'Mais votado':'Líder';
    return `<span class="intel-area">${area}</span><span class="intel-leader">${prefix}: ${s.leader.ballotName||s.leader.name} • ${pct(s.leader.percentage)}</span><span class="intel-detail">${s.leader.party||'—'}${runner}${s.margin!=null?` • vantagem ${s.margin.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})} p.p.`:''} • ${pct(s.completion)} apurado</span>`;
  }

  function paint(region,s){
    region.classList.remove('map-intel-loading');
    region.classList.add('map-intelligent');
    region.style.fill=s.fill;
    region.dataset.intelHtml=detailHtml(region.dataset.name||'Área',s);
    if(!region.dataset.intelBound){
      const update=()=>{
        if(!region.dataset.intelHtml)return;
        requestAnimationFrame(()=>{tooltip.innerHTML=region.dataset.intelHtml;tooltip.classList.add('intel-tooltip');});
      };
      region.addEventListener('pointerenter',update);
      region.addEventListener('pointermove',update);
      region.addEventListener('focus',update);
      region.dataset.intelBound='1';
    }
  }

  function neutralize(message){
    map.querySelectorAll('.geo-region').forEach(r=>{r.style.fill='';r.classList.remove('map-intelligent','map-intel-loading');delete r.dataset.intelHtml;});
    legend.innerHTML='';
    status.textContent=message;
  }

  function renderLegend(entries){
    const items=[...entries.values()].slice(0,8);
    legend.innerHTML=items.map(x=>`<span class="map-intel-item"><i class="map-intel-swatch" style="background:${x.color}"></i>${String(x.label).replace(/[&<>]/g,'')}</span>`).join('')+(entries.size>8?`<span class="map-intel-item">+${entries.size-8}</span>`:'');
  }

  function updateButtons(){
    leaderBtn.classList.toggle('active',mode==='leaders');
    forceBtn.classList.toggle('active',mode==='force');
    document.querySelectorAll('.candidate-card').forEach(card=>{
      const name=norm(card.querySelector('.candidate-name')?.textContent);
      const party=norm(card.querySelector('.party-chip')?.textContent);
      card.classList.toggle('map-force-selected',!!forceCandidate&&name===forceCandidate.name&&party===forceCandidate.party);
    });
  }

  async function colorize(){
    const myGen=++generation;
    const regions=[...map.querySelectorAll('.geo-region')];
    if(!regions.length)return;
    const currentLevel=level(),currentOffice=office(),uf=currentUf();
    updateButtons();

    if(currentLevel==='districts'){
      neutralize('Distritos permanecem neutros até a associação oficial entre seções/locais de votação e distritos.');
      leaderBtn.disabled=true;forceBtn.disabled=true;return;
    }
    leaderBtn.disabled=false;forceBtn.disabled=false;

    if(mode==='force'&&!forceCandidate){
      neutralize('Clique em um candidato no painel da direita para ativar o mapa de força eleitoral.');
      return;
    }
    if(currentLevel==='states'&&currentOffice.startsWith('deputado')){
      neutralize('Abra uma UF e clique em um candidato para visualizar a força eleitoral por município.');
      return;
    }
    if(currentLevel==='municipalities'&&!uf){
      neutralize('Não foi possível identificar a UF deste mapa.');return;
    }

    regions.forEach(r=>{r.classList.add('map-intel-loading');r.classList.remove('map-intelligent');});
    const entries=new Map();
    let cursor=0,done=0,errors=0;
    const total=regions.length;
    status.textContent=`Colorindo mapa • 0/${total}`;

    async function worker(){
      while(cursor<regions.length){
        const index=cursor++,region=regions[index];
        if(myGen!==generation)return;
        const area=region.dataset.name||'';
        try{
          let result;
          if(currentLevel==='states'){
            const stateUf=STATES[norm(area)];
            if(!stateUf)throw new Error('UF não identificada');
            result=await fetchResult({officeName:currentOffice,uf:stateUf});
          }else{
            result=await fetchResult({officeName:currentOffice,uf,municipalityName:area});
          }
          if(myGen!==generation)return;
          const s=summary(result,currentLevel,currentOffice);
          paint(region,s);
          if(s.legend&&!entries.has(s.key))entries.set(s.key,{label:s.legend,color:s.color});
        }catch{errors++;region.classList.remove('map-intel-loading');region.style.fill='#d9dddc';}
        done++;
        if(myGen!==generation)return;
        status.textContent=`${mode==='force'?'Força eleitoral':'Mapa de líderes'} • ${done}/${total}${errors?` • ${errors} sem dados`:''}`;
        if(done===total||done%5===0)renderLegend(entries);
      }
    }
    await Promise.all(Array.from({length:Math.min(currentLevel==='states'?6:8,total)},()=>worker()));
    if(myGen!==generation)return;
    renderLegend(entries);
    const legislative=currentOffice==='senador'||currentOffice.startsWith('deputado');
    status.textContent=`${mode==='force'?'Força do candidato':(legislative?'Mais votado por localidade':'Líder por localidade')} • ${done-errors}/${total} áreas coloridas${legislative&&mode==='leaders'?' • não indica eleição':''}`;
  }

  function schedule(delay=180){clearTimeout(timer);timer=setTimeout(colorize,delay);}

  panel.addEventListener('click',e=>{
    const btn=e.target.closest('[data-intel-mode]');if(!btn)return;
    mode=btn.dataset.intelMode;
    updateButtons();schedule(0);
  });

  candidateList.addEventListener('click',e=>{
    const card=e.target.closest('.candidate-card');if(!card)return;
    const name=norm(card.querySelector('.candidate-name')?.textContent);
    const party=norm(card.querySelector('.party-chip')?.textContent);
    if(!name)return;
    forceCandidate={name,party,label:card.querySelector('.candidate-name')?.textContent?.trim()||'Candidato'};
    mode='force';updateButtons();schedule(0);
  });

  document.querySelector('.office-nav')?.addEventListener('click',e=>{
    if(!e.target.closest('[data-office]'))return;
    forceCandidate=null;mode='leaders';setTimeout(()=>schedule(0),120);
  });
  document.getElementById('refreshButton')?.addEventListener('click',()=>{cache.clear();setTimeout(()=>schedule(0),180);});

  const mapObserver=new MutationObserver(()=>schedule());
  mapObserver.observe(map,{childList:true,subtree:false});
  const candidateObserver=new MutationObserver(()=>{updateButtons();if(mode==='leaders')schedule(250);});
  candidateObserver.observe(candidateList,{childList:true,subtree:true});
  schedule(700);
})();
