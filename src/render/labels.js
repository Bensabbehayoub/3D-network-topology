import * as THREE from '../../vendor/three/build/three.module.js';

export function labelLines(device){
 const name=device.label?.trim()||device.id;const ip=typeof device.ip==='string'?device.ip.trim():'';return ip?[name,ip]:[name];
}
export function formatDeviceLabel(device){return labelLines(device).join('\n');}

function makeSprite(device,documentRef){
 const lines=labelLines(device),canvas=documentRef.createElement('canvas'),scale=Math.min(globalThis.devicePixelRatio||1,2);canvas.width=384*scale;canvas.height=(lines.length===2?112:76)*scale;
 const context=canvas.getContext('2d');context.scale(scale,scale);const width=canvas.width/scale,height=canvas.height/scale;
 context.fillStyle='rgba(7, 16, 29, .88)';context.strokeStyle='rgba(102, 190, 242, .8)';context.lineWidth=2;context.beginPath();
 if(typeof context.roundRect==='function')context.roundRect(2,2,width-4,height-4,12);else context.rect(2,2,width-4,height-4);context.fill();context.stroke();
 context.textAlign='center';context.textBaseline='middle';context.fillStyle='#f4f9ff';context.font='600 28px system-ui, sans-serif';context.fillText(lines[0],width/2,lines.length===2?34:height/2);
 if(lines[1]){context.fillStyle='#91d5ff';context.font='22px ui-monospace, monospace';context.fillText(lines[1],width/2,77);}
 const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.minFilter=THREE.LinearFilter;
 const material=new THREE.SpriteMaterial({map:texture,transparent:true,depthWrite:false});const sprite=new THREE.Sprite(material);sprite.name=`Label ${device.id}`;sprite.scale.set(3.0,3.0*height/width,1);sprite.userData={deviceId:device.id,labelText:formatDeviceLabel(device)};return sprite;
}

/** Creates billboard labels once; refresh only repositions existing sprites. */
export function createLabelLayer(devicesData,devices,{documentRef=globalThis.document}={}){
 const group=new THREE.Group();group.name='Device labels';const labels=new Map();const canDraw=typeof documentRef?.createElement==='function';
 if(canDraw)for(const device of devicesData){const sprite=makeSprite(device,documentRef);labels.set(device.id,sprite);group.add(sprite);}
 const refresh=()=>{for(const [id,sprite] of labels){const root=devices.get(id);if(!root)continue;const height=root.userData.bounds?.y??1;sprite.position.set(root.position.x,root.position.y+height+.48,root.position.z);}};
 refresh();let disposed=false;
 return {group,labels,refresh,dispose(){if(disposed)return;disposed=true;for(const sprite of labels.values()){sprite.material.map?.dispose();sprite.material.dispose();}labels.clear();group.clear();}};
}
