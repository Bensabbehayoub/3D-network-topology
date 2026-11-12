// Pôle sim : diagnostic d'une topologie (phase 6). Module pur, sans état ni DOM : testé sous Node.
//
// diagnose(scenario, { traffic }) examine la topologie, la configuration (adresses, passerelles,
// routes, serveurs) et, si on le lui donne, le trafic mesuré (app.sim.getTraffic()). Il renvoie la
// liste des problèmes, triée par gravité :
//   { id, rule, severity: 'critique' | 'avertissement' | 'conseil',
//     target: { kind: 'device' | 'link', id, label }, problem, cause, recommendation }
//
// Règles (RULES) : équipement isolé, IP ou MAC en double, vitesses incohérentes, câble limitant,
// passerelle absente / hors sous-réseau / introuvable, sous-réseaux mélangés sur un segment,
// route manquante ou boucle de routage, serveur DHCP ou DNS manquant, point de défaillance unique,
// boucle de commutation, goulot d'étranglement (structurel et mesuré).

import { CABLES, formatSpeed, portSpeed } from './catalog.js';
import { addressedInterfaces, inNetwork, lookupRoute, ownsIp, primaryIp } from './net.js';
import { linkBandwidth } from './traffic.js';
import { parseEndpoint } from './scenario.js';

export const SEVERITIES = Object.freeze(['critique', 'avertissement', 'conseil']);
export const SEVERITY_LABELS = Object.freeze({ critique: 'Critique', avertissement: 'Avertissement', conseil: 'Conseil' });
/** Utilisation au-delà de laquelle un lien est dit saturé. */
export const SATURATION = 0.8;
export const RULES = Object.freeze([
  'isolated', 'duplicate-ip', 'duplicate-mac', 'speed-mismatch', 'cable-limit', 'gateway', 'mixed-subnets',
  'route', 'dhcp', 'dns', 'single-point', 'switching-loop', 'bottleneck', 'saturated',
]);

const HOSTS = new Set(['host', 'server']);
const label = (device) => device?.label ?? device?.id ?? '?';

/** Union-find minimal. */
function unionFind() {
  const parent = new Map();
  const find = (x) => {
    if (!parent.has(x)) parent.set(x, x);
    let root = x;
    while (parent.get(root) !== root) root = parent.get(root);
    parent.set(x, root);
    return root;
  };
  return { find, union: (a, b) => { const ra = find(a); const rb = find(b); if (ra !== rb) parent.set(ra, rb); return ra !== rb; } };
}

/**
 * Segments de niveau 2 (domaines de diffusion) : un lien relie ses deux bouts, un switch relie
 * tous ses ports. Renvoie la fonction « segment de l'interface équipement:interface ».
 */
export function segments(scenario) {
  const uf = unionFind();
  for (const link of scenario.links ?? []) uf.union(link.a, link.b);
  for (const device of scenario.devices ?? []) {
    if (device.type !== 'switch') continue;
    const [first, ...rest] = (device.interfaces ?? []).map((itf) => `${device.id}:${itf.name}`);
    for (const key of rest) uf.union(first, key);
  }
  return (key) => uf.find(key);
}

/** Interfaces adressées de tous les équipements (hors switch), avec leur segment. */
function addressing(scenario, segmentOf) {
  const list = [];
  for (const device of scenario.devices ?? []) {
    for (const itf of addressedInterfaces(device)) list.push({ device, ...itf, segment: segmentOf(`${device.id}:${itf.name}`) });
  }
  return list;
}

function linkEnds(scenario, link) {
  const a = parseEndpoint(link.a);
  const b = parseEndpoint(link.b);
  const byId = (id) => scenario.devices.find((device) => device.id === id);
  return { a, b, da: byId(a?.device), db: byId(b?.device) };
}

