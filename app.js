/* global L */
(() => {
  'use strict';

  const state = {
    office: 'presidente',
    level: 'br',
    selectedState: null,
    selectedMunicipality: null,
    selectedDistrict: null,
    municipalities: [],
    stateWinners: {},
    geoData: null,
    geoLevel: 'states'
  };

  const OFFICE_LABELS = {
    presidente: 'Presidente', governador: 'Governador', senador: 'Senador',
    'deputado-federal': 'Deputado Federal', 'deputado-estadual': 'Deputado Estadual'
  };

  const PARTY_COLORS = {
    PT:'#cf2436', PL:'#1e4d9b', PSD:'#e0a52b', NOVO:'#ef7d23', MDB:'#2f9e62',
    PSOL:'#d6a516', PDT:'#d84b3a', PSB:'#e6a317', PP:'#2f70c7', UNIÃO:'#1471a8',
    REPUBLICANOS:'#4e88c8', AVANTE:'#8355a5', PCB:'#9f1d2c', PSTU:'#b81f2f', UP:'#a62a38',
    PCO:'#830f1e', DC:'#128477', MISSÃO:'#704c3a', DEMOCRATA:'#158b94'
  };

  const els = {
    feedStatus: document.getElementById('feedStatus'), clock: document.getElementById('clock'),
    mapTitle: document.getElementById('mapTitle'), mapSubtitle: document.getElementById('mapSubtitle'),
    breadcrumb: document.getElementById('breadcrumb'), scopeTitle: document.getElementById('scopeTitle'),
    scopeSubtitle: document.getElementById('scopeSubtitle'), resultSummary: document.getElementById('resultSummary'),
    candidateList: document.getElementById('candidateList'), zoneList: document.getElementById('zoneList'),
    citySelect: document.getElementById('citySelect'), cityHelp: document.getElementById('cityHelp'),
    legend: document.getElementById('legend')
  };

  const map = L.map('map', { minZoom: 3, zoomSnap: .25 }).setView([-14.4, -51.3], 4);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18,
    attribution: '&copy; OpenStreetMap'
  }).addTo(map);
  let geoLayer = null;

  function partyColor(party) {
    const key = String(party || '').toUpperCase();
    if (PARTY_COLORS[key]) return PARTY_COLORS[key];
    let hash = 0;
    for (const c of key) hash = (hash * 31 + c.charCodeAt(0)) % 360;
    return `hsl(${hash || 205} 55% 46%)`;
  }

  async function api(url) {
    const response = await fetch(url, { headers: { Accept: 'application/json' } });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.ok === false) throw new Error(payload.detail || payload.error || `HTTP ${response.status}`);
    return payload;
  }

  function fmt(value) {
    const n = Number(value || 0);
    return new Intl.NumberFormat('pt-BR').format(Number.isFinite(n) ? n : 0);
  }

  function pct(value) {
    const n = Number(value || 0);
    return `${(Number.isFinite(n) ? n : 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
  }

  function breadcrumb() {
    const parts = [{ label: 'Brasil', action: 'br' }];
    if (state.selectedState) parts.push({ label: state.selectedState.name, action: 'state' });
    if (state.selectedMunicipality) parts.push({ label: state.selectedMunicipality.name, action: 'municipality' });
    if (state.selectedDistrict) parts.push({ label: state.selectedDistrict.name, action: null });
    els.breadcrumb.innerHTML = parts.map((p, i) => `${i ? '<span class="crumb-sep">›</span>' : ''}${p.action ? `<button data-crumb="${p.action}">${escapeHtml(p.label)}</button>` : `<span>${escapeHtml(p.label)}</span>`}`).join('');
    els.breadcrumb.querySelectorAll('[data-crumb]').forEach((btn) => btn.addEventListener('click', () => goTo(btn.dataset.crumb)));
  }

  function currentScopeName() {
    return state.selectedDistrict?.name || state.selectedMunicipality?.name || state.selectedState?.name || 'Brasil';
  }

  function updateTitles() {
    els.scopeTitle.textContent = currentScopeName();
    els.scopeSubtitle.textContent = OFFICE_LABELS[state.office];
    breadcrumb();
  }

  function styleFeature(feature) {
    const p = feature.properties || {};
    let fill = '#24405f';
    if (state.geoLevel === 'states') {
      const summary = state.stateWinners[String(p.abbr || '').toUpperCase()];
      if (summary?.winner?.party) fill = partyColor(summary.winner.party);
    } else if (state.geoLevel === 'districts') {
      fill = state.selectedDistrict?.code === String(p.code) ? '#22b8ef' : '#2477a5';
    }
    return { color: '#8ba1bb', weight: state.geoLevel === 'municipalities' ? .8 : 1.1, fillColor: fill, fillOpacity: .64 };
  }

  function renderGeo(payload, level) {
    state.geoData = payload;
    state.geoLevel = level;
    if (geoLayer) map.removeLayer(geoLayer);
    geoLayer = L.geoJSON(payload.geojson, {
      style: styleFeature,
      onEachFeature(feature, layer) {
        const p = feature.properties || {};
        layer.bindTooltip(escapeHtml(p.name || p.abbr || p.code || ''), { sticky: true });
        layer.on({
          mouseover(e) { e.target.setStyle({ weight: 2.2, fillOpacity: .82 }); },
          mouseout(e) { geoLayer.resetStyle(e.target); },
          click() {
            if (level === 'states') selectState(p);
            else if (level === 'municipalities') selectMunicipality(p);
            else if (level === 'districts') selectDistrict(p);
          }
        });
      }
    }).addTo(map);
    try { map.fitBounds(geoLayer.getBounds(), { padding: [16, 16] }); } catch {}
    renderLegend();
  }

  function renderLegend() {
    if (state.geoLevel !== 'states' || !Object.keys(state.stateWinners).length) {
      els.legend.innerHTML = '<strong>Legenda</strong><div class="legend-item"><i class="legend-dot" style="background:#24405f"></i>Área navegável</div>';
      return;
    }
    const used = new Map();
    Object.values(state.stateWinners).forEach((r) => {
      const party = r?.winner?.party;
      if (party) used.set(party, partyColor(party));
    });
    els.legend.innerHTML = '<strong>Liderança por estado</strong>' + [...used.entries()].map(([p,c]) => `<div class="legend-item"><i class="legend-dot" style="background:${c}"></i>${escapeHtml(p)}</div>`).join('') + '<div class="legend-item"><i class="legend-dot" style="background:#24405f"></i>Indisponível/aguardando</div>';
  }

  async function loadStates() {
    els.mapTitle.textContent = 'Brasil';
    els.mapSubtitle.textContent = 'Clique em um estado para abrir seus municípios';
    const payload = await api('/api/geo?level=states');
    renderGeo(payload, 'states');
    if (state.office === 'presidente') loadStateSummaries();
  }

  async function loadStateSummaries() {
    try {
      const payload = await api('/api/results?action=state-summaries&office=presidente');
      state.stateWinners = Object.fromEntries((payload.states || []).map((x) => [x.uf, x]));
      if (state.geoLevel === 'states' && state.geoData) renderGeo(state.geoData, 'states');
    } catch (error) {
      console.warn('Mapa de lideranças indisponível:', error.message);
    }
  }

  async function loadMunicipalityGeo() {
    const uf = state.selectedState;
    els.mapTitle.textContent = uf.name;
    els.mapSubtitle.textContent = 'Clique em um município para detalhar o resultado';
    const payload = await api(`/api/geo?level=municipalities&state=${encodeURIComponent(uf.code)}`);
    state.municipalities = payload.items || [];
    renderGeo(payload, 'municipalities');
    populateCitySelect();
  }

  async function loadDistrictGeo() {
    const city = state.selectedMunicipality;
    els.mapTitle.textContent = city.name;
    els.mapSubtitle.textContent = 'Distritos/regiões do município • zonas eleitorais no painel lateral';
    try {
      const payload = await api(`/api/geo?level=districts&municipality=${encodeURIComponent(city.code)}`);
      if (payload.geojson?.features?.length) renderGeo(payload, 'districts');
    } catch (error) {
      console.warn('Sem malha distrital:', error.message);
    }
  }

  function populateCitySelect() {
    els.citySelect.disabled = false;
    els.citySelect.innerHTML = '<option value="">Selecione um município</option>' + state.municipalities.map((m, i) => `<option value="${i}">${escapeHtml(m.name)}</option>`).join('');
    els.cityHelp.textContent = `${fmt(state.municipalities.length)} municípios carregados da base geográfica do IBGE.`;
  }

  async function selectState(props) {
    state.selectedState = { code: String(props.code), abbr: String(props.abbr || '').toUpperCase(), name: props.name || props.abbr };
    state.selectedMunicipality = null;
    state.selectedDistrict = null;
    state.level = 'state';
    els.zoneList.innerHTML = '<div class="empty">Selecione um município para abrir zonas e seções.</div>';
    updateTitles();
    await Promise.allSettled([loadMunicipalityGeo(), loadResult()]);
  }

  async function selectMunicipality(props) {
    state.selectedMunicipality = { code: String(props.code), name: props.name || String(props.code) };
    state.selectedDistrict = null;
    state.level = 'municipality';
    updateTitles();
    const result = await loadResult();
    await Promise.allSettled([loadDistrictGeo(), loadZones(result?.municipalityCode)]);
  }

  function selectDistrict(props) {
    state.selectedDistrict = { code: String(props.code), name: props.name || String(props.code) };
    updateTitles();
    if (geoLayer) geoLayer.setStyle(styleFeature);
  }

  function buildResultQuery() {
    const q = new URLSearchParams({ action: 'result', office: state.office });
    if (state.selectedState) q.set('uf', state.selectedState.abbr.toLowerCase());
    if (state.selectedMunicipality) {
      q.set('municipalityName', state.selectedMunicipality.name);
      q.set('ibgeCode', state.selectedMunicipality.code);
    }
    return q;
  }

  async function loadResult() {
    updateTitles();
    if (state.office !== 'presidente' && !state.selectedState) {
      els.resultSummary.innerHTML = '<div class="empty">Selecione um estado para visualizar este cargo.</div>';
      els.candidateList.innerHTML = '<div class="empty">Aguardando seleção de UF.</div>';
      return null;
    }
    els.resultSummary.innerHTML = '<div class="loading">Consultando o arquivo oficial do TSE...</div>';
    els.candidateList.innerHTML = '<div class="loading">Carregando candidatos...</div>';
    try {
      const result = await api(`/api/results?${buildResultQuery().toString()}`);
      renderResult(result);
      els.feedStatus.textContent = result.waiting ? 'Aguardando totalização' : 'Fonte oficial conectada';
      return result;
    } catch (error) {
      els.feedStatus.textContent = 'Fonte temporariamente indisponível';
      els.resultSummary.innerHTML = `<div class="error">${escapeHtml(error.message)}</div>`;
      els.candidateList.innerHTML = '<div class="empty">Sem dados para exibir.</div>';
      return null;
    }
  }

  function renderResult(result) {
    const s = result.sections || {};
    const e = result.electorate || {};
    const v = result.votes || {};
    els.resultSummary.innerHTML = `
      <div class="metrics">
        <div class="metric"><label>Seções totalizadas</label><strong>${pct(s.percentage)}</strong></div>
        <div class="metric"><label>Seções</label><strong>${fmt(s.totalized)} / ${fmt(s.total)}</strong></div>
        <div class="metric"><label>Comparecimento</label><strong>${fmt(e.turnout)}</strong></div>
        <div class="metric"><label>Abstenções</label><strong>${fmt(e.abstentions)}</strong></div>
        <div class="metric"><label>Votos válidos</label><strong>${fmt(v.valid)}</strong></div>
        <div class="metric"><label>Brancos + nulos</label><strong>${fmt((v.blank || 0) + (v.null || 0))}</strong></div>
      </div>
      <div class="progress-wrap"><div class="progress-row"><span>Andamento da totalização</span><b>${pct(s.percentage)}</b></div><div class="progress"><i style="width:${Math.max(0,Math.min(100,Number(s.percentage||0)))}%"></i></div></div>
      <div class="footnote">Atualização TSE: ${escapeHtml([result.generatedDate,result.generatedTime].filter(Boolean).join(' ') || 'aguardando')} • ID ${escapeHtml(result.idg || '—')}</div>`;

    const candidates = result.candidates || [];
    els.candidateList.innerHTML = candidates.length ? candidates.slice(0, state.office.startsWith('deputado') ? 30 : 12).map((c) => `
      <article class="candidate">
        <img class="candidate-photo" src="${escapeHtml(c.photoUrl || '')}" alt="" onerror="this.style.visibility='hidden'">
        <div><div class="candidate-name">${escapeHtml(c.ballotName || c.name)}</div><div class="candidate-meta">${escapeHtml(c.number)} • ${escapeHtml(c.party || 'Partido não informado')}</div>${c.status ? `<span class="status">${escapeHtml(c.status)}</span>` : ''}</div>
        <div class="candidate-votes"><strong>${pct(c.percentage)}</strong><small>${fmt(c.votes)} votos</small></div>
      </article>`).join('') : '<div class="empty">A lista oficial está disponível, mas ainda não há votos computados neste recorte.</div>';
  }

  async function loadZones(municipalityCode) {
    if (!state.selectedState || !municipalityCode) {
      els.zoneList.innerHTML = '<div class="empty">Zonas ainda não disponíveis para este município.</div>';
      return;
    }
    els.zoneList.innerHTML = '<div class="loading">Carregando zonas e seções...</div>';
    try {
      const q = new URLSearchParams({ action: 'zones', uf: state.selectedState.abbr.toLowerCase(), municipalityCode });
      const payload = await api(`/api/results?${q.toString()}`);
      const zones = payload.zones || [];
      els.zoneList.innerHTML = zones.length ? `<div class="zone-grid">${zones.map((z) => `<div class="zone"><strong>Zona ${escapeHtml(z.code)}</strong><small>${fmt(z.sections.length)} seções</small><div class="section-list">${z.sections.slice(0,80).map((s) => escapeHtml(s.number)).join(' • ')}${z.sections.length > 80 ? ' • …' : ''}</div></div>`).join('')}</div>` : '<div class="empty">O arquivo de seções não trouxe zonas para este município.</div>';
    } catch (error) {
      els.zoneList.innerHTML = `<div class="error">${escapeHtml(error.message)}</div>`;
    }
  }

  function goTo(target) {
    if (target === 'br') return resetBrazil();
    if (target === 'state') {
      state.selectedMunicipality = null; state.selectedDistrict = null; state.level = 'state'; updateTitles(); loadMunicipalityGeo(); loadResult();
    } else if (target === 'municipality') {
      state.selectedDistrict = null; state.level = 'municipality'; updateTitles(); loadDistrictGeo(); loadResult();
    }
  }

  function resetBrazil() {
    state.level = 'br'; state.selectedState = null; state.selectedMunicipality = null; state.selectedDistrict = null; state.municipalities = [];
    els.citySelect.disabled = true; els.citySelect.innerHTML = '<option>Selecione primeiro um estado</option>';
    els.cityHelp.textContent = 'No mapa, clique em um estado e depois em um município.';
    els.zoneList.innerHTML = '<div class="empty">Selecione um município para abrir as zonas e seções disponíveis no arquivo oficial do TSE.</div>';
    updateTitles(); loadStates(); loadResult();
  }

  document.getElementById('officeToolbar').addEventListener('click', (event) => {
    const btn = event.target.closest('[data-office]'); if (!btn) return;
    state.office = btn.dataset.office;
    document.querySelectorAll('.office-btn').forEach((b) => b.classList.toggle('active', b === btn));
    loadResult();
    if (state.geoLevel === 'states') {
      state.stateWinners = {};
      if (state.office === 'presidente') loadStateSummaries(); else if (state.geoData) renderGeo(state.geoData, 'states');
    }
  });

  els.citySelect.addEventListener('change', () => {
    const i = Number(els.citySelect.value); if (!Number.isInteger(i) || !state.municipalities[i]) return;
    selectMunicipality(state.municipalities[i]);
  });
  document.getElementById('resetButton').addEventListener('click', resetBrazil);
  document.getElementById('backButton').addEventListener('click', () => {
    if (state.selectedDistrict) return goTo('municipality');
    if (state.selectedMunicipality) return goTo('state');
    if (state.selectedState) return resetBrazil();
  });
  document.getElementById('refreshButton').addEventListener('click', () => loadResult());

  function tick() { els.clock.textContent = new Date().toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit', second:'2-digit' }); }
  tick(); setInterval(tick, 1000);
  setInterval(() => loadResult(), 30000);

  updateTitles();
  Promise.allSettled([loadStates(), loadResult()]);
})();
