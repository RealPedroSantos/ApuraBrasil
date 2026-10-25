(() => {
  'use strict';

  const fmt = (value) => new Intl.NumberFormat('pt-BR').format(Number(value || 0));
  const pct = (value) => `${Number(value || 0).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}%`;

  let lastResult = null;

  function fallbackPercentage(value, votes) {
    const total = Number(votes.valid || 0) + Number(votes.blank || 0) + Number(votes.null || 0);
    return total > 0 ? (Number(value || 0) / total) * 100 : 0;
  }

  function resolvedPercentage(rawValue, votes, value) {
    const raw = Number(rawValue);
    return Number.isFinite(raw) && raw >= 0 ? raw : fallbackPercentage(value, votes);
  }

  function ratioPercentage(rawValue, numerator, denominator) {
    const raw = Number(rawValue);
    if (Number.isFinite(raw) && raw >= 0) return raw;
    const den = Number(denominator || 0);
    return den > 0 ? (Number(numerator || 0) / den) * 100 : 0;
  }

  function removeLegacyMobileBreakdown() {
    document.querySelectorAll('#resultSummary .mobile-vote-breakdown').forEach((node) => node.remove());
  }

  function setMetricPercentage(summary, label, percentage) {
    const normalized = String(label || '').trim().toLowerCase();
    const metric = [...summary.querySelectorAll('.summary-metric')].find((node) => {
      return (node.querySelector('span')?.textContent?.trim().toLowerCase() || '') === normalized;
    });
    if (!metric) return;
    let small = metric.querySelector('small.vote-breakdown-percentage');
    if (!small) {
      small = document.createElement('small');
      small.className = 'vote-breakdown-percentage';
      metric.appendChild(small);
    }
    small.textContent = pct(percentage);
  }

  function applySummaryBreakdown(result) {
    const summary = document.querySelector('#resultSummary .summary-metrics');
    if (!summary) {
      removeLegacyMobileBreakdown();
      return;
    }

    const votes = result.votes || {};
    const electorate = result.electorate || {};

    const turnout = Number(electorate.turnout || 0);
    const abstentions = Number(electorate.abstentions || 0);
    const electorateTotal = Math.max(0, turnout + abstentions);

    const valid = Number(votes.valid || 0);
    const blank = Number(votes.blank || 0);
    const nullVotes = Number(votes.null || 0);
    const voteTotal = Math.max(0, valid + blank + nullVotes);

    const turnoutPercentage = ratioPercentage(
      electorate.turnoutPercentage ?? electorate.attendancePercentage,
      turnout,
      electorateTotal
    );
    const abstentionPercentage = ratioPercentage(
      electorate.abstentionPercentage ?? electorate.abstentionsPercentage,
      abstentions,
      electorateTotal
    );
    const validPercentage = ratioPercentage(votes.validPercentage, valid, voteTotal);
    const blankPercentage = resolvedPercentage(votes.blankPercentage, votes, blank);
    const nullPercentage = resolvedPercentage(votes.nullPercentage, votes, nullVotes);

    summary.classList.add('apura-vote-breakdown');
    summary.querySelectorAll('.vote-breakdown-metric').forEach((node) => node.remove());
    removeLegacyMobileBreakdown();

    const combined = [...summary.querySelectorAll('.summary-metric')].find((metric) => {
      const label = metric.querySelector('span')?.textContent?.trim().toLowerCase() || '';
      return label === 'brancos + nulos' || label === 'brancos e nulos';
    });
    if (combined) combined.remove();

    setMetricPercentage(summary, 'Comparecimento', turnoutPercentage);
    setMetricPercentage(summary, 'Abstenções', abstentionPercentage);
    setMetricPercentage(summary, 'Válidos', validPercentage);

    const blankMetric = document.createElement('div');
    blankMetric.className = 'summary-metric vote-breakdown-metric vote-blank';
    blankMetric.innerHTML = `<span>Brancos</span><b>${fmt(blank)}</b><small class="vote-breakdown-percentage">${pct(blankPercentage)}</small>`;

    const nullMetric = document.createElement('div');
    nullMetric.className = 'summary-metric vote-breakdown-metric vote-null';
    nullMetric.innerHTML = `<span>Nulos</span><b>${fmt(nullVotes)}</b><small class="vote-breakdown-percentage">${pct(nullPercentage)}</small>`;

    summary.append(blankMetric, nullMetric);
  }

  function auxVoteCard({ kind, title, subtitle, status, icon, color, votes, percentage }) {
    const width = Math.max(0, Math.min(100, Number(percentage || 0)));
    return `
      <article class="candidate-card candidate-card--aux candidate-card--${kind}" style="--aux-vote-color:${color}">
        <div class="candidate-avatar candidate-avatar--aux">
          <span class="avatar-fallback aux-vote-icon">${icon}</span>
        </div>
        <div class="candidate-main">
          <div class="candidate-name">${title}</div>
          <div class="candidate-subline">
            <span class="party-chip aux-vote-chip">TSE</span>
            <span class="candidate-number">${subtitle}</span>
          </div>
          <div class="candidate-bar aux-vote-bar">
            <i style="width:${width}%"></i>
            <span>${fmt(votes)} votos</span>
          </div>
        </div>
        <div class="candidate-score">
          <strong>${pct(percentage)}</strong>
          <small>${fmt(votes)} votos</small>
          <span class="candidate-status aux-vote-status">${status}</span>
        </div>
      </article>`;
  }

  function applyAuxVoteCards(result) {
    const list = document.getElementById('candidateList');
    if (!list) return;

    list.querySelectorAll('.candidate-card--aux').forEach((node) => node.remove());

    const votes = result.votes || {};
    const blank = Number(votes.blank || 0);
    const nullVotes = Number(votes.null || 0);
    const blankPercentage = resolvedPercentage(votes.blankPercentage, votes, blank);
    const nullPercentage = resolvedPercentage(votes.nullPercentage, votes, nullVotes);

    if ((blank > 0 || nullVotes > 0) && !list.querySelector('.candidate-card')) {
      list.querySelectorAll('.empty-state').forEach((node) => node.remove());
    }

    const cards = [
      auxVoteCard({
        kind: 'blank',
        title: 'BRANCOS',
        subtitle: 'Votos em branco',
        status: 'VOTO EM BRANCO',
        icon: 'B',
        color: '#94a3b8',
        votes: blank,
        percentage: blankPercentage
      }),
      auxVoteCard({
        kind: 'null',
        title: 'NULOS',
        subtitle: 'Votos nulos',
        status: 'VOTO NULO',
        icon: 'N',
        color: '#6b7280',
        votes: nullVotes,
        percentage: nullPercentage
      })
    ].join('');

    list.insertAdjacentHTML('beforeend', cards);
  }

  function applyVoteBreakdown(result) {
    if (!result || result.available === false) {
      removeLegacyMobileBreakdown();
      return;
    }
    applySummaryBreakdown(result);
    applyAuxVoteCards(result);
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

  window.addEventListener('apura:historical-result-loaded', (event) => {
    rememberAndApply(event.detail?.result);
  });

  window.addEventListener('resize', () => {
    if (lastResult) requestAnimationFrame(() => applyVoteBreakdown(lastResult));
  }, { passive:true });

  window.addEventListener('orientationchange', () => {
    if (lastResult) setTimeout(() => applyVoteBreakdown(lastResult), 80);
  }, { passive:true });

  const summaryTarget = document.getElementById('resultSummary');
  if (summaryTarget) {
    const summaryObserver = new MutationObserver(() => {
      if (lastResult) queueMicrotask(() => applySummaryBreakdown(lastResult));
    });
    summaryObserver.observe(summaryTarget, { childList: true, subtree: true });
  }

  const candidateTarget = document.getElementById('candidateList');
  if (candidateTarget) {
    const candidateObserver = new MutationObserver(() => {
      if (lastResult && !candidateTarget.querySelector('.candidate-card--aux')) {
        queueMicrotask(() => applyAuxVoteCards(lastResult));
      }
    });
    candidateObserver.observe(candidateTarget, { childList: true, subtree: false });
  }
})();
