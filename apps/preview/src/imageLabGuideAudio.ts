import {ROLES,type Role} from './imageLabCore';
const details:Record<Role,string>={
 'hair-back':'Back hair only; extend roots behind head and neck; preserve full silhouette.',
 body:'Body/clothing only; paint neck, shoulders and hidden cloth underneath hair and head.',
 head:'Head/face base only; preserve jaw and neck overlap; remove separate eyes and mouth with matching skin.',
 'hair-left':'Screen-left hair only (not anatomical left); retain roots and overlap behind head.',
 'hair-right':'Screen-right hair only (not anatomical right); retain roots and overlap behind head.',
 'eye-left':'Screen-left eye only, neutral open eye; preserve eyelids and original gaze.',
 'eye-right':'Screen-right eye only, neutral open eye; preserve eyelids and original gaze.',
 mouth:'Mouth only, neutral shape; keep original center and proportions. Interior material must be separately authored, not inferred as phonemes.'
};
export function buildPartPrompt(role:Role):string {
 if(!ROLES.includes(role))throw Error('역할을 확인해 줘.');
 return `Use my original image as reference. Preserve character identity, palette, linework, lighting and front-facing pose. ${details[role]} Keep original canvas size and alignment: no crop, recenter, rotation or perspective change. Export transparent PNG; if transparency is unavailable use a flat chroma background absent from the character and remove it manually before part import. Paint hidden material and connection overlap; never claim unseen anatomy is recovered. This is manual part preparation, not automatic segmentation or calibrated alignment. Return only this role, no labels or sheet. Visually compare with the original before importing.`;
}
export const MAX_AUDIO_BYTES=20*1024*1024;
export function validateAudioBudget(bytes:number,duration:number,channels:number,sampleRate:number):void {
 if(!Number.isInteger(bytes)||bytes<=0||bytes>MAX_AUDIO_BYTES||!Number.isFinite(duration)||duration<=0||duration>120||!Number.isInteger(channels)||channels<1||channels>2||!Number.isFinite(sampleRate)||sampleRate<8000||sampleRate>48000)throw Error('오디오 제한: 20MB / 120초 / 1~2채널 / 디코딩 48kHz 이하');
}
export function amplitudeMouth(samples:ArrayLike<number>,previous:number,dt:number):number {
 if(!samples||!Number.isInteger(samples.length)||samples.length<1||samples.length>32768||!Number.isFinite(previous)||!Number.isFinite(dt)||dt<0)throw Error('잘못된 amplitude 입력');
 let sum=0;for(let i=0;i<samples.length;i++){if(!Number.isFinite(samples[i]))throw Error('잘못된 amplitude 입력');sum+=Math.min(1,Math.abs(samples[i]))**2;}
 const rms=Math.sqrt(sum/samples.length),target=Math.min(1,Math.max(0,(rms-.015)/.22));
 const before=Math.min(1,Math.max(0,previous));
 const next=before+(target-before)*(1-Math.exp(-Math.min(dt,.1)/(target>before?.035:.09)));
 return next<.001?0:next;
}
export function createAudioClock(){
 let generation=0,active=false;
 return {get active(){return active;},start(){active=true;return ++generation;},owns(token:number){return active&&token===generation;},stop(_reason:string){active=false;generation++;return 0;}};
}
