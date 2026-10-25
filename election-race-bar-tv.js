(()=>{
  'use strict';

  const frame=document.getElementById('electionFrame');
  if(!frame)return;

  const state={
    leftKey:null,
    rightKey:null,
    leftPct:50,
    rightPct:50,
    leftVotes:0,
    rightVotes:0,
    leader:null,
    rafs:new Set(),
    observer:null,
    interval:null,
    scheduled:false
  };

  const fmtVotes=new Intl.NumberFormat('pt-BR');
  const fmtPct=new Intl.NumberFormat('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});

  const text=(node)=>node?.textContent?.trim()||'';
  const candidateKey=(name,party)=>`${String(name||'').trim().toUpperCase()}|${String(party||'').trim().toUpperCase()}`;

  function parseVotes(value){
    const digits=String(value||'').replace(/\D/g,'');
    const number=Number(digits||0);
    return Number.isFinite(number)?number:0;
  }

  function parsePct(value){
    const raw=String(value||'').replace('%','').trim();
    const normalized=raw.includes(',')?raw.replace(/\./g,'').replace(',','.'):raw;
    const number=Number(normalized);
    return Number.isFinite(number)?number:0;
  }

  function initials(name){
    return String(name||'?').split(/\s+/).filter(Boolean).slice(0,2).map(word=>word[0]).join('').toUpperCase();
  }

  function readCandidates(doc){
    const cards=[...doc.querySelectorAll('#candidateList .candidate-card,.candidate-list .candidate-card')];
    return cards.map(card=>{
      const name=text(card.querySelector('.candidate-name'))||'Candidato';
      const party=text(card.querySelector('.party-chip'))||'—';
      const score=card.querySelector('.candidate-score');
      const votes=parseVotes(text(score?.querySelector('small'))||text(card.querySelector('.candidate-bar span')));
      const percentage=parsePct(text(score?.querySelector('strong')));
      const photo=card.querySelector('.candidate-avatar img')?.src||'';
      const partyChip=card.querySelector('.party-chip');
      const bar=card.querySelector('.candidate-bar i');
      const color=(partyChip?.style?.backgroundColor||bar?.style?.backgroundColor||getComputedStyle(partyChip||card).backgroundColor||'#1d168d').trim();
      return {key:candidateKey(name,party),name,party,votes,percentage,photo,color};
    }).filter(item=>item.name);
  }

  function choosePair(candidates){
    if(candidates.length<2)return null;
    if(state.leftKey&&state.rightKey){
      const left=candidates.find(item=>item.key===state.leftKey);
      const right=candidates.find(item=>item.key===state.rightKey);
      if(left&&right)return {left,right,reset:false};
    }
    const left=candidates[0];
    const right=candidates[1];
    state.leftKey=left.key;
    state.rightKey=right.key;
    state.leftPct=50;
    state.rightPct=50;
    state.leftVotes=0;
    state.rightVotes=0;
    state.leader=null;
    return {left,right,reset:true};
  }

  function installStyle(doc){
    if(doc.getElementById('apuraElectionRaceBarStyle'))return;
    const style=doc.createElement('style');
    style.id='apuraElectionRaceBarStyle';
    style.textContent=`
      .ab-race-tv{position:relative;width:100%;aspect-ratio:9.6/1;min-height:68px;max-height:102px;margin:2px 0 5px;overflow:hidden;background:#f7f8fa;border:1px solid #cfd4dc;border-radius:10px;font-family:Inter,ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif;isolation:isolate}
      .ab-race-tv *{box-sizing:border-box}
      .ab-race-photo{position:absolute;top:5%;bottom:5%;width:9.1%;z-index:12;overflow:hidden;background:#fff;border:1px solid #aeb7c7;border-radius:9px}
      .ab-race-photo.left{left:.7%}.ab-race-photo.right{right:.7%}
      .ab-race-photo img{width:100%;height:100%;display:block;object-fit:cover;object-position:center top}
      .ab-race-fallback{width:100%;height:100%;display:grid;place-items:center;background:#e8ecf1;color:#596273;font-size:clamp(12px,1.3vw,22px);font-weight:950}
      .ab-race-head{position:absolute;top:4%;height:19%;z-index:11;display:flex;align-items:center;gap:5px;color:#4c5262;font-size:clamp(8px,.82vw,15px);font-weight:950;line-height:1;white-space:nowrap;overflow:hidden;max-width:36%}
      .ab-race-head.left{left:10.7%}.ab-race-head.right{right:10.7%;justify-content:flex-end;text-align:right}
      .ab-race-name{overflow:hidden;text-overflow:ellipsis}
      .ab-race-party{flex:none;padding:2px 5px;border-radius:5px;color:#fff;font-size:.72em;line-height:1}
      .ab-race-center-label{position:absolute;left:50%;top:3.5%;transform:translateX(-50%);z-index:14;color:#737b88;font-size:clamp(7px,.65vw,12px);font-weight:800}
      .ab-race-track{position:absolute;left:9.9%;right:9.9%;top:24%;height:52%;overflow:hidden;background:#e7e9ed;z-index:2}
      .ab-race-fill{position:absolute;top:0;height:100%;will-change:width;transition:width 1100ms cubic-bezier(.2,.82,.2,1)}
      .ab-race-fill.left{left:0;width:50%;background:#211792}.ab-race-fill.right{right:0;width:50%;background:#d31736}
      .ab-race-fill::after{content:"";position:absolute;inset:0;opacity:.16;background:linear-gradient(110deg,transparent 0 35%,rgba(255,255,255,.7) 48%,transparent 61%);transform:translateX(-125%)}
      .ab-race-fill.updating::after{animation:abRaceSheen .88s ease}
      @keyframes abRaceSheen{to{transform:translateX(125%)}}
      .ab-race-midline{position:absolute;left:50%;top:24%;height:52%;width:2px;transform:translateX(-50%);background:rgba(255,255,255,.98);z-index:7}
      .ab-race-cross{position:absolute;left:50%;top:24%;height:52%;width:15px;transform:translateX(-50%);opacity:0;z-index:8;background:linear-gradient(90deg,transparent,rgba(255,255,255,.96),transparent)}
      .ab-race-cross.fire{animation:abRaceCross .9s ease}
      @keyframes abRaceCross{0%{opacity:0;filter:blur(4px)}45%{opacity:1;filter:blur(0)}100%{opacity:0;filter:blur(4px)}}
      .ab-race-pct{position:absolute;top:26%;z-index:10;color:#fff;font-weight:950;font-size:clamp(22px,2.75vw,48px);line-height:1;letter-spacing:-.055em;white-space:nowrap;text-shadow:0 1px 2px rgba(0,0,0,.18)}
      .ab-race-pct.left{left:11%}.ab-race-pct.right{right:11%}.ab-race-pct small{font-size:.44em;letter-spacing:0;margin-left:2px}
      .ab-race-foot{position:absolute;left:10.7%;right:10.7%;bottom:3%;height:16%;z-index:10;display:grid;grid-template-columns:1fr auto 1fr;align-items:end;gap:8px;color:#4d5362;font-size:clamp(6px,.62vw,11px);font-weight:800;line-height:1;white-space:nowrap}
      .ab-race-foot .right{text-align:right}.ab-race-foot .diff{text-align:center}.ab-race-foot b{font-weight:950;margin-left:4px}
      .ab-race-leader{position:absolute;left:50%;top:1%;transform:translate(-50%,-130%);z-index:20;opacity:0;padding:3px 9px;border-radius:999px;color:#fff;font-size:clamp(6px,.56vw,10px);font-weight:950;letter-spacing:.04em;white-space:nowrap}
      .ab-race-leader.show{animation:abRaceLeader 1250ms cubic-bezier(.2,.82,.2,1)}
      @keyframes abRaceLeader{0%{opacity:0;transform:translate(-50%,-130%) scale(.86)}24%{opacity:1;transform:translate(-50%,0) scale(1)}72%{opacity:1;transform:translate(-50%,0)}100%{opacity:0;transform:translate(-50%,-25%)}}
      .ab-race-leading{animation:abRacePulse .9s ease}
      @keyframes abRacePulse{50%{filter:brightness(1.22)}}
      @media(max-width:900px){.ab-race-tv{min-height:62px}.ab-race-foot{font-size:7px}}
      @media(prefers-reduced-motion:reduce){.ab-race-fill{transition:none!important}.ab-race-tv *{animation-duration:.001ms!important;animation-iteration-count:1!important}}
    `;
    doc.head.appendChild(style);
  }

  function barMarkup(doc){
    const bar=doc.createElement('div');
    bar.className='ab-race-tv';
    bar.id='apuraElectionRaceBar';
    bar.setAttribute('aria-label','Comparativo animado dos dois principais candidatos');
    bar.innerHTML=`
      <div class="ab-race-photo left" data-photo-left></div>
      <div class="ab-race-photo right" data-photo-right></div>
      <div class="ab-race-head left"><span class="ab-race-name" data-name-left></span><span class="ab-race-party" data-party-left></span></div>
      <div class="ab-race-head right"><span class="ab-race-party" data-party-right></span><span class="ab-race-name" data-name-right></span></div>
      <div class="ab-race-center-label">50%</div>
      <div class="ab-race-track"><div class="ab-race-fill left" data-fill-left></div><div class="ab-race-fill right" data-fill-right></div></div>
      <div class="ab-race-midline"></div><div class="ab-race-cross" data-cross></div>
      <div class="ab-race-pct left"><span data-pct-left>50,00</span><small>%</small></div>
      <div class="ab-race-pct right"><span data-pct-right>50,00</span><small>%</small></div>
      <div class="ab-race-foot"><span>Nº total de votos <b data-votes-left>0</b></span><span class="diff">Diferença <b data-diff>0</b></span><span class="right">Nº total de votos <b data-votes-right>0</b></span></div>
      <div class="ab-race-leader" data-leader>NOVA LIDERANÇA</div>`;
    return bar;
  }

  function ensureBar(doc){
    const metrics=doc.querySelector('.summary-metrics');
    if(!metrics)return null;
    let bar=doc.getElementById('apuraElectionRaceBar');
    if(!bar){
      bar=barMarkup(doc);
      metrics.parentNode.insertBefore(bar,metrics);
      const prevTotal=state.leftVotes+state.rightVotes;
      const prevLeft=prevTotal?state.leftVotes/prevTotal*100:50;
      bar.querySelector('[data-fill-left]').style.width=`${prevLeft}%`;
      bar.querySelector('[data-fill-right]').style.width=`${100-prevLeft}%`;
      bar.querySelector('[data-pct-left]').textContent=fmtPct.format(state.leftPct);
      bar.querySelector('[data-pct-right]').textContent=fmtPct.format(state.rightPct);
      bar.querySelector('[data-votes-left]').textContent=fmtVotes.format(state.leftVotes);
      bar.querySelector('[data-votes-right]').textContent=fmtVotes.format(state.rightVotes);
      bar.querySelector('[data-diff]').textContent=fmtVotes.format(Math.abs(state.leftVotes-state.rightVotes));
    }else if(bar.nextElementSibling!==metrics){
      metrics.parentNode.insertBefore(bar,metrics);
    }
    return bar;
  }

  function setPhoto(box,candidate){
    const currentKey=box.dataset.key;
    if(currentKey===candidate.key)return;
    box.dataset.key=candidate.key;
    box.replaceChildren();
    if(candidate.photo){
      const img=box.ownerDocument.createElement('img');
      img.src=candidate.photo;
      img.alt=`Foto de ${candidate.name}`;
      img.addEventListener('error',()=>{box.innerHTML=`<span class="ab-race-fallback">${initials(candidate.name)}</span>`},{once:true});
      box.appendChild(img);
    }else{
      box.innerHTML=`<span class="ab-race-fallback">${initials(candidate.name)}</span>`;
    }
  }

  function stopTweens(){
    state.rafs.forEach(id=>cancelAnimationFrame(id));
    state.rafs.clear();
  }

  function tween(from,to,duration,draw){
    if(Math.abs(to-from)<0.0001){draw(to);return;}
    const start=performance.now();
    function frameStep(now){
      const progress=Math.min(1,(now-start)/duration);
      const eased=1-Math.pow(1-progress,3);
      draw(from+(to-from)*eased);
      if(progress<1){
        const id=requestAnimationFrame(frameStep);
        state.rafs.add(id);
      }
    }
    const id=requestAnimationFrame(frameStep);
    state.rafs.add(id);
  }

  function leaderAnimation(bar,leader,candidate){
    const cross=bar.querySelector('[data-cross]');
    cross.classList.remove('fire');
    void cross.offsetWidth;
    cross.classList.add('fire');

    const badge=bar.querySelector('[data-leader]');
    badge.className='ab-race-leader';
    badge.style.background=candidate.color;
    badge.textContent=`${candidate.name} ASSUME A LIDERANÇA`;
    void badge.offsetWidth;
    badge.classList.add('show');

    const fill=bar.querySelector(leader==='left'?'[data-fill-left]':'[data-fill-right]');
    fill.classList.remove('ab-race-leading');
    void fill.offsetWidth;
    fill.classList.add('ab-race-leading');
  }

  function applyPair(doc,pair){
    const bar=ensureBar(doc);
    if(!bar)return;
    const {left,right}=pair;
    const pairTotal=left.votes+right.votes;
    const leftWidth=pairTotal?left.votes/pairTotal*100:50;
    const rightWidth=100-leftWidth;
    const leftOfficial=Number.isFinite(left.percentage)?left.percentage:leftWidth;
    const rightOfficial=Number.isFinite(right.percentage)?right.percentage:rightWidth;
    const leader=left.votes>right.votes?'left':right.votes>left.votes?'right':'tie';
    const leaderChanged=state.leader&&state.leader!=='tie'&&leader!=='tie'&&leader!==state.leader;

    setPhoto(bar.querySelector('[data-photo-left]'),left);
    setPhoto(bar.querySelector('[data-photo-right]'),right);
    bar.querySelector('[data-name-left]').textContent=left.name;
    bar.querySelector('[data-name-right]').textContent=right.name;
    bar.querySelector('[data-party-left]').textContent=left.party;
    bar.querySelector('[data-party-right]').textContent=right.party;
    bar.querySelector('[data-party-left]').style.background=left.color;
    bar.querySelector('[data-party-right]').style.background=right.color;

    const fillLeft=bar.querySelector('[data-fill-left]');
    const fillRight=bar.querySelector('[data-fill-right]');
    fillLeft.style.background=left.color;
    fillRight.style.background=right.color;
    fillLeft.classList.remove('updating');
    fillRight.classList.remove('updating');
    void fillLeft.offsetWidth;
    fillLeft.classList.add('updating');
    fillRight.classList.add('updating');
    fillLeft.style.width=`${leftWidth}%`;
    fillRight.style.width=`${rightWidth}%`;

    stopTweens();
    tween(state.leftPct,leftOfficial,1050,value=>bar.querySelector('[data-pct-left]').textContent=fmtPct.format(value));
    tween(state.rightPct,rightOfficial,1050,value=>bar.querySelector('[data-pct-right]').textContent=fmtPct.format(value));
    tween(state.leftVotes,left.votes,950,value=>bar.querySelector('[data-votes-left]').textContent=fmtVotes.format(Math.round(value)));
    tween(state.rightVotes,right.votes,950,value=>bar.querySelector('[data-votes-right]').textContent=fmtVotes.format(Math.round(value)));
    tween(Math.abs(state.leftVotes-state.rightVotes),Math.abs(left.votes-right.votes),950,value=>bar.querySelector('[data-diff]').textContent=fmtVotes.format(Math.round(value)));

    if(leaderChanged)leaderAnimation(bar,leader,leader==='left'?left:right);

    state.leftPct=leftOfficial;
    state.rightPct=rightOfficial;
    state.leftVotes=left.votes;
    state.rightVotes=right.votes;
    state.leader=leader;
  }

  function refresh(){
    state.scheduled=false;
    try{
      const doc=frame.contentDocument;
      if(!doc?.head||!doc?.body)return;
      installStyle(doc);
      const candidates=readCandidates(doc);
      const pair=choosePair(candidates);
      if(!pair)return;
      applyPair(doc,pair);
    }catch(error){
      console.debug('Barra eleitoral ainda não disponível:',error?.message||error);
    }
  }

  function scheduleRefresh(){
    if(state.scheduled)return;
    state.scheduled=true;
    requestAnimationFrame(()=>requestAnimationFrame(refresh));
  }

  function observeFrame(){
    try{
      state.observer?.disconnect();
      const doc=frame.contentDocument;
      if(!doc?.body)return;
      state.observer=new MutationObserver(scheduleRefresh);
      state.observer.observe(doc.body,{subtree:true,childList:true,characterData:true});
      scheduleRefresh();
    }catch(error){}
  }

  frame.addEventListener('load',()=>{
    setTimeout(observeFrame,60);
    setTimeout(scheduleRefresh,250);
    setTimeout(scheduleRefresh,900);
  });

  if(frame.contentDocument?.readyState==='complete'||frame.contentDocument?.readyState==='interactive')observeFrame();
  state.interval=setInterval(scheduleRefresh,2500);
})();