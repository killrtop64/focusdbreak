import { build } from 'vite';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
await build();
async function walk(directory, prefix = '') {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes:true })) {
    const name = prefix + entry.name;
    if (entry.isDirectory()) files.push(...await walk(path.join(directory, entry.name), name + '/'));
    else if (entry.name !== 'sw.js') files.push('./' + name);
  }
  return files;
}
const assets = ['./', ...await walk('dist')];
const hash = createHash('sha256').update(await readFile('dist/index.html')).digest('hex').slice(0,12);
await writeFile('dist/sw.js', [
  "const CACHE='focus-break-" + hash + "';",
  'const ASSETS=' + JSON.stringify(assets) + ';',
  "self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting())));",
  "self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('focus-break-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));",
  "self.addEventListener('fetch',event=>{if(event.request.method!=='GET'||new URL(event.request.url).origin!==self.location.origin)return;event.respondWith(fetch(event.request).then(response=>{if(response.ok&&!response.redirected){const copy=response.clone();event.waitUntil(caches.open(CACHE).then(cache=>cache.put(event.request,copy)));}return response;}).catch(async()=>{const found=await caches.match(event.request);if(found)return found;if(event.request.mode==='navigate')return(await caches.match(new URL('./index.html',self.location.href)))||Response.error();return Response.error();}));});",
].join('\n'));
console.log('Offline app shell generated for ' + assets.length + ' assets.');
