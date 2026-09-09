
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {WebSocketServer} from 'ws';
import QRCode from 'qrcode';
import {timingSafeEqual} from 'node:crypto';
const publicOrigin=process.env.PHONE_ORIGIN;
if(!publicOrigin||new URL(publicOrigin).protocol!=='https:')throw Error('Set PHONE_ORIGIN to the temporary HTTPS tunnel origin.');
const publicHost=new URL(publicOrigin).host;
const bootstrap=await fetch('http://127.0.0.1:4173/bootstrap').then(r=>r.json());
if(!bootstrap.token)throw Error('Start the local display first.');
const token=bootstrap.token,phoneUrl=publicOrigin+'/phone#'+token;
const qr=await QRCode.toDataURL(phoneUrl,{width:300,margin:2,errorCorrectionLevel:'M'});
const allowedGet=new Set(['/api/status']);
const allowedPost=new Set(['/api/select','/voice/session','/voice/state','/voice/transcript','/voice/tool']);
const assets=new Map([['/phone','phone.html'],['/phone.mjs','phone.mjs'],['/voice-client.mjs','voice-client.mjs'],['/style.css','style.css']]);
const same=s=>typeof s==='string'&&Buffer.byteLength(s)===Buffer.byteLength(token)&&timingSafeEqual(Buffer.from(s),Buffer.from(token));
function local(req){if(['cf-ray','cf-connecting-ip','x-forwarded-for','x-forwarded-host'].some(h=>req.headers[h]))return false;return ['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress)&&['127.0.0.1:4175','localhost:4175'].includes(req.headers.host);}
function allowedOrigin(req){return !req.headers.origin||[publicOrigin,'http://127.0.0.1:4173','http://localhost:4173','http://127.0.0.1:4175'].includes(req.headers.origin);}
function reply(res,code,data){res.writeHead(code,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));}
const server=http.createServer(async(req,res)=>{
 res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Content-Type-Options','nosniff');
 try{
  if(!allowedOrigin(req))return reply(res,403,{error:'Origin not allowed.'});
  const url=new URL(req.url,'http://127.0.0.1:4175');
  if(url.pathname==='/pairing'){
   if(!local(req)||req.method!=='GET')return reply(res,403,{error:'Pair on the local display.'});
   if(req.headers.origin)res.setHeader('Access-Control-Allow-Origin',req.headers.origin);
   return reply(res,200,{phoneUrl,qr});
  }
  if(!local(req)&&req.headers.host!==publicHost)return reply(res,403,{error:'Host not allowed.'});
  if(assets.has(url.pathname)&&req.method==='GET'){
   const file=assets.get(url.pathname);let text=await readFile(new URL(file,import.meta.url),'utf8');
   if(file==='phone.html')text=text.replace('</head>','<meta name="astra-phone-feed" content="websocket"></head>');
   res.writeHead(200,{'Content-Type':file.endsWith('.html')?'text/html':file.endsWith('.css')?'text/css':'text/javascript','Cache-Control':'no-store'});return res.end(text);
  }
  if(!((req.method==='GET'&&allowedGet.has(url.pathname))||(req.method==='POST'&&allowedPost.has(url.pathname))))return reply(res,404,{error:'Not found.'});
  if(!same(req.headers.authorization?.replace(/^Bearer /,'')))return reply(res,401,{error:'Scan the paired link on the display.'});
  let payload='';for await(const c of req){payload+=c;if(Buffer.byteLength(payload)>120000)throw Error('Request too large.');}
  const upstream=await fetch('http://127.0.0.1:4173'+url.pathname,{method:req.method,headers:{Authorization:'Bearer '+token,'Content-Type':req.headers['content-type']||'application/json'},body:req.method==='POST'?payload:undefined,signal:AbortSignal.timeout(40000)});
  res.writeHead(upstream.status,{'Content-Type':upstream.headers.get('content-type')||'application/json','Cache-Control':'no-store'});res.end(await upstream.text());
 }catch(e){reply(res,400,{error:String(e.message).replace(/sk-[\w.*-]+/g,'[redacted]')});}
});
const wss=new WebSocketServer({noServer:true,maxPayload:8192});
server.on('upgrade',(req,socket,head)=>{
 const url=new URL(req.url,'http://127.0.0.1:4175');
 if(url.pathname!=='/phone-events'||!allowedOrigin(req)||(!local(req)&&req.headers.host!==publicHost)||!same(url.searchParams.get('token'))){socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');return;}
 wss.handleUpgrade(req,socket,head,ws=>{
  // Convert only the local SSE stream to WebSocket: Quick Tunnels do not carry SSE.
  let buffer='';const upstream=http.get('http://127.0.0.1:4173/events?phone=1&token='+token,res=>{
   res.setEncoding('utf8');res.on('data',chunk=>{buffer+=chunk;let end;while((end=buffer.indexOf('\n\n'))>=0){const block=buffer.slice(0,end);buffer=buffer.slice(end+2);for(const line of block.split('\n'))if(line.startsWith('data: ')&&ws.readyState===1)ws.send(line.slice(6));}});
   res.on('end',()=>ws.close());
  });
  upstream.on('error',()=>ws.close());let alive=true;
  ws.on('pong',()=>alive=true);
  const heartbeat=setInterval(()=>{if(!alive)return ws.terminate();alive=false;ws.ping();},20000);
  ws.on('close',()=>{clearInterval(heartbeat);upstream.destroy();});ws.on('error',()=>upstream.destroy());
 });
});
server.listen(4175,'127.0.0.1',()=>console.log('Phone bridge ready. Pairing QR is available on the local display.'));
