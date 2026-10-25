(()=>{
  'use strict';

  try{
    if(window.parent===window||!window.parent.location.pathname.startsWith('/ao-vivo')) return;
  }catch{return;}

  const POLL_MS=5000;
  const state={payload:null,leftKey:'',rightKey:'',round:0,inFlight:false,timer:null,scheduled:false};
  const fmtVotes=new Intl.NumberFormat('pt-BR');
  const fmtPct=new Intl.NumberFormat('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
  const key=c=>`${String(c?.ballotName||c?.name||'').trim().toUpperCase()}|${String(c?.party||'').trim().toUpperCase()}`;

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
    const list=(candidates||[]).filter(c=>Number(c?.votes||0)>=0&&c?.party&&c?.ballotName).slice().sort((a,b)=>Number(b.votes||0)-Number(a.votes||0));
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

  function applyNational(){
    state.scheduled=false;
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
    queueMicrotask(applyNational);
  }

  async function refresh(){
    if(state.inFlight) return;
    const round=currentRound();
    state.inFlight=true;
    try{
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

  const observer=new MutationObserver(()=>scheduleApply());
  observer.observe(document.documentElement,{childList:true,subtree:true,characterData:true});

  document.addEventListener('click',event=>{
    if(event.target.closest('.office-btn[data-office],#roundSelector [data-round]')){
      setTimeout(()=>{syncVisibility();refresh();},0);
    }
  },true);

  refresh();
  state.timer=setInterval(refresh,POLL_MS);
  window.__apuraBrasilNationalRaceBar={refresh,apply:applyNational};
})();
