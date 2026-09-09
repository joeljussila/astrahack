import {VoiceCall,routeVoiceTool,frame,aim,bound,Smooth,MarkedTarget} from './voice-client.mjs';
class PhoneFeed {
 constructor(url){this.url=url;this.closed=false;this.connect();}
 connect(){this.socket=new WebSocket(this.url);this.socket.onopen=e=>this.onopen?.(e);this.socket.onmessage=e=>this.onmessage?.(e);this.socket.onerror=e=>this.onerror?.(e);this.socket.onclose=()=>{if(!this.closed){this.onerror?.();this.timer=setTimeout(()=>this.connect(),1500);}};}
 close(){this.closed=true;clearTimeout(this.timer);this.socket.close();}
}
const $=id=>document.getElementById(id);let token=location.hash.slice(1)||sessionStorage.getItem('silta-pairing')||'',feed;
if(token)sessionStorage.setItem('silta-pairing',token);
history.replaceState(null,'',location.pathname);
async function api(path,data,contentType='application/json'){
 const question=path==='/voice/tool'&&data?.name==='ask_workspace',document=path==='/voice/tool'&&['create_document','deliver_document'].includes(data?.name);
 if(path==='/voice/tool')data=routeVoiceTool(data);
 const r=await fetch(path,{method:data===undefined?'GET':'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':contentType},body:data===undefined?undefined:contentType==='application/json'?JSON.stringify(data):data});
 const result=contentType==='application/sdp'&&r.ok?await r.text():await r.json();if(!r.ok)throw Error(result.error||'Connection failed.');return document?{accepted:true,status:'Document preparation or delivery is queued. Do not claim it is saved or emailed until the real workspace update arrives.'}:question?{accepted:true,status:'Your question is running independently. Keep listening; the answer will arrive as a workspace update. Building continues.'}:result;
}
let connected=false,configured=false;
function showError(text){$('phone-error').textContent=text;$('phone-error').hidden=!text;}
function controls(){const button=$('microphone');button.textContent=connected?'Disable microphone':'Enable microphone';button.setAttribute('aria-pressed',String(connected));button.disabled=!connected&&!configured;}
// Motion math and calibration are adapted from AstraHack's iPhone controller.
const pointerSession=crypto.randomUUID(),filters=[new Smooth(),new Smooth()];
const marked=new MarkedTarget();let calibrated=false,markTimer;
let attitude=null,base=null,point={x:.5,y:.5},pointSeq=0,motionEnabled=false,lastMotion=0,pointerBusy=false,pointerDirty=false,pointValid=false;
function pointerMessage(capture=false){return {session:pointerSession,seq:++pointSeq,...point,capture};}
async function publishPointer(p){return api('/voice/tool',{name:'edit_workspace',arguments:{request:'[SILTA_POINTER_V1]\n'+JSON.stringify(p)}});}
function capturePoint(){if(document.hidden)return null;const pinned=marked.reference();if(pinned)return pinned;if(!motionEnabled||!calibrated||!pointValid)return null;const p=pointerMessage(true);publishPointer(p).catch(e=>showError(e.message));return {session:p.session,seq:p.seq};}
function recenter(){if(!attitude){showError('Waiting for motion sensors. Move the phone slightly, then try again.');return;}base=frame(attitude);filters.forEach(f=>f.reset());point={x:.5,y:.5};pointValid=true;pointerDirty=true;calibrated=true;marked.clear();publishPointer({...pointerMessage(),clearMark:true}).catch(e=>showError(e.message));clearTimeout(markTimer);delete $('orb').dataset.marked;$('orb').setAttribute('aria-label','Mark this spot');$('recenter').hidden=false;$('point-hint').textContent='Point at a place on the TV. Tap the orb to mark it.';showError('');}
function markPoint(){
 if(!motionEnabled||!base||!pointValid||Date.now()-lastMotion>2000||document.hidden){showError('Aim toward the display before marking a spot.');return;}
 const p={...pointerMessage(true),pinned:true};marked.mark(p);clearTimeout(markTimer);delete $('orb').dataset.marked;showError('');$('point-hint').textContent='Marking on the TV…';
 publishPointer(p).catch(e=>{if(marked.matches(p)){marked.clear();showError(e.message);}});
 markTimer=setTimeout(()=>{if(marked.matches(p)&&!marked.confirmed){marked.clear();$('point-hint').textContent='Tap the orb to try again.';showError('The TV did not confirm the spot. Keep the display open and visible.');}},10000);
}
function motionSensor(e){if(![e.alpha,e.beta,e.gamma].every(Number.isFinite))return;attitude={alpha:e.alpha,beta:e.beta,gamma:e.gamma};lastMotion=Date.now();if(!base){base=frame(attitude);calibrated=true;$('orb').setAttribute('aria-label','Mark this spot');$('recenter').hidden=false;$('point-hint').textContent='Point at a place on the TV. Tap the orb to mark it.';}const p=aim(attitude,base);pointValid=!!p;if(!p)return;const t=performance.now();point={x:bound(filters[0].update(.5+p.x*1.1,t)),y:bound(filters[1].update(.5+p.y*1.65,t))};pointerDirty=true;}
async function enablePointing(){
 if(motionEnabled)return;
 if(typeof DeviceOrientationEvent==='undefined')return;
 try{if(DeviceOrientationEvent.requestPermission&&await DeviceOrientationEvent.requestPermission()!=='granted')throw Error('Motion permission was denied. Voice still works; allow motion in Safari to point.');window.addEventListener('deviceorientation',motionSensor);motionEnabled=true;$('orb').setAttribute('role','button');$('orb').setAttribute('tabindex','0');$('orb').removeAttribute('aria-hidden');$('orb').setAttribute('aria-label','Mark this spot');$('point-hint').hidden=false;$('point-hint').textContent='Move your phone to aim. Tap the orb to mark a spot.';}catch(e){showError(e.message);}
}
const pointerTimer=setInterval(()=>{if(!connected||!pointValid||!pointerDirty||pointerBusy||document.hidden)return;pointerDirty=false;pointerBusy=true;publishPointer(pointerMessage()).catch(()=>{}).finally(()=>pointerBusy=false);},80);
$('orb').onclick=markPoint;$('orb').onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();markPoint();}};$('recenter').onclick=recenter;
screen.orientation?.addEventListener('change',()=>{base=null;pointValid=false;calibrated=false;marked.clear();filters.forEach(f=>f.reset());$('point-hint').textContent='Move your phone to aim. Use Recenter pointer if needed.';});
const call=new VoiceCall({api,onSpeechStart:capturePoint,onState(state){connected=state!=='disconnected';$('orb').dataset.state=state;controls();},onTranscript(){},onError(text){showError(text.includes('Play voice')?'Voice playback was blocked. Disable and re-enable the microphone.':text);}});
$('microphone').onclick=async()=>{showError('');if(connected){call.stop();return;}try{void enablePointing();await call.start();}catch(e){showError(e.message);}};
try{
 if(!token){const b=await fetch('/bootstrap').then(r=>r.json());if(!b.token)throw Error('Open the paired phone link from the display.');token=b.token;}
 const s=await api('/api/status');configured=s.configured;controls();if(!configured)showError('Connect your API key in the display settings.');
 feed=document.querySelector('meta[name=astra-phone-feed]')?new PhoneFeed((location.protocol==='https:'?'wss://':'ws://')+location.host+'/phone-events?token='+encodeURIComponent(token)):new EventSource('/events?phone=1&token='+encodeURIComponent(token));
 feed.onmessage=({data})=>{
  const e=JSON.parse(data);
  if(e.type==='point_cleared'&&e.session===pointerSession&&(!marked.point||marked.point.seq<=e.seq)){marked.clear();clearTimeout(markTimer);delete $('orb').dataset.marked;if(calibrated)$('point-hint').textContent='Point at a place on the TV. Tap the orb to mark it.';}
  if(e.type==='point_resolved'&&marked.matches(e)){clearTimeout(markTimer);if(marked.resolve(e)){$('orb').dataset.marked='true';$('point-hint').textContent='Spot marked. Say what to add here.';}else showError('That point missed the scene. Aim at the ground or a building and mark again.');}
  if(e.type==='point_failed'&&marked.matches(e)){clearTimeout(markTimer);marked.clear();delete $('orb').dataset.marked;showError('The view changed while marking. Please mark the spot again.');}
  if(e.type==='display_visible')call.update('[visible_checkpoint] The TV has rendered this change: '+e.text+'. Tell the user in one short sentence what is now visible; do not claim other work is finished.');
  if(e.type==='assistant'&&(e.question||e.needsInput))call.update(e.text);
  if(e.type==='error'){showError(e.text);call.update(e.text);}
  if(e.type==='connection'){configured=e.status.configured;controls();if(configured&&$('phone-error').textContent==='Connect your API key in the display settings.')showError('');}
 };
 feed.onerror=()=>{$('orb').dataset.connection='reconnecting';};feed.onopen=()=>{delete $('orb').dataset.connection;};
}catch(e){showError(e.message);configured=false;controls();}
addEventListener('pagehide',()=>{call.stop();feed?.close();clearInterval(pointerTimer);window.removeEventListener('deviceorientation',motionSensor);});
