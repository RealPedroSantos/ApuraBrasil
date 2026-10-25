function send(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', status === 200 ? 'public, s-maxage=3600, stale-while-revalidate=86400' : 'no-store');
  res.end(JSON.stringify(payload));
}

function first(value) {
  return Array.isArray(value) ? value[0] : value;
}

function findParliamentarians(node, out = []) {
  if (!node || typeof node !== 'object') return out;
  if (Array.isArray(node)) {
    node.forEach(item => findParliamentarians(item, out));
    return out;
  }

  const id = node.IdentificacaoParlamentar || node.identificacaoParlamentar;
  if (id && typeof id === 'object') out.push(first(id));
  for (const value of Object.values(node)) findParliamentarians(value, out);
  return out;
}

function pick(obj, ...keys) {
  for (const key of keys) {
    const value = obj?.[key];
    if (value !== undefined && value !== null && String(value).trim()) return String(value).trim();
  }
  return '';
}

function normalize(item) {
  return {
    code: pick(item, 'CodigoParlamentar', 'codigoParlamentar'),
    name: pick(item, 'NomeParlamentar', 'nomeParlamentar'),
    fullName: pick(item, 'NomeCompletoParlamentar', 'nomeCompletoParlamentar'),
    party: pick(item, 'SiglaPartidoParlamentar', 'siglaPartidoParlamentar'),
    uf: pick(item, 'UfParlamentar', 'UFParlamentar', 'ufParlamentar').toUpperCase(),
    photoUrl: pick(item, 'UrlFotoParlamentar', 'URLFotoParlamentar', 'urlFotoParlamentar'),
    pageUrl: pick(item, 'UrlPaginaParlamentar', 'URLPaginaParlamentar', 'urlPaginaParlamentar'),
  };
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return send(res, 405, { ok: false, error: 'method_not_allowed' });
  }

  try {
    const response = await fetch('https://legis.senado.leg.br/dadosabertos/senador/lista/atual.json', {
      headers: { Accept: 'application/json', 'User-Agent': 'ApuraBrasil/1.0' },
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error(`Senado HTTP ${response.status}`);
    const payload = await response.json();
    const raw = findParliamentarians(payload);
    const seen = new Set();
    const senators = raw.map(normalize).filter(item => {
      const key = item.code || `${item.uf}|${item.name}`;
      if (!item.name || !item.uf || seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    return send(res, 200, {
      ok: true,
      source: 'Senado Federal — Dados Abertos',
      sourceUrl: 'https://legis.senado.leg.br/dadosabertos/senador/lista/atual.json',
      count: senators.length,
      senators,
      checkedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('senators:fetch_failed', error);
    return send(res, 502, { ok: false, error: 'senate_source_unavailable' });
  }
};
