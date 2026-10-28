# Free tutorial search setup

The tutorial player works with saved, direct YouTube video links without any API key. YouTube search within Sarah's Studio requires one-time setup because the site is public and static on GitHub Pages.

## Free service setup

1. Create a Google Cloud project, enable **YouTube Data API v3**, and create an API key restricted to that API. Do not turn on billing, paid quota increases, or other paid services. Google typically provides a default **10,000-unit daily quota**, and each YouTube search request costs **100 units**, for approximately 100 searches per day across everyone using this key. Verify the current quota in your Google Cloud project.
2. Create a free Cloudflare account and deploy `youtube-worker/index.js` as a Cloudflare Worker on the **Free** plan. You can paste the file into the Workers editor. Do not choose a paid plan.
3. Under Cloudflare Worker Settings, add **YOUTUBE_API_KEY** as an encrypted Secret (not as a plain-text variable). Use the Google API key from step 1. Optionally set **ALLOWED_ORIGIN** as a regular variable to your GitHub Pages site's origin, for example `https://sarahbacay-ui.github.io`. Never commit the API key to GitHub.
4. Copy the public `https://...workers.dev` Worker URL. In Sarah's Studio, open **Find tutorials**, select **Search setup**, paste that HTTPS address, and select **Save search setup**.
5. Search for a technique, select Knitting, Crochet or Both, and select **Search**. Watch videos in the pop-up, mark favorites, or save them to the current project.

## Limitations and safeguards

- The Worker keeps the API key off GitHub Pages, but its search endpoint is still publicly reachable. CORS restrictions alone do not prevent quota abuse by non-browser clients. Google's daily quota is a cap on usage; if exceeded, search stops until quota resets.
- Videos with disabled embedding cannot play in the app. Use the fallback **Open on YouTube** link on the project card where provided.
- The example starter project links to a YouTube search results page, not an actual video; replace it with a video's `watch?v=` link to use the embedded player.
- Favorites and the search service URL are saved only in the current browser's local storage. Favorites are **not** included in Sarah's Studio's project backup data.
- Search setup is optional. Direct YouTube video links will still play in the app without it.
- This branch has not been deployed to GitHub Pages. Your existing `main` branch is unchanged.