/** Tous les hôtes joignables les uns des autres dans le graphe, sans `skipDevice` ni `skipLink`. */
function connectedPairs(scenario, { skipDevice = null, skipLink = null } = {}) {
  const uf = unionFind();
  for (const link of scenario.links) {
    if (link.id === skipLink) continue;
    const { a, b } = linkEnds(scenario, link);
    if (!a || !b || a.device === skipDevice || b.device === skipDevice) continue;
    uf.union(a.device, b.device);
  }
  const hosts = scenario.devices.filter((device) => HOSTS.has(device.type) && device.id !== skipDevice);
  let pairs = 0;
  for (let i = 0; i < hosts.length; i += 1) {
    for (let j = i + 1; j < hosts.length; j += 1) if (uf.find(hosts[i].id) === uf.find(hosts[j].id)) pairs += 1;
  }
  return pairs;
}

/**
 * Suit les tables de routage de `source` vers `destinationIp`, saut par saut.
 * @returns {{ ok: true } | { ok: false, at: object, kind: 'no-route' | 'no-next-hop' | 'loop' | 'not-router', detail: string }}
 */
export function traceRoute(scenario, source, destinationIp, segmentOf) {
  const visited = new Set();
  let current = source;
  for (let hop = 0; hop < 32; hop += 1) {
    if (ownsIp(current, destinationIp)) return { ok: true };
    if (visited.has(current.id)) return { ok: false, at: current, kind: 'loop', detail: [...visited].join(' → ') };
    visited.add(current.id);
    if (current !== source && current.type !== 'router') return { ok: false, at: current, kind: 'not-router', detail: '' };
    const route = lookupRoute(current, destinationIp);
    if (!route) return { ok: false, at: current, kind: 'no-route', detail: '' };
    const exit = segmentOf(`${current.id}:${route.interface}`);
    const next = scenario.devices.find((device) => device.id !== current.id
      && addressedInterfaces(device).some((itf) => itf.ip === route.nextHop && segmentOf(`${device.id}:${itf.name}`) === exit));
    if (!next) return { ok: false, at: current, kind: 'no-next-hop', detail: route.nextHop };
    current = next;
  }
  return { ok: false, at: current, kind: 'loop', detail: 'plus de 32 sauts' };
}

/**
 * Diagnostic complet.
 * @param {object} scenario scénario (valide)
 * @param {{ traffic?: ReturnType<ReturnType<import('./traffic.js').createTrafficMeter>['snapshot']> | null }} [options]
 */
