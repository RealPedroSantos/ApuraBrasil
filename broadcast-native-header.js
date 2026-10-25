(() => {
  'use strict';

  if (window.__apuraBrasilNativeBroadcastHeaderInstalled) return;

  function isBroadcastEmbed() {
    try {
      return window.parent !== window && window.parent.location.pathname.startsWith('/ao-vivo');
    } catch {
      return false;
    }
  }

  if (!isBroadcastEmbed()) return;
  window.__apuraBrasilNativeBroadcastHeaderInstalled = true;

  function cleanParentHeader() {
    try {
      const parentDoc = window.parent.document;
      parentDoc.querySelectorAll('.studio-head, .broadcast-office-switch').forEach(node => node.remove());

      const frame = parentDoc.querySelector('.broadcast-frame');
      if (frame) {
        frame.style.setProperty('grid-template-rows', 'minmax(0,1fr) 33.333333%', 'important');
      }

      const oldStyle = parentDoc.getElementById('broadcastWhiteHeaderStyleV2');
      if (oldStyle) oldStyle.remove();
    } catch {}
  }

  function restoreNativeHeader() {
    const shell = document.querySelector('.app-shell');
    if (shell) {
      shell.style.setProperty('width', '100%', 'important');
      shell.style.setProperty('height', '100vh', 'important');
      shell.style.setProperty('min-height', '0', 'important');
      shell.style.setProperty('display', 'grid', 'important');
      shell.style.setProperty('grid-template-rows', 'auto minmax(0,1fr)', 'important');
      shell.style.setProperty('gap', '0', 'important');
      shell.style.setProperty('padding', '0', 'important');
      shell.style.setProperty('overflow', 'hidden', 'important');
    }

    const topbar = document.querySelector('.topbar');
    if (topbar) {
      topbar.style.setProperty('display', 'grid', 'important');
      topbar.style.setProperty('visibility', 'visible', 'important');
      topbar.style.setProperty('opacity', '1', 'important');
      topbar.style.setProperty('position', 'relative', 'important');
      topbar.style.setProperty('z-index', '40', 'important');
      topbar.removeAttribute('aria-hidden');
    }

    const officeNav = document.querySelector('.office-nav');
    if (officeNav) {
      officeNav.style.setProperty('display', 'flex', 'important');
      officeNav.style.setProperty('visibility', 'visible', 'important');
      officeNav.style.setProperty('opacity', '1', 'important');
    }

    const roundSelector = document.querySelector('.round-selector');
    if (roundSelector) {
      roundSelector.style.setProperty('display', 'flex', 'important');
      roundSelector.style.setProperty('visibility', 'visible', 'important');
      roundSelector.style.setProperty('opacity', '1', 'important');
    }

    document.querySelector('.status-bar')?.style.setProperty('display', 'none', 'important');
    document.querySelector('.mobile-app-nav')?.style.setProperty('display', 'none', 'important');
  }

  function enforce() {
    cleanParentHeader();
    restoreNativeHeader();
  }

  enforce();
  requestAnimationFrame(enforce);
  setTimeout(enforce, 120);
  setTimeout(enforce, 450);
  setTimeout(enforce, 1200);
  setInterval(enforce, 1500);

  new MutationObserver(enforce).observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['style', 'class']
  });
})();
