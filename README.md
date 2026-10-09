# MKissa for Seanime (experimental)

Online streaming provider for https://mkissa.to/anime with separate sub/dub results and Fm-Hls, Mp4, and Ok server selections.

## Status

Experimental: rendered Naruto search results, anime details, episode links, and server tabs were inspected on the live site. Seanime runtime playback has **not** been verified. A sample MP4 host reported that its file had been deleted. Do not treat this release as confirmed working playback.

MKissa's direct API returned a Cloudflare challenge during development, and the site scripts implement encrypted API responses. This provider uses the site's rendered pages and observes media requests through Seanime's ChromeDP API rather than hardcoding encryption keys or build IDs.

## Requirements and installation

Use a Seanime version providing `ChromeDP.newBrowser`, `listenTarget`, and `executeCDP`. ChromeDP is experimental in Seanime. Browser startup makes this provider slower than a direct API provider.

### Windows: use your existing Edge without installing Chrome

1. Download and extract the repository ZIP (or the supplied provider ZIP).
2. Fully quit Seanime, including its tray icon.
3. Double-click `windows/Start-Seanime-With-Edge.cmd`.
4. Refresh MKissa's episode list in Seanime.

The launcher compiles the included `EdgeBridge.cs` using Windows' existing .NET Framework compiler, then starts Seanime Denshi with a temporary PATH entry. The bridge is named `chrome.exe` for ChromeDP discovery, but forwards the arguments to the installed Microsoft Edge executable. It preserves the browser's debugging output and uses a Windows job object to clean up browser processes. It does not install Chrome, replace Edge, edit your system PATH, or use your normal Edge profile. ChromeDP supplies its own temporary profile. Use this launcher each time you want MKissa to use Edge.

The launcher defaults to `C:\Program Files\Seanime Denshi\Seanime Denshi.exe`. For other locations, run `windows/Start-Seanime-With-Edge.ps1 -SeanimePath 'C:\path\to\seanime.exe'` from PowerShell. Do not disable a managed script policy if it blocks execution. The included scripts and generated executable are local, unsigned code.

The bridge compiles successfully and its argument forwarding, output forwarding, and exit status are tested. Live MKissa playback through Edge in Seanime remains unverified. This workaround addresses browser discovery; it does not establish that the streaming hosts will play.

For local testing, open **Extensions → Playground**, select **Online Streaming Provider**, and paste `provider.js`. Test `search`, `findEpisodes`, and `findEpisodeServer` in that order. Keep IDs exactly as returned: the language is included in each ID. Test sub and dub, a long series, and each available server.

Add this manifest URL through Seanime's **Add extensions**:

`https://raw.githubusercontent.com/DefnoJae/MKissa/main/Manifest.json`

The manifest embeds the provider code, so it can also be imported as a local JSON file if your Seanime version supports that.

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
