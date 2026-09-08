// Speech facts come from the rendered document, not an invented progress story.
const count=n=>['zero','one','two','three','four','five','six','seven','eight','nine','ten','eleven','twelve'][n]||String(n);
const join=xs=>xs.length<2?xs[0]:xs.length===2?xs.join(' and '):xs.slice(0,-1).join(', ')+', and '+xs.at(-1);
export function sceneSubjects(scene,ids){
 const elements=scene?.elements||[],byId=new Map(elements.map(e=>[e.id,e]));
 const chosen=ids?new Set(ids):null;
 const shapes=elements.filter(e=>!e.isDeleted&&!['text','line','arrow','freedraw'].includes(e.type)&&(!chosen||chosen.has(e.id)));
 const chairs=shapes.filter(e=>/^chair(?:[-_]|$)/i.test(e.id));
 const table=shapes.find(e=>/^table(?:[-_]|$)/i.test(e.id));
 if(table&&chairs.length){const total=elements.filter(e=>!e.isDeleted&&/^chair(?:[-_]|$)/i.test(e.id)).length;return `the ${table.type==='ellipse'&&Math.abs(table.width-table.height)<5?'round ':table.width>table.height*1.5?'long ':''}table and ${count(total)} chairs`;}
 const names=shapes.map(e=>{
  const text=e.boundElements?.find(b=>b.type==='text');if(text&&byId.get(text.id)?.text)return byId.get(text.id).text;
  if(/^chair(?:[-_]|$)/i.test(e.id))return 'the chairs';
  if(/^(?:pot|leaf\d*|plant)(?:[-_]|$)/i.test(e.id))return 'the plant';
  if(/^(?:room|table|whiteboard)(?:[-_]|$)/i.test(e.id))return 'the '+e.id.split(/[-_]/)[0];
  return '';
 }).filter(Boolean);
 return join([...new Set(names)].slice(0,3))||'the selected objects';
}
export function progressSpeech(phase,scene,ids){
 const subjects=sceneSubjects(scene,ids);
 return phase==='applied'?`The changes to ${subjects} are visible now.`:`I’m checking the layout of ${subjects}.`;
}
