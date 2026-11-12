// Pôle sim : taille des trames, temps d'émission, bande passante et mesure du trafic (phase 5).
// Fonctions pures et compteur sans DOM : testés sous Node.
//
// ÉCHELLE DE TEMPS. La simulation est ralentie pour qu'on voie les paquets : 1 seconde de
// simulation (à vitesse ×1) représente 1 milliseconde de réseau réel (SLOWDOWN = 1000).
// Les débits sont donc calculés en temps « réseau » : une trame de 1500 octets met 12 µs à
// partir sur un lien à 1 Gb/s, soit 12 ms de simulation.
//
// TEMPS D'ÉMISSION. Une trame occupe le câble pendant (taille + 20 octets de préambule et
// d'intervalle) × 8 / bande passante. Un port n'émet qu'une trame à la fois : les suivantes
// attendent dans sa file (commands.js). Le débit ne peut donc jamais dépasser la bande passante.

import { CABLES, portSpeed } from './catalog.js';
import { findDevice, parseEndpoint } from './scenario.js';

/** 1 ms de simulation = 1 µs de réseau. */
export const SLOWDOWN = 1000;
/** Préambule (8 octets) et intervalle entre trames (12 octets) : occupent le câble sans être comptés. */
export const WIRE_OVERHEAD = 20;
export const ETHERNET_HEADER = 18; // en-tête 14 + somme de contrôle 4
export const MIN_FRAME = 64;
/** Fenêtre du débit « instantané » (ms de simulation) : 1 ms de réseau. */
export const WINDOW = 1000;

/** Taille des données utiles (octets) au-dessus d'Ethernet, selon le protocole. */
export function payloadSize(packet) {
  const data = packet?.data ?? {};
  if (packet?.protocol === 'arp') return 28;
  if (!packet?.ip) return Number.isFinite(data.length) ? data.length : 46;
  let size = 20; // en-tête IP
  const transport = packet.transport?.protocol;
  if (transport === 'tcp') return size + 20 + (data.length ?? 0);
  if (transport === 'udp') {
    size += 8;
    if (packet.protocol === 'dns') {
      const name = String(data.question?.name ?? '');
      return size + 12 + name.length + 2 + 4 + 16 * (data.answers?.length ?? 0);
    }
    if (packet.protocol === 'dhcp') return size + 300;
    return size + (Number.isFinite(data.length) ? data.length : String(data.message ?? '').length + 16);
  }
  if (packet.protocol === 'icmp') {
    return size + 8 + (data.original ? 28 : 32); // écho : 32 octets de données ; erreur : en-tête IP + 8 octets d'origine
  }
  return size + (Number.isFinite(data.length) ? data.length : 0);
}

/** Taille de la trame Ethernet (octets), 64 au minimum. */
export function frameSize(packet) {
  return Math.max(MIN_FRAME, ETHERNET_HEADER + payloadSize(packet));
}

/** Bande passante effective d'un lien (Mb/s) : la plus petite de ses deux ports, du lien et du câble. */
export function linkBandwidth(scenario, link) {
  const limits = [];
  for (const side of ['a', 'b']) {
    const end = parseEndpoint(link[side]);
    const device = end ? findDevice(scenario, end.device) : null;
    if (device) limits.push(portSpeed(device, end.interface));
  }
  if (Number.isFinite(link.bandwidth)) limits.push(link.bandwidth);
  if (link.cable && CABLES[link.cable]) limits.push(CABLES[link.cable].maxSpeed);
  return limits.length ? Math.min(...limits) : 1000;
}

/** Durée d'émission d'une trame (ms de simulation) sur un lien de `bandwidth` Mb/s. */
export function transmissionTime(bytes, bandwidth) {
  // bits / (Mb/s) = µs de réseau ; × SLOWDOWN / 1000 : ms de simulation (1 µs réseau = 1 ms ici).
  return (((bytes + WIRE_OVERHEAD) * 8) / bandwidth) * (SLOWDOWN / 1000);
}

/**
 * Modèle de transmission donné au moteur (createSimulation({ transmission })) : taille de la
 * trame et durée d'émission sur la bande passante effective du lien.
 */
export function transmissionModel(scenario, link, packet) {
  const bytes = frameSize(packet);
  return { bytes, duration: transmissionTime(bytes, linkBandwidth(scenario, link)) };
}

