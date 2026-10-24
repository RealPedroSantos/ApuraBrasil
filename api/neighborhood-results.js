const unzipper = require('unzipper');
const { Readable } = require('stream');
const { StringDecoder } = require('string_decoder');

const YEAR = 2026;
const TSE_CKAN = 'https://dadosabertos.tse.jus.br/api/3/action/package_show?id=resultados-2026';
const OFFICE_CARGO = {
  presidente: '1',
  governador: '3',
  senador: '5',
  'deputado-federal': '6',
  'deputado-estadual': '7'
};

const memoryCache = new Map();
let catalogPromise = null;

function send(res, status, payload, cache = 'public, s-maxage=86400, stale-while-revalidate=604800') {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', cache);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.end(JSON.stringify(payload));
}

function norm(v) {
  return String(v ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}
function digits(v) { return String(v ?? '').replace(/\D/g, ''); }
function num(v) {
  const n = Number(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

async function fetchJson(url, timeout = 30000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json', 'User-Agent': 'ApuraBrasil/0.5' }
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function catalog() {
  if (!catalogPromise) {
    catalogPromise = fetchJson(TSE_CKAN)
      .then(value => value.result || value)
      .catch(error => {
        catalogPromise = null;
        throw error;
      });
  }
  return catalogPromise;
}

async function resourceFor(office, uf) {
  const data = await catalog();
  const resources = data.resources || [];
  const matcher = office === 'presidente'
    ? /^Presidente\s*-\s*Votação por seção eleitoral\s*-\s*2026$/i
    : new RegExp(`^${String(uf).toUpperCase()}\\s*-\\s*Votação por seção eleitoral\\s*-\\s*2026$`, 'i');
  const resource = resources.find(item => matcher.test(String(item.name || '')));
  if (!resource?.url) throw new Error('Arquivo oficial de votação por seção não encontrado no catálogo do TSE.');
  return resource;
}

function parseCsvLine(line) {
  const values = [];
  let value = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        value += '"';
        i++;
      } else {
        quoted = !quoted;
      }
    } else if (ch === ';' && !quoted) {
      values.push(value);
      value = '';
    } else {
      value += ch;
    }
  }
  values.push(value.replace(/\r$/, ''));
  return values;
}

async function getPollingPlaces(req, uf, municipalityName, municipalityCode) {
  const protocol = (req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim();
  const host = (req.headers['x-forwarded-host'] || req.headers.host || 'apurabrasil.vercel.app').split(',')[0].trim();
  const params = new URLSearchParams({ uf, municipalityName });
  if (municipalityCode) params.set('municipalityCode', municipalityCode);
  return fetchJson(`${protocol}://${host}/api/polling-places?${params}`, 90000);
}

function buildPlaceIndex(places) {
  const byZoneLocal = new Map();
  const neighborhoods = new Map();

  for (const place of places || []) {
    const zone = digits(place.zone);
    const local = digits(place.code);
    const name = String(place.neighborhood || '').trim() || 'SEM BAIRRO INFORMADO';
    const key = norm(name) || 'SEM BAIRRO INFORMADO';
    if (zone && local) byZoneLocal.set(`${zone}|${local}`, key);

    let neighborhood = neighborhoods.get(key);
    if (!neighborhood) {
      neighborhood = {
        key,
        name,
        places: 0,
        electorate: 0,
        sectionKeys: new Set(),
        voteSectionKeys: new Set(),
        sectionElectorate: new Map(),
        zones: new Set(),
        candidates: new Map(),
        blank: 0,
        null: 0,
        rawVotes: 0
      };
      neighborhoods.set(key, neighborhood);
    }

    neighborhood.places++;
    neighborhood.electorate += Number(place.electorate || 0);
    if (zone) neighborhood.zones.add(zone);

    for (const section of place.sections || []) {
      const sectionNumber = digits(section);
      if (zone && sectionNumber) neighborhood.sectionKeys.add(`${zone}|${sectionNumber}`);
    }
    for (const section of place.sectionElectorate || []) {
      const sectionNumber = digits(section.number);
      if (zone && sectionNumber) {
        neighborhood.sectionElectorate.set(`${zone}|${sectionNumber}`, Number(section.electorate || 0));
      }
    }
  }

  return { byZoneLocal, neighborhoods };
}

function addVoteRow(cols, headerIndex, filters, index, scanInfo) {
  const get = key => cols[headerIndex[key]] ?? '';
  if (String(get('ANO_ELEICAO')) !== String(YEAR)) return;
  if (String(get('NR_TURNO')) !== String(filters.round)) return;
  if (digits(get('CD_MUNICIPIO')) !== filters.municipalityCode) return;
  if (digits(get('CD_CARGO')) !== filters.cargo) return;

  const zone = digits(get('NR_ZONA'));
  const local = digits(get('NR_LOCAL_VOTACAO'));
  const neighborhoodKey = index.byZoneLocal.get(`${zone}|${local}`);
  if (!neighborhoodKey) return;
  const neighborhood = index.neighborhoods.get(neighborhoodKey);
  if (!neighborhood) return;

  scanInfo.matchedRows++;
  scanInfo.generatedDate ||= String(get('DT_GERACAO') || '');
  scanInfo.generatedTime ||= String(get('HH_GERACAO') || '');

  const section = digits(get('NR_SECAO'));
  if (zone && section) neighborhood.voteSectionKeys.add(`${zone}|${section}`);

  const votes = num(get('QT_VOTOS'));
  const number = digits(get('NR_VOTAVEL'));
  const sequence = String(get('SQ_CANDIDATO') || '');
  neighborhood.rawVotes += votes;

  if (number === '95') {
    neighborhood.blank += votes;
    return;
  }
  if (number === '96') {
    neighborhood.null += votes;
    return;
  }

  const candidateKey = sequence && sequence !== '-1' ? `seq:${sequence}` : `num:${number}`;
  let candidate = neighborhood.candidates.get(candidateKey);
  if (!candidate) {
    candidate = {
      number,
      sequence: sequence === '-1' ? '' : sequence,
      name: String(get('NM_VOTAVEL') || ''),
      votes: 0,
      legend: sequence === '-1'
    };
    neighborhood.candidates.set(candidateKey, candidate);
  }
  candidate.votes += votes;
}

async function scanZip(resourceUrl, filters, index) {
  const response = await fetch(resourceUrl, {
    headers: { 'User-Agent': 'ApuraBrasil/0.5' },
    cache: 'no-store'
  });
  if (!response.ok || !response.body) {
    throw new Error(`TSE respondeu ${response.status} ao abrir votação por seção.`);
  }

  const parser = Readable.fromWeb(response.body).pipe(unzipper.Parse({ forceStream: true }));
  const scanInfo = { matchedRows: 0, generatedDate: '', generatedTime: '' };
  let csvFound = false;

  for await (const entry of parser) {
    if (!/\.csv$/i.test(entry.path || '')) {
      entry.autodrain();
      continue;
    }

    csvFound = true;
    const decoder = new StringDecoder('latin1');
    let carry = '';
    let header = null;
    let headerIndex = null;

    for await (const chunk of entry) {
      carry += decoder.write(chunk);
      let newline;
      while ((newline = carry.indexOf('\n')) >= 0) {
        const line = carry.slice(0, newline);
        carry = carry.slice(newline + 1);

        if (!header) {
          header = parseCsvLine(line).map(value => value.replace(/^\uFEFF/, ''));
          headerIndex = Object.fromEntries(header.map((name, i) => [name, i]));
          continue;
        }

        if (!line.includes(`;${filters.municipalityCode};`)) continue;
        addVoteRow(parseCsvLine(line), headerIndex, filters, index, scanInfo);
      }
    }

    carry += decoder.end();
    if (carry && header && carry.includes(`;${filters.municipalityCode};`)) {
      addVoteRow(parseCsvLine(carry), headerIndex, filters, index, scanInfo);
    }
    break;
  }

  if (!csvFound) throw new Error('CSV oficial não encontrado dentro do arquivo do TSE.');
  return scanInfo;
}

function serializeNeighborhood(neighborhood, office, finalAvailable) {
  const valid = [...neighborhood.candidates.values()].reduce((sum, candidate) => sum + candidate.votes, 0);
  const voteSlots = valid + neighborhood.blank + neighborhood.null;
  const votesPerElector = office === 'senador' ? 2 : 1;
  const turnout = Math.round(voteSlots / votesPerElector);
  const resultSections = finalAvailable ? neighborhood.voteSectionKeys : neighborhood.sectionKeys;

  let electorate = [...resultSections].reduce(
    (sum, sectionKey) => sum + Number(neighborhood.sectionElectorate.get(sectionKey) || 0),
    0
  );
  if (!electorate) electorate = Number(neighborhood.electorate || 0);
  electorate = Math.max(electorate, turnout);
  const abstentions = Math.max(0, electorate - turnout);

  const candidates = [...neighborhood.candidates.values()]
    .filter(candidate => !candidate.legend)
    .map(candidate => ({
      ...candidate,
      percentage: valid ? candidate.votes / valid * 100 : 0
    }))
    .sort((a, b) => b.votes - a.votes || a.name.localeCompare(b.name, 'pt-BR'));

  const legends = [...neighborhood.candidates.values()]
    .filter(candidate => candidate.legend)
    .map(candidate => ({ number: candidate.number, name: candidate.name, votes: candidate.votes }));

  return {
    key: neighborhood.key,
    name: neighborhood.name,
    available: finalAvailable,
    places: neighborhood.places,
    zones: [...neighborhood.zones].sort((a, b) => Number(a) - Number(b)),
    sections: {
      total: resultSections.size,
      totalized: finalAvailable ? resultSections.size : 0,
      percentage: finalAvailable && resultSections.size ? 100 : 0
    },
    electorate: {
      total: electorate,
      turnout,
      turnoutPercentage: electorate ? turnout / electorate * 100 : 0,
      abstentions,
      abstentionPercentage: electorate ? abstentions / electorate * 100 : 0
    },
    votes: {
      valid,
      validPercentage: voteSlots ? valid / voteSlots * 100 : 0,
      blank: neighborhood.blank,
      blankPercentage: voteSlots ? neighborhood.blank / voteSlots * 100 : 0,
      null: neighborhood.null,
      nullPercentage: voteSlots ? neighborhood.null / voteSlots * 100 : 0
    },
    candidates,
    legends,
    winner: candidates[0] || null
  };
}

async function build(req, query) {
  const year = Number(query.year || YEAR);
  const round = Number(query.round || 1);
  const office = String(query.office || 'presidente');
  const uf = String(query.uf || '').toUpperCase();
  const municipalityCode = digits(query.municipalityCode);
  const municipalityName = String(query.municipalityName || '').trim();

  if (year !== YEAR) throw new Error('Resultados por bairro estão disponíveis nesta integração para 2026.');
  if (round !== 1 && round !== 2) throw new Error('Turno inválido.');

  let cargo = OFFICE_CARGO[office];
  if (office === 'deputado-estadual' && uf === 'DF') cargo = '8';
  if (!cargo) throw new Error('Cargo não suportado para resultado por bairro.');
  if (!uf || !municipalityCode || !municipalityName) {
    throw new Error('UF, código e nome do município são obrigatórios.');
  }

  const cacheKey = [year, round, office, uf, municipalityCode].join('|');
  if (memoryCache.has(cacheKey)) return memoryCache.get(cacheKey);

  const promise = (async () => {
    const [resource, placesPayload] = await Promise.all([
      resourceFor(office, uf),
      getPollingPlaces(req, uf, municipalityName, municipalityCode)
    ]);

    const index = buildPlaceIndex(placesPayload.places || []);
    if (!index.neighborhoods.size) throw new Error('O TSE não retornou bairros para este município.');

    const scanned = await scanZip(resource.url, { round, cargo, municipalityCode }, index);
    const available = scanned.matchedRows > 0;

    return {
      ok: true,
      available,
      year,
      round,
      office,
      uf,
      municipalityCode,
      municipalityName,
      source: 'TSE Dados Abertos — Votação por seção eleitoral 2026',
      sourceUrl: resource.url,
      resourceName: resource.name || '',
      generatedDate: scanned.generatedDate,
      generatedTime: scanned.generatedTime,
      matchedRows: scanned.matchedRows,
      notice: available
        ? 'Votos por bairro agregados exclusivamente das seções e locais de votação oficiais do TSE.'
        : 'O TSE ainda não publicou a votação por seção deste turno no arquivo oficial de Dados Abertos.',
      neighborhoods: [...index.neighborhoods.values()]
        .map(neighborhood => serializeNeighborhood(neighborhood, office, available))
        .sort((a, b) => b.electorate.total - a.electorate.total || a.name.localeCompare(b.name, 'pt-BR')),
      checkedAt: new Date().toISOString()
    };
  })();

  memoryCache.set(cacheKey, promise);
  try {
    return await promise;
  } catch (error) {
    memoryCache.delete(cacheKey);
    throw error;
  }
}

module.exports = async function handler(req, res) {
  try {
    const result = await build(req, req.query || {});
    const cache = result.available && result.round === 1
      ? 'public, s-maxage=604800, stale-while-revalidate=2592000'
      : 'public, s-maxage=30, stale-while-revalidate=120';
    return send(res, 200, result, cache);
  } catch (error) {
    return send(res, 502, {
      ok: false,
      error: 'Não foi possível obter a votação oficial por bairro.',
      detail: error.message,
      checkedAt: new Date().toISOString()
    }, 'no-store');
  }
};
