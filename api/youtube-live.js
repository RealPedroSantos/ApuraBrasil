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

function extractChannelId(html) {
  const patterns = [
    /"channelId":"(UC[A-Za-z0-9_-]{22})"/,
    /"externalId":"(UC[A-Za-z0-9_-]{22})"/,
    /itemprop="channelId" content="(UC[A-Za-z0-9_-]{22})"/
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) return match[1];
  }
  return null;
}

function extractLiveVideoId(html) {
  const marker = '"isLiveNow":true';
  let index = html.indexOf(marker);
  while (index >= 0) {
    const start = Math.max(0, index - 9000);
    const end = Math.min(html.length, index + 5000);
    const slice = html.slice(start, end);
    const ids = [...slice.matchAll(/"videoId":"([A-Za-z0-9_-]{11})"/g)];
    if (ids.length) {
      const beforeMarker = slice.slice(0, Math.max(0, index - start));
      const beforeIds = [...beforeMarker.matchAll(/"videoId":"([A-Za-z0-9_-]{11})"/g)];
      const candidate = (beforeIds.at(-1) || ids[0])?.[1];
      if (candidate) return candidate;
    }
    index = html.indexOf(marker, index + marker.length);
  }
  return null;
}

function extractFirstVideoId(html) {
  const match = html.match(/"videoId":"([A-Za-z0-9_-]{11})"/);
  return match ? match[1] : null;
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

async function latestFromFeed(channelId) {
  if (!channelId) return null;
  try {
    const response = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`, {
      headers: { 'user-agent': 'Mozilla/5.0', accept: 'application/xml,text/xml,*/*' }
    });
    if (!response.ok) return null;
    const xml = await response.text();
    const match = xml.match(/<yt:videoId>([A-Za-z0-9_-]{11})<\/yt:videoId>/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

async function resolveChannel(handle) {
  const liveUrl = `https://www.youtube.com/@${handle}/live`;
  const response = await fetchYouTube(liveUrl);
  if (!response.ok) throw new Error(`YouTube respondeu ${response.status}`);

  const html = await response.text();
  const urlVideoId = videoIdFromUrl(response.url);
  const liveVideoId = extractLiveVideoId(html);

  if (liveVideoId) {
    return { videoId: liveVideoId, live: true, source: 'live-marker' };
  }

  if (urlVideoId && html.includes('"isLiveNow":true')) {
    return { videoId: urlVideoId, live: true, source: 'live-url' };
  }

  const channelId = extractChannelId(html);
  const latestFeedId = await latestFromFeed(channelId);
  if (latestFeedId) {
    return { videoId: latestFeedId, live: false, source: 'latest-feed' };
  }

  const pageVideoId = urlVideoId || extractFirstVideoId(html);
  if (pageVideoId) {
    return { videoId: pageVideoId, live: false, source: 'latest-page' };
  }

  throw new Error('Nenhum vídeo público encontrado para este canal.');
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
    res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
    res.status(200).json({ ok: true, channel: key, handle: channel.handle, ...result });
  } catch (error) {
    res.setHeader('Cache-Control', 'no-store');
    res.status(502).json({ ok: false, channel: key, error: error?.message || 'Falha ao consultar o YouTube.' });
  }
};
