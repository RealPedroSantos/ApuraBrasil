const CHANNELS = {
  cnn: { handle: 'cnnbrasil' },
  jovemPan: { handle: 'jovempannews' },
  times: { handle: 'otimesbrasil' }
};

const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;

function videoIdFromUrl(value) {
  try {
    const url = new URL(value, 'https://www.youtube.com');
    const byQuery = url.searchParams.get('v');
    if (byQuery && VIDEO_ID_RE.test(byQuery)) return byQuery;

    const parts = url.pathname.split('/').filter(Boolean);
    const liveIndex = parts.indexOf('live');
    if (liveIndex >= 0 && VIDEO_ID_RE.test(parts[liveIndex + 1] || '')) {
      return parts[liveIndex + 1];
    }
  } catch {}
  return null;
}

function canonicalVideoId(html) {
  const patterns = [
    /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i,
    /<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["']/i,
    /"canonicalUrl":"([^"]+)"/,
    /"urlCanonical":"([^"]+)"/
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    const id = match ? videoIdFromUrl(match[1].replace(/\\u0026/g, '&').replace(/\\\//g, '/')) : null;
    if (id) return id;
  }
  return null;
}

function pageClaimsLive(html) {
  return html.includes('"isLiveNow":true') ||
    html.includes('"isLiveContent":true') ||
    html.includes('"isLive":true') ||
    html.includes('"style":"BADGE_STYLE_TYPE_LIVE_NOW"');
}

async function fetchLiveEndpoint(handle) {
  const liveUrl = `https://www.youtube.com/@${handle}/live`;
  const response = await fetch(liveUrl, {
    redirect: 'manual',
    headers: {
      'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
      'accept-language': 'pt-BR,pt;q=0.9,en;q=0.7',
      accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
    }
  });

  const location = response.headers.get('location');
  const redirectedVideoId = location ? videoIdFromUrl(location) : null;
  if (redirectedVideoId) {
    return { videoId: redirectedVideoId, live: true, source: 'official-live-redirect' };
  }

  if (!response.ok) {
    return { videoId: null, live: false, source: 'offline' };
  }

  const html = await response.text();
  const canonicalId = canonicalVideoId(html);
  if (canonicalId && pageClaimsLive(html)) {
    return { videoId: canonicalId, live: true, source: 'official-live-canonical' };
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
    const result = await fetchLiveEndpoint(channel.handle);
    res.setHeader('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=60');
    res.status(200).json({
      ok: true,
      channel: key,
      handle: channel.handle,
      channelUrl: `https://www.youtube.com/@${channel.handle}`,
      ...result
    });
  } catch (error) {
    res.setHeader('Cache-Control', 'no-store');
    res.status(502).json({ ok: false, channel: key, error: error?.message || 'Falha ao consultar o YouTube.' });
  }
};
