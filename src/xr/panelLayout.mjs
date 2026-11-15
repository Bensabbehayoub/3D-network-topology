// Pôle xr : géométrie et logique des panneaux VR, sans Three.js ni DOM (testé sous Node).
//
// En VR, les panneaux HTML n'existent plus : l'interface est dessinée sur des canvas appliqués
// à des rectangles 3D. Ce fichier contient tout ce qui se calcule sans afficher :
// - la disposition des boutons du panneau de commandes et le bouton visé (hitTest) ;
// - le rayon d'une manette à partir de sa pose WebXR (rayFromPose) ;
// - l'intersection de ce rayon avec un panneau (intersectPanel) et le choix de la cible ;
// - le retour à la ligne du texte (wrapText) et la vitesse suivante (nextSpeed).

/** Vitesses proposées par les boutons − et + (mêmes bornes que le curseur 2D : 0,25 à 4). */
export const SPEEDS = Object.freeze([0.25, 0.5, 1, 2, 4]);

/** Longueur du rayon d'une manette quand il ne touche rien (m). */
export const RAY_LENGTH = 2.5;

/**
 * Panneau de commandes : taille réelle (m), taille du canvas (px) et zones en pixels du canvas
 * (origine en haut à gauche). `control` est le nom attendu par le contrôleur de src/ui/controls.js.
 */
export const CONTROL_PANEL = Object.freeze({
  width: 0.84,
  height: 0.24,
  pxWidth: 1400,
  pxHeight: 400,
  status: Object.freeze({ x: 24, y: 20, w: 1352, h: 120 }),
  speed: Object.freeze({ x: 878, y: 164, w: 120, h: 212 }),
  buttons: Object.freeze([
    Object.freeze({ id: 'play', control: 'play', label: 'Lecture', x: 24, y: 164, w: 230, h: 212 }),
    Object.freeze({ id: 'pause', control: 'pause', label: 'Pause', x: 266, y: 164, w: 220, h: 212 }),
    Object.freeze({ id: 'step', control: 'step', label: 'Pas à pas', x: 498, y: 164, w: 260, h: 212 }),
    Object.freeze({ id: 'slower', control: 'speed', label: '−', x: 776, y: 164, w: 90, h: 212 }),
    Object.freeze({ id: 'faster', control: 'speed', label: '+', x: 1010, y: 164, w: 90, h: 212 }),
    Object.freeze({ id: 'reset', control: 'reset', label: 'Réinitialiser', x: 1118, y: 164, w: 258, h: 212 }),
  ]),
});

/** Fiche de l'équipement sélectionné et explication de l'étape : tailles réelles et canvas. */
export const DEVICE_PANEL = Object.freeze({ width: 0.62, height: 0.62, pxWidth: 900, pxHeight: 900 });
export const STEP_PANEL = Object.freeze({ width: 0.62, height: 0.44, pxWidth: 900, pxHeight: 640 });

/**
 * Recommandations (phase 6) : liste de problèmes (une ligne chacun, ROWS au plus), puis le détail
 * du problème choisi (cause et correction) en bas du panneau.
 */
export const RECO_PANEL = Object.freeze({
  width: 0.95, height: 0.76, pxWidth: 1130, pxHeight: 900,
  list: Object.freeze({ x: 24, y: 112, w: 1082, rowHeight: 84 }),
  rows: 5,
  detail: Object.freeze({ y: 560 }),
});

/**
 * Ligne de la liste sous le point (u, v) du panneau des recommandations, ou null.
 * @returns {number | null} rang de la ligne (0 = première)
 */
export function recoRowAt(u, v, count, layout = RECO_PANEL) {
  if (!Number.isFinite(u) || !Number.isFinite(v)) return null;
  const px = u * layout.pxWidth;
  const py = (1 - v) * layout.pxHeight;
  const { x, y, w, rowHeight } = layout.list;
  if (px < x || px > x + w || py < y) return null;
  const index = Math.floor((py - y) / rowHeight);
  return index < Math.min(count, layout.rows) ? index : null;
}

/**
 * Bouton situé sous un point du panneau.
 * @param {typeof CONTROL_PANEL} layout
 * @param {number} u abscisse sur le panneau, de 0 (gauche) à 1 (droite)
 * @param {number} v ordonnée sur le panneau, de 0 (bas) à 1 (haut)
 * @returns {string | null} id du bouton
 */
