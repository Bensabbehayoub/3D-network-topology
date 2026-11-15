// Pôle sim (phase 7b) : jouer une topologie construite dans l'éditeur.
//
// RUNS décrit les protocoles proposés (ARP, ping, routage, UDP, DNS, DHCP, TCP, HTTP, débit) et
// leurs paramètres. Fonctions PURES :
//   runFields(scenario, runId)            champs du formulaire, avec les équipements possibles
//   defaultValues(scenario, runId)        valeurs proposées
//   validateRun(scenario, runId, values)  { errors, warnings, params } ; errors bloque la lecture
//   assembleRun(scenario, runId, params)  scénario prêt pour le moteur, avec des explications
//                                         génériques (étapes standard, voir contrats.md)
// Une boucle de commutation bloque toujours la lecture (une tempête de diffusion ne finirait pas).

import { diagnose } from './diagnostics.js';
import { addressedInterfaces, inNetwork, primaryIp } from './net.js';
import { isHostname } from './scenario.js';

const nameOf = (scenario, id) => scenario.devices.find((device) => device.id === id)?.label ?? id;
const hasIp = (device) => Boolean(primaryIp(device));
const isEndHost = (device) => device.type === 'host' || device.type === 'server';
const hasService = (device, transport, port) => (device?.services ?? []).some((service) => service.transport === transport && service.port === port);

/** Protocoles proposés dans l'éditeur. `protocol` : fichier de src/sim/protocols/. */
export const RUNS = Object.freeze([
  { id: 'ping', protocol: 'icmp', label: 'Ping (ICMP)' },
  { id: 'routage', protocol: 'icmp', label: 'Routage : ping à travers les routeurs' },
  { id: 'arp', protocol: 'arp', label: 'ARP : trouver une adresse MAC' },
  { id: 'udp', protocol: 'udp', label: 'UDP : envoyer des datagrammes' },
  { id: 'dns', protocol: 'dns', label: 'DNS : traduire un nom' },
  { id: 'dhcp', protocol: 'dhcp', label: 'DHCP : obtenir une adresse' },
  { id: 'tcp', protocol: 'tcp', label: 'TCP : transférer un fichier' },
  { id: 'http', protocol: 'http', label: 'HTTP : charger une page web' },
  { id: 'debit', protocol: 'tcp', label: 'Débit : plusieurs transferts en même temps' },
]);

const runOf = (runId) => RUNS.find((run) => run.id === runId) ?? null;

function deviceOptions(scenario, filter) {
  return scenario.devices.filter(filter).map((device) => ({ value: device.id, label: device.label ?? device.id }));
}

/**
 * Champs du formulaire d'un protocole.
 * @returns {Array<{ key: string, label: string, kind: 'device' | 'devices' | 'number' | 'text' | 'bool',
 *   options?: Array<{ value, label }>, min?: number, max?: number, hint?: string }>}
 */
