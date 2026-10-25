(() => {
  'use strict';
  if (window.__apuraMapFetchCacheV4) return;
  window.__apuraMapFetchCacheV4 = true;

  const nativeFetch = window.fetch.bind(window);
  const memory = new Map();
  const inflight = new Map();
  const PREFIX = 'apurabrasil:v4:';

  function classify(url) {
    if (url.origin !== location.origin) return null;
    if (url.pathname === '/api/geo') return { ttl: 24 * 60 * 60 * 1000, persist: true };
    if (url.pathname === '/api/polling-places') return { ttl: 6 * 60 * 60 * 1000, persist: true };
    return null;
  }

  function keyFor(url) {
    const u = new URL(url.href);
    u.searchParams.sort();
    return u.pathname + '?' + u.searchParams.toString();
  }

  function readStored(key, ttl) {
    const hit = memory.get(key);
    if (hit && Date.now() - hit.at < ttl) return hit;
    if (hit) memory.delete(key);
    try {
      const raw = sessionStorage.getItem(PREFIX + key);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || Date.now() - Number(parsed.at || 0) >= ttl) {
        sessionStorage.removeItem(PREFIX + key);
        return null;
      }
      memory.set(key, parsed);
      return parsed;
    } catch {
      return null;
    }
  }

  function store(key, entry, persist) {
    memory.set(key, entry);
    if (!persist) return;
    try { sessionStorage.setItem(PREFIX + key, JSON.stringify(entry)); } catch {}
  }

  function responseFrom(entry) {
    return new Response(entry.body, {
      status: entry.status,
      statusText: entry.statusText || 'OK',
      headers: entry.headers || { 'content-type': 'application/json; charset=utf-8' }
    });
  }

  window.fetch = async function apuraCachedFetch(input, init = {}) {
    let requestUrl;
    try {
      requestUrl = new URL(typeof input === 'string' ? input : input?.url, location.origin);
    } catch {
      return nativeFetch(input, init);
    }

    const method = String(init?.method || (typeof input !== 'string' && input?.method) || 'GET').toUpperCase();
    const rule = method === 'GET' ? classify(requestUrl) : null;
    if (!rule) return nativeFetch(input, init);

    const key = keyFor(requestUrl);
    const cached = readStored(key, rule.ttl);
    if (cached) return responseFrom(cached);

    if (inflight.has(key)) {
      const entry = await inflight.get(key);
      return responseFrom(entry);
    }

    const promise = (async () => {
      const response = await nativeFetch(input, init);
      if (!response.ok) return null;
      const clone = response.clone();
      const body = await clone.text();
      const headers = {};
      clone.headers.forEach((value, name) => { headers[name] = value; });
      const entry = {
        at: Date.now(),
        body,
        status: clone.status,
        statusText: clone.statusText,
        headers
      };
      store(key, entry, rule.persist);
      return entry;
    })();

    inflight.set(key, promise);
    try {
      const entry = await promise;
      if (entry) return responseFrom(entry);
      return nativeFetch(input, init);
    } finally {
      inflight.delete(key);
    }
  };
})();
