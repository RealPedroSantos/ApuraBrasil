const TSE_BASE = 'https://resultados.tse.jus.br/oficial';
const CYCLE = 'ele2026';
const PLEITO = '3220';
const UFS = ['ac','al','ap','am','ba','ce','df','es','go','ma','mt','ms','mg','pa','pb','pr','pe','pi','rj','rn','rs','ro','rr','sc','sp','se','to'];
const OFFICES = {
  presidente: { election: '6257', cargo: '0001', label: 'Presidente' },
  governador: { election: '6259', cargo: '0003', label: 'Governador' },
  senador: { election: '6259', cargo: '0005', label: 'Senador' },
  'deputado-federal': { election: '6259', cargo: '0006', label: 'Deputado Federal' },
  'deputado-estadual': { election: '6259', cargo: '0007', label: 'Deputado Estadual' }
};

function send(res, status, payload, cache = 'public, s-maxage=5, stale-while-revalidate=20') {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', cache);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.end(JSON.stringify(payload));
}

function pad(value, size) { return String(value).padStart(size, '0'); }
function integer(value) {
  const parsed = parseInt(String(value ?? '').replace(/\D/g, ''), 10);
  return Number.isFinite(parsed) ? parsed : 0;
}
function decimal(value) {
  if (typeof value === 'number') return value;
  const raw = String(value ?? '').trim();
  const parsed = raw.includes(',') ? Number(raw.replace(/\./g, '').replace(',', '.')) : Number(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}
function normalizeText(value) {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

async function fetchJson(url, timeout = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json', 'User-Agent': 'ApuraBrasil/0.1 (+Vercel)' },
      cache: 'no-store'
    });
    if (!response.ok) throw new Error(`TSE respondeu ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

function officeDefinition(office, uf) {
  const base = OFFICES[office];
  if (!base) throw new Error('Cargo não suportado.');
  if (office === 'deputado-estadual' && String(uf || '').toLowerCase() === 'df') {
    return { ...base, cargo: '0008', label: 'Deputado Distrital' };
  }
  return base;
}

function resultUrl(def, uf, municipalityCode) {
  const election = pad(def.election, 6);
  if (def.cargo === '0001' && !uf) {
    return `${TSE_BASE}/${CYCLE}/${def.election}/dados/br/br-c${def.cargo}-e${election}-u.json`;
  }
  const state = String(uf || '').toLowerCase();
  if (!state) throw new Error('Selecione uma UF para este cargo.');
  const scope = municipalityCode ? `${state}${pad(municipalityCode, 5)}` : state;
  return `${TSE_BASE}/${CYCLE}/${def.election}/dados/${state}/${scope}-c${def.cargo}-e${election}-u.json`;
}

function normalizeResult(raw, meta) {
  const cargo = raw?.carg?.[0] || {};
  const candidates = [];
  const groups = [];
  for (const group of cargo.agr || []) {
    let groupVotes = 0;
    const parties = [];
    for (const party of group.par || []) {
      parties.push(party.sg || '');
      const legendVotes = integer(party.tval);
      groupVotes += legendVotes;
      for (const candidate of party.cand || []) {
        const votes = integer(candidate.vap);
        groupVotes += votes;
        candidates.push({
          number: String(candidate.n || ''),
          sequence: String(candidate.sqcand || ''),
          name: candidate.nm || '',
          ballotName: candidate.nmu || candidate.nm || '',
          party: party.sg || candidate.sgp || '',
          coalition: group.nm || '',
          votes,
          percentage: decimal(candidate.pvap),
          status: candidate.st || '',
          electedFlag: candidate.e || '',
          photoUrl: candidate.sqcand ? `${TSE_BASE}/${CYCLE}/${meta.election}/fotos/${meta.photoScope}/${candidate.sqcand}.jpeg` : ''
        });
      }
    }
    groups.push({ name: group.nm || '', composition: group.com || '', parties, seats: integer(group.vag), votes: groupVotes });
  }
  candidates.sort((a,b) => b.votes - a.votes || a.ballotName.localeCompare(b.ballotName, 'pt-BR'));
  groups.sort((a,b) => b.seats - a.seats || b.votes - a.votes);
  const s = raw.s || {}, e = raw.e || {}, v = raw.v || {};
  return {
    ok: true,
    year: 2026,
    round: integer(raw.t) || 1,
    electionCode: String(raw.ele || meta.election),
    office: meta.office,
    officeLabel: meta.officeLabel,
    scope: String(raw.cdabr || meta.scope || '').toUpperCase(),
    municipalityCode: meta.municipalityCode || null,
    municipalityName: meta.municipalityName || null,
    generatedDate: raw.dg || '',
    generatedTime: raw.hg || '',
    idg: String(raw.idg || ''),
    final: String(raw.tf || '').toLowerCase() === 's',
    mathematicallyDefined: String(raw.md || '').toLowerCase() !== 'n' && String(raw.md || '') !== '',
    sections: { total: integer(s.ts), totalized: integer(s.st), percentage: decimal(s.pst) },
    electorate: {
      total: integer(e.te), turnout: integer(e.c), turnoutPercentage: decimal(e.pc),
      abstentions: integer(e.a), abstentionPercentage: decimal(e.pa)
    },
    votes: {
      valid: integer(v.vv !== undefined ? v.vv : v.vvc), validPercentage: decimal(v.pvv !== undefined ? v.pvv : v.pvvc),
      blank: integer(v.vb), blankPercentage: decimal(v.pvb),
      null: integer(v.tvn !== undefined ? v.tvn : v.vn), nullPercentage: decimal(v.ptvn !== undefined ? v.ptvn : v.pvn)
    },
    candidates,
    groups,
    sourceUrl: meta.sourceUrl,
    checkedAt: new Date().toISOString()
  };
}

async function municipalityList(election, uf) {
  const code = pad(election, 6);
  const url = `${TSE_BASE}/${CYCLE}/${election}/config/mun-e${code}-cm.json`;
  const payload = await fetchJson(url);
  const scope = (payload.abr || []).find((x) => String(x.cd || '').toLowerCase() === String(uf || '').toLowerCase());
  const municipalities = (scope?.mu || []).map((m) => ({ code: String(m.cd), name: m.nm || '', capital: /^s$/i.test(String(m.c || '')) }));
  return { municipalities, sourceUrl: url };
}

async function resolveMunicipality(election, uf, municipalityCode, municipalityName) {
  const list = await municipalityList(election, uf);
  let match;
  if (municipalityCode) match = list.municipalities.find((m) => String(m.code) === String(municipalityCode).padStart(5, '0'));
  if (!match && municipalityName) {
    const target = normalizeText(municipalityName);
    match = list.municipalities.find((m) => normalizeText(m.name) === target);
  }
  if (!match && municipalityName) {
    const target = normalizeText(municipalityName);
    match = list.municipalities.find((m) => normalizeText(m.name).includes(target) || target.includes(normalizeText(m.name)));
  }
  if (!match) throw new Error(`Município ${municipalityName || municipalityCode || ''} não encontrado na configuração oficial do TSE.`);
  return match;
}

async function persistSnapshot(result) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key || !result?.sourceUrl) return;
  const body = {
    election_code: result.electionCode,
    office: result.office,
    scope: result.scope,
    source_url: result.sourceUrl,
    idg: result.idg || null,
    generated_date: result.generatedDate || null,
    generated_time: result.generatedTime || null,
    sections_percentage: result.sections?.percentage || 0,
    payload: result
  };
  try {
    await fetch(`${url}/rest/v1/result_snapshots?on_conflict=source_url,idg`, {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal'
      },
      body: JSON.stringify(body)
    });
  } catch (error) {
    console.warn('snapshot persistence failed', error.message);
  }
}

async function getResult(query) {
  const office = String(query.office || 'presidente');
  const uf = query.uf ? String(query.uf).toLowerCase() : '';
  const def = officeDefinition(office, uf);
  let municipality = null;
  if (query.municipalityName || query.municipalityCode) {
    if (!uf) throw new Error('UF obrigatória para resultado municipal.');
    municipality = await resolveMunicipality(def.election, uf, query.municipalityCode, query.municipalityName);
  }
  const url = resultUrl(def, uf || null, municipality?.code);
  const raw = await fetchJson(url);
  const result = normalizeResult(raw, {
    office,
    officeLabel: def.label,
    election: def.election,
    scope: municipality ? `${uf}${municipality.code}` : (uf || 'br'),
    photoScope: uf || 'br',
    municipalityCode: municipality?.code || null,
    municipalityName: municipality?.name || null,
    sourceUrl: url
  });
  await persistSnapshot(result);
  return result;
}

async function stateSummaries() {
  const def = OFFICES.presidente;
  const settled = await Promise.allSettled(UFS.map(async (uf) => {
    const url = resultUrl(def, uf, null);
    const raw = await fetchJson(url, 10000);
    const result = normalizeResult(raw, { office:'presidente', officeLabel:def.label, election:def.election, scope:uf, photoScope:'br', sourceUrl:url });
    return { uf: uf.toUpperCase(), available:true, sectionsPercentage:result.sections.percentage, winner:result.candidates[0] || null, sourceUrl:url };
  }));
  return settled.map((item, i) => item.status === 'fulfilled' ? item.value : ({ uf: UFS[i].toUpperCase(), available:false }));
}

function resolveDirectory(template, context) {
  if (!template) return null;
  let value = String(template);
  const replacements = {
    '<base>/<ambiente>': TSE_BASE,
    '<base>': 'https://resultados.tse.jus.br',
    '<ambiente>': 'oficial',
    '<ciclo>': CYCLE,
    '<cd_eleicao>': context.election,
    '<cd_pleito>': context.pleito,
    '<uf>': context.uf
  };
  for (const [from,to] of Object.entries(replacements)) value = value.split(from).join(to);
  if (value.startsWith('/')) value = `https://resultados.tse.jus.br${value}`;
  return value.replace(/\/$/, '');
}

async function sectionsConfigUrl(uf) {
  const fallback = `${TSE_BASE}/${CYCLE}/arquivo-urna/${PLEITO}/config/${uf}/${uf}-p${pad(PLEITO,6)}-cs.json`;
  try {
    const config = await fetchJson(`${TSE_BASE}/comum/config/ele-c.json`);
    const template = (config.arq || []).find((item) => String(item.tp || '').toLowerCase() === 'cs')?.dir;
    const dir = resolveDirectory(template, { election:'6259', pleito:PLEITO, uf });
    return dir ? `${dir}/${uf}-p${pad(PLEITO,6)}-cs.json` : fallback;
  } catch {
    return fallback;
  }
}

async function getZones(query) {
  const uf = String(query.uf || '').toLowerCase();
  const municipalityCode = String(query.municipalityCode || '').padStart(5, '0');
  if (!uf || !municipalityCode) throw new Error('UF e município são obrigatórios para listar zonas.');
  const url = await sectionsConfigUrl(uf);
  const payload = await fetchJson(url, 20000);
  const state = (payload.abr || []).find((x) => String(x.cd || '').toLowerCase() === uf) || payload.abr?.[0];
  const municipality = (state?.mu || []).find((m) => String(m.cd || '').padStart(5,'0') === municipalityCode);
  if (!municipality) throw new Error('Município não localizado no arquivo oficial de seções.');
  const zones = (municipality.zon || []).map((z) => ({
    code: String(z.cd || '').replace(/^0+/, '') || '0',
    sections: (z.sec || []).map((s) => ({
      number: String(s.ns || s.nsp || '').replace(/^0+/, '') || '0',
      original: String(s.nsp || s.ns || '').replace(/^0+/, '') || '0',
      auxiliaryDate: s.da || null,
      auxiliaryTime: s.ha || null
    }))
  }));
  return { ok:true, uf:uf.toUpperCase(), municipalityCode, municipalityName:municipality.nm || '', zones, sourceUrl:url, checkedAt:new Date().toISOString() };
}

module.exports = async function handler(req, res) {
  const query = req.query || {};
  const action = String(query.action || 'result');
  try {
    if (action === 'result') {
      const result = await getResult(query);
      return send(res, 200, result);
    }
    if (action === 'state-summaries') {
      const states = await stateSummaries();
      return send(res, 200, { ok:true, office:'presidente', states, checkedAt:new Date().toISOString() }, 'public, s-maxage=15, stale-while-revalidate=45');
    }
    if (action === 'municipalities') {
      const uf = String(query.uf || '').toLowerCase();
      if (!uf) return send(res, 400, { ok:false, error:'Informe a UF.' }, 'no-store');
      const def = officeDefinition(String(query.office || 'presidente'), uf);
      const data = await municipalityList(def.election, uf);
      return send(res, 200, { ok:true, uf:uf.toUpperCase(), municipalities:data.municipalities, sourceUrl:data.sourceUrl }, 'public, s-maxage=86400, stale-while-revalidate=604800');
    }
    if (action === 'zones') {
      const data = await getZones(query);
      return send(res, 200, data, 'public, s-maxage=300, stale-while-revalidate=1800');
    }
    return send(res, 400, { ok:false, error:'Ação inválida.' }, 'no-store');
  } catch (error) {
    return send(res, 502, { ok:false, error:'Não foi possível obter os dados eleitorais oficiais.', detail:error.message, checkedAt:new Date().toISOString() }, 'no-store');
  }
};
