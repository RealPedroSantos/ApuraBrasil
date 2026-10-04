(() => {
  'use strict';

  const state = {
    office: 'presidente',
    level: 'br',
    selectedState: null,
    selectedMunicipality: null,
    selectedDistrict: null,
    states: [],
    municipalities: [],
    districts: [],
    stateWinners: {}
  };

  const OFFICE_LABELS = {
    presidente: 'Presidente',
    governador: 'Governador',
    senador: 'Senador',
    'deputado-federal': 'Deputado Federal',
    'deputado-estadual': 'Deputado Estadual'
  };

  const PARTY_COLORS = {
    PT:'#c73549', PL:'#3866ba', PSD:'#d6a634', NOVO:'#ef7d23', MDB:'#3aa36d',
    PSOL:'#d4a72c', PDT:'#d9554b', PSB:'#d9a22d', PP:'#3576c9', 'UNIÃO':'#2781b5',
    REPUBLICANOS:'#568aca', AVANTE:'#8b63ad', PCB:'#a52d3b', PSTU:'#bf3542', UP:'#ad3947',
    PCO:'#8d2836', DC:'#298f82', 'MISSÃO':'#7b5d4d', DEMOCRATA:'#26939b'
  };

  const STATE_LAYOUT = {
    RR:[39,12,48], AP:[65,14,46], AM:[30,27,62], PA:[53,27,62], AC:[16,37,43],
    RO:[28,43,46], MT:[42,51,61], TO:[55,43,44], MA:[68,31,46], PI:[74,40,42],
    CE:[83,35,40], RN:[90,38,34], PB:[90,44,34], PE:[85,49,39], AL:[89,55,32],
    SE:[85,61,32], BA:[72,57,58], GO:[54,58,49], DF:[60,55,29], MS:[42,67,48],
    MG:[62,67,58], ES:[76,69,34], RJ:[70,76,35], SP:[55,76,57], PR:[52,84,46],
    SC:[55,90,37], RS:[49,95,48]
  };

  const els = {
    feedStatus: document.getElementById('feedStatus'),
    clock: document.getElementById('clock'),
    map: document.getElementById('map'),
    mapTitle: document.getElementById('mapTitle'),
    mapSubtitle: document.getElementById('mapSubtitle'),
    breadcrumb: document.getElementById('breadcrumb'),
    scopeTitle: document.getElementById('scopeTitle'),
    scopeSubtitle: document.getElementById('scopeSubtitle'),
    resultSummary: document.getElementById('resultSummary'),
    candidateList: document.getElementById('candidateList'),
    zoneList: document.getElementById('zoneList'),
    citySelect: document.getElementById('citySelect'),
    cityHelp: document.getElementById('cityHelp'),
    districtList: document.getElementById('districtList'),
    legend: document.getElementById('legend'),
    selectionStatus: document.getElementById('selectionStatus')
  };

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, (char) => ({
      '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;'
    }[char]));
  }

  function fmt(value) {
    const n = Number(value || 0);
    return new Intl.NumberFormat('pt-BR').format(Number.isFinite(n) ? n : 0);
  }

  function pct(value) {
    const n = Number(value || 0);
    return `${(Number.isFinite(n) ? n : 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
  }

  function partyColor(party) {
    const key = String(party || '').toUpperCase();
    if (PARTY_COLORS[key]) return PARTY_COLORS[key];
    let hash = 0;
    for (const char of key) hash = (hash * 31 + char.charCodeAt(0)) % 360;
    return `hsl(${hash || 210} 48% 44%)`;
  }

  async function api(url) {
    const response = await fetch(url, { headers: { Accept: 'application/json' } });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.ok === false) {
      throw new Error(payload.detail || payload.error || `HTTP ${response.status}`);
    }
    return payload;
  }

  function currentScopeName() {
    return state.selectedDistrict?.name || state.selectedMunicipality?.name || state.selectedState?.name || 'Brasil';
  }

  function updateTitles() {
    const scope = currentScopeName();
    els.scopeTitle.textContent = scope;
    els.scopeSubtitle.textContent = OFFICE_LABELS[state.office];
    els.selectionStatus.textContent = `${scope} • ${OFFICE_LABELS[state.office]}`;
    renderBreadcrumb();
  }

  function renderBreadcrumb() {
    const parts = [{ label: 'Brasil', action: 'br' }];
    if (state.selectedState) parts.push({ label: state.selectedState.name, action: 'state' });
    if (state.selectedMunicipality) parts.push({ label: state.selectedMunicipality.name, action: 'municipality' });
    if (state.selectedDistrict) parts.push({ label: state.selectedDistrict.name, action: null });

    els.breadcrumb.innerHTML = parts.map((part, index) => {
      const separator = index ? '<span class="crumb-sep">›</span>' : '';
      if (!part.action) return `${separator}<span>${escapeHtml(part.label)}</span>`;
      return `${separator}<button data-crumb="${part.action}">${escapeHtml(part.label)}</button>`;
    }).join('');

    els.breadcrumb.querySelectorAll('[data-crumb]').forEach((button) => {
      button.addEventListener('click', () => goTo(button.dataset.crumb));
    });
  }

  function renderLegend() {
    if (state.office !== 'presidente' || !Object.keys(state.stateWinners).length) {
      els.legend.innerHTML = '<span class="legend-title">Mapa ilustrado</span><span class="legend-item"><i style="background:#253247"></i> área interativa</span>';
      return;
    }

    const used = new Map();
    Object.values(state.stateWinners).forEach((summary) => {
      const party = summary?.winner?.party;
      if (party) used.set(party, partyColor(party));
    });

    els.legend.innerHTML = '<span class="legend-title">Liderança</span>' +
      [...used.entries()].slice(0, 8).map(([party, color]) =>
        `<span class="legend-item"><i style="background:${color}"></i>${escapeHtml(party)}</span>`
      ).join('');
  }

  function renderBrazil() {
    els.map.innerHTML = `
      <div class="brazil-silhouette" aria-hidden="true"></div>
      <div class="map-halo one" aria-hidden="true"></div>
      <div class="map-halo two" aria-hidden="true"></div>
      <div class="map-halo three" aria-hidden="true"></div>
      <div class="map-center-label" aria-hidden="true">BR</div>
      ${state.states.map((item) => {
        const uf = String(item.abbr || '').toUpperCase();
        const layout = STATE_LAYOUT[uf] || [50, 50, 42];
        const summary = state.stateWinners[uf];
        const color = summary?.winner?.party ? partyColor(summary.winner.party) : '#26354a';
        const lead = summary?.winner?.party ? `<span class="mini-lead">${escapeHtml(summary.winner.party)}</span>` : '';
        return `<button class="state-node" type="button" data-state="${escapeHtml(item.code)}" style="--x:${layout[0]}%;--y:${layout[1]}%;--size:${layout[2]}px;--node:${color}" aria-label="Abrir ${escapeHtml(item.name)}">
          ${lead}<b>${escapeHtml(uf)}</b><small>${escapeHtml(item.name)}</small>
        </button>`;
      }).join('')}`;

    els.map.querySelectorAll('[data-state]').forEach((button) => {
      button.addEventListener('click', () => {
        const item = state.states.find((entry) => String(entry.code) === button.dataset.state);
        if (item) selectState(item);
      });
    });
    renderLegend();
  }

  function renderStateView() {
    const uf = state.selectedState;
    const shortcuts = state.municipalities.slice(0, 18);
    els.map.innerHTML = `
      <div class="state-detail">
        <div class="state-illustration">
          <div class="state-blob">
            <strong>${escapeHtml(uf.abbr)}</strong>
            <span>${escapeHtml(uf.name)}</span>
          </div>
        </div>
        <div class="city-cloud">
          <h3>Municípios</h3>
          ${shortcuts.map((city) => `<button type="button" class="city-chip" data-city="${escapeHtml(city.code)}"><span>${escapeHtml(city.name)}</span><small>abrir</small></button>`).join('') || '<div class="empty">Nenhum município disponível.</div>'}
        </div>
      </div>`;

    els.map.querySelectorAll('[data-city]').forEach((button) => {
      button.addEventListener('click', () => {
        const city = state.municipalities.find((entry) => String(entry.code) === button.dataset.city);
        if (city) selectMunicipality(city);
      });
    });
    renderLegend();
  }

  function renderMunicipalityView() {
    const city = state.selectedMunicipality;
    els.map.innerHTML = `
      <div class="district-view">
        <div class="district-card">
          <span class="eyebrow">MUNICÍPIO SELECIONADO</span>
          <h2 class="big-city">${escapeHtml(city.name)}</h2>
          <p>Use os distritos abaixo para refinar a navegação visual. As zonas e seções eleitorais ficam no painel lateral.</p>
          <div class="district-pills">
            ${state.districts.length ? state.districts.map((district) => `<button type="button" class="district-pill ${state.selectedDistrict?.code === String(district.code) ? 'active' : ''}" data-district="${escapeHtml(district.code)}">${escapeHtml(district.name)}</button>`).join('') : '<span class="empty">Distritos ainda não disponíveis para esta localidade.</span>'}
          </div>
        </div>
      </div>`;

    els.map.querySelectorAll('[data-district]').forEach((button) => {
      button.addEventListener('click', () => {
        const district = state.districts.find((entry) => String(entry.code) === button.dataset.district);
        if (district) selectDistrict(district);
      });
    });
    renderLegend();
  }

  async function loadStates() {
    state.level = 'br';
    els.mapTitle.textContent = 'Brasil';
    els.mapSubtitle.textContent = 'Selecione um estado no mapa ilustrado';
    els.map.innerHTML = '<div class="map-loading">Carregando estados...</div>';
    try {
      const payload = await api('/api/geo?level=states');
      state.states = payload.items || [];
      renderBrazil();
      if (state.office === 'presidente') loadStateSummaries();
    } catch (error) {
      els.map.innerHTML = `<div class="map-error">${escapeHtml(error.message)}</div>`;
    }
  }

  async function loadStateSummaries() {
    try {
      const payload = await api('/api/results?action=state-summaries&office=presidente');
      state.stateWinners = Object.fromEntries((payload.states || []).map((entry) => [String(entry.uf).toUpperCase(), entry]));
      if (state.level === 'br') renderBrazil();
    } catch (error) {
      console.warn('Lideranças por estado indisponíveis:', error.message);
    }
  }

  async function loadMunicipalities() {
    const uf = state.selectedState;
    els.mapTitle.textContent = uf.name;
    els.mapSubtitle.textContent = 'Escolha um município para detalhar a apuração';
    els.map.innerHTML = '<div class="map-loading">Carregando municípios...</div>';
    try {
      const payload = await api(`/api/geo?level=municipalities&state=${encodeURIComponent(uf.code)}`);
      state.municipalities = payload.items || [];
      populateCitySelect();
      renderStateView();
    } catch (error) {
      els.map.innerHTML = `<div class="map-error">${escapeHtml(error.message)}</div>`;
    }
  }

  function populateCitySelect() {
    els.citySelect.disabled = false;
    els.citySelect.innerHTML = '<option value="">Selecione um município</option>' + state.municipalities.map((city) =>
      `<option value="${escapeHtml(city.code)}">${escapeHtml(city.name)}</option>`
    ).join('');
    if (state.selectedMunicipality) els.citySelect.value = state.selectedMunicipality.code;
    els.cityHelp.textContent = `${fmt(state.municipalities.length)} municípios disponíveis.`;
  }

  async function loadDistricts() {
    const city = state.selectedMunicipality;
    els.mapTitle.textContent = city.name;
    els.mapSubtitle.textContent = `${state.selectedState.name} • distritos, zonas e seções`;
    state.districts = [];
    els.districtList.innerHTML = '<span class="loading">Carregando distritos...</span>';
    try {
      const payload = await api(`/api/geo?level=districts&municipality=${encodeURIComponent(city.code)}`);
      state.districts = payload.items || [];
      renderDistrictChoices();
      renderMunicipalityView();
    } catch (error) {
      els.districtList.innerHTML = `<span class="empty">${escapeHtml(error.message)}</span>`;
      renderMunicipalityView();
    }
  }

  function renderDistrictChoices() {
    els.districtList.innerHTML = state.districts.map((district) =>
      `<button type="button" class="district-choice ${state.selectedDistrict?.code === String(district.code) ? 'active' : ''}" data-district-choice="${escapeHtml(district.code)}">${escapeHtml(district.name)}</button>`
    ).join('');
    els.districtList.querySelectorAll('[data-district-choice]').forEach((button) => {
      button.addEventListener('click', () => {
        const district = state.districts.find((entry) => String(entry.code) === button.dataset.districtChoice);
        if (district) selectDistrict(district);
      });
    });
  }

  async function selectState(item) {
    state.selectedState = {
      code: String(item.code),
      abbr: String(item.abbr || '').toUpperCase(),
      name: item.name || item.abbr
    };
    state.selectedMunicipality = null;
    state.selectedDistrict = null;
    state.municipalities = [];
    state.districts = [];
    state.level = 'state';
    els.zoneList.innerHTML = '<div class="empty">Selecione um município para abrir zonas e seções.</div>';
    els.districtList.innerHTML = '';
    updateTitles();
    await Promise.allSettled([loadMunicipalities(), loadResult()]);
  }

  async function selectMunicipality(item) {
    state.selectedMunicipality = { code: String(item.code), name: item.name || String(item.code) };
    state.selectedDistrict = null;
    state.level = 'municipality';
    els.citySelect.value = state.selectedMunicipality.code;
    updateTitles();
    const result = await loadResult();
    await Promise.allSettled([loadDistricts(), loadZones(result?.municipalityCode)]);
  }

  function selectDistrict(item) {
    state.selectedDistrict = { code: String(item.code), name: item.name || String(item.code) };
    state.level = 'district';
    updateTitles();
    renderDistrictChoices();
    renderMunicipalityView();
  }

  function buildResultQuery() {
    const query = new URLSearchParams({ action: 'result', office: state.office });
    if (state.selectedState) query.set('uf', state.selectedState.abbr.toLowerCase());
    if (state.selectedMunicipality) {
      query.set('municipalityName', state.selectedMunicipality.name);
      query.set('ibgeCode', state.selectedMunicipality.code);
    }
    return query;
  }

  async function loadResult() {
    updateTitles();
    if (state.office !== 'presidente' && !state.selectedState) {
      els.resultSummary.innerHTML = '<div class="empty">Selecione um estado no mapa para visualizar este cargo.</div>';
      els.candidateList.innerHTML = '<div class="empty">Aguardando seleção de UF.</div>';
      return null;
    }

    els.resultSummary.innerHTML = '<div class="loading">Consultando arquivo oficial do TSE...</div>';
    els.candidateList.innerHTML = '<div class="loading">Carregando candidatos...</div>';

    try {
      const result = await api(`/api/results?${buildResultQuery().toString()}`);
      renderResult(result);
      els.feedStatus.textContent = 'Fonte oficial conectada';
      return result;
    } catch (error) {
      els.feedStatus.textContent = 'Fonte temporariamente indisponível';
      els.resultSummary.innerHTML = `<div class="error">${escapeHtml(error.message)}</div>`;
      els.candidateList.innerHTML = '<div class="empty">Sem dados para exibir neste recorte.</div>';
      return null;
    }
  }

  function renderResult(result) {
    const sections = result.sections || {};
    const electorate = result.electorate || {};
    const votes = result.votes || {};
    const sectionPercentage = Math.max(0, Math.min(100, Number(sections.percentage || 0)));

    els.resultSummary.innerHTML = `
      <div class="metrics">
        <div class="metric"><label>Totalizadas</label><strong>${pct(sections.percentage)}</strong></div>
        <div class="metric"><label>Seções</label><strong>${fmt(sections.totalized)}/${fmt(sections.total)}</strong></div>
        <div class="metric"><label>Comparecimento</label><strong>${fmt(electorate.turnout)}</strong></div>
        <div class="metric"><label>Abstenções</label><strong>${fmt(electorate.abstentions)}</strong></div>
        <div class="metric"><label>Válidos</label><strong>${fmt(votes.valid)}</strong></div>
        <div class="metric"><label>Brancos+nulos</label><strong>${fmt((votes.blank || 0) + (votes.null || 0))}</strong></div>
      </div>
      <div class="progress-wrap">
        <div class="progress-row"><span>Andamento da totalização</span><b>${pct(sections.percentage)}</b></div>
        <div class="progress"><i style="width:${sectionPercentage}%"></i></div>
      </div>
      <div class="footnote">TSE ${escapeHtml([result.generatedDate, result.generatedTime].filter(Boolean).join(' ') || 'aguardando atualização')}</div>`;

    const candidates = result.candidates || [];
    const limit = state.office.startsWith('deputado') ? 30 : 12;
    els.candidateList.innerHTML = candidates.length ? candidates.slice(0, limit).map((candidate) => `
      <article class="candidate">
        <img class="candidate-photo" src="${escapeHtml(candidate.photoUrl || '')}" alt="" onerror="this.style.visibility='hidden'">
        <div>
          <div class="candidate-name">${escapeHtml(candidate.ballotName || candidate.name)}</div>
          <div class="candidate-meta">${escapeHtml(candidate.number)} • ${escapeHtml(candidate.party || 'Partido não informado')}</div>
          ${candidate.status ? `<span class="status">${escapeHtml(candidate.status)}</span>` : ''}
        </div>
        <div class="candidate-votes"><strong>${pct(candidate.percentage)}</strong><small>${fmt(candidate.votes)} votos</small></div>
      </article>`).join('') : '<div class="empty">Ainda não há votos computados para este recorte.</div>';
  }

  async function loadZones(municipalityCode) {
    if (!state.selectedState || !municipalityCode) {
      els.zoneList.innerHTML = '<div class="empty">Zonas ainda não disponíveis para este município.</div>';
      return;
    }
    els.zoneList.innerHTML = '<div class="loading">Carregando zonas e seções...</div>';
    try {
      const query = new URLSearchParams({
        action: 'zones',
        uf: state.selectedState.abbr.toLowerCase(),
        municipalityCode
      });
      const payload = await api(`/api/results?${query.toString()}`);
      const zones = payload.zones || [];
      els.zoneList.innerHTML = zones.length ? `<div class="zone-grid">${zones.map((zone) => `
        <div class="zone">
          <strong>Zona ${escapeHtml(zone.code)}</strong>
          <small>${fmt(zone.sections.length)} seções</small>
          <div class="section-list">${zone.sections.slice(0, 90).map((section) => `<span>${escapeHtml(section.number)}</span>`).join('')}</div>
        </div>`).join('')}</div>` : '<div class="empty">Nenhuma zona encontrada.</div>';
    } catch (error) {
      els.zoneList.innerHTML = `<div class="error">${escapeHtml(error.message)}</div>`;
    }
  }

  async function goTo(level) {
    if (level === 'br') {
      state.selectedState = null;
      state.selectedMunicipality = null;
      state.selectedDistrict = null;
      state.municipalities = [];
      state.districts = [];
      state.level = 'br';
      els.citySelect.disabled = true;
      els.citySelect.innerHTML = '<option>Selecione primeiro um estado</option>';
      els.cityHelp.textContent = 'Clique em um estado no mapa para abrir os municípios.';
      els.districtList.innerHTML = '';
      els.zoneList.innerHTML = '<div class="empty">Selecione um município para abrir zonas e seções disponíveis.</div>';
      updateTitles();
      await Promise.allSettled([loadStates(), loadResult()]);
      return;
    }

    if (level === 'state' && state.selectedState) {
      state.selectedMunicipality = null;
      state.selectedDistrict = null;
      state.districts = [];
      state.level = 'state';
      els.zoneList.innerHTML = '<div class="empty">Selecione um município para abrir zonas e seções.</div>';
      els.districtList.innerHTML = '';
      updateTitles();
      await Promise.allSettled([loadMunicipalities(), loadResult()]);
      return;
    }

    if (level === 'municipality' && state.selectedMunicipality) {
      state.selectedDistrict = null;
      state.level = 'municipality';
      updateTitles();
      await Promise.allSettled([loadDistricts(), loadResult()]);
    }
  }

  function goBack() {
    if (state.selectedDistrict) return goTo('municipality');
    if (state.selectedMunicipality) return goTo('state');
    if (state.selectedState) return goTo('br');
  }

  document.getElementById('resetButton').addEventListener('click', () => goTo('br'));
  document.getElementById('backButton').addEventListener('click', goBack);
  document.getElementById('refreshButton').addEventListener('click', async () => {
    await loadResult();
    if (state.level === 'br' && state.office === 'presidente') await loadStateSummaries();
  });

  els.citySelect.addEventListener('change', () => {
    const item = state.municipalities.find((city) => String(city.code) === els.citySelect.value);
    if (item) selectMunicipality(item);
  });

  document.querySelectorAll('.office-btn').forEach((button) => {
    button.addEventListener('click', async () => {
      document.querySelectorAll('.office-btn').forEach((item) => item.classList.remove('active'));
      button.classList.add('active');
      state.office = button.dataset.office;
      if (state.office !== 'presidente') state.stateWinners = {};
      updateTitles();
      if (state.level === 'br') renderBrazil();
      await loadResult();
      if (state.office === 'presidente' && state.level === 'br') await loadStateSummaries();
    });
  });

  document.querySelectorAll('.rail-tab').forEach((button) => {
    button.addEventListener('click', () => {
      document.querySelectorAll('.rail-tab').forEach((item) => item.classList.remove('active'));
      document.querySelectorAll('.rail-panel').forEach((panel) => panel.classList.remove('active'));
      button.classList.add('active');
      document.querySelector(`[data-panel="${button.dataset.tab}"]`)?.classList.add('active');
    });
  });

  function updateClock() {
    els.clock.textContent = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date());
  }
  updateClock();
  setInterval(updateClock, 1000);

  updateTitles();
  Promise.allSettled([loadStates(), loadResult()]);
})();
