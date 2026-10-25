(()=>{
  'use strict';

  try{
    if(window.parent===window||!window.parent.location.pathname.startsWith('/ao-vivo'))return;
  }catch{return;}

  const fmtVotes=new Intl.NumberFormat('pt-BR');
  const fmtPct=new Intl.NumberFormat('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});

  function parseVotes(value){
    const n=Number(String(value||'').replace(/\D/g,''));
    return Number.isFinite(n)?n:0;
  }

  function parsePct(value){
    const raw=String(value||'').replace('%','').trim();
    const n=Number(raw.includes(',')?raw.replace(/\./g,'').replace(',','.'):raw);
    return Number.isFinite(n)?n:0;
  }

  function realCandidateCards(){
    return [...document.querySelectorAll('#candidateList .candidate-card,.candidate-list .candidate-card')]
      .filter(card=>!card.classList.contains('candidate-card--aux'))
      .filter(card=>{
        const name=(card.querySelector('.candidate-name')?.textContent||'').trim().toUpperCase();
        return name&&!['BRANCOS','NULOS','BRANCO','NULO'].includes(name);
      });
  }

  function read(card){
    const name=(card.querySelector('.candidate-name')?.textContent||'Candidato').trim();
    const party=(card.querySelector('.party-chip')?.textContent||'—').trim();
    const score=card.querySelector('.candidate-score');
    const votes=parseVotes(score?.querySelector('small')?.textContent||card.querySelector('.candidate-bar span')?.textContent);
    const percentage=parsePct(score?.querySelector('strong')?.textContent);
    const photo=card.querySelector('.candidate-avatar img')?.src||'';
    const chip=card.querySelector('.party-chip');
    const voteBar=card.querySelector('.candidate-bar i');
    const color=(chip?.style?.background||chip?.style?.backgroundColor||voteBar?.style?.background||voteBar?.style?.backgroundColor||'#165dff').trim();
    return {name,party,votes,percentage,photo,color};
  }

  function setPhoto(box,candidate){
    if(!box||!candidate.photo)return;
    const current=box.querySelector('img');
    if(current?.src===candidate.photo)return;
    const img=document.createElement('img');
    img.src=candidate.photo;
    img.alt=`Foto de ${candidate.name}`;
    box.replaceChildren(img);
  }

  function apply(){
    const bar=document.getElementById('apuraElectionRaceBar');
    if(!bar)return;
    const cards=realCandidateCards();
    if(cards.length<2)return;

    const left=read(cards[0]);
    const right=read(cards[1]);
    const total=left.votes+right.votes;
    const leftShare=total?left.votes/total*100:50;
    const rightShare=100-leftShare;

    bar.dataset.candidateOnly='true';
    const leftName=bar.querySelector('[data-name-left]');
    const rightName=bar.querySelector('[data-name-right]');
    if(leftName)leftName.textContent=left.name;
    if(rightName)rightName.textContent=right.name;

    const leftParty=bar.querySelector('[data-party-left]');
    const rightParty=bar.querySelector('[data-party-right]');
    if(leftParty){leftParty.textContent=left.party;leftParty.style.background=left.color;}
    if(rightParty){rightParty.textContent=right.party;rightParty.style.background=right.color;}

    const leftPct=bar.querySelector('[data-pct-left]');
    const rightPct=bar.querySelector('[data-pct-right]');
    if(leftPct)leftPct.textContent=fmtPct.format(left.percentage||leftShare);
    if(rightPct)rightPct.textContent=fmtPct.format(right.percentage||rightShare);

    const leftVotes=bar.querySelector('[data-votes-left]');
    const rightVotes=bar.querySelector('[data-votes-right]');
    const diff=bar.querySelector('[data-diff]');
    if(leftVotes)leftVotes.textContent=fmtVotes.format(left.votes);
    if(rightVotes)rightVotes.textContent=fmtVotes.format(right.votes);
    if(diff)diff.textContent=fmtVotes.format(Math.abs(left.votes-right.votes));

    const fillLeft=bar.querySelector('[data-fill-left]');
    const fillRight=bar.querySelector('[data-fill-right]');
    if(fillLeft){fillLeft.style.width=`${leftShare}%`;fillLeft.style.background=left.color;}
    if(fillRight){fillRight.style.width=`${rightShare}%`;fillRight.style.background=right.color;}

    setPhoto(bar.querySelector('[data-photo-left]'),left);
    setPhoto(bar.querySelector('[data-photo-right]'),right);
  }

  let scheduled=false;
  const schedule=()=>{
    if(scheduled)return;
    scheduled=true;
    requestAnimationFrame(()=>{scheduled=false;apply();});
  };

  schedule();
  setTimeout(schedule,300);
  setTimeout(schedule,1000);
  setInterval(schedule,1800);
  new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true,characterData:true});
})();
