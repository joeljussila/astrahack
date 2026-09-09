// Opt-in live rehearsal: consumes API usage and replaces the local scene.
// Never runs in npm test. The previous scene is retained by Clear's undo checkpoint.
import {writeFile} from 'node:fs/promises';
const base='http://127.0.0.1:4173',b=await fetch(base+'/bootstrap').then(r=>r.json());
if(!b.status.configured||b.status.working)throw Error('Needs an idle, configured local server.');
const headers={Authorization:'Bearer '+b.token,'Content-Type':'application/json'};
const post=async(path,data={})=>{const r=await fetch(base+path,{method:'POST',headers,body:JSON.stringify(data)});const d=await r.json();if(!r.ok)throw Error(d.error);return d;};
await writeFile(new URL('../runtime/before-conversation-rehearsal.json',import.meta.url),JSON.stringify(b.scene));
await post('/api/reload-runtime');await post('/api/clear');
const events=[],times={},controller=new AbortController();let started,steered=false,finished=false;
const stream=await fetch(base+'/events',{headers,signal:controller.signal});
const watch=(async()=>{let pending='';try{for await(const raw of stream.body){pending+=new TextDecoder().decode(raw);let split;while((split=pending.indexOf('\n\n'))>=0){const line=pending.slice(0,split);pending=pending.slice(split+2);if(!line.startsWith('data: '))continue;const e=JSON.parse(line.slice(6));if(!started)continue;const ms=Date.now()-started;
 if(['timing','assistant','error','progress','task','voice'].includes(e.type)){events.push({...e,ms});if(e.type!=='progress')console.log(JSON.stringify({ms,...e}));}
 if(e.event==='geometry_committed'&&!steered){steered=true;times.firstGeometryMs=ms;void(async()=>{
  times.colorRequestedMs=Date.now()-started;await post('/voice/tool',{name:'edit_workspace',arguments:{request:'Change the exterior walls to muted blue. Keep the roof, cabin form and sauna, and finish the original cabin brief.'}});times.colorAcknowledgedMs=Date.now()-started;
  times.questionRequestedMs=Date.now()-started;await post('/voice/tool',{name:'edit_workspace',arguments:{request:'[SILTA_QUESTION_V1]\nFor this Finnish lakeside cabin, what would materials alone roughly cost if it were 100 square meters? This is a hypothetical estimate, not a resize request.'}});times.questionAcknowledgedMs=Date.now()-started;
  await post('/voice/state',{state:'disconnected'});times.hangupMs=Date.now()-started;
 })().catch(e=>console.error(e.message));}
 if(e.event==='question_answered')times.answerMs=ms;
 if(e.event==='geometry_committed'&&times.hangupMs!==undefined)times.geometryAfterHangupMs=ms;
 if(e.event==='response_finished'){times.designFinishedMs=ms;finished=true;}
 }}}catch(e){if(e.name!=='AbortError')throw e;}})();
started=Date.now();await post('/voice/tool',{name:'edit_workspace',arguments:{request:'Design a compact Finnish lakeside cabin with a pitched roof, large windows facing the lake, a sheltered timber terrace and an attached sauna. Start with the building form and roof, then finish a simple architectural concept with a few useful checkpoints.'}});times.initialAcknowledgmentMs=Date.now()-started;
while(Date.now()-started<150000&&!(finished&&times.answerMs!==undefined))await new Promise(r=>setTimeout(r,500));
controller.abort();await watch;const final=await fetch(base+'/api/status',{headers}).then(r=>r.json());
const result={times,finished,working:final.working,objects:final.scene.objects.length,revision:final.scene.revision,events};
await writeFile(new URL('../runtime/conversation-rehearsal.json',import.meta.url),JSON.stringify(result,null,2));console.log('REHEARSAL',JSON.stringify({...result,events:undefined}));