export function runFields(scenario, runId) {
  const hosts = deviceOptions(scenario, isEndHost);
  const addressed = deviceOptions(scenario, (device) => device.type !== 'switch');
  const servers = deviceOptions(scenario, (device) => isEndHost(device));
  switch (runId) {
    case 'ping':
    case 'routage':
      return [
        { key: 'source', label: 'Équipement qui lance le ping', kind: 'device', options: hosts },
        { key: 'target', label: 'Destination', kind: 'device', options: addressed },
        { key: 'count', label: 'Nombre de requêtes', kind: 'number', min: 1, max: 5 },
        { key: 'ttl', label: 'TTL des requêtes', kind: 'number', min: 1, max: 64, hint: 'Un petit TTL montre « TTL expiré ».' },
      ];
    case 'arp':
      return [
        { key: 'source', label: 'Équipement qui cherche', kind: 'device', options: hosts },
        { key: 'target', label: 'Adresse IP cherchée (équipement)', kind: 'device', options: addressed },
      ];
    case 'udp':
      return [
        { key: 'source', label: 'Émetteur', kind: 'device', options: hosts },
        { key: 'target', label: 'Destinataire', kind: 'device', options: servers },
        { key: 'port', label: 'Port UDP de destination', kind: 'number', min: 1, max: 65535 },
        { key: 'count', label: 'Nombre de datagrammes', kind: 'number', min: 1, max: 5 },
        { key: 'closedPort', label: 'Port fermé visé à la fin (0 : aucun)', kind: 'number', min: 0, max: 65535 },
      ];
    case 'dns':
      return [
        { key: 'client', label: 'Équipement qui résout', kind: 'device', options: hosts },
        { key: 'names', label: 'Noms à résoudre (séparés par des virgules)', kind: 'text' },
      ];
    case 'dhcp':
      return [
        { key: 'clients', label: 'Clients DHCP (sans adresse fixe)', kind: 'devices', options: deviceOptions(scenario, (device) => isEndHost(device) && !hasIp(device)) },
        { key: 'verify', label: 'Vérifier par un ping vers la passerelle', kind: 'bool' },
      ];
    case 'tcp':
      return [
        { key: 'client', label: 'Client', kind: 'device', options: hosts },
        { key: 'server', label: 'Serveur', kind: 'device', options: servers },
        { key: 'port', label: 'Port TCP du service', kind: 'number', min: 1, max: 65535 },
        { key: 'size', label: 'Taille du fichier (octets)', kind: 'number', min: 1, max: 100000 },
        { key: 'loseSegment', label: 'Segment perdu (0 : aucun)', kind: 'number', min: 0, max: 100 },
      ];
    case 'http':
      return [
        { key: 'client', label: 'Navigateur (client)', kind: 'device', options: hosts },
        { key: 'url', label: 'Adresse à charger', kind: 'text', hint: 'Exemple : http://www.ecole.test/' },
      ];
    case 'debit':
      return [
        { key: 'sources', label: 'Équipements qui envoient', kind: 'devices', options: hosts },
        { key: 'server', label: 'Serveur qui reçoit', kind: 'device', options: servers },
        { key: 'port', label: 'Port TCP du service', kind: 'number', min: 1, max: 65535 },
        { key: 'size', label: 'Taille de chaque fichier (octets)', kind: 'number', min: 1000, max: 100000 },
      ];
    default:
      return [];
  }
}

/** Valeurs proposées : les premiers équipements qui conviennent, des ports déjà ouverts. */
export function defaultValues(scenario, runId) {
  const hosts = scenario.devices.filter((device) => isEndHost(device) && hasIp(device));
  const first = hosts[0]?.id ?? '';
  const other = hosts.find((device) => device.id !== first)?.id ?? '';
  const serverWith = (transport, port) => scenario.devices.find((device) => hasService(device, transport, port))?.id;
  const firstService = (id, transport, fallback) => scenario.devices.find((device) => device.id === id)?.services?.find((service) => service.transport === transport)?.port ?? fallback;
  const dnsNames = scenario.devices.flatMap((device) => (device.records ?? []).map((record) => record.name));
  switch (runId) {
    case 'ping': return { source: first, target: other, count: 2, ttl: 64 };
    case 'routage': return { source: first, target: hosts.at(-1)?.id ?? other, count: 1, ttl: 64 };
    case 'arp': return { source: first, target: other };
    case 'udp': {
      const target = scenario.devices.find((device) => (device.services ?? []).some((service) => service.transport === 'udp'))?.id ?? other;
      return { source: first === target ? other : first, target, port: firstService(target, 'udp', 514), count: 2, closedPort: 0 };
    }
    case 'dns': {
      const client = scenario.devices.find((device) => isEndHost(device) && device.dns)?.id ?? first;
      return { client, names: dnsNames.length ? `${dnsNames[0]}, ${dnsNames[0]}` : 'www.ecole.test' };
    }
    case 'dhcp': return { clients: scenario.devices.filter((device) => isEndHost(device) && !hasIp(device)).map((device) => device.id), verify: true };
    case 'tcp': {
      const server = scenario.devices.find((device) => (device.services ?? []).some((service) => service.transport === 'tcp'))?.id ?? other;
      return { client: first === server ? other : first, server, port: firstService(server, 'tcp', 9000), size: 3000, loseSegment: 0 };
    }
    case 'http': {
      const client = scenario.devices.find((device) => isEndHost(device) && device.dns)?.id ?? first;
      const web = scenario.devices.find((device) => device.pages);
      const name = scenario.devices.flatMap((device) => device.records ?? []).find((record) => web && addressedInterfaces(web).some((itf) => itf.ip === record.value))?.name;
      return { client, url: `http://${name ?? (web ? primaryIp(web) : 'www.ecole.test')}/` };
    }
    case 'debit': {
      const server = serverWith('tcp', 9000) ?? scenario.devices.find((device) => device.type === 'server')?.id ?? other;
      return { sources: hosts.filter((device) => device.id !== server).map((device) => device.id), server, port: firstService(server, 'tcp', 9000), size: 20000 };
    }
    default: return {};
  }
}

