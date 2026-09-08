export class LiveVoice {
 private pc:RTCPeerConnection|null=null;
 private dc:RTCDataChannel|null=null;
 private stream:MediaStream|null=null;
 private audio:HTMLAudioElement|null=null;
 private handled=new Set<string>();
 private generation=0;
 private turn=0;
 private speaking=false;
 constructor(private token:string,private status:(s:string)=>void,private transcript:(s:string)=>void,private interrupt:()=>void){}
 private send(event:unknown){if(this.dc?.readyState==='open')this.dc.send(JSON.stringify(event))}
 async start(){
  this.stop(); const generation=++this.generation;
  this.status('Connecting voice');
  try {
   const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}});
   if(generation!==this.generation){stream.getTracks().forEach(t=>t.stop());return}
   this.stream=stream;
   const pc=this.pc=new RTCPeerConnection();
   const audio=this.audio=document.createElement('audio');audio.autoplay=true;audio.setAttribute('playsinline','');document.body.append(audio);
   pc.ontrack=e=>{audio.srcObject=e.streams[0];void audio.play().catch(()=>this.status('Tap Resume audio'))};
   stream.getTracks().forEach(t=>pc.addTrack(t,stream));
   const dc=this.dc=pc.createDataChannel('oai-events');
   dc.onopen=()=>this.status('Voice live');
   dc.onmessage=e=>{try{void this.event(JSON.parse(e.data),generation)}catch{}};
   pc.onconnectionstatechange=()=>{if(pc.connectionState==='failed'||pc.connectionState==='closed'){if(generation===this.generation){this.stop();this.status('Voice disconnected')}}};
   const offer=await pc.createOffer();await pc.setLocalDescription(offer);
   const r=await fetch('/voice/session',{method:'POST',headers:{Authorization:`Bearer ${this.token}`,'Content-Type':'application/sdp'},body:offer.sdp});
   if(!r.ok)throw Error((await r.json()).error||'Voice connection failed');
   const sdp=await r.text();if(generation!==this.generation)return;
   await pc.setRemoteDescription({type:'answer',sdp});
  }catch(e){if(generation===this.generation){this.stop();this.status((e as Error).message)}}
 }
 private async event(e:any,generation:number){
  if(generation!==this.generation)return;
  if(e.type==='input_audio_buffer.speech_started'){this.turn++;this.speaking=true;this.status('Listening');this.interrupt()}
  if(e.type==='input_audio_buffer.speech_stopped'){this.speaking=false;this.status('Thinking')}
  if(e.type==='conversation.item.input_audio_transcription.completed')this.transcript('You: '+e.transcript);
  if(e.type==='response.output_audio_transcript.done')this.transcript(e.transcript);
  if(e.type==='response.done')this.status('Voice live');
  if(e.type==='error')this.status(e.error?.message||'Voice error');
  if(e.type!=='response.function_call_arguments.done'||this.handled.has(e.call_id))return;
  this.handled.add(e.call_id);const turn=this.turn;this.status('Astra is working');
  let output;
  try{
   const r=await fetch('/voice/tool',{method:'POST',headers:{Authorization:`Bearer ${this.token}`,'Content-Type':'application/json'},body:JSON.stringify({name:e.name,arguments:JSON.parse(e.arguments),callId:e.call_id})});
   output=await r.json();
  }catch(err){output={error:(err as Error).message}}
  if(generation!==this.generation)return;
  this.send({type:'conversation.item.create',item:{type:'function_call_output',call_id:e.call_id,output:JSON.stringify(output)}});
  if(!this.speaking&&turn===this.turn)this.send({type:'response.create'});
 }
 resume(){void this.audio?.play()}
 stop(){this.generation++;this.dc?.close();this.dc=null;this.pc?.close();this.pc=null;this.stream?.getTracks().forEach(t=>t.stop());this.stream=null;this.audio?.remove();this.audio=null;this.handled.clear();this.status('Voice off')}
}
