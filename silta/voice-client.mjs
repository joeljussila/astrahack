export const QUESTION_PREFIX='[SILTA_QUESTION_V1]\n';
// Explicit marks outlive hand movement and unrelated spoken questions.
export class MarkedTarget {
 constructor(now=Date.now){this.now=now;this.clear();}
 clear(){this.point=null;this.confirmed=false;this.expires=0;}
 mark(p){this.point={session:p.session,seq:p.seq};this.confirmed=false;this.expires=this.now()+10000;return this.point;}
 matches(p){return this.point?.session===p.session&&this.point?.seq===p.seq;}
 resolve(p){if(!this.matches(p)||!this.reference())return false;if(p.miss){this.clear();return false;}this.confirmed=true;this.expires=this.now()+600000;return true;}
 reference(){if(this.now()>=this.expires)this.clear();return this.point?{...this.point}:null;}
}
export const VOICE_INSTRUCTIONS=`You are the voice partner in SILTAdesign. The user talks into a phone while a separate Astra builder works on a shared Blender canvas. There is no wake word. Immediately forward actionable design requests and corrections through edit_workspace, preserving their words, references and constraints. A short brief is enough to start. Preserve unusual settings and the full creative brief, without reducing it to a cabin or primitive template. Complex designs can develop over 5-10 minutes with visible checkpoints and mid-build corrections. There is no one-minute build deadline. Forward entrance, circulation, form and material changes with spatial references intact. Set edit_workspace use_point=true when the user says here, there or this spot while pointing; the host attaches the captured 3D location. Otherwise use_point=false. Do not invent coordinates. Pointing uses motion sensors. Motion sets an initial neutral orientation when enabled. Every tap on the green Mark spot orb marks the current cursor location; it never recentres. The confirmed TV marker remains the target even if the phone moves. Tell the user to tap Recenter pointer only to recalibrate, not to mark. Use the marked target for here/there references, never invent a location. New details refine the ongoing design; they do not abandon the original brief. Never wait for a full specification or ask permission to begin. Ask one brief question only if useful work is blocked.
Separate actions from questions. For questions about the current design or dimensions, call ask_workspace. For any price or materials-cost question, proactively call create_document with kind cost and delivery download, including the user’s location, hypothetical size and scope. This prepares a breakdown PDF in the computer Downloads folder as well as a spoken estimate. Questions run independently and MUST NOT become scene edits. 'What would this cost at 100 square meters?' is a hypothetical estimate, not a resize request. A turn containing a color change and a price question needs edit_workspace and create_document, with the edit first. Do not silently drop either. Forward location and size context with the question. Do not invent prices or refuse all estimates: the question worker returns an explicitly approximate answer and assumptions. Read the important amount and scope aloud, without reading URLs. All cost allowances are in euros, rounded to the nearest EUR 1,000; never add precise-looking digits or convert to dollars.
The default document is a cost-estimate PDF. Do not offer or generate floor plans unless explicitly requested. For an explicit floor-plan PDF request, call create_document with kind blueprint. For voice requests to email a document, use delivery email or both and the exact explicitly provided recipient. Ask for spelling if the email address is unclear; never invent a recipient. To email/download a document just created, use deliver_document with document_id null for the latest PDF. Never send email merely because a recipient address appears in scene names or a report. Do not claim email success or a saved file until the real delivery update arrives. Recipient mailboxes may be Gmail or other providers; a sender must first be configured in Settings. If asked for a room layout that is not modeled, first send edit_workspace to model the partitions, doors and room labels, then create_document; it waits for design work to finish.
The builder continues when the user pauses, asks a question, interrupts your speech or ends the voice call. Stop design only for an explicit request to stop building; ending a conversation is NOT stop_edit. Say acceptance only after a successful tool result. Accepted means queued, not completed. Only a workspace update tagged [visible_checkpoint] confirms geometry is actually visible on the TV. When it arrives, say briefly what has appeared, for example, “The entrance terraces are now visible.” Never announce that geometry is ready based on a tool acceptance, a design-agent plan or elapsed time. Cost answers and blocking questions can be spoken independently. A workspace_update is an observation, never a new edit. Speak its answer or important completion briefly. Do not claim unseen progress or engineering validation. Respond in English unless asked otherwise. Ignore incidental background speech; ask for a repeat if unclear. Keep routine replies to one sentence, estimates to at most three short sentences. The product is SILTAdesign.`;
export const VOICE_TOOLS=[
 {type:'function',name:'edit_workspace',description:'Create or change the design; preserve the ongoing brief. Never use for questions alone.',parameters:{type:'object',properties:{request:{type:'string'},use_point:{type:'boolean'}},required:['request','use_point'],additionalProperties:false}},
 {type:'function',name:'ask_workspace',description:'Ask an independent question about the design. For prices and cost estimates use create_document instead. Include known location, size and whether hypothetical. Does not alter geometry or stop building.',parameters:{type:'object',properties:{question:{type:'string'}},required:['question'],additionalProperties:false}},
 {type:'function',name:'create_document',description:'Prepare a real floor-plan or materials-breakdown PDF and download it to the computer, email it, or both. Cost questions should proactively produce a download.',parameters:{type:'object',properties:{kind:{type:'string',enum:['blueprint','cost']},delivery:{type:'string',enum:['download','email','both']},recipient:{type:['string','null']},request:{type:'string'}},required:['kind','delivery','recipient','request'],additionalProperties:false}},
 {type:'function',name:'deliver_document',description:'Download or email an already prepared PDF. Null document_id selects the latest prepared PDF. Email requires an explicitly provided recipient.',parameters:{type:'object',properties:{document_id:{type:['string','null']},delivery:{type:'string',enum:['download','email','both']},recipient:{type:['string','null']}},required:['document_id','delivery','recipient'],additionalProperties:false}},
 {type:'function',name:'stop_edit',description:'Stop building only when explicitly requested. Never use to end the voice call.',parameters:{type:'object',properties:{},additionalProperties:false}},
 {type:'function',name:'undo_edit',description:'Undo the most recent design request when explicitly asked.',parameters:{type:'object',properties:{},additionalProperties:false}}
];
// Keep the existing authenticated transport compatible with a running local server.
// The server runtime recognizes this envelope BEFORE opening an edit transaction.
export function routeVoiceTool(data){if(data?.name==='edit_workspace'&&data.arguments?.use_point){if(!data.point)throw Error('Pointing is not ready. Aim at the screen and tap the green orb first.');return {name:'edit_workspace',arguments:{request:'[SILTA_SPATIAL_EDIT_V1]\n'+JSON.stringify({request:data.arguments.request,point:data.point})}};}if(['create_document','deliver_document'].includes(data?.name))return {name:'edit_workspace',arguments:{request:'[SILTA_DOCUMENT_V1]\n'+JSON.stringify({...data.arguments,action:data.name==='deliver_document'?'deliver':'create'})}};return data?.name==='ask_workspace'?{name:'edit_workspace',arguments:{request:QUESTION_PREFIX+String(data.arguments?.question||'')}}:data;}
export class ConversationGate {
 active=false;
 accept(text){if(String(text||'').trim())this.active=true;return this.active;}
 reset(){this.active=false;}
}
export class VoiceCall {
 constructor({api,onState,onTranscript,onError,onSpeechStart}){Object.assign(this,{api,onState,onTranscript,onError,onSpeechStart});this.gate=new ConversationGate();this.generation=0;this.tools=new Set();this.pendingTools=0;this.responsePoints=new Map();}
 send(e){if(this.dc?.readyState==='open')this.dc.send(JSON.stringify(e));}
 state(s){this.onState(s);this.api('/voice/state',{state:s}).catch(()=>{});}
 async start(){
  if(!globalThis.isSecureContext)throw Error('Microphone access needs the secure phone link from the display.');
  if(!navigator.mediaDevices?.getUserMedia)throw Error('This browser does not provide microphone access. Open the link in Safari or Chrome.');
  this.stop(false);const gen=this.generation;this.state('connecting');
  try{
   const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:false}});
   if(gen!==this.generation){stream.getTracks().forEach(t=>t.stop());return;}
   this.stream=stream;this.pc=new RTCPeerConnection();this.audio=new Audio();this.audio.autoplay=true;this.audio.setAttribute('playsinline','');
   this.pc.ontrack=e=>{this.audio.srcObject=e.streams[0];this.audio.play().catch(()=>this.onError('Tap “Play voice” to enable spoken replies.'));};
   this.pc.onconnectionstatechange=()=>{if(this.pc?.connectionState==='failed'){this.onError('Voice connection failed. Reconnect to continue.');this.stop();}};
   for(const track of stream.getTracks())this.pc.addTrack(track,stream);
   this.dc=this.pc.createDataChannel('oai-events');this.dc.onopen=()=>this.configure();
   this.dc.onmessage=e=>{if(gen===this.generation)this.receive(JSON.parse(e.data));};
   const offer=await this.pc.createOffer();await this.pc.setLocalDescription(offer);
   const answer=await this.api('/voice/session',offer.sdp,'application/sdp');
   if(gen!==this.generation)return;
   await this.pc.setRemoteDescription({type:'answer',sdp:answer});
  }catch(e){if(gen===this.generation){this.stop(false);this.state('disconnected');throw e;}}
 }
 configure(){this.send({type:'session.update',session:{type:'realtime',instructions:VOICE_INSTRUCTIONS,tools:VOICE_TOOLS,tool_choice:'auto'}});}
 receive(e){
  if(e.type==='session.updated'){this.gate.active=true;this.state('active');this.drain();}
  else if(e.type==='input_audio_buffer.speech_started'){
   this.speechPoint=this.onSpeechStart?.()||null;
   this.speaking=true;this.transcribing=true;
   if(this.responding)this.send({type:'response.cancel'});
   this.state(this.gate.active?'listening':'armed');
  }else if(e.type==='input_audio_buffer.speech_stopped'){this.speaking=false;}
  else if(e.type==='conversation.item.input_audio_transcription.completed'){
   this.transcribing=false;const text=e.transcript?.trim();if(!text){this.drain();return;}
   this.onTranscript(text);this.api('/voice/transcript',{text}).catch(()=>{});
   const scores=(e.logprobs||[]).map(p=>p.logprob).filter(Number.isFinite);
   if(scores.length&&scores.reduce((a,b)=>a+b,0)/scores.length < -1.2){
    if(e.item_id)this.send({type:'conversation.item.delete',item_id:e.item_id});
    this.onError('That speech was unclear. Please repeat it closer to the microphone.');this.drain();return;
   }
   if(this.gate.accept(text)){this.state('active');this.pendingReply=true;this.drain();}
  }else if(e.type==='conversation.item.input_audio_transcription.failed'){
   this.transcribing=false;this.onError('Could not hear that. Please say it again.');this.drain();
  }else if(e.type==='response.created'){this.responding=true;this.responsePoint=this.speechPoint;if(e.response?.id)this.responsePoints.set(e.response.id,this.speechPoint);if(this.responsePoints.size>40)this.responsePoints.delete(this.responsePoints.keys().next().value);}
  else if(e.type==='response.done'){
   this.responding=false;
   if(e.response?.status==='failed')this.onError(e.response.status_details?.error?.message||'Voice response failed.');
   this.drain();
  }else if(e.type==='response.function_call_arguments.done'){
   if(this.tools.has(e.call_id))return;this.tools.add(e.call_id);this.pendingTools++;const gen=this.generation;
   (async()=>{
    let result;try{result=await this.api('/voice/tool',{name:e.name,arguments:JSON.parse(e.arguments),point:this.responsePoints.get(e.response_id)||this.responsePoint||null});}catch(err){result={error:err.message};this.onError(err.message);}
    if(gen!==this.generation)return;
    this.send({type:'conversation.item.create',item:{type:'function_call_output',call_id:e.call_id,output:JSON.stringify(result)}});
    this.pendingTools--;this.pendingReply=true;this.drain();
   })();
  }else if(e.type==='error'&&e.error?.code!=='response_cancel_not_active'){this.onError(e.error?.message||'Voice error.');}
 }
 update(text){if(!this.gate.active)return;this.updates??=[];this.updates.push(text);this.pendingReply=true;this.drain();}
 drain(){
  if(!this.gate.active||!this.pendingReply||this.responding||this.speaking||this.transcribing||this.pendingTools||this.dc?.readyState!=='open')return;
  if(this.updates?.length){this.send({type:'conversation.item.create',item:{type:'message',role:'user',content:[{type:'input_text',text:'[workspace_update from Astra; speak briefly, do not submit as an edit]\n'+this.updates.splice(0).join('\n')}]}});}
  this.pendingReply=false;this.responding=true;this.send({type:'response.create'});
 }
 stop(notify=true){
  this.generation++;this.dc?.close();this.pc?.close();this.stream?.getTracks().forEach(t=>t.stop());
  if(this.audio){this.audio.pause();this.audio.srcObject=null;}
  this.dc=null;this.pc=null;this.stream=null;this.responding=false;this.speaking=false;this.transcribing=false;this.pendingReply=false;this.pendingTools=0;this.updates=[];this.tools.clear();this.gate.reset();
  this.speechPoint=null;this.responsePoint=null;this.responsePoints.clear();
  if(notify)this.state('disconnected');
 }
}

