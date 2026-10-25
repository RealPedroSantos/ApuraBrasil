const crypto = require('crypto');

const PATHNAME = 'branding/apurabrasil-logo';
const DEFAULT_LOGO = '/assets/logo-apura-current.svg?v=20261025-official';
const MAX_BYTES = 2 * 1024 * 1024;
const ALLOWED_TYPES = new Set(['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp']);

function send(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.end(JSON.stringify(payload));
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a || ''));
  const right = Buffer.from(String(b || ''));
  if (!left.length || left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function authorized(req) {
  const expected = process.env.LOGO_ADMIN_KEY || '';
  const received = req.headers['x-logo-admin-key'] || '';
  return safeEqual(received, expected);
}

async function readJson(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === 'string') return JSON.parse(req.body || '{}');

  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > 3 * 1024 * 1024) throw new Error('PAYLOAD_TOO_LARGE');
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

function parseDataUrl(value) {
  const match = /^data:(image\/(?:png|jpeg|svg\+xml|webp));base64,([A-Za-z0-9+/=\r\n]+)$/i.exec(String(value || ''));
  if (!match) return null;
  const contentType = match[1].toLowerCase();
  if (!ALLOWED_TYPES.has(contentType)) return null;
  const buffer = Buffer.from(match[2].replace(/\s+/g, ''), 'base64');
  if (!buffer.length || buffer.length > MAX_BYTES) return null;
  return { contentType, buffer };
}

async function currentLogo(blobApi) {
  try {
    const result = await blobApi.list({ prefix: PATHNAME, limit: 10 });
    const exact = (result?.blobs || []).find(item => item.pathname === PATHNAME);
    if (!exact?.url) return { url: DEFAULT_LOGO, custom: false };
    const version = encodeURIComponent(String(exact.etag || exact.uploadedAt || Date.now()));
    return { url: `${exact.url}?v=${version}`, custom: true, uploadedAt: exact.uploadedAt || null };
  } catch (error) {
    console.error('logo:list_failed', error);
    return { url: DEFAULT_LOGO, custom: false, degraded: true };
  }
}

module.exports = async function handler(req, res) {
  let blobApi;
  try {
    blobApi = await import('@vercel/blob');
  } catch (error) {
    console.error('logo:blob_import_failed', error);
    return send(res, 500, { ok: false, error: 'blob_unavailable' });
  }

  if (req.method === 'GET') {
    const current = await currentLogo(blobApi);
    return send(res, 200, { ok: true, ...current });
  }

  if (req.method === 'POST') {
    if (!authorized(req)) return send(res, 401, { ok: false, error: 'unauthorized' });

    try {
      const body = await readJson(req);
      const parsed = parseDataUrl(body?.dataUrl);
      if (!parsed) return send(res, 400, { ok: false, error: 'invalid_image' });

      const uploaded = await blobApi.put(PATHNAME, parsed.buffer, {
        access: 'public',
        contentType: parsed.contentType,
        addRandomSuffix: false,
        allowOverwrite: true,
        cacheControlMaxAge: 60,
      });

      const version = encodeURIComponent(String(uploaded.etag || Date.now()));
      return send(res, 200, {
        ok: true,
        custom: true,
        url: `${uploaded.url}?v=${version}`,
        pathname: uploaded.pathname,
      });
    } catch (error) {
      console.error('logo:upload_failed', error);
      if (error?.message === 'PAYLOAD_TOO_LARGE') return send(res, 413, { ok: false, error: 'too_large' });
      return send(res, 500, { ok: false, error: 'upload_failed' });
    }
  }

  if (req.method === 'DELETE') {
    if (!authorized(req)) return send(res, 401, { ok: false, error: 'unauthorized' });

    try {
      const result = await blobApi.list({ prefix: PATHNAME, limit: 10 });
      const urls = (result?.blobs || []).filter(item => item.pathname === PATHNAME).map(item => item.url);
      if (urls.length) await blobApi.del(urls);
      return send(res, 200, { ok: true, custom: false, url: DEFAULT_LOGO });
    } catch (error) {
      console.error('logo:delete_failed', error);
      return send(res, 500, { ok: false, error: 'delete_failed' });
    }
  }

  res.setHeader('Allow', 'GET, POST, DELETE');
  return send(res, 405, { ok: false, error: 'method_not_allowed' });
};
