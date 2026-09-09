import * as THREE from 'three';
import {OrbitControls} from '/orbit';
import {GLTFLoader} from '/gltf';
const stageRequest=text=>text;
const $=id=>document.getElementById(id);let token='',configured=false,phoneUrl=null,current={objects:[],asset:null},loadedAsset=null,pendingAsset=null,top=false,first=true,loadGeneration=0;
const renderer=new THREE.WebGLRenderer({canvas:$('scene'),antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setClearColor(0xf5f5f0);renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1;
const scene=new THREE.Scene(),group=new THREE.Group();scene.add(group);const camera=new THREE.PerspectiveCamera(36,1,.1,5000);camera.position.set(40,32,45);
const controls=new OrbitControls(camera,$('scene'));controls.enableDamping=true;controls.minDistance=2;controls.maxDistance=1500;controls.maxPolarAngle=Math.PI/2.01;
const floor=new THREE.Mesh(new THREE.PlaneGeometry(4000,4000),new THREE.MeshStandardMaterial({color:0xf5f5f0,roughness:1}));floor.rotation.x=-Math.PI/2;floor.position.y=-.08;floor.receiveShadow=true;scene.add(floor);
const grid=new THREE.GridHelper(240,120,0xc9ccc7,0xd9ddd6);grid.position.y=-.065;grid.material.transparent=true;grid.material.opacity=.65;scene.add(grid);
scene.add(new THREE.HemisphereLight(0xffffff,0xa3b296,2.1));const sun=new THREE.DirectionalLight(0xffefda,3);sun.position.set(30,70,40);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.normalBias=.035;Object.assign(sun.shadow.camera,{left:-65,right:65,top:65,bottom:-65,near:1,far:250});scene.add(sun);const fill=new THREE.DirectionalLight(0xdce9fa,.8);fill.position.set(-40,25,-20);scene.add(fill);
function resize(){renderer.setSize(innerWidth,innerHeight);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();}addEventListener('resize',resize);resize();renderer.setAnimationLoop(()=>{controls.update();renderer.render(scene,camera);});
function fit(){
 if(!group.children.length)return;
 // Site ground must not make a small building a speck. Keep physical dimensions intact.
 const box=new THREE.Box3(),excluded=new Set(current.objects.filter(o=>['ground','path'].includes(o.kind)).map(o=>o.id));
 group.updateMatrixWorld(true);group.traverse(o=>{if(!o.isMesh)return;let parent=o,skip=false;while(parent){if(excluded.has(parent.userData.silt_id)){skip=true;break;}parent=parent.parent;}if(!skip)box.union(new THREE.Box3().setFromObject(o));});
 if(box.isEmpty())box.setFromObject(group);
 const center=box.getCenter(new THREE.Vector3()),direction=new THREE.Vector3(top?.0001:.75,top?1:.7,top?.0001:1).normalize();
 const right=new THREE.Vector3().crossVectors(camera.up,direction).normalize(),up=new THREE.Vector3().crossVectors(direction,right).normalize();
 const tanY=Math.tan(THREE.MathUtils.degToRad(camera.fov/2)),tanX=tanY*camera.aspect;let distance=2;
 for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z]){const v=new THREE.Vector3(x,y,z).sub(center),depth=v.dot(direction);distance=Math.max(distance,depth+1.2*Math.abs(v.dot(right))/tanX,depth+1.2*Math.abs(v.dot(up))/tanY);}
 controls.target.copy(center);camera.position.copy(center).addScaledVector(direction,distance);controls.update();
}
function dispose(g){g.traverse(o=>{o.geometry?.dispose();for(const m of Array.isArray(o.material)?o.material:o.material?[o.material]:[]){for(const value of Object.values(m))if(value?.isTexture)value.dispose();m.dispose();}});}
let outline=null;
function selection(){if(outline){scene.remove(outline);outline.geometry.dispose();outline.material.dispose();outline=null;}const selected=current.objects.find(o=>o.id===current.selection);$('selection').hidden=!selected;if(selected){$('selected-name').textContent=selected.name;let found;group.traverse(o=>{if(o.userData.silt_id===selected.id)found=o;});if(found){outline=new THREE.BoxHelper(found,0x648459);scene.add(outline);}}}
const assetURL=(asset,file)=>`/artifacts/${asset}/${file}?token=${encodeURIComponent(token)}`;
function render(s){current=s;const empty=!s.asset;$('welcome').hidden=!empty;$('view-controls').hidden=empty;$('downloads').hidden=empty;$('undo').hidden=!s.canUndo;$('drawing').hidden=!s.plan;
 if(!empty)$('download-model').href=assetURL(s.asset,'scene.blend');
 if(s.plan){const url=assetURL(s.plan.asset,'plan.svg');$('drawing-image').src=url;$('download-drawing').href=url;}else if($('drawing-dialog').open)$('drawing-dialog').close();
 if(empty){loadGeneration++;pendingAsset=null;loadedAsset=null;dispose(group);group.clear();first=true;controls.target.set(0,0,0);camera.position.set(40,32,45);selection();return;}
 if(s.asset===loadedAsset||s.asset===pendingAsset){selection();if(s.asset===loadedAsset)acknowledgeVisible();return;}
 const generation=++loadGeneration;pendingAsset=s.asset;const asset=s.asset;
 new GLTFLoader().load(assetURL(asset,'scene.glb'),g=>{if(generation!==loadGeneration||asset!==current.asset){dispose(g.scene);return;}dispose(group);group.clear();g.scene.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});group.add(g.scene);loadedAsset=asset;pendingAsset=null;step('Model updated','done','display');selection();if(first){fit();first=current.objects.every(o=>['ground','path'].includes(o.kind));}acknowledgeVisible();},undefined,()=>{if(generation!==loadGeneration)return;pendingAsset=null;step('The updated model could not be displayed. Try reopening the display.','failed','display');});
}
let acknowledgedDisplay=null,acknowledgingDisplay=null;
const pendingPoints=new Map();let pointerTimer,lastPointerSeq=-1,lastPointerSession=null;
const targetMarker=new THREE.Group();targetMarker.visible=false;scene.add(targetMarker);let targetMarkerTimer,targetObjectId=null;
const markerMaterial=new THREE.MeshBasicMaterial({color:0x548c60,depthTest:false,transparent:true,opacity:.95});
const targetRing=new THREE.Mesh(new THREE.TorusGeometry(.55,.055,8,48),markerMaterial);targetRing.rotation.x=Math.PI/2;
const targetStem=new THREE.Mesh(new THREE.CylinderGeometry(.035,.035,.85,8),markerMaterial);targetStem.position.y=.425;
const targetDot=new THREE.Mesh(new THREE.SphereGeometry(.11,12,8),markerMaterial);targetDot.position.y=.9;
targetMarker.add(targetRing,targetStem,targetDot);targetMarker.traverse(o=>o.renderOrder=1000);
function showTarget(p){if(p.miss){targetMarker.visible=false;return;}targetObjectId=p.objectId;targetMarker.position.fromArray(p.world);targetMarker.visible=true;targetMarker.scale.setScalar(Math.max(.3,camera.position.distanceTo(targetMarker.position)*.018));clearTimeout(targetMarkerTimer);targetMarkerTimer=setTimeout(()=>targetMarker.visible=false,p.pinned?600000:60000);}
function phonePointer(p){
 if(document.hidden)return;
 if(p.session!==lastPointerSession){lastPointerSession=p.session;lastPointerSeq=-1;}
 if(p.seq>=lastPointerSeq){const cursor=$('phone-pointer');lastPointerSeq=p.seq;cursor.hidden=false;cursor.style.left=(p.x*100)+'%';cursor.style.top=(p.y*100)+'%';cursor.dataset.captured=String(p.capture);clearTimeout(pointerTimer);pointerTimer=setTimeout(()=>cursor.hidden=true,2200);}
 if(p.capture){pendingPoints.set(p.session+':'+p.seq,p);resolvePhonePoints();}
}
function resolvePhonePoints(){
 if(document.hidden||current.asset!==loadedAsset)return;
 camera.updateMatrixWorld();group.updateMatrixWorld(true);
 for(const [key,p] of pendingPoints){
  pendingPoints.delete(key);if(Date.now()-p.at>5000)continue;
  ray.setFromCamera(new THREE.Vector2(p.x*2-1,1-p.y*2),camera);
  const hit=ray.intersectObjects(group.children,true)[0];let objectId=null,world;
  if(hit){world=hit.point;let o=hit.object;while(o&&!o.userData.silt_id)o=o.parent;objectId=o?.userData.silt_id||null;}
  else world=ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,1,0),0),new THREE.Vector3());
  const result={session:p.session,seq:p.seq,revision:current.revision,asset:current.asset,objectId,...(world?{world:world.toArray()}:{miss:true})};
  api('/api/ask',{text:'[SILTA_POINT_RESOLVED_V1]\n'+JSON.stringify(result)}).catch(()=>{/* Never substitute a guessed point after a revision conflict. */});
 }
}
function acknowledgeVisible(){
 resolvePhonePoints();
 const asset=loadedAsset,revision=current.revision,key=asset+':'+revision;
 if(document.hidden||!asset||asset!==current.asset||key===acknowledgedDisplay||key===acknowledgingDisplay)return;
 const valid=()=>!document.hidden&&loadedAsset===asset&&current.asset===asset&&current.revision===revision;
 requestAnimationFrame(()=>{if(!valid())return;renderer.render(scene,camera);requestAnimationFrame(async()=>{
  if(!valid())return;acknowledgingDisplay=key;
  try{await api('/api/ask',{text:'[SILTA_DISPLAYED_V1]\n'+JSON.stringify({asset,revision})});acknowledgedDisplay=key;}catch{/* A newer scene will schedule a fresh acknowledgment. */}
  finally{if(acknowledgingDisplay===key)acknowledgingDisplay=null;}
 });});
}
addEventListener('visibilitychange',()=>{if(!document.hidden)acknowledgeVisible();});
async function api(path,data){const r=await fetch(path,{method:data===undefined?'GET':'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:data===undefined?undefined:JSON.stringify(data)});const d=await r.json();if(!r.ok)throw Error(d.error||'Request failed');return d;}
let currentStep=null,progressWorking=false;const activeSteps=new Map();
function resetProgress(){currentStep=null;progressWorking=false;activeSteps.clear();$('design-progress').hidden=true;}
function step(label,state='active',key='current'){
 const short=label.replace(/^Blender is building: /,'').replace(/^Preparing a Blender edit$/,'Preparing the next change');
 currentStep={label:short,state,key};
 if(state==='active'){activeSteps.delete(key);activeSteps.set(key,currentStep);}else activeSteps.delete(key);
 $('design-progress').hidden=false;drawTrail();
}
function drawTrail(){
 const item=[...activeSteps.values()].at(-1)||currentStep;if(!item)return;
 $('progress-title').textContent='Progress';$('design-progress').dataset.active=String(progressWorking||activeSteps.size>0);
 const li=document.createElement('li');li.dataset.state=item.state;
 const dot=document.createElement('span');dot.className='step-mark';dot.setAttribute('aria-hidden','true');
 const text=document.createElement('span');text.textContent=item.label;li.append(dot,text);$('progress-steps').replaceChildren(li);
}
const shownDownloads=new Set();let downloadTimer;
function downloadFeedback(e){
 const result=e.type==='assistant'&&e.document;
 if(!result?.downloaded||!result.documentId||shownDownloads.has(result.documentId))return;
 shownDownloads.add(result.documentId);clearTimeout(downloadTimer);
 const toast=$('download-toast');toast.hidden=false;toast.classList.remove('arriving');
 void toast.offsetWidth;toast.classList.add('arriving');
 downloadTimer=setTimeout(()=>{toast.hidden=true;},5500);
}
function progress(e){
 if(e.type==='phone_pointer')phonePointer(e);
 if(e.type==='point_resolved')showTarget(e);
 if(e.type==='point_failed')targetMarker.visible=false;
 if(e.type==='point_cleared')targetMarker.visible=false;
 if(e.type==='scene'&&targetObjectId&&!e.scene.objects.some(o=>o.id===targetObjectId))targetMarker.visible=false;
 downloadFeedback(e);
 if(e.type==='scene'&&!e.scene.asset)resetProgress();
 if(e.type==='user')step('Working with your idea','active','preparing');
 if(e.type==='timing'&&e.event==='response_started')step('Preparing the next change','active','preparing');
 if(e.type==='timing'&&e.event==='steer_accepted')step('Applying your change','active','preparing');
 if(e.type==='timing'&&e.event==='geometry_committed')step('Updating the view','active','display');
 if(e.type==='progress'){activeSteps.delete('preparing');step(e.text,e.state==='active'?'active':e.state==='done'?'done':'failed','tool:'+e.id);}
 if(e.type==='task')step(e.text,e.state==='running'?'active':e.state==='complete'?'done':e.state==='failed'?'failed':'info','background:'+e.id);
 if(e.type==='error'){activeSteps.clear();step(e.text,'failed','error');}
 if(e.type==='activity'){
  progressWorking=e.working;
  if(!e.working){for(const key of activeSteps.keys())if(!key.startsWith('background:')&&key!=='display')activeSteps.delete(key);if(currentStep?.state==='active')currentStep={label:'Paused',state:'info'};}
  drawTrail();
 }
 if(e.type==='timing'&&e.event==='response_finished'){activeSteps.delete('preparing');step('Up to date','done','finished');}
}
function notice(text){const full=String(text||'').trim(),line=full.split(/\r?\n/).find(l=>l.trim())?.replace(/^#+\s*/,'')||'';$('status').textContent=line.length>160?line.slice(0,157)+'…':line;if(full!==$('status').textContent){$('response-notes').textContent=full;$('notes').hidden=false;}}
function activity(working){document.body.classList.toggle('working',working);$('stop').hidden=!working;}
function connection(s){configured=s.configured;$('key-state').textContent=configured?'Connected':'Not configured';$('api-settings').open=!configured;activity(s.working);$('pair-status').textContent=s.phoneCount?'Phone page connected.':'Connect your phone once, then use your voice.';if(!configured)notice('Open settings to connect.');else if(['Connecting…','Open settings to connect.'].includes($('status').textContent))notice(s.working?'Designing…':s.voiceState==='active'?'Listening. Tell me your idea.':'Ready when you are.');}
$('settings').onclick=async()=>{$('settings-dialog').showModal();try{const r=await fetch('http://127.0.0.1:4175/pairing',{signal:AbortSignal.timeout(2000)});if(!r.ok)throw Error('Phone connection is unavailable.');const p=await r.json();phoneUrl=p.phoneUrl;$('pair-qr').src=p.qr;$('pair-qr').hidden=false;$('phone-link').href=phoneUrl;$('phone-link').hidden=false;$('copy-link').hidden=false;$('pair-error').textContent='';}catch{$('pair-error').textContent='Start the secure phone bridge to pair your phone.';}};
$('copy-link').onclick=()=>navigator.clipboard.writeText(phoneUrl).then(()=>$('copy-link').textContent='Copied').catch(()=>notice('Use the phone link in settings.'));
$('email-form').onsubmit=async e=>{e.preventDefault();try{await api('/api/ask',{text:'[SILTA_EMAIL_SETUP_V1]\n'+JSON.stringify({host:$('email-host').value.trim(),port:Number($('email-port').value),user:$('email-user').value.trim(),password:$('email-password').value})});$('email-password').value='';$('email-state').textContent='Sender saved. Ready for your first email.';}catch(e){$('email-state').textContent=e.message;}};
$('key-form').onsubmit=async e=>{e.preventDefault();try{await api('/api/connect',{key:$('key').value});$('key').value='';$('key-error').textContent='';notice('Connected. Tell me your idea.');}catch(e){$('key-error').textContent=e.message;}};
$('keyboard').onclick=()=>{const visible=$('composer').hidden;$('composer').hidden=!visible;$('keyboard').setAttribute('aria-pressed',String(visible));if(visible)$('prompt').focus();};
$('composer').onsubmit=async e=>{e.preventDefault();const text=$('prompt').value.trim();if(!text)return;if(!configured){$('settings').click();return;}$('prompt').value='';try{await api('/api/ask',{text:stageRequest(text)});}catch(e){notice(e.message);}};
$('prompt').onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();$('composer').requestSubmit();}};
for(const id of ['stop','undo','clear'])$(id).onclick=async()=>{try{await api('/api/'+id,{});if(id==='clear')resetProgress();}catch(e){notice(e.message);}};
$('fit').onclick=fit;$('plan').onclick=()=>{top=!top;$('plan').textContent=top?'Perspective':'Above';fit();};$('drawing').onclick=()=>$('drawing-dialog').showModal();$('notes').onclick=()=>$('notes-dialog').showModal();$('unselect').onclick=()=>api('/api/select',{id:null}).catch(e=>notice(e.message));
let down;const ray=new THREE.Raycaster();$('scene').addEventListener('pointerdown',e=>down={x:e.clientX,y:e.clientY});$('scene').addEventListener('pointerup',e=>{if(!down||Math.hypot(e.clientX-down.x,e.clientY-down.y)>5)return;ray.setFromCamera(new THREE.Vector2(e.clientX/innerWidth*2-1,1-e.clientY/innerHeight*2),camera);let id=null;for(const hit of ray.intersectObjects(group.children,true)){let o=hit.object;while(o&&!o.userData.silt_id)o=o.parent;if(o){id=o.userData.silt_id;break;}}api('/api/select',{id}).catch(e=>notice(e.message));});
try{const b=await fetch('/bootstrap').then(r=>r.json());if(!b.token)throw Error(b.error||'Could not connect');token=b.token;await api('/api/clear',{});const s=await api('/api/status');connection(s);render(s.scene);$('engine-state').textContent=s.blenderAvailable?'Blender engine ready.':'Blender engine is unavailable.';
 const feed=new EventSource('/events?token='+encodeURIComponent(token));feed.onmessage=({data})=>{const e=JSON.parse(data);progress(e);if(e.type==='scene')render(e.scene);if(e.type==='snapshot'){render(e.scene);connection(e.status);}if(e.type==='connection')connection(e.status);if(e.type==='activity')activity(e.working);if(e.type==='error')notice('The design needs attention.');if(e.type==='user')notice('Working with your idea.');if(e.type==='task')notice(e.state==='running'?'Checking: '+e.text:e.text);if(e.type==='voice'&&!document.body.classList.contains('working'))notice(({active:'Listening. Tell me your idea.',listening:'Listening…',connecting:'Connecting your microphone…',disconnected:'Conversation ended.'})[e.state]||'Listening…');};feed.onerror=()=>notice('Reconnecting…');
}catch(e){notice(e.message);}
