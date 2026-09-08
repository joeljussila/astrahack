import React,{useEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {QRCodeSVG} from 'qrcode.react';
import {channel,local,type Message,type Tool} from './lib/session';
import {frame,aim,bound,Smooth,type Attitude,type Frame} from './lib/motion';
import {LiveVoice} from './lib/voice';
import './style.css';
function Pair(){
 const [session,setSession]=useState<any>(null),[error,setError]=useState(''),[point,setPoint]=useState({x:.5,y:.5});
 useEffect(()=>{let disposed=false;const refresh=()=>local('bootstrap').then(s=>{if(!disposed){setSession(s);setPoint(s.pointer)}}).catch(e=>setError(e.message));void refresh();const timer=setInterval(refresh,1000);return()=>{disposed=true;clearInterval(timer)}},[]);
 return <main><h1>Connect iPhone</h1><p>Open this QR code with your iPhone camera.</p>{session?.phoneUrl?<QRCodeSVG value={session.phoneUrl} size={240}/>:<p>{error||'Starting secure phone link…'}</p>}<p role="status">{session?.phone?'iPhone connected':'Waiting for iPhone'}</p><p>{session?.mode==='studio'?'Blender':'Excalidraw'} · {session?.voiceModel||'Realtime voice'}</p><div className="test-area"><i style={{left:point.x*100+'%',top:point.y*100+'%'}}/></div><p>Enable motion on the phone, then move it. The dot should follow.</p></main>
}
function Phone(){
 const preference=(key:string,fallback:string)=>{try{return localStorage.getItem('airspace-'+key)||fallback}catch{return fallback}};
 const [connection,setConnection]=useState('Connecting'),[mode,setMode]=useState('canvas'),[tool,setTool]=useState<Tool>('point'),[notice,setNotice]=useState(''),[motion,setMotion]=useState(false),[hz,setHz]=useState(0),[rtt,setRtt]=useState(0),[voiceStatus,setVoiceStatus]=useState('Voice off'),[voiceOn,setVoiceOn]=useState(false),[text,setText]=useState(''),[touchMode,setTouchMode]=useState(preference('input','motion')==='touch'),[busy,setBusy]=useState(false),[gain,setGain]=useState(Number(preference('gain','1'))||1);
 const link=useRef<ReturnType<typeof channel>|null>(null),voice=useRef<LiveVoice|null>(null),attitude=useRef<Attitude|null>(null),base=useRef<Frame|null>(null),filter=useRef([new Smooth(),new Smooth()]),point=useRef({x:.5,y:.5}),count=useRef(0),held=useRef(false),sensor=useRef<((e:DeviceOrientationEvent)=>void)|null>(null),wake=useRef<any>(null),touch=useRef<{x:number;y:number;travel:number}|null>(null),touchRef=useRef(touchMode),modeRef=useRef('canvas'),gainRef=useRef(gain),raf=useRef(0),pending=useRef(false),lastSent=useRef(0),selectGuard=useRef(0),toolRef=useRef<Tool>(tool);
 touchRef.current=touchMode;gainRef.current=gain;toolRef.current=tool;
 const send=(m:Message)=>link.current?.send(m);
 function flushPoint(){if(pending.current){pending.current=false;send({type:'pointer',...point.current});lastSent.current=performance.now()}}
 function release(){flushPoint();if(held.current){held.current=false;send({type:'up'})}}
 function move(x:number,y:number){
  point.current={x:bound(x),y:bound(y)};pending.current=true;
  if(!raf.current){const tick=(now:number)=>{raf.current=0;if(now-lastSent.current>=1000/60-1)flushPoint();if(pending.current)raf.current=requestAnimationFrame(tick)};raf.current=requestAnimationFrame(tick)}
 }
 function center(){release();if(attitude.current)base.current=frame(attitude.current);filter.current.forEach(f=>f.reset());move(.5,.5);flushPoint();setNotice('Centered. Aim comfortably; recenter whenever you need.');}
 function press(){flushPoint();held.current=true;send({type:'down'});if(toolRef.current==='point')selectGuard.current=performance.now()+100;}
 function chooseTool(t:Tool){release();setTool(t);send({type:'tool',tool:t});}
 function chooseInput(touchInput:boolean){release();setTouchMode(touchInput);if(touchInput)void(navigator as any).wakeLock?.request('screen').then((w:any)=>wake.current=w).catch(()=>{});try{localStorage.setItem('airspace-input',touchInput?'touch':'motion')}catch{}}
 useEffect(()=>{
  const hash=new URLSearchParams(location.hash.slice(1)),id=hash.get('id'),token=hash.get('token');
  if(!id||!token){setConnection('Scan the QR on your Mac');return}
  link.current=channel(`${location.protocol==='https:'?'wss':'ws'}://${location.host}/live`,id,token,m=>{
   if(m.type==='pong')setRtt(Math.round(performance.now()-m.at));
   if(m.type==='joined'||m.type==='state'){
    setTool(m.state.tool);setMode(m.state.mode);setBusy(m.state.busy);
    if(modeRef.current!==m.state.mode){release();voice.current?.stop();setVoiceOn(false);setNotice('Switched to '+(m.state.mode==='studio'?'Blender':'Excalidraw')+'. Start live voice when ready.');modeRef.current=m.state.mode}
   }
   if(m.type==='event'&&m.role==='assistant')setNotice(m.text);
   if(m.type==='notice')setNotice(m.text);
  },status=>{setConnection(status);if(status!=='Connected'){release();voice.current?.stop();setVoiceOn(false)}});
  voice.current=new LiveVoice(token,setVoiceStatus,setNotice,()=>send({type:'interrupt'}),setVoiceOn);
  const timer=setInterval(()=>{setHz(count.current);send({type:'telemetry',sensorHz:count.current});count.current=0;send({type:'ping',at:performance.now()})},1000);
  const hide=()=>{if(document.hidden){release();touch.current=null;voice.current?.stop();setVoiceOn(false);wake.current?.release();}else if(sensor.current)void(navigator as any).wakeLock?.request('screen').then((w:any)=>wake.current=w).catch(()=>{});};
  const rotate=()=>{release();base.current=null;filter.current.forEach(f=>f.reset());move(.5,.5);};
  document.addEventListener('visibilitychange',hide);screen.orientation?.addEventListener('change',rotate);
  return()=>{clearInterval(timer);release();if(raf.current)cancelAnimationFrame(raf.current);link.current?.close();voice.current?.stop();if(sensor.current)window.removeEventListener('deviceorientation',sensor.current);wake.current?.release();document.removeEventListener('visibilitychange',hide);screen.orientation?.removeEventListener('change',rotate)};
 },[]);
 async function enable(){try{
  if(!isSecureContext)throw Error('Use the secure link from the QR code.');
  if(typeof DeviceOrientationEvent==='undefined')throw Error('No motion sensor in this browser. Use Touchpad.');
  const Sensor=DeviceOrientationEvent as typeof DeviceOrientationEvent&{requestPermission?:()=>Promise<string>};
  if(Sensor.requestPermission&&await Sensor.requestPermission()!=='granted')throw Error('Motion permission denied. Touchpad is ready to use.');
  if(sensor.current)window.removeEventListener('deviceorientation',sensor.current);
  sensor.current=e=>{
   if(e.alpha===null||e.beta===null||e.gamma===null)return;
   attitude.current={alpha:e.alpha,beta:e.beta,gamma:e.gamma};count.current++;
   if(!base.current)base.current=frame(attitude.current);
   if(touchRef.current||document.hidden||performance.now()<selectGuard.current)return;
   const p=aim(attitude.current,base.current);if(p){const t=performance.now();move(filter.current[0].update(.5+p.x*1.1*gainRef.current,t),filter.current[1].update(.5+p.y*1.65*gainRef.current,t));}
  };
  window.addEventListener('deviceorientation',sensor.current);setMotion(true);chooseInput(false);setNotice('Motion is on. Aim at your screen, then tap Recenter.');
  try{wake.current=await(navigator as any).wakeLock?.request('screen')}catch{}
 }catch(e){setNotice((e as Error).message)}}
 function padDown(e:React.PointerEvent<HTMLButtonElement>){
  e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);
  if(touchRef.current){touch.current={x:e.clientX,y:e.clientY,travel:0};if(toolRef.current!=='point')press();}
  else press();
 }
 function padMove(e:React.PointerEvent<HTMLButtonElement>){
  const t=touch.current;if(!touchRef.current||!t)return;
  const dx=e.clientX-t.x,dy=e.clientY-t.y;move(point.current.x+dx/380*gainRef.current,point.current.y+dy/380*gainRef.current);touch.current={x:e.clientX,y:e.clientY,travel:t.travel+Math.hypot(dx,dy)};
 }
 function padUp(){if(touchRef.current&&touch.current&&touch.current.travel<8&&toolRef.current==='point'){flushPoint();press();}touch.current=null;release();}
 const labels:Record<Tool,string>={point:'Select',draw:'Draw',lasso:'Lasso',orbit:mode==='studio'?'Orbit':'Pan'};
 const paths:Record<Tool,React.ReactNode>={point:<path d="m7 4 12 9-6 1-3 6-3-16Z"/>,draw:<path d="m5 19 2-6L17 3l4 4L11 17l-6 2Zm2-6 4 4"/>,lasso:<path d="M7 18c-6-2-5-13 4-14s14 7 8 11c-6 4-15-1-11-4 3-2 5 3 3 7l-3 3"/>,orbit:<path d="M12 3v18M3 12h18M8 7l4-4 4 4M8 17l4 4 4-4M7 8l-4 4 4 4m10-8 4 4-4 4"/>};
 const padLabel=touchMode?(tool==='point'?'Slide to point · tap to select':`Slide to ${labels[tool].toLowerCase()}`):(tool==='point'?'Tap to select':`Hold to ${labels[tool].toLowerCase()}`);
 return <main className="phone-controller">
  <header className="phone-header"><h1>{mode==='studio'?'Blender':'Excalidraw'}</h1><span className={'connection '+(connection==='Connected'?'online':'')} role="status"><i/>{connection}</span></header>
  <div className="editor-switch" aria-label="Editor">{[['canvas','Excalidraw'],['studio','Blender']].map(([id,label])=><button key={id} disabled={connection!=='Connected'} aria-pressed={mode===id} onClick={()=>{release();voice.current?.stop();setVoiceOn(false);send({type:'target',mode:id})}}>{label}</button>)}</div>
  <div className="input-row"><div className="input-switch"><button aria-pressed={!touchMode} onClick={()=>chooseInput(false)}>Motion</button><button aria-pressed={touchMode} onClick={()=>chooseInput(true)}>Touchpad</button></div><button className="quiet-button" onClick={center}>Recenter</button></div>
  {!motion&&!touchMode&&<button className="enable-motion" onClick={enable}>Enable motion pointing <span>Allow access, then aim at the screen</span></button>}
  <div className="tool-row" role="group" aria-label="Canvas tool">{(['point','draw','lasso','orbit'] as Tool[]).map(t=><button key={t} aria-pressed={t===tool} onClick={()=>chooseTool(t)}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[t]}</svg><span>{labels[t]}</span></button>)}</div>
  <button className={'hold '+(touchMode?'touchpad':'')} disabled={connection!=='Connected'||(!touchMode&&!motion)} onPointerDown={padDown} onPointerMove={padMove} onPointerUp={padUp} onPointerCancel={()=>{touch.current=null;release();}} onLostPointerCapture={()=>{touch.current=null;release();}} onContextMenu={e=>e.preventDefault()}><span>{padLabel}</span><small>{touchMode?'Watch the pointer on your Mac':'Move your phone while looking at your Mac'}</small></button>
  <div className="action-row"><button disabled={busy} onClick={()=>{release();send({type:'undo'})}}>Undo</button><button onClick={()=>{release();send({type:'fit'})}}>Fit view</button><button disabled={!busy} onClick={()=>{send({type:'interrupt'});setNotice('Stopping the current edit.')}}>Stop edit</button></div>
  <button className={'voice-button '+(voiceOn?'active':'')} disabled={connection!=='Connected'} onClick={()=>{if(voiceOn){voice.current?.stop();setVoiceOn(false)}else{setVoiceOn(true);void voice.current?.start()}}}><span className="voice-symbol" aria-hidden="true">{voiceOn?'■':'●'}</span>{voiceOn?'Stop live voice':'Start live voice'}</button>
  <p className="voice-status" role="status">{voiceOn?voiceStatus:busy?'Astra is editing…':'Point to something and tell Astra what to change.'}</p>
  {voiceStatus==='Tap Resume audio'&&<button onClick={()=>voice.current?.resume()}>Resume audio</button>}
  {notice&&<div className="phone-notice" role="status"><span>{notice}</span><button aria-label="Dismiss message" onClick={()=>setNotice('')}>×</button></div>}
  <details><summary>Type a request</summary><form onSubmit={e=>{e.preventDefault();if(text.trim()){send({type:'say',text});setText('')}}}><input aria-label="Request for Astra" placeholder="Make this blue…" value={text} onChange={e=>setText(e.target.value)}/><button disabled={!text.trim()||connection!=='Connected'}>Send</button></form></details>
  <details className="settings"><summary>Pointer settings</summary><div className="gain-row"><span>Sensitivity</span>{[[.65,'Fine'],[1,'Normal'],[1.4,'Fast']].map(([v,label])=><button key={v} aria-pressed={gain===v} onClick={()=>{release();setGain(Number(v));filter.current.forEach(f=>f.reset());try{localStorage.setItem('airspace-gain',String(v))}catch{}}}>{label}</button>)}</div><p>{hz} motion updates/s · {rtt} ms round trip</p><p>Motion aims in the air. Touchpad gives precise control when you want to rest your hand.</p></details>
 </main>
}
createRoot(document.getElementById('root')!).render(location.pathname==='/phone'?<Phone/>:<Pair/>);
