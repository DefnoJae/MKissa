const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const code = fs.readFileSync(path.join(__dirname, '..', 'provider.js'), 'utf8');
function provider(browser) {
    const context = vm.createContext({ ChromeDP: { newBrowser: async () => browser } });
    return vm.runInContext(code + '; new Provider()', context);
}
test('IDs validate language and reject untrusted paths', () => {
    const p = provider({});
    assert.equal(p.parseId('abc123|dub').translation, 'dub');
    for (const id of ['../abc|sub', 'abc|raw', 'abc', 'abc|sub|1']) assert.throws(() => p.parseId(id));
});
test('search scopes results, deduplicates and preserves selected audio', async () => {
    let closed = false;
    let url;
    const browser = { navigate: async value => url = value, close: async () => closed = true,
        evaluate: async expression => expression.includes('return /no results') ? true : [
            { href:'https://mkissa.to/anime/abc', title:'Example' },
            { href:'https://mkissa.to/anime/abc', title:'Duplicate' },
            { href:'https://example.org/anime/other', title:'Other' }
        ] };
    const rows = await provider(browser).search({query:'A & B',dub:true});
    assert.equal(rows.length, 1);
    assert.equal(rows[0].id, 'abc|dub');
    assert.equal(rows[0].subOrDub, 'dub');
    assert.match(url, /query=A%20%26%20B&tr=dub$/);
    assert.equal(closed, true);
});
test('episodes preserve gaps, sort and exclude decimal specials and other languages', async () => {
    let closed = false;
    const browser = { navigate: async () => {}, sleep: async () => {}, close: async () => closed = true,
        evaluate: async expression => expression.includes('return { count:') ? {count:5,more:false,busy:false}
            : expression.startsWith('Array.from') ? ['3-sub','1-sub','1-sub','2.5-sub','2-dub'].map(v => ({url:'https://mkissa.to/anime/abc/p-'+v,title:'EP'})) : true };
    const rows = await provider(browser).findEpisodes('abc|sub');
    assert.equal(JSON.stringify(rows.map(e => e.number)), '[1,3]');
    assert.equal(rows[0].id, 'abc|sub|1');
    assert.equal(closed, true);
});
test('browser closes when navigation fails', async () => {
    let closed = false;
    const browser = { navigate: async () => { throw new Error('offline'); }, close: async () => closed = true };
    await assert.rejects(provider(browser).search({query:'test'}), /offline/);
    assert.equal(closed, true);
});
test('invalid episode IDs and servers fail before navigation', async () => {
    const p = provider({});
    await assert.rejects(p.findEpisodeServer({id:'abc|sub|../1'}, 'default'), /Invalid/);
    await assert.rejects(p.findEpisodeServer({id:'abc|sub|1'}, 'unknown'), /Unsupported/);
});
test('playback returns media with request headers and closes browser', async () => {
    let listener;
    let closed = false;
    const browser = { navigate: async () => {}, sleep: async () => {}, close: async () => closed = true,
        listenTarget: callback => listener = callback, executeCDP: async () => {},
        evaluate: async expression => {
            if (expression.startsWith('Array.from')) {
                listener({method:'Network.requestWillBeSent',params:{requestId:'1',request:{headers:{Referer:'https://host.test/',Cookie:'private'}}}});
                listener({method:'Network.responseReceived',params:{requestId:'1',response:{url:'https://cdn.test/master.m3u8?token=123',mimeType:'application/vnd.apple.mpegurl',status:200}}});
            }
            return true;
        } };
    const result = await provider(browser).findEpisodeServer({id:'abc|sub|1'}, 'default');
    assert.equal(result.videoSources[0].type, 'm3u8');
    assert.equal(result.videoSources[0].url, 'https://cdn.test/master.m3u8?token=123');
    assert.equal(result.headers.Referer, 'https://host.test/');
    assert.equal(result.headers.Cookie, undefined);
    assert.equal(closed, true);
});
test('missing video gives a clear error and closes browser', async () => {
    let closed = false;
    const browser = {navigate:async()=>{},sleep:async()=>{},close:async()=>closed=true,evaluate:async()=>true,listenTarget:()=>{},executeCDP:async()=>{}};
    await assert.rejects(provider(browser).findEpisodeServer({id:'abc|dub|2'}, 'Mp4'), /did not expose a playable stream/);
    assert.equal(closed,true);
});