const integer = (value, fallback = null) => {
  const number = Number(value);
  return Number.isInteger(number) ? number : fallback;
};

/**
 * Vérifie les paramètres et prépare ceux du moteur.
 * @returns {{ errors: string[], warnings: string[], params: object | null, protocol: string | null }}
 */
export function validateRun(scenario, runId, values = {}) {
  const run = runOf(runId);
  const errors = [];
  const warnings = [];
  if (!run) return { errors: ['Choisissez un protocole.'], warnings, params: null, protocol: null };
  const device = (id) => scenario.devices.find((candidate) => candidate.id === id) ?? null;
  const need = (id, role) => {
    const found = device(id);
    if (!found) errors.push(`Choisissez ${role}.`);
    return found;
  };
  const needIp = (found, why) => {
    if (found && !hasIp(found)) errors.push(`${found.label ?? found.id} n'a pas d'adresse IP : ${why}`);
  };
  const number = (key, label, min, max) => {
    const value = integer(values[key]);
    if (value === null || value < min || value > max) errors.push(`${label} : un nombre entier de ${min} à ${max}.`);
    return value;
  };

  for (const finding of diagnose(scenario).filter((item) => item.rule === 'switching-loop')) {
    errors.push(`Boucle de commutation sur le câble ${finding.target.label} : une trame de diffusion y tournerait sans fin. Retirez ce câble avant de jouer.`);
  }
  if (scenario.devices.length === 0) errors.push('La topologie est vide : ajoutez des équipements.');

  let params = null;
  switch (runId) {
    case 'ping':
    case 'routage':
    case 'arp': {
      const source = need(values.source, 'l\'équipement source');
      const target = need(values.target, 'la destination');
      if (source && target && source === target) errors.push('La source et la destination doivent être différentes.');
      needIp(source, 'donnez-lui une adresse (configuration de l\'équipement).');
      needIp(target, 'impossible de le joindre sans adresse.');
      if (runId === 'arp') {
        const own = source ? addressedInterfaces(source)[0] : null;
        const targetIp = target ? primaryIp(target) : null;
        if (own && targetIp && !inNetwork(targetIp, own.network, own.prefix)) {
          warnings.push(`${target.label ?? target.id} n'est pas dans le réseau de ${source.label ?? source.id} : ARP cherchera la MAC de la passerelle.`);
        }
        params = { source: values.source, target: values.target };
        break;
      }
      const count = number('count', 'Nombre de requêtes', 1, 5);
      const ttl = number('ttl', 'TTL', 1, 64);
      params = { source: values.source, target: values.target, count, ttl, interval: 7000, timeout: 12000 };
      break;
    }
    case 'udp': {
      const source = need(values.source, 'l\'émetteur');
      const target = need(values.target, 'le destinataire');
      needIp(source, 'impossible d\'envoyer.');
      needIp(target, 'impossible de le joindre.');
      const port = number('port', 'Port', 1, 65535);
      const count = number('count', 'Nombre de datagrammes', 1, 5);
      const closed = integer(values.closedPort, 0);
      if (target && port && !hasService(target, 'udp', port)) warnings.push(`${target.label ?? target.id} n'écoute pas le port UDP ${port} : les datagrammes seront refusés (ICMP « port inaccessible »).`);
      params = { source: values.source, target: values.target, port, count, interval: 2000, ...(closed > 0 ? { closedPort: closed } : {}) };
      break;
    }
    case 'dns': {
      const client = need(values.client, 'l\'équipement qui résout');
      needIp(client, 'il ne peut pas interroger de serveur.');
      if (client && !client.dns) errors.push(`${client.label ?? client.id} n'a pas de serveur DNS : renseignez « Serveur DNS » dans sa configuration.`);
      const names = String(values.names ?? '').split(',').map((name) => name.trim().toLowerCase()).filter(Boolean);
      if (names.length === 0) errors.push('Indiquez au moins un nom à résoudre.');
      for (const name of names) if (!isHostname(name)) errors.push(`« ${name} » n'est pas un nom de domaine complet (exemple : www.ecole.test).`);
      params = { client: values.client, names, interval: 7000, timeout: 10000 };
      break;
    }
    case 'dhcp': {
      const clients = Array.isArray(values.clients) ? values.clients.filter((id) => device(id)) : [];
      if (clients.length === 0) errors.push('Choisissez au moins un client DHCP (un PC sans adresse fixe).');
      for (const id of clients) if (hasIp(device(id))) errors.push(`${nameOf(scenario, id)} a déjà une adresse fixe : effacez-la pour qu'il la demande par DHCP.`);
      if (!scenario.devices.some((candidate) => candidate.dhcp && hasService(candidate, 'udp', 67))) errors.push('Aucun serveur DHCP : donnez le rôle « Serveur DHCP » à un serveur du réseau.');
      params = { clients, verify: Boolean(values.verify), spacing: 8000 };
      break;
    }
    case 'tcp': {
      const client = need(values.client, 'le client');
      const server = need(values.server, 'le serveur');
      if (client && server && client === server) errors.push('Le client et le serveur doivent être différents.');
      needIp(client, 'impossible d\'ouvrir une connexion.');
      needIp(server, 'impossible de le joindre.');
      const port = number('port', 'Port', 1, 65535);
      const size = number('size', 'Taille', 1, 100000);
      const lose = integer(values.loseSegment, 0);
      if (server && port && !hasService(server, 'tcp', port)) warnings.push(`${server.label ?? server.id} n'écoute pas le port TCP ${port} : la connexion sera refusée (RST).`);
      params = { client: values.client, server: values.server, port, size, rto: 6000, ...(lose > 0 ? { loseSegment: lose } : {}) };
      break;
    }
    case 'http': {
      const client = need(values.client, 'le navigateur');
      needIp(client, 'il ne peut rien charger.');
      const url = String(values.url ?? '').trim();
      const match = /^http:\/\/([a-z0-9.-]+)(?::\d+)?(\/\S*)?$/i.exec(url);
      if (!match) errors.push('Adresse : http://nom-du-site/ (HTTPS n\'est pas simulé).');
      else if (!/^\d+\.\d+\.\d+\.\d+$/.test(match[1]) && client && !client.dns) {
        errors.push(`${client.label ?? client.id} doit traduire « ${match[1]} » mais n'a pas de serveur DNS : renseignez-le dans sa configuration.`);
      }
      if (match && /^\d+\.\d+\.\d+\.\d+$/.test(match[1])) errors.push('Utilisez un nom (ex. www.ecole.test) : le scénario HTTP commence par une résolution DNS.');
      params = { client: values.client, urls: match ? [url] : [] };
      break;
    }
    case 'debit': {
      const sources = Array.isArray(values.sources) ? values.sources.filter((id) => device(id)) : [];
      const server = need(values.server, 'le serveur');
      if (sources.length === 0) errors.push('Choisissez au moins un équipement qui envoie.');
      if (server && sources.includes(server.id)) errors.push('Le serveur ne peut pas s\'envoyer un fichier à lui-même.');
      for (const id of sources) needIp(device(id), 'impossible d\'envoyer.');
      needIp(server, 'impossible de le joindre.');
      const port = number('port', 'Port', 1, 65535);
      const size = number('size', 'Taille', 1000, 100000);
      if (server && port && !hasService(server, 'tcp', port)) warnings.push(`${server.label ?? server.id} n'écoute pas le port TCP ${port} : ouvrez-le (configuration, « Ports ouverts »).`);
      params = { transfers: sources.map((id) => ({ client: id, server: values.server, port, size, fileName: `${id}.dat` })), rto: 8000 };
      break;
    }
    default:
      break;
  }
  return { errors, warnings, params: errors.length ? null : params, protocol: run.protocol };
}

