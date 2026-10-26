(()=>{
  'use strict';

  try{
    if(window.parent===window||!window.parent.location.pathname.startsWith('/ao-vivo'))return;
  }catch{return;}

  if(window.__apuraBrasilRaceBarShell)return;
  window.__apuraBrasilRaceBarShell=true;

  function installStyle(){
    if(document.getElementById('apuraElectionRaceBarStyle'))return;
    const style=document.createElement('style');
    style.id='apuraElectionRaceBarStyle';
    style.textContent=`
      .ab-race-tv{position:relative;width:100%;height:100%;min-height:0;margin:0;overflow:hidden;background:#f7f8fa;border:1px solid #cfd4dc;border-radius:10px;font-family:Inter,ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif;isolation:isolate}
      .ab-race-tv *{box-sizing:border-box}
      .ab-race-photo{position:absolute;top:4%;bottom:4%;width:8.8%;z-index:12;overflow:hidden;background:#fff;border:1px solid #aeb7c7;border-radius:12px}
      .ab-race-photo.left{left:.7%}.ab-race-photo.right{right:.7%}
      .ab-race-photo img{width:100%;height:100%;display:block;object-fit:contain;object-position:center bottom;background:#fff}
      .ab-race-fallback{width:100%;height:100%;display:grid;place-items:center;background:#e8ecf1;color:#596273;font-size:clamp(15px,1.4vw,24px);font-weight:950}
      .ab-race-head{position:absolute;top:4%;height:18%;z-index:11;display:flex;align-items:center;gap:6px;color:#4c5262;font-size:clamp(10px,.88vw,16px);font-weight:950;line-height:1;white-space:nowrap;overflow:hidden;max-width:36%}
      .ab-race-head.left{left:10.3%}.ab-race-head.right{right:10.3%;justify-content:flex-end;text-align:right}
      .ab-race-name{overflow:hidden;text-overflow:ellipsis}.ab-race-party{flex:none;padding:2px 6px;border-radius:5px;color:#fff;font-size:.72em;line-height:1}
      .ab-race-center-label{position:absolute;left:50%;top:4%;transform:translateX(-50%);z-index:14;color:#737b88;font-size:clamp(8px,.68vw,12px);font-weight:800}
      .ab-race-track{position:absolute;left:9.55%;right:9.55%;top:24%;height:53%;overflow:hidden;background:#e7e9ed;z-index:2}
      .ab-race-fill{position:absolute;top:0;height:100%;will-change:width;transition:width 900ms cubic-bezier(.2,.82,.2,1)}
      .ab-race-fill.left{left:0;width:50%;background:#211792}.ab-race-fill.right{right:0;width:50%;background:#d31736}
      .ab-race-fill::after{content:"";position:absolute;inset:0;opacity:.16;background:linear-gradient(110deg,transparent 0 35%,rgba(255,255,255,.7) 48%,transparent 61%);transform:translateX(-125%)}
      .ab-race-fill.updating::after{animation:abRaceSheen .75s ease}@keyframes abRaceSheen{to{transform:translateX(125%)}}
      .ab-race-midline{position:absolute;left:50%;top:24%;height:53%;width:2px;transform:translateX(-50%);background:rgba(255,255,255,.98);z-index:7}
      .ab-race-cross{position:absolute;left:50%;top:24%;height:53%;width:15px;transform:translateX(-50%);opacity:0;z-index:8;background:linear-gradient(90deg,transparent,rgba(255,255,255,.96),transparent)}
      .ab-race-cross.fire{animation:abRaceCross .9s ease}@keyframes abRaceCross{0%{opacity:0;filter:blur(4px)}45%{opacity:1;filter:blur(0)}100%{opacity:0;filter:blur(4px)}}
      .ab-race-pct{position:absolute;top:27%;z-index:10;color:#fff;font-weight:950;font-size:clamp(28px,3.15vw,56px);line-height:1;letter-spacing:-.055em;white-space:nowrap;text-shadow:0 1px 2px rgba(0,0,0,.18)}
      .ab-race-pct.left{left:10.6%}.ab-race-pct.right{right:10.6%}.ab-race-pct small{font-size:.43em;letter-spacing:0;margin-left:2px}
      .ab-race-foot{position:absolute;left:10.3%;right:10.3%;bottom:3%;height:15%;z-index:10;display:grid;grid-template-columns:1fr auto 1fr;align-items:end;gap:8px;color:#4d5362;font-size:clamp(7px,.66vw,12px);font-weight:800;line-height:1;white-space:nowrap}
      .ab-race-foot .right{text-align:right}.ab-race-foot .diff{text-align:center}.ab-race-foot b{font-weight:950;margin-left:4px}
      .ab-race-leader{position:absolute;left:50%;top:1%;transform:translate(-50%,-130%);z-index:20;opacity:0;padding:3px 9px;border-radius:999px;color:#fff;font-size:clamp(7px,.58vw,10px);font-weight:950;letter-spacing:.04em;white-space:nowrap}
      .ab-race-leader.show{animation:abRaceLeader 1250ms cubic-bezier(.2,.82,.2,1)}@keyframes abRaceLeader{0%{opacity:0;transform:translate(-50%,-130%) scale(.86)}24%{opacity:1;transform:translate(-50%,0) scale(1)}72%{opacity:1;transform:translate(-50%,0)}100%{opacity:0;transform:translate(-50%,-25%)}}
      .ab-race-leading{animation:abRacePulse .9s ease}@keyframes abRacePulse{50%{filter:brightness(1.22)}}
      @media(max-width:900px){.ab-race-pct{font-size:30px}.ab-race-foot{font-size:7px}}
      @media(prefers-reduced-motion:reduce){.ab-race-fill{transition:none!important}.ab-race-tv *{animation-duration:.001ms!important;animation-iteration-count:1!important}}
    `;
    document.head.appendChild(style);
  }

  function createBar(){
    const bar=document.createElement('div');
    bar.className='ab-race-tv';
    bar.id='apuraElectionRaceBar';
    bar.setAttribute('aria-label','Comparativo nacional dos dois principais candidatos');
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

  function ensureBar(){
    installStyle();
    const metrics=document.querySelector('.summary-metrics');
    if(!metrics)return null;
    const host=metrics.parentNode;
    if(host?.classList?.contains('broadcast-summary-strip'))host.classList.add('broadcast-summary-strip--with-race');
    let bar=document.getElementById('apuraElectionRaceBar');
    if(!bar){
      bar=createBar();
      host.insertBefore(bar,metrics);
      document.dispatchEvent(new CustomEvent('apura:racebar-ready'));
    }else if(bar.parentNode!==host||bar.nextElementSibling!==metrics){
      host.insertBefore(bar,metrics);
    }
    return bar;
  }

  if(ensureBar())return;
  let attempts=0;
  const timer=setInterval(()=>{
    attempts++;
    if(ensureBar()||attempts>=20)clearInterval(timer);
  },150);
})();