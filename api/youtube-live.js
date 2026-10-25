const CHANNELS = {
  cnn: { handle: 'cnnbrasil' },
  jovemPan: { handle: 'jovempannews' },
  times: { handle: 'otimesbrasil' }
};

const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;

function videoIdFromUrl(value) {
  try {
    const url = new URL(value);
    const byQuery = url.searchParams.get('v');
    if (byQuery && VIDEO_ID_RE.test(byQuery)) return byQuery;
    const parts = url.pathname.split('/').filter(Boolean);
    const liveIndex = parts.indexOf('live');
    if (liveIndex >= 0 && VIDEO_ID_RE.test(parts[liveIndex + 1] || '')) return parts[liveIndex + 1];
  } catch {}
  return null;
}

function nearestVideoId(html, markerIndex, radius = 12000) {
  const start = Math.max(0, markerIndex - radius);
  const end = Math.min(html.length, markerIndex + 5000);
  const slice = html.slice(start, end);
  const before = slice.slice(0, Math.max(0, markerIndex - start));
  const beforeIds = [...before.matchAll(/"videoId":"([A-Za-z0-9_-]{11})"/g)];
  if (beforeIds.length) return beforeIds.at(-1)[1];
  const anyId = slice.match(/"videoId":"([A-Za-z0-9_-]{11})"/);
  return anyId ? anyId[1] : null;
}

function extractLiveVideoId(html) {
  const markers = [
    '"isLiveNow":true',
    '"isLive":true',
    '"isLiveContent":true',
    '"style":"LIVE"',
    '"style":"BADGE_STYLE_TYPE_LIVE_NOW"',
    '"label":"AO VIVO"',
    '"label":"LIVE"',
    '"text":"AO VIVO"',
    '"text":"LIVE"'
  ];

  let best = null;
  for (const marker of markers) {
    let index = html.indexOf(marker);
    while (index >= 0) {
      const candidate = nearestVideoId(html, index);
      if (candidate) return candidate;
      best = best || candidate;
      index = html.indexOf(marker, index + marker.length);
    }
  }
  return best;
}

function pageClaimsLive(html) {
  return html.includes('"isLiveNow":true') ||
    html.includes('"isLiveContent":true') ||
    html.includes('"style":"BADGE_STYLE_TYPE_LIVE_NOW"') ||
    html.includes('"style":"LIVE"');
}

async function fetchYouTube(url) {
  return fetch(url, {
    redirect: 'follow',
    headers: {
      'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
      'accept-language': 'pt-BR,pt;q=0.9,en;q=0.7',
      accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
    }
  });
}

async function resolveChannel(handle) {
  const candidates = [
    `https://www.youtube.com/@${handle}/live`,
    `https://www.youtube.com/@${handle}/streams`
  ];

  for (const url of candidates) {
    const response = await fetchYouTube(url);
    if (!response.ok) continue;

    const html = await response.text();
    const liveVideoId = extractLiveVideoId(html);
    if (liveVideoId) {
      return { videoId: liveVideoId, live: true, source: url.endsWith('/live') ? 'live-page' : 'streams-page' };
    }

    const redirectedVideoId = videoIdFromUrl(response.url);
    if (redirectedVideoId && pageClaimsLive(html)) {
      return { videoId: redirectedVideoId, live: true, source: 'live-redirect' };
    }
  }

  return { videoId: null, live: false, source: 'offline' };
}

module.exports = async function handler(req, res) {
  const key = String(req.query?.channel || '');
  const channel = CHANNELS[key];

  if (!channel) {
    res.status(400).json({ ok: false, error: 'Canal inválido.' });
    return;
  }

  try {
    const result = await resolveChannel(channel.handle);
    res.setHeader('Cache-Control', 'public, s-maxage=45, stale-while-revalidate=90');
    res.status(200).json({ ok: true, channel: key, handle: channel.handle, ...result });
  } catch (error) {
    res.setHeader('Cache-Control', 'no-store');
    res.status(502).json({ ok: false, channel: key, error: error?.message || 'Falha ao consultar o YouTube.' });
  }
};
