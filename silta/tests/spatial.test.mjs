import test from 'node:test';
import assert from 'node:assert/strict';
import {SpatialContext,POINTER_PREFIX,RESOLVED_PREFIX,SPATIAL_EDIT_PREFIX} from '../spatial.mjs';
import {frame,aim,Smooth,VoiceCall,routeVoiceTool,MarkedTarget} from '../voice-client.mjs';
import {SceneStore} from '../scene-store.mjs';
import {AstraSession} from '../astra.mjs';
const tick=()=>new Promise(r=>setImmediate(r));
const point={session:'test-phone-123',seq:1,x:.6,y:.55,capture:true};
test('an explicit mark survives later motion, delayed speech, and ignores old acknowledgments',()=>{
 let now=100;const mark=new MarkedTarget(()=>now);mark.mark(point);assert.equal(mark.resolve({...point,world:[3,0,4]}),true);
 now+=90000;assert.deepEqual(mark.reference(),{session:point.session,seq:1});
 mark.mark({...point,seq:5});assert.equal(mark.resolve(point),false);assert.equal(mark.confirmed,false);assert.equal(mark.reference().seq,5);
 now+=10001;assert.equal(mark.reference(),null);
});
test('missed marks clear and confirmed marks have a bounded lifetime',()=>{
 let now=0;const mark=new MarkedTarget(()=>now);mark.mark(point);mark.resolve({...point,miss:true});assert.equal(mark.reference(),null);
 mark.mark(point);mark.resolve(point);now=600001;assert.equal(mark.reference(),null);
});
test('explicit marks survive over a minute and recenter clears their server references',async()=>{
 const store=new SceneStore(),events=[],p=new SpatialContext(store,e=>events.push(e));p.move({...point,pinned:true});p.resolve({...point,revision:0,asset:null,world:[4,0,2],objectId:null});
 p.points.values().next().value.at-=120000;p.prune();assert.deepEqual((await p.context(point)).browserWorld,[4,0,2]);
 p.move({...point,seq:2,capture:false,clearMark:true});assert.equal(p.points.size,0);assert.equal(events.at(-1).type,'point_cleared');
});
test('ported iPhone calibration handles wraparound, roll, reverse direction and smoothing',()=>{
 const base=frame({alpha:359,beta:30,gamma:0});const zero=aim({alpha:359,beta:30,gamma:0},base);assert.ok(Math.abs(zero.x)<1e-10&&Math.abs(zero.y)<1e-10);
 assert.ok(Math.abs(aim({alpha:1,beta:30,gamma:0},base).x)<.04);
 const rolled=aim({alpha:359,beta:30,gamma:90},base);assert.ok(Math.abs(rolled.x)<1e-10&&Math.abs(rolled.y)<1e-10);
 assert.equal(aim({alpha:180,beta:0,gamma:0},frame({alpha:0,beta:0,gamma:0})),null);
 const f=new Smooth();assert.equal(f.update(.5,0),.5);assert.ok(f.update(.8,16)<.8);f.reset();assert.equal(f.update(.2,32),.2);
});
test('pointing preserves revisions and undo; ground captures survive later pointer movement',async()=>{
 const store=new SceneStore(),events=[],p=new SpatialContext(store,e=>events.push(e));const before=store.snapshot();p.move(point);p.resolve({...point,revision:0,asset:null,world:[10,0,-6],objectId:null});
 p.move({...point,seq:2,x:.1,capture:false});assert.deepEqual(store.snapshot(),before);const c=await p.context(point);assert.deepEqual(c.blenderWorld,[10,6,0]);assert.equal(c.basis,'ground plane at Blender Z=0');assert.equal(p.points.size,1);
});
test('stale render resolutions and removed objects are rejected',async()=>{
 const store=new SceneStore();store.objects=[{id:'door'}];const p=new SpatialContext(store,()=>{});p.move(point);store.begin();assert.throws(()=>p.resolve({...point,revision:0,asset:null,world:[1,2,3],objectId:'door'}),/outdated/);
 p.resolve({...point,revision:store.revision,asset:null,world:[1,2,3],objectId:'door'});store.objects=[];await assert.rejects(p.context(point),/removed/);
});
test('invalid, missed and expired points cannot become locations',async()=>{
 const store=new SceneStore(),p=new SpatialContext(store,()=>{});assert.throws(()=>p.move({...point,x:NaN}),/Invalid/);p.move(point);p.resolve({...point,revision:0,asset:null,miss:true});await assert.rejects(p.context(point),/misses/);p.points.values().next().value.at-=61000;await assert.rejects(p.context(point),/not confirmed/);
});
test('voice pins the target to its response even after a later speech turn',async()=>{
 let seq=0;const requests=[];const c=new VoiceCall({api:async(path,data)=>{requests.push({path,data});return{};},onSpeechStart:()=>({session:'test-phone-123',seq:++seq}),onState(){},onTranscript(){},onError(){}});c.dc={readyState:'open',send(){}};
 c.receive({type:'input_audio_buffer.speech_started'});c.receive({type:'response.created',response:{id:'first'}});c.receive({type:'input_audio_buffer.speech_started'});c.receive({type:'response.created',response:{id:'second'}});
 c.receive({type:'response.function_call_arguments.done',response_id:'first',call_id:'tool',name:'edit_workspace',arguments:JSON.stringify({request:'Add a shark here',use_point:true})});await tick();assert.equal(requests.find(x=>x.path==='/voice/tool').data.point.seq,1);
 const routed=routeVoiceTool(requests.find(x=>x.path==='/voice/tool').data);assert.ok(routed.arguments.request.startsWith(SPATIAL_EDIT_PREFIX));assert.throws(()=>routeVoiceTool({name:'edit_workspace',arguments:{request:'Here',use_point:true}}),/not ready/);
});
test('point observations stay outside edits; spatial steering retains location and earlier work',async()=>{
 const store=new SceneStore(),sent=[],a=new AstraSession({store,blender:{},key:()=> 'test',emit(){}});a.socket={readyState:1,send:s=>sent.push(JSON.parse(s)),close(){}};
 await a.ask(POINTER_PREFIX+JSON.stringify(point));await a.ask(RESOLVED_PREFIX+JSON.stringify({...point,revision:0,asset:null,world:[10,0,-6],objectId:null}));assert.equal(store.checkpoints.length,0);assert.equal(sent.length,0);
 await a.ask('Build a terraced city');a.receive({type:'response.created',response:{id:'design'}});await a.ask(SPATIAL_EDIT_PREFIX+JSON.stringify({request:'Add a shark here',point}));assert.equal(sent.at(-1).type,'response.steer');assert.match(sent.at(-1).input,/blenderWorld.*10,6,0/);assert.equal(store.checkpoints.length,2);a.stop(false);
});
test('complex designs can continue beyond the old 24-round limit with a finite safety bound',()=>{
 const store=new SceneStore(),sent=[],a=new AstraSession({store,blender:{},key:()=> 'test',emit(){}});a.socket={readyState:1,send:s=>sent.push(JSON.parse(s)),close(){}};a.rounds=24;a.create([]);assert.equal(sent.length,1);assert.equal(a.generating,true);a.rounds=96;a.create([]);assert.equal(a.generating,false);
});
