# MKissa for Seanime

Standalone online streaming provider for https://mkissa.to/anime. Version **0.2.3** uses direct HTTP requests inside Seanime. No Chrome, Edge launcher, FlareSolverr, Node installation, or separately running helper service is needed to use it. Site verification can still block requests.

## Install or update

In **Seanime → Extensions**, add this manifest URL:

https://raw.githubusercontent.com/DefnoJae/MKissa/main/Manifest.json

If MKissa is already installed, use Seanime's extension update action. If your version does not offer that action, remove the old MKissa extension and add the same URL again. Then open an anime's online streaming section, choose MKissa, and refresh the episode list. Use **Auto** as the server.

The old browser launcher from versions 0.1.x is obsolete. Start Seanime normally.

## Behavior

- Seanime's sub/dub selection is included in every show and episode ID. Search filters actual availability for the selected audio mode and prefers an AniList ID match.
- Search follows pagination. Episode lists come from MKissa's complete `availableEpisodesDetail` arrays, preserving gaps and original integer numbering. Fractional specials are omitted because Seanime uses integer episode numbers.
- Playback implements the signing, bootstrap and authenticated AES-256-GCM response protocol used by MKissa's public client build 179. Public client constants are included in the provider; there are no account credentials or user cookies. Epoch keys are fetched for each request and are not stored on disk.
- **Auto** tries Ok first, then Default, then Mp4 and other supplied sources. Explicit server selections never silently switch to another host.
- Default's encoded source identifiers are decoded and requested through MKissa's public `filelotion.fyi` player-wrapper API. Returned HLS masters are preserved.
- Ok's structured player metadata provides its original HLS master and MP4 quality choices. Direct media URLs and plain/packed JWPlayer-style embeds are supported. The original HLS master is retained so the player can discover embedded renditions.
- Remote scripts are parsed as data and never executed by the provider. The development inspection scripts are not part of the installed extension.

## Limits

### Site verification

Version 0.2.3 bundles challenge detection from [Seanime Verify](https://github.com/DefnoJae/Seanime-Verify). `NEED_CAPTCHA`, supported verification codes, and Cloudflare challenge HTML now produce a specific verification error instead of an unexplained HTTP failure. Bootstrap stops immediately on verification rather than trying another signing epoch. Raw API errors are not echoed; stale signing still gets its existing retry.

This is **not a CAPTCHA solver**. If MKissa requires verification, open its official site, complete any challenge it presents, and retry the episode in Seanime. Browser authorization may not carry over to Seanime or may expire. The optional Seanime Verify diagnostic plugin does not share browser cookies or automatically unlock playback.

A live source request in the user's Seanime 3.10.3 on 13 October 2026 returned `NEED_CAPTCHA`. Playback and moving to the next episode have not been reverified for this release.

MKissa can change its public build and signing protocol. If bootstrap or signing fails after a site update, the extension may need an update. Failed authentication tags are rejected rather than accepting unverified plaintext.

Some episodes have deleted files or unsupported players. Modern Byse/Filemoon (**Fm-Hls**) pages currently require an additional host-specific resolver and may fail; Auto can try another source when one is available. External subtitle extraction is not implemented. Content protection tied to IP, expiring URLs, host outages, and regional restrictions can still affect playback.

## Verification

Development checks (Node is for development only):

```sh
node build.cjs
node --test tests/provider.test.cjs
node tests/live.cjs
```

Thirteen local tests cover crypto against Node's standard implementations, altered authentication tags, audio separation, gap preservation, request signing, Ok and Default extraction, fallback boundaries, and verification/error paths. Historical live checks cover sub/dub search and complete Naruto episode listings, signed episode source retrieval, and HLS master requests. Video segments are not downloaded by the development test. Playback inside the Seanime UI has not been verified for version 0.2.3.

Verified on October 9, 2026 (America/Jamaica): 28 sub search matches, 20 dub search matches, 220 Naruto episodes in each mode, sub playback via Ok, dub playback via Default, and both HLS master requests succeeded. This confirms direct provider requests and stream extraction, not rendered playback in Seanime.

## Files

`provider.js` and `Manifest.json` are generated from `vendor/verify.js`, `crypto.js` and `provider.core.js` by `build.cjs`. The manifest embeds the complete standalone JavaScript payload. To refresh the shared detection code during development, run `node build.cjs ../Seanime-Verify` with that repository alongside MKissa. Normal builds use the checked-in copy.
