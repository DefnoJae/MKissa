// MKissa browser provider. Requires Seanime's ChromeDP API and installed Chromium.
class Provider {
    getSettings() {
        return { episodeServers: ["Fm-Hls", "Mp4", "Ok"], supportsDub: true };
    }

    parseId(id) {
        const parts = String(id).split("|");
        if (parts.length !== 2 || !/^[a-zA-Z0-9]+$/.test(parts[0]) || !/^(sub|dub)$/.test(parts[1])) {
            throw new Error("Invalid MKissa anime ID. Search again to select sub or dub.");
        }
        return { show: parts[0], translation: parts[1] };
    }

    async withBrowser(url, work) {
        if (typeof ChromeDP === "undefined") throw new Error("MKissa requires Seanime ChromeDP and installed Chrome/Chromium.");
        const browser = await ChromeDP.newBrowser({ timeout: 120 });
        try {
            await browser.navigate(url);
            return await work(browser);
        } finally {
            await browser.close();
        }
    }

    async waitFor(browser, expression, description) {
        for (let attempt = 0; attempt < 45; attempt++) {
            const result = await browser.evaluate(expression);
            if (result) return result;
            await browser.sleep(1000);
        }
        throw new Error("MKissa could not load " + description + ". The site may be unavailable or showing a browser challenge.");
    }

    async search(opts) {
        const query = String(opts.query || "").trim();
        if (!query) return [];
        const translation = opts.dub ? "dub" : "sub";
        const url = "https://mkissa.to/search/anime?query=" + encodeURIComponent(query) + "&tr=" + translation;
        return this.withBrowser(url, async browser => {
            await this.waitFor(browser, `(() => {
                const root = document.querySelector('#searchListRowanime');
                if (root && root.querySelector('a[href*="/anime/"]')) return true;
                const text = document.body.innerText;
                return /no results|no anime found|nothing found/i.test(text);
            })()`, "search results");
            const rows = await browser.evaluate(`(() => {
                const root = document.querySelector('#searchListRowanime');
                if (!root) return [];
                return Array.from(root.querySelectorAll('a[href*="/anime/"]')).map(a => ({
                    href: a.href, title: a.getAttribute('aria-label') || a.getAttribute('title') || a.textContent.trim() || (a.querySelector('img') || {}).alt || ''
                }));
            })()`);
            const seen = {};
            const results = [];
            for (const row of rows) {
                const match = row.href.match(/^https:\/\/mkissa\.to\/anime\/([a-zA-Z0-9]+)(?:\?|$)/);
                if (!match || !row.title || seen[match[1]]) continue;
                seen[match[1]] = true;
                results.push({ id: match[1] + "|" + translation, title: row.title, url: "https://mkissa.to/anime/" + match[1], subOrDub: translation });
            }
            return results;
        });
    }

    async findEpisodes(id) {
        const item = this.parseId(id);
        const selector = "#episodes-" + item.show + "-" + item.translation;
        return this.withBrowser("https://mkissa.to/anime/" + item.show, async browser => {
            // Expand the selected language section (dub may start collapsed).
            await this.waitFor(browser, `(() => {
                const region = document.querySelector(${JSON.stringify(selector)});
                if (region) return true;
                const button = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim().startsWith(${JSON.stringify(item.translation.toUpperCase() + " (")}));
                if (button && button.getAttribute('aria-expanded') === 'false') button.click();
                return false;
            })()`, "the episode section");
            await this.waitFor(browser, `!!document.querySelector(${JSON.stringify(selector + ' :is([data-href*="/p-"], a[href*="/p-"])')})`, "episodes");
            // Scroll and expand the episode section until no additional rows load.
            let previous = -1;
            let stable = 0;
            let complete = false;
            for (let page = 0; page < 100; page++) {
                const state = await browser.evaluate(`(() => {
                    const root = document.querySelector(${JSON.stringify(selector)});
                    const links = root.querySelectorAll(':is([data-href*="/p-"], a[href*="/p-"])');
                    const more = Array.from(root.querySelectorAll('button')).find(b => /load more|show more/i.test(b.textContent));
                    if (more && !more.disabled) more.click();
                    const last = links[links.length - 1]; if (last) last.scrollIntoView();
                    return { count: links.length, more: !!more, busy: !!root.querySelector('[aria-busy="true"]') };
                })()`);
                stable = state.count === previous && !state.more && !state.busy ? stable + 1 : 0;
                if (stable >= 3) { complete = true; break; }
                previous = state.count;
                await browser.sleep(500);
            }
            if (!complete) throw new Error("MKissa episode list did not finish loading; refusing to return a partial list.");
            const rows = await browser.evaluate(`Array.from(document.querySelectorAll(${JSON.stringify(selector + ' :is([data-href*="/p-"], a[href*="/p-"])')})).map(a => ({url:new URL(a.getAttribute("data-href") || a.getAttribute("href"), location.href).href,title:a.textContent.trim()}))`);
            const seen = {};
            const episodes = [];
            for (const row of rows) {
                const match = row.url.match(/\/anime\/([a-zA-Z0-9]+)\/p-([0-9]+(?:\.[0-9]+)?)-(sub|dub)(?:\?|$)/);
                if (!match || match[1] !== item.show || match[3] !== item.translation) continue;
                const number = Number(match[2]);
                if (!Number.isInteger(number) || number <= 0 || seen[number]) continue;
                seen[number] = true;
                episodes.push({ id: id + "|" + match[2], number, url: "https://mkissa.to/anime/" + item.show + "/p-" + match[2] + "-" + item.translation, title: row.title || "Episode " + number });
            }
            if (!episodes.length) throw new Error("No supported MKissa episodes found.");
            return episodes.sort((a, b) => a.number - b.number);
        });
    }

