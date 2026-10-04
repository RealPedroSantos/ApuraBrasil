const IBGE = 'https://servicodados.ibge.gov.br/api';
const IBGE_DISTRICT_ZIP = 'https://geoftp.ibge.gov.br/organizacao_do_territorio/malhas_territoriais/malhas_de_setores_censitarios__divisoes_intramunicipais/censo_2022/distritos/shp/UF';
const districtCache = new Map();

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

async function fetchBuffer(url, timeout = 45000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`IBGE respondeu ${response.status}`);
    return await response.arrayBuffer();
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

function onlyDigits(value) {
  return String(value ?? '').replace(/\D/g, '');
}

function propertyByNames(properties, names) {
  const keys = Object.keys(properties || {});
  for (const name of names) {
    const found = keys.find((key) => key.toUpperCase() === name.toUpperCase());
    if (found) return properties[found];
  }
  return undefined;
}

function inferProperty(properties, tokens) {
  const keys = Object.keys(properties || {});
  const found = keys.find((key) => {
    const normalized = key.toUpperCase();
    return tokens.every((token) => normalized.includes(token));
  });
  return found ? properties[found] : undefined;
}

function districtFields(feature) {
  const p = feature?.properties || {};
  const districtCode = propertyByNames(p, ['CD_DISTRI', 'CD_DISTRITO', 'CD_GEODIS', 'CD_DIST']) ?? inferProperty(p, ['CD', 'DIST']);
  const districtName = propertyByNames(p, ['NM_DISTRI', 'NM_DISTRITO', 'NM_DIST']) ?? inferProperty(p, ['NM', 'DIST']);
  const municipalityCode = propertyByNames(p, ['CD_MUN', 'CD_MUNICIP', 'CD_GEOCMU', 'CD_MUNICIPIO']) ?? inferProperty(p, ['CD', 'MUN']);
  return {
    districtCode: onlyDigits(districtCode),
    districtName: String(districtName || '').trim(),
    municipalityCode: onlyDigits(municipalityCode)
  };
}

async function districtGeoByUF(uf) {
  const key = String(uf || '').toUpperCase();
  if (districtCache.has(key)) return districtCache.get(key);
  const promise = (async () => {
    const sourceUrl = `${IBGE_DISTRICT_ZIP}/${key}_distritos_CD2022.zip`;
    const buffer = await fetchBuffer(sourceUrl);
    const module = await import('shpjs');
    const shp = module.default || module;
    const parsed = await shp(buffer);
    const geojson = Array.isArray(parsed) ? parsed.find((item) => item?.type === 'FeatureCollection') || parsed[0] : parsed;
    if (!geojson?.features) throw new Error('Malha distrital sem feições reconhecíveis.');
    return { geojson, sourceUrl };
  })();
  districtCache.set(key, promise);
  try {
    return await promise;
  } catch (error) {
    districtCache.delete(key);
    throw error;
  }
}

function filterDistricts(geojson, municipality) {
  const target = onlyDigits(municipality).slice(0, 7);
  const features = (geojson?.features || []).filter((feature) => {
    const fields = districtFields(feature);
    return fields.municipalityCode === target || fields.districtCode.startsWith(target);
  }).map((feature) => {
    const fields = districtFields(feature);
    return {
      ...feature,
      properties: {
        ...(feature.properties || {}),
        code: fields.districtCode || featureCode(feature),
        name: fields.districtName || fields.districtCode || 'Distrito'
      }
    };
  });
  return { type: 'FeatureCollection', features };
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
      const municipality = onlyDigits(req.query?.municipality);
      const uf = String(req.query?.uf || '').toUpperCase().replace(/[^A-Z]/g, '');
      if (!municipality) return send(res, 400, { ok: false, error: 'Informe o código IBGE do município.' }, 'no-store');

      listUrl = `${IBGE}/v1/localidades/municipios/${municipality}/distritos?orderBy=nome`;
      const items = await fetchJson(listUrl);
      const normalizedItems = (items || []).map((item) => ({
        code: String(item.id), name: item.nome, abbr: null
      }));

      if (!uf || uf.length !== 2) {
        return send(res, 200, {
          ok: true,
          level,
          geometryAvailable: false,
          geojson: { type: 'FeatureCollection', features: [] },
          items: normalizedItems,
          sources: { geometry: null, names: listUrl },
          warning: 'UF não informada para carregar a malha distrital.'
        });
      }

      try {
        const districtSource = await districtGeoByUF(uf);
        const geojson = filterDistricts(districtSource.geojson, municipality);
        return send(res, 200, {
          ok: true,
          level,
          geometryAvailable: geojson.features.length > 0,
          geojson,
          items: normalizedItems,
          sources: { geometry: districtSource.sourceUrl, names: listUrl }
        }, 'public, s-maxage=86400, stale-while-revalidate=604800');
      } catch (geometryError) {
        return send(res, 200, {
          ok: true,
          level,
          geometryAvailable: false,
          geojson: { type: 'FeatureCollection', features: [] },
          items: normalizedItems,
          sources: { geometry: null, names: listUrl },
          warning: `Não foi possível abrir a malha distrital: ${geometryError.message}`
        });
      }
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
