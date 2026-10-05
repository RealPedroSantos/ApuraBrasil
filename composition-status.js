(() => {
  'use strict';

  const projectedList=document.getElementById('projectedList');
  const chamberVisual=document.getElementById('chamberVisual');
  const secondaryVisual=document.getElementById('secondaryChamberVisual');
  const projectionMeta=document.querySelector('.projection-meta');
  if(!projectedList||!chamberVisual||!projectionMeta)return;

  const norm=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
  const partyFromCard=card=>String(card.querySelector('.projected-main span')?.textContent||'').split('•')[0].trim()||'Sem sigla';
  let timer=null;

  const key=document.createElement('div');
  key.className='composition-status-key';
  key.innerHTML='<span class="status-key-item"><i class="status-ring-icon" style="--ring:#2f9b61"></i>ELEITO — TSE</span><span class="status-key-item"><i class="status-ring-icon" style="--ring:#d89119"></i>PRÉ-APROVADO / PROJEÇÃO</span><span class="status-key-item"><i class="status-ring-icon" style="--ring:#aeb5b8"></i>EM DISPUTA</span>';
  projectionMeta.appendChild(key);

  const counters=document.createElement('div');
  counters.className='composition-status-counter';
  projectionMeta.appendChild(counters);

  const disclaimer=document.createElement('div');
  disclaimer.className='status-disclaimer';
  disclaimer.textContent='Pré-aprovado é uma projeção do ApuraBrasil com os dados parciais; somente “Eleito — TSE” representa situação oficial.';
  projectionMeta.appendChild(disclaimer);

  function activeMode(){return document.querySelector('.mode.active')?.dataset.office||'deputado-federal';}
  function setText(el,value){if(el&&el.textContent!==value)el.textContent=value;}

  function decorateCards(){
    const counts=new Map();
    let official=0,projected=0;
    [...projectedList.querySelectorAll('.projected-card')].forEach(card=>{
      const statusEl=card.querySelector('.seat-status strong');
      if(!statusEl)return;
      const statusText=norm(statusEl.textContent);
      const wasOfficial=statusText.includes('oficial')||statusText.includes('eleito');
      const party=partyFromCard(card);
      const entry=counts.get(party)||{official:0,projected:0};
      const detail=card.querySelector('.seat-status span');
      if(wasOfficial){
        official++;entry.official++;
        card.classList.add('status-official');card.classList.remove('status-projected');
        setText(statusEl,'ELEITO — TSE');
        setText(detail,'situação oficial');
      }else{
        projected++;entry.projected++;
        card.classList.add('status-projected');card.classList.remove('status-official');
        setText(statusEl,'PRÉ-APROVADO');
        setText(detail,'projeção ApuraBrasil');
      }
      counts.set(party,entry);
    });
    return {counts,official,projected};
  }

  function decorateVisual(visual,partyCounts,allowOfficial=true){
    if(!visual)return {pending:0};
    visual.closest('.chamber-card')?.classList.add('status-aware');
    const used=new Map();
    let pending=0;
    [...visual.querySelectorAll('.seat-dot')].forEach(dot=>{
      dot.classList.remove('status-official','status-projected','status-pending');
      const party=String(dot.getAttribute('title')||'').trim();
      if(dot.classList.contains('neutral')){dot.classList.add('status-pending');pending++;return;}
      const cfg=partyCounts.get(party)||{official:0,projected:0};
      const n=used.get(party)||0;
      if(allowOfficial&&n<cfg.official)dot.classList.add('status-official');
      else dot.classList.add('status-projected');
      used.set(party,n+1);
    });
    return {pending};
  }

  function render(){
    const mode=activeMode();
    const {counts,official,projected}=decorateCards();
    let pending=0;
    if(mode==='congresso'){
      /* The combined list does not identify which house owns each candidate. Keep chamber rings projected rather than falsely assigning official seats. */
      pending+=decorateVisual(chamberVisual,counts,false).pending;
      pending+=decorateVisual(secondaryVisual,counts,false).pending;
    }else{
      pending+=decorateVisual(chamberVisual,counts,true).pending;
      const secondaryCard=secondaryVisual?.closest('.secondary-chamber');
      if(secondaryVisual&&secondaryCard&&!secondaryCard.classList.contains('hidden'))pending+=decorateVisual(secondaryVisual,counts,true).pending;
    }
    const html=`<span class="composition-status-pill official"><b>${official}</b> ELEITOS TSE</span><span class="composition-status-pill projected"><b>${projected}</b> PRÉ-APROVADOS</span><span class="composition-status-pill pending"><b>${pending}</b> EM DISPUTA</span>`;
    if(counters.innerHTML!==html)counters.innerHTML=html;
  }

  function schedule(){clearTimeout(timer);timer=setTimeout(render,80);}
  new MutationObserver(schedule).observe(projectedList,{childList:true,subtree:true});
  new MutationObserver(schedule).observe(chamberVisual,{childList:true,subtree:true});
  if(secondaryVisual)new MutationObserver(schedule).observe(secondaryVisual,{childList:true,subtree:true});
  document.querySelector('.segmented')?.addEventListener('click',()=>setTimeout(schedule,120));
  document.getElementById('ufSelect')?.addEventListener('change',()=>setTimeout(schedule,120));
  document.getElementById('refreshProjection')?.addEventListener('click',()=>setTimeout(schedule,180));
  schedule();
})();
