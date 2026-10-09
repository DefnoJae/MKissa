// Byte-oriented SHA-256, HMAC and AES-256-GCM for Seanime's JS runtime.
// No browser WebCrypto dependency. GCM decrypt verifies the authentication tag.
class MKissaCrypto {
    static utf8(value) { return Array.from(unescape(encodeURIComponent(value)), c => c.charCodeAt(0)); }
    static text(bytes) { return decodeURIComponent(escape(bytes.map(b => String.fromCharCode(b)).join(''))); }
    static hex(bytes) { return bytes.map(b => ('0' + b.toString(16)).slice(-2)).join(''); }
    static base64(bytes) {
        const chars='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
        let result='';
        for(let i=0;i<bytes.length;i+=3) {
            const a=bytes[i],b=bytes[i+1]||0,c=bytes[i+2]||0;
            result+=chars[a>>2]+chars[((a&3)<<4)|(b>>4)]+(i+1<bytes.length?chars[((b&15)<<2)|(c>>6)]:'=')+(i+2<bytes.length?chars[c&63]:'=');
        }
        return result;
    }
    static unbase64(value) {
        const chars='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
        if(typeof value!=='string'||value.length%4||!/^[A-Za-z0-9+/]*={0,2}$/.test(value)) throw new Error('Invalid MKissa Base64');
        const result=[];
        for(let i=0;i<value.length;i+=4){
            const a=chars.indexOf(value[i]),b=chars.indexOf(value[i+1]),c=chars.indexOf(value[i+2]),d=chars.indexOf(value[i+3]);
            result.push((a<<2)|(b>>4));
            if(c>=0)result.push(((b&15)<<4)|(c>>2));
            if(d>=0)result.push(((c&3)<<6)|d);
        }
        return result;
    }
    static sha256(input) {
        const bytes=input.slice(),length=bytes.length;
        bytes.push(128);while(bytes.length%64!==56)bytes.push(0);
        const high=Math.floor(length/536870912),low=(length*8)>>>0;
        for(const word of [high,low])for(let j=3;j>=0;j--)bytes.push((word>>>(j*8))&255);
        const k=[0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
        const h=[0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
        const rotate=(v,n)=>(v>>>n)|(v<<(32-n));
        for(let offset=0;offset<bytes.length;offset+=64){
            const w=[];
            for(let i=0;i<16;i++){let p=offset+i*4;w[i]=(bytes[p]<<24)|(bytes[p+1]<<16)|(bytes[p+2]<<8)|bytes[p+3];}
            for(let i=16;i<64;i++){const a=w[i-15],b=w[i-2];w[i]=(w[i-16]+(rotate(a,7)^rotate(a,18)^(a>>>3))+w[i-7]+(rotate(b,17)^rotate(b,19)^(b>>>10)))|0;}
            let [a,b,c,d,e,f,g,j]=h;
            for(let i=0;i<64;i++){
                const t1=(j+(rotate(e,6)^rotate(e,11)^rotate(e,25))+((e&f)^(~e&g))+k[i]+w[i])|0;
                const t2=((rotate(a,2)^rotate(a,13)^rotate(a,22))+((a&b)^(a&c)^(b&c)))|0;
                j=g;g=f;f=e;e=(d+t1)|0;d=c;c=b;b=a;a=(t1+t2)|0;
            }
            [a,b,c,d,e,f,g,j].forEach((v,i)=>h[i]=(h[i]+v)|0);
        }
        const output=[];for(const word of h)for(let i=3;i>=0;i--)output.push((word>>>(i*8))&255);return output;
    }
    static hmac(key,message){
        if(key.length>64)key=this.sha256(key);key=key.slice();while(key.length<64)key.push(0);
        return this.sha256(key.map(b=>b^92).concat(this.sha256(key.map(b=>b^54).concat(message))));
    }
    static multiply(a,b){let result=0;for(let i=0;i<8;i++){if(b&1)result^=a;a=((a<<1)^((a&128)?0x11b:0))&255;b>>>=1;}return result;}
    static schedule(key){
        if(key.length!==32)throw new Error('MKissa AES key must be 32 bytes');
        const sbox=[];
        for(let value=0;value<256;value++){
            let inverse=0;
            if(value){inverse=1;let base=value,power=254;while(power){if(power&1)inverse=this.multiply(inverse,base);base=this.multiply(base,base);power>>>=1;}}
            let s=inverse;for(let i=1;i<=4;i++)s^=((inverse<<i)|(inverse>>(8-i)))&255;sbox[value]=s^99;
        }
        const expanded=key.slice();let rcon=1;
        while(expanded.length<240){
            let t=expanded.slice(-4),count=expanded.length;
            if(count%32===0){t.push(t.shift());t=t.map(b=>sbox[b]);t[0]^=rcon;rcon=this.multiply(rcon,2);}
            else if(count%32===16)t=t.map(b=>sbox[b]);
            for(let i=0;i<4;i++)expanded.push(expanded[count+i-32]^t[i]);
        }
        return {expanded,sbox};
    }
    static aes(block,schedule){
        let state=block.slice();const {expanded,sbox}=schedule;
        for(let i=0;i<16;i++)state[i]^=expanded[i];
        for(let round=1;round<=14;round++){
            const previous=state.map(b=>sbox[b]);
            for(let row=0;row<4;row++)for(let column=0;column<4;column++)state[column*4+row]=previous[((column+row)%4)*4+row];
            if(round!==14)for(let column=0;column<4;column++){
                const p=column*4,a=state.slice(p,p+4),sum=a[0]^a[1]^a[2]^a[3];
                for(let row=0;row<4;row++)state[p+row]=a[row]^sum^this.multiply(a[row]^a[(row+1)%4],2);
            }
            for(let i=0;i<16;i++)state[i]^=expanded[round*16+i];
        }
        return state;
    }
    static ghash(ciphertext,h){
        let y=Array(16).fill(0);
        const blocks=ciphertext.slice();while(blocks.length%16)blocks.push(0);
        const lengthBlock=Array(16).fill(0),bits=ciphertext.length*8;
        for(let i=0;i<8;i++)lengthBlock[15-i]=Math.floor(bits/Math.pow(256,i))&255;
        blocks.push(...lengthBlock);
        for(let offset=0;offset<blocks.length;offset+=16){
            const x=y.map((b,i)=>b^blocks[offset+i]);let z=Array(16).fill(0),v=h.slice();
            for(let bit=0;bit<128;bit++){
                if((x[bit>>3]>>(7-(bit&7)))&1)for(let i=0;i<16;i++)z[i]^=v[i];
                const low=v[15]&1;for(let i=15;i>=0;i--)v[i]=(v[i]>>>1)|(i?((v[i-1]&1)<<7):0);if(low)v[0]^=225;
            }
            y=z;
        }
        return y;
    }
    static gcm(key,nonce,input,decrypt){
        if(nonce.length!==12||decrypt&&input.length<16)throw new Error('Invalid MKissa GCM envelope');
        const schedule=this.schedule(key),zero=Array(16).fill(0),j0=nonce.concat([0,0,0,1]);
        const body=decrypt?input.slice(0,-16):input.slice(),output=[],counter=j0.slice();
        for(let offset=0;offset<body.length;offset+=16){
            for(let i=15;i>=12;i--){counter[i]=(counter[i]+1)&255;if(counter[i])break;}
            const stream=this.aes(counter,schedule);
            for(let i=0;i<16&&offset+i<body.length;i++)output.push(body[offset+i]^stream[i]);
        }
        const hash=this.ghash(decrypt?body:output,this.aes(zero,schedule));
        const tag=this.aes(j0,schedule).map((b,i)=>b^hash[i]);
        if(decrypt){let difference=0;for(let i=0;i<16;i++)difference|=tag[i]^input[input.length-16+i];if(difference)throw new Error('MKissa response authentication failed');return output;}
        return output.concat(tag);
    }
}
