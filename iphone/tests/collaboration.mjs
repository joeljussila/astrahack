import assert from 'node:assert/strict';import fs from 'node:fs/promises';import ts from 'typescript';
import {progressSpeech,sceneSubjects} from '../native/progress.mjs';
const load=async path=>import('data:text/javascript;base64,'+Buffer.from(ts.transpileModule(await fs.readFile(path,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText).toString('base64'));
const {LiveVoice}=await load('lib/voice.ts');const {recordAgentChanges,revertAgentChanges}=await load('../excalidraw/agent-history.ts');
const before=[{id:'table',type:'rectangle',x:0,y:0,width:460,height:210,index:'a0',backgroundColor:'brown'},{id:'chair-w',type:'rectangle',x:-90,y:60,width:50,height:50,index:'a1',roundness:{type:3}}];
const after=[{...before[0],type:'ellipse',x:80,width:300,height:300}];
const batch=recordAgentChanges(before,after),note={id:'human-note',type:'text',text:'Keep the door clear',x:700,y:0,index:'a2'};
const current=[{...after[0],backgroundColor:'orange'},note];const undone=revertAgentChanges(current,[batch]);
assert.equal(undone.find(e=>e.id==='table').width,460);assert.equal(undone.find(e=>e.id==='table').backgroundColor,'orange');assert.deepEqual(undone.find(e=>e.id==='chair-w').roundness,{type:3});assert.deepEqual(undone.find(e=>e.id===note.id),note);
assert.throws(()=>revertAgentChanges([{...after[0],width:310}],[batch]),/changed since/);assert.equal(after[0].width,300);
const scene={elements:[{id:'table',type:'ellipse',width:300,height:300},...Array.from({length:6},(_,i)=>({id:'chair-'+i,type:'rectangle'}))]};assert.equal(sceneSubjects(scene),'the round table and six chairs');assert(!progressSpeech('applied',scene).includes('four'));
function client(){const events=[];const c=new LiveVoice('test',()=>{},()=>{},()=>{});c.dc={readyState:'open',send:s=>events.push(JSON.parse(s)),close:()=>{}};return {c,events};}
const event=(c,type,extra={})=>c.event({type,...extra},0);
const invoke=(c,name,id)=>event(c,'response.function_call_arguments.done',{call_id:id,name,arguments:JSON.stringify(name==='edit_workspace'?{request:'Make two machines'}:{}),response_id:'r'});
{
 const {c,events}=client();globalThis.fetch=async()=>Response.json({status:'stopped',stopped:true});await event(c,'response.created',{response:{id:'r'}});await invoke(c,'stop_edit','stop');await event(c,'response.done',{response:{id:'r'}});
 assert.equal(events.at(-1).response.tool_choice,'auto','Stopping must allow a requested replacement edit');c.stop();
}
{
 const {c,events}=client();let complete;globalThis.fetch=async(_,options)=>JSON.parse(options.body).name==='inspect_workspace'?Response.json({status:'read_only',scene}):new Promise(r=>{complete=()=>r(Response.json({status:'applied',speech:'Two machines are in place.'}));});
 await event(c,'response.created',{response:{id:'r'}});const edit=invoke(c,'edit_workspace','edit');await event(c,'response.output_audio_transcript.done',{response_id:'r',transcript:'I’ll make two machines.'});await event(c,'response.done',{response:{id:'r'}});
 await event(c,'input_audio_buffer.speech_started');await event(c,'input_audio_buffer.speech_stopped');await event(c,'response.created',{response:{id:'r'}});await invoke(c,'inspect_workspace','inspect');await event(c,'response.done',{response:{id:'r'}});
 assert(events.some(e=>e.response?.instructions?.includes('Answer the most recent design question')),'A question must be answered while an earlier edit is pending');assert(c.activeEditPending);
 complete();await edit;c.stop();
}
{
 const {c,events}=client();globalThis.fetch=async()=>Response.json({status:'applied',speech:'Undid my last edit. The previous objects and positions are restored.'});await event(c,'response.created',{response:{id:'r'}});await invoke(c,'undo_workspace','undo');await event(c,'response.done',{response:{id:'r'}});
 assert.equal(events.at(-1).response.tool_choice,'none');assert(events.at(-1).response.instructions.includes('Say exactly this verified confirmation'));c.stop();
}
console.log('PASS correction continuation, questions during edits, exact Undo, newer human edits, conflict protection, and grounded chair counts');
