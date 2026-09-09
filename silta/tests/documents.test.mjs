import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {SceneStore} from '../scene-store.mjs';
import {DocumentService,calculateReport,validRecipient,runDocumentWorker,roundedEuros,roughRange} from '../documents.mjs';
import {routeVoiceTool} from '../voice-client.mjs';
const dir=fileURLToPath(new URL('../runtime/document-tests/',import.meta.url));await mkdir(dir,{recursive:true});
const report=calculateReport({location:'Finland (illustrative)',area_m2:100,area_basis:'user hypothetical area',scope:'Timber cabin materials only; assumed rates excluding VAT.',items:[{name:'Timber structure and exterior walls',quantity:100,unit:'m2 floor area',rate_low:300,rate_high:500,basis:'Assumed allowance per hypothetical gross floor area, not measured timber volume.'},{name:'Insulation and roofing',quantity:100,unit:'m2 floor area',rate_low:150,rate_high:250,basis:'Assumed area allowance; final roof takeoff is unavailable.'},{name:'Windows and doors',quantity:1,unit:'allowance',rate_low:12000,rate_high:20000,basis:'Unquoted budget allowance for glazing and entrance doors.'}],assumptions:['100 m2 is a hypothetical user scenario, not measured floor area.'],exclusions:['Labour, foundations, services, site works, taxes and design fees are excluded.'],sources:['Illustrative test allowances; no supplier quotes or live research.']});
test('material subtotals and totals are calculated independently',()=>{assert.equal(report.total_low,57000);assert.equal(report.total_high,95000);assert.throws(()=>calculateReport({...report,items:[{quantity:1,rate_low:20,rate_high:10}]}),/invalid/);});
test('spoken allowances round euros consistently without claiming tiny amounts are free',()=>{
 assert.equal(roundedEuros(84499),84000);assert.equal(roundedEuros(84500),85000);
 assert.equal(roughRange(84499,95555),'EUR 84,000 to 96,000');assert.equal(roughRange(10,400),'under EUR 1,000');
 assert.equal(roughRange(84010,84400),'about EUR 84,000');
});
test('recipient validation rejects header injection and multiple recipients',()=>{assert.equal(validRecipient('architect@example.com'),true);for(const x of ['a@example.com\r\nBcc: b@example.com','a@example.com,b@example.com','not-an-email'])assert.equal(validRecipient(x),false);});
test('voice document requests use the document transport without becoming geometry requests',()=>{const r=routeVoiceTool({name:'create_document',arguments:{kind:'cost',delivery:'download',recipient:null,request:'100 m2'}});assert.match(r.arguments.request,/^\[SILTA_DOCUMENT_V1\]/);assert.equal(JSON.parse(r.arguments.request.split('\n')[1]).kind,'cost');});
test('download saves an actual PDF and email needs sender setup',async()=>{
 const pdf=path.join(dir,'sample-cost.pdf');await runDocumentWorker({kind:'cost',output:pdf,meta:{revision:7},report});assert.equal((await readFile(pdf)).subarray(0,5).toString(),'%PDF-');
 const s=new DocumentService({store:new SceneStore(),downloads:path.join(dir,'Downloads-'+process.pid)});s.records.set('one',{id:'one',file:pdf,filename:'sample-cost.pdf',kind:'cost',revision:7,deliveries:new Set()});s.latest='one';
 const r=await s.deliver({delivery:'both',recipient:'architect@example.com'});assert.equal(r.downloaded,true);assert.match(r.emailError,/Connect a sender/);assert.deepEqual(await readFile(path.join(dir,'Downloads-'+process.pid,'sample-cost.pdf')),await readFile(pdf));
 assert.equal((await s.deliver({delivery:'download'})).downloaded,true);
});
test('email is sent once; uncertain sends are not blindly retried',async()=>{
 let calls=0;const service=new DocumentService({store:new SceneStore(),worker:async()=>{calls++;return {accepted:true};}});service.configure({host:'smtp.example.com',port:465,user:'sender@example.com',password:'test-only'});service.records.set('doc',{id:'doc',file:'sample.pdf',filename:'sample.pdf',revision:1,kind:'blueprint',deliveries:new Set()});service.latest='doc';
 await service.deliver({delivery:'email',recipient:'architect@example.com'});await service.deliver({delivery:'email',recipient:'architect@example.com'});assert.equal(calls,1);
 service.worker=async()=>{calls++;throw Error('Uncertain provider response');};assert.match((await service.deliver({delivery:'email',recipient:'second@example.com'})).emailError,/Uncertain/);await service.deliver({delivery:'email',recipient:'second@example.com'});assert.equal(calls,2);
});
test('a scene change prevents publication of an outdated estimate PDF',async()=>{
 const store=new SceneStore();const s=new DocumentService({store,worker:async()=>{store.begin();}});s.estimate=async()=>({...report,area_basis:'model bounds proxy'});await assert.rejects(s.create({kind:'cost',delivery:'download'}),/scene changed/);assert.equal(s.records.size,0);
});