export function hitTest(layout, u, v) {
  if (!Number.isFinite(u) || !Number.isFinite(v)) return null;
  const px = u * layout.pxWidth;
  const py = (1 - v) * layout.pxHeight; // le canvas a son origine en haut
  const button = layout.buttons.find((b) => px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h);
  return button?.id ?? null;
}

/** Vitesse voisine dans SPEEDS (direction −1 ou +1), bornée aux extrémités. */
export function nextSpeed(speed, direction) {
  let index = 0;
  for (let i = 1; i < SPEEDS.length; i += 1) {
    if (Math.abs(SPEEDS[i] - speed) < Math.abs(SPEEDS[index] - speed)) index = i;
  }
  const next = Math.min(SPEEDS.length - 1, Math.max(0, index + Math.sign(direction)));
  return SPEEDS[next];
}

/**
 * Commande à exécuter pour un bouton, selon l'état des commandes (controlsView de l'interface 2D).
 * @returns {{ control: string, value?: number } | null} null si le bouton est désactivé ou inconnu
 */
export function controlAction(buttonId, view) {
  const button = CONTROL_PANEL.buttons.find((candidate) => candidate.id === buttonId);
  if (!button || !view?.enabled?.[button.control]) return null;
  if (button.id === 'slower' || button.id === 'faster') {
    const value = nextSpeed(view.speed, button.id === 'faster' ? 1 : -1);
    return value === view.speed ? null : { control: 'speed', value };
  }
  return { control: button.control };
}

/**
 * Rayon de visée d'une manette, à partir de la pose WebXR de son espace « targetRaySpace »
 * (XRPose.transform : position en mètres et orientation en quaternion, dans l'espace de
 * référence de la session). Par convention WebXR, le rayon part de l'origine de cet espace
 * et pointe vers −Z.
 * @param {{ position: { x, y, z }, orientation: { x, y, z, w } }} transform XRRigidTransform
 * @returns {{ origin: { x, y, z }, direction: { x, y, z } }} direction de norme 1
 */
export function rayFromPose(transform) {
  const { x, y, z, w } = transform.orientation;
  // (0, 0, −1) tourné par le quaternion : opposé de la troisième colonne de la matrice de rotation.
  const direction = { x: -2 * (x * z + w * y), y: -2 * (y * z - w * x), z: -(1 - 2 * (x * x + y * y)) };
  const length = Math.hypot(direction.x, direction.y, direction.z) || 1;
  return {
    origin: { x: transform.position.x, y: transform.position.y, z: transform.position.z },
    direction: { x: direction.x / length, y: direction.y / length, z: direction.z / length },
  };
}

/**
 * Plan d'un panneau à partir de la matrice monde de son rectangle 3D (16 nombres, colonnes
 * d'abord, comme Matrix4.elements de Three.js) : colonne 0 = droite, colonne 1 = haut.
 */
export function panelPlane(elements, width, height) {
  const unit = (x, y, z) => {
    const length = Math.hypot(x, y, z) || 1;
    return { x: x / length, y: y / length, z: z / length };
  };
  return {
    center: { x: elements[12], y: elements[13], z: elements[14] },
    right: unit(elements[0], elements[1], elements[2]),
    up: unit(elements[4], elements[5], elements[6]),
    width,
    height,
  };
}

const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;

/**
 * Intersection d'un rayon avec le rectangle d'un panneau.
 * @returns {{ u: number, v: number, distance: number, point: { x, y, z } } | null}
 *   u, v : position sur le panneau (0 à 1, origine en bas à gauche)
 */
export function intersectPanel(ray, plane) {
  const normal = {
    x: plane.right.y * plane.up.z - plane.right.z * plane.up.y,
    y: plane.right.z * plane.up.x - plane.right.x * plane.up.z,
    z: plane.right.x * plane.up.y - plane.right.y * plane.up.x,
  };
  const facing = dot(ray.direction, normal);
  if (Math.abs(facing) < 1e-6) return null; // rayon parallèle au panneau
  const toCenter = { x: plane.center.x - ray.origin.x, y: plane.center.y - ray.origin.y, z: plane.center.z - ray.origin.z };
  const distance = dot(toCenter, normal) / facing;
  if (distance <= 0) return null; // panneau derrière la manette
  const point = {
    x: ray.origin.x + ray.direction.x * distance,
    y: ray.origin.y + ray.direction.y * distance,
    z: ray.origin.z + ray.direction.z * distance,
  };
  const local = { x: point.x - plane.center.x, y: point.y - plane.center.y, z: point.z - plane.center.z };
  const u = dot(local, plane.right) / plane.width + 0.5;
  const v = dot(local, plane.up) / plane.height + 0.5;
  if (u < 0 || u > 1 || v < 0 || v > 1) return null;
  return { u, v, distance, point };
}

