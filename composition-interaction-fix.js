(() => {
  'use strict';

  function senateActive() {
    return document.querySelector('.mode.active[data-office]')?.dataset.office === 'senador';
  }

  function fixSenateScenarioKeys(root = document) {
    if (!senateActive()) return;
    root.querySelectorAll?.('#scenarioControls [data-key^="P:"]').forEach(node => {
      node.dataset.key = `S:${String(node.dataset.key || '').slice(2)}`;
    });
  }

  function clearParliamentSelection() {
    const active = [...document.querySelectorAll('.chamber-legend .legend-item.ab-active')];
    active.forEach(item => item.click());
    document.querySelectorAll('.projected-panel.ab-party-filtered').forEach(panel => panel.classList.remove('ab-party-filtered'));
  }

  document.addEventListener('pointerdown', event => {
    const changing = event.target.closest('.mode[data-office],.simulation-mode,#ufSelect,#refreshProjection');
    if (changing) clearParliamentSelection();
  }, true);

  document.addEventListener('change', event => {
    if (event.target.matches('#ufSelect')) clearParliamentSelection();
  }, true);

  const observer = new MutationObserver(mutations => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (!(node instanceof Element)) continue;
        if (node.matches?.('#scenarioControls') || node.querySelector?.('#scenarioControls') || node.closest?.('#scenarioControls')) {
          fixSenateScenarioKeys(document);
          return;
        }
      }
    }
    fixSenateScenarioKeys(document);
  });

  function init() {
    observer.observe(document.body, { childList:true, subtree:true });
    fixSenateScenarioKeys();
    document.querySelector('.projection-controls')?.addEventListener('click', () => setTimeout(() => fixSenateScenarioKeys(), 0));
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once:true });
  else init();
})();