/** Débit (Mb/s, temps réseau) de `bytes` octets en `ms` ms de simulation. */
export function throughput(bytes, ms) {
  return ms > 0 ? (bytes * 8 * SLOWDOWN) / (ms * 1000) : 0;
}

/**
 * Compteur de trafic : alimenté par les évènements d'envoi, il donne débits et utilisation par
 * port, par lien (dans chaque sens) et par équipement.
 */
export function createTrafficMeter() {
  let records = [];
  let totals = new Map();
  const addTotal = (key, bytes) => totals.set(key, (totals.get(key) ?? 0) + bytes);

  return {
    /** Enregistre un évènement réseau (seuls les envois avec une taille comptent). */
    add(event) {
      if (event?.type !== 'send' || !Number.isFinite(event.bytes)) return;
      const record = {
        link: event.link,
        from: `${event.source}:${event.sourceInterface}`,
        to: `${event.destination}:${event.destinationInterface}`,
        bytes: event.bytes,
        start: event.time,
        end: Number.isFinite(event.transmitted) ? event.transmitted : event.time,
      };
      records.push(record);
      addTotal(`tx|${record.from}`, record.bytes);
      addTotal(`rx|${record.to}`, record.bytes);
      addTotal(`link|${record.link}|${record.from}`, record.bytes);
    },
    reset() {
      records = [];
      totals = new Map();
    },
    /**
     * État du trafic à l'instant `now` (ms de simulation).
     * @returns {{ time: number, links: object, ports: object, devices: object }}
     */
    snapshot(scenario, now) {
      const windowStart = Math.max(0, now - WINDOW);
      const span = Math.min(WINDOW, now) || WINDOW;
      records = records.filter((record) => record.end >= windowStart); // le reste ne compte plus pour le débit instantané
      const recent = new Map();
      for (const record of records) {
        const duration = record.end - record.start;
        const overlap = duration > 0
          ? Math.max(0, Math.min(record.end, now) - Math.max(record.start, windowStart)) / duration
          : record.start >= windowStart && record.start <= now ? 1 : 0;
        if (overlap <= 0) continue;
        const bytes = record.bytes * overlap;
        for (const key of [`tx|${record.from}`, `rx|${record.to}`, `link|${record.link}|${record.from}`]) {
          recent.set(key, (recent.get(key) ?? 0) + bytes);
        }
      }
      const measure = (key, capacity) => {
        const current = throughput(recent.get(key) ?? 0, span);
        return {
          current,
          average: throughput(totals.get(key) ?? 0, now),
          bytes: totals.get(key) ?? 0,
          utilization: capacity > 0 ? Math.min(1, current / capacity) : 0,
        };
      };

      const links = {};
      const linkedPorts = new Map();
      for (const link of scenario?.links ?? []) {
        const bandwidth = linkBandwidth(scenario, link);
        const ab = measure(`link|${link.id}|${link.a}`, bandwidth);
        const ba = measure(`link|${link.id}|${link.b}`, bandwidth);
        links[link.id] = { bandwidth, cable: link.cable ?? null, ab, ba, utilization: Math.max(ab.utilization, ba.utilization) };
        linkedPorts.set(link.a, { link: link.id, peer: link.b, bandwidth });
        linkedPorts.set(link.b, { link: link.id, peer: link.a, bandwidth });
      }

      const ports = {};
      const devices = {};
      for (const device of scenario?.devices ?? []) {
        let current = 0;
        let average = 0;
        let capacity = 0;
        for (const itf of device.interfaces ?? []) {
          const key = `${device.id}:${itf.name}`;
          const linked = linkedPorts.get(key) ?? null;
          const speed = portSpeed(device, itf.name);
          const rate = linked ? linked.bandwidth : 0;
          const tx = measure(`tx|${key}`, rate);
          const rx = measure(`rx|${key}`, rate);
          ports[key] = {
            device: device.id, interface: itf.name, speed, linked: Boolean(linked), link: linked?.link ?? null,
            peer: linked?.peer ?? null, negotiated: rate || null, tx, rx,
            utilization: Math.max(tx.utilization, rx.utilization),
          };
          current += tx.current + rx.current;
          average += tx.average + rx.average;
          if (linked) capacity += rate * 2; // duplex intégral : émission et réception en même temps
        }
        devices[device.id] = { current, average, bandwidth: capacity, utilization: capacity > 0 ? Math.min(1, current / capacity) : 0 };
      }
      return { time: now, links, ports, devices };
    },
  };
}
