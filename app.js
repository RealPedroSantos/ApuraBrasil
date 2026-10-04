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
    stateWinners: {},
    currentGeo: null,
    activeTab: 'candidates',
    lastResult: null
  };

  const OFFICE_LABELS = {
    presidente: 'Presidente',
    governador: 'Governador',
    senador: 'Senador',
    'deputado-federal': 'Deputado Federal',
    'deputado-estadual': 'Deputado Estadual'
  };

  const PARTY_COLORS = {
    PL:'#165dff', PT:'#ff1717', PSD:'#ff921e', NOVO:'#f46f1a', MDB:'#48977c',
    PSOL:'#e8cf11', PDT:'#d94b43', PSB:'#e0ac1d', PP:'#3776c7', 'UNIÃO':'#1c7ca9',
    REPUBLICANOS:'#5c7fd1', AVANTE:'#7f00ff', PCB:'#9f2436', PSTU:'#c52d3f', UP:'#cf00ef',
    PCO:'#801d2c', DC:'#18867c', 'MISSÃO':'#7356a4', DEMOCRATA:'#1d8f99'
  };

  const els = {
    feedStatus: document.getElementById('feedStatus'),
    bottomSource: document.getElementById('bottomSource'),
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
    selectionStatus: document.getElementById('selectionStatus'),
    refreshButton: document.getElementById('refreshButton'),
    backButton: document.getElementById('backButton'),
    resetButton: document.getElementById('resetButton')
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
    return `hsl(${hash || 205} 70% 48%)`;
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
      return `${separator}<button type="button" data-crumb="${part.action}">${escapeHtml(part.label)}</button>`;
    }).join('');

    els.breadcrumb.querySelectorAll('[data-crumb]').forEach((button) => {
      button.addEventListener('click', () => goTo(button.dataset.crumb));
    });
  }

  function setSourceStatus(text, good = true) {
    els.feedStatus.textContent = text;
    els.bottomSource.textContent = text;
    document.querySelectorAll('.status-dot').forEach((dot) => {
      dot.style.background = good ? '#31a75a' : '#d43c49';
      dot.style.boxShadow = good ? '0 0 0 3px rgba(49,167,90,.12)' : '0 0 0 3px rgba(212,60,73,.12)';
    });
  }

  function flattenCoordinates(value, out = []) {
    if (!Array.isArray(value)) return out;
    if (value.length >= 2 && typeof value[0] === 'number' && typeof value[1] === 'number') {
      out.push([value[0], value[1]]);
      return out;
    }
    value.forEach((child) => flattenCoordinates(child, out));
    return out;
  }

  function geoBounds(geojson) {
    const all = [];
    (geojson?.features || []).forEach((feature) => flattenCoordinates(feature?.geometry?.coordinates, all));
    if (!all.length) return { minLon:-74, maxLon:-34, minLat:-34, maxLat:6 };
    const lons = all.map((p) => p[0]);
    const lats = all.map((p) => p[1]);
    return {
      minLon: Math.min(...lons), maxLon: Math.max(...lons),
      minLat: Math.min(...lats), maxLat: Math.max(...lats)
    };
  }

  function projector(bounds, width, height, padding) {
    const lonSpan = Math.max(.001, bounds.maxLon - bounds.minLon);
    const latSpan = Math.max(.001, bounds.maxLat - bounds.minLat);
    const innerW = width - padding * 2;
    const innerH = height - padding * 2;
    const sx = innerW / lonSpan;
    const sy = innerH / latSpan;
    const scale = Math.min(sx, sy);
    const usedW = lonSpan * scale;
    const usedH = latSpan * scale;
    const ox = (width - usedW) / 2;
    const oy = (height - usedH) / 2;
    return ([lon, lat]) => [
      ox + (lon - bounds.minLon) * scale,
      oy + (bounds.maxLat - lat) * scale
    ];
  }

  function ringPath(ring, project) {
    if (!Array.isArray(ring) || !ring.length) return '';
    return ring.map((point, index) => {
      const [x, y] = project(point);
      return `${index ? 'L' : 'M'}${x.toFixed(2)},${y.toFixed(2)}`;
    }).join(' ') + ' Z';
  }

  function geometryPath(geometry, project) {
    if (!geometry) return '';
    if (geometry.type === 'Polygon') {
      return (geometry.coordinates || []).map((ring) => ringPath(ring, project)).join(' ');
    }
    if (geometry.type === 'MultiPolygon') {
      return (geometry.coordinates || []).flatMap((polygon) => polygon.map((ring) => ringPath(ring, project))).join(' ');
    }
    return '';
  }

  function featureCentroid(feature, project) {
    const points = flattenCoordinates(feature?.geometry?.coordinates, []);
    if (!points.length) return [0, 0];
    const avgLon = points.reduce((sum, p) => sum + p[0], 0) / points.length;
    const avgLat = points.reduce((sum, p) => sum + p[1], 0) / points.length;
    return project([avgLon, avgLat]);
  }

  function featureFill(feature, level) {
    const props = feature.properties || {};
    if (level === 'states') {
      const uf = String(props.abbr || '').toUpperCase();
      if (state.office === 'presidente') {
        const summary = state.stateWinners[uf];
        if (summary?.winner?.party) return partyColor(summary.winner.party);
      }
      return '#4b987d';
    }
    if (level === 'municipalities') {
      const isSelected = state.selectedMunicipality && String(state.selectedMunicipality.code) === String(props.code);
      return isSelected ? '#0c55ff' : '#e1e4e6';
    }
    return '#e1e4e6';
  }

  function renderGeo(payload, level) {
    state.currentGeo = { payload, level };
    const geojson = payload?.geojson || { type:'FeatureCollection', features:[] };
    const features = geojson.features || [];
    if (!features.length) {
      els.map.innerHTML = '<div class="map-error">Não há geometria disponível para este recorte.</div>';
      return;
    }

    const width = 900;
    const height = 650;
    const bounds = geoBounds(geojson);
    const project = projector(bounds, width, height, level === 'states' ? 42 : 28);

    const paths = features.map((feature) => {
      const props = feature.properties || {};
      const code = String(props.code || '');
      const name = String(props.name || code);
      const fill = featureFill(feature, level);
      const selected = level === 'municipalities' && state.selectedMunicipality && String(state.selectedMunicipality.code) === code;
      return `<path tabindex="0" role="button" class="geo-region${selected ? ' selected' : ''}" data-code="${escapeHtml(code)}" d="${geometryPath(feature.geometry, project)}" fill="${fill}" aria-label="${escapeHtml(name)}"><title>${escapeHtml(name)}</title></path>`;
    }).join('');

    const labels = level === 'states' ? features.map((feature) => {
      const props = feature.properties || {};
      const uf = String(props.abbr || '');
      if (!uf) return '';
      const [x, y] = featureCentroid(feature, project);
      const small = ['DF','SE','AL','PB','RN','ES','RJ'].includes(uf.toUpperCase());
      return `<text class="geo-label${small ? ' small' : ''}" x="${x.toFixed(2)}" y="${y.toFixed(2)}">${escapeHtml(uf)}</text>`;
    }).join('') : '';

    els.map.innerHTML = `<svg class="vector-map" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet" aria-label="Mapa ilustrado"><g>${paths}</g><g>${labels}</g></svg>`;

    els.map.querySelectorAll('.geo-region').forEach((region) => {
      const activate = () => {
        const code = region.dataset.code;
        const feature = features.find((item) => String(item.properties?.code || '') === code);
        if (!feature) return;
        const props = feature.properties || {};
        if (level === 'states') selectState({ code: props.code, name: props.name, abbr: props.abbr });
        if (level === 'municipalities') selectMunicipality({ code: props.code, name: props.name });
      };
      region.addEventListener('click', activate);
      region.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          activate();
        }
      });
    });
    renderLegend();
  }

  function renderLegend() {
    if (state.level !== 'br' || state.office !== 'presidente' || !Object.keys(state.stateWinners).length) {
      els.legend.innerHTML = '<strong>Mapa ilustrado</strong><span class="legend-item"><i style="background:#4b987d"></i>área interativa</span>';
      return;
    }
    const used = new Map();
    Object.values(state.stateWinners).forEach((entry) => {
      const party = entry?.winner?.party;
      if (party) used.set(party, partyColor(party));
    });
    els.legend.innerHTML = '<strong>Liderança</strong>' + [...used.entries()].map(([party, color]) =>
      `<span class="legend-item"><i style="background:${color}"></i>${escapeHtml(party)}</span>`
    ).join('');
  }

  function renderDistrictBoard() {
    const city = state.selectedMunicipality;
    els.map.innerHTML = `
      <div class="district-board">
        <div class="district-illustration">
          <h2>${escapeHtml(city?.name || '')}</h2>
          <p>Distritos oficiais disponíveis para refinamento da navegação</p>
          <div class="district-pills">
            ${state.districts.length ? state.districts.map((district) => `<button type="button" class="district-pill ${state.selectedDistrict?.code === String(district.code) ? 'active' : ''}" data-district="${escapeHtml(district.code)}">${escapeHtml(district.name)}</button>`).join('') : '<span class="helper">Sem subdivisão distrital disponível.</span>'}
          </div>
        </div>
      </div>`;
    els.map.querySelectorAll('[data-district]').forEach((button) => {
      button.addEventListener('click', () => {
        const district = state.districts.find((item) => String(item.code) === button.dataset.district);
        if (district) selectDistrict(district);
      });
    });
    renderLegend();
  }

  async function loadStates() {
    state.level = 'br';
    els.mapTitle.textContent = 'Brasil';
    els.mapSubtitle.textContent = 'Clique em um estado para detalhar a apuração';
    els.map.innerHTML = '<div class="map-loading">Carregando mapa ilustrado...</div>';
    try {
      const payload = await api('/api/geo?level=states');
      state.states = payload.items || [];
      renderGeo(payload, 'states');
      if (state.office === 'presidente') await loadStateSummaries();
    } catch (error) {
      els.map.innerHTML = `<div class="map-error">${escapeHtml(error.message)}</div>`;
    }
  }

  async function loadStateSummaries() {
    try {
      const payload = await api('/api/results?action=state-summaries&office=presidente');
      state.stateWinners = Object.fromEntries((payload.states || []).map((entry) => [String(entry.uf).toUpperCase(), entry]));
      if (state.level === 'br' && state.currentGeo?.level === 'states') renderGeo(state.currentGeo.payload, 'states');
    } catch (error) {
      console.warn('Lideranças indisponíveis:', error.message);
    }
  }

  async function loadMunicipalities() {
    const uf = state.selectedState;
    els.mapTitle.textContent = uf.name;
    els.mapSubtitle.textContent = 'Clique em um município para abrir o resultado local';
    els.map.innerHTML = '<div class="map-loading">Carregando municípios...</div>';
    try {
      const payload = await api(`/api/geo?level=municipalities&state=${encodeURIComponent(uf.code)}`);
      state.municipalities = payload.items || [];
      populateCitySelect();
      renderGeo(payload, 'municipalities');
    } catch (error) {
      els.map.innerHTML = `<div class="map-error">${escapeHtml(error.message)}</div>`;
    }
  }

  function populateCitySelect() {
    els.citySelect.disabled = false;
    els.citySelect.innerHTML = '<option value="">Selecione um município</option>' + state.municipalities.map((city) => `<option value="${escapeHtml(city.code)}">${escapeHtml(city.name)}</option>`).join('');
    if (state.selectedMunicipality) els.citySelect.value = state.selectedMunicipality.code;
    els.cityHelp.textContent = `${fmt(state.municipalities.length)} municípios disponíveis.`;
  }

  async function loadDistricts() {
    const city = state.selectedMunicipality;
    state.districts = [];
    els.districtList.innerHTML = '<span class="helper">Carregando distritos...</span>';
    try {
      const payload = await api(`/api/geo?level=districts&municipality=${encodeURIComponent(city.code)}`);
      state.districts = payload.items || [];
      renderDistrictChoices();
      renderDistrictBoard();
    } catch (error) {
      els.districtList.innerHTML = `<span class="helper">${escapeHtml(error.message)}</span>`;
      renderDistrictBoard();
    }
  }

  function renderDistrictChoices() {
    els.districtList.innerHTML = state.districts.map((district) => `<button type="button" class="district-choice ${state.selectedDistrict?.code === String(district.code) ? 'active' : ''}" data-district-choice="${escapeHtml(district.code)}">${escapeHtml(district.name)}</button>`).join('');
    els.districtList.querySelectorAll('[data-district-choice]').forEach((button) => {
      button.addEventListener('click', () => {
        const district = state.districts.find((item) => String(item.code) === button.dataset.districtChoice);
        if (district) selectDistrict(district);
      });
    });
  }

  async function selectState(item) {
    state.selectedState = { code:String(item.code), name:item.name || item.abbr, abbr:String(item.abbr || '').toUpperCase() };
    state.selectedMunicipality = null;
    state.selectedDistrict = null;
    state.municipalities = [];
    state.districts = [];
    state.level = 'state';
    els.zoneList.innerHTML = '<div class="empty-state">Selecione um município para abrir zonas e seções.</div>';
    els.districtList.innerHTML = '';
    updateTitles();
    setTab('candidates');
    await Promise.allSettled([loadMunicipalities(), loadResult()]);
  }

  async function selectMunicipality(item) {
    state.selectedMunicipality = { code:String(item.code), name:item.name || String(item.code) };
    state.selectedDistrict = null;
    state.level = 'municipality';
    if (els.citySelect) els.citySelect.value = state.selectedMunicipality.code;
    els.mapTitle.textContent = state.selectedMunicipality.name;
    els.mapSubtitle.textContent = `${state.selectedState.name} • distritos, zonas e seções`;
    updateTitles();
    const result = await loadResult();
    await Promise.allSettled([loadDistricts(), loadZones(result?.municipalityCode)]);
  }

  function selectDistrict(item) {
    state.selectedDistrict = { code:String(item.code), name:item.name || String(item.code) };
    state.level = 'district';
    updateTitles();
    renderDistrictChoices();
    renderDistrictBoard();
  }

  function buildResultQuery() {
    const params = new URLSearchParams({ action:'result', office:state.office });
    if (state.selectedState) params.set('uf', state.selectedState.abbr.toLowerCase());
    if (state.selectedMunicipality) {
      params.set('municipalityName', state.selectedMunicipality.name);
      params.set('municipalityCode', state.selectedMunicipality.code);
    }
    return params;
  }

  async function loadResult() {
    updateTitles();
    if (state.office !== 'presidente' && !state.selectedState) {
      state.lastResult = null;
      els.resultSummary.innerHTML = '<div class="empty-state">Selecione um estado para visualizar este cargo.</div>';
      els.candidateList.innerHTML = '<div class="empty-state">Aguardando seleção de uma UF.</div>';
      return null;
    }

    els.resultSummary.innerHTML = '<div class="loading">Consultando a totalização oficial...</div>';
    els.candidateList.innerHTML = '<div class="loading">Carregando candidatos...</div>';
    try {
      const result = await api(`/api/results?${buildResultQuery().toString()}`);
      state.lastResult = result;
      renderResult(result);
      setSourceStatus('Fonte oficial conectada', true);
      return result;
    } catch (error) {
      setSourceStatus('Fonte temporariamente indisponível', false);
      els.resultSummary.innerHTML = `<div class="error-state">${escapeHtml(error.message)}</div>`;
      els.candidateList.innerHTML = '<div class="empty-state">Sem dados para exibir neste momento.</div>';
      return null;
    }
  }

  function initials(name) {
    return String(name || '?').split(/\s+/).filter(Boolean).slice(0,2).map((word) => word[0]).join('').toUpperCase();
  }

  function renderResult(result) {
    const sections = result.sections || {};
    const electorate = result.electorate || {};
    const votes = result.votes || {};
    const progress = Math.max(0, Math.min(100, Number(sections.percentage || 0)));

    els.resultSummary.innerHTML = `
      <div class="totalization">
        <div class="total-main"><small>Seções totalizadas</small><strong>${pct(sections.percentage)}</strong></div>
        <div class="total-meta"><strong>${fmt(sections.totalized)} de ${fmt(sections.total)}</strong><span>${result.final ? 'Totalização encerrada' : 'Apuração em andamento'}</span></div>
        <div class="total-progress"><i style="width:${progress}%"></i></div>
        <div class="summary-metrics">
          <div class="summary-metric"><span>Comparecimento</span><b>${fmt(electorate.turnout)}</b></div>
          <div class="summary-metric"><span>Abstenções</span><b>${fmt(electorate.abstentions)}</b></div>
          <div class="summary-metric"><span>Válidos</span><b>${fmt(votes.valid)}</b></div>
          <div class="summary-metric"><span>Brancos + nulos</span><b>${fmt((votes.blank || 0) + (votes.null || 0))}</b></div>
        </div>
        <div class="summary-foot">Atualização TSE: ${escapeHtml([result.generatedDate, result.generatedTime].filter(Boolean).join(' ') || 'aguardando')}</div>
      </div>`;

    const candidates = result.candidates || [];
    const limit = state.office.startsWith('deputado') ? 40 : 12;
    els.candidateList.innerHTML = candidates.length ? candidates.slice(0, limit).map((candidate) => {
      const color = partyColor(candidate.party);
      const width = Math.max(0, Math.min(100, Number(candidate.percentage || 0)));
      return `
        <article class="candidate-card">
          <div class="candidate-avatar">
            <span class="avatar-fallback">${escapeHtml(initials(candidate.ballotName || candidate.name))}</span>
            ${candidate.photoUrl ? `<img src="${escapeHtml(candidate.photoUrl)}" alt="Foto de ${escapeHtml(candidate.ballotName || candidate.name)}" onerror="this.style.display='none'">` : ''}
          </div>
          <div class="candidate-main">
            <div class="candidate-name">${escapeHtml(candidate.ballotName || candidate.name)}</div>
            <div class="candidate-subline"><span class="party-chip" style="background:${color}">${escapeHtml(candidate.party || '—')}</span><span class="candidate-number">Nº ${escapeHtml(candidate.number || '—')}</span></div>
            <div class="candidate-bar"><i style="width:${width}%;background:${color}"></i><span>${fmt(candidate.votes)} votos</span></div>
          </div>
          <div class="candidate-score"><strong>${pct(candidate.percentage)}</strong><small>${fmt(candidate.votes)} votos</small>${candidate.status ? `<span class="candidate-status">${escapeHtml(candidate.status)}</span>` : ''}</div>
        </article>`;
    }).join('') : '<div class="empty-state">Ainda não há votos computados para este recorte.</div>';
  }

  async function loadZones(municipalityCode) {
    if (!state.selectedState || !municipalityCode) {
      els.zoneList.innerHTML = '<div class="empty-state">Zonas ainda não disponíveis para este município.</div>';
      return;
    }
    els.zoneList.innerHTML = '<div class="loading">Carregando zonas e seções...</div>';
    try {
      const params = new URLSearchParams({ action:'zones', uf:state.selectedState.abbr.toLowerCase(), municipalityCode:String(municipalityCode) });
      const payload = await api(`/api/results?${params.toString()}`);
      const zones = payload.zones || [];
      els.zoneList.innerHTML = zones.length ? `<div class="zone-grid">${zones.map((zone) => `
        <article class="zone-card"><h4>Zona ${escapeHtml(zone.code)}</h4><small>${fmt(zone.sections.length)} seções</small><div class="section-pills">${zone.sections.slice(0,90).map((section) => `<span class="section-pill">${escapeHtml(section.number)}</span>`).join('')}</div></article>`).join('')}</div>` : '<div class="empty-state">Nenhuma zona encontrada no arquivo oficial.</div>';
    } catch (error) {
      els.zoneList.innerHTML = `<div class="error-state">${escapeHtml(error.message)}</div>`;
    }
  }

  function setTab(tab) {
    state.activeTab = tab;
    document.querySelectorAll('.detail-tab').forEach((button) => button.classList.toggle('active', button.dataset.tab === tab));
    document.querySelectorAll('.detail-panel').forEach((panel) => panel.classList.toggle('active', panel.dataset.panel === tab));
  }

  async function goTo(target) {
    if (target === 'br') {
      state.selectedState = null;
      state.selectedMunicipality = null;
      state.selectedDistrict = null;
      state.municipalities = [];
      state.districts = [];
      state.level = 'br';
      els.citySelect.disabled = true;
      els.citySelect.innerHTML = '<option>Selecione primeiro um estado</option>';
      els.cityHelp.textContent = 'Clique em um estado no mapa.';
      els.districtList.innerHTML = '';
      els.zoneList.innerHTML = '<div class="empty-state">Selecione um município para carregar as zonas e seções.</div>';
      updateTitles();
      await Promise.allSettled([loadStates(), loadResult()]);
      return;
    }

    if (target === 'state' && state.selectedState) {
      state.selectedMunicipality = null;
      state.selectedDistrict = null;
      state.districts = [];
      state.level = 'state';
      els.zoneList.innerHTML = '<div class="empty-state">Selecione um município para abrir zonas e seções.</div>';
      els.districtList.innerHTML = '';
      updateTitles();
      await Promise.allSettled([loadMunicipalities(), loadResult()]);
      return;
    }

    if (target === 'municipality' && state.selectedMunicipality) {
      state.selectedDistrict = null;
      state.level = 'municipality';
      updateTitles();
      await loadDistricts();
    }
  }

  document.querySelectorAll('.office-btn').forEach((button) => {
    button.addEventListener('click', async () => {
      document.querySelectorAll('.office-btn').forEach((item) => item.classList.remove('active'));
      button.classList.add('active');
      state.office = button.dataset.office;
      updateTitles();
      if (state.level === 'br' && state.currentGeo?.level === 'states') {
        if (state.office === 'presidente') await loadStateSummaries();
        else renderGeo(state.currentGeo.payload, 'states');
      }
      await loadResult();
    });
  });

  document.querySelectorAll('.detail-tab').forEach((button) => button.addEventListener('click', () => setTab(button.dataset.tab)));

  els.citySelect.addEventListener('change', () => {
    const city = state.municipalities.find((item) => String(item.code) === String(els.citySelect.value));
    if (city) selectMunicipality(city);
  });

  els.refreshButton.addEventListener('click', async () => {
    await loadResult();
    if (state.level === 'br' && state.office === 'presidente') await loadStateSummaries();
  });

  els.resetButton.addEventListener('click', () => goTo('br'));
  els.backButton.addEventListener('click', () => {
    if (state.selectedDistrict) return goTo('municipality');
    if (state.selectedMunicipality) return goTo('state');
    if (state.selectedState) return goTo('br');
  });

  function tickClock() {
    els.clock.textContent = new Intl.DateTimeFormat('pt-BR', { hour:'2-digit', minute:'2-digit', second:'2-digit' }).format(new Date());
  }
  tickClock();
  setInterval(tickClock, 1000);

  setInterval(() => {
    if (!document.hidden) loadResult();
  }, 30000);

  updateTitles();
  setTab('candidates');
  Promise.allSettled([loadStates(), loadResult()]);
})();
