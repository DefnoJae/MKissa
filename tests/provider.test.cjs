const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),crypto=require('node:crypto');
const code=fs.readFileSync(path.join(__dirname,'../provider.js'),'utf8');
function load(fetch){return vm.runInNewContext(code+';({provider:new Provider(),C:MKissaCrypto})',{fetch});}
const plain=value=>JSON.parse(JSON.stringify(value));
test('SHA256, HMAC and UTF8 match Node crypto',()=>{
 const {C}=load();
 for(const text of ['','abc','Naruto 日本語 🐈','x'.repeat(1000)]){
  assert.equal(C.hex(C.sha256(C.utf8(text))),crypto.createHash('sha256').update(text).digest('hex'));
  assert.equal(C.text(C.utf8(text)),text);
 }
 const key=[0,255,128,42];assert.equal(C.hex(C.hmac(key,C.utf8('bootstrap'))),crypto.createHmac('sha256',Buffer.from(key)).update('bootstrap').digest('hex'));
});
test('AES-256-GCM matches Node including empty and multiblock payloads and rejects tampering',()=>{
 const {C}=load();
 for(const size of [0,1,16,17,63,256,1025]){
  const key=crypto.randomBytes(32),iv=crypto.randomBytes(12),message=crypto.randomBytes(size);
  const cipher=crypto.createCipheriv('aes-256-gcm',key,iv),expected=Buffer.concat([cipher.update(message),cipher.final(),cipher.getAuthTag()]);
  const actual=C.gcm(Array.from(key),Array.from(iv),Array.from(message),false);
  assert.equal(Buffer.from(actual).toString('hex'),expected.toString('hex'));
  assert.deepEqual(plain(C.gcm(Array.from(key),Array.from(iv),actual,true)),Array.from(message));
  const changed=actual.slice();changed[changed.length-1]^=1;assert.throws(()=>C.gcm(Array.from(key),Array.from(iv),changed,true),/authentication failed/);
 }
});
test('Base64 matches Node without browser globals',()=>{
 const {C}=load();for(let length=0;length<70;length++){const data=Array.from(crypto.randomBytes(length)),encoded=C.base64(data);assert.equal(encoded,Buffer.from(data).toString('base64'));assert.deepEqual(plain(C.unbase64(encoded)),data);}assert.throws(()=>C.unbase64('!bad'),/Invalid/);
});
test('search uses POST, filters audio availability and prefers AniList match',async()=>{
 const calls=[];
 const {provider}=load(async(url,opts)=>{calls.push({url,opts});return {ok:true,json:async()=>({data:{shows:{pageInfo:{total:3},edges:[{_id:'a',name:'A',aniListId:2,availableEpisodes:{dub:2}},{_id:'b',name:'B',aniListId:1,availableEpisodes:{sub:2,dub:0}},{_id:'c',name:'C',aniListId:1,availableEpisodes:{dub:1}}]}}})};});
 const results=await provider.search({query:'test',dub:true,media:{id:1}});assert.equal(calls[0].opts.method,'POST');assert.equal(JSON.parse(calls[0].opts.body).variables.translationType,'dub');assert.deepEqual(plain(results.map(r=>r.id)),['c|dub','a|dub']);
});
test('episodes preserve gaps, exclude decimals, deduplicate and separate audio',async()=>{
 const {provider}=load();provider.graphql=async()=>({show:{availableEpisodesDetail:{sub:['3','1','1','2.5','0'],dub:['2']}}});
 assert.deepEqual(plain((await provider.findEpisodes('abc|sub')).map(e=>e.number)),[0,1,3]);assert.deepEqual(plain((await provider.findEpisodes('abc|dub')).map(e=>e.number)),[2]);assert.throws(()=>provider.parseId('../bad|sub'),/Invalid/);
});
test('signed query matches Node decryption and authenticated response is decoded',async()=>{
 const {provider,C}=load();let body;const key=Array.from(crypto.randomBytes(32));provider.bootstrap=async()=>({epoch:2962,key});
 provider.request=async(url,options)=>{body=JSON.parse(options.body);const qh=crypto.createHash('sha256').update(body.query).digest('hex'),packed=Buffer.from(body.extensions.aaReq,'base64'),d=crypto.createDecipheriv('aes-256-gcm',Buffer.from(key),packed.subarray(1,13));d.setAuthTag(packed.subarray(-16));const signed=JSON.parse(Buffer.concat([d.update(packed.subarray(13,-16)),d.final()]).toString());assert.equal(signed.qh,qh);assert.equal(signed.k,'k7');const iv=Array(12).fill(0);return {json:async()=>({data:{tobeparsed:C.base64([1].concat(iv,C.gcm(key,iv,C.utf8('{"episode":{"sourceUrls":[]}}'),false)))}})};};
 assert.deepEqual(plain(await provider.graphql('query{episode(showId:"abc"){sourceUrls}}',{},true)),{episode:{sourceUrls:[]}});assert.equal(body.extensions.k,'k7');
});
test('Ok metadata preserves master and MP4 URLs with explicit types',async()=>{
 const metadata={hlsManifestUrl:'https://cdn.test/video.m3u8?token=a',videos:[{name:'hd',url:'https://cdn.test/?token=b'}]},html='<div data-options="'+JSON.stringify({flashvars:{metadata}}).replace(/"/g,'&quot;')+'"></div>';
 const {provider}=load(async()=>({ok:true,text:async()=>html}));const result=await provider.resolve('https://ok.ru/videoembed/123','Ok','https://mkissa.to/');assert.equal(result.videoSources[0].url,metadata.hlsManifestUrl);assert.equal(result.videoSources[1].type,'mp4');assert.equal(result.headers.Referer,'https://ok.ru/videoembed/123');
});
test('Auto falls back but explicit server selection never changes hosts',async()=>{
 const {provider}=load();provider.graphql=async()=>({episode:{sourceUrls:[{sourceName:'Ok',sourceUrl:'https://ok.ru/videoembed/1'},{sourceName:'Mp4',sourceUrl:'https://mp4upload.com/embed-a.html'}]}});provider.resolve=async(url)=>{if(url.includes('ok.ru'))throw new Error('deleted');return {headers:{},videoSources:[{url:'https://cdn.test/v.mp4',type:'mp4',quality:'MP4',subtitles:[]}]};};assert.equal((await provider.findEpisodeServer({id:'abc|sub|1'},'default')).server,'Mp4');await assert.rejects(provider.findEpisodeServer({id:'abc|sub|1'},'Ok'),/deleted/);
});
test('missing server, HTTP errors and invalid episode IDs fail explicitly',async()=>{
 const {provider}=load(async()=>({ok:false,status:403}));await assert.rejects(provider.search({query:'test'}),/HTTP 403/);await assert.rejects(provider.findEpisodeServer({id:'abc|sub|../1'},'default'),/Invalid/);provider.graphql=async()=>({episode:{sourceUrls:[]}});await assert.rejects(provider.findEpisodeServer({id:'abc|dub|2'},'Mp4'),/no matching server/);
});
test('Default encoded source resolves via the public wrapper and keeps the HLS master',async()=>{
 const route='/apivtwo/clock?id=test',encoded='--'+Buffer.from(route).map(b=>b^56).toString('hex');let requested;
 const {provider}=load(async(url)=>{requested=url;return {ok:true,json:async()=>({links:[{link:'https://cdn.test/master.m3u8',hls:true,resolutionStr:'Hls'}]})};});
 const result=await provider.resolve(encoded,'Default','https://mkissa.to/');assert.equal(requested,'https://filelotion.fyi/apivtwo/clock.json?id=test');assert.equal(result.videoSources[0].type,'m3u8');assert.equal(result.videoSources[0].url,'https://cdn.test/master.m3u8');
});
