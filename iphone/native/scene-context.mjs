// Model context is a view of the document, never its persistence format.
export function sceneContext(scene) {
  if (!scene?.elements) return scene;
  const elements = scene.elements.filter(e => !e.isDeleted);
  const byId = new Map(elements.map(e => [e.id,e]));
  const fields = ['id','type','x','y','width','height','angle','text','fontSize','fontFamily','containerId','strokeColor','backgroundColor','strokeWidth','opacity','locked','groupIds','startBinding','endBinding','startArrowhead','endArrowhead','elbowed','fileId'];
  return {...scene, elements:elements.map(e => {
    const out = Object.fromEntries(fields.filter(k => e[k] !== undefined && e[k] !== null).map(k => [k,e[k]]));
    const label = e.boundElements?.find(b => b.type === 'text');
    if (label && byId.has(label.id)) out.label = {id:label.id,text:byId.get(label.id).text};
    if (e.points) {
      const stride = e.type === 'freedraw' ? Math.max(1,Math.ceil(e.points.length/48)) : 1;
      out.points = e.points.filter((_,i) => i%stride===0 || i===e.points.length-1);
    }
    return out;
  })};
}

export function spokenScene(scene) {
  if(!scene?.elements)return {objects:scene?.objects||[]};
  const byId=new Map(scene.elements.map(e=>[e.id,e]));
  const label=e=>e?.text||e?.boundElements?.map(b=>byId.get(b.id)?.text).filter(Boolean).join(' ')||e?.type;
  return {objects:scene.elements.filter(e=>!e.isDeleted&&!['text','arrow','line','freedraw'].includes(e.type)).map(e=>({name:label(e),x:Math.round(e.x),y:Math.round(e.y),width:Math.round(e.width),height:Math.round(e.height)})).slice(0,35),connections:scene.elements.filter(e=>e.type==='arrow').map(e=>({from:label(byId.get(e.startBinding?.elementId)),to:label(byId.get(e.endBinding?.elementId)),label:label(e)})).slice(0,40),coordinates:'x increases to the right; y increases downwards'};
}
