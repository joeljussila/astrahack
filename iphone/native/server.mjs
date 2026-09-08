import http from 'node:http';
import net from 'node:net';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { WebSocketServer, WebSocket } from 'ws';
import { modelName, createPartner } from './model.mjs';
import {voiceModel,createVoiceCall} from './realtime.mjs';
import {sceneContext} from './scene-context.mjs';
import {canvasHost} from './canvas-routing.mjs';
await fs.mkdir('runtime', { recursive: true });
let session;
try {
  session = JSON.parse(await fs.readFile('runtime/session.json', 'utf8'));
  if (Date.now() - session.created > 86400000) session = null;
} catch {}
if (!session) {
  session = {
    id: crypto.randomUUID(),
    host: crypto.randomBytes(24).toString('base64url'),
    phone: crypto.randomBytes(24).toString('base64url'),
    created: Date.now(),
  };
  await fs.writeFile('runtime/session.json', JSON.stringify(session), {
    mode: 0o600,
  });
}
const clients = new Map(),
  pending = new Map();
const state = {
  mode: process.env.TARGET === 'blender' ? 'studio' : 'canvas',
  voiceModel,
  sensorHz: 0,
  tool: 'point',
  color: '#6c78ed',
  pointer: { x: 0.5, y: 0.5 },
  phone: false,
  host: false,
  blender: false,
  scene: null,
  model: modelName,
  busy: false,
  events: [],
};
const reply = (r, status, body) => {
  r.writeHead(status, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
  });
  r.end(JSON.stringify(body));
};
function send(ws, m) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(m));
}
function broadcast(m, role) {
  for (const [ws, r] of clients) if (!role || role === r) send(ws, m);
}
const snapshot = () => ({ ...state, events: state.events.slice(-40) });
const publish = () => broadcast({ type: 'state', state: snapshot() });
function event(role, text) {
  const m = { type: 'event', role, text, at: Date.now() };
  state.events.push(m);
  state.events = state.events.slice(-50);
  broadcast(m);
}
let blenderToken = await fs
  .readFile('runtime/blender-token', 'utf8')
  .catch(() => null);
if (!blenderToken) {
  blenderToken = crypto.randomBytes(32).toString('hex');
  await fs.writeFile('runtime/blender-token', blenderToken, { mode: 0o600 });
}
async function blender(data) {
  const r = await fetch('http://127.0.0.1:4311/command', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${blenderToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
    signal: AbortSignal.timeout(95000),
  });
  const out = await r.json();
  if (out.error) throw Error(out.error);
  return out.result;
}
let gestureQueue = Promise.resolve(),
  lastPointer = null;
function queueGesture(data) {
  gestureQueue = gestureQueue
    .catch(() => {})
    .then(() => blender({ action: 'gesture', ...data }))
    .then((result) => {
      if (result?.objects) {
        state.scene = result;
        publish();
      }
    })
    .catch((e) => {
      state.blender = false;
    });
  return gestureQueue;
}
function flushPointer() {
  if (lastPointer) {
    const p = lastPointer;
    lastPointer = null;
    queueGesture(p);
  }
}
let flushing = false;
setInterval(async () => {
  if (flushing || !lastPointer || state.mode !== 'studio') return;
  flushing = true;
  const p = lastPointer;
  lastPointer = null;
  await queueGesture(p);
  flushing = false;
}, 16);
function sendCanvas(message) {
  const host=canvasHost(clients);if(host)send(host,message);
}
function canvas(command) {
  return new Promise((resolve, reject) => {
    const host = canvasHost(clients);
    if (!host)
      return reject(Error('Open Excalidraw on your Mac first.'));
    const id = crypto.randomUUID(),
      timer = setTimeout(() => {
        pending.delete(id);
        reject(Error('Canvas did not respond. Keep the Excalidraw app open.'));
      }, 25000);
    pending.set(id, { resolve, reject, timer, host });
    send(host, { type: 'canvas', id, command });
  });
}
let grouped = false,
  preview = null;
