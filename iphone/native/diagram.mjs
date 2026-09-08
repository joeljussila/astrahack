import dagre from '@dagrejs/dagre';
import {randomUUID} from 'node:crypto';
const palette={client:'#d0ebff',service:'#d3f9d8',data:'#fff3bf',compute:'#e5dbff',default:'#e7f5ff'};
const wrap=text=>String(text).split('\n').flatMap(line=>{
  const lines=[];let current='';for(const word of line.split(/\s+/)){if(current.length+word.length>23){lines.push(current);current='';}current+=(current?' ':'')+word;}if(current)lines.push(current);return lines;
}).join('\n');
export function diagramEdit(args,scene) {
  if(!Array.isArray(args.nodes)||!args.nodes.length||args.nodes.length>60)throw Error('Diagram needs 1–60 nodes.');
  if(!Array.isArray(args.edges)||args.edges.length>100)throw Error('Diagram needs at most 100 edges.');
  const existing=new Map(scene.elements.map(e=>[e.id,e])), ids=new Map();
  const graph=new dagre.graphlib.Graph({multigraph:true});
  graph.setGraph({rankdir:args.direction==='LR'?'LR':'TB',ranksep:100,nodesep:70,edgesep:28,marginx:16,marginy:16});graph.setDefaultEdgeLabel(()=>({}));
  for(const node of args.nodes){
    if(typeof node.id!=='string'||!node.id||ids.has(node.id)||typeof node.label!=='string')throw Error('Each diagram node needs a unique id and label.');
    ids.set(node.id,existing.has(node.id)?node.id:`diagram-${randomUUID()}`);
    const text=wrap(node.label),lines=text.split('\n');
    graph.setNode(node.id,{label:text,width:Math.max(190,Math.max(...lines.map(l=>l.length))*12+36),height:Math.max(76,lines.length*28+28)});
  }
  args.edges.forEach((edge,i)=>{
    if(!ids.has(edge.from)||!ids.has(edge.to))throw Error('An edge refers to a node absent from this diagram.');
    graph.setEdge(edge.from,edge.to,{width:edge.label?Math.min(220,edge.label.length*10):0,height:edge.label?26:0},String(i));
  });
  // For a tree, preserve sibling input order instead of gratuitously reversing
  // it. Let Dagre order general graphs to reduce crossings.
  const tree=args.nodes.every(n=>args.edges.filter(e=>e.to===n.id).length<=1);
  dagre.layout(graph,{disableOptimalOrderHeuristic:tree});
  const affected=args.nodes.map(n=>existing.get(n.id)).filter(Boolean);
  const x=Number.isFinite(args.x)?args.x:affected.length?Math.min(...affected.map(e=>e.x)):scene.elements.length?Math.max(...scene.elements.map(e=>e.x+e.width))+100:0;
  const y=Number.isFinite(args.y)?args.y:affected.length?Math.min(...affected.map(e=>e.y)):0;
  const add=[],patch=[];
  for(const node of args.nodes){
    const box=graph.node(node.id),old=existing.get(node.id);
    const style={x:x+box.x-box.width/2,y:y+box.y-box.height/2,width:box.width,height:box.height};
    if(old){patch.push({id:old.id,...style,label:{text:box.label,fontSize:22}});}
    else add.push({id:ids.get(node.id),type:'rectangle',...style,roundness:{type:3},roughness:0.7,strokeWidth:1.5,strokeColor:'#343a40',backgroundColor:palette[node.kind]||palette.default,fillStyle:'solid',label:{text:box.label,fontSize:22}});
  }
  args.edges.forEach((edge,i)=>{
    const route=graph.edge({v:edge.from,w:edge.to,name:String(i)}).points;
    const first=route[0],last=route.at(-1);
    const old=scene.elements.find(e=>e.type==='arrow'&&e.startBinding?.elementId===ids.get(edge.from)&&e.endBinding?.elementId===ids.get(edge.to));
    const arrow={id:old?.id||`edge-${randomUUID()}`,type:'arrow',x:x+first.x,y:y+first.y,width:Math.abs(last.x-first.x),height:Math.abs(last.y-first.y),points:route.map(p=>[p.x-first.x,p.y-first.y]),start:{id:ids.get(edge.from)},end:{id:ids.get(edge.to)},strokeColor:'#495057',strokeWidth:1.5,roughness:0, ...(edge.label?{label:{text:edge.label,fontSize:18}}:{})};
    if(old)patch.push(arrow);else add.push(arrow);
  });
  return {revision:scene.revision,add,patch,delete:args.delete||[],frame:args.frame===true||!scene.elements.length};
}