/** Explications génériques par protocole (étapes standard) ; {source}, {target}… remplacés par les noms. */
const STEPS = {
  common: [
    ['route-direct', 'Même réseau', 'La destination est dans le réseau de l\'émetteur : le paquet lui est envoyé directement, sans routeur.'],
    ['route-gateway', 'Vers la passerelle', 'La destination est dans un autre réseau : le paquet est confié à la passerelle par défaut (le routeur).'],
    ['no-route', 'Aucune route', 'L\'émetteur ne sait pas où envoyer le paquet : pas de route ni de passerelle pour ce réseau. Voir l\'onglet Recommandations.'],
    ['arp-cache-miss', 'Adresse MAC inconnue', 'L\'adresse MAC du prochain équipement n\'est pas dans le cache ARP : il faut la demander.'],
    ['arp-request', 'Requête ARP', 'Une requête ARP est diffusée à tout le réseau local : « Qui a cette adresse IP ? ».'],
    ['switch-flood', 'Le switch inonde', 'Le switch ne sait pas encore où se trouve le destinataire (ou la trame est diffusée) : il la recopie sur tous ses autres ports.'],
    ['arp-flood', 'Le switch inonde la diffusion', 'Le switch recopie la requête ARP sur tous ses autres ports.'],
    ['arp-reply', 'Réponse ARP', 'L\'équipement qui porte l\'adresse demandée répond directement avec son adresse MAC.'],
    ['arp-cache-update', 'Cache ARP mis à jour', 'L\'émetteur retient l\'adresse MAC reçue : les paquets en attente partent.'],
    ['arp-timeout', 'ARP sans réponse', 'Personne n\'a répondu à la requête ARP : l\'adresse n\'existe pas dans ce réseau. Les paquets en attente sont perdus.'],
    ['router-forward', 'Le routeur fait suivre', 'Le routeur consulte sa table de routage, décrémente le TTL et envoie le paquet vers le réseau suivant.'],
    ['router-no-route', 'Routeur sans route', 'Le routeur n\'a aucune route vers la destination : il détruit le paquet et prévient l\'émetteur (ICMP « destination inaccessible »). Voir Recommandations.'],
    ['router-ttl', 'TTL expiré', 'Le TTL du paquet atteint 0 : le routeur le détruit et prévient l\'émetteur (ICMP « Time Exceeded »).'],
    ['host-not-for-me', 'Paquet refusé', 'Un hôte a reçu un paquet IP qui ne lui est pas destiné : un hôte ne fait pas suivre les paquets.'],
  ],
  icmp: [
    ['icmp-start', 'Ping', '{source} envoie des requêtes d\'écho ICMP à {target} et attend chaque réponse.'],
    ['icmp-request', 'Requête d\'écho', '{source} prépare une requête d\'écho : IP source, IP destination, TTL.'],
    ['icmp-reply', 'Réponse d\'écho', '{target} reçoit la requête et renvoie une réponse d\'écho à {source}.'],
    ['icmp-reply-received', 'Réponse reçue', '{source} reçoit la réponse et mesure le temps aller-retour.'],
    ['icmp-timeout', 'Délai dépassé', 'Aucune réponse dans le délai : « Délai d\'attente de la demande dépassé ».'],
    ['icmp-time-exceeded', 'Message TTL expiré', '{source} reçoit un message ICMP « Time Exceeded » d\'un routeur : son paquet a été détruit en route.'],
    ['icmp-unreachable', 'Destination inaccessible', '{source} reçoit un message ICMP « destination inaccessible » : un routeur ne connaît pas le chemin.'],
    ['icmp-summary', 'Bilan', 'Le ping est terminé. Comparez les temps aller-retour : le premier compte souvent des résolutions ARP.'],
  ],
  arp: [
    ['arp-ignore', 'Requête ignorée', 'Les autres équipements lisent la requête : l\'adresse n\'est pas la leur, ils ne répondent pas.'],
    ['arp-done', 'Terminé', '{source} connaît maintenant l\'adresse MAC cherchée.'],
    ['arp-failed', 'Échec', 'Aucune réponse : l\'adresse cherchée n\'existe pas dans ce réseau local.'],
  ],
  udp: [
    ['udp-start', 'Datagrammes UDP', '{source} envoie des datagrammes à {target}, sans connexion préalable.'],
    ['udp-send', 'Envoi', 'Le datagramme porte un port source éphémère et le port de destination. UDP n\'attend aucune confirmation.'],
    ['udp-delivered', 'Livré', '{target} remet le datagramme au service qui écoute ce port. Il ne répond rien : pas d\'accusé de réception en UDP.'],
    ['udp-send-closed', 'Vers un port fermé', '{source} envoie un datagramme vers un port où rien n\'écoute.'],
    ['udp-port-closed', 'Port fermé', 'Aucun service sur ce port : le datagramme est détruit et l\'émetteur reçoit ICMP « port inaccessible ».'],
    ['udp-icmp-received', 'Erreur reçue', '{source} apprend que le port était fermé : c\'est le seul retour possible en UDP.'],
    ['udp-summary', 'Bilan', 'UDP est simple et rapide, mais sans garantie : l\'émetteur ne sait pas si ses données arrivent.'],
  ],
  dns: [
    ['dns-start', 'Résolution de noms', '{client} doit traduire des noms en adresses IP auprès de son serveur DNS.'],
    ['dns-query', 'Requête DNS', 'Une requête DNS part en UDP vers le port 53 du serveur.'],
    ['dns-answer', 'Réponse du serveur', 'Le serveur DNS trouve l\'enregistrement et répond avec l\'adresse et sa durée de validité (TTL).'],
    ['dns-answer-nxdomain', 'NXDOMAIN', 'Le serveur n\'a aucun enregistrement pour ce nom : il répond NXDOMAIN.'],
    ['dns-response', 'Nom traduit', '{client} reçoit l\'adresse et la garde en cache pendant son TTL.'],
    ['dns-cache-hit', 'Réponse en cache', 'Le nom est déjà dans le cache de {client} : aucun paquet n\'est envoyé.'],
    ['dns-nxdomain', 'Nom inexistant', 'La traduction échoue : ce nom n\'existe pas.'],
    ['dns-timeout', 'Pas de réponse', 'Le serveur DNS ne répond pas : vérifiez son adresse et le chemin (Recommandations).'],
    ['dns-no-server', 'Pas de serveur DNS', '{client} ne connaît aucun serveur DNS.'],
    ['dns-summary', 'Bilan', 'Toutes les demandes sont traitées. DNS utilise UDP : une question, une réponse.'],
  ],
  dhcp: [
    ['dhcp-start', 'Clients sans adresse', 'Les clients n\'ont pas encore d\'adresse IP : ils vont la demander au serveur DHCP.'],
    ['dhcp-discover', 'DISCOVER', 'Un client diffuse DHCP DISCOVER, depuis 0.0.0.0 vers 255.255.255.255 (ports UDP 68 → 67).'],
    ['dhcp-offer', 'OFFER', 'Le serveur DHCP propose la première adresse libre de sa plage, avec le masque, la passerelle et la durée du bail.'],
    ['dhcp-request', 'REQUEST', 'Le client accepte l\'offre en diffusant REQUEST.'],
    ['dhcp-ack', 'ACK', 'Le serveur confirme : l\'adresse est louée à ce client.'],
    ['dhcp-configured', 'Configuré', 'Le client applique sa nouvelle adresse, son masque et sa passerelle.'],
    ['dhcp-verify', 'Vérification', 'Le client pingue sa passerelle pour vérifier sa configuration.'],
    ['dhcp-verified', 'Ça fonctionne', 'La passerelle répond : la configuration obtenue par DHCP est correcte.'],
    ['dhcp-pool-empty', 'Plage épuisée', 'Le serveur n\'a plus d\'adresse libre dans sa plage.'],
    ['dhcp-summary', 'Bilan', 'Tous les clients sont configurés, sans saisie manuelle.'],
  ],
  tcp: [
    ['tcp-start', 'Transfert TCP', 'Une connexion TCP va être ouverte, utilisée pour envoyer des données, puis fermée.'],
    ['tcp-syn', 'SYN', 'Le client envoie SYN avec son numéro de séquence initial.'],
    ['tcp-syn-ack', 'SYN-ACK', 'Le serveur accepte : SYN avec son propre numéro, et ACK du numéro du client + 1.'],
    ['tcp-established', 'Connexion établie', 'Le client acquitte : poignée de main en trois temps terminée.'],
    ['tcp-data', 'Données', 'Les données partent en segments d\'au plus 1000 octets, dans la limite de la fenêtre TCP.'],
    ['tcp-lost', 'Segment perdu', 'Un segment se perd sur le câble (perte simulée).'],
    ['tcp-ack', 'Acquittements', 'Le destinataire acquitte ce qu\'il a reçu en ordre (acquittement cumulatif).'],
    ['tcp-out-of-order', 'Hors ordre', 'Un segment arrive avant celui qui manque : il est gardé de côté, l\'ACK est répété.'],
    ['tcp-dup-ack', 'ACK dupliqué', 'L\'émetteur reçoit le même ACK une seconde fois : indice de perte.'],
    ['tcp-retransmit', 'Retransmission', 'Le délai de retransmission expire : le plus ancien segment non acquitté est renvoyé.'],
    ['tcp-cumulative-ack', 'ACK cumulatif', 'Un seul ACK couvre le segment retransmis et ceux gardés de côté.'],
    ['tcp-delivered', 'Données livrées', 'Les données sont complètes et dans l\'ordre : elles sont remises à l\'application.'],
    ['tcp-transfer-done', 'Transfert terminé', 'Une connexion se ferme ; les autres se partagent maintenant la bande passante.'],
    ['tcp-fin', 'FIN', 'Tout est acquitté : la connexion est fermée par FIN.'],
    ['tcp-fin-ack', 'FIN du serveur', 'L\'autre côté acquitte et ferme aussi (FIN + ACK).'],
    ['tcp-last-ack', 'Dernier ACK', 'Dernier acquittement : la connexion est fermée des deux côtés.'],
    ['tcp-port-closed', 'Port fermé', 'Aucun service n\'écoute ce port sur le serveur.'],
    ['tcp-refused', 'Connexion refusée', 'Le serveur répond RST : connexion refusée.'],
    ['tcp-rst', 'RST', 'Le serveur répond RST : connexion refusée.'],
    ['tcp-failed', 'Échec', 'La connexion n\'a pas abouti : voir l\'onglet Recommandations.'],
    ['tcp-summary', 'Bilan', 'Transfert terminé : TCP a livré toutes les données, dans l\'ordre.'],
  ],
  http: [
    ['http-start', 'Charger une page', '{client} veut afficher une page web : il lui faut d\'abord l\'adresse du site.'],
    ['http-dns', 'D\'abord DNS', '{client} interroge son serveur DNS pour traduire le nom du site.'],
    ['http-dns-done', 'Adresse connue', 'Le nom est traduit : le navigateur ouvre une connexion TCP vers le port 80.'],
    ['http-dns-failed', 'Nom introuvable', 'La traduction du nom a échoué : la page ne peut pas être chargée.'],
    ['http-request', 'Requête GET', 'Le navigateur envoie « GET /chemin HTTP/1.1 » avec l\'en-tête Host.'],
    ['http-response', 'Réponse HTTP', 'Le serveur web répond : code d\'état (200, 404…), type et contenu, en plusieurs segments TCP.'],
    ['http-received', 'Page reçue', 'La réponse est complète : le navigateur affiche la page.'],
    ['http-not-found', 'Page introuvable', 'Le serveur a répondu 404 : la page demandée n\'existe pas.'],
    ['http-close', 'Fermeture', 'Plus rien à demander : le navigateur ferme la connexion TCP.'],
    ['http-failed', 'Échec', 'La connexion au serveur web a échoué : voir l\'onglet Recommandations.'],
    ['http-summary', 'Bilan', 'DNS, puis TCP, puis HTTP : chaque couche s\'appuie sur celle du dessous.'],
  ],
};