async function viewportImage() {
  const result = await blender({ action: 'image' });
  preview = result.image;
  broadcast({ type: 'preview', image: preview }, 'host');
  return result;
}
const partner = createPartner({
  event,
  metric:sample=>{void fs.appendFile('runtime/latency.jsonl',JSON.stringify({at:Date.now(),run:runId,...sample})+'\n').catch(()=>{});},
  async tool(name, args, mode, signal) {
    signal?.throwIfAborted();
    await gestureQueue;
    if (mode === 'studio') {
      if (name === 'inspect') return blender({ action: 'inspect' });
      if (name === 'view') return viewportImage();
      if (name === 'python') {
        if (!grouped) {
          await blender({ action: 'begin' });
          grouped = true;
        }
        const result = await blender({ action: 'execute', ...args });
        state.scene = result.scene;
        publish();
        return result;
      }
    } else {
      if (name === 'inspect') return canvas({ action: 'inspect' });
      if (name === 'view') return canvas({ action: 'image' });
      if (name === 'canvas') {
        const result = await canvas({
          action: 'edit',
          ...args,
          group: grouped ? 'continue' : 'begin',
        });
        grouped = true;
        return result;
      }
    }
    throw Error('Tool does not belong to this workspace.');
  },
});
let pendingRequest = null,
  runId = 0;
