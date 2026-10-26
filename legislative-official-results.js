(() => {
  'use strict';

  const S = window.ApuraLegislativeSimulator;
  if (!S || S.__apuraOfficialResultsPatched) return;

  const originalAllocateProportional = S.allocateProportional.bind(S);
  const originalProjectSenate = S.projectSenate.bind(S);

  const hasModifiers = modifiers => Object.keys(modifiers || {}).some(key => {
    const value = Number(modifiers[key]);
    return Number.isFinite(value) && Math.abs(value - 1) > 0.000001;
  });

  const isOfficialElected = candidate =>
    String(candidate?.electedFlag || '').trim().toLowerCase() === 's';

  function officialWinners(result, seats, uf, seatMethod) {
    const elected = (result?.candidates || []).filter(isOfficialElected);
    if (!seats || elected.length !== seats) return null;

    return elected
      .slice()
      .sort((a, b) => Number(b.votes || 0) - Number(a.votes || 0))
      .map(candidate => ({
        ...candidate,
        uf,
        allocation: candidate.coalition || candidate.party || 'TSE',
        allocationKey: candidate.coalition || candidate.party || 'TSE',
        seatMethod
      }));
  }

  S.allocateProportional = function(result, seats, modifiers = {}, uf = '') {
    const calculated = originalAllocateProportional(result, seats, modifiers, uf);
    if (hasModifiers(modifiers)) return calculated;

    const official = officialWinners(result, Number(seats || 0), uf, 'OFICIAL_TSE');
    if (!official) return calculated;

    return {
      ...calculated,
      winners: official,
      filled: official.length,
      official: true,
      officialSource: 'TSE'
    };
  };

  S.projectSenate = function(result, uf, partyModifiers = {}) {
    const calculated = originalProjectSenate(result, uf, partyModifiers);
    if (hasModifiers(partyModifiers)) return calculated;

    const official = officialWinners(result, 2, uf, 'OFICIAL_TSE');
    if (!official) return calculated;

    return {
      ...calculated,
      winners: official,
      official: true,
      officialSource: 'TSE'
    };
  };

  S.__apuraOfficialResultsPatched = true;
  window.ApuraOfficialLegislative = {
    source: 'TSE',
    mode: 'official-when-complete',
    isOfficialElected
  };
})();
