import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {DisplaySync} from '../display-sync.mjs';
import {readFile} from 'node:fs/promises';
import {SceneStore,measure} from '../scene-store.mjs';
import {BlenderBridge} from '../blender-bridge.mjs';
import {AstraSession,tools,safeError,publicError} from '../astra.mjs';
import {ConversationGate,VoiceCall,routeVoiceTool,QUESTION_PREFIX} from '../voice-client.mjs';
import {voiceSession} from '../voice-session.mjs';
const tick=()=>new Promise(r=>setImmediate(r));
function agentFixture(){const store=new SceneStore(),events=[],sent=[];const a=new AstraSession({store,blender:{},key:()=> 'test-key',emit:e=>events.push(e)});a.socket={readyState:1,send:s=>sent.push(JSON.parse(s)),close(){}};return {store,a,events,sent};}
function voiceFixture(){const sent=[],requests=[],errors=[];const c=new VoiceCall({api:async(p,d)=>{requests.push({p,d});return{};},onState(){},onTranscript(){},onError:e=>errors.push(e)});c.dc={readyState:'open',send:s=>sent.push(JSON.parse(s))};return {c,sent,requests,errors};}
const answerResponse=(answer,basis='hypothetical')=>({ok:true,json:async()=>({service_tier:'fast',output:[{content:[{type:'output_text',text:JSON.stringify({answer,basis,sourceIds:[]})}]}]})});
test('idle design socket expiry does not cancel a separate question',async()=>{
 class Socket extends EventEmitter{constructor(){super();this.readyState=0;queueMicrotask(()=>{this.readyState=1;this.emit('open');});}close(){}send(){}}
 const store=new SceneStore(),events=[];let release;
 const a=new AstraSession({store,blender:{},key:()=> 'test-key',emit:e=>events.push(e),Socket,request:()=>new Promise(r=>release=r)});
 await a.connect();const epoch=store.epoch;await a.ask(QUESTION_PREFIX+'What would this cost?');a.socket.emit('close');
 assert.equal(store.epoch,epoch);release(answerResponse('Independent answer'));await tick();assert.ok(events.some(e=>e.question&&e.text==='Independent answer'));
});
test('ending the call leaves an already submitted edit running',async()=>{
 const {c,requests}=voiceFixture();let release,completed=false;c.dc.close=()=>{};
 c.api=async(p,d)=>{requests.push({p,d});if(p==='/voice/tool'){await new Promise(r=>release=r);completed=true;}return{};};
 c.receive({type:'response.function_call_arguments.done',call_id:'edit',name:'edit_workspace',arguments:'{"request":"Build a cabin"}'});c.stop();release();await tick();
 assert.equal(completed,true);assert.deepEqual(requests.map(r=>r.p),['/voice/tool','/voice/state']);assert.equal(requests[0].d.name,'edit_workspace');assert.equal(c.pendingTools,0);
});
test('voice setup configures separate question and edit tools',()=>{
 const {c,sent}=voiceFixture();c.configure();assert.equal(sent[0].type,'session.update');assert.ok(sent[0].session.tools.some(t=>t.name==='ask_workspace'));assert.ok(voiceSession().tools.some(t=>t.name==='ask_workspace'));
 assert.deepEqual(routeVoiceTool({name:'ask_workspace',arguments:{question:'What if it were 100 m²?'}}),{name:'edit_workspace',arguments:{request:QUESTION_PREFIX+'What if it were 100 m²?'}});
});
test('a hypothetical cost answer does not steer or invalidate an active edit',async()=>{
 const {a,store,events,sent}=agentFixture();await a.ask('Build a Finnish cabin');a.receive({type:'response.created',response:{id:'build'}});let release;a.request=()=>new Promise(r=>release=r);
 const before=store.snapshot(),epoch=store.epoch,count=sent.length,brief=a.brief.slice();await a.ask(QUESTION_PREFIX+'Materials cost for a hypothetical 100 m²?');
 assert.deepEqual(store.snapshot(),before);assert.equal(store.epoch,epoch);assert.equal(sent.length,count);assert.deepEqual(a.brief,brief);assert.equal(a.generating,true);
 await a.ask('Make the walls blue');release(answerResponse('Illustrative allowance for the hypothetical 100 m².'));await tick();
 assert.ok(events.some(e=>e.question&&e.text.includes('100 m²')));assert.equal(a.generating,true);assert.equal(store.checkpoints.length,2);a.stop(false);
});
test('scene-dependent answers are recomputed once after a revision',async()=>{
 const {a,store,events}=agentFixture();let release,calls=0;a.request=()=>{calls++;return calls===1?new Promise(r=>release=r):Promise.resolve(answerResponse('Latest snapshot answer','scene'));};
 await a.ask(QUESTION_PREFIX+'What size is the current design?');store.begin();release(answerResponse('Old answer','scene'));await tick();await tick();
 assert.equal(calls,2);assert.ok(events.some(e=>e.question&&e.text==='Latest snapshot answer'&&e.revision===store.revision));assert.ok(!events.some(e=>e.text==='Old answer'));
});
test('late questions after clear or stop are suppressed',async()=>{
 const {a,events}=agentFixture();let release;a.request=()=>new Promise(r=>release=r);await a.ask(QUESTION_PREFIX+'Estimate this');a.stop(false);release(answerResponse('Old result'));await tick();assert.ok(!events.some(e=>e.question));
});
test('progress-only response resumes instead of silently finishing the brief',async()=>{
 const {a,sent,events}=agentFixture();await a.ask('Build');a.receive({type:'response.created',response:{id:'r'}});a.receive({type:'response.completed',response:{id:'r',output:[]}});
 assert.equal(sent.filter(e=>e.type==='response.create').length,2);assert.ok(!events.some(e=>e.event==='response_finished'));a.stop(false);
});
test('finish requires a published edit and the current render',async()=>{
 const {a,store}=agentFixture();await a.ask('Build');a.receive({type:'response.created',response:{id:'r'}});a.dispatch(call('finish_design',{revision:store.revision,status:'complete',summary:'Done'},'finish'),'r');await tick();assert.match(a.ready[0].output,/Finish the requested geometry/);a.stop(false);
});
const call=(name,args,id)=>({type:'function_call',name,call_id:id,arguments:JSON.stringify(args)});
test('spoken checkpoint waits for the display and rejects old or duplicate acknowledgments',()=>{
 const store={asset:'first',revision:1},events=[],sync=new DisplaySync(store,e=>events.push(e));sync.publish(store,'The walls');assert.equal(events.length,0);
 assert.throws(()=>sync.acknowledge({asset:'first',revision:0}),/outdated/);assert.equal(events.length,0);
 sync.acknowledge({asset:'first',revision:1});sync.acknowledge({asset:'first',revision:1});assert.equal(events.length,1);assert.equal(events[0].text,'The walls');
 store.asset='next';store.revision=2;sync.publish(store,'The roof');assert.throws(()=>sync.acknowledge({asset:'first',revision:1}),/outdated/);assert.equal(events.length,1);
 sync.reset();sync.acknowledge({asset:'next',revision:2});assert.equal(events.length,1);
});
test('display acknowledgments do not become design requests or undo checkpoints',async()=>{
 const {a,store,events,sent}=agentFixture();store.asset='shown';a.displaySync.publish(store.snapshot(),'Walls now visible');const before=store.snapshot();
 await a.ask('[SILTA_DISPLAYED_V1]\n'+JSON.stringify({asset:'shown',revision:store.revision}));assert.deepEqual(store.snapshot(),before);assert.equal(sent.length,0);assert.equal(a.brief.length,0);assert.ok(events.some(e=>e.type==='display_visible'));
});
test('Blender diagnostics retain the cause for Astra and hide internals from the display',()=>{
 const raw='Blender edit failed; previous scene preserved. '+('trace '.repeat(100))+'\nSILTA_EDIT_ERROR '+JSON.stringify({type:'IndentationError',message:'unexpected indent',line:2,source:' defx=None'});
 const detail=safeError(Error(raw));assert.match(detail,/IndentationError: unexpected indent/);assert.match(detail,/line 2:  defx=None/);
 assert.equal(publicError(detail),'The generated edit had a code error. No changes were applied.');
 assert.equal(safeError(Error('Blender edit failed. Traceback\n File "C:\\private\\worker.py"\nTypeError: wrong dimensions')),'Blender edit failed: TypeError: wrong dimensions. No changes were published.');
});
test('three failed generated edits pause without leaking diagnostics or looping',async()=>{
 const {a,events}=agentFixture();await a.ask('Build');a.receive({type:'response.created',response:{id:'r'}});a.blender.edit=async()=>{throw Error('Blender edit failed. Traceback\nIndentationError: unexpected indent');};
 for(let i=0;i<3;i++){a.dispatch(call('edit_blender',{revision:a.store.revision,code:'bad'},'bad'+i),'r');await tick();}
 assert.equal(a.generating,false);assert.equal(a.jobs.size,0);assert.ok(events.some(e=>e.type==='error'&&e.text.includes('three times')));assert.ok(!events.some(e=>e.type==='progress'&&/Traceback|IndentationError/.test(e.text)));
});
test('actionable speech starts without a wake word',()=>{const g=new ConversationGate();assert.equal(g.accept('I want a house with a courtyard'),true);const {c,sent}=voiceFixture();c.receive({type:'conversation.item.input_audio_transcription.completed',transcript:'Make the roof lower'});assert.equal(sent.filter(e=>e.type==='response.create').length,1);});
test('uncertain transcription is visible but not submitted to design',()=>{const {c,sent,requests,errors}=voiceFixture();c.receive({type:'conversation.item.input_audio_transcription.completed',item_id:'noise',transcript:'random background words',logprobs:[{logprob:-3}]});assert.ok(requests.some(r=>r.p==='/voice/transcript'));assert.equal(sent.some(e=>e.type==='response.create'),false);assert.ok(sent.some(e=>e.type==='conversation.item.delete'));assert.equal(errors.length,1);});
test('voice interruptions do not cancel design and speech replies wait for tools',async()=>{const {c,sent,requests}=voiceFixture();c.gate.active=true;c.responding=true;c.receive({type:'input_audio_buffer.speech_started'});assert.equal(sent.at(-1).type,'response.cancel');assert.equal(requests.some(r=>r.p==='/voice/tool'),false);c.speaking=false;c.transcribing=false;c.responding=false;c.pendingTools=1;c.pendingReply=true;c.drain();assert.equal(sent.filter(e=>e.type==='response.create').length,0);c.pendingTools=0;c.drain();assert.equal(sent.at(-1).type,'response.create');});
test('voice has near-field filtering and no exact-word gate; cost tools removed',()=>{const s=voiceSession();assert.equal(s.audio.input.noise_reduction.type,'near_field');assert.equal(s.audio.input.turn_detection.threshold,.7);assert.ok(!tools.some(t=>/cost/.test(t.name)));assert.ok(tools.some(t=>t.name==='edit_blender'));assert.ok(tools.some(t=>t.name==='inspect_render'));});
test('two revisions during background review produce a stale result',async()=>{const {store,a,events}=agentFixture();let release;a.request=()=>new Promise(r=>release=r);await a.ask('Build a courtyard');a.receive({type:'response.created',response:{id:'r1'}});a.dispatch(call('review_layout',{question:'Check this observed access overlap'},'review'),'r1');await a.ask('Keep the market');await a.ask('Move the courtyard instead');release({ok:true,json:async()=>({output:[{content:[{type:'output_text',text:'Earlier snapshot proposal'}]}]})});await tick();assert.equal(JSON.parse(a.ready.find(o=>o.call_id==='review').output).stale,true);assert.ok(events.some(e=>e.state==='outdated'));a.stop(false);});
test('steering blocks an old edit even if it supplies the latest revision',async()=>{const {store,a,sent}=agentFixture();a.blender.edit=async(args,epoch)=>store.assertCurrent(args.revision,epoch);await a.ask('Build');a.receive({type:'response.created',response:{id:'r1'}});await a.ask('Preserve the market');assert.equal(sent.at(-1).type,'response.steer');a.dispatch(call('edit_blender',{revision:store.revision,code:'pass'},'old'),'r1');await tick();assert.match(a.ready.find(o=>o.call_id==='old').output,/changed/);});
test('queued render and review are rechecked before delivery',()=>{const {store,a}=agentFixture();a.ready=[{_revision:0,role:'user',content:[]},{type:'function_call_output',call_id:'r',output:JSON.stringify({revision:0,review:'old'})}];store.begin();const ready=a.takeReady();assert.equal(ready.length,1);assert.equal(JSON.parse(ready[0].output).stale,true);});
test('stop suppresses a review that finishes later',async()=>{const {a}=agentFixture();let release;a.request=()=>new Promise(r=>release=r);await a.ask('Build');a.receive({type:'response.created',response:{id:'r1'}});a.dispatch(call('review_layout',{question:'Check'},'review'),'r1');a.stop(false);release({ok:true,json:async()=>({output:[]})});await tick();assert.equal(a.ready.length,0);});
test('real Blender: geometry, plan, error recovery, collision, queue, stale result and undo',async t=>{
 const s=new SceneStore(),b=new BlenderBridge(s);assert.equal(await b.available(),true);s.begin();
 const first=await b.edit({revision:s.revision,code:await readFile(new URL('./architecture.py',import.meta.url),'utf8')},s.epoch);assert.equal(first.objects.length,80);assert.equal(measure(first).homes,2);assert.ok((await b.preview()).data.startsWith('iVBOR'));console.log('REAL BLENDER first geometry ms:',first.elapsedMs);
 const original=s.asset;const plan=await b.plan({revision:s.revision,cut_height:1.2},s.epoch);assert.ok(plan.segments>10);console.log('REAL BLENDER plan ms:',plan.elapsedMs,'segments:',plan.segments);
 await t.test('the actual failing phone edit returns its exact error without publishing',async()=>{const before=s.snapshot();await assert.rejects(b.edit({revision:s.revision,code:'import bpy\n defx=None'},s.epoch),e=>{assert.match(safeError(e),/IndentationError: unexpected indent/);assert.match(safeError(e),/line 2:  defx=None/);return true;});assert.deepEqual(s.snapshot(),before);});
 await t.test('partial Python failure does not publish any geometry',async()=>{const before=s.snapshot();await assert.rejects(b.edit({revision:s.revision,code:"bpy.ops.object.select_all(action='SELECT')\nbpy.ops.object.delete(use_global=False)\nraise ValueError('intentional test failure')"},s.epoch),/failed/);assert.deepEqual(s.snapshot(),before);});
 await t.test('concurrent writes are serialized and the second revision is rejected',async()=>{s.begin();const revision=s.revision,epoch=s.epoch;const results=await Promise.allSettled([b.edit({revision,code:"bpy.data.objects['TEST — clinic access'].location.y=0"},epoch),b.edit({revision,code:"bpy.data.objects['TEST — clinic access'].location.x=99"},epoch)]);assert.equal(results[0].status,'fulfilled');assert.equal(results[1].status,'rejected');assert.ok(measure(s.snapshot()).pathIntersections.length);});
 await t.test('request undo restores the exact prior Blender checkpoint',()=>{s.undo();assert.equal(s.asset,original);assert.equal(measure(s.snapshot()).pathIntersections.length,0);});
 await t.test('two user revisions during Blender execution invalidate its output',async()=>{const before=s.asset,rev=s.revision,epoch=s.epoch;const job=b.edit({revision:rev,code:"import time\ntime.sleep(.4)\nbpy.data.objects['TEST — clinic access'].location.y=0"},epoch);const pending=assert.rejects(job,/changed/);await new Promise(r=>setTimeout(r,150));s.begin();s.begin();await pending;assert.equal(s.asset,before);assert.equal(measure(s.snapshot()).pathIntersections.length,0);});
 await t.test('protected geometry rejects a completed conflicting edit',async()=>{const house=s.objects.find(o=>o.kind==='building');s.protect({revision:s.revision,id:house.id,protected:true},s.epoch);const before=s.asset;await assert.rejects(b.edit({revision:s.revision,code:"bpy.data.objects['TEST — courtyard house slab'].location.x+=1"},s.epoch),/protected/);assert.equal(s.asset,before);});
});
test('HTTP boundary blocks source and unpublished artifacts and keeps phone status read-only',async()=>{process.env.PORT='4177';const {server,store}=await import('../server.mjs');if(!server.listening)await new Promise(r=>server.once('listening',r));try{const base='http://127.0.0.1:4177',b=await fetch(base+'/bootstrap').then(r=>r.json());const headers={Authorization:'Bearer '+b.token};assert.equal((await fetch(base+'/astra.mjs')).status,404);assert.equal((await fetch(base+'/api/status')).status,401);assert.equal((await fetch(base+'/artifacts/00000000-0000-0000-0000-000000000000/scene.glb',{headers})).status,404);const revision=store.revision;await fetch(base+'/api/status',{headers});assert.equal(store.revision,revision);}finally{server.closeAllConnections();await new Promise(r=>server.close(r));}});
