// Manual exploratory driver: real production voice client, Realtime audio,
// native editor, and the same pointer messages as the phone. No mock tools.
import fs from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import readline from 'node:readline';
import ts from 'typescript';
import {WebSocket} from 'ws';
import {voiceSession,voiceModel} from '../native/realtime.mjs';
const dir=process.env.AIRSPACE_PLAYTEST_DIR||'validation/hands-on',start=Date.now(),records=[],audio=[];
await fs.mkdir(dir,{recursive:true});
const session=JSON.parse(await fs.readFile('runtime/session.json','utf8'));
const post=command=>fetch('http://127.0.0.1:4310/local',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({command})}).then(r=>r.json());
const wait=ms=>new Promise(r=>setTimeout(r,ms));
let nextCorrection=null;
const log=(kind,data={})=>{const entry={kind,ms:Date.now()-start,...data};records.push(entry);console.log(JSON.stringify(entry));if(kind==='tool_start'&&data.name==='edit_workspace'&&nextCorrection){const text=nextCorrection;nextCorrection=null;setTimeout(()=>void speak(text),800);}};
const save=async name=>{const scene=await post('inspect');await fs.writeFile(`${dir}/${name}.json`,JSON.stringify(scene,null,2));log('snapshot',{name,selected:scene.selected,objects:scene.elements.filter(e=>e.type==='text').map(e=>e.text)});return scene;};
const code=ts.transpileModule(await fs.readFile('lib/voice.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
const {LiveVoice}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
const originalFetch=globalThis.fetch;let toolNumber=0;
globalThis.fetch=async(url,options)=>{
 if(url!=='/voice/tool')return originalFetch(url,options);
 const body=JSON.parse(options.body),number=++toolNumber;log('tool_start',{number,name:body.name,request:body.arguments?.request});
 const r=await originalFetch('http://127.0.0.1:4310/voice/tool',options);
 void(async()=>{const copy=r.clone();if(!copy.headers.get('content-type')?.includes('ndjson')){log('tool_result',{number,result:await copy.json()});return;}
 let buffer='';for await(const chunk of copy.body){buffer+=new TextDecoder().decode(chunk);let end;while((end=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,end);buffer=buffer.slice(end+1);if(!line)continue;const e=JSON.parse(line);if(e.type==='progress')log('progress',{number,phase:e.kind});if(e.type==='complete'){log('tool_result',{number,result:e.result});await save('after-tool-'+number);}}}})().catch(e=>log('observer_error',{message:e.message}));
 return r;
};
const client=new LiveVoice(session.phone,s=>log('status',{text:s}),s=>log('speech',{text:s}),()=>log('interrupt'));
const ws=new WebSocket(`wss://api.openai.com/v1/realtime?model=${voiceModel}`,{headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`}});
client.dc={readyState:'open',send:value=>ws.send(value),close:()=>{}};
let readyResolve;const ready=new Promise(r=>readyResolve=r);
ws.on('open',()=>ws.send(JSON.stringify({type:'session.update',session:voiceSession('canvas')})));
ws.on('message',raw=>{const e=JSON.parse(raw);if(e.type==='session.updated'){log('ready');readyResolve();}if(e.type==='response.output_audio.delta')audio.push(Buffer.from(e.delta,'base64'));if(e.type==='error')log('api_error',{message:e.error?.message});if(e.type==='input_audio_buffer.speech_started')log('heard_speech');void client.event(e,0).catch(e=>log('client_error',{message:e.message}));});
const phone=new WebSocket('ws://127.0.0.1:4310/live');
await new Promise((resolve,reject)=>{phone.on('open',()=>phone.send(JSON.stringify({type:'join',id:session.id,token:session.phone})));phone.on('message',raw=>{if(JSON.parse(raw).type==='joined')resolve();});phone.on('error',reject);});
const send=m=>phone.send(JSON.stringify(m));
await ready;await save('initial');
async function pointTo(label,select=true){
 send({type:'pointer',x:0,y:0});await wait(50);const a=(await post('inspect')).pointer.scene;
 send({type:'pointer',x:1,y:1});await wait(50);const scene=await post('inspect'),b=scene.pointer.scene;
 const text=scene.elements.find(e=>e.type==='text'&&e.text.toLowerCase()===label.toLowerCase());if(!text)throw Error('Label not found: '+label);
 const target=scene.elements.find(e=>e.id===text.containerId)||text;
 const x=(target.x+target.width/2-a.x)/(b.x-a.x),y=(target.y+target.height/2-a.y)/(b.y-a.y);
 if(x<0||x>1||y<0||y>1)throw Error('Target outside viewport; fit first');
 send({type:'tool',tool:'point'});send({type:'pointer',x,y});if(select){send({type:'down'});send({type:'up'});}await wait(100);await save('point-'+label.replaceAll(' ','-'));log('pointed',{label,select});
}
let speechIndex=0;
async function speak(text){
 const n=++speechIndex;log('input_audio',{text});
 const source=`${dir}/input-${n}.aiff`,wav=`${dir}/input-${n}.wav`;
 execFileSync('/usr/bin/say',['-v','Samantha','-r','185','-o',source,text]);
 execFileSync('/usr/bin/afconvert',['-f','WAVE','-d','LEI16@24000','-c','1',source,wav]);
 const bytes=await fs.readFile(wav);let offset=12,pcm;
 while(offset+8<=bytes.length){const length=bytes.readUInt32LE(offset+4);if(bytes.toString('ascii',offset,offset+4)==='data'){pcm=bytes.subarray(offset+8,offset+8+length);break;}offset+=8+length+(length%2);}
 if(!pcm)throw Error('No PCM data');
 for(let i=0;i<pcm.length;i+=2400){ws.send(JSON.stringify({type:'input_audio_buffer.append',audio:pcm.subarray(i,i+2400).toString('base64')}));await wait(50);}
 for(let i=0;i<15;i++){ws.send(JSON.stringify({type:'input_audio_buffer.append',audio:Buffer.alloc(2400).toString('base64')}));await wait(50);}
 log('input_finished',{index:n});
}
console.log('Commands: audio, text, point, hover, fit, snapshot, stop, end');
const lines=readline.createInterface({input:process.stdin});
lines.on('line',line=>{void(async()=>{const d=JSON.parse(line);if(d.correctNext)nextCorrection=d.correctNext;if(d.audio)await speak(d.audio);if(d.text){log('input_text',{text:d.text});ws.send(JSON.stringify({type:'conversation.item.create',item:{type:'message',role:'user',content:[{type:'input_text',text:d.text}]}}));ws.send(JSON.stringify({type:'response.create'}));}if(d.fit){send({type:'fit'});await wait(400);}if(d.point)await pointTo(d.point);if(d.hover)await pointTo(d.hover,false);if(d.snapshot)await save(d.snapshot);if(d.stop)await originalFetch('http://127.0.0.1:4310/voice/tool',{method:'POST',headers:{authorization:'Bearer '+session.phone,'content-type':'application/json'},body:JSON.stringify({name:'stop_edit'})});if(d.end){client.stop();ws.close();phone.close();await fs.writeFile(`${dir}/events.json`,JSON.stringify(records,null,2));const pcm=Buffer.concat(audio),h=Buffer.alloc(44);h.write('RIFF');h.writeUInt32LE(36+pcm.length,4);h.write('WAVE',8);h.write('fmt ',12);h.writeUInt32LE(16,16);h.writeUInt16LE(1,20);h.writeUInt16LE(1,22);h.writeUInt32LE(24000,24);h.writeUInt32LE(48000,28);h.writeUInt16LE(2,32);h.writeUInt16LE(16,34);h.write('data',36);h.writeUInt32LE(pcm.length,40);await fs.writeFile(`${dir}/output.wav`,Buffer.concat([h,pcm]));lines.close();}})().catch(e=>log('driver_error',{message:e.message}));});
