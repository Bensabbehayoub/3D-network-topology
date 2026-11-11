// Original low-poly assets for this project. Run with: node assets/models/generate-models.mjs
import { mkdir, writeFile } from 'node:fs/promises';

const encoder = new TextEncoder();
const output = new URL('./', import.meta.url);
const materials = {
  charcoal: [0.055, 0.075, 0.1, 1],
  dark: [0.018, 0.027, 0.04, 1],
  blue: [0.055, 0.28, 0.52, 1],
  cyan: [0.05, 0.75, 0.9, 1],
  green: [0.05, 0.85, 0.42, 1],
  amber: [1, 0.48, 0.08, 1],
  silver: [0.38, 0.44, 0.5, 1],
  screen: [0.025, 0.12, 0.2, 1],
};

const cubePositions = new Float32Array([
  -0.5,-0.5, 0.5,  0.5,-0.5, 0.5,  0.5, 0.5, 0.5, -0.5, 0.5, 0.5,
   0.5,-0.5,-0.5, -0.5,-0.5,-0.5, -0.5, 0.5,-0.5,  0.5, 0.5,-0.5,
  -0.5, 0.5, 0.5,  0.5, 0.5, 0.5,  0.5, 0.5,-0.5, -0.5, 0.5,-0.5,
  -0.5,-0.5,-0.5,  0.5,-0.5,-0.5,  0.5,-0.5, 0.5, -0.5,-0.5, 0.5,
   0.5,-0.5, 0.5,  0.5,-0.5,-0.5,  0.5, 0.5,-0.5,  0.5, 0.5, 0.5,
  -0.5,-0.5,-0.5, -0.5,-0.5, 0.5, -0.5, 0.5, 0.5, -0.5, 0.5,-0.5,
]);
const cubeNormals = new Float32Array([
  0,0,1, 0,0,1, 0,0,1, 0,0,1, 0,0,-1, 0,0,-1, 0,0,-1, 0,0,-1,
  0,1,0, 0,1,0, 0,1,0, 0,1,0, 0,-1,0, 0,-1,0, 0,-1,0, 0,-1,0,
  1,0,0, 1,0,0, 1,0,0, 1,0,0, -1,0,0, -1,0,0, -1,0,0, -1,0,0,
]);
const cubeIndices = new Uint16Array([
  0,1,2,0,2,3, 4,5,6,4,6,7, 8,9,10,8,10,11,
  12,13,14,12,14,15, 16,17,18,16,18,19, 20,21,22,20,22,23,
]);

function box(name, material, translation, scale) { return { name, material, translation, scale }; }

const models = {
  router: [
    box('Router chassis','blue',[0,0.28,0],[2.2,0.5,1.35]),
    box('Front panel','charcoal',[0,0.27,0.686],[2.05,0.31,0.04]),
    ...[-0.68,-0.23,0.23,0.68].map((x,i)=>box(`Ethernet port ${i+1}`,'dark',[x,0.27,0.714],[0.3,0.18,0.035])),
    ...[-0.72,-0.48,-0.24,0,0.24].map((x,i)=>box(`Status light ${i+1}`,i===4?'amber':'green',[x,0.45,0.706],[0.08,0.045,0.04])),
    box('Left antenna','silver',[-0.82,0.9,-0.42],[0.08,1.28,0.08]),
    box('Right antenna','silver',[0.82,0.9,-0.42],[0.08,1.28,0.08]),
  ],
  switch: [
    box('Switch chassis','charcoal',[0,0.22,0],[3.3,0.42,1.1]),
    box('Front plate','silver',[0,0.22,0.558],[3.14,0.3,0.035]),
    ...Array.from({length:8},(_,i)=>box(`Ethernet port ${i+1}`,'dark',[-1.31+i*0.375,0.2,0.58],[0.27,0.18,0.045])),
    ...Array.from({length:8},(_,i)=>box(`Link light ${i+1}`,i%3===0?'amber':'green',[-1.31+i*0.375,0.39,0.58],[0.055,0.04,0.045])),
    box('Brand stripe','cyan',[1.35,0.22,0.582],[0.16,0.25,0.03]),
  ],
  pc: [
    box('Monitor casing','charcoal',[-0.28,1.35,0],[1.7,1.05,0.18]),
    box('Display','screen',[-0.28,1.37,0.101],[1.48,0.82,0.035]),
    box('Monitor glow','cyan',[-0.28,1.37,0.123],[1.34,0.68,0.012]),
    box('Monitor neck','silver',[-0.28,0.69,0],[0.16,0.34,0.14]),
    box('Monitor foot','charcoal',[-0.28,0.49,0.05],[0.75,0.09,0.48]),
    box('Tower','charcoal',[0.86,0.72,0],[0.58,1.38,0.72]),
    box('Tower face','blue',[0.86,0.72,0.37],[0.48,1.22,0.035]),
    box('Drive bay','dark',[0.86,1.09,0.392],[0.34,0.09,0.03]),
    box('Power light','green',[0.86,0.42,0.395],[0.09,0.09,0.035]),
  ],
};

