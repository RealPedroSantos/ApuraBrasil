(() => {
  'use strict';

  const LIVE_DATES = new Set(['2026-10-04','2026-10-25']);

  function saoPauloDateKey(date = new Date()) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).formatToParts(date);
    const map = Object.fromEntries(parts.map(part => [part.type, part.value]));
    return `${map.year}-${map.month}-${map.day}`;
  }

  function isElectionLiveDay() {
    return LIVE_DATES.has(saoPauloDateKey());
  }

  window.ApuraBrasilRefreshPolicy = {
    isElectionLiveDay,
    electionDates: [...LIVE_DATES]
  };

  if (isElectionLiveDay()) return;

  const nativeSetInterval = window.setInterval.bind(window);
  window.setInterval = function(callback, delay, ...args) {
    const ms = Number(delay || 0);
    const source = typeof callback === 'function' ? Function.prototype.toString.call(callback) : String(callback || '');
    const isElectionPolling = ms >= 25000 && ms <= 35000 && /\b(loadResult|loadProjection)\b/.test(source);
    if (isElectionPolling) {
      return nativeSetInterval(() => {}, 24 * 60 * 60 * 1000);
    }
    return nativeSetInterval(callback, delay, ...args);
  };
})();
