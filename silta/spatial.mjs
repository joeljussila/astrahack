// A phone pointer is an observation of a rendered revision, never a scene mutation.
export const POINTER_PREFIX='[SILTA_POINTER_V1]\n';
export const RESOLVED_PREFIX='[SILTA_POINT_RESOLVED_V1]\n';
export const SPATIAL_EDIT_PREFIX='[SILTA_SPATIAL_EDIT_V1]\n';
export class SpatialContext {
 constructor(store,emit){this.store=store;this.emit=emit;this.points=new Map();this.latest=new Map();}
 key(p){if(typeof p.session!=='string'||!/^[-a-zA-Z0-9]{8,64}$/.test(p.session)||!Number.isSafeInteger(p.seq)||p.seq<0)throw Error('Invalid pointing reference.');return p.session+':'+p.seq;}
 expired(p){return Date.now()-p.at>(p.pinned?600000:60000);}
 prune(){for(const [k,p] of this.points)if(this.expired(p))this.points.delete(k);while(this.points.size>100)this.points.delete(this.points.keys().next().value);}
 move(p){
  const key=this.key(p);if(![p.x,p.y].every(v=>Number.isFinite(v)&&v>=0&&v<=1))throw Error('Invalid pointer coordinates.');
  if(p.clearMark===true){for(const [k,item] of this.points)if(item.session===p.session&&item.seq<=p.seq)this.points.delete(k);this.emit({type:'point_cleared',session:p.session,seq:p.seq});return;}
  this.prune();const last=this.latest.get(p.session)??-1;
  if(p.seq<=last&&!p.capture)return;this.latest.set(p.session,Math.max(last,p.seq));
  if(this.latest.size>12)this.latest.delete(this.latest.keys().next().value);
  if(this.points.has(key))return;
  const point={session:p.session,seq:p.seq,x:p.x,y:p.y,capture:p.capture===true,pinned:p.pinned===true,at:Date.now()};
  if(point.capture)this.points.set(key,point);this.emit({type:'phone_pointer',...point});
 }
 resolve(p){
  const item=this.points.get(this.key(p));if(!item||this.expired(item))throw Error('Pointing reference expired.');
  if(item.resolved)return;
  if(p.revision!==this.store.revision||p.asset!==this.store.asset){this.emit({type:'point_failed',session:p.session,seq:p.seq});throw Error('Pointed view is outdated.');}
  if(p.miss){item.resolved={miss:true};this.emit({type:'point_resolved',session:p.session,seq:p.seq,miss:true});return;}
  if(!Array.isArray(p.world)||p.world.length!==3||!p.world.every(v=>Number.isFinite(v)&&Math.abs(v)<1e6))throw Error('Invalid world point.');
  if(p.objectId!==null&&!this.store.objects.some(o=>o.id===p.objectId))throw Error('Pointed object is unavailable.');
  item.resolved={world:p.world,objectId:p.objectId,revision:p.revision,asset:p.asset};
  this.emit({type:'point_resolved',session:p.session,seq:p.seq,pinned:item.pinned,...item.resolved});
 }
 async context(ref){
  const key=this.key(ref),deadline=Date.now()+2500;
  let item;
  while(Date.now()<deadline){item=this.points.get(key);if(item?.resolved)break;await new Promise(r=>setTimeout(r,35));}
  if(!item?.resolved||this.expired(item))throw Error('Pointing was not confirmed on the display. Aim again and repeat the request.');
  const p=item.resolved;if(p.miss)throw Error('That point misses the model and ground. Aim at a visible surface and repeat.');
  if(p.objectId&&!this.store.objects.some(o=>o.id===p.objectId))throw Error('That object changed or was removed. Point again.');
  // Empty-space and surface points retain their world coordinates across later revisions.
  // The designer must inspect current geometry before acting on this historical observation.
  return {browserWorld:p.world,blenderWorld:[p.world[0],-p.world[2],p.world[1]],objectId:p.objectId,observedRevision:p.revision,currentRevision:this.store.revision,basis:p.objectId?'visible mesh surface':'ground plane at Blender Z=0'};
 }
 reset(){for(const session of new Set([...this.points.values()].map(p=>p.session)))this.emit({type:'point_cleared',session,seq:Number.MAX_SAFE_INTEGER});this.points.clear();this.latest.clear();}
}
