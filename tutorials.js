/* Sarah's Studio tutorial browser. No API credentials are stored here. */
(() => {
  const endpointKey = 'studio-tutorial-search-endpoint';
  const defaultEndpoint = 'https://sarahs-studio-youtube.sarah-bacay.workers.dev';
  const configuredEndpoint = () => localStorage.getItem(endpointKey) || defaultEndpoint;
  const favoritesKey = 'studio-tutorial-favorites-v1';
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const videoId = input => {
    try {
      const u = new URL(input);
      const host = u.hostname.toLowerCase();
      let id = '';
      if (host === 'youtu.be') id = u.pathname.slice(1).split('/')[0];
      else if (['youtube.com','www.youtube.com','m.youtube.com','www.youtube-nocookie.com'].includes(host)) {
        if (u.pathname === '/watch') id = u.searchParams.get('v') || '';
        else if (u.pathname.startsWith('/shorts/') || u.pathname.startsWith('/embed/') || u.pathname.startsWith('/live/')) id = u.pathname.split('/')[2];
      }
      return /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : null;
    } catch { return null; }
  };
  const readFavorites = () => { try { const x = JSON.parse(localStorage.getItem(favoritesKey)); return Array.isArray(x) ? x : []; } catch { return []; } };
  const writeFavorites = list => localStorage.setItem(favoritesKey, JSON.stringify(list));
  const saveProject = () => {};
  let projectName = '', onSave = saveProject, results = [], category = 'both', lastQuery = '';
  const shell = () => document.getElementById('studio-tutorial-overlay');
  const close = () => { shell()?.remove(); document.removeEventListener('keydown', escapeClose); };
  function escapeClose(event) { if (event.key === 'Escape') close(); }
  function open() {
    close();
    const overlay = document.createElement('div');
    overlay.id = 'studio-tutorial-overlay';
    overlay.className = 'studio-tutorial-overlay';
    overlay.innerHTML = `<section class="studio-tutorial-panel" role="dialog" aria-modal="true" aria-label="Knitting and crochet tutorials">
      <div class="studio-tutorial-header"><h2>Knitting &amp; Crochet Tutorials</h2><button class="button secondary small" id="studio-tutorial-close" type="button">Close</button></div>
      <form id="studio-tutorial-form" class="studio-tutorial-search"><input class="field" id="studio-tutorial-query" aria-label="Search tutorials" placeholder="Search stitches, techniques, patterns..." required maxlength="100"><select class="field" id="studio-tutorial-category" aria-label="Tutorial type"><option value="both">Both</option><option value="knitting">Knitting</option><option value="crochet">Crochet</option></select><button class="button" type="submit">Search</button></form>
      <div class="studio-tutorial-actions"><button class="button secondary small" id="studio-tutorial-favorites" type="button">Favorites</button><button class="button secondary small" id="studio-tutorial-settings" type="button">Search setup</button></div>
      <div id="studio-tutorial-player"></div><div id="studio-tutorial-status" role="status" aria-live="polite"></div><div id="studio-tutorial-results"></div>
    </section>`;
    overlay.addEventListener('click', event => { if (event.target === overlay) close(); });
    document.body.appendChild(overlay);
    document.getElementById('studio-tutorial-close').onclick = close;
    document.getElementById('studio-tutorial-form').onsubmit = event => { event.preventDefault(); search(); };
    document.getElementById('studio-tutorial-favorites').onclick = showFavorites;
    document.getElementById('studio-tutorial-settings').onclick = showSettings;
    document.getElementById('studio-tutorial-query').value = lastQuery || projectName;
    document.getElementById('studio-tutorial-category').value = category;
    document.addEventListener('keydown', escapeClose);
    setStatus('Search knitting and crochet tutorials, watch videos here, or save favorites.');
  }
  const setStatus = message => { const el = document.getElementById('studio-tutorial-status'); if (el) el.textContent = message; };
  function play(video) {
    const id = videoId(video.url);
    if (!id) { setStatus('This is a YouTube search link or an unsupported video URL. Select a specific YouTube video to play it here.'); return; }
    const player = document.getElementById('studio-tutorial-player');
    if (!player) return;
    player.replaceChildren();
    const box = document.createElement('div');
    box.className = 'studio-tutorial-frame';
    const iframe = document.createElement('iframe');
    iframe.src = 'https://www.youtube-nocookie.com/embed/' + id + '?playsinline=1&rel=0';
    iframe.title = video.title || 'YouTube tutorial';
    iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
    iframe.allowFullscreen = true;
    iframe.referrerPolicy = 'strict-origin-when-cross-origin';
    box.appendChild(iframe);
    player.appendChild(box);
    const heading = document.createElement('p');
    heading.textContent = video.title || 'YouTube tutorial';
    player.appendChild(heading);
    setStatus('Some video owners disable embedded playback. If this video cannot play, open it in YouTube.');
  }
  function display(videos) {
    const root = document.getElementById('studio-tutorial-results');
    if (!root) return;
    root.replaceChildren();
    if (!videos.length) { root.textContent = 'No tutorials found.'; return; }
    const favorites = readFavorites();
    for (const video of videos) {
      if (!videoId(video.url)) continue;
      const card = document.createElement('article'); card.className = 'studio-tutorial-result';
      const thumbnail = document.createElement('img');
      thumbnail.src = 'https://i.ytimg.com/vi/' + videoId(video.url) + '/mqdefault.jpg';
      thumbnail.alt = ''; thumbnail.loading = 'lazy';
      const information = document.createElement('div'); information.className = 'studio-tutorial-result-info';
      const title = document.createElement('strong'); title.textContent = video.title;
      const channel = document.createElement('p'); channel.className = 'muted'; channel.textContent = video.channel || '';
      const controls = document.createElement('div'); controls.className = 'studio-tutorial-result-buttons';
      const watch = document.createElement('button'); watch.className = 'button secondary small'; watch.textContent = 'Watch'; watch.onclick = () => play(video);
      const save = document.createElement('button'); save.className = 'button secondary small'; save.textContent = 'Save to project'; save.disabled = !projectName; save.onclick = () => { onSave({title:video.title,url:video.url}); setStatus('Saved to ' + projectName + '.'); };
      const favorite = document.createElement('button'); favorite.className = 'button secondary small';
      favorite.textContent = favorites.some(x => x.url === video.url) ? 'Remove favorite' : 'Favorite';
      favorite.onclick = () => { const list = readFavorites(); const exists = list.some(x => x.url === video.url); writeFavorites(exists ? list.filter(x => x.url !== video.url) : [video,...list]); favorite.textContent = exists ? 'Favorite' : 'Remove favorite'; };
      controls.append(watch, save, favorite); information.append(title, channel, controls); card.append(thumbnail, information); root.appendChild(card);
    }
  }
  function showFavorites() { setStatus('Favorites are saved on this device. They are not included in project backups.'); display(readFavorites()); }
  function showSettings() {
    const root = document.getElementById('studio-tutorial-results');
    root.innerHTML = `<div class="studio-tutorial-setup"><p>For free in-app search, deploy the optional Cloudflare Worker in this branch. Paste its HTTPS address below. Never paste a Google API key here.</p><label for="studio-tutorial-endpoint">Search service URL</label><input class="field" id="studio-tutorial-endpoint" type="url" placeholder="https://your-worker.workers.dev"><button class="button" id="studio-tutorial-save-endpoint" type="button">Save search setup</button></div>`;
    document.getElementById('studio-tutorial-endpoint').value = configuredEndpoint();
    document.getElementById('studio-tutorial-save-endpoint').onclick = () => {
      const value = document.getElementById('studio-tutorial-endpoint').value.trim().replace(/\/$/,'');
      if (value && (!value.startsWith('https://') || !/^https:\/\/[^/]+$/.test(value))) { setStatus('Enter a valid HTTPS service URL with no path.'); return; }
      if (value) localStorage.setItem(endpointKey, value); else localStorage.removeItem(endpointKey);
      setStatus(value ? 'Search service saved on this device.' : 'Restored default search service.'); root.replaceChildren();
    };
  }
  async function search() {
    const input = document.getElementById('studio-tutorial-query');
    const term = input.value.trim();
    if (!term) return;
    lastQuery = term; category = document.getElementById('studio-tutorial-category').value;
    const endpoint = configuredEndpoint();
    if (!endpoint) { showSettings(); setStatus('Set up the free search service first.'); return; }
    const searchText = term + (category === 'both' ? ' knitting crochet tutorial' : ' ' + category + ' tutorial');
    setStatus('Searching tutorials...');
    try {
      const url = new URL(endpoint + '/search'); url.searchParams.set('q', searchText);
      const response = await fetch(url.toString(), {signal: AbortSignal.timeout(12000)});
      const data = await response.json();
      if (!response.ok || !Array.isArray(data.videos)) throw Error(data.error || 'Search service unavailable');
      results = data.videos.filter(x => videoId(x.url)).map(x => ({title:String(x.title || 'Tutorial'),url:x.url,channel:String(x.channel || '')}));
      display(results); setStatus(results.length + ' tutorial(s) found.');
    } catch (error) { setStatus('Search failed: ' + error.message + '. Check Search setup or try again later.'); }
  }
  window.StudioTutorials = {
    openSearch(options = {}) { projectName = options.projectName || ''; onSave = options.onSave || saveProject; open(); },
    openVideo(video) { projectName = ''; onSave = saveProject; open(); play(video); }
  };
})();
