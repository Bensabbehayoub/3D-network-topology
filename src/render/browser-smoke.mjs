// Optional local smoke test. Starts a static server and a temporary headless Chrome session.
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {extname,resolve,sep} from 'node:path';

const root=resolve(new URL('../../',import.meta.url).pathname.replace(/^\/(?:[A-Za-z]:)/,match=>match.slice(1)));
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.glb':'model/gltf-binary','.png':'image/png'};
const server=createServer(async(request,response)=>{
 try{const pathname=decodeURIComponent(new URL(request.url,'http://localhost').pathname),candidate=resolve(root,`.${pathname==='/'?'/index.html':pathname}`);if(candidate!==root&&!candidate.startsWith(root+sep))throw new Error('outside root');const data=await readFile(candidate);response.writeHead(200,{'content-type':mime[extname(candidate)]||'application/octet-stream'});response.end(data);}catch{response.writeHead(404);response.end('Not found');}
});
await new Promise(resolveListen=>server.listen(0,'127.0.0.1',resolveListen));const port=server.address().port;
const candidates=['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe','C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'];
let browser;
for(const executable of candidates){try{await readFile(executable);browser=executable;break;}catch{}}
if(!browser)throw new Error('Chrome or Edge was not found');
const profile=await mkdtemp(`${tmpdir()}${sep}network-topology-smoke-`),debugPort=9339;
const chrome=spawn(browser,[`--remote-debugging-port=${debugPort}`,`--user-data-dir=${profile}`,'--headless=new','--enable-unsafe-swiftshader','--disable-gpu-sandbox','--no-first-run','--no-default-browser-check','about:blank'],{stdio:['ignore','ignore','pipe'],windowsHide:true});
const delay=ms=>new Promise(resolveDelay=>setTimeout(resolveDelay,ms));
async function json(url,options){for(let i=0;i<50;i++){try{const response=await fetch(url,options);if(response.ok)return response.json();}catch{}await delay(100);}throw new Error(`DevTools endpoint unavailable: ${url}`);}
let socket;
try{
 const page=await json(`http://127.0.0.1:${debugPort}/json/new?about:blank`,{method:'PUT'});socket=new WebSocket(page.webSocketDebuggerUrl);await new Promise((open,reject)=>{socket.onopen=open;socket.onerror=reject;});
 let sequence=0;const waiting=new Map(),events=[];socket.onmessage=message=>{const data=JSON.parse(message.data);if(data.id){waiting.get(data.id)?.(data);waiting.delete(data.id);}else events.push(data);};
 const send=(method,params={})=>new Promise((resolveSend,reject)=>{const id=++sequence;waiting.set(id,data=>data.error?reject(new Error(data.error.message)):resolveSend(data.result));socket.send(JSON.stringify({id,method,params}));});
 await send('Runtime.enable');await send('Page.enable');await send('Page.navigate',{url:`http://127.0.0.1:${port}/index.html`});await delay(2500);
 const selectionSetup=await send('Runtime.evaluate',{expression:`(()=>{const mount=document.querySelector('#scene'),rect=mount.getBoundingClientRect();window.__smokeSelected=null;mount.addEventListener('topology:device-selected',event=>window.__smokeSelected=event.detail.id,{once:true});return {x:rect.left+rect.width/2,y:rect.top+rect.height/2};})()`,returnByValue:true});
 await send('Input.dispatchMouseEvent',{type:'mousePressed',x:selectionSetup.result.value.x,y:selectionSetup.result.value.y,button:'left',clickCount:1});await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:selectionSetup.result.value.x,y:selectionSetup.result.value.y,button:'left',clickCount:1});await delay(150);
 const beforeInteraction=await send('Page.captureScreenshot',{format:'png'}),center=selectionSetup.result.value;
 await send('Input.dispatchMouseEvent',{type:'mousePressed',x:center.x+90,y:center.y,button:'left',clickCount:1});await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:center.x+25,y:center.y+30,button:'left'});await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:center.x+25,y:center.y+30,button:'left',clickCount:1});await send('Input.dispatchMouseEvent',{type:'mouseWheel',x:center.x,y:center.y,deltaX:0,deltaY:-160});await delay(350);
 const afterInteraction=await send('Page.captureScreenshot',{format:'png'}),interactionChanged=beforeInteraction.data!==afterInteraction.data;
 const expression=`(async()=>{
  const errors=[];addEventListener('error',event=>errors.push(event.message));addEventListener('unhandledrejection',event=>errors.push(String(event.reason)));
  const mount=document.createElement('div');Object.assign(mount.style,{position:'fixed',left:'0',top:'0',width:'640px',height:'420px',zIndex:'9999'});document.body.appendChild(mount);
  const {initScene}=await import('./src/render/scene.js');let emitted=0;const renderer=await initScene(mount,{onDeviceClick:()=>emitted++});
  const topology={devices:[{id:'pc',type:'pc',label:'PC',ip:'10.0.0.2',position:[-4,0,0]},{id:'sw',type:'switch',label:'Switch',position:[0,0,0]},{id:'r',type:'router',label:'Router',ip:'10.0.0.1',position:[4,0,0]}],links:[{from:'pc',to:'sw'},{from:'sw',to:'r'}]};
  const summary=renderer.loadTopology(topology);await renderer.whenReady();const canvas=mount.querySelector('canvas');
  const picked=renderer.pickDevice({x:0,y:.3,z:10},{x:0,y:0,z:-20});const api={highlight:renderer.highlightDevice('sw','selected'),focus:renderer.focusDevice('r'),devices:renderer.listDevices().length,selected:window.__smokeSelected,picked,emitted};
  const backend=canvas.dataset.backend;const modelFetches=performance.getEntriesByType('resource').filter(entry=>entry.name.endsWith('.glb')).map(entry=>entry.name.split('/').pop()).sort();
  renderer.dispose();mount.remove();return {summary,api,webgpu:backend==='WebGPU',modelFetches,mainCanvas:Boolean(document.querySelector('#scene canvas')),errors};
 })()`;
 const evaluation=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(evaluation.exceptionDetails)throw new Error(evaluation.exceptionDetails.text);const result=evaluation.result.value;result.interactionChanged=interactionChanged;
 const screenshot=await send('Page.captureScreenshot',{format:'png'}),screenshotPath=`${tmpdir()}${sep}3d-network-topology-smoke.png`;await writeFile(screenshotPath,Buffer.from(screenshot.data,'base64'));
 await send('Page.reload');await delay(1800);const reload=await send('Runtime.evaluate',{expression:`Boolean(document.querySelector('#scene canvas'))`,returnByValue:true});result.reloadCanvas=reload.result.value;
 const consoleErrors=events.filter(event=>event.method==='Runtime.exceptionThrown'||(event.method==='Runtime.consoleAPICalled'&&event.params.type==='error')).map(event=>event.params);
 console.log(JSON.stringify({...result,consoleErrors:consoleErrors.length,screenshotPath},null,2));
 if(!result.webgpu||!result.mainCanvas||!result.reloadCanvas||!result.interactionChanged||result.summary.devices!==3||result.summary.links!==2||!result.api.highlight||!result.api.focus||result.api.devices!==3||result.api.picked!=='sw'||result.api.emitted!==0||result.modelFetches.length<3||result.errors.length||consoleErrors.length)process.exitCode=1;
}finally{
 socket?.close();chrome.kill();server.close();await delay(350);await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:100});
}