const STEP_SETS = {
  ping: ['common', 'icmp'], routage: ['common', 'icmp'], arp: ['common', 'arp'], udp: ['common', 'udp'], dns: ['common', 'dns'],
  dhcp: ['common', 'dhcp'], tcp: ['common', 'tcp'], http: ['common', 'dns', 'tcp', 'http'], debit: ['common', 'tcp'],
};

/**
 * Scénario prêt à jouer : la topologie construite, le protocole, ses paramètres et des
 * explications génériques où les noms des équipements remplacent {source}, {target}, {client}.
 */
export function assembleRun(scenario, runId, params) {
  const run = runOf(runId);
  const names = {
    source: nameOf(scenario, params.source ?? params.client ?? params.transfers?.[0]?.client),
    target: nameOf(scenario, params.target ?? params.server),
    client: nameOf(scenario, params.client ?? params.source),
  };
  const fill = (text) => text.replace(/\{(\w+)\}/g, (_, key) => names[key] ?? key);
  const seen = new Set();
  const steps = [];
  for (const set of STEP_SETS[runId] ?? ['common']) {
    for (const [id, title, text] of STEPS[set]) {
      if (seen.has(id)) continue;
      seen.add(id);
      steps.push({ id, title, text: fill(text) });
    }
  }
  return {
    ...structuredClone(scenario),
    id: 'perso',
    protocol: run.protocol,
    description: `${run.label}, sur une topologie construite dans l'éditeur.`,
    params: structuredClone(params),
    steps,
  };
}
