// A committed Blender artifact is not evidence that the TV has rendered it.
export class DisplaySync {
 constructor(store,emit){this.store=store;this.emit=emit;this.pending=null;this.announced=new Set();}
 publish(scene,summary){this.pending={asset:scene.asset,summary};}
 acknowledge({asset,revision}){
  if(!asset||asset!==this.store.asset||revision!==this.store.revision)throw Error('Display acknowledgment is outdated.');
  if(this.pending?.asset!==asset||this.announced.has(asset))return;
  this.announced.add(asset);if(this.announced.size>100)this.announced.delete(this.announced.values().next().value);
  this.emit({type:'display_visible',asset,revision,text:this.pending.summary});this.pending=null;
 }
 reset(){this.pending=null;}
}
