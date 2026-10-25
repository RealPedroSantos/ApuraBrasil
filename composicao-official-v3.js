(() => {
  'use strict';

  const UFS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];
  const UF_NAMES = {AC:'Acre',AL:'Alagoas',AP:'Amapá',AM:'Amazonas',BA:'Bahia',CE:'Ceará',DF:'Distrito Federal',ES:'Espírito Santo',GO:'Goiás',MA:'Maranhão',MT:'Mato Grosso',MS:'Mato Grosso do Sul',MG:'Minas Gerais',PA:'Pará',PB:'Paraíba',PR:'Paraná',PE:'Pernambuco',PI:'Piauí',RJ:'Rio de Janeiro',RN:'Rio Grande do Norte',RS:'Rio Grande do Sul',RO:'Rondônia',RR:'Roraima',SC:'Santa Catarina',SP:'São Paulo',SE:'Sergipe',TO:'Tocantins'};
  const cache = new Map();
  const state = { house:'deputado-federal', uf:'BR', visible:40, generation:0, lastCandidates:[], lastMembersTitle:'Eleitos oficialmente' };

  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[c]));
  const norm = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/\s+/g,' ').trim();
  const number = value => Number(value || 0) || 0;

  function isOfficiallyElected(candidate) {
    const flag = norm(candidate?.electedFlag);
    if (['S','SIM','ELEITO','ELEITA'].includes(flag)) return true;
    const status = norm(candidate?.status);
    if (!status || /NAO ELEIT|SUPLENTE|2.? TURNO|SEGUNDO TURNO/.test(status)) return false;
    return /\bELEIT[OA]S?\b/.test(status);
  }

  function expectedSeats(house, uf='BR') {
    if (house === 'deputado-federal' && uf === 'BR') return 513;
    if (house === 'senador') return uf === 'BR' ? 54 : 2;
    return null;
  }

  function scopeLabel(uf=state.uf) { return uf === 'BR' ? 'Brasil' : (UF_NAMES[uf] || uf); }

  async function fetchJson(url, force=false) {
    if (!force && cache.has(url)) return cache.get(url);
    const promise = fetch(url, { cache: force ? 'no-store' : 'default', credentials:'same-origin' })
      .then(async response => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data?.error || `HTTP ${response.status}`);
        return data;
      })
      .catch(error => { cache.delete(url); throw error; });
    cache.set(url, promise);
    return promise;
  }

  async function fetchResult(office, uf, force=false) {
    const url = `/api/results?action=result&office=${encodeURIComponent(office)}&uf=${encodeURIComponent(uf.toLowerCase())}&year=2026&round=1`;
    const data = await fetchJson(url, force);
    return {
      ...data,
      uf,
      candidates:(Array.isArray(data?.candidates) ? data.candidates : []).map(c => ({...c,_uf:uf,_office:office})),
      groups:Array.isArray(data?.groups) ? data.groups : []
    };
  }

  async function mapLimit(items, limit, worker) {
    const output = new Array(items.length);
    let cursor = 0;
    async function run() {
      while (true) {
        const index = cursor++;
        if (index >= items.length) return;
        try { output[index] = await worker(items[index], index); }
        catch (error) { output[index] = { __error:error, uf:items[index] }; }
      }
    }
    await Promise.all(Array.from({length:Math.min(limit,items.length)}, run));
    return output;
  }

  async function loadOffice(office, uf, force=false) {
    const targets = uf === 'BR' ? UFS : [uf];
    const results = await mapLimit(targets, 6, code => fetchResult(office, code, force));
    const valid = results.filter(item => item && !item.__error && item.ok !== false && item.available !== false);
    const failures = results.filter(item => item?.__error || item?.ok === false || item?.available === false);
    const candidates = valid.flatMap(result => result.candidates).filter(isOfficiallyElected);
    const finalCount = valid.filter(result => result.final).length;
    const groupSeatTotal = valid.reduce((sum,result) => sum + result.groups.reduce((s,g)=>s+number(g.seats),0),0);
    return { office, uf, targets, results:valid, failures, candidates, finalCount, groupSeatTotal };
  }

  async function loadCurrentSenators(uf, force=false) {
    const data = await fetchJson('/api/senators', force);
    const all = Array.isArray(data?.senators) ? data.senators : [];
    return uf === 'BR' ? all : all.filter(s => String(s.uf).toUpperCase() === uf);
  }

  function aggregateParties(candidates) {
    const map = new Map();
    for (const candidate of candidates) {
      const party = String(candidate.party || 'Sem partido').trim() || 'Sem partido';
      map.set(party, (map.get(party) || 0) + 1);
    }
    return [...map.entries()].map(([party,seats]) => ({party,seats})).sort((a,b)=>b.seats-a.seats || a.party.localeCompare(b.party,'pt-BR'));
  }

  function titleFor(house, uf=state.uf) {
    if (house === 'senador') return `Senado Federal • ${scopeLabel(uf)}`;
    if (house === 'congresso') return `Congresso Nacional • ${scopeLabel(uf)}`;
    if (house === 'deputado-estadual') return `Assembleia Legislativa • ${scopeLabel(uf)}`;
    return `Câmara dos Deputados • ${scopeLabel(uf)}`;
  }

  function officeName(office) {
    return office === 'senador' ? 'Senador' : office === 'deputado-estadual' ? 'Deputado estadual/distrital' : 'Deputado federal';
  }

  function setStatus(text, type='') {
    const node = $('#coStatus');
    node.textContent = text;
    node.className = `co-status ${type}`.trim();
  }

  function renderMetrics(metrics) {
    $('#coSummary').innerHTML = metrics.map(metric => `<div class="co-metric"><span>${esc(metric.label)}</span><strong>${esc(metric.value)}</strong><small>${esc(metric.note || '')}</small></div>`).join('');
  }

  function renderParties(candidates, title='Distribuição por partido') {
    $('#partyTitle').textContent = title;
    const rows = aggregateParties(candidates);
    const max = Math.max(1, ...rows.map(row => row.seats));
    $('#partyList').innerHTML = rows.length ? rows.map(row => `<div class="co-party-row"><div class="co-party-name">${esc(row.party)}</div><div class="co-party-bar" aria-hidden="true"><div class="co-party-fill" style="width:${Math.max(4,(row.seats/max)*100).toFixed(2)}%"></div></div><div class="co-party-count">${row.seats}</div></div>`).join('') : '<div class="co-empty">Nenhum candidato com status oficial de eleito foi retornado para este recorte.</div>';
  }

  function candidateCard(candidate) {
    const uf = candidate._uf || '';
    const photo = String(candidate.photoUrl || '').trim();
    const name = candidate.ballotName || candidate.name || 'Nome não informado';
    const meta = [candidate.party, uf, officeName(candidate._office)].filter(Boolean).join(' • ');
    const img = photo ? `<img src="${esc(photo)}" alt="${esc(name)}" loading="lazy" decoding="async" referrerpolicy="no-referrer">` : esc(uf);
    return `<article class="co-person"><div class="co-photo">${img}</div><div class="co-person-main"><strong class="co-person-name">${esc(name)}</strong><span class="co-person-meta">${esc(meta)}</span><span class="co-person-status">ELEITO — STATUS OFICIAL TSE</span></div></article>`;
  }

  function renderMembers(candidates, title='Eleitos oficialmente') {
    state.lastCandidates = candidates;
    state.lastMembersTitle = title;
    $('#membersTitle').textContent = title;
    const sorted = [...candidates].sort((a,b)=>String(a._uf).localeCompare(String(b._uf)) || number(b.votes)-number(a.votes) || String(a.ballotName||a.name).localeCompare(String(b.ballotName||b.name),'pt-BR'));
    const visible = sorted.slice(0,state.visible);
    $('#memberList').innerHTML = visible.length ? visible.map(candidateCard).join('') : '<div class="co-empty">Nenhum nome com status oficial de eleito foi retornado pelo TSE neste recorte.</div>';
    $('#memberList').querySelectorAll('img').forEach(img => img.addEventListener('error', () => {
      const box = img.parentElement;
      const card = img.closest('.co-person');
      const meta = card?.querySelector('.co-person-meta')?.textContent || '';
      const uf = UFS.find(code => meta.includes(`• ${code}`) || meta.startsWith(`${code} •`)) || '';
      img.remove();
      if (box && !box.textContent.trim()) box.textContent = uf;
    }, {once:true}));
    const more = $('#showMore');
    more.hidden = sorted.length <= visible.length;
    more.dataset.total = String(sorted.length);
  }

  function renderCurrentSenators(senators) {
    const section = $('#currentSenateSection');
    if (!senators?.length) { section.hidden = true; return; }
    section.hidden = false;
    $('#currentSenateCount').textContent = `${senators.length} em exercício`;
    $('#currentSenateList').innerHTML = senators.map(s => {
      const photo = String(s.photoUrl || '').trim();
      return `<div class="co-current-person"><div class="co-photo">${photo ? `<img src="${esc(photo)}" alt="${esc(s.name)}" loading="lazy" referrerpolicy="no-referrer">` : esc(s.uf)}</div><div><strong>${esc(s.name)}</strong><span>${esc([s.party,s.uf].filter(Boolean).join(' • '))}</span></div></div>`;
    }).join('');
  }

  function updateScopeControl() {
    const select = $('#ufSelect');
    if (!select.options.length) select.innerHTML = '<option value="BR">Brasil</option>' + UFS.map(uf => `<option value="${uf}">${esc(UF_NAMES[uf])}</option>`).join('');
    if (state.house === 'deputado-estadual' && state.uf === 'BR') state.uf = 'AC';
    select.value = state.uf;
    select.querySelector('option[value="BR"]').disabled = state.house === 'deputado-estadual';
  }

  function updateHeading(subtitle, house=state.house, uf=state.uf) {
    $('#compositionTitle').textContent = titleFor(house,uf);
    $('#compositionSubtitle').textContent = subtitle;
  }

  function renderLoadIntegrity(loads) {
    const all = loads.flatMap(load => load?.results || []);
    const requested = loads.reduce((sum,load)=>sum + (load?.targets?.length || 0),0);
    const loaded = all.length;
    const finals = all.filter(result => result.final).length;
    const failed = loads.reduce((sum,load)=>sum+(load?.failures?.length||0),0);
    $('#integrityText').textContent = `${loaded}/${requested} recortes oficiais carregados${finals ? ` • ${finals} marcados como finais pelo TSE` : ''}${failed ? ` • ${failed} indisponíveis` : ''}.`;
  }

  async function renderChamber(force, generation, uf) {
    const data = await loadOffice('deputado-federal', uf, force);
    if (generation !== state.generation) return;
    const expected = uf === 'BR' ? 513 : (data.groupSeatTotal || null);
    updateHeading('Somente candidatos com status oficial de eleito retornado pelo TSE. Nenhuma cadeira é inferida por percentual de votos.','deputado-federal',uf);
    renderMetrics([
      {label:'Eleitos confirmados',value:data.candidates.length,note:'status oficial TSE'},
      {label:'Total da casa/recorte',value:expected || '—',note:expected ? 'referência oficial/resultados' : 'aguardando total oficial'},
      {label:'UFs carregadas',value:`${data.results.length}/${data.targets.length}`,note:`${data.finalCount} resultados finais`}
    ]);
    renderParties(data.candidates,'Distribuição dos eleitos confirmados');
    renderMembers(data.candidates,'Deputados federais eleitos oficialmente');
    renderCurrentSenators([]);
    renderLoadIntegrity([data]);
  }

  async function renderSenate(force, generation, uf) {
    const [data,current] = await Promise.all([loadOffice('senador', uf, force), loadCurrentSenators(uf, force)]);
    if (generation !== state.generation) return;
    const expected = expectedSeats('senador',uf);
    updateHeading('A eleição de 2026 renova 2/3 do Senado. Os vencedores só aparecem quando o TSE os marca oficialmente como eleitos; os senadores em exercício são consultados separadamente no Senado Federal.','senador',uf);
    renderMetrics([
      {label:'Eleitos em 2026',value:data.candidates.length,note:'status oficial TSE'},
      {label:'Vagas de 2026',value:expected,note:uf==='BR'?'54 vagas em disputa':'2 vagas no estado'},
      {label:'Em exercício hoje',value:current.length,note:'Dados Abertos do Senado'}
    ]);
    renderParties(data.candidates,'Partidos dos eleitos em 2026');
    renderMembers(data.candidates,'Senadores eleitos oficialmente em 2026');
    renderCurrentSenators(current);
    renderLoadIntegrity([data]);
  }

  async function renderCongress(force, generation, uf) {
    const [chamber,senate] = await Promise.all([loadOffice('deputado-federal',uf,force),loadOffice('senador',uf,force)]);
    if (generation !== state.generation) return;
    const combined = [...chamber.candidates,...senate.candidates];
    updateHeading('Visão conjunta apenas dos eleitos oficialmente confirmados em 2026. Câmara e Senado continuam sendo casas distintas; não calculamos uma “maioria do Congresso” combinando as duas.','congresso',uf);
    renderMetrics([
      {label:'Deputados eleitos',value:chamber.candidates.length,note:uf==='BR'?'de 513 cadeiras da Câmara':'no recorte selecionado'},
      {label:'Senadores eleitos',value:senate.candidates.length,note:uf==='BR'?'de 54 vagas em 2026':'de 2 vagas no estado'},
      {label:'Confirmados no recorte',value:combined.length,note:'soma descritiva, não maioria'}
    ]);
    renderParties(combined,'Partidos entre os eleitos confirmados em 2026');
    renderMembers(combined,'Eleitos oficialmente em 2026');
    renderCurrentSenators([]);
    renderLoadIntegrity([chamber,senate]);
  }

  async function renderAssembly(force, generation, uf) {
    const data = await loadOffice('deputado-estadual',uf,force);
    if (generation !== state.generation) return;
    const total = data.groupSeatTotal || null;
    updateHeading('Assembleia do estado selecionado. A lista considera somente candidatos com status oficial de eleito retornado pelo TSE.','deputado-estadual',uf);
    renderMetrics([
      {label:'Eleitos confirmados',value:data.candidates.length,note:'status oficial TSE'},
      {label:'Cadeiras no resultado',value:total || '—',note:total?'total reportado nos grupos do TSE':'sem total consolidado'},
      {label:'Resultado',value:data.finalCount ? 'FINAL' : 'EM DADOS',note:`${data.results.length}/${data.targets.length} recorte carregado`}
    ]);
    renderParties(data.candidates,'Composição oficial por partido');
    renderMembers(data.candidates,'Deputados estaduais/distritais eleitos');
    renderCurrentSenators([]);
    renderLoadIntegrity([data]);
  }

  async function render(force=false, resetVisible=true) {
    const generation = ++state.generation;
    const house = state.house;
    const uf = state.uf;
    if (resetVisible) state.visible = 40;
    state.lastCandidates = [];
    updateScopeControl();
    setStatus('Consultando os dados oficiais…','loading');
    $('#memberList').innerHTML = '<div class="co-empty">Carregando resultados oficiais…</div>';
    $('#partyList').innerHTML = '<div class="co-empty">Carregando composição…</div>';
    $('#currentSenateSection').hidden = true;
    try {
      if (force) [...cache.keys()].forEach(key => { if (key.startsWith('/api/results') || key === '/api/senators') cache.delete(key); });
      if (house === 'senador') await renderSenate(force,generation,uf);
      else if (house === 'congresso') await renderCongress(force,generation,uf);
      else if (house === 'deputado-estadual') await renderAssembly(force,generation,uf);
      else await renderChamber(force,generation,uf);
      if (generation !== state.generation) return;
      setStatus(`Atualizado com fontes oficiais • ${new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit',second:'2-digit'})}`);
    } catch (error) {
      if (generation !== state.generation) return;
      console.error(error);
      setStatus('Não foi possível carregar todos os dados oficiais neste momento. Nenhuma estimativa foi usada para preencher o que faltou.','error');
      $('#memberList').innerHTML = '<div class="co-empty">Dados oficiais indisponíveis. Tente atualizar novamente.</div>';
      $('#partyList').innerHTML = '<div class="co-empty">Sem dados para exibir.</div>';
    }
  }

  function bindControls() {
    $$('.co-tab').forEach(button => button.addEventListener('click', () => {
      if (button.dataset.house === state.house) return;
      state.house = button.dataset.house;
      $$('.co-tab').forEach(item => item.classList.toggle('active', item === button));
      updateScopeControl();
      render(false,true);
    }));
    $('#ufSelect').addEventListener('change', event => { state.uf = event.target.value; render(false,true); });
    $('#refreshComposition').addEventListener('click', () => render(true,true));
    $('#showMore').addEventListener('click', () => {
      state.visible += 40;
      renderMembers(state.lastCandidates,state.lastMembersTitle);
    });
    $('#moreButton').addEventListener('click', () => { const sheet=$('#moreSheet'); sheet.hidden=!sheet.hidden; });
    $('#sheetRefresh').addEventListener('click', () => { $('#moreSheet').hidden=true; render(true,true); });
  }

  function init() {
    updateScopeControl();
    bindControls();
    render(false,true);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',init,{once:true}); else init();
})();