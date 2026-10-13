// Shared provider code, bundled at build time. No remote code execution or service.
class SeanimeVerify {
    static site(id) {
        const sites = {
            mkissa: { name: 'MKissa', url: 'https://mkissa.to/anime' },
            nexus: { name: 'Anime Nexus', url: 'https://anime.nexus/' }
        };
        if (!Object.prototype.hasOwnProperty.call(sites, id)) throw new Error('Unsupported verification provider');
        return sites[id];
    }
    static required(id) {
        const site = this.site(id);
        const error = new Error(site.name + ': site verification is required. Open ' + site.url +
            ' and complete any verification the site presents, then retry in Seanime. Browser verification may not authorize Seanime requests.');
        error.code = 'VERIFICATION_REQUIRED';
        error.provider = id;
        return error;
    }
    static isChallenge(text) {
        return typeof text === 'string' && /__CF\$cv\$params|\/cdn-cgi\/challenge-platform\/|cf-chl-|<title>\s*Just a moment/i.test(text);
    }
    static needsVerification(data) {
        const codes = ['NEED_CAPTCHA', 'TURNSTILE_REQUIRED', 'TURNSTILE_FAILED', 'FALLBACK_REQUIRED', 'ALTCHA_REQUIRED', 'VERIFICATION_REQUIRED'];
        if (!data || typeof data !== 'object') return false;
        if (codes.includes(data.code)) return true;
        return Array.isArray(data.errors) && data.errors.some(error => error &&
            (codes.includes(error.code) || codes.includes(error.extensions && error.extensions.code) ||
             (typeof error.message === 'string' && /\b(?:NEED_CAPTCHA|TURNSTILE_REQUIRED|VERIFICATION_REQUIRED)\b/.test(error.message))));
    }
    static apiError(data, id) {
        if (this.needsVerification(data)) return this.required(id);
        const site = this.site(id);
        const stale = data && Array.isArray(data.errors) && data.errors.some(error =>
            error && typeof error.message === 'string' && /\bAA_CRYPTO_(?:STALE|EXPIRED|BUILD_MISMATCH)\b/.test(error.message));
        const error = new Error(site.name + ': ' + (stale ? 'AA_CRYPTO_STALE; signing must be refreshed.' : 'upstream API rejected the request.'));
        error.code = stale ? 'SIGNING_STALE' : 'UPSTREAM_API_ERROR';
        return error;
    }
    static async assertResponse(response, id) {
        if (response.ok) return;
        let text = '';
        try { if (typeof response.text === 'function') text = await response.text(); } catch (_) {}
        let data;
        try { data = JSON.parse(text); } catch (_) {}
        if (this.isChallenge(text) || this.needsVerification(data)) throw this.required(id);
        const error = new Error(this.site(id).name + ': request failed (HTTP ' + response.status + ').');
        error.code = 'UPSTREAM_HTTP_ERROR';
        throw error;
    }
    static async json(response, id) {
        await this.assertResponse(response, id);
        let data;
        if (typeof response.text === 'function') {
            const text = await response.text();
            if (this.isChallenge(text)) throw this.required(id);
            try { data = JSON.parse(text); } catch (_) { throw new Error(this.site(id).name + ': upstream returned invalid JSON.'); }
        } else {
            try { data = await response.json(); } catch (_) { throw new Error(this.site(id).name + ': upstream returned invalid JSON.'); }
        }
        if (this.needsVerification(data)) throw this.required(id);
        return data;
    }
}
