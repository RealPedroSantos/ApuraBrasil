const IBGE = 'https://servicodados.ibge.gov.br/api';

function send(res, status, payload, cache = 'public, s-maxage=86400, stale-while-revalidate=604800') {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', cache);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.end(JSON.stringify(payload));
}

async function fetchJson(url, timeout = 18000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`IBGE respondeu ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

function featureCode(feature) {
  const p = feature?.properties || {};
  return String(p.codarea || p.codArea || p.codigo || p.id || feature?.id || '').replace(/\.0$/, '');
}

function normalizeGeo(geojson, items, level) {
  const index = new Map((items || []).map((item) => [String(item.id), item]));
  const features = (geojson?.features || []).map((feature) => {
    const code = featureCode(feature);
    const item = index.get(code);
    return {
      ...feature,
      properties: {
        ...(feature.properties || {}),
        code,
        name: item?.nome || feature.properties?.nome || feature.properties?.name || code,
        abbr: level === 'states' ? (item?.sigla || feature.properties?.sigla || '') : undefined
      }
    };
  });
  return { ...geojson, features };
}

module.exports = async function handler(req, res) {
  try {
    const level = String(req.query?.level || 'states');
    let shapeUrl;
    let listUrl;

    if (level === 'states') {
      shapeUrl = `${IBGE}/v4/malhas/paises/BR?formato=application/vnd.geo+json&qualidade=minima&intrarregiao=UF`;
      listUrl = `${IBGE}/v1/localidades/estados?orderBy=nome`;
    } else if (level === 'municipalities') {
      const state = String(req.query?.state || '').replace(/\D/g, '');
      if (!state) return send(res, 400, { ok: false, error: 'Informe o código IBGE do estado.' }, 'no-store');
      shapeUrl = `${IBGE}/v4/malhas/estados/${state}?formato=application/vnd.geo+json&qualidade=minima&intrarregiao=municipio`;
      listUrl = `${IBGE}/v1/localidades/estados/${state}/municipios?orderBy=nome`;
    } else if (level === 'districts') {
      const municipality = String(req.query?.municipality || '').replace(/\D/g, '');
      if (!municipality) return send(res, 400, { ok: false, error: 'Informe o código IBGE do município.' }, 'no-store');

      // A API Localidades do IBGE fornece a relação oficial de distritos, porém a
      // API pública de Malhas v4 não expõe a subdivisão distrital pelo mesmo
      // endpoint de estados/municípios. Retornamos a lista oficial sem inventar
      // polígonos. Uma malha intramunicipal do Censo 2022 pode ser adicionada em
      // camada própria posteriormente.
      listUrl = `${IBGE}/v1/localidades/municipios/${municipality}/distritos?orderBy=nome`;
      const items = await fetchJson(listUrl);
      const normalizedItems = (items || []).map((item) => ({
        code: String(item.id), name: item.nome, abbr: null
      }));
      return send(res, 200, {
        ok: true,
        level,
        geometryAvailable: false,
        geojson: { type: 'FeatureCollection', features: [] },
        items: normalizedItems,
        sources: { geometry: null, names: listUrl }
      });
    } else {
      return send(res, 400, { ok: false, error: 'Nível geográfico inválido.' }, 'no-store');
    }

    const [geojson, items] = await Promise.all([fetchJson(shapeUrl), fetchJson(listUrl)]);
    const normalizedItems = (items || []).map((item) => ({
      code: String(item.id), name: item.nome, abbr: item.sigla || null
    }));
    return send(res, 200, {
      ok: true,
      level,
      geometryAvailable: true,
      geojson: normalizeGeo(geojson, items, level),
      items: normalizedItems,
      sources: { geometry: shapeUrl, names: listUrl }
    });
  } catch (error) {
    return send(res, 502, { ok: false, error: 'Não foi possível carregar a malha geográfica do IBGE.', detail: error.message }, 'no-store');
  }
};
