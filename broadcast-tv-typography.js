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
      parentDoc.querySelectorAll('.studio-head,.broadcast-office-switch').forEach(node=>node.remove());
      const frame=parentDoc.querySelector('.broadcast-frame');
      if(frame) frame.style.setProperty('grid-template-rows','minmax(0,1fr) 33.333333%','important');
    }catch{}
  }

  function restoreNativeSiteHeader(){
    const shell=document.querySelector('.app-shell');
    if(shell){
      shell.style.setProperty('grid-template-rows','auto minmax(0,1fr) auto','important');
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

    const officeNav=document.querySelector('.office-nav');
    if(officeNav){
      officeNav.style.setProperty('display','flex','important');
      officeNav.style.setProperty('visibility','visible','important');
      officeNav.style.setProperty('opacity','1','important');
    }

    const roundSelector=document.querySelector('.round-selector');
    if(roundSelector){
      roundSelector.style.setProperty('display','flex','important');
      roundSelector.style.setProperty('visibility','visible','important');
      roundSelector.style.setProperty('opacity','1','important');
    }

    const main=document.querySelector('.main-grid');
    if(main){
      main.style.setProperty('height','auto','important');
      main.style.setProperty('min-height','0','important');
      main.style.setProperty('padding','7px','important');
    }

    document.querySelector('.status-bar')?.style.setProperty('display','none','important');
    document.querySelector('.mobile-app-nav')?.style.setProperty('display','none','important');
  }

  function ensureSummaryStrip(){
    const shell=document.querySelector('.app-shell');
    const main=document.querySelector('.main-grid');
    if(!shell||!main) return null;

    let strip=shell.querySelector(':scope > .broadcast-summary-strip');
    if(!strip){
      strip=document.createElement('section');
      strip.className='broadcast-summary-strip';
      strip.setAttribute('aria-label','Resumo da votação');
      main.insertAdjacentElement('afterend',strip);
    }else if(strip.previousElementSibling!==main){
      main.insertAdjacentElement('afterend',strip);
    }
    return strip;
  }

  function parseMetricNumber(value){
    const normalized=String(value||'')
      .replace(/\./g,'')
      .replace(/\s+/g,'')
      .replace(',','.')
      .replace(/[^0-9.-]/g,'');
    const number=Number(normalized);
    return Number.isFinite(number)?number:0;
  }

  function formatMetricPercent(value){
    const safe=Number.isFinite(value)?value:0;
    return `${safe.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})}%`;
  }

  function metricByLabel(root,labelStart){
    const normalized=labelStart.toLocaleLowerCase('pt-BR');
    return [...root.querySelectorAll('.summary-metric')].find(metric=>{
      const label=metric.querySelector('span')?.textContent?.trim().toLocaleLowerCase('pt-BR')||'';
      return label.startsWith(normalized);
    })||null;
  }

  function setMetricPercent(metric,value){
    if(!metric) return;
    let percent=metric.querySelector('small');
    if(!percent){
      percent=document.createElement('small');
      metric.appendChild(percent);
    }
    percent.classList.add('broadcast-metric-percent');
    percent.textContent=formatMetricPercent(value);
  }

  function decorateSummaryPercentages(root){
    if(!root) return;
    const turnoutMetric=metricByLabel(root,'comparecimento');
    const abstentionsMetric=metricByLabel(root,'abstenções');
    const validMetric=metricByLabel(root,'válidos');
    const blankMetric=metricByLabel(root,'brancos');
    const nullMetric=metricByLabel(root,'nulos');

    const turnout=parseMetricNumber(turnoutMetric?.querySelector('b')?.textContent);
    const abstentions=parseMetricNumber(abstentionsMetric?.querySelector('b')?.textContent);
    const valid=parseMetricNumber(validMetric?.querySelector('b')?.textContent);
    const blank=parseMetricNumber(blankMetric?.querySelector('b')?.textContent);
    const nullVotes=parseMetricNumber(nullMetric?.querySelector('b')?.textContent);

    const electorate=turnout+abstentions;
    const countedVotes=valid+blank+nullVotes;

    setMetricPercent(turnoutMetric,electorate>0?(turnout/electorate)*100:0);
    setMetricPercent(abstentionsMetric,electorate>0?(abstentions/electorate)*100:0);
    setMetricPercent(validMetric,countedVotes>0?(valid/countedVotes)*100:0);
    setMetricPercent(blankMetric,countedVotes>0?(blank/countedVotes)*100:0);
    setMetricPercent(nullMetric,countedVotes>0?(nullVotes/countedVotes)*100:0);
  }

  function relocateSummaryMetrics(){
    const strip=ensureSummaryStrip();
    if(!strip) return false;

    const current=strip.querySelector('.summary-metrics');
    const source=[...document.querySelectorAll('.summary-metrics')].find(node=>!node.closest('.broadcast-summary-strip'));

    if(source){
      if(current&&current!==source) current.remove();
      source.classList.add('broadcast-summary-metrics');
      source.setAttribute('aria-label','Comparecimento, abstenções, válidos, brancos e nulos');
      decorateSummaryPercentages(source);
      strip.replaceChildren(source);
      return true;
    }

    if(current) decorateSummaryPercentages(current);
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
      line-height:1.15!important;
      font-weight:800!important;
      letter-spacing:.015em!important
    }

    html.broadcast-tv-readable .broadcast-summary-strip{
      position:relative!important;
      z-index:25!important;
      width:100%!important;
      min-width:0!important;
      height:clamp(58px,4.7vw,74px)!important;
      min-height:58px!important;
      max-height:74px!important;
      padding:0 8px!important;
      margin:0!important;
      background:#fff!important;
      border-top:2px solid #c6ced1!important;
      border-bottom:1px solid #dfe4e6!important;
      box-shadow:0 -1px 0 rgba(7,21,34,.04),0 2px 5px rgba(7,21,34,.05)!important;
      overflow:hidden!important;
    }

    html.broadcast-tv-readable .broadcast-summary-strip .broadcast-summary-metrics{
      width:100%!important;
      height:100%!important;
      display:grid!important;
      grid-template-columns:repeat(5,minmax(0,1fr))!important;
      gap:0!important;
      margin:0!important;
      padding:0!important;
      align-items:stretch!important;
      background:transparent!important;
    }

    html.broadcast-tv-readable .broadcast-summary-strip .summary-metric{
      position:relative!important;
      min-width:0!important;
      min-height:0!important;
      padding:6px clamp(10px,1.15vw,20px)!important;
      margin:0!important;
      border:0!important;
      border-radius:0!important;
      background:transparent!important;
      display:grid!important;
      grid-template-columns:minmax(0,1fr) auto!important;
      grid-template-rows:auto auto!important;
      column-gap:14px!important;
      align-content:center!important;
      align-items:end!important;
    }

    html.broadcast-tv-readable .broadcast-summary-strip .summary-metric:not(:last-child)::after{
      content:'';
      position:absolute;
      top:18%;
      right:0;
      bottom:18%;
      width:1px;
      background:#d9dfe1;
    }

    html.broadcast-tv-readable .broadcast-summary-strip .summary-metric span{
      grid-column:1/-1!important;
      display:block!important;
      font-size:clamp(14px,.95vw,18px)!important;
      line-height:1!important;
      font-weight:900!important;
      letter-spacing:.01em!important;
      color:#506066!important;
      white-space:nowrap!important;
      overflow:hidden!important;
      text-overflow:ellipsis!important;
    }

    html.broadcast-tv-readable .broadcast-summary-strip .summary-metric b{
      grid-column:1!important;
      display:block!important;
      margin-top:3px!important;
      font-size:clamp(22px,1.55vw,31px)!important;
      line-height:.92!important;
      font-weight:950!important;
      color:#11191c!important;
      font-variant-numeric:tabular-nums!important;
      white-space:nowrap!important;
    }

    html.broadcast-tv-readable .broadcast-summary-strip .summary-metric small,
    html.broadcast-tv-readable .broadcast-summary-strip .summary-metric .broadcast-metric-percent{
      grid-column:2!important;
      align-self:end!important;
      display:block!important;
      margin:0 0 1px!important;
      font-size:clamp(16px,1.15vw,22px)!important;
      line-height:.95!important;
      font-weight:950!important;
      color:#33454c!important;
      font-variant-numeric:tabular-nums!important;
      white-space:nowrap!important;
    }

    html.broadcast-tv-readable .results-panel .summary-metrics,
    html.broadcast-tv-readable .broadcast-candidates-column .summary-metrics{
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
      html.broadcast-tv-readable .broadcast-summary-strip{height:58px!important;min-height:58px!important}
      html.broadcast-tv-readable .broadcast-summary-strip .summary-metric{padding:5px 8px!important;column-gap:8px!important}
      html.broadcast-tv-readable .broadcast-summary-strip .summary-metric span{font-size:12px!important}
      html.broadcast-tv-readable .broadcast-summary-strip .summary-metric b{font-size:19px!important}
      html.broadcast-tv-readable .broadcast-summary-strip .summary-metric small,
      html.broadcast-tv-readable .broadcast-summary-strip .summary-metric .broadcast-metric-percent{font-size:14px!important}
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
