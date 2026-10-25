const CHANNELS = {
  cnn: { handle: 'cnnbrasil' },
  jovemPan: { handle: 'jovempannews' },
  times: { handle: 'otimesbrasil' }
};

const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;
const CHANNEL_ID_RE = /^UC[A-Za-z0-9_-]{22}$/;

function videoIdFromUrl(value) {
  try {
    const url = new URL(value, 'https://www.youtube.com');
    const byQuery = url.searchParams.get('v');
    if (byQuery && VIDEO_ID_RE.test(byQuery)) return byQuery;
    const parts = url.pathname.split('/').filter(Boolean);
    const liveIndex = parts.indexOf('live');
    if (liveIndex >= 0 && VIDEO_ID_RE.test(parts[liveIndex + 1] || '')) return parts[liveIndex + 1];
  } catch {}
  return null;
}

function extractCanonicalVideoId(html) {
  const patterns = [
    /<link[^>]+rel="canonical"[^>]+href="https:\/\/www\.youtube\.com\/watch\?v=([A-Za-z0-9_-]{11})"/i,
    /<meta[^>]+property="og:url"[^>]+content="https:\/\/www\.youtube\.com\/watch\?v=([A-Za-z0-9_-]{11})"/i,
    /"canonicalUrl":"\/watch\?v=([A-Za-z0-9_-]{11})"/
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match && VIDEO_ID_RE.test(match[1])) return match[1];
  }
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
    if (match && CHANNEL_ID_RE.test(match[1])) return match[1];
  }
  return null;
}

function collectLiveCandidates(html) {
  const markers = [
    '"isLiveNow":true',
    '"style":"BADGE_STYLE_TYPE_LIVE_NOW"',
    '"style":"LIVE"',
    '"label":"AO VIVO"',
    '"label":"LIVE"',
    '"text":"AO VIVO"',
    '"text":"LIVE"'
  ];

  const ranked = [];
  for (const marker of markers) {
    let markerIndex = html.indexOf(marker);
    while (markerIndex >= 0) {
      const start = Math.max(0, markerIndex - 7000);
      const end = Math.min(html.length, markerIndex + 5000);
      const slice = html.slice(start, end);
      for (const match of slice.matchAll(/"videoId":"([A-Za-z0-9_-]{11})"/g)) {
        const absoluteIndex = start + match.index;
        ranked.push({ id: match[1], distance: Math.abs(absoluteIndex - markerIndex) });
      }
      markerIndex = html.indexOf(marker, markerIndex + marker.length);
    }
  }

  ranked.sort((a, b) => a.distance - b.distance);
  const seen = new Set();
  const result = [];
  for (const item of ranked) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    result.push(item.id);
    if (result.length >= 18) break;
  }
  return result;
}

function extractWatchOwner(html, expectedVideoId) {
  const detailsIndex = html.indexOf('"videoDetails":');
  if (detailsIndex < 0) return null;
  const details = html.slice(detailsIndex, detailsIndex + 24000);
  const videoMatch = details.match(/"videoId":"([A-Za-z0-9_-]{11})"/);
  const channelMatch = details.match(/"channelId":"(UC[A-Za-z0-9_-]{22})"/);
  if (!videoMatch || videoMatch[1] !== expectedVideoId || !channelMatch) return null;
  return channelMatch[1];
}

function watchIsLiveNow(html) {
  return html.includes('"isLiveNow":true');
}

async function fetchYouTube(url, redirect = 'follow') {
  return fetch(url, {
    redirect,
    headers: {
      'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
      'accept-language': 'pt-BR,pt;q=0.9,en;q=0.7',
      accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
    }
  });
}

async function validateLiveCandidate(videoId, expectedChannelId) {
  try {
    const response = await fetchYouTube(`https://www.youtube.com/watch?v=${videoId}`);
    if (!response.ok) return false;
    const html = await response.text();
    const owner = extractWatchOwner(html, videoId);
    return owner === expectedChannelId && watchIsLiveNow(html);
  } catch {
    return false;
  }
}

async function resolveChannel(handle) {
  const channelPage = await fetchYouTube(`https://www.youtube.com/@${handle}`);
  if (!channelPage.ok) throw new Error(`Canal @${handle} respondeu ${channelPage.status}`);
  const channelHtml = await channelPage.text();
  const expectedChannelId = extractChannelId(channelHtml);
  if (!expectedChannelId) throw new Error(`Não foi possível validar o channelId de @${handle}.`);

  const pages = [
    `https://www.youtube.com/@${handle}/live`,
    `https://www.youtube.com/@${handle}/streams`
  ];

  for (const url of pages) {
    const response = await fetchYouTube(url);
    if (!response.ok) continue;
    const html = await response.text();

    const redirectedId = videoIdFromUrl(response.url);
    if (redirectedId && await validateLiveCandidate(redirectedId, expectedChannelId)) {
      return { videoId: redirectedId, live: true, source: 'official-live-redirect', channelId: expectedChannelId };
    }

    const canonicalId = extractCanonicalVideoId(html);
    if (canonicalId && await validateLiveCandidate(canonicalId, expectedChannelId)) {
      return { videoId: canonicalId, live: true, source: 'official-live-canonical', channelId: expectedChannelId };
    }

    const candidates = collectLiveCandidates(html);
    for (const videoId of candidates) {
      if (await validateLiveCandidate(videoId, expectedChannelId)) {
        return { videoId, live: true, source: 'validated-live-now', channelId: expectedChannelId };
      }
    }
  }

  return { videoId: null, live: false, source: 'offline', channelId: expectedChannelId };
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
    res.setHeader('Cache-Control', 'public, s-maxage=10, stale-while-revalidate=20');
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
