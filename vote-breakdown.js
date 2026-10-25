(() => {
  'use strict';

  const fmt = (value) => new Intl.NumberFormat('pt-BR').format(Number(value || 0));
  const pct = (value) => `${Number(value || 0).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}%`;

  let lastResult = null;

  function applyVoteBreakdown(result) {
    if (!result || result.available === false) return;

    const summary = document.querySelector('#resultSummary .summary-metrics');
    if (!summary) return;

    const votes = result.votes || {};
    const blank = Number(votes.blank || 0);
    const nullVotes = Number(votes.null || 0);
    const blankPercentage = Number(votes.blankPercentage || 0);
    const nullPercentage = Number(votes.nullPercentage || 0);

    summary.classList.add('apura-vote-breakdown');

    summary.querySelectorAll('.vote-breakdown-metric').forEach((node) => node.remove());

    const combined = [...summary.querySelectorAll('.summary-metric')].find((metric) => {
      const label = metric.querySelector('span')?.textContent?.trim().toLowerCase() || '';
      return label === 'brancos + nulos' || label === 'brancos e nulos';
    });
    if (combined) combined.remove();

    const blankMetric = document.createElement('div');
    blankMetric.className = 'summary-metric vote-breakdown-metric vote-blank';
    blankMetric.innerHTML = `<span>Brancos</span><b>${fmt(blank)}</b><small>${pct(blankPercentage)}</small>`;

    const nullMetric = document.createElement('div');
    nullMetric.className = 'summary-metric vote-breakdown-metric vote-null';
    nullMetric.innerHTML = `<span>Nulos</span><b>${fmt(nullVotes)}</b><small>${pct(nullPercentage)}</small>`;

    summary.append(blankMetric, nullMetric);
  }

  function rememberAndApply(result) {
    lastResult = result || lastResult;
    applyVoteBreakdown(lastResult);
  }

  window.addEventListener('apura:result-year-loaded', (event) => {
    rememberAndApply(event.detail?.result);
  });

  window.addEventListener('apura:election-year-changed', (event) => {
    rememberAndApply(event.detail?.result);
  });

  const target = document.getElementById('resultSummary');
  if (target) {
    const observer = new MutationObserver(() => {
      if (lastResult && !target.querySelector('.vote-breakdown-metric')) {
        queueMicrotask(() => applyVoteBreakdown(lastResult));
      }
    });
    observer.observe(target, { childList: true, subtree: true });
  }
})();
