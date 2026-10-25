(()=>{
  'use strict';

  try{
    if(window.parent===window||!window.parent.location.pathname.startsWith('/ao-vivo')) return;
  }catch{return;}

  const POLL_MS=5000;
  const ENFORCE_MS=300;
  const state={
    payload:null,
    leftKey:'',
    rightKey:'',
    round:0,
    inFlight:false,
    timer:null,
    enforceTimer:null,
    scheduled:false,
    frame:0,
    barObserver:null,
    barTarget:null
  };
  const fmtVotes=new Intl.NumberFormat('pt-BR');
  const fmtPct=new Intl.NumberFormat('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
  const key=c=>`${String(c?.ballotName||c?.name||'').trim().toUpperCase()}|${String(c?.party||'').trim().toUpperCase()}`;

  /* Sinal global: a barra do /ao-vivo é controlada exclusivamente pelo resultado nacional. */
  window.__apuraBrasilNationalRaceBarLock=true;

  function currentRound(){
    const api=Number(window.ApuraBrasilRound?.get?.());
    if(api===1||api===2) return api;
    try{
      const saved=Number(localStorage.getItem('apurabrasil.round.2026'));
      if(saved===1||saved===2) return saved;
    }catch{}
    return 2;
  }

  function activeOffice(){
    return document.querySelector('.office-btn[data-office].active')?.dataset.office||'presidente';
  }

  function colorFor(candidate,side){
    const party=String(candidate?.party||'').toUpperCase();
    if(party==='PT') return '#ed1b2f';
    if(party==='PL') return '#2464f0';
    return side==='left'?'#2464f0':'#ed1b2f';
  }

  function setText(node,value){
    if(node&&node.textContent!==value) node.textContent=value;
  }

  function setStyle(node,prop,value){
    if(node&&node.style[prop]!==value) node.style[prop]=value;
  }

  function setPhoto(box,candidate){
    if(!box) return;
    const photo=candidate?.photoUrl||'';
    const existing=box.querySelector('img');
    if(photo&&existing?.src===photo) return;
    box.replaceChildren();
    if(!photo) return;
    const img=document.createElement('img');
    img.src=photo;
    img.alt=`Foto de ${candidate.ballotName||candidate.name||'candidato'}`;
    img.loading='eager';
    box.appendChild(img);
  }

  function choosePair(candidates,bar){
    const list=(candidates||[])
      .filter(c=>Number(c?.votes||0)>=0&&c?.party&&c?.ballotName)
      .slice()
      .sort((a,b)=>Number(b.votes||0)-Number(a.votes||0));
    if(list.length<2) return null;

    if(state.leftKey&&state.rightKey){
      const left=list.find(c=>key(c)===state.leftKey);
      const right=list.find(c=>key(c)===state.rightKey);
      if(left&&right) return {left,right};
    }

    const leftName=bar?.querySelector('[data-name-left]')?.textContent?.trim().toUpperCase();
    const rightName=bar?.querySelector('[data-name-right]')?.textContent?.trim().toUpperCase();
    let left=list.find(c=>String(c.ballotName||c.name||'').trim().toUpperCase()===leftName);
    let right=list.find(c=>String(c.ballotName||c.name||'').trim().toUpperCase()===rightName&&c!==left);
    if(!left||!right){ left=list[0]; right=list[1]; }

    state.leftKey=key(left);
    state.rightKey=key(right);
    return {left,right};
  }

  function syncVisibility(){
    const bar=document.getElementById('apuraElectionRaceBar');
    const host=bar?.parentElement;
    const national=activeOffice()==='presidente';
    if(bar) bar.style.display=national?'':'none';
    if(host?.classList?.contains('broadcast-summary-strip')){
      host.classList.toggle('broadcast-summary-strip--with-race',national);
    }
    return national;
  }

  function ensureBarObserver(){
    const bar=document.getElementById('apuraElectionRaceBar');
    if(!bar||state.barTarget===bar) return;
    state.barObserver?.disconnect();
    state.barTarget=bar;
    state.barObserver=new MutationObserver(()=>scheduleApply());
    state.barObserver.observe(bar,{
      subtree:true,
      childList:true,
      characterData:true,
      attributes:true,
      attributeFilter:['style','src','class']
    });
  }

  function applyNational(){
    state.scheduled=false;
    ensureBarObserver();
    if(!syncVisibility()||!state.payload) return;
    const bar=document.getElementById('apuraElectionRaceBar');
    if(!bar) return;
    const pair=choosePair(state.payload.candidates,bar);
    if(!pair) return;

    const {left,right}=pair;
    const lv=Number(left.votes||0),rv=Number(right.votes||0),total=lv+rv;
    const leftWidth=total>0?lv/total*100:50;
    const rightWidth=100-leftWidth;
    const leftPct=Number(left.percentage||0);
    const rightPct=Number(right.percentage||0);

    setPhoto(bar.querySelector('[data-photo-left]'),left);
    setPhoto(bar.querySelector('[data-photo-right]'),right);
    setText(bar.querySelector('[data-name-left]'),left.ballotName||left.name||'');
    setText(bar.querySelector('[data-name-right]'),right.ballotName||right.name||'');
    setText(bar.querySelector('[data-party-left]'),left.party||'');
    setText(bar.querySelector('[data-party-right]'),right.party||'');
    setStyle(bar.querySelector('[data-party-left]'),'background',colorFor(left,'left'));
    setStyle(bar.querySelector('[data-party-right]'),'background',colorFor(right,'right'));
    setStyle(bar.querySelector('[data-fill-left]'),'background',colorFor(left,'left'));
    setStyle(bar.querySelector('[data-fill-right]'),'background',colorFor(right,'right'));
    setStyle(bar.querySelector('[data-fill-left]'),'width',`${leftWidth}%`);
    setStyle(bar.querySelector('[data-fill-right]'),'width',`${rightWidth}%`);
    setText(bar.querySelector('[data-pct-left]'),fmtPct.format(leftPct));
    setText(bar.querySelector('[data-pct-right]'),fmtPct.format(rightPct));
    setText(bar.querySelector('[data-votes-left]'),fmtVotes.format(lv));
    setText(bar.querySelector('[data-votes-right]'),fmtVotes.format(rv));
    setText(bar.querySelector('[data-diff]'),fmtVotes.format(Math.abs(lv-rv)));
    bar.dataset.resultScope='BR';
    bar.dataset.resultOffice='presidente';
    bar.dataset.resultRound=String(state.round||currentRound());
  }

  function scheduleApply(){
    if(state.scheduled) return;
    state.scheduled=true;
    if(state.frame) cancelAnimationFrame(state.frame);
    /*
      Executa depois das rotinas locais da barra. Se um clique no mapa tentar
      reaplicar UF/município, o snapshot BR volta no quadro imediatamente seguinte.
    */
    state.frame=requestAnimationFrame(()=>{
      state.frame=requestAnimationFrame(()=>{
        state.frame=0;
        applyNational();
      });
    });
  }

  async function refresh(){
    if(state.inFlight) return;
    const round=currentRound();
    state.inFlight=true;
    try{
      /* Sem UF, município, zona ou seção: esta consulta é sempre Brasil. */
      const response=await fetch(`/api/results?year=2026&office=presidente&round=${round}`,{cache:'no-store'});
      if(!response.ok) return;
      const payload=await response.json();
      if(!payload?.available||String(payload.scope||'').toUpperCase()!=='BR'||!Array.isArray(payload.candidates)) return;
      if(state.round!==round){
        state.leftKey='';
        state.rightKey='';
      }
      state.round=round;
      state.payload=payload;
      scheduleApply();
    }catch(error){
      console.warn('ApuraBrasil national race bar:',error?.message||error);
    }finally{
      state.inFlight=false;
    }
  }

  /* Mudanças no restante da tela podem recriar/mover a barra. Nunca usamos esses dados locais. */
  const pageObserver=new MutationObserver(()=>{
    ensureBarObserver();
    scheduleApply();
  });
  pageObserver.observe(document.documentElement,{childList:true,subtree:true});

  document.addEventListener('click',event=>{
    /* Qualquer navegação no mapa/localidade apenas força novamente o snapshot BR. */
    if(event.target.closest('.office-btn[data-office],#roundSelector [data-round],svg,[data-uf],[data-state],[data-region],.map-wrap,.map-panel')){
      setTimeout(scheduleApply,0);
      setTimeout(scheduleApply,80);
      setTimeout(scheduleApply,250);
      if(event.target.closest('.office-btn[data-office],#roundSelector [data-round]')){
        setTimeout(()=>{syncVisibility();refresh();},0);
      }
    }
  },true);

  refresh();
  ensureBarObserver();
  state.timer=setInterval(refresh,POLL_MS);
  /* Guarda adicional contra qualquer atualização local tardia/assíncrona. */
  state.enforceTimer=setInterval(()=>{
    if(state.payload&&activeOffice()==='presidente') applyNational();
  },ENFORCE_MS);

  window.__apuraBrasilNationalRaceBar={
    locked:true,
    scope:'BR',
    office:'presidente',
    refresh,
    apply:applyNational
  };
})();