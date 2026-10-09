// Runs entirely in Seanime. crypto.js is included by build.cjs in provider.js.
class Provider {
    constructor(){
        this.base='https://mkissa.to';this.api='https://api.mkissa.net';
        // Public MKissa client build 179 protocol (not an account credential).
        this.build='179';
        this.mask=[181,144,93,163,157,47,234,184,123,35,102,31,45,121,26,86,5,55,17,30,137,144,24,110,64,94,214,203,199,112,25,5];
    }
    getSettings(){return {episodeServers:['Auto','Ok','Default','Mp4','Fm-Hls'],supportsDub:true};}
    async request(url,options){
        const response=await fetch(url,Object.assign({timeout:25},options||{}, {headers:Object.assign({'User-Agent':'Mozilla/5.0',Referer:this.base+'/',Origin:this.base},options&&options.headers||{})}));
        if(!response.ok)throw new Error('MKissa request failed: HTTP '+response.status);
        return response;
    }
    async bootstrap(){
        const C=MKissaCrypto,week=604800000,now=Date.now(),current=Math.floor(now/week);
        const epochs=now-current*week<86400000?[current-1,current]:[current,current-1];
        let failure;
        for(const epoch of epochs){
            try{
                const intermediate=C.hmac(this.mask,C.utf8('KoCGqjW:'+this.build));
                const signature=C.hex(C.hmac(intermediate,C.utf8(this.build+'|mkissa|k7|'+epoch+'|mkissa.to')));
                const response=await this.request(this.api+'/client-crypto/v1/bootstrap?buildId='+this.build+'&k=k7',{headers:{'x-build-id':this.build,'x-aa-boot':signature}});
                const data=await response.json(),part=C.unbase64(data.partB);
                if(data.k!=='k7'||!Number.isInteger(data.epoch)||part.length!==32)throw new Error('MKissa bootstrap format changed');
                return {epoch:data.epoch,key:part.map((b,i)=>b^this.mask[i])};
            }catch(error){failure=error;}
        }
        throw new Error('MKissa playback protocol is unavailable or its public client changed. '+failure.message);
    }
    async graphql(query,variables,secured){
        const C=MKissaCrypto;
        for(let attempt=0;attempt<(secured?2:1);attempt++){
            const body={query,variables:variables||{}},headers={'Content-Type':'application/json'};
            let session;
            if(secured){
                session=await this.bootstrap();
                const qh=C.hex(C.sha256(C.utf8(query))),ts=Math.floor(Date.now()/300000)*300000;
                const iv=C.sha256(C.utf8(session.epoch+':'+this.build+':'+qh+':'+ts+':k7')).slice(0,12);
                const message=C.utf8(JSON.stringify({v:1,ts,epoch:session.epoch,buildId:this.build,qh,k:'k7'}));
                body.extensions={persistedQuery:{version:1,sha256Hash:qh},k:'k7',aaReq:C.base64([1].concat(iv,C.gcm(session.key,iv,message,false)))};
                headers['x-build-id']=this.build;
            }
            const data=await (await this.request(this.api+'/api',{method:'POST',headers,body:JSON.stringify(body)})).json();
            if(data.errors&&data.errors.length){
                const message=data.errors.map(e=>e.message).join('; ');
                if(secured&&attempt===0&&/AA_CRYPTO_(?:STALE|EXPIRED|BUILD_MISMATCH)/.test(message))continue;
                throw new Error('MKissa API: '+message);
            }
            if(!data.data)throw new Error('MKissa API returned no data');
            if(typeof data.data.tobeparsed==='string'){
                if(!session)throw new Error('Unexpected encrypted MKissa response');
                const envelope=C.unbase64(data.data.tobeparsed);
                if(envelope.length<29||envelope[0]!==1)throw new Error('Unsupported MKissa encryption envelope');
                return JSON.parse(C.text(C.gcm(session.key,envelope.slice(1,13),envelope.slice(13),true)));
            }
            return data.data;
        }
        throw new Error('MKissa playback signing could not be refreshed');
    }
    parseId(id){
        const parts=String(id).split('|');
        if(parts.length!==2||!/^[a-zA-Z0-9]+$/.test(parts[0])||!/^(sub|dub)$/.test(parts[1]))throw new Error('Invalid MKissa anime ID; search again.');
        return {show:parts[0],translation:parts[1]};
    }
    async search(opts){
        const query=String(opts.query||opts.media&&opts.media.englishTitle||opts.media&&opts.media.romajiTitle||'').trim();if(!query)return [];
        const mode=opts.dub?'dub':'sub',results=[],seen={};
        const gql='query($search:SearchInput,$limit:Int,$page:Int,$translationType:VaildTranslationTypeEnumType){shows(search:$search,limit:$limit,page:$page,translationType:$translationType){pageInfo{total} edges{_id name englishName aniListId availableEpisodes}}}';
        for(let page=1;page<=100;page++){
            const data=await this.graphql(gql,{search:{query,allowAdult:!!(opts.media&&opts.media.isAdult),allowUnknown:false},limit:40,page,translationType:mode});
            if(!data.shows||!Array.isArray(data.shows.edges))throw new Error('MKissa search response changed');
            const edges=data.shows.edges;
            for(const item of edges){
                if(!item._id||seen[item._id]||!item.availableEpisodes||Number(item.availableEpisodes[mode])<=0)continue;
                seen[item._id]=true;
                results.push({id:item._id+'|'+mode,title:item.name||item.englishName||item._id,url:this.base+'/anime/'+item._id,subOrDub:mode,metadata:{anilistId:item.aniListId}});
            }
            const total=Number(data.shows.pageInfo&&data.shows.pageInfo.total);
            if(edges.length<40||Number.isFinite(total)&&page*40>=total)return results.sort((a,b)=>Number(b.metadata.anilistId===opts.media?.id)-Number(a.metadata.anilistId===opts.media?.id));
        }
        throw new Error('MKissa search pagination exceeded its limit');
    }
    async findEpisodes(id){
        const item=this.parseId(id);
        const data=await this.graphql('query($_id:String!){show(_id:$_id){_id availableEpisodesDetail}}',{_id:item.show});
        const details=data.show&&data.show.availableEpisodesDetail;
        if(!details||!Array.isArray(details[item.translation]))throw new Error('MKissa episode response changed');
        const seen={},episodes=[];
        for(const value of details[item.translation]){
            const number=Number(value);if(!Number.isInteger(number)||number<0||seen[number])continue;seen[number]=true;
            episodes.push({id:id+'|'+number,number,title:'Episode '+number,url:this.base+'/anime/'+item.show+'/p-'+number+'-'+item.translation});
        }
        return episodes.sort((a,b)=>a.number-b.number);
    }
    async findEpisodeServer(episode,server){
        const parts=String(episode.id).split('|'),item=this.parseId(parts.slice(0,2).join('|'));
        if(parts.length!==3||!/^\d+$/.test(parts[2]))throw new Error('Invalid MKissa episode ID');
        const requested=!server||server==='default'?'Auto':server;
        if(!this.getSettings().episodeServers.includes(requested))throw new Error('Unknown MKissa server: '+requested);
        const query='query($showId:String!,$translationType:VaildTranslationTypeEnumType!,$episodeString:String!){episode(showId:$showId,translationType:$translationType,episodeString:$episodeString){episodeString sourceUrls show{_id name countryOfOrigin}}}';
        const data=await this.graphql(query,{showId:item.show,translationType:item.translation,episodeString:parts[2]},true);
        if(!data.episode||!Array.isArray(data.episode.sourceUrls))throw new Error('MKissa source response changed');
        const sources=data.episode.sourceUrls.filter(s=>requested==='Auto'||s.sourceName===requested);
        // Prefer Ok's structured metadata, then ordinary MP4 embeds.
        const order={Ok:0,Default:1,Mp4:2};sources.sort((a,b)=>(order[a.sourceName]??3)-(order[b.sourceName]??3));
        const failures=[];
        for(const source of sources){
            try{
                const result=await this.resolve(source.sourceUrl,source.sourceName,episode.url||this.base+'/');
                if(!result.videoSources.length)throw new Error('No playable media');
                return {server:source.sourceName,headers:result.headers,videoSources:result.videoSources};
            }catch(error){failures.push(source.sourceName+': '+error.message);}
        }
        throw new Error('MKissa could not resolve '+requested+'. '+(failures.join('; ')||'This episode has no matching server'));
    }
    entities(value){return value.replace(/&quot;/g,'"').replace(/&#(?:39|x27);/gi,"'").replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>');}
    type(url){return /\.m3u8(?:[?#]|$)/i.test(url)?'m3u8':/\.mp4(?:[?#]|$)/i.test(url)?'mp4':'unknown';}
    async resolve(url,label,referer){
        if(/^--[a-f0-9]+$/i.test(url||'')){
            const hex=url.slice(2);if(hex.length%2)throw new Error('Invalid MKissa source encoding');
            url=hex.match(/../g).map(value=>String.fromCharCode(parseInt(value,16)^56)).join('');
        }
        if(/^\/apivtwo\/[a-z0-9/]+\?id=/i.test(url)){
            const endpoint='https://filelotion.fyi'+url.replace('?id=','.json?id=');
            const data=await (await this.request(endpoint,{headers:{Referer:'https://filelotion.fyi/'}})).json();
            if(!Array.isArray(data.links))throw new Error('MKissa Default source format changed');
            const videoSources=[];
            for(const link of data.links){
                const media=link.link||link.url;if(!/^https?:\/\//i.test(media||''))continue;
                const type=link.hls?'m3u8':this.type(media);if(type==='unknown')continue;
                videoSources.push({url:media,type,quality:String(link.resolutionStr||link.resolution||'Auto')+' (Default) '+(videoSources.length+1),subtitles:[]});
            }
            return {headers:{Referer:'https://filelotion.fyi/','User-Agent':'Mozilla/5.0'},videoSources};
        }
        if(!/^https?:\/\//i.test(url||''))throw new Error('Unsupported player URL');
        if(this.type(url)!=='unknown')return {headers:{Referer:referer},videoSources:[{url,type:this.type(url),quality:label,subtitles:[]}]};
        let html=await (await this.request(url,{headers:{Referer:referer}})).text();
        const videoSources=[];
        if(/^https:\/\/(?:www\.)?ok\.ru\/videoembed\//i.test(url)){
            const attributes=html.matchAll(/data-options="([^"]+)"/g);
            for(const match of attributes){
                let options;try{options=JSON.parse(this.entities(match[1]));}catch(_){continue;}
                let metadata=options.flashvars&&options.flashvars.metadata;
                if(typeof metadata==='string')metadata=JSON.parse(metadata);
                if(!metadata)continue;
                if(metadata.hlsManifestUrl)videoSources.push({url:metadata.hlsManifestUrl,type:'m3u8',quality:'Auto (Ok)',subtitles:[]});
                for(const video of metadata.videos||[])if(/^https?:\/\//i.test(video.url))videoSources.push({url:video.url,type:'mp4',quality:String(video.name||'MP4')+' (Ok)',subtitles:[]});
            }
        }else{
            html+='\n'+this.unpack(html);
            const pattern=/\b(?:file|src|source)\s*[:=]\s*["']([^"']+)["']/g;let found;
            while((found=pattern.exec(html))){const value=this.entities(found[1].replace(/\\\//g,'/'));if(/^https?:\/\//i.test(value)&&this.type(value)!=='unknown')videoSources.push({url:value,type:this.type(value),quality:label+' '+(videoSources.length+1),subtitles:[]});}
        }
        return {headers:{Referer:url,'User-Agent':'Mozilla/5.0'},videoSources:videoSources.filter((s,i)=>videoSources.findIndex(v=>v.url===s.url)===i)};
    }
    unpack(html){
        const match=html.match(/\}\s*\(\s*'((?:\\.|[^'\\])*)'\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*'((?:\\.|[^'\\])*)'\.split\('\|'\)/);if(!match)return '';
        const radix=Number(match[2]),count=Number(match[3]);if(radix<2||radix>62||count>100000)throw new Error('Unsupported packed player');
        const unescape=s=>s.replace(/\\'/g,"'").replace(/\\\\/g,'\\'),dictionary=unescape(match[4]).split('|'),alphabet='0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ',lookup={};
        const token=n=>n<radix?alphabet[n]:token(Math.floor(n/radix))+alphabet[n%radix];
        for(let n=0;n<count;n++)if(dictionary[n])lookup[token(n)]=dictionary[n];
        return unescape(match[1]).replace(/\b\w+\b/g,word=>lookup[word]||word);
    }
}