    async findEpisodeServer(episode, server) {
        const parts = String(episode.id).split("|");
        const item = this.parseId(parts.slice(0, 2).join("|"));
        if (parts.length !== 3 || !/^[1-9][0-9]*$/.test(parts[2])) throw new Error("Invalid MKissa episode ID.");
        const selected = !server || server === "default" ? "Fm-Hls" : server;
        if (this.getSettings().episodeServers.indexOf(selected) < 0) throw new Error("Unsupported MKissa server: " + selected);
        const url = "https://mkissa.to/anime/" + item.show + "/p-" + parts[2] + "-" + item.translation;
        return this.withBrowser(url, async browser => {
            await this.waitFor(browser, `!!document.querySelector('[role="tablist"][aria-label="Video sources"]')`, "video servers");
            // Reset the player after installing listeners so initial requests are captured.
            const sources = [];
            const contexts = {};
            const requests = {};
            let capturing = false;
            browser.listenTarget(event => {
                const p = event.params || {};
                if (event.method === "Runtime.executionContextCreated" && p.context.auxData && p.context.auxData.isDefault) contexts[p.context.id] = true;
                if (event.method === "Runtime.executionContextDestroyed") delete contexts[p.executionContextId];
                if (event.method === "Runtime.executionContextsCleared") for (const key of Object.keys(contexts)) delete contexts[key];
                if (event.method === "Network.requestWillBeSent") requests[p.requestId] = p.request;
                if (!capturing || event.method !== "Network.responseReceived" || p.response.status >= 400) return;
                const response = p.response;
                const request = requests[p.requestId] || {};
                if (!/^https?:\/\//i.test(response.url)) return;
                const hls = /\.m3u8(?:[?#]|$)/i.test(response.url) || /mpegurl/i.test(response.mimeType);
                const mp4 = /\.mp4(?:[?#]|$)/i.test(response.url) || response.mimeType === "video/mp4";
                if (!hls && !mp4) return;
                if (sources.some(s => s.url === response.url)) return;
                const headers = {};
                for (const name of Object.keys(request.headers || {})) {
                    if (/^(referer|origin|user-agent)$/i.test(name)) headers[name] = request.headers[name];
                }
                sources.push({ url: response.url, type: hls ? "m3u8" : "mp4", quality: selected + " " + (sources.length + 1), subtitles: [], headers });
            });
            await browser.executeCDP("Network.enable", {});
            await browser.executeCDP("Runtime.enable", {});
            await browser.evaluate(`(() => {
                const buttons = Array.from(document.querySelectorAll('[role="tablist"][aria-label="Video sources"] [role="tab"]'));
                const target = buttons.find(b => b.textContent.trim() === ${JSON.stringify(selected)});
                if (!target) throw new Error('This episode does not offer the selected server');
                const other = buttons.find(b => b !== target);
                if (other) other.click();
            })()`);
            await browser.sleep(300);
            capturing = true;
            await browser.evaluate(`Array.from(document.querySelectorAll('[role="tablist"][aria-label="Video sources"] [role="tab"]')).find(b => b.textContent.trim() === ${JSON.stringify(selected)}).click()`);
            for (let attempt = 0; attempt < 40; attempt++) {
                // Cross-origin frames get separate execution contexts. Activate only
                // explicit video controls, never generic links or ad overlays.
                for (const contextId of Object.keys(contexts)) {
                    try {
                        await browser.executeCDP("Runtime.evaluate", { contextId: Number(contextId), expression: `(() => { const button = document.querySelector('[aria-label="Play video"], .vjs-big-play-button, .jw-icon-display'); if(button) button.click(); const video = document.querySelector('video'); if(video) video.play().catch(() => {}); })()`, returnByValue: true });
                    } catch (_) { /* Frames can disappear during player redirects. */ }
                }
                if (sources.length) {
                    await browser.sleep(500);
                    const first = sources[0];
                    return { server: selected, headers: first.headers, videoSources: sources.filter(s => JSON.stringify(s.headers) === JSON.stringify(first.headers)).map(s => ({url:s.url,type:s.type,quality:s.quality,subtitles:s.subtitles})) };
                }
                await browser.sleep(1000);
            }
            throw new Error("MKissa " + selected + " did not expose a playable stream. Try another server; the file may have been deleted or require interaction.");
        });
    }
}