/**
 * Ce que vise un rayon : le panneau ou l'équipement le plus proche.
 * @param {{ origin, direction }} ray
 * @param {Array<ReturnType<typeof panelPlane> | null>} planes un plan par panneau (null = masqué)
 * @param {{ id: string, distance: number, point: { x, y, z } } | null} deviceHit résultat de app.render.pickDeviceHit
 * @returns {{ kind: 'panel', index: number, u: number, v: number, distance: number, point: object }
 *   | { kind: 'device', id: string, distance: number, point: object } | null}
 */
export function resolveTarget(ray, planes, deviceHit) {
  let best = deviceHit ? { kind: 'device', id: deviceHit.id, distance: deviceHit.distance, point: deviceHit.point } : null;
  planes.forEach((plane, index) => {
    const hit = plane ? intersectPanel(ray, plane) : null;
    if (hit && (!best || hit.distance < best.distance)) best = { kind: 'panel', index, ...hit };
  });
  return best;
}

/**
 * Coupe un texte en lignes qui tiennent dans une largeur.
 * @param {string} text
 * @param {number} maxWidth largeur disponible
 * @param {(text: string) => number} measure largeur d'un texte (ex. ctx.measureText(t).width)
 * @param {number} [maxLines] au-delà, la dernière ligne se termine par « … »
 * @returns {string[]}
 */
export function wrapText(text, maxWidth, measure, maxLines = Infinity) {
  const lines = [];
  for (const paragraph of String(text ?? '').split('\n')) {
    let line = '';
    for (let word of paragraph.split(/\s+/).filter(Boolean)) {
      // Un mot plus large que la ligne (adresse, identifiant) est coupé caractère par caractère.
      while (measure(word) > maxWidth && word.length > 1) {
        let cut = word.length - 1;
        while (cut > 1 && measure(word.slice(0, cut)) > maxWidth) cut -= 1;
        if (line) { lines.push(line); line = ''; }
        lines.push(word.slice(0, cut));
        word = word.slice(cut);
      }
      const candidate = line ? `${line} ${word}` : word;
      if (line && measure(candidate) > maxWidth) {
        lines.push(line);
        line = word;
      } else {
        line = candidate;
      }
    }
    if (line) lines.push(line);
  }
  if (lines.length <= maxLines) return lines;
  const kept = lines.slice(0, maxLines);
  kept[maxLines - 1] = `${kept[maxLines - 1].replace(/[\s.,;:!?]+$/, '')}…`;
  return kept;
}

/**
 * Position et orientation des trois panneaux autour de la maquette.
 * @param {{ x: number, y: number, z: number, width: number, depth: number }} anchor app.render.getVRAnchor()
 * @returns {Record<'controls' | 'device' | 'step', { position: { x, y, z }, yaw: number, pitch: number }>}
 *   yaw : rotation autour de la verticale (rad) ; pitch : inclinaison vers l'arrière (rad)
 */
export function panelPoses(anchor) {
  const side = anchor.width / 2 + 0.42;
  return {
    // Pupitre incliné entre l'utilisateur et la maquette, sous la ligne de regard.
    controls: { position: { x: anchor.x, y: anchor.y - 0.14, z: anchor.z + anchor.depth / 2 + 0.3 }, yaw: 0, pitch: 0.65 },
    // Fiche à gauche et explications à droite, tournées vers l'utilisateur.
    device: { position: { x: anchor.x - side, y: anchor.y + 0.4, z: anchor.z + 0.12 }, yaw: 0.55, pitch: 0 },
    step: { position: { x: anchor.x + side, y: anchor.y + 0.4, z: anchor.z + 0.12 }, yaw: -0.55, pitch: 0 },
    // Recommandations (phase 6) : au-dessus et en arrière de la maquette, face à l'utilisateur.
    recommendations: { position: { x: anchor.x, y: anchor.y + 0.66, z: anchor.z - anchor.depth / 2 - 0.08 }, yaw: 0, pitch: 0 },
  };
}
