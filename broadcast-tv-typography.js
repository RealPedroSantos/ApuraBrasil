(() => {
  'use strict';

  if (window.__apuraBrasilBroadcastTvTypographyInstalled) return;
  function isBroadcastEmbed(){
    try{return window.parent!==window&&window.parent.location.pathname.startsWith('/ao-vivo')}catch{return false}
  }
  if(!isBroadcastEmbed()) return;
  window.__apuraBrasilBroadcastTvTypographyInstalled=true;

  function removeDuplicateBroadcastHeader(){
    try{
      const parentDoc=window.parent.document;
      parentDoc.querySelector('.studio-head')?.remove();
      const frame=parentDoc.querySelector('.broadcast-frame');
      if(frame){
        frame.style.setProperty('grid-template-rows','minmax(0,1fr) 33.333333%','important');
      }
    }catch{}
  }

  function restoreNativeSiteHeader(){
    const shell=document.querySelector('.app-shell');
    if(shell){
      shell.style.setProperty('grid-template-rows','auto minmax(0,1fr)','important');
      shell.style.setProperty('padding','0','important');
      shell.style.setProperty('gap','0','important');
    }

    const topbar=document.querySelector('.topbar');
    if(topbar){
      topbar.style.setProperty('display','grid','important');
      topbar.style.setProperty('visibility','visible','important');
      topbar.style.setProperty('opacity','1','important');
      topbar.style.setProperty('position','relative','important');
      topbar.style.setProperty('z-index','30','important');
    }

    const roundSelector=document.querySelector('.round-selector');
    if(roundSelector){
      roundSelector.style.setProperty('display','flex','important');
      roundSelector.style.setProperty('visibility','visible','important');
      roundSelector.style.setProperty('opacity','1','important');
    }

    const main=document.querySelector('.main-grid');
    if(main){
      main.style.setProperty('padding','7px','important');
    }

    document.querySelector('.status-bar')?.style.setProperty('display','none','important');
    document.querySelector('.mobile-app-nav')?.style.setProperty('display','none','important');
  }

  function relocateSummaryMetrics(){
    const mediaCard=document.querySelector('.broadcast-candidates-column .mobile-map-bottom-results');
    if(!mediaCard)return false;

    const source=[...document.querySelectorAll('.summary-metrics')].find(node=>!node.closest('.broadcast-candidates-column'));
    const current=mediaCard.querySelector('.broadcast-summary-metrics');

    if(source){
      if(current&&current!==source)current.remove();
      source.classList.add('broadcast-summary-metrics');
      source.setAttribute('aria-label','Comparecimento, abstenções e votos');
      mediaCard.appendChild(source);
      return true;
    }

    return !!current;
  }

  function enforceBroadcastLayout(){
    removeDuplicateBroadcastHeader();
    restoreNativeSiteHeader();
    relocateSummaryMetrics();
  }

  const style=document.createElement('style');
  style.id='broadcastTvTypographyStyle';
  style.textContent=`
    html.broadcast-tv-readable .eyebrow,
    html.broadcast-tv-readable .summary-heading p,
    html.broadcast-tv-readable .total-main small,
    html.broadcast-tv-readable .total-state b,
    html.broadcast-tv-readable .total-state span,
    html.broadcast-tv-readable .section-counter span,
    html.broadcast-tv-readable .section-counter small{
      font-size:clamp(12px,.82vw,15px)!important;
      line-height:1.15!important;font-weight:800!important;letter-spacing:.015em!important
    }

    /* A coluna esquerda vira uma pilha: cabeçalho, media cards e métricas. */
    html.broadcast-tv-readable .broadcast-candidates-column .mobile-map-bottom-results{
      grid-template-rows:auto auto auto minmax(0,1fr)!important;
      align-content:start!important;
    }
    html.broadcast-tv-readable .broadcast-candidates-column .mobile-map-candidate-strip{
      height:auto!important;
      min-height:0!important;
      max-height:44vh!important;
      flex:0 0 auto!important;
      overflow-y:auto!important;
    }

    /* Comparecimento / Abstenções / Válidos / Brancos / Nulos — agora abaixo dos Media Cards. */
    html.broadcast-tv-readable .broadcast-summary-metrics{
      width:100%!important;
      display:grid!important;
      grid-template-columns:repeat(2,minmax(0,1fr))!important;
      gap:7px!important;
      margin:2px 0 0!important;
      padding:9px 2px 1px!important;
      border-top:1px solid #d9dfe1!important;
      align-items:stretch!important;
    }
    html.broadcast-tv-readable .broadcast-summary-metrics .summary-metric{
      min-width:0!important;
      min-height:58px!important;
      padding:8px 10px!important;
      border:1px solid #d8dddf!important;
      border-radius:10px!important;
      background:#fff!important;
      display:flex!important;
      flex-direction:column!important;
      justify-content:center!important;
    }
    html.broadcast-tv-readable .broadcast-summary-metrics .summary-metric span{
      display:block!important;
      font-size:clamp(14px,1vw,18px)!important;
      line-height:1.05!important;
      font-weight:850!important;
      letter-spacing:.005em!important;
      color:#4d5b61!important;
      white-space:normal!important;
      overflow:visible!important;
      text-overflow:clip!important;
    }
    html.broadcast-tv-readable .broadcast-summary-metrics .summary-metric b{
      display:block!important;
      margin-top:4px!important;
      font-size:clamp(21px,1.55vw,29px)!important;
      line-height:.95!important;
      font-weight:950!important;
      color:#11191c!important;
      font-variant-numeric:tabular-nums!important;
      white-space:nowrap!important;
      overflow:visible!important;
      text-overflow:clip!important;
    }
    html.broadcast-tv-readable .broadcast-summary-metrics .summary-metric.vote-breakdown-metric small{
      display:block!important;
      margin-top:4px!important;
      font-size:clamp(13px,.9vw,17px)!important;
      line-height:1!important;
      font-weight:900!important;
      color:#59666b!important;
      font-variant-numeric:tabular-nums!important;
    }

    /* Regra de segurança: se uma atualização recriar as métricas à direita, elas ficam ocultas
       até o observador movê-las novamente para a coluna esquerda. */
    html.broadcast-tv-readable .results-panel .summary-metrics{
      display:none!important;
    }

    html.broadcast-tv-readable .section-counter{min-height:58px!important;row-gap:2px!important}
    html.broadcast-tv-readable .section-counter strong{font-size:clamp(23px,1.65vw,31px)!important}

    html.broadcast-tv-readable .candidate-number,
    html.broadcast-tv-readable .candidate-status{font-size:clamp(11px,.78vw,14px)!important;line-height:1.08!important}
    html.broadcast-tv-readable .party-chip{font-size:clamp(12px,.82vw,16px)!important;min-height:clamp(21px,1.65vw,27px)!important}
    html.broadcast-tv-readable .candidate-bar span{font-size:clamp(12px,.82vw,15px)!important;line-height:1!important}
    html.broadcast-tv-readable .details-tabs button,
    html.broadcast-tv-readable .detail-tab{font-size:clamp(11px,.78vw,14px)!important;font-weight:850!important}

    html.broadcast-tv-readable .mobile-map-count span,
    html.broadcast-tv-readable .mobile-map-candidate-meta,
    html.broadcast-tv-readable .mobile-map-candidate-votes,
    html.broadcast-tv-readable .mobile-map-swipe-hint{font-size:clamp(11px,.76vw,14px)!important;line-height:1.08!important;font-weight:800!important}
    html.broadcast-tv-readable .mobile-map-count strong{font-size:clamp(17px,1.15vw,22px)!important}
    html.broadcast-tv-readable .mobile-map-candidate-party{font-size:clamp(11px,.74vw,14px)!important;min-height:21px!important}
    html.broadcast-tv-readable .map-note,
    html.broadcast-tv-readable .breadcrumb,
    html.broadcast-tv-readable .geo-note{font-size:clamp(11px,.72vw,13px)!important;line-height:1.15!important}

    html.broadcast-tv-readable .section-counter,
    html.broadcast-tv-readable .candidate-main,
    html.broadcast-tv-readable .mobile-map-candidate-body{min-width:0!important}

    @media(max-width:1200px){
      html.broadcast-tv-readable .broadcast-summary-metrics .summary-metric span{font-size:14px!important}
      html.broadcast-tv-readable .broadcast-summary-metrics .summary-metric b{font-size:20px!important}
      html.broadcast-tv-readable .broadcast-summary-metrics .summary-metric.vote-breakdown-metric small{font-size:13px!important}
    }
  `;
  document.head.appendChild(style);
  document.documentElement.classList.add('broadcast-tv-readable');

  enforceBroadcastLayout();
  requestAnimationFrame(enforceBroadcastLayout);
  setTimeout(enforceBroadcastLayout,120);
  setTimeout(enforceBroadcastLayout,450);
  setTimeout(enforceBroadcastLayout,1200);
  setInterval(relocateSummaryMetrics,1000);
  new MutationObserver(()=>relocateSummaryMetrics()).observe(document.documentElement,{childList:true,subtree:true});
})();