let activeRun = null, requestVersion=0;
async function ask(text, progress=()=>{}, options={}) {
  const version=++requestVersion;
  if(activeRun){partner.stop();await activeRun;}
  if(version!==requestVersion)return {stopped:true};
  const run=runAsk(text,progress,options);activeRun=run;
  try{return await run}finally{if(activeRun===run)activeRun=null}
}
async function runAsk(text,progress,options) {
  text = String(text || '')
    .trim()
    .slice(0, 8000);
  if (!text) return;
  if (modelName === 'Not connected')
    throw Error('Astra needs your event key. Pointing and drawing are ready.');
  const id = ++runId,
    mode = state.mode;
  state.busy = true;
  grouped = false;
  event('user', text);
  publish();
  const startEvent=Date.now();
  try {
    return await partner.run(text, mode, progress, options);
  } catch (e) {
    if (e.name !== 'AbortError') {event('assistant', e.message);return {error:e.message};}
    else
      event(
        'tool',
        'Stopped. Completed edits are kept; Undo restores the previous scene.',
      );
    return {stopped:true};
  } finally {
    if (id === runId) {
      state.busy = false;
      publish();
      const next = pendingRequest;
      pendingRequest = null;
      if (next) {
        state.mode = next.mode;
        void ask(next.text);
      }
    }
  }
}
async function localCommand(d) {
  if (d.command === 'bootstrap') {
    const base = (
      await fs.readFile('runtime/public-url.txt', 'utf8').catch(() => '')
    ).trim();
    return {
      id: session.id,
      token: session.host,
      socketUrl: 'ws://127.0.0.1:4310/live',
      phoneUrl: base
        ? `${base}/phone#id=${session.id}&token=${session.phone}`
        : '',
      ...snapshot(),
      preview,
    };
  }
  if (d.command === 'mode') {
    if (state.busy)
      throw Error('Stop the current request before changing workspaces.');
    flushPointer();
    await gestureQueue;
    if (state.mode === 'studio') await queueGesture({ type: 'up' });
    else sendCanvas({ type: 'up' });
    state.mode = d.mode === 'studio' ? 'studio' : 'canvas';
    publish();
    return { ok: true };
  }
  if (d.command === 'undo') {
    if (state.busy) throw Error('Stop the current request before undoing.');
    if (state.mode === 'studio') {
      state.scene = await blender({ action: 'undo' });
      publish();
    } else sendCanvas({ type: 'undo-canvas' });
    return { ok: true };
  }
  if (d.command === 'ask') {
    void ask(d.text).catch((e) =>
      broadcast({ type: 'notice', text: e.message }),
    );
    return { ok: true };
  }
  if (d.command === 'stop') {
    requestVersion++;pendingRequest = null;
    partner.stop();
    return { ok: true };
  }
  if (d.command === 'open-blender') {
    spawn('open', ['-a', 'Blender'], { stdio: 'ignore', env: cleanEnv() });
    return { ok: true };
  }
  if (d.command === 'inspect')
    return state.mode === 'studio'
      ? blender({ action: 'inspect' })
      : canvas({ action: 'inspect' });
  if (d.command === 'save') return blender({ action: 'save' });
  if (d.command === 'view') return viewportImage();
  if (d.command === 'frame') { await blender({action:'frame'}); return viewportImage(); }
  throw Error('Unknown command');
}
function input(m, role, ws) {
  if(m.type==='claim-canvas'&&role==='host'){ws.canvasClaim=Date.now();return;}
  if(m.type==='fit'){
    if(state.mode==='canvas')sendCanvas({type:'fit-canvas'});
    else void blender({action:'frame'}).then(scene=>{state.scene=scene;publish()}).catch(e=>send(ws,{type:'notice',text:e.message}));
    return;
  }

  if(m.type==='target'&&role==='phone'&&['canvas','studio'].includes(m.mode)){
    requestVersion++;pendingRequest=null;partner.stop();
    void Promise.resolve(activeRun).then(()=>localCommand({command:'mode',mode:m.mode})).then(async()=>{
      if(m.mode==='studio'){await localCommand({command:'open-blender'});state.scene=await blender({action:'inspect'});state.blender=true;publish()}
    }).catch(e=>send(ws,{type:'notice',text:e.message}));
    return;
  }

  if (m.type === 'canvas-result') {
    if (role !== 'host') return;
    const p = pending.get(m.id);
    if (p && p.host === ws) {
      clearTimeout(p.timer);
      pending.delete(m.id);
      m.error ? p.reject(Error(m.error)) : p.resolve(m.result);
    }
    return;
  }
  if (
    m.type === 'tool' &&
    ['point', 'draw', 'lasso', 'orbit'].includes(m.tool)
  ) {
    flushPointer();
    if (state.mode === 'studio') queueGesture({ type: 'up' });
    else sendCanvas({ type: 'up' });
    state.tool = m.tool;
    broadcast({ type: 'tool', tool: m.tool });
    return;
  }
  if (m.type === 'color' && /^#[0-9a-f]{6}$/i.test(m.color)) {
    state.color = m.color;
    return;
  }
  if (m.type === 'pointer') {
    if (!Number.isFinite(m.x) || !Number.isFinite(m.y)) return;
    state.pointer = {
      x: Math.min(1, Math.max(0, m.x)),
      y: Math.min(1, Math.max(0, m.y)),
    };
    const p = { type: 'pointer', ...state.pointer, color: state.color };
    if (state.mode === 'studio') lastPointer = p;
    else sendCanvas(p);
    return;
  }
  if (m.type === 'down' || m.type === 'up') {
    const data = {
      type: m.type,
      tool: state.tool,
      color: state.color,
      point: state.pointer,
    };
    if (state.mode === 'studio') {
      flushPointer();
      queueGesture(data);
    } else sendCanvas(data);
    return;
  }
  if (m.type === 'undo')
    void localCommand({ command: 'undo' }).catch((e) =>
      broadcast({ type: 'notice', text: e.message }),
    );
  if (m.type === 'say')
    void ask(m.text).catch((e) =>
      broadcast({ type: 'notice', text: e.message }),
    );
  if(m.type==='telemetry'&&role==='phone')state.sensorHz=Math.min(240,Math.max(0,Number(m.sensorHz)||0));
  if (m.type === 'interrupt') {requestVersion++;pendingRequest=null;partner.stop();}
}
function cleanEnv() {
  return Object.fromEntries(
    Object.entries(process.env).filter(
      ([k]) => !/(KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL)/i.test(k),
    ),
  );
}
const voiceCalls=new Map();let lastVoiceStart=0;
const server = http.createServer(async (req, res) => {
  if(req.url==='/voice/session'||req.url==='/voice/tool'){
    if(req.method!=='POST'||req.headers.authorization!==`Bearer ${session.phone}`)return reply(res,403,{error:'Pair your iPhone first'});
    let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>100000)return reply(res,413,{error:'Request too large'})}
    try{
      if(req.url==='/voice/session'){
        if(Date.now()-lastVoiceStart<3000)return reply(res,429,{error:'Wait a moment, then reconnect'});
        lastVoiceStart=Date.now();const sdp=await createVoiceCall(raw,state.mode);
        res.writeHead(200,{'Content-Type':'application/sdp','Cache-Control':'no-store'});return res.end(sdp);
      }
      const d=JSON.parse(raw);
      if(d.name==='inspect_workspace')return reply(res,200,{status:'read_only',appliedEdits:0,scene:sceneContext(await localCommand({command:'inspect'}))});
      if(d.name==='stop_edit'||d.name==='undo_workspace'){
        requestVersion++;pendingRequest=null;partner.stop();await activeRun;
        if(d.name==='stop_edit')return reply(res,200,{status:'stopped',stopped:true});
        if(state.mode==='studio'){
          state.scene=await blender({action:'undo'});publish();
          return reply(res,200,{status:'applied',appliedEdits:1,speech:'Undid my last edit in the scene.'});
        }
        const result=await canvas({action:'undo_agent'});
        event('assistant',result.result);
        return reply(res,200,{status:result.status,appliedEdits:result.receipt?.applied?1:0,receipts:[result.receipt],result:result.result,speech:result.result});
      }
      if(d.name!=='edit_workspace'||typeof d.arguments?.request!=='string'||!d.callId)return reply(res,400,{error:'Invalid voice tool'});
      if(!voiceCalls.has(d.callId)){
        if(voiceCalls.size>100)voiceCalls.delete(voiceCalls.keys().next().value);
        const entry={events:[],listeners:new Set(),promise:null};
        entry.promise=ask(d.arguments.request,update=>{
          entry.events.push(update);for(const listener of entry.listeners)listener(update);
        },{expectEdit:true});
        voiceCalls.set(d.callId,entry);
      }
      const entry=voiceCalls.get(d.callId);
      if(!req.headers.accept?.includes('application/x-ndjson'))return reply(res,200,await entry.promise);
      res.writeHead(200,{'Content-Type':'application/x-ndjson','Cache-Control':'no-store','X-Accel-Buffering':'no'});
      const write=value=>{if(!res.destroyed&&!res.writableEnded)res.write(JSON.stringify(value)+'\n');};
      write({type:'started'});
      const progress=update=>write({type:'progress',...update});
      for(const update of entry.events)progress(update);
      entry.listeners.add(progress);
      const heartbeat=setInterval(()=>write({type:'ping'}),10000);
      res.on('close',()=>{clearInterval(heartbeat);entry.listeners.delete(progress);});
      try{write({type:'complete',result:await entry.promise});}
      finally{clearInterval(heartbeat);entry.listeners.delete(progress);res.end();}
      return;
    }catch(e){return reply(res,400,{error:e.message})}
  }

  if (req.url === '/local') {
    if (
      req.method !== 'POST' ||
      req.headers.origin ||
      req.headers['cf-ray'] ||
      req.headers.host !== '127.0.0.1:4310'
    )
      return reply(res, 403, { error: 'Local only' });
    let raw = '';
    for await (const chunk of req) {
      raw += chunk;
      if (raw.length > 20000)
        return reply(res, 413, { error: 'Request too large' });
    }
    try {
      reply(res, 200, await localCommand(JSON.parse(raw)));
    } catch (e) {
      reply(res, 400, { error: e.message });
    }
    return;
  }
  let pathname;
  try {
    pathname = decodeURIComponent(
      new URL(req.url, 'http://localhost').pathname,
    );
  } catch {
    return reply(res, 400, { error: 'Invalid path' });
  }
  if (
    /(?:^|\/)(?:runtime|native|tests|\.git|\.env[^/]*|@fs)(?:\/|$)/.test(
      pathname,
    )
  )
    return reply(res, 404, { error: 'Not found' });
  const proxy = http.request(
    {
      hostname: '127.0.0.1',
      port: 3002,
      path: req.url,
      method: req.method,
      headers: req.headers,
    },
    (up) => {
      res.writeHead(up.statusCode, up.headers);
      up.pipe(res);
    },
  );
  proxy.on('error', () => {
    res.writeHead(503);
    res.end('Airspace is starting. Refresh shortly.');
  });
  req.pipe(proxy);
});
const wss = new WebSocketServer({ noServer: true, maxPayload: 8000000 });
server.on('upgrade', (req, socket, head) => {
  if (req.url === '/live') {
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws));
    return;
  }
  const up = net.connect(3002, '127.0.0.1', () => {
    up.write(
      `${req.method} ${req.url} HTTP/${req.httpVersion}\r\n` +
        Object.entries(req.headers)
          .map(([k, v]) => `${k}: ${v}`)
          .join('\r\n') +
        '\r\n\r\n',
    );
    if (head.length) up.write(head);
    socket.pipe(up);
    up.pipe(socket);
  });
  up.on('error', () => socket.destroy());
  socket.on('error', () => up.destroy());
  socket.on('close', () => up.destroy());
});
wss.on('connection', (ws) => {
  let role;
  const deadline = setTimeout(() => ws.close(), 6000);
  ws.on('message', (raw) => {
    let m;
    try {
      m = JSON.parse(raw);
    } catch {
      return ws.close();
    }
    if (!role) {
      if (
        m.type !== 'join' ||
        m.id !== session.id ||
        ![session.host, session.phone].includes(m.token)
      )
        return ws.close(1008, 'Pair again');
      role = m.token === session.host ? 'host' : 'phone';
      const previousCanvas=canvasHost(clients);
      ws.canvasPriority=m.client==='desktop'?10:0;
      ws.canvasClaim=Date.now();
      clients.set(ws, role);
      const nextCanvas=canvasHost(clients);
      if(previousCanvas&&previousCanvas!==nextCanvas){
        send(previousCanvas,{type:'up'});
        send(previousCanvas,{type:'disconnected'});
        if(state.mode==='canvas'&&state.busy)partner.stop();
      }
      clearTimeout(deadline);
      state.phone = [...clients.values()].includes('phone');
      state.host = [...clients.values()].includes('host');
      send(ws, { type: 'joined', state: snapshot() });
      if (role === 'host' && preview)
        send(ws, { type: 'preview', image: preview });
      broadcast({ type: 'presence', phone: state.phone, host: state.host });
      return;
    }
    if (role === 'phone' && raw.length > 16000) return ws.close(1009);
    if (m.type === 'ping') {
      send(ws, { type: 'pong', at: m.at });
      return;
    }
    input(m, role, ws);
  });
  ws.on('close', () => {
    clearTimeout(deadline);
    clients.delete(ws);
    for(const [id,p] of pending){if(p.host===ws){clearTimeout(p.timer);pending.delete(id);p.reject(Error('The canvas closed. Reopen it and try again.'));}}
    state.phone = [...clients.values()].includes('phone');
    state.host = [...clients.values()].includes('host');
    if (role === 'phone') {
      flushPointer();
      if (state.mode === 'studio') queueGesture({ type: 'up' });
      else sendCanvas({ type: 'up' });
    }
    broadcast({ type: 'presence', phone: state.phone, host: state.host });
  });
});
let pollBusy = false;
setInterval(async () => {
  if (state.mode !== 'studio' || pollBusy || state.busy) return;
  pollBusy = true;
  try {
    const scene = await blender({ action: 'inspect' });
    const changed =
      !state.blender || JSON.stringify(scene) !== JSON.stringify(state.scene);
    state.blender = true;
    state.scene = scene;
    if (changed) publish();
  } catch {
    if (state.blender) {
      state.blender = false;
      publish();
    }
  } finally {
    pollBusy = false;
  }
}, 2000);
server.listen(4310, '127.0.0.1', () =>
  console.log('Airspace local bridge ready on 4310. Model: ' + modelName),
);