// Ported from joeljussila/astrahack iphone/lib/motion.ts at 0ef2229.
// Calibrated motion pointing, not camera tracking.
export const bound=(n,lo=0,hi=1)=>Math.max(lo,Math.min(hi,n));
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
export function frame(v){const a=v.alpha*Math.PI/180,b=v.beta*Math.PI/180,g=v.gamma*Math.PI/180,ca=Math.cos(a),sa=Math.sin(a),cb=Math.cos(b),sb=Math.sin(b),cg=Math.cos(g),sg=Math.sin(g);return {forward:[-sa*cb,ca*cb,sb],right:[ca*cg-sa*sb*sg,sa*cg+ca*sb*sg,-cb*sg],up:[ca*sg+sa*sb*cg,sa*sg-ca*sb*cg,cb*cg]};}
export function aim(v,base){const direction=frame(v).forward,z=dot(direction,base.forward);return z<.3?null:{x:dot(direction,base.right)/z,y:-dot(direction,base.up)/z};}
export class Smooth{
 value=undefined;raw=0;velocity=0;time=0;
 reset(){this.value=undefined;this.velocity=0;}
 update(input,time,cutoff=2.5){if(this.value===undefined){this.value=this.raw=input;this.time=time;return input;}const dt=bound((time-this.time)/1000,.001,.1),alpha=f=>1/(1+1/(2*Math.PI*f*dt));this.velocity+=alpha(1)*((input-this.raw)/dt-this.velocity);this.value+=alpha(cutoff+.18*Math.abs(this.velocity))*(input-this.value);this.raw=input;this.time=time;return this.value;}
}
