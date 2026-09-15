export const MAX_PACK_BYTES=5*1024*1024;
export interface SpeechToken {token:string;start_seconds:number;end_seconds:number;confidence:number}
export interface SpeechPack {kind:'standrig-speech';schema_version:1;status:'aligned';text:string;audio:string;sha256:string;duration:number;tokens:SpeechToken[]}
const whitelist='ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ|';
export async function validateSpeechPack(raw:string):Promise<SpeechPack>{
 const fail=()=>{throw Error('유효하지 않은 aligned WAV speech pack');};
 if(new TextEncoder().encode(raw).length>MAX_PACK_BYTES)fail();
 const p=JSON.parse(raw) as SpeechPack;
 if(!p||p.kind!=='standrig-speech'||p.schema_version!==1||p.status!=='aligned'||typeof p.text!=='string'||!p.text.trim()||p.text.length>1000||!Number.isFinite(p.duration)||p.duration<=0||p.duration>30||typeof p.sha256!=='string'||!/^[a-f0-9]{64}$/.test(p.sha256)||typeof p.audio!=='string')fail();
 const prefix='data:audio/wav;base64,';if(!p.audio.startsWith(prefix))fail();const b64=p.audio.slice(prefix.length);
 if(!b64.length||b64.length%4||! /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(b64))fail();
 const binary=atob(b64);if(btoa(binary)!==b64)fail();const bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));
 const view=new DataView(bytes.buffer),tag=(n:number)=>String.fromCharCode(...bytes.slice(n,n+4));
 if(bytes.length<44||tag(0)!=='RIFF'||tag(8)!=='WAVE'||view.getUint32(4,true)+8!==bytes.length)fail();
 let rate=0,align=0,data=0,channels=0;
 for(let i=12;i+8<=bytes.length;){const size=view.getUint32(i+4,true);if(i+8+size>bytes.length)fail();if(tag(i)==='fmt '){if(size<16||view.getUint16(i+8,true)!==1)fail();channels=view.getUint16(i+10,true);rate=view.getUint32(i+12,true);align=view.getUint16(i+20,true);const bits=view.getUint16(i+22,true);if(![8,16,24,32].includes(bits)||align!==channels*bits/8||view.getUint32(i+16,true)!==rate*align)fail();}if(tag(i)==='data')data+=size;i+=8+size+(size%2);}
 if(channels<1||channels>2||rate<8000||rate>96000||!align||!data||data%align||Math.abs(data/align/rate-p.duration)>.002)fail();
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');if(hash!==p.sha256)fail();
 if(!Array.isArray(p.tokens)||!p.tokens.length||p.tokens.length>300)fail();let end=0;
 for(const t of p.tokens){if(!t||typeof t.token!=='string'||t.token.length!==1||!whitelist.includes(t.token)||![t.start_seconds,t.end_seconds,t.confidence].every(Number.isFinite)||t.start_seconds<end||t.end_seconds<=t.start_seconds||t.end_seconds>p.duration||t.confidence<.001||t.confidence>1)fail();end=t.end_seconds;}
 return p;
}
/** Renderer-only hold, never writes canonical observed CTC occupancy. I has no unique artwork. */
export function packShape(p:SpeechPack,time:number,rmsMouth:number){
 let vowel:SpeechToken|undefined;
 for(const t of p.tokens){if(t.start_seconds>time)break;if('ㅏㅑㅓㅕㅐㅒㅔㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ'.includes(t.token))vowel=t;}
 if(!vowel||time>=vowel.end_seconds+.12||rmsMouth<=.01)return {form:0,open:0,interpolated:false};
 const c=vowel.token,form='ㅣㅟㅡㅢㅔㅐㅒㅖㅙㅚㅞ'.includes(c)?-1:'ㅗㅜㅛㅠㅘㅝ'.includes(c)?1:0;
 return {form,open:rmsMouth,interpolated:time>=vowel.end_seconds};
}
