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
 const [connection,setConnection]=useState('Connecting'),[tool,setTool]=useState<Tool>('point'),[notice,setNotice]=useState(''),[motion,setMotion]=useState(false),[hz,setHz]=useState(0),[rtt,setRtt]=useState(0),[voiceStatus,setVoiceStatus]=useState('Voice off'),[voiceOn,setVoiceOn]=useState(false),[text,setText]=useState(''),[touchMode,setTouchMode]=useState(false);
 const link=useRef<ReturnType<typeof channel>|null>(null),voice=useRef<LiveVoice|null>(null),attitude=useRef<Attitude|null>(null),base=useRef<Frame|null>(null),filter=useRef([new Smooth(),new Smooth()]),point=useRef({x:.5,y:.5}),count=useRef(0),held=useRef(false),sensor=useRef<((e:DeviceOrientationEvent)=>void)|null>(null),wake=useRef<any>(null),touch=useRef<{x:number;y:number}|null>(null),touchRef=useRef(touchMode);
 touchRef.current=touchMode;
 const send=(m:Message)=>link.current?.send(m);
 function release(){if(held.current){held.current=false;send({type:'up'})}}
 function move(x:number,y:number){point.current={x:bound(x),y:bound(y)};send({type:'pointer',...point.current})}
 function center(){release();if(attitude.current)base.current=frame(attitude.current);filter.current.forEach(f=>f.reset());move(.5,.5)}
 useEffect(()=>{
  const hash=new URLSearchParams(location.hash.slice(1)),id=hash.get('id'),token=hash.get('token');
  if(!id||!token){setConnection('Scan the QR on your Mac');return}
  link.current=channel(`${location.protocol==='https:'?'wss':'ws'}://${location.host}/live`,id,token,m=>{
   if(m.type==='pong')setRtt(Math.round(performance.now()-m.at));
   if(m.type==='joined'||m.type==='state')setTool(m.state.tool);
   if(m.type==='notice')setNotice(m.text);
  },setConnection);
  voice.current=new LiveVoice(token,setVoiceStatus,setNotice,()=>send({type:'interrupt'}));
  const timer=setInterval(()=>{setHz(count.current);send({type:'telemetry',sensorHz:count.current});count.current=0;send({type:'ping',at:performance.now()})},1000);
  const hide=()=>{if(document.hidden){release();voice.current?.stop();setVoiceOn(false)}};document.addEventListener('visibilitychange',hide);
  return()=>{clearInterval(timer);release();link.current?.close();voice.current?.stop();if(sensor.current)window.removeEventListener('deviceorientation',sensor.current);wake.current?.release();document.removeEventListener('visibilitychange',hide)};
 },[]);
 async function enable(){try{
  const Sensor=DeviceOrientationEvent as typeof DeviceOrientationEvent&{requestPermission?:()=>Promise<string>};
  if(Sensor.requestPermission&&await Sensor.requestPermission()!=='granted')throw Error('Motion permission denied. Use Touchpad or enable it in Safari.');
  if(sensor.current)window.removeEventListener('deviceorientation',sensor.current);
  sensor.current=e=>{if(e.alpha===null||e.beta===null||e.gamma===null)return;attitude.current={alpha:e.alpha,beta:e.beta,gamma:e.gamma};count.current++;if(!base.current)base.current=frame(attitude.current);if(touchRef.current||document.hidden)return;const p=aim(attitude.current,base.current);if(p){const t=performance.now();move(filter.current[0].update(.5+p.x*1.1,t),filter.current[1].update(.5+p.y*1.65,t))}};
  window.addEventListener('deviceorientation',sensor.current);setMotion(true);setNotice('Aim at the screen and tap Recenter.');try{wake.current=await(navigator as any).wakeLock?.request('screen')}catch{}
 }catch(e){setNotice((e as Error).message)}}
 return <main><h1>iPhone controller</h1><p role="status">{connection} · {hz} sensor updates/s · {rtt} ms</p><button onClick={enable}>{motion?'Motion enabled':'Enable motion'}</button><button onClick={center}>Recenter</button><button onClick={()=>{release();setTouchMode(!touchMode)}}>{touchMode?'Use motion':'Use touchpad'}</button>
 {touchMode&&<div className="touchpad" onPointerDown={e=>{e.currentTarget.setPointerCapture(e.pointerId);touch.current={x:e.clientX,y:e.clientY}}} onPointerMove={e=>{if(touch.current){move(point.current.x+(e.clientX-touch.current.x)/400,point.current.y+(e.clientY-touch.current.y)/400);touch.current={x:e.clientX,y:e.clientY}}}} onPointerUp={()=>touch.current=null} onPointerCancel={()=>touch.current=null}>Slide to point</div>}
 <div>{(['point','draw','lasso','orbit'] as Tool[]).map(t=><button key={t} aria-pressed={t===tool} onClick={()=>{release();setTool(t);send({type:'tool',tool:t})}}>{t}</button>)}</div>
 <button className="hold" disabled={connection!=='Connected'} onPointerDown={e=>{e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);held.current=true;send({type:'down'})}} onPointerUp={release} onPointerCancel={release} onLostPointerCapture={release} onContextMenu={e=>e.preventDefault()}>{tool==='point'?'Tap to select':`Hold to ${tool}`}</button>
 <button onClick={()=>send({type:'undo'})}>Undo</button><hr/><button disabled={connection!=='Connected'} onClick={()=>{if(voiceOn){voice.current?.stop();setVoiceOn(false)}else{setVoiceOn(true);void voice.current?.start()}}}>{voiceOn?'Stop live voice':'Start live voice'}</button>{voiceStatus==='Tap Resume audio'&&<button onClick={()=>voice.current?.resume()}>Resume audio</button>}<p role="status">{voiceStatus}</p><p>{notice}</p><details><summary>Type a request</summary><form onSubmit={e=>{e.preventDefault();send({type:'say',text});setText('')}}><input value={text} onChange={e=>setText(e.target.value)}/><button>Send</button></form></details></main>
}
createRoot(document.getElementById('root')!).render(location.pathname==='/phone'?<Phone/>:<Pair/>);
