import * as THREE from '../../vendor/three/build/three.webgpu.js';
import { colorNumber, LOAD_COLORS, loadLevel } from './packetStyles.js';

export function resolveLinkEndpoints(link,devices){
 const from=devices.get(link.from),to=devices.get(link.to);return from&&to?{from,to}:null;
}

function endpoint(root,toward){
 const start=root.position.clone(),direction=toward.clone().sub(start);direction.y=0;
 if(direction.lengthSq())direction.normalize();const bounds=root.userData.bounds??{x:1,z:1};
 const radius=Math.min(1.6,Math.max(.35,Math.min(bounds.x??1,bounds.z??1)*.42));
 return start.addScaledVector(direction,radius).setY(Math.max(.12,root.position.y+(root.userData.linkHeight??.18)));
}

/** Builds a disposable cable layer whose endpoints can be refreshed after model upgrades. */
export function createLinkLayer(links,devices,{color=0x70b7df}={}){
 const group=new THREE.Group();group.name='Network links';const material=new THREE.LineBasicMaterial({color,transparent:true,opacity:.86});
 // Phase 5 : un matériau par niveau de charge (vert, orange, rouge), partagé par tous les liens.
 const loadMaterials=Object.fromEntries(['low','medium','high'].map(level=>[level,new THREE.LineBasicMaterial({color:colorNumber(LOAD_COLORS[level]),transparent:true,opacity:.95})]));
 const objects=new Map(),skipped=[];
 for(const link of links){
  const endpoints=resolveLinkEndpoints(link,devices);if(!endpoints){skipped.push(link.id);continue;}
  const line=new THREE.Line(new THREE.BufferGeometry(),material);line.name=`Link ${link.id}`;line.userData={linkId:link.id,from:link.from,to:link.to};group.add(line);objects.set(link.id,line);
 }
 const refresh=()=>{
  for(const link of links){const line=objects.get(link.id),ends=resolveLinkEndpoints(link,devices);if(!line||!ends)continue;
   const a=endpoint(ends.from,ends.to.position),b=endpoint(ends.to,ends.from.position);const mid=a.clone().lerp(b,.5);mid.y=Math.max(.12,Math.min(a.y,b.y)*.65);
   const old=line.geometry;line.geometry=new THREE.BufferGeometry().setFromPoints([a,mid,b]);old.dispose();
  }
 };
 refresh();let disposed=false;
 /** Couleur de chaque lien selon son utilisation : { idLien: 0..1 } ; un lien absent revient au repos. */
 const setLoads=(loads={})=>{for(const [id,line] of objects){const level=loadLevel(loads[id]);line.material=level==='idle'?material:loadMaterials[level];line.userData.load=level;}};
 return {group,objects,skipped,refresh,setLoads,dispose(){if(disposed)return;disposed=true;for(const line of objects.values())line.geometry.dispose();material.dispose();Object.values(loadMaterials).forEach(m=>m.dispose());group.clear();objects.clear();}};
}
