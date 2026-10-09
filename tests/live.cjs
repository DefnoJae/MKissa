const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(path.join(__dirname,'../provider.js'),'utf8'),provider=vm.runInNewContext(source+';new Provider()',{fetch});
(async()=>{
 let dubbedSelection;
 for(const dub of [false,true]){
  const results=await provider.search({query:'Naruto',dub,media:{}});assert(results.length>0);console.log((dub?'Dub':'Sub')+' search: '+results.length+' matches');
  const selection=results.find(r=>r.title==='NARUTO')||results[0],episodes=await provider.findEpisodes(selection.id);assert(episodes.length>0);console.log((dub?'Dub':'Sub')+' episode listing: '+episodes.length+' episodes');
  if(dub)dubbedSelection={id:episodes[0].id,number:episodes[0].number,url:episodes[0].url};
 }
 const result=await provider.findEpisodeServer({id:'2oXgpDPd3xKWdgnoz|sub|1',number:1,url:'https://mkissa.to/anime/2oXgpDPd3xKWdgnoz/p-1-sub'},'Auto');assert(result.videoSources.length>0);console.log('Signed playback resolved: '+result.server+' / '+result.videoSources.length+' sources');
 const master=result.videoSources.find(s=>s.type==='m3u8');assert(master);const response=await fetch(master.url,{headers:result.headers});assert(response.ok,'HLS master returned HTTP '+response.status);assert((await response.text()).startsWith('#EXTM3U'));console.log('HLS master retrieval: passed (no video segments fetched)');
 const dubbed=await provider.findEpisodeServer(dubbedSelection,'Auto');assert(dubbed.videoSources.length>0);console.log('Dub playback resolved: '+dubbed.server);
 const dubMaster=dubbed.videoSources.find(s=>s.type==='m3u8');assert(dubMaster);const dubResponse=await fetch(dubMaster.url,{headers:dubbed.headers});assert(dubResponse.ok,'Dub master HTTP '+dubResponse.status);assert((await dubResponse.text()).startsWith('#EXTM3U'));console.log('Dub HLS master retrieval: passed');
})().catch(e=>{console.error(e.message);process.exitCode=1;});
