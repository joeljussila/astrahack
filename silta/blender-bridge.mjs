import {spawn} from 'node:child_process';
import {mkdir,readFile,writeFile,access} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
const root=fileURLToPath(new URL('.',import.meta.url));
export const artifactRoot=path.join(root,'runtime');
export const blenderPath=process.env.BLENDER_PATH||'blender';
export class BlenderBridge {
 constructor(store){this.store=store;this.queue=Promise.resolve();this.approved=new Set();}
 async available(){if(blenderPath.includes('/')||blenderPath.includes('\\')){try{await access(blenderPath);return true;}catch{return false;}}return new Promise(resolve=>{const p=spawn(blenderPath,['--version'],{windowsHide:true,stdio:'ignore'});const timer=setTimeout(()=>{p.kill();resolve(false);},5000);p.once('error',()=>{clearTimeout(timer);resolve(false);});p.once('close',code=>{clearTimeout(timer);resolve(code===0);});});}
 edit(args,epoch,signal){const work=this.queue.catch(()=>{}).then(()=>this.run('edit',args,epoch,signal));this.queue=work;return work;}
 plan(args,epoch,signal){const work=this.queue.catch(()=>{}).then(()=>this.run('plan',args,epoch,signal));this.queue=work;return work;}
 async run(mode,args,epoch,signal){
  this.store.assertCurrent(args.revision,epoch);if(signal?.aborted)throw Error('Edit cancelled.');
  if(!await this.available())throw Error('Blender is not installed. Configure BLENDER_PATH before building.');
  if(mode==='edit'&&(typeof args.code!=='string'||args.code.length>100000))throw Error('Provide a bounded Blender Python edit.');
  const id=randomUUID(),dir=path.join(artifactRoot,id);await mkdir(dir,{recursive:true});
  const input={mode,code:args.code||'',source:this.store.asset?path.join(artifactRoot,this.store.asset,'scene.blend'):null,output:dir,cutHeight:args.cut_height??1.2};
  await writeFile(path.join(dir,'job.json'),JSON.stringify(input));
  const start=performance.now();
  await new Promise((resolve,reject)=>{
   // Blender runs locally, not as a security sandbox. Never inherit API credentials.
   const env=Object.fromEntries(Object.entries(process.env).filter(([k])=>/^(SYSTEMROOT|WINDIR|PATH|TEMP|TMP|USERPROFILE|APPDATA|LOCALAPPDATA|PROGRAMDATA|PROGRAMFILES|HOMEDRIVE|HOMEPATH)$/i.test(k)));
   const p=spawn(blenderPath,['--background','--factory-startup','--disable-autoexec','--threads','6','--python-exit-code','1','--python',path.join(root,'blender_worker.py'),'--',path.join(dir,'job.json')],{cwd:dir,env,windowsHide:true,stdio:['ignore','pipe','pipe']});let log='';
   const capture=d=>{log=(log+d.toString()).slice(-7000);};p.stdout.on('data',capture);p.stderr.on('data',capture);
   let timedOut=false;const timer=setTimeout(()=>{timedOut=true;p.kill();},90000);const abort=()=>p.kill();signal?.addEventListener('abort',abort,{once:true});
   p.once('error',e=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);reject(e);});
   p.once('close',code=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);if(signal?.aborted)return reject(Error('Edit cancelled.'));if(timedOut)return reject(Error('Blender edit exceeded 90 seconds; previous scene preserved.'));if(code!==0)return reject(Error('Blender edit failed; previous scene preserved. '+log.slice(-2500)));resolve();});
  });
  this.store.assertCurrent(args.revision,epoch);if(signal?.aborted)throw Error('Edit cancelled.');
  const data=JSON.parse(await readFile(path.join(dir,'result.json'),'utf8'));
  if(mode==='edit'){this.store.commit({revision:args.revision,objects:data.objects,asset:id},epoch);}
  else{this.store.plan={asset:id,revision:this.store.revision,cutHeight:input.cutHeight,segments:data.segments};}
  this.approved.add(id);return {...this.store.snapshot(),elapsedMs:Math.round(performance.now()-start),segments:data.segments};
 }
 async preview(){if(!this.store.asset)throw Error('Build geometry before inspecting a render.');return {revision:this.store.revision,data:(await readFile(path.join(artifactRoot,this.store.asset,'preview.png'))).toString('base64')};}
}
