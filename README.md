# MKissa for Seanime (experimental)

Online streaming provider for https://mkissa.to/anime with separate sub/dub results and Fm-Hls, Mp4, and Ok server selections.

## Status

Experimental: rendered Naruto search results, anime details, episode links, and server tabs were inspected on the live site. Seanime runtime playback has **not** been verified. A sample MP4 host reported that its file had been deleted. Do not treat this release as confirmed working playback.

MKissa's direct API returned a Cloudflare challenge during development, and the site scripts implement encrypted API responses. This provider uses the site's rendered pages and observes media requests through Seanime's ChromeDP API rather than hardcoding encryption keys or build IDs.

## Requirements and installation

Use a Seanime version providing `ChromeDP.newBrowser`, `listenTarget`, and `executeCDP`, with Chrome/Chromium installed. ChromeDP is experimental in Seanime. Browser startup makes this provider slower than a direct API provider.

For local testing, open **Extensions → Playground**, select **Online Streaming Provider**, and paste `provider.js`. Test `search`, `findEpisodes`, and `findEpisodeServer` in that order. Keep IDs exactly as returned: the language is included in each ID. Test sub and dub, a long series, and each available server.

After uploading these files to the repository's main branch, add this manifest URL through Seanime's **Add extensions**:

`https://raw.githubusercontent.com/DefnoJae/MKissa/main/Manifest.json`

The manifest embeds the provider code, so it can also be imported as a local JSON file if your Seanime version supports that. The URL above will work only after the files are uploaded. Nothing has been pushed by this task.

## Limits

- Only the first rendered search page is returned.
- Episode numbers remain as listed; decimal specials are excluded because Seanime expects integer episode numbers.
- Browser challenges, deleted host files, and player interaction requirements can prevent playback. Select another server when one fails.
- Playback currently captures direct HLS/MP4 requests. It does not return embedded player HTML as a video source. External subtitle extraction is not implemented.
- Some hosts require a persistent browser session or expiring URLs; extracted links may fail after the browser closes.
- Long series and cross-origin player frames need real Seanime verification; the provider throws if its bounded episode-loading loop cannot settle.
- The browser closes on success and failure. No user cookies, login credentials, or keys are stored in the extension.

## Local checks

Run `node --test tests/provider.test.cjs`. These checks cover IDs, language separation, episode normalization, error paths, and browser cleanup using mocks. They do not establish live playback compatibility.

To regenerate the embedded manifest after editing `provider.js`, run `node build.cjs`.
