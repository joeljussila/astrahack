// Explicit live API benchmark on an isolated Excalidraw tab.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {WebSocketServer} from 'ws';
import {createPartner as current} from '../native/model.mjs';
import {createPartner as baseline} from '../validation/model-before.mjs';
import {sceneContext} from '../native/scene-context.mjs';
const wss=new WebSocketServer({host:'127.0.0.1',port:4312});
let ws,next=0;const pending=new Map();
wss.on('connection',(socket,req)=>{if(req.headers.origin!=='http://127.0.0.1:3010'){socket.close();return;}ws=socket;socket.on('message',raw=>{const m=JSON.parse(raw),p=pending.get(m.id);if(p){pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Error(m.error)):p.resolve(m.result);}});});
const command=data=>new Promise((resolve,reject)=>{const id=++next,timer=setTimeout(()=>{pending.delete(id);reject(Error('Validation canvas timed out'))},20000);pending.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,...data}));});
console.log('Open http://127.0.0.1:3010/validation/partner.html');
while(!ws)await new Promise(r=>setTimeout(r,100));
await new Promise(r=>setTimeout(r,1500));
let s=await command({action:'reset'});
s=await command({action:'edit',revision:s.revision,add:[{id:'a',type:'rectangle',x:0,y:0,width:220,height:80,label:{text:'Backend'}},{id:'b',type:'rectangle',x:0,y:230,width:220,height:80,label:{text:'GPU'}}]});
s=await command({action:'edit',revision:s.revision,add:[{id:'ab',type:'arrow',start:{id:'a'},end:{id:'b'}}]});
let arrow=s.elements.find(e=>e.id==='ab');assert.equal(arrow.startBinding.elementId,'a');assert.equal(arrow.endBinding.elementId,'b');assert.equal(arrow.points.at(-1)[0],0);assert(arrow.points.at(-1)[1]>0);
s=await command({action:'edit',revision:s.revision,patch:[{id:'b',x:400,label:{text:'GPU workers'}}]});arrow=s.elements.find(e=>e.id==='ab');assert(arrow.points.at(-1)[0]>300);assert(s.elements.some(e=>e.containerId==='b'&&e.text==='GPU workers'));
console.log('PASS actual renderer: cross-batch bindings, rerouting after movement, label updates');
const request='Draw a clear architecture diagram of a realtime AI app: Browser connects to a Load Balancer, then an API service. The API submits jobs to a Queue, which feeds GPU workers. Label the Browser to Load Balancer connection WebSocket. Keep it simple and readable.';
const summary=[];
for(const [name,factory] of [['before',baseline],['after',current]]){
 await command({action:'reset',legacy:name==='before'});
 const start=Date.now(),samples=[],toolCalls=[];let firstEdit=null;
 const partner=factory({event:(role,text)=>console.log(name,Date.now()-start,role,text.slice(0,160)),metric:s=>samples.push(s),tool:async(name,args)=>{
   toolCalls.push(name);const result=await command({action:name==='inspect'?'inspect':name==='view'?'image':'edit',...args});
   if(name==='canvas'&&firstEdit===null)firstEdit=Date.now()-start;return result;
 }});
 try{
  await partner.run(request,'canvas');
  const scene=await command({action:'inspect'}),view=await command({action:'image'});
  await fs.writeFile(`../excalidraw/validation/partner-${name}.png`,Buffer.from(view.image.split(',')[1],'base64'));
  await fs.writeFile(`../excalidraw/validation/partner-${name}.excalidraw`,JSON.stringify({type:'excalidraw',version:2,elements:scene.elements,appState:{viewBackgroundColor:'#fcfbf8'},files:{}}));
  summary.push({name,firstVisibleEditMs:firstEdit,totalMs:Date.now()-start,toolCalls,samples,elementCount:scene.elements.length,labels:scene.elements.filter(e=>e.type==='text').map(e=>e.text)});
 }catch(e){summary.push({name,error:e.message,firstVisibleEditMs:firstEdit,totalMs:Date.now()-start,toolCalls,samples});}
}
const original=JSON.parse(await fs.readFile('../excalidraw/validation/partner-before.json','utf8'));
summary.push({contextBytesBefore:JSON.stringify(original).length,contextBytesAfter:JSON.stringify(sceneContext(original)).length});
await fs.writeFile('validation/partner-benchmark.json',JSON.stringify(summary,null,2));console.log(JSON.stringify(summary.map(({samples,...s})=>s),null,2));
for(const client of wss.clients)client.close();wss.close();
