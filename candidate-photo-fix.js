(() => {
  'use strict';

  const PRESIDENT_ELECTION = '/ele2026/6257/fotos/';

  function normalizePhoto(img) {
    if (!(img instanceof HTMLImageElement)) return;
    const raw = img.getAttribute('src') || '';
    if (!raw.includes(PRESIDENT_ELECTION)) return;
    const fixed = raw.replace(/(\/ele2026\/6257\/fotos\/)(?:ac|al|ap|am|ba|ce|df|es|go|ma|mt|ms|mg|pa|pb|pr|pe|pi|rj|rn|rs|ro|rr|sc|sp|se|to|zz)(\/)/i, '$1br$2');
    if (fixed === raw) return;
    img.removeAttribute('onerror');
    img.setAttribute('src', fixed);
    img.dataset.photoScopeFixed = 'br';
    img.addEventListener('error', () => img.remove(), { once: true });
  }

  function scan(root = document) {
    root.querySelectorAll?.('.candidate-avatar img, .highlight-photo img').forEach(normalizePhoto);
  }

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'attributes' && mutation.target instanceof HTMLImageElement) {
        normalizePhoto(mutation.target);
        continue;
      }
      for (const node of mutation.addedNodes) {
        if (!(node instanceof Element)) continue;
        if (node.matches?.('.candidate-avatar img, .highlight-photo img')) normalizePhoto(node);
        scan(node);
      }
    }
  });

  scan();
  observer.observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['src']});

  function isBroadcastEmbed(){
    try{return window.parent!==window&&window.parent.location.pathname.startsWith('/ao-vivo')}catch{return false}
  }

  function loadScriptOnce(src,dataAttribute){
    if(document.querySelector(`script[${dataAttribute}]`)) return;
    const script=document.createElement('script');
    script.src=src;
    script.defer=true;
    script.setAttribute(dataAttribute,'true');
    document.head.appendChild(script);
  }

  function installRaceBarLayoutFix(){
    if(document.getElementById('apuraRaceBarLayoutFix')) return;
    const style=document.createElement('style');
    style.id='apuraRaceBarLayoutFix';
    style.textContent=`
      html.broadcast-tv-readable .broadcast-summary-strip.broadcast-summary-strip--with-race{
        --ab-race-height:clamp(100px,10.4167vw,166px);
        height:calc(var(--ab-race-height) + 54px)!important;
        min-height:154px!important;
        max-height:220px!important;
        display:grid!important;
        grid-template-rows:var(--ab-race-height) 54px!important;
        align-items:stretch!important;
        gap:0!important;
        padding:4px 8px 0!important;
        overflow:hidden!important;
      }

      html.broadcast-tv-readable .broadcast-summary-strip.broadcast-summary-strip--with-race > .ab-race-tv{
        grid-row:1!important;
        width:100%!important;
        height:100%!important;
        min-height:0!important;
        max-height:none!important;
        aspect-ratio:auto!important;
        margin:0!important;
        border-radius:9px 9px 0 0!important;
      }

      html.broadcast-tv-readable .broadcast-summary-strip.broadcast-summary-strip--with-race > .broadcast-summary-metrics{
        grid-row:2!important;
        width:100%!important;
        height:54px!important;
        min-height:54px!important;
        max-height:54px!important;
      }

      html.broadcast-tv-readable .broadcast-candidates-column .mobile-map-bottom-results:has(> .ab-broadcast-media-fallback) .mobile-map-candidate-strip .mobile-map-candidate:nth-child(n+3){
        display:none!important;
      }

      @media(max-width:1100px){
        html.broadcast-tv-readable .broadcast-summary-strip.broadcast-summary-strip--with-race{
          --ab-race-height:clamp(92px,10.4167vw,118px);
          min-height:146px!important;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function loadBroadcastEnhancements(){
    try{
      if(!isBroadcastEmbed()) return;
      installRaceBarLayoutFix();
      document.querySelectorAll('script[data-broadcast-layout-controls]').forEach(node=>node.remove());
      loadScriptOnce('/broadcast-native-header-v2.js','data-broadcast-native-header-v2');
      loadScriptOnce('/broadcast-layout-controls-v2.js','data-broadcast-layout-controls-v2');
      loadScriptOnce('/broadcast-tv-typography.js','data-broadcast-tv-typography');
      loadScriptOnce('/broadcast-media-card-scale.js','data-broadcast-media-card-scale');
      loadScriptOnce('/election-race-bar-tv.js','data-election-race-bar-tv');
      window.__apuraBrasilBroadcastLoaderVersion='2.5.3';
    }catch{}
  }

  loadBroadcastEnhancements();
})();