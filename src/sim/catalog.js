// Pôle sim : catalogue d'équipements et de câbles (phase 5).
//
// Modèles GÉNÉRIQUES et FICTIFS : aucune marque ni aucun produit réel. Les références (ex.
// « ACC-24G ») sont inventées ; les valeurs sont réalistes pour la catégorie :
//  - capacité de commutation = somme des vitesses des ports × 2 (duplex intégral) ;
//  - débit de transfert = trames de 64 octets par seconde à pleine vitesse sur tous les ports
//    (1,488 Mpps par port à 1 Gb/s, 14,88 Mpps à 10 Gb/s, 0,1488 Mpps à 100 Mb/s).
//
// Dans un scénario : "model" sur un équipement, "speed" (Mb/s) sur une interface, "bandwidth"
// (Mb/s) et "cable" sur un lien. Tout est facultatif : un port sans modèle ni vitesse est à 1 Gb/s.

/** Vitesses de port et bandes passantes de lien acceptées (Mb/s). */
export const SPEEDS = Object.freeze([10, 100, 1000, 10000]);
/** Vitesse d'un port quand ni le scénario ni le modèle ne la précisent (Mb/s). */
export const DEFAULT_SPEED = 1000;

/** Paquets de 64 octets par seconde à pleine vitesse (Mpps) : (vitesse) / ((64 + 20) × 8 bits). */
export function forwardingRateMpps(speedMbps) {
  return speedMbps / (84 * 8);
}

/** Câbles : vitesse maximale (Mb/s) et longueur maximale à cette vitesse (m). */
export const CABLES = Object.freeze({
  'cuivre-cat5': { label: 'Cuivre catégorie 5', maxSpeed: 100, maxLength: 100, connector: 'RJ45' },
  'cuivre-cat5e': { label: 'Cuivre catégorie 5e', maxSpeed: 1000, maxLength: 100, connector: 'RJ45' },
  'cuivre-cat6': { label: 'Cuivre catégorie 6', maxSpeed: 1000, maxLength: 100, connector: 'RJ45' },
  'cuivre-cat6a': { label: 'Cuivre catégorie 6A', maxSpeed: 10000, maxLength: 100, connector: 'RJ45' },
  'fibre-mm': { label: 'Fibre multimode OM3', maxSpeed: 10000, maxLength: 300, connector: 'LC (module SFP+)' },
  'fibre-sm': { label: 'Fibre monomode OS2', maxSpeed: 10000, maxLength: 10000, connector: 'LC (module SFP+)' },
});

/** Groupe de ports : `count` ports de `speed` Mb/s, connecteur. */
const ports = (count, speed, connector) => ({ count, speed, connector });

/**
 * Modèles. `ports` : groupes de ports dans l'ordre des interfaces du scénario (la première
 * interface est le premier port du premier groupe, etc.).
 */
export const MODELS = Object.freeze({
  'pc-1g': {
    type: 'host', name: 'PC de bureau', reference: 'PC-G1',
    description: 'Poste de travail avec une carte réseau Gigabit Ethernet intégrée.',
    ports: [ports(1, 1000, 'RJ45')],
    specs: { power: '65 W', format: 'Tour' },
  },
  'srv-1g': {
    type: 'server', name: 'Serveur tour d\'entrée de gamme', reference: 'SRV-T2G',
    description: 'Petit serveur de bureau avec deux ports Gigabit Ethernet.',
    ports: [ports(2, 1000, 'RJ45')],
    specs: { power: '250 W', format: 'Tour' },
  },
  'srv-10g': {
    type: 'server', name: 'Serveur rack 1U', reference: 'SRV-R1X',
    description: 'Serveur pour salle informatique, deux ports 10 Gb/s sur fibre.',
    ports: [ports(2, 10000, 'SFP+')],
    specs: { power: '500 W', format: 'Rack 1U' },
  },
  'sw-8fe': {
    type: 'switch', name: 'Switch 8 ports Fast Ethernet', reference: 'ACC-8F',
    description: 'Petit switch non administrable, ports à 100 Mb/s.',
    ports: [ports(8, 100, 'RJ45')],
    specs: { macTable: 2048, power: '5 W', format: 'Bureau' },
  },
  'sw-24g': {
    type: 'switch', name: 'Switch d\'accès 24 ports Gigabit', reference: 'ACC-24G',
    description: 'Switch administrable de niveau 2 : 24 ports Gigabit pour les postes, 4 ports 10 Gb/s pour les liaisons montantes.',
    ports: [ports(24, 1000, 'RJ45'), ports(4, 10000, 'SFP+')],
    specs: { macTable: 16384, power: '35 W', format: 'Rack 1U' },
  },
  'sw-48x': {
    type: 'switch', name: 'Switch de distribution 48 ports 10 Gb/s', reference: 'DST-48X',
    description: 'Switch de cœur de réseau, tous ports à 10 Gb/s sur fibre.',
    ports: [ports(48, 10000, 'SFP+')],
    specs: { macTable: 131072, power: '350 W', format: 'Rack 1U' },
  },
  'rt-4g': {
    type: 'router', name: 'Routeur de bureau', reference: 'RTR-4G',
    description: 'Routeur pour petit site : 4 ports Gigabit, routage statique.',
    ports: [ports(4, 1000, 'RJ45')],
    specs: { routingThroughput: '1 Gb/s', routes: 1024, power: '20 W', format: 'Bureau' },
  },
  'rt-8x': {
    type: 'router', name: 'Routeur de cœur', reference: 'RTR-8X',
    description: 'Routeur de cœur de réseau : 8 ports 10 Gb/s sur fibre.',
    ports: [ports(8, 10000, 'SFP+')],
    specs: { routingThroughput: '80 Gb/s', routes: 500000, power: '400 W', format: 'Rack 2U' },
  },
});

