/** Validates a public picking ray and returns a normalized, immutable-friendly copy. */
export function normalizePickRay(origin,direction){
 const vector=(value,name)=>{
  if(!value||typeof value!=='object'||Array.isArray(value)||!['x','y','z'].every(axis=>typeof value[axis]==='number'&&Number.isFinite(value[axis])))throw new TypeError(`${name} must contain finite x, y and z coordinates`);
  return {x:value.x,y:value.y,z:value.z};
 };
 const normalizedOrigin=vector(origin,'origin'),normalizedDirection=vector(direction,'direction');
 const length=Math.hypot(normalizedDirection.x,normalizedDirection.y,normalizedDirection.z);if(length===0)throw new TypeError('direction must be nonzero');
 normalizedDirection.x/=length;normalizedDirection.y/=length;normalizedDirection.z/=length;
 return {origin:normalizedOrigin,direction:normalizedDirection};
}

/**
 * Cible la plus proche d'un rayon parmi des points, à une distance maximale du rayon.
 * Sert à la visée en VR : un équipement plat ou petit est difficile à toucher exactement avec
 * le rayon d'une manette, on accepte donc de passer « assez près » de lui ou de son étiquette.
 * @param {{ origin: {x,y,z}, direction: {x,y,z} }} ray direction de norme 1 (voir normalizePickRay)
 * @param {Array<{ id: string, x: number, y: number, z: number }>} points
 * @param {number} tolerance écart maximal entre le rayon et le point
 * @returns {{ id: string, point: {x,y,z}, distance: number } | null} point = projection sur le rayon
 */
export function nearestOnRay(ray,points,tolerance){
 let best=null,bestGap=Infinity;
 for(const target of points){
  const dx=target.x-ray.origin.x,dy=target.y-ray.origin.y,dz=target.z-ray.origin.z;
  const along=dx*ray.direction.x+dy*ray.direction.y+dz*ray.direction.z;if(along<=0)continue; // derrière la manette
  const gap=Math.sqrt(Math.max(0,dx*dx+dy*dy+dz*dz-along*along));
  if(gap<=tolerance&&gap<bestGap){bestGap=gap;best={id:target.id,distance:along,point:{x:ray.origin.x+ray.direction.x*along,y:ray.origin.y+ray.direction.y*along,z:ray.origin.z+ray.direction.z*along}};}
 }
 return best;
}
