export class SceneStore {
 revision=0; epoch=0; objects=[]; selection=null; checkpoints=[]; asset=null; plan=null;
 snapshot(){return structuredClone({revision:this.revision,objects:this.objects,selection:this.selection,asset:this.asset,plan:this.plan?.revision===this.revision?this.plan:null,canUndo:!!this.checkpoints.length});}
 begin(){this.checkpoints.push(this.snapshot());if(this.checkpoints.length>30)this.checkpoints.shift();this.invalidate();}
 invalidate(){this.epoch++;this.revision++;this.plan=null;}
 assertCurrent(revision,epoch){if(revision!==this.revision||epoch!==this.epoch)throw Error('Scene or instructions changed. Inspect the latest revision and recompute.');}
 commit({revision,objects,asset},epoch){this.assertCurrent(revision,epoch);if(!Array.isArray(objects)||objects.length>3000)throw Error('Scene exceeds the demo object limit.');const ids=new Set();for(const o of objects){if(!o.id||ids.has(o.id)||!Array.isArray(o.position)||!Array.isArray(o.size)||[...o.position,...o.size].some(n=>!Number.isFinite(n)))throw Error('Invalid Blender scene metadata.');ids.add(o.id);}
 for(const old of this.objects.filter(o=>o.protected)){const next=objects.find(o=>o.id===old.id);if(!next||next.fingerprint!==old.fingerprint)throw Error('The edit changed a protected place. Preserve it and retry.');next.protected=true;}
 this.objects=objects;this.asset=asset;this.plan=null;this.revision++;if(!ids.has(this.selection))this.selection=null;return this.snapshot();}
 undo(){const p=this.checkpoints.pop();this.invalidate();if(p){this.objects=p.objects;this.selection=p.selection;this.asset=p.asset;}return this.snapshot();}
 clear(){this.begin();this.objects=[];this.selection=null;this.asset=null;return this.snapshot();}
 protect({revision,id,protected:locked},epoch){this.assertCurrent(revision,epoch);const o=this.objects.find(o=>o.id===id);if(!o||typeof locked!=='boolean')throw Error('Choose a current object.');o.protected=locked;this.revision++;this.plan=null;return this.snapshot();}
}
export function measure(s){const conflicts=[];for(const b of s.objects.filter(o=>o.kind==='building'))for(const p of s.objects.filter(o=>o.kind==='path'))if(Math.abs(b.position[0]-p.position[0])<(b.size[0]+p.size[0])/2&&Math.abs(b.position[2]-p.position[2])<(b.size[2]+p.size[2])/2)conflicts.push({building:b.id,path:p.id});return {revision:s.revision,buildings:s.objects.filter(o=>o.kind==='building').length,homes:s.objects.filter(o=>o.kind==='building').reduce((n,o)=>n+(o.homes||0),0),pathIntersections:conflicts,method:'Bounds of evaluated Blender geometry, projected onto the ground. Conservative overlap test, not a route-connectivity or regulatory check. Dwelling counts are explicit design assumptions.'};}
