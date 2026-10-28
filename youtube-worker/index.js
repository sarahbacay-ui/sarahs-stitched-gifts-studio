/**
 * Optional free YouTube search gateway for Sarah's Studio.
 * Cloudflare Workers Free plan. Store YOUTUBE_API_KEY as a Worker secret.
 * Restrict the Google API key to YouTube Data API v3.
 * Google default daily quota is 10,000 units; search.list costs 100 units per request.
 * Set ALLOWED_ORIGIN to the exact GitHub Pages site origin.
 */
export default {
  async fetch(request, env) {
    const allowed = env.ALLOWED_ORIGIN || 'https://sarahbacay-ui.github.io';
    const origin = request.headers.get('Origin');
    const headers = {
      'Access-Control-Allow-Origin': allowed,
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Vary': 'Origin',
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    };
    const respond = (value, status=200) => new Response(JSON.stringify(value), {status, headers});
    if (origin && origin !== allowed) return respond({error:'Origin not allowed'},403);
    if (request.method === 'OPTIONS') return new Response(null,{status:204,headers});
    const url = new URL(request.url);
    if (request.method !== 'GET' || url.pathname !== '/search') return respond({error:'Not found'},404);
    const q = (url.searchParams.get('q') || '').trim();
    if (!q || q.length > 150) return respond({error:'Search must be 1 to 150 characters'},400);
    if (!env.YOUTUBE_API_KEY) return respond({error:'Search service is not configured'},503);
    const upstream = new URL('https://www.googleapis.com/youtube/v3/search');
    upstream.searchParams.set('part','snippet');
    upstream.searchParams.set('type','video');
    upstream.searchParams.set('videoEmbeddable','true');
    upstream.searchParams.set('maxResults','12');
    upstream.searchParams.set('safeSearch','moderate');
    upstream.searchParams.set('q',q);
    upstream.searchParams.set('key',env.YOUTUBE_API_KEY);
    try {
      const api = await fetch(upstream.toString(), {headers:{'Accept':'application/json'}});
      if (!api.ok) {
        const status = api.status === 403 || api.status === 429 ? 429 : 502;
        return respond({error:status === 429?'Free YouTube daily search quota reached or API access denied':'YouTube search temporarily unavailable'},status);
      }
      const data = await api.json();
      const videos = (data.items || []).filter(x => /^[a-zA-Z0-9_-]{11}$/.test(x.id?.videoId || '')).map(x => ({
        title:x.snippet?.title || 'Video',
        channel:x.snippet?.channelTitle || '',
        url:'https://www.youtube.com/watch?v='+x.id.videoId
      }));
      return respond({videos});
    } catch {
      return respond({error:'Unable to reach YouTube search'},502);
    }
  }
};