/** Modèle par identifiant, ou null. */
export function modelOf(device) {
  return device?.model ? MODELS[device.model] ?? null : null;
}

/** Liste à plat des ports d'un modèle : [{ index, speed, connector }]. */
export function modelPorts(model) {
  const list = [];
  for (const group of model?.ports ?? []) {
    for (let i = 0; i < group.count; i += 1) list.push({ index: list.length, speed: group.speed, connector: group.connector });
  }
  return list;
}

/** Vitesse (Mb/s) de l'interface `name` : champ "speed", sinon le port du modèle, sinon 1 Gb/s. */
export function portSpeed(device, name) {
  const index = device?.interfaces?.findIndex((itf) => itf.name === name) ?? -1;
  const itf = index >= 0 ? device.interfaces[index] : null;
  if (Number.isFinite(itf?.speed)) return itf.speed;
  return modelPorts(modelOf(device))[index]?.speed ?? DEFAULT_SPEED;
}

/** Connecteur de l'interface (RJ45, SFP+…), d'après le modèle ; null sans modèle. */
export function portConnector(device, name) {
  const index = device?.interfaces?.findIndex((itf) => itf.name === name) ?? -1;
  return modelPorts(modelOf(device))[index]?.connector ?? null;
}

/** Caractéristiques générales d'un modèle, dans l'ordre d'une fiche produit. */
export function modelSheet(model) {
  if (!model) return [];
  const all = modelPorts(model);
  const groups = model.ports.map((group) => `${group.count} × ${formatSpeed(group.speed)} ${group.connector}`).join(' + ');
  const total = all.reduce((sum, port) => sum + port.speed, 0);
  const rows = [
    { label: 'Référence', value: model.reference },
    { label: 'Ports', value: groups },
  ];
  if (model.type === 'switch') {
    rows.push(
      { label: 'Capacité de commutation', value: formatSpeed(total * 2) },
      { label: 'Débit de transfert', value: `${formatNumber(all.reduce((sum, port) => sum + forwardingRateMpps(port.speed), 0), 1)} Mpps` },
      { label: 'Table d\'adresses MAC', value: `${formatNumber(model.specs.macTable, 0)} entrées` },
    );
  }
  if (model.type === 'router') {
    rows.push(
      { label: 'Débit de routage', value: model.specs.routingThroughput },
      { label: 'Routes', value: formatNumber(model.specs.routes, 0) },
    );
  }
  rows.push({ label: 'Consommation', value: model.specs.power }, { label: 'Format', value: model.specs.format });
  return rows;
}

/** 100 → '100 Mb/s', 1000 → '1 Gb/s', 2500 → '2,5 Gb/s'. */
export function formatSpeed(mbps) {
  if (!Number.isFinite(mbps)) return '—';
  if (mbps >= 1000) return `${formatNumber(mbps / 1000, mbps % 1000 === 0 ? 0 : 1)} Gb/s`;
  return `${formatNumber(mbps, mbps >= 10 || mbps === 0 ? 0 : 2)} Mb/s`;
}

/** Nombre à la française : 95.2 → '95,2', 16384 → '16 384'. */
export function formatNumber(value, digits = 0) {
  return value.toLocaleString('fr-FR', { minimumFractionDigits: digits, maximumFractionDigits: digits }).replace(/ /g, ' ');
}