export function diagnose(scenario, { traffic = null } = {}) {
  if (!scenario?.devices) return [];
  const findings = new Map();
  const add = (rule, severity, target, problem, cause, recommendation) => {
    const id = `${rule}:${target.kind}:${target.id}`;
    if (!findings.has(id)) findings.set(id, { id, rule, severity, target, problem, cause, recommendation });
  };
  const deviceTarget = (device) => ({ kind: 'device', id: device.id, label: label(device) });
  const linkTarget = (link, da, db) => ({ kind: 'link', id: link.id, label: `${label(da)} ↔ ${label(db)}` });
  const segmentOf = segments(scenario);
  const addressed = addressing(scenario, segmentOf);
  const links = scenario.links ?? [];
  const linked = new Set(links.flatMap((link) => [parseEndpoint(link.a)?.device, parseEndpoint(link.b)?.device]));

  // Équipement isolé
  for (const device of scenario.devices) {
    if (!linked.has(device.id)) {
      add('isolated', 'avertissement', deviceTarget(device), 'Équipement isolé',
        `${label(device)} n'est relié à aucun autre équipement.`,
        'Reliez-le au réseau par un câble, ou retirez-le de la topologie.');
    }
  }

  // Adresses IP et MAC en double
  const byIp = new Map();
  for (const itf of addressed) byIp.set(itf.ip, [...(byIp.get(itf.ip) ?? []), itf]);
  for (const [ip, owners] of byIp) {
    if (owners.length < 2) continue;
    add('duplicate-ip', 'critique', deviceTarget(owners[1].device), `Adresse IP ${ip} en double`,
      `${owners.map((itf) => `${label(itf.device)} (${itf.name})`).join(' et ')} ont la même adresse : les réponses ARP se contredisent et les paquets arrivent au mauvais équipement.`,
      `Donnez une adresse unique à ${label(owners[1].device)}, ou utilisez DHCP.`);
  }
  const byMac = new Map();
  for (const device of scenario.devices) {
    for (const itf of device.interfaces ?? []) {
      if (!itf.mac) continue;
      const mac = itf.mac.toLowerCase();
      byMac.set(mac, [...(byMac.get(mac) ?? []), { device, name: itf.name }]);
    }
  }
  for (const [mac, owners] of byMac) {
    if (owners.length < 2) continue;
    add('duplicate-mac', 'critique', deviceTarget(owners[1].device), `Adresse MAC ${mac} en double`,
      `${owners.map((owner) => label(owner.device)).join(' et ')} ont la même adresse MAC : les switches ne savent plus sur quel port envoyer les trames.`,
      'Chaque carte réseau doit avoir une adresse MAC unique : corrigez la configuration.');
  }

  // Vitesses des deux bouts d'un lien et câble
  for (const link of links) {
    const { a, b, da, db } = linkEnds(scenario, link);
    if (!da || !db) continue;
    const sa = portSpeed(da, a.interface);
    const sb = portSpeed(db, b.interface);
    if (sa !== sb) {
      add('speed-mismatch', 'avertissement', linkTarget(link, da, db), 'Vitesses de port différentes',
        `${label(da)} (${a.interface}) est à ${formatSpeed(sa)}, ${label(db)} (${b.interface}) à ${formatSpeed(sb)} : le lien se cale sur ${formatSpeed(Math.min(sa, sb))}.`,
        'Utilisez des ports de même vitesse aux deux bouts, ou acceptez la vitesse la plus basse.');
    }
    const cable = CABLES[link.cable];
    if (cable && cable.maxSpeed < Math.min(sa, sb)) {
      add('cable-limit', 'avertissement', linkTarget(link, da, db), 'Câble limitant',
        `Le câble (${cable.label}) ne permet que ${formatSpeed(cable.maxSpeed)}, alors que les deux ports vont à ${formatSpeed(Math.min(sa, sb))}.`,
        `Remplacez-le par un câble adapté à ${formatSpeed(Math.min(sa, sb))} (catégorie 6 pour 1 Gb/s, 6A ou fibre pour 10 Gb/s).`);
    }
  }

  // Passerelles des hôtes
  const networks = new Set(addressed.map((itf) => `${itf.network}/${itf.prefix}`));
  for (const device of scenario.devices.filter((candidate) => HOSTS.has(candidate.type))) {
    const own = addressedInterfaces(device)[0];
    if (!own) continue;
    const ownSegment = segmentOf(`${device.id}:${own.name}`);
    if (!device.gateway) {
      if (networks.size > 1) {
        add('gateway', 'avertissement', deviceTarget(device), 'Passerelle absente',
          `${label(device)} n'a pas de passerelle par défaut : il ne peut joindre que son réseau ${own.network}/${own.prefix}.`,
          'Indiquez l\'adresse du routeur de son réseau comme passerelle.');
      }
      continue;
    }
    if (!inNetwork(device.gateway, own.network, own.prefix)) {
      add('gateway', 'critique', deviceTarget(device), 'Passerelle hors du sous-réseau',
        `La passerelle ${device.gateway} n'est pas dans le réseau ${own.network}/${own.prefix} de ${label(device)} : il ne peut pas la joindre directement.`,
        `Choisissez comme passerelle l'adresse du routeur dans le réseau ${own.network}/${own.prefix}.`);
      continue;
    }
    const router = addressed.find((itf) => itf.ip === device.gateway && itf.segment === ownSegment && itf.device.type === 'router');
    if (!router && networks.size > 1) {
      add('gateway', 'critique', deviceTarget(device), 'Passerelle introuvable',
        `Aucun routeur de son segment ne porte l'adresse ${device.gateway} : les paquets vers les autres réseaux sont perdus (ARP sans réponse).`,
        'Corrigez la passerelle de l\'hôte ou l\'adresse de l\'interface du routeur.');
    } else if (!router) {
      add('gateway', 'conseil', deviceTarget(device), 'Passerelle sans routeur',
        `La passerelle ${device.gateway} de ${label(device)} n'existe pas sur ce réseau. Sans effet ici (tout reste dans le réseau local), mais aucun accès vers l'extérieur n'est possible.`,
        'Ajoutez un routeur portant cette adresse, ou retirez la passerelle.');
    }
  }

  // Sous-réseaux mélangés sur un même segment
  const bySegment = new Map();
  for (const itf of addressed) bySegment.set(itf.segment, [...(bySegment.get(itf.segment) ?? []), itf]);
  for (const members of bySegment.values()) {
    const counts = new Map();
    for (const itf of members) counts.set(`${itf.network}/${itf.prefix}`, (counts.get(`${itf.network}/${itf.prefix}`) ?? 0) + 1);
    if (counts.size < 2) continue;
    const [majority] = [...counts.entries()].sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0]))[0];
    for (const itf of members.filter((candidate) => `${candidate.network}/${candidate.prefix}` !== majority)) {
      add('mixed-subnets', 'avertissement', deviceTarget(itf.device), 'Sous-réseau différent sur le même segment',
        `${label(itf.device)} (${itf.ip}/${itf.prefix}) est branché sur le même segment que des équipements du réseau ${majority} : ils ne se parlent pas directement.`,
        `Donnez-lui une adresse du réseau ${majority}, ou séparez les deux réseaux par un routeur.`);
    }
  }

  // Routes : chaque hôte doit joindre chaque autre hôte, dans les deux sens.
  const hosts = scenario.devices.filter((device) => HOSTS.has(device.type) && primaryIp(device));
  for (const source of hosts) {
    for (const destination of hosts) {
      if (source === destination || !source.gateway && !inNetwork(primaryIp(destination), addressedInterfaces(source)[0].network, addressedInterfaces(source)[0].prefix)) continue;
      const trace = traceRoute(scenario, source, primaryIp(destination), segmentOf);
      if (trace.ok || trace.at === source || trace.kind === 'not-router') continue; // problèmes de l'hôte : règle « passerelle »
      const target = destination.interfaces && addressedInterfaces(destination)[0];
      const network = target ? `${target.network}/${target.prefix}` : primaryIp(destination);
      if (trace.kind === 'no-route') {
        add('route', 'critique', deviceTarget(trace.at), `Route manquante vers ${network}`,
          `${label(trace.at)} ne sait pas où envoyer les paquets de ${label(source)} vers ${label(destination)} (${primaryIp(destination)}) : aucune route ne couvre ${network}.`,
          `Ajoutez sur ${label(trace.at)} une route statique vers ${network} par le routeur voisin, ou une route par défaut.`);
      } else if (trace.kind === 'no-next-hop') {
        add('route', 'critique', deviceTarget(trace.at), 'Routeur suivant introuvable',
          `La route de ${label(trace.at)} vers ${network} passe par ${trace.detail}, mais aucun équipement relié ne porte cette adresse.`,
          `Corrigez l'adresse « via » de la route sur ${label(trace.at)}.`);
      } else if (trace.kind === 'loop') {
        add('route', 'critique', deviceTarget(trace.at), `Boucle de routage vers ${network}`,
          `Les routeurs se renvoient les paquets vers ${network} (${trace.detail}) jusqu'à épuisement du TTL.`,
          'Vérifiez les routes statiques : chaque routeur doit pointer vers un routeur plus proche de la destination.');
      }
    }
  }

  // Serveurs DHCP et DNS demandés par le protocole du scénario
  const protocol = scenario.protocol;
  const params = scenario.params ?? {};
  if (protocol === 'dhcp') {
    const clients = Array.isArray(params.clients) ? params.clients : params.client ? [params.client] : [];
    for (const id of clients) {
      const client = scenario.devices.find((device) => device.id === id);
      const itf = client?.interfaces?.[0];
      if (!itf) continue;
      const segment = segmentOf(`${client.id}:${itf.name}`);
      const server = scenario.devices.find((device) => device.dhcp
        && (device.services ?? []).some((service) => service.transport === 'udp' && service.port === 67)
        && addressedInterfaces(device).some((own) => segmentOf(`${device.id}:${own.name}`) === segment));
      if (!server) {
        add('dhcp', 'critique', deviceTarget(client), 'Aucun serveur DHCP',
          `${label(client)} attend une adresse par DHCP, mais aucun serveur DHCP (port UDP 67 et plage d'adresses) n'est dans son réseau local : ses DISCOVER resteront sans réponse.`,
          'Ajoutez un serveur DHCP dans ce réseau, ou un relais DHCP sur le routeur.');
      }
    }
  }
  if (protocol === 'dns' || protocol === 'http') {
    const client = scenario.devices.find((device) => device.id === params.client);
    if (client) {
      const server = client.dns ? scenario.devices.find((device) => ownsIp(device, client.dns)) : null;
      if (!client.dns) {
        add('dns', 'critique', deviceTarget(client), 'Aucun serveur DNS configuré',
          `${label(client)} doit traduire des noms en adresses mais ne connaît aucun serveur DNS.`,
          'Indiquez l\'adresse d\'un serveur DNS dans sa configuration (ou distribuez-la par DHCP).');
      } else if (!server || !server.records || !(server.services ?? []).some((service) => service.transport === 'udp' && service.port === 53)) {
        add('dns', 'critique', deviceTarget(client), 'Serveur DNS introuvable',
          `Le serveur DNS ${client.dns} de ${label(client)} n'existe pas ou n'offre pas de service DNS (port UDP 53 et enregistrements).`,
          'Corrigez l\'adresse du serveur DNS, ou ajoutez le service DNS sur ce serveur.');
      }
    }
  }

  // Boucle de commutation : un cycle formé uniquement de switches (sans protocole anti-boucle).
  const switches = new Set(scenario.devices.filter((device) => device.type === 'switch').map((device) => device.id));
  const switchGraph = unionFind();
  for (const link of links) {
    const { a, b, da, db } = linkEnds(scenario, link);
    if (!a || !b || !switches.has(a.device) || !switches.has(b.device)) continue;
    if (!switchGraph.union(a.device, b.device)) {
      add('switching-loop', 'critique', linkTarget(link, da, db), 'Boucle de commutation',
        `Ce câble ferme une boucle entre switches : une trame de diffusion y tournerait sans fin et saturerait le réseau (tempête de diffusion).`,
        'Retirez ce câble, ou activez un protocole anti-boucle (Spanning Tree) qui en bloque un.');
    }
  }

  // Points de défaillance uniques : un équipement d'infrastructure ou un lien entre deux d'entre eux
  // dont la panne coupe des hôtes les uns des autres.
  const reference = connectedPairs(scenario);
  for (const device of scenario.devices.filter((candidate) => !HOSTS.has(candidate.type) && linked.has(candidate.id))) {
    const lost = reference - connectedPairs(scenario, { skipDevice: device.id });
    if (lost > 0) {
      add('single-point', 'conseil', deviceTarget(device), 'Point de défaillance unique',
        `Si ${label(device)} tombe en panne, ${lost} liaison${lost > 1 ? 's' : ''} entre hôtes ${lost > 1 ? 'sont coupées' : 'est coupée'} : il n'existe pas de chemin de secours.`,
        'Pour un réseau critique, doublez cet équipement (redondance) ou prévoyez un second chemin.');
    }
  }
  const fragile = new Set([...findings.values()].filter((finding) => finding.rule === 'single-point').map((finding) => finding.target.id));
  for (const link of links) {
    const { da, db } = linkEnds(scenario, link);
    if (!da || !db || HOSTS.has(da.type) || HOSTS.has(db.type)) continue;
    if (fragile.has(da.id) || fragile.has(db.id)) continue; // déjà signalé par l'un de ses équipements
    const lost = reference - connectedPairs(scenario, { skipLink: link.id });
    if (lost > 0) {
      add('single-point', 'conseil', linkTarget(link, da, db), 'Lien unique entre deux équipements',
        `Ce câble est le seul chemin entre ${label(da)} et ${label(db)} : sa coupure isole ${lost} liaison${lost > 1 ? 's' : ''} entre hôtes.`,
        'Ajoutez un second câble ou un chemin de secours (avec un protocole anti-boucle).');
    }
  }

  // Goulot d'étranglement structurel : le lien vers un serveur, un routeur ou un autre switch est
  // plus lent que les liens d'accès qui l'alimentent depuis le même switch.
  for (const sw of scenario.devices.filter((device) => device.type === 'switch')) {
    const attached = links.map((link) => ({ link, ...linkEnds(scenario, link) }))
      .filter(({ a, b }) => a?.device === sw.id || b?.device === sw.id)
      .map((entry) => ({ ...entry, far: entry.a.device === sw.id ? entry.db : entry.da, bandwidth: linkBandwidth(scenario, entry.link) }));
    for (const entry of attached) {
      if (!entry.far || entry.far.type === 'host') continue; // lien d'accès d'un poste
      const feeders = attached.filter((other) => other !== entry);
      const fastest = Math.max(0, ...feeders.map((other) => other.bandwidth));
      if (feeders.length === 0 || entry.bandwidth >= fastest) continue;
      const total = feeders.reduce((sum, other) => sum + other.bandwidth, 0);
      add('bottleneck', 'avertissement', linkTarget(entry.link, entry.da, entry.db), 'Goulot d\'étranglement',
        `Le lien de ${label(sw)} vers ${label(entry.far)} ne fait que ${formatSpeed(entry.bandwidth)}, alors que ${feeders.length} lien${feeders.length > 1 ? 's' : ''} d'accès (${formatSpeed(total)} au total) peuvent lui envoyer du trafic : rapport ${Math.round(total / entry.bandwidth)}:1.`,
        `Passez ce lien à ${formatSpeed(fastest)} au moins (port et câble), ou répartissez le trafic sur plusieurs liens.`);
    }
  }

  // Saturation mesurée pendant la simulation
  for (const link of links) {
    const measured = traffic?.links?.[link.id];
    if (!measured || measured.utilization <= SATURATION) continue;
    const { da, db } = linkEnds(scenario, link);
    const direction = measured.ab.utilization >= measured.ba.utilization ? `${label(da)} → ${label(db)}` : `${label(db)} → ${label(da)}`;
    add('saturated', 'critique', linkTarget(link, da, db), 'Lien saturé',
      `Utilisation mesurée : ${Math.round(measured.utilization * 100)} % de ${formatSpeed(measured.bandwidth)} (sens ${direction}). Les trames attendent dans la file du port et les échanges ralentissent.`,
      'Augmentez la bande passante de ce lien ou répartissez la charge.');
  }

  const order = (finding) => SEVERITIES.indexOf(finding.severity);
  return [...findings.values()].sort((x, y) => order(x) - order(y) || x.target.label.localeCompare(y.target.label, 'fr') || x.problem.localeCompare(y.problem, 'fr'));
}

/** Nombre de problèmes par gravité : { critique, avertissement, conseil }. */
export function countBySeverity(findings) {
  const counts = { critique: 0, avertissement: 0, conseil: 0 };
  for (const finding of findings ?? []) counts[finding.severity] += 1;
  return counts;
}
