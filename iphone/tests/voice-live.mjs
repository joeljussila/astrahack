// Live Realtime + Astra + actual isolated renderer. Text input replaces a microphone;
// generated audio is saved for verification. Production LiveVoice handles the events.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import ts from 'typescript';
import {WebSocket,WebSocketServer} from 'ws';
import {createPartner} from '../native/model.mjs';
import {voiceSession,voiceModel} from '../native/realtime.mjs';
const wss=new WebSocketServer({host:'127.0.0.1',port:4312});let renderer,sequence=0;const pending=new Map();
wss.on('connection',(ws,req)=>{if(req.headers.origin!=='http://127.0.0.1:3010'){ws.close();return;}renderer=ws;ws.on('message',raw=>{const m=JSON.parse(raw),p=pending.get(m.id);if(p){clearTimeout(p.timer);pending.delete(m.id);m.error?p.reject(Error(m.error)):p.resolve(m.result);}});});
const command=data=>new Promise((resolve,reject)=>{const id=++sequence,timer=setTimeout(()=>reject(Error('Renderer timeout')),20000);pending.set(id,{resolve,reject,timer});renderer.send(JSON.stringify({id,...data}));});
console.log('Reload isolated validation canvas');while(!renderer)await new Promise(r=>setTimeout(r,100));await new Promise(r=>setTimeout(r,1000));await command({action:'reset'});
const code=ts.transpileModule(await fs.readFile('lib/voice.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
const {LiveVoice}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
const start=Date.now(),records=[],audio=[],encoder=new TextEncoder();let firstAudio=null,firstEdit=null,workFinished=null,toolStarted=null;
const log=(kind,data={})=>{const item={kind,ms:Date.now()-start,...data};records.push(item);console.log(JSON.stringify(item));};
const partner=createPartner({event:(role,text)=>log(role,{text}),tool:async(name,args)=>{const result=await command({action:name==='inspect'?'inspect':name==='view'?'image':'edit',...args});if(name==='canvas'){if(firstEdit===null)firstEdit=Date.now()-start;log('visible_edit');}return result;}});
const originalFetch=globalThis.fetch;
globalThis.fetch=async(url,options)=>{
 if(url!=='/voice/tool')return originalFetch(url,options);
 const body=JSON.parse(options.body);toolStarted=Date.now()-start;log('voice_tool',{name:body.name,request:body.arguments.request});
 return new Response(new ReadableStream({start(controller){
  const write=value=>controller.enqueue(encoder.encode(JSON.stringify(value)+'\n'));
  write({type:'started'});
  partner.run(body.arguments.request,'canvas',update=>{log('progress',update);write({type:'progress',...update});},{expectEdit:true}).then(result=>{workFinished=Date.now()-start;write({type:'complete',result});controller.close();}).catch(error=>{write({type:'complete',result:{error:error.message}});controller.close();});
 }}),{headers:{'content-type':'application/x-ndjson'}});
};
const client=new LiveVoice('test',s=>log('status',{text:s}),s=>log('speech',{text:s}),()=>{throw Error('Speech must not cancel drawing');});
const ws=new WebSocket(`wss://api.openai.com/v1/realtime?model=${voiceModel}`,{headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`}});
client.dc={readyState:'open',send:value=>ws.send(value),close:()=>{}};
let ready=false,finish;const done=new Promise(resolve=>finish=resolve);const timer=setTimeout(()=>finish('timeout'),55000);
ws.on('open',()=>ws.send(JSON.stringify({type:'session.update',session:voiceSession('canvas')})));
ws.on('message',async raw=>{
 const e=JSON.parse(raw);
 if(e.type==='session.updated'&&!ready){ready=true;log('ready');ws.send(JSON.stringify({type:'conversation.item.create',item:{type:'message',role:'user',content:[{type:'input_text',text:'Draw a backend server connected to three GPU racks. Label the racks GPU Rack 1, GPU Rack 2, and GPU Rack 3. Keep the diagram neatly aligned.'}]}}));ws.send(JSON.stringify({type:'response.create'}));}
 if(e.type==='response.output_audio.delta'){if(firstAudio===null){firstAudio=Date.now()-start;log('first_audio');}audio.push(Buffer.from(e.delta,'base64'));}
 if(e.type==='error')log('api_error',{error:e.error?.message});
 await client.event(e,0).catch(error=>log('client_error',{error:error.message}));
 if(e.type==='response.done'&&workFinished!==null&&!e.response.metadata?.purpose){finish('completed');}
});
const outcome=await done;clearTimeout(timer);client.stop();ws.close();
const view=await command({action:'image'});await fs.writeFile('../excalidraw/validation/partner-voice.png',Buffer.from(view.image.split(',')[1],'base64'));
const pcm=Buffer.concat(audio),header=Buffer.alloc(44);header.write('RIFF');header.writeUInt32LE(36+pcm.length,4);header.write('WAVE',8);header.write('fmt ',12);header.writeUInt32LE(16,16);header.writeUInt16LE(1,20);header.writeUInt16LE(1,22);header.writeUInt32LE(24000,24);header.writeUInt32LE(48000,28);header.writeUInt16LE(2,32);header.writeUInt16LE(16,34);header.write('data',36);header.writeUInt32LE(pcm.length,40);await fs.writeFile('validation/partner-voice.wav',Buffer.concat([header,pcm]));
const result={outcome,firstAudioMs:firstAudio,toolStartedMs:toolStarted,firstVisibleEditMs:firstEdit,workFinishedMs:workFinished,audioBytes:pcm.length,records};await fs.writeFile('validation/voice-benchmark.json',JSON.stringify(result,null,2));console.log(JSON.stringify({...result,records:undefined}));
for(const ws of wss.clients)ws.close();wss.close();assert.equal(outcome,'completed');assert(firstAudio<firstEdit);assert(pcm.length>1000);assert(!records.some(r=>r.kind==='api_error'||r.kind==='client_error'));
assert(records.some(r=>r.kind==='speech'&&r.ms>firstEdit&&r.ms<workFinished),'Speech must continue while the visible design is being checked');
assert(!records.some(r=>r.kind==='speech'&&/excalidraw/i.test(r.text)),'Narration should describe design content');
