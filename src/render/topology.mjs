/** Adaptateur de topologie pour le rendu.
 * Accepte deux formes :
 * - le format des scénarios (docs/simulation/contrats.md) : liens { a: 'pc1:eth0', b: 'sw1:p1' },
 *   adresses dans devices[].interfaces[] ;
 * - la forme simple du S1 : liens { from, to }, ip/mac directement sur l'équipement.
 */
const TYPES = new Set(['pc','host','router','switch','server']);
/** 'pc1:eth0' → 'pc1' */
function endpointDevice(value) { return typeof value === 'string' && value.includes(':') ? value.slice(0, value.indexOf(':')) : value; }
/** Première adresse d'un équipement au format scénario (sans le préfixe /24). */
function firstAddress(d, key) {
  const value = (d.interfaces || []).map(i => i && i[key]).find(v => typeof v === 'string');
  return value ? value.split('/')[0] : null;
}
function nonempty(x, field) { if(typeof x !== 'string'||!x.trim())throw new TypeError(`${field} must be non-empty string`);return x.trim(); }
function position(value,index) {
  if(value === undefined || value === null) return {x:(index%4)*3.5-5.25,y:0,z:Math.floor(index/4)*3.5-1.75};
  if (!Array.isArray(value) || value.length!==3 || value.some(n=>typeof n!=='number'||!Number.isFinite(n))) throw new TypeError('position must be [x,y,z] finite numbers');
  return {x:value[0],y:value[1],z:value[2]};
}
export function normalizeTopology(data) {
 if(!data || typeof data!=='object' || Array.isArray(data)) throw new TypeError('topology must be an object');
 if(!Array.isArray(data.devices)||!Array.isArray(data.links)) throw new TypeError('topology needs devices[] and links[]');
 const ids=new Set();
 const devices=data.devices.map((d,i)=>{
  if(!d||typeof d!=='object')throw new TypeError(`device ${i} invalid`);
  const id=nonempty(d.id,`devices[${i}].id`);
  if(ids.has(id))throw new TypeError(`Duplicate device ID ${id}`);ids.add(id);
  const type=nonempty(d.type,`devices[${i}].type`).toLowerCase();
  if(!TYPES.has(type))throw new TypeError(`Unsupported device type ${type}`);
  const label=typeof d.label==='string'&&d.label.trim()?d.label.trim():id;
  const ip=typeof d.ip==='string'?d.ip:firstAddress(d,'ip');
  const mac=typeof d.mac==='string'?d.mac:firstAddress(d,'mac');
  return {id,type,label,ip,mac,position:position(d.position,i)};
 });
 const linkIds=new Set();
 const links=data.links.map((l,i)=>{
  if(!l||typeof l!=='object')throw new TypeError(`link ${i} invalid`);
  const from=nonempty(endpointDevice(l.from ?? l.a),`links[${i}].from`),to=nonempty(endpointDevice(l.to ?? l.b),`links[${i}].to`);
  if(!ids.has(from)||!ids.has(to))throw new TypeError(`Link ${i} references missing device`);
  if(from===to)throw new TypeError(`Self-link ${i}`);
  const id=typeof l.id==='string'&&l.id.trim()?l.id.trim():`link-${i}`;
  if(linkIds.has(id))throw new TypeError(`Duplicate link ID ${id}`);linkIds.add(id);
  return {id,from,to};
 });
 return {devices,links};
}
