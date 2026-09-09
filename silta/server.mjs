import http from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {randomBytes,timingSafeEqual} from 'node:crypto';
import path from 'node:path';
import {SceneStore,measure} from './scene-store.mjs';
import {BlenderBridge,artifactRoot} from './blender-bridge.mjs';
import {AstraSession} from './astra.mjs';
import {createVoiceCall} from './voice-session.mjs';
const port=Number(process.env.PORT||4173),origin=`http://127.0.0.1:${port}`;
let key=process.env.OPENAI_API_KEY||'',voiceState='disconnected';
await mkdir(artifactRoot,{recursive:true});
const pairingFile=path.join(artifactRoot,'pairing-token');
let token;try{token=(await readFile(pairingFile,'utf8')).trim();if(!/^[0-9a-f]{64}$/.test(token))throw Error('Invalid pairing');}catch{token=randomBytes(32).toString('hex');await writeFile(pairingFile,token,{mode:0o600});}
const clients=new Set(),history=[];
export const store=new SceneStore(),blender=new BlenderBridge(store);let working=false,phoneCount=0;
function emit(e){if(e.type==='activity')working=e.working;if(e.type==='voice')voiceState=e.state;if(['user','assistant','task','error','timing','progress'].includes(e.type)){history.push({...e,at:e.at||Date.now()});if(history.length>300)history.shift();}for(const c of clients)c.res.write(`data: ${JSON.stringify(e)}\n\n`);}
let astra=new AstraSession({store,blender,key:()=>key,emit});
if(process.env.SILTA_RECOVER==='1'){const saved=JSON.parse(await readFile(path.join(artifactRoot,'restart-scene.json'),'utf8'));if(saved.asset&&/^[0-9a-f-]{36}$/.test(saved.asset)){await readFile(path.join(artifactRoot,saved.asset,'scene.blend'));store.commit({revision:store.revision,objects:saved.objects,asset:saved.asset},store.epoch);store.selection=saved.selection;blender.approved.add(saved.asset);}}
const status=()=>({configured:!!key,working,phoneCount,voiceState,checks:measure(store.snapshot()),engine:'blender',reasoningEffort:'low',requestedServiceTier:'priority'});
const same=s=>typeof s==='string'&&Buffer.byteLength(s)===Buffer.byteLength(token)&&timingSafeEqual(Buffer.from(s),Buffer.from(token));
const json=(r,d,c=200)=>{r.writeHead(c,{'Content-Type':'application/json','Cache-Control':'no-store'});r.end(JSON.stringify(d));};
const files=new Map([['/','index.html'],['/phone','phone.html'],...['app.mjs','style.css','phone.mjs','voice-client.mjs'].map(x=>['/'+x,x]),['/three','../node_modules/three/build/three.module.js'],['/three-core','../node_modules/three/build/three.core.js'],['/orbit','../node_modules/three/examples/jsm/controls/OrbitControls.js'],['/gltf','../node_modules/three/examples/jsm/loaders/GLTFLoader.js'],['/utils/BufferGeometryUtils.js','../node_modules/three/examples/jsm/utils/BufferGeometryUtils.js']]);
export const server=http.createServer(async(req,res)=>{
 res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Content-Type-Options','nosniff');
 try{
  const url=new URL(req.url,origin),local=['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress)&&[`127.0.0.1:${port}`,`localhost:${port}`].includes(req.headers.host);
  if(req.headers.origin&&![origin,`http://localhost:${port}`].includes(req.headers.origin))return json(res,{error:'Origin not allowed.'},403);
  if(req.method==='GET'&&url.pathname==='/bootstrap'){if(!local)return json(res,{error:'Pair from the local display.'},403);return json(res,{token,status:status(),scene:store.snapshot()});}
  const auth=same(req.headers.authorization?.replace(/^Bearer /,''))||same(url.searchParams.get('token'));
  if(url.pathname==='/events'){
   if(!auth)return json(res,{error:'Pair again from settings.'},401);const c={res,phone:url.searchParams.get('phone')==='1'};clients.add(c);if(c.phone)phoneCount++;
   res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-store','Connection':'keep-alive'});res.write(`data: ${JSON.stringify({type:'snapshot',scene:store.snapshot(),status:status()})}\n\n`);emit({type:'connection',status:status()});
   const heartbeat=setInterval(()=>res.write(': keepalive\n\n'),20000);req.on('close',()=>{clearInterval(heartbeat);clients.delete(c);if(c.phone)phoneCount--;emit({type:'connection',status:status()});});return;
  }
  if(url.pathname.startsWith('/artifacts/')){
   if(!auth)return json(res,{error:'Unauthorized'},401);const match=url.pathname.match(/^\/artifacts\/([0-9a-f-]{36})\/(scene\.glb|scene\.blend|preview\.png|plan\.svg)$/);
   if(!match||!blender.approved.has(match[1]))return json(res,{error:'Artifact not available'},404);
   const type={'glb':'model/gltf-binary','blend':'application/octet-stream','png':'image/png','svg':'image/svg+xml'}[match[2].split('.').pop()];res.writeHead(200,{'Content-Type':type,'Cache-Control':'no-store',...(match[2].endsWith('.blend')?{'Content-Disposition':'attachment; filename="SILTAdesign.blend"'}:{})});return res.end(await readFile(path.join(artifactRoot,match[1],match[2])));
  }
  if(url.pathname.startsWith('/api/')||url.pathname.startsWith('/voice/')){
   if(!auth)return json(res,{error:'Pair again from settings.'},401);
   if(req.method==='GET'&&url.pathname==='/api/status')return json(res,{...status(),scene:store.snapshot(),blenderAvailable:await blender.available()});
   if(req.method==='GET'&&url.pathname==='/api/history')return json(res,history);
   if(req.method!=='POST')return json(res,{error:'Use POST'},405);
   let body='';for await(const chunk of req){body+=chunk;if(body.length>150000)throw Error('Request too large');}
   if(url.pathname==='/voice/session'){const answer=await createVoiceCall(body,key);res.writeHead(200,{'Content-Type':'application/sdp'});return res.end(answer);}
   const d=JSON.parse(body||'{}');
   switch(url.pathname){
    case '/api/reload-runtime':{if(!local)return json(res,{error:'Local maintenance only'},403);const {AstraSession:UpdatedSession}=await import('./astra.mjs?update='+Date.now());astra.stop(false);astra=new UpdatedSession({store,blender,key:()=>key,emit});emit({type:'connection',status:status()});return json(res,{reloaded:true});}
    case '/api/connect':if(!local)return json(res,{error:'Configure on local display'},403);if(typeof d.key!=='string'||d.key.length<10)throw Error('Enter your API key');astra.stop(false);key=d.key.trim();emit({type:'connection',status:status()});return json(res,{configured:true});
    case '/api/ask':if(!await blender.available())throw Error('Blender backend is not installed.');await astra.ask(d.text);return json(res,{accepted:true});
    case '/api/select':if(d.id!==null&&!store.objects.some(o=>o.id===d.id))throw Error('Object no longer exists');store.selection=d.id;emit({type:'scene',scene:store.snapshot()});return json(res,{selected:d.id});
    case '/api/stop':astra.stop();return json(res,{stopped:true});
    case '/api/undo':astra.stop(false);emit({type:'scene',scene:store.undo()});emit({type:'notice',text:'Previous design restored.'});return json(res,{undone:true});
    case '/api/clear':astra.stop(false);astra.brief=[];emit({type:'scene',scene:store.clear()});emit({type:'notice',text:'A new space. Start with an idea.'});return json(res,{cleared:true});
    case '/voice/state':emit({type:'voice',state:d.state});return json(res,{ok:true});
    case '/voice/transcript':emit({type:'transcript',text:String(d.text||'').slice(0,8000)});return json(res,{ok:true});
    case '/voice/tool':if(d.name==='edit_workspace'){await astra.ask(d.arguments?.request);return json(res,{accepted:true,status:'Design work is underway. Do not claim it is finished.'});}if(d.name==='stop_edit'){astra.stop();return json(res,{stopped:true});}if(d.name==='undo_edit'){astra.stop(false);emit({type:'scene',scene:store.undo()});return json(res,{undone:true});}throw Error('Unknown voice tool');
    default:return json(res,{error:'Not found'},404);
   }
  }
  const file=files.get(url.pathname);if(!file||req.method!=='GET')return json(res,{error:'Not found'},404);const content=await readFile(new URL(file,import.meta.url));res.writeHead(200,{'Content-Type':file.endsWith('.html')?'text/html':file.endsWith('.css')?'text/css':'text/javascript','Cache-Control':'no-store'});res.end(content);
 }catch(e){json(res,{error:String(e.message).replace(/sk-[\w.*-]+/g,'[redacted]').slice(0,800)},400);}
});
server.listen(port,'127.0.0.1',()=>console.log(`SILTAdesign: ${origin}; API ${key?'configured':'not configured'}`));
