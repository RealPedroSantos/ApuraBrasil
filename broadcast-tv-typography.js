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

  function enforceNativeHeader(){
    removeDuplicateBroadcastHeader();
    restoreNativeSiteHeader();
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

    /* Comparecimento / Abstenções / Válidos / Brancos / Nulos — leitura de TV */
    html.broadcast-tv-readable .summary-metrics{
      gap:clamp(8px,.65vw,12px)!important;
      align-items:stretch!important;
    }
    html.broadcast-tv-readable .summary-metric{
      min-width:0!important;
      min-height:clamp(46px,3.4vw,58px)!important;
      padding-top:clamp(6px,.45vw,8px)!important;
      display:flex!important;
      flex-direction:column!important;
      justify-content:center!important;
    }
    html.broadcast-tv-readable .summary-metric span{
      font-size:clamp(14px,.95vw,18px)!important;
      line-height:1.08!important;
      font-weight:850!important;
      letter-spacing:.005em!important;
      color:#4d5b61!important;
    }
    html.broadcast-tv-readable .summary-metric b{
      margin-top:clamp(2px,.2vw,4px)!important;
      font-size:clamp(18px,1.28vw,24px)!important;
      line-height:1!important;
      font-weight:950!important;
      color:#11191c!important;
      font-variant-numeric:tabular-nums!important;
    }
    html.broadcast-tv-readable .summary-metric.vote-breakdown-metric small{
      display:block!important;
      margin-top:3px!important;
      font-size:clamp(13px,.88vw,17px)!important;
      line-height:1!important;
      font-weight:900!important;
      color:#59666b!important;
      font-variant-numeric:tabular-nums!important;
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
      html.broadcast-tv-readable .summary-metric span{font-size:14px!important}
      html.broadcast-tv-readable .summary-metric b{font-size:18px!important}
      html.broadcast-tv-readable .summary-metric.vote-breakdown-metric small{font-size:13px!important}
    }
  `;
  document.head.appendChild(style);
  document.documentElement.classList.add('broadcast-tv-readable');

  enforceNativeHeader();
  requestAnimationFrame(enforceNativeHeader);
  setTimeout(enforceNativeHeader,120);
  setTimeout(enforceNativeHeader,450);
  setTimeout(enforceNativeHeader,1200);
  new MutationObserver(enforceNativeHeader).observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['style','class']});
})();
