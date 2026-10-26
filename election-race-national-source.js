(()=>{
  'use strict';

  try{
    if(window.parent===window||!window.parent.location.pathname.startsWith('/ao-vivo'))return;
  }catch{return;}

  if(window.__apuraBrasilNationalRaceBar?.stable)return;

  const POLL_MS=5000;
  const state={payload:null,round:0,leftKey:'',rightKey:'',inFlight:false,timer:null,lastSignature:'',leader:null};
  const fmtVotes=new Intl.NumberFormat('pt-BR');
  const fmtPct=new Intl.NumberFormat('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
  const key=c=>`${String(c?.ballotName||c?.name||'').trim().toUpperCase()}|${String(c?.party||'').trim().toUpperCase()}`;

  window.__apuraBrasilNationalRaceBarLock=true;

  function currentRound(){
    const api=Number(window.ApuraBrasilRound?.get?.());
    if(api===1||api===2)return api;
    try{
      const saved=Number(localStorage.getItem('apurabrasil.round.2026'));
      if(saved===1||saved===2)return saved;
    }catch{}
    return 2;
  }

  function activeOffice(){
    return document.querySelector('.office-btn[data-office].active')?.dataset.office||'presidente';
  }

  function colorFor(candidate,side){
    const party=String(candidate?.party||'').toUpperCase();
    if(party==='PT')return '#ed1b2f';
    if(party==='PL')return '#2464f0';
    return side==='left'?'#2464f0':'#ed1b2f';
  }

  function choosePair(candidates){
    const list=(candidates||[])
      .filter(c=>Number.isFinite(Number(c?.votes))&&c?.party&&(c?.ballotName||c?.name))
      .slice()
      .sort((a,b)=>Number(b.votes||0)-Number(a.votes||0));
    if(list.length<2)return null;

    if(state.leftKey&&state.rightKey){
      const left=list.find(c=>key(c)===state.leftKey);
      const right=list.find(c=>key(c)===state.rightKey);
      if(left&&right)return {left,right};
    }

    state.leftKey=key(list[0]);
    state.rightKey=key(list[1]);
    return {left:list[0],right:list[1]};
  }

  function syncVisibility(){
    const national=activeOffice()==='presidente';
    const bar=document.getElementById('apuraElectionRaceBar');
    const host=bar?.parentElement;
    if(bar)bar.style.display=national?'':'none';
    if(host?.classList?.contains('broadcast-summary-strip'))host.classList.toggle('broadcast-summary-strip--with-race',national);
    return national;
  }

  function setText(node,value){
    if(node&&node.textContent!==value)node.textContent=value;
  }

  function setStyle(node,prop,value){
    if(node&&node.style[prop]!==value)node.style[prop]=value;
  }

  function setPhoto(box,candidate){
    if(!box)return;
    const photo=String(candidate?.photoUrl||'');
    const existing=box.querySelector('img');
    if(photo&&existing?.getAttribute('src')===photo)return;
    if(!photo){
      if(existing)box.replaceChildren();
      return;
    }
    const img=document.createElement('img');
    img.src=photo;
    img.alt=`Foto de ${candidate.ballotName||candidate.name||'candidato'}`;
    img.loading='eager';
    box.replaceChildren(img);
  }

  function pulseUpdate(bar,leader,leaderChanged){
    const fills=[bar.querySelector('[data-fill-left]'),bar.querySelector('[data-fill-right]')].filter(Boolean);
    for(const fill of fills){
      fill.classList.remove('updating');
      void fill.offsetWidth;
      fill.classList.add('updating');
    }
    if(!leaderChanged)return;
    const cross=bar.querySelector('[data-cross]');
    if(cross){cross.classList.remove('fire');void cross.offsetWidth;cross.classList.add('fire');}
    const badge=bar.querySelector('[data-leader]');
    const candidate=leader==='left'?state.currentLeft:state.currentRight;
    if(badge&&candidate){
      badge.className='ab-race-leader';
      badge.style.background=colorFor(candidate,leader);
      badge.textContent=`${candidate.ballotName||candidate.name||'CANDIDATO'} ASSUME A LIDERANÇA`;
      void badge.offsetWidth;
      badge.classList.add('show');
    }
  }

  function applyNational(force=false){
    if(!syncVisibility()||!state.payload)return;
    const bar=document.getElementById('apuraElectionRaceBar');
    if(!bar)return;
    const pair=choosePair(state.payload.candidates);
    if(!pair)return;

    const {left,right}=pair;
    const lv=Number(left.votes||0),rv=Number(right.votes||0),total=lv+rv;
    const leftWidth=total>0?lv/total*100:50;
    const rightWidth=100-leftWidth;
    const leftPct=Number(left.percentage||leftWidth);
    const rightPct=Number(right.percentage||rightWidth);
    const signature=[state.round,key(left),lv,leftPct,key(right),rv,rightPct,left.photoUrl||'',right.photoUrl||''].join('|');

    if(!force&&signature===state.lastSignature&&bar.dataset.resultScope==='BR')return;

    const leader=lv>rv?'left':rv>lv?'right':'tie';
    const leaderChanged=Boolean(state.leader&&state.leader!=='tie'&&leader!=='tie'&&leader!==state.leader);
    state.currentLeft=left;
    state.currentRight=right;

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
    state.lastSignature=signature;
    pulseUpdate(bar,leader,leaderChanged);
    state.leader=leader;
  }

  async function refresh(force=false){
    if(state.inFlight||document.visibilityState==='hidden')return;
    const round=currentRound();
    state.inFlight=true;
    try{
      const response=await fetch(`/api/results?year=2026&office=presidente&round=${round}`,{cache:'no-store'});
      if(!response.ok)return;
      const payload=await response.json();
      if(!payload?.available||String(payload.scope||'').toUpperCase()!=='BR'||!Array.isArray(payload.candidates))return;
      if(state.round!==round){
        state.leftKey='';
        state.rightKey='';
        state.lastSignature='';
        state.leader=null;
      }
      state.round=round;
      state.payload=payload;
      applyNational(force);
    }catch(error){
      console.warn('ApuraBrasil national race bar:',error?.message||error);
    }finally{
      state.inFlight=false;
    }
  }

  document.addEventListener('apura:racebar-ready',()=>applyNational(true));
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')refresh(true);});
  document.addEventListener('click',event=>{
    if(event.target.closest('.office-btn[data-office]')){
      setTimeout(()=>{syncVisibility();if(activeOffice()==='presidente')refresh(true);},0);
      return;
    }
    if(event.target.closest('#roundSelector [data-round]')){
      setTimeout(()=>refresh(true),0);
    }
  },true);

  refresh(true);
  state.timer=setInterval(()=>refresh(false),POLL_MS);
  window.__apuraBrasilNationalRaceBar={stable:true,locked:true,scope:'BR',office:'presidente',refresh,apply:()=>applyNational(true)};
})();