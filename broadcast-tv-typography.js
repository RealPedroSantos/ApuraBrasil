(() => {
  'use strict';

  if (window.__apuraBrasilBroadcastTvTypographyInstalled) return;

  function isBroadcastEmbed() {
    try {
      return window.parent !== window && window.parent.location.pathname.startsWith('/ao-vivo');
    } catch {
      return false;
    }
  }

  if (!isBroadcastEmbed()) return;
  window.__apuraBrasilBroadcastTvTypographyInstalled = true;

  const style = document.createElement('style');
  style.id = 'broadcastTvTypographyStyle';
  style.textContent = `
    /* Central ao vivo — microtipografia otimizada para leitura à distância/TV. */
    html.broadcast-tv-readable .eyebrow,
    html.broadcast-tv-readable .summary-heading p,
    html.broadcast-tv-readable .total-main small,
    html.broadcast-tv-readable .total-state b,
    html.broadcast-tv-readable .total-state span,
    html.broadcast-tv-readable .section-counter span,
    html.broadcast-tv-readable .section-counter small,
    html.broadcast-tv-readable .summary-metric span {
      font-size:clamp(12px,.82vw,15px)!important;
      line-height:1.15!important;
      font-weight:800!important;
      letter-spacing:.015em!important;
    }

    html.broadcast-tv-readable .summary-metric b {
      font-size:clamp(15px,1.02vw,19px)!important;
      line-height:1.08!important;
      font-weight:900!important;
    }

    html.broadcast-tv-readable .summary-metric.vote-breakdown-metric small {
      display:block!important;
      margin-top:2px!important;
      font-size:clamp(11px,.75vw,14px)!important;
      line-height:1.05!important;
      font-weight:800!important;
    }

    html.broadcast-tv-readable .section-counter {
      min-height:58px!important;
      row-gap:2px!important;
    }

    html.broadcast-tv-readable .section-counter strong {
      font-size:clamp(23px,1.65vw,31px)!important;
    }

    html.broadcast-tv-readable .candidate-number,
    html.broadcast-tv-readable .candidate-status {
      font-size:clamp(11px,.78vw,14px)!important;
      line-height:1.08!important;
    }

    html.broadcast-tv-readable .party-chip {
      font-size:clamp(12px,.82vw,16px)!important;
      min-height:clamp(21px,1.65vw,27px)!important;
    }

    html.broadcast-tv-readable .candidate-bar span {
      font-size:clamp(12px,.82vw,15px)!important;
      line-height:1!important;
    }

    html.broadcast-tv-readable .details-tabs button,
    html.broadcast-tv-readable .detail-tab {
      font-size:clamp(11px,.78vw,14px)!important;
      font-weight:850!important;
    }

    html.broadcast-tv-readable .mobile-map-count span,
    html.broadcast-tv-readable .mobile-map-candidate-meta,
    html.broadcast-tv-readable .mobile-map-candidate-votes,
    html.broadcast-tv-readable .mobile-map-swipe-hint {
      font-size:clamp(11px,.76vw,14px)!important;
      line-height:1.08!important;
      font-weight:800!important;
    }

    html.broadcast-tv-readable .mobile-map-count strong {
      font-size:clamp(17px,1.15vw,22px)!important;
    }

    html.broadcast-tv-readable .mobile-map-candidate-party {
      font-size:clamp(11px,.74vw,14px)!important;
      min-height:21px!important;
    }

    html.broadcast-tv-readable .map-note,
    html.broadcast-tv-readable .breadcrumb,
    html.broadcast-tv-readable .geo-note {
      font-size:clamp(11px,.72vw,13px)!important;
      line-height:1.15!important;
    }

    /* Evita que o ganho de legibilidade crie estouro horizontal. */
    html.broadcast-tv-readable .summary-metric,
    html.broadcast-tv-readable .section-counter,
    html.broadcast-tv-readable .candidate-main,
    html.broadcast-tv-readable .mobile-map-candidate-body {
      min-width:0!important;
    }

    @media(max-width:1200px){
      html.broadcast-tv-readable .eyebrow,
      html.broadcast-tv-readable .summary-heading p,
      html.broadcast-tv-readable .total-main small,
      html.broadcast-tv-readable .total-state b,
      html.broadcast-tv-readable .total-state span,
      html.broadcast-tv-readable .section-counter span,
      html.broadcast-tv-readable .section-counter small,
      html.broadcast-tv-readable .summary-metric span {
        font-size:12px!important;
      }
      html.broadcast-tv-readable .summary-metric b{font-size:15px!important}
    }
  `;
  document.head.appendChild(style);
  document.documentElement.classList.add('broadcast-tv-readable');
})();
