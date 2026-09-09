// Opt-in live integration rehearsal. Uses the configured API, adds one shark, then
// restores the original scene. Does not test physical iPhone sensors or audio.
import {writeFile} from 'node:fs/promises';
const root='http://127.0.0.1:4173',b=await fetch(root+'/bootstrap').then(r=>r.json());
if(b.status.working||!b.status.configured)throw Error('Needs an idle configured display.');
const headers={Authorization:'Bearer '+b.token,'Content-Type':'application/json'};
const post=async(path,data={})=>{const r=await fetch(root+path,{method:'POST',headers,body:JSON.stringify(data)});const d=await r.json();if(!r.ok)throw Error(d.error);return d;};
await post('/api/reload-runtime');
const start=Date.now(),events=[],abort=new AbortController();let external=false,ownRequests=[];
const stream=await fetch(root+'/events?token='+b.token,{signal:abort.signal});
const reader=stream.body.getReader(),decoder=new TextDecoder();let buf='';
const reading=(async()=>{try{for(;;){const {value,done}=await reader.read();if(done)break;buf+=decoder.decode(value,{stream:true});let end;while((end=buf.indexOf('\n\n'))>=0){const block=buf.slice(0,end);buf=buf.slice(end+2);for(const line of block.split('\n'))if(line.startsWith('data: ')){const e=JSON.parse(line.slice(6));events.push({...e,receivedMs:Date.now()-start});if(e.type==='user'&&!ownRequests.some(r=>e.text.startsWith(r)))external=true;if(['point_resolved','error'].includes(e.type)||e.type==='timing'&&['geometry_committed','response_finished'].includes(e.event))console.log(JSON.stringify({type:e.type,event:e.event,text:e.text,world:e.world,objectId:e.objectId,ms:Date.now()-start}));}}}}catch(e){if(!abort.signal.aborted)throw e;}})();
async function until(fn,ms=120000){const end=Date.now()+ms;while(Date.now()<end){const found=events.find(fn);if(found)return found;await new Promise(r=>setTimeout(r,150));}throw Error('Timed out waiting for integration event.');}
let submitted=false;
try{
 const point={session:'live-point-test',seq:Date.now(),x:.80,y:.66,capture:true};
 await post('/voice/tool',{name:'edit_workspace',arguments:{request:'[SILTA_POINTER_V1]\n'+JSON.stringify(point)}});
 const resolved=await until(e=>e.type==='point_resolved'&&e.seq===point.seq,8000);if(resolved.objectId)throw Error('Test point must be empty ground.');
 const request='Add a recognizable 3-meter shark here, floating 1.5 meters above this pointed ground location: tapered curved body, dorsal fin, pectoral fins and a forked tail. This is a local pointing rehearsal. Preserve every existing building, deck and ground object. Publish its silhouette then refine the fins and inspect it. Do not create another building.';
 ownRequests.push(request);submitted=true;await post('/voice/tool',{name:'edit_workspace',arguments:{request:'[SILTA_SPATIAL_EDIT_V1]\n'+JSON.stringify({request,point})}});
 await until(e=>e.type==='timing'&&e.event==='geometry_committed');
 const correction='Change the shark to deep blue with a pale underside. Preserve its pointed location and finish its fins and tail. Keep all existing architecture unchanged.';ownRequests.push(correction);await post('/voice/tool',{name:'edit_workspace',arguments:{request:correction}});
 const documentStart=Date.now();await post('/voice/tool',{name:'edit_workspace',arguments:{request:'[SILTA_DOCUMENT_V1]\n'+JSON.stringify({action:'create',kind:'cost',delivery:'download',recipient:null,request:'Give a materials-only estimate PDF for the existing residential building in Finland if its floor area were hypothetically 100 m2. Exclude the decorative shark. Show quantities, rates, totals and exclusions. This hypothetical area is not a model edit.'})}});
 const doc=await until(e=>e.type==='assistant'&&e.document?.downloaded,75000);console.log(JSON.stringify({download:doc.document.filename,downloadMs:Date.now()-documentStart}));
 await until(e=>e.type==='timing'&&e.event==='response_finished',240000);
 const s=await fetch(root+'/bootstrap').then(r=>r.json());const added=s.scene.objects.filter(o=>!b.scene.objects.some(old=>old.id===o.id));
 console.log(JSON.stringify({completed:true,objects:s.scene.objects.length,added:added.map(o=>({name:o.name,position:o.position})),elapsedMs:Date.now()-start}));
 await writeFile(new URL('../runtime/live-pointing-result.json',import.meta.url),JSON.stringify({point:resolved,document:doc.document,original:b.scene,final:s.scene,events},null,2));
 // Give the manual browser check time to see the actual geometry; restoration is a separate explicit step.
 console.log('Scene preserved for visual inspection; run Undo twice afterward to restore the pre-test scene.');
}finally{abort.abort();await reading; if(external)console.log('Another user request arrived; do not automatically undo their work.');}
