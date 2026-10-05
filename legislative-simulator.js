(() => {
  'use strict';

  const FEDERAL_SEATS = Object.freeze({
    AC:8, AL:9, AP:8, AM:8, BA:39, CE:22, DF:8, ES:10, GO:17,
    MA:18, MT:8, MS:8, MG:53, PA:17, PB:12, PR:30, PE:25, PI:10,
    RJ:46, RN:8, RS:31, RO:8, RR:8, SC:16, SP:70, SE:8, TO:8
  });

  const n = value => Number.isFinite(Number(value)) ? Number(value) : 0;
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  function stateSeats(uf, office) {
    const federal = FEDERAL_SEATS[String(uf || '').toUpperCase()] || 0;
    if (office === 'deputado-federal') return federal;
    if (office === 'deputado-estadual') return federal <= 12 ? federal * 3 : federal + 24;
    return 0;
  }

  function electoralQuotient(validVotes, seats) {
    if (!seats || !validVotes) return 0;
    const raw = validVotes / seats;
    const base = Math.floor(raw);
    return base + ((raw - base) > 0.5 ? 1 : 0);
  }

  function groupKey(group) {
    return String(group?.name || group?.composition || (group?.parties || []).join(' + ') || 'Sem agrupamento');
  }

  function candidateKey(candidate, uf) {
    return `${String(uf || '').toUpperCase()}|${candidate.sequence || candidate.number || candidate.ballotName || candidate.name || ''}`;
  }

  function normalizedGroups(result, modifiers = {}) {
    const candidates = Array.isArray(result?.candidates) ? result.candidates : [];
    return (result?.groups || []).map(raw => {
      const key = groupKey(raw);
      const multiplier = clamp(n(modifiers[key]) || 1, 0.05, 20);
      const groupCandidates = candidates
        .filter(c => String(c.coalition || '') === String(raw.name || ''))
        .map(c => ({ ...c, votes: Math.max(0, n(c.votes) * multiplier) }))
        .sort((a,b) => n(b.votes) - n(a.votes) || String(a.ballotName || a.name).localeCompare(String(b.ballotName || b.name), 'pt-BR'));
      return {
        key,
        name: raw.name || key,
        composition: raw.composition || '',
        parties: raw.parties || [],
        votes: Math.max(0, n(raw.votes) * multiplier),
        multiplier,
        candidates: groupCandidates,
        qp: 0,
        calcSeats: 0,
        filledSeats: 0,
        winners: []
      };
    });
  }

  function allocateProportional(result, seats, modifiers = {}, uf = '') {
    const groups = normalizedGroups(result, modifiers).filter(g => g.votes > 0 || g.candidates.length);
    const validVotes = groups.reduce((sum, g) => sum + g.votes, 0) || n(result?.votes?.valid);
    const qe = electoralQuotient(validVotes, seats);
    const winners = [];

    if (!seats || !groups.length || !qe) {
      return { winners, groups, allocations: [], validVotes, qe, seats, filled: 0 };
    }

    for (const group of groups) {
      group.qp = Math.floor(group.votes / qe);
      group.calcSeats = group.qp;
      const eligible10 = group.candidates.filter(c => n(c.votes) >= qe * 0.10);
      const count = Math.min(group.qp, eligible10.length);
      for (let i = 0; i < count; i++) {
        const candidate = eligible10[i];
        const winner = { ...candidate, uf, allocation: group.name, allocationKey: group.key, seatMethod: 'QP' };
        group.winners.push(winner);
        winners.push(winner);
        group.filledSeats++;
      }
    }

    const alreadyWon = group => new Set(group.winners.map(c => candidateKey(c, uf)));
    const nextCandidate = (group, minimum) => {
      const won = alreadyWon(group);
      return group.candidates.find(c => !won.has(candidateKey(c, uf)) && n(c.votes) >= minimum) || null;
    };

    while (winners.length < seats) {
      const eligible = groups
        .map(group => ({ group, candidate: nextCandidate(group, qe * 0.20), average: group.votes / (group.calcSeats + 1) }))
        .filter(x => x.group.votes >= qe * 0.80 && x.candidate)
        .sort((a,b) => b.average - a.average || b.group.votes - a.group.votes || n(b.candidate.votes) - n(a.candidate.votes));
      if (!eligible.length) break;
      const chosen = eligible[0];
      const winner = { ...chosen.candidate, uf, allocation: chosen.group.name, allocationKey: chosen.group.key, seatMethod: 'SOBRA_80_20' };
      chosen.group.winners.push(winner);
      chosen.group.filledSeats++;
      chosen.group.calcSeats++;
      winners.push(winner);
    }

    while (winners.length < seats) {
      const eligible = groups
        .map(group => ({ group, candidate: nextCandidate(group, 0), average: group.votes / (group.calcSeats + 1) }))
        .filter(x => x.candidate)
        .sort((a,b) => b.average - a.average || b.group.votes - a.group.votes || n(b.candidate.votes) - n(a.candidate.votes));
      if (!eligible.length) break;
      const chosen = eligible[0];
      const winner = { ...chosen.candidate, uf, allocation: chosen.group.name, allocationKey: chosen.group.key, seatMethod: 'SOBRA_GERAL' };
      chosen.group.winners.push(winner);
      chosen.group.filledSeats++;
      chosen.group.calcSeats++;
      winners.push(winner);
    }

    const allocations = groups
      .map(g => ({ key:g.key, name:g.name, composition:g.composition, votes:g.votes, qp:g.qp, seats:g.winners.length }))
      .sort((a,b) => b.seats - a.seats || b.votes - a.votes);

    return { winners, groups, allocations, validVotes, qe, seats, filled:winners.length };
  }

  function projectSenate(result, uf, partyModifiers = {}) {
    const candidates = (result?.candidates || []).map(candidate => {
      const multiplier = clamp(n(partyModifiers[candidate.party]) || 1, 0.05, 20);
      return { ...candidate, votes: Math.max(0, n(candidate.votes) * multiplier), uf, allocation:candidate.party, allocationKey:candidate.party, seatMethod:'MAJORITARIO' };
    }).sort((a,b) => n(b.votes) - n(a.votes) || String(a.ballotName || a.name).localeCompare(String(b.ballotName || b.name), 'pt-BR'));
    return { winners:candidates.slice(0,2), candidates };
  }

  function partyCounts(winners) {
    const map = new Map();
    for (const winner of winners || []) {
      const party = winner.party || 'Sem sigla';
      map.set(party, (map.get(party) || 0) + 1);
    }
    return [...map.entries()].sort((a,b) => b[1] - a[1] || a[0].localeCompare(b[0], 'pt-BR'));
  }

  function aggregateGroupShares(results) {
    const totals = new Map();
    let grand = 0;
    for (const {result} of results || []) {
      for (const group of result?.groups || []) {
        const key = groupKey(group);
        const votes = n(group.votes);
        grand += votes;
        totals.set(key, (totals.get(key) || 0) + votes);
      }
    }
    return [...totals.entries()]
      .map(([key,votes]) => ({key,votes,share:grand ? votes / grand * 100 : 0}))
      .sort((a,b) => b.votes - a.votes);
  }

  function aggregateSenatePartyShares(results) {
    const totals = new Map();
    let grand = 0;
    for (const {result} of results || []) {
      for (const candidate of result?.candidates || []) {
        const party = candidate.party || 'Sem sigla';
        const votes = n(candidate.votes);
        grand += votes;
        totals.set(party, (totals.get(party) || 0) + votes);
      }
    }
    return [...totals.entries()]
      .map(([key,votes]) => ({key,votes,share:grand ? votes / grand * 100 : 0}))
      .sort((a,b) => b.votes - a.votes);
  }

  function normalRandom() {
    let u = 0, v = 0;
    while (!u) u = Math.random();
    while (!v) v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  function quantile(sorted, p) {
    if (!sorted.length) return 0;
    const index = (sorted.length - 1) * p;
    const lo = Math.floor(index), hi = Math.ceil(index);
    if (lo === hi) return sorted[lo];
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (index - lo);
  }

  function progressFor(result) {
    return clamp(n(result?.sections?.percentage) / 100, 0, 1);
  }

  function monteCarloProportional(results, office, iterations = 250) {
    const partySamples = new Map();
    const candidateHits = new Map();
    const candidateMeta = new Map();
    const runs = Math.max(50, Math.min(800, Math.floor(iterations)));

    for (let run = 0; run < runs; run++) {
      const winners = [];
      for (const item of results || []) {
        const progress = progressFor(item.result);
        const sigma = 0.16 * Math.sqrt(Math.max(0.01, 1 - progress));
        const modifiers = {};
        for (const group of item.result?.groups || []) modifiers[groupKey(group)] = Math.exp(normalRandom() * sigma);
        const projected = allocateProportional(item.result, stateSeats(item.uf, office), modifiers, item.uf);
        winners.push(...projected.winners);
      }
      const counts = new Map(partyCounts(winners));
      const allParties = new Set([...partySamples.keys(), ...counts.keys()]);
      for (const party of allParties) {
        if (!partySamples.has(party)) partySamples.set(party, Array(run).fill(0));
        partySamples.get(party).push(counts.get(party) || 0);
      }
      for (const winner of winners) {
        const key = candidateKey(winner, winner.uf);
        candidateHits.set(key, (candidateHits.get(key) || 0) + 1);
        if (!candidateMeta.has(key)) candidateMeta.set(key, winner);
      }
    }

    for (const samples of partySamples.values()) while (samples.length < runs) samples.push(0);

    const partyStats = [...partySamples.entries()].map(([party,samples]) => {
      samples.sort((a,b) => a-b);
      return { party, p10:Math.round(quantile(samples,.10)), median:Math.round(quantile(samples,.50)), p90:Math.round(quantile(samples,.90)) };
    }).sort((a,b) => b.median - a.median || b.p90 - a.p90);

    const candidateChance = [...candidateHits.entries()].map(([key,hits]) => ({
      key, chance:hits / runs * 100, candidate:candidateMeta.get(key)
    })).sort((a,b) => b.chance - a.chance || n(b.candidate?.votes) - n(a.candidate?.votes));

    return { runs, partyStats, candidateChance };
  }

  function monteCarloSenate(results, iterations = 250) {
    const partySamples = new Map();
    const candidateHits = new Map();
    const candidateMeta = new Map();
    const runs = Math.max(50, Math.min(800, Math.floor(iterations)));

    for (let run = 0; run < runs; run++) {
      const winners = [];
      for (const item of results || []) {
        const progress = progressFor(item.result);
        const sigma = 0.18 * Math.sqrt(Math.max(0.01, 1 - progress));
        const simulated = (item.result?.candidates || []).map(c => ({...c, uf:item.uf, votes:n(c.votes) * Math.exp(normalRandom() * sigma)}))
          .sort((a,b) => n(b.votes)-n(a.votes));
        winners.push(...simulated.slice(0,2));
      }
      const counts = new Map(partyCounts(winners));
      const allParties = new Set([...partySamples.keys(), ...counts.keys()]);
      for (const party of allParties) {
        if (!partySamples.has(party)) partySamples.set(party, Array(run).fill(0));
        partySamples.get(party).push(counts.get(party) || 0);
      }
      for (const winner of winners) {
        const key = candidateKey(winner, winner.uf);
        candidateHits.set(key, (candidateHits.get(key) || 0) + 1);
        if (!candidateMeta.has(key)) candidateMeta.set(key, winner);
      }
    }

    for (const samples of partySamples.values()) while (samples.length < runs) samples.push(0);
    const partyStats = [...partySamples.entries()].map(([party,samples]) => {
      samples.sort((a,b) => a-b);
      return { party, p10:Math.round(quantile(samples,.10)), median:Math.round(quantile(samples,.50)), p90:Math.round(quantile(samples,.90)) };
    }).sort((a,b) => b.median-a.median);
    const candidateChance = [...candidateHits.entries()].map(([key,hits]) => ({key,chance:hits/runs*100,candidate:candidateMeta.get(key)}))
      .sort((a,b) => b.chance-a.chance || n(b.candidate?.votes)-n(a.candidate?.votes));
    return { runs, partyStats, candidateChance };
  }

  window.ApuraLegislativeSimulator = {
    FEDERAL_SEATS,
    stateSeats,
    electoralQuotient,
    groupKey,
    candidateKey,
    allocateProportional,
    projectSenate,
    partyCounts,
    aggregateGroupShares,
    aggregateSenatePartyShares,
    monteCarloProportional,
    monteCarloSenate
  };
})();
