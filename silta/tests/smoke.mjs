import {SceneStore} from '../scene-store.mjs';
import {BlenderBridge} from '../blender-bridge.mjs';
import {readFile,writeFile} from 'node:fs/promises';
const store=new SceneStore(),bridge=new BlenderBridge(store);store.begin();
const result=await bridge.edit({revision:store.revision,code:await readFile(new URL('./architecture.py',import.meta.url),'utf8')},store.epoch);
await writeFile(new URL('./last-fixture.json',import.meta.url),JSON.stringify(result));
console.log(JSON.stringify({asset:result.asset,objects:result.objects.length,elapsedMs:result.elapsedMs}));
