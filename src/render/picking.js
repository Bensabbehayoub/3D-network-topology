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