function padded(bytes, alignment = 4, fill = 0) {
  const length = Math.ceil(bytes.byteLength / alignment) * alignment;
  const result = new Uint8Array(length); result.fill(fill); result.set(new Uint8Array(bytes.buffer ?? bytes, bytes.byteOffset ?? 0, bytes.byteLength));
  return result;
}

function makeGlb(name, parts) {
  const chunks=[]; let offset=0;
  const append=(typed,target)=>{const bytes=padded(new Uint8Array(typed.buffer,typed.byteOffset,typed.byteLength));const view={buffer:0,byteOffset:offset,byteLength:typed.byteLength,target};chunks.push(bytes);offset+=bytes.byteLength;return view;};
  const views=[append(cubePositions,34962),append(cubeNormals,34962),append(cubeIndices,34963)];
  const used=[...new Set(parts.map(p=>p.material))];
  const gltf={
    asset:{version:'2.0',generator:'3D Network Topology original low-poly generator'},
    scene:0,scenes:[{name, nodes:parts.map((_,i)=>i)}],
    nodes:parts.map((p,i)=>({name:p.name,mesh:used.indexOf(p.material),translation:p.translation,scale:p.scale})),
    meshes:used.map((mat)=>({name:`Cube ${mat}`,primitives:[{attributes:{POSITION:0,NORMAL:1},indices:2,material:used.indexOf(mat)}]})),
    materials:used.map(key=>({name:key,pbrMetallicRoughness:{baseColorFactor:materials[key],metallicFactor:key==='silver'?0.65:0.15,roughnessFactor:0.48}})),
    buffers:[{byteLength:offset}],bufferViews:views,
    accessors:[
      {bufferView:0,componentType:5126,count:24,type:'VEC3',min:[-0.5,-0.5,-0.5],max:[0.5,0.5,0.5]},
      {bufferView:1,componentType:5126,count:24,type:'VEC3'},
      {bufferView:2,componentType:5123,count:36,type:'SCALAR',min:[0],max:[23]},
    ],
  };
  const json=padded(encoder.encode(JSON.stringify(gltf)),4,0x20);
  const binary=new Uint8Array(offset);let cursor=0;for(const chunk of chunks){binary.set(chunk,cursor);cursor+=chunk.byteLength;}
  const total=12+8+json.byteLength+8+binary.byteLength;
  const out=new Uint8Array(total);const view=new DataView(out.buffer);let at=0;
  view.setUint32(at,0x46546c67,true);at+=4;view.setUint32(at,2,true);at+=4;view.setUint32(at,total,true);at+=4;
  view.setUint32(at,json.byteLength,true);at+=4;view.setUint32(at,0x4e4f534a,true);at+=4;out.set(json,at);at+=json.byteLength;
  view.setUint32(at,binary.byteLength,true);at+=4;view.setUint32(at,0x004e4942,true);at+=4;out.set(binary,at);
  return out;
}

await mkdir(output,{recursive:true});
for (const [name, parts] of Object.entries(models)) await writeFile(new URL(`${name}.glb`,output),makeGlb(name,parts));
console.log('Generated original router.glb, switch.glb, and pc.glb.');
