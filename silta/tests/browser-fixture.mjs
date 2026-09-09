process.env.PORT='4176';
const {store,blender}=await import('../server.mjs');
const {readFile}=await import('node:fs/promises');
const data=JSON.parse(await readFile(new URL('./last-fixture.json',import.meta.url),'utf8'));
// Test server only: fixture applied on explicit test request, never in production.
blender.approved.add(data.asset);
export function loadFixture(){store.begin();store.commit({revision:store.revision,objects:data.objects,asset:data.asset},store.epoch);}
loadFixture();
console.log('TEST SERVER — authored geometry, not a live Astra generation.');
