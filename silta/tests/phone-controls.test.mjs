import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {frame,aim,bound,Smooth,MarkedTarget} from '../voice-client.mjs';

test('first phone orb tap marks the moved cursor without recentering; only Recenter resets it',async()=>{
 const elements=new Map(),listeners={},requests=[];let call,feed;
 const node=id=>elements.get(id)||elements.set(id,{dataset:{},hidden:true,textContent:'',setAttribute(k,v){this[k]=v;},removeAttribute(k){delete this[k];}}).get(id);
 const sandbox={frame,aim,bound,Smooth,MarkedTarget,routeVoiceTool:d=>d,
  VoiceCall:class{constructor(c){call=c;}async start(){call.onState('active');}stop(){}update(){}},
  EventSource:class{constructor(){feed=this;}},location:{hash:'#test',pathname:'/phone'},sessionStorage:{setItem(){}},history:{replaceState(){}},
  document:{hidden:false,getElementById:node,querySelector:()=>false},screen:{orientation:{addEventListener(){}}},
  window:{addEventListener:(k,v)=>listeners[k]=v},DeviceOrientationEvent:class{},crypto:{randomUUID:()=> 'phone-test-123'},
  performance:{now:()=>1000},setInterval:()=>0,clearInterval(){},setTimeout:()=>0,clearTimeout(){},addEventListener(){},
  fetch:async(path,opts)=>{const data=opts.body?JSON.parse(opts.body):null;if(data)requests.push(data);return {ok:true,json:async()=>({configured:true})};}};
 const source=(await readFile(new URL('../phone.mjs',import.meta.url),'utf8')).replace(/^import .*?;\s*/, '');
 await vm.runInNewContext('(async()=>{'+source+'})()',sandbox);
 await node('microphone').onclick();listeners.deviceorientation({alpha:0,beta:30,gamma:0});
 assert.equal(node('orb')['aria-label'],'Mark this spot');assert.equal(requests.some(r=>r.arguments?.request.includes('clearMark')),false);
 listeners.deviceorientation({alpha:12,beta:35,gamma:0});node('orb').onclick();
 const mark=JSON.parse(requests.at(-1).arguments.request.split('\n')[1]);assert.equal(mark.capture,true);assert.equal(mark.pinned,true);assert.notEqual(mark.x,.5);assert.equal(requests.some(r=>r.arguments?.request.includes('clearMark')),false);
 feed.onmessage({data:JSON.stringify({type:'point_resolved',...mark,world:[4,0,8],objectId:null})});assert.equal(node('orb').dataset.marked,'true');
 listeners.deviceorientation({alpha:25,beta:40,gamma:0});const target=call.onSpeechStart();assert.equal(target.seq,mark.seq);
 assert.equal(node('point-hint').textContent,'Spot marked. Say what to add here.');
 node('recenter').onclick();assert.equal(requests.at(-1).arguments.request.includes('clearMark'),true);assert.equal(node('orb').dataset.marked,undefined);assert.notEqual(call.onSpeechStart().seq,mark.seq);
});
