(() => {
  const root = document.documentElement;
  const coarse = () => window.matchMedia?.('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
  const narrow = () => window.matchMedia?.('(max-width: 900px)').matches || window.innerWidth <= 900;
  const tabletLike = () => coarse() && window.innerWidth <= 1180;

  function applyMode() {
    const isMobile = narrow() || tabletLike();
    const isPortrait = window.innerHeight >= window.innerWidth;
    root.classList.toggle('mobile-ui', isMobile);
    root.classList.toggle('mobile-portrait', isMobile && isPortrait);
    root.classList.toggle('mobile-landscape', isMobile && !isPortrait);
    root.dataset.uiMode = isMobile ? 'mobile' : 'desktop';
  }

  applyMode();
  let raf = 0;
  const refresh = () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(applyMode);
  };
  window.addEventListener('resize', refresh, { passive: true });
  window.addEventListener('orientationchange', refresh, { passive: true });
})();
