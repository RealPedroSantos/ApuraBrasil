(() => {
  'use strict';

  if (window.__apuraBrasilBroadcastMediaCardScaleInstalled) return;
  try {
    if (window.parent === window || !window.parent.location.pathname.startsWith('/ao-vivo')) return;
  } catch { return; }
  window.__apuraBrasilBroadcastMediaCardScaleInstalled = true;

  const clamp = (v,min,max) => Math.min(max,Math.max(min,v));
  const style = document.createElement('style');
  style.id = 'broadcastMediaCardScaleStyle';
  style.textContent = `
    html.broadcast-layout-v2 .broadcast-candidates-column .mobile-map-bottom-results{padding:var(--bc-panel-pad-y,11px) var(--bc-panel-pad-x,12px)!important;gap:var(--bc-panel-gap,8px)!important;border-radius:var(--bc-panel-radius,16px)!important}
    html.broadcast-layout-v2 .broadcast-candidates-column .mobile-map-count{gap:var(--bc-count-gap,12px)!important;padding:0 3px var(--bc-count-bottom,8px)!important}
    html.broadcast-layout-v2 .broadcast-candidates-column .mobile-map-count span{font-size:var(--bc-count-label,11px)!important}
    html.broadcast-layout-v2 .broadcast-candidates-column .mobile-map-count strong{font-size:var(--bc-count-value,18px)!important}
    html.broadcast-layout-v2 .broadcast-candidates-column .mobile-map-count b{font-size:var(--bc-count-pct,30px)!important}
    html.broadcast-layout-v2 .broadcast-candidates-column .mobile-map-candidate-strip{gap:var(--bc-card-gap,9px)!important}
    html.broadcast-layout-v2 .broadcast-candidates-column .mobile-map-candidate.mobile-map-carousel-card{flex:0 0 var(--bc-card-h,82px)!important;min-height:var(--bc-card-h,82px)!important;max-height:var(--bc-card-h,82px)!important;grid-template-columns:var(--bc-photo-col,58px) minmax(0,1fr) auto!important;column-gap:var(--bc-col-gap,10px)!important;row-gap:var(--bc-row-gap,5px)!important;padding:var(--bc-card-pad-y,9px) var(--bc-card-pad-x,11px)!important;border-radius:var(--bc-card-radius,13px)!important}
    html.broadcast-layout-v2 .broadcast-candidates-column .mobile-map-candidate-photo{width:var(--bc-photo,56px)!important;height:var(--bc-photo,56px)!important;border-width:var(--bc-photo-border,4px)!important}
    html.broadcast-layout-v2 .broadcast-candidates-column .mobile-map-candidate-body{gap:var(--bc-body-gap,5px)!important}
    html.broadcast-layout-v2 .broadcast-candidates-column .mobile-map-candidate-name{font-size:var(--bc-name,13px)!important;line-height:1.03!important}
    html.broadcast-layout-v2 .broadcast-candidates-column .mobile-map-candidate-meta{font-size:var(--bc-meta,10px)!important;gap:var(--bc-meta-gap,6px)!important}
    html.broadcast-layout-v2 .broadcast-candidates-column .mobile-map-candidate-party{min-height:var(--bc-party-h,19px)!important;padding:3px var(--bc-party-pad-x,7px)!important;font-size:var(--bc-party-font,10px)!important}
    html.broadcast-layout-v2 .broadcast-candidates-column .mobile-map-candidate-bottom{gap:var(--bc-bottom-gap,10px)!important;padding-top:var(--bc-bottom-pad,5px)!important}
    html.broadcast-layout-v2 .broadcast-candidates-column .mobile-map-candidate-votes{font-size:var(--bc-votes,10px)!important}
    html.broadcast-layout-v2 .broadcast-candidates-column .mobile-map-candidate-percent{min-width:var(--bc-percent-min,86px)!important;font-size:var(--bc-percent,29px)!important;line-height:.84!important}
  `;
  document.head.appendChild(style);

  let grid=null,left=null,raf=0;
  const px=(base,f,min,max)=>`${Math.round(clamp(base*f,min,max)*10)/10}px`;

  function apply(){
    if(!grid||!left) return;
    const available=Math.max(1,grid.clientWidth-20);
    const cols=getComputedStyle(grid).gridTemplateColumns.split(/\s+/).map(parseFloat).filter(Number.isFinite);
    const track=cols[0]||left.offsetWidth||available*.25;
    const base=available*.25;
    const ratio=track/base;
    const f=clamp(1+(ratio-1)*.82,.9,1.68);

    left.style.setProperty('transform','none','important');
    left.style.setProperty('width','100%','important');
    left.style.setProperty('height','100%','important');

    left.style.setProperty('--bc-panel-pad-y',px(11,f,9,18));
    left.style.setProperty('--bc-panel-pad-x',px(12,f,10,20));
    left.style.setProperty('--bc-panel-gap',px(8,f,7,14));
    left.style.setProperty('--bc-panel-radius',px(16,f,13,24));
    left.style.setProperty('--bc-count-gap',px(12,f,10,20));
    left.style.setProperty('--bc-count-bottom',px(8,f,7,14));
    left.style.setProperty('--bc-count-label',px(11,f,10,17));
    left.style.setProperty('--bc-count-value',px(18,f,17,29));
    left.style.setProperty('--bc-count-pct',px(30,f,28,48));
    left.style.setProperty('--bc-card-gap',px(9,f,7,15));
    left.style.setProperty('--bc-card-h',px(82,f,76,136));
    left.style.setProperty('--bc-photo-col',px(58,f,54,96));
    left.style.setProperty('--bc-col-gap',px(10,f,8,17));
    left.style.setProperty('--bc-row-gap',px(5,f,4,9));
    left.style.setProperty('--bc-card-pad-y',px(9,f,8,15));
    left.style.setProperty('--bc-card-pad-x',px(11,f,9,19));
    left.style.setProperty('--bc-card-radius',px(13,f,11,21));
    left.style.setProperty('--bc-photo',px(56,f,52,92));
    left.style.setProperty('--bc-photo-border',px(4,f,3,6));
    left.style.setProperty('--bc-body-gap',px(5,f,4,9));
    left.style.setProperty('--bc-name',px(13,f,12,22));
    left.style.setProperty('--bc-meta',px(10,f,9,16));
    left.style.setProperty('--bc-meta-gap',px(6,f,5,10));
    left.style.setProperty('--bc-party-h',px(19,f,18,30));
    left.style.setProperty('--bc-party-pad-x',px(7,f,6,11));
    left.style.setProperty('--bc-party-font',px(10,f,9,16));
    left.style.setProperty('--bc-bottom-gap',px(10,f,8,17));
    left.style.setProperty('--bc-bottom-pad',px(5,f,4,9));
    left.style.setProperty('--bc-votes',px(10,f,9,16));
    left.style.setProperty('--bc-percent-min',px(86,f,82,138));
    left.style.setProperty('--bc-percent',px(29,f,27,48));
  }

  function schedule(){cancelAnimationFrame(raf);raf=requestAnimationFrame(apply)}
  function bind(){
    grid=document.querySelector('.main-grid');
    left=document.querySelector('.broadcast-candidates-column');
    if(!grid||!left) return false;
    new ResizeObserver(schedule).observe(grid);
    new MutationObserver(schedule).observe(grid,{attributes:true,attributeFilter:['style','class']});
    schedule();
    return true;
  }
  if(!bind()){
    const mo=new MutationObserver(()=>{if(bind())mo.disconnect()});
    mo.observe(document.documentElement,{childList:true,subtree:true});
  }
})();
