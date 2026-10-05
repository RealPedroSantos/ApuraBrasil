(() => {
  'use strict';
  const stage=document.getElementById('mapStage');
  if(!stage)return;

  const YEARS=[];
  for(let year=2000;year<=2030;year+=2){
    YEARS.push({
      year,
      type:year%4===0?'municipal':'geral',
      current:year===2026,
      future:year>2026,
      integrated:year===2022||year===2026
    });
  }

  const wrap=document.createElement('section');
  wrap.className='election-timeline';
  wrap.setAttribute('aria-label','Linha do tempo eleitoral');
  wrap.innerHTML='<div class="timeline-head"><strong>Eleições</strong><span id="timelineStatus">2026 • Geral • atual</span></div><div class="timeline-scroll" id="timelineScroll"></div>';
  stage.appendChild(wrap);

  const scroll=wrap.querySelector('#timelineScroll');
  const status=wrap.querySelector('#timelineStatus');
  let selected=2026;

  function label(item){
    if(item.current)return 'ATUAL';
    if(item.future)return 'FUTURA';
    if(item.integrated)return 'TSE';
    return 'ARQUIVO';
  }
  function render(){
    scroll.innerHTML=YEARS.map(item=>`<button type="button" class="timeline-year ${item.year===selected?'active':''} ${item.future?'future':item.current?'current':'past'} ${item.integrated?'integrated':'archive'}" data-year="${item.year}" aria-pressed="${item.year===selected?'true':'false'}"><strong>${item.year}</strong><small>${item.type==='geral'?'GERAL':'MUNIC.'}</small><em>${label(item)}</em></button>`).join('');
    requestAnimationFrame(()=>scroll.querySelector('.timeline-year.active')?.scrollIntoView({block:'nearest',inline:'center'}));
  }
  function updateStatus(item){
    const type=item.type==='geral'?'Geral':'Municipal';
    const mode=item.current?'atual':item.future?'futura':item.integrated?'arquivo oficial integrado':'arquivo histórico';
    status.textContent=`${item.year} • ${type} • ${mode}`;
  }
  function selectYear(year,dispatch=true){
    const item=YEARS.find(x=>x.year===Number(year));if(!item)return;
    selected=item.year;render();updateStatus(item);
    document.documentElement.dataset.electionYear=String(item.year);
    document.documentElement.dataset.electionPeriod=item.future?'future':item.current?'current':'past';
    if(dispatch)window.dispatchEvent(new CustomEvent('apura:set-election-year',{detail:{year:item.year,type:item.type,integrated:item.integrated,future:item.future}}));
  }

  scroll.addEventListener('click',e=>{const button=e.target.closest('[data-year]');if(button)selectYear(Number(button.dataset.year));});
  window.addEventListener('apura:election-year-changed',e=>{const item=YEARS.find(x=>x.year===Number(e.detail?.year));if(item){selected=item.year;render();updateStatus(item);}});
  selectYear(2026,false);
})();