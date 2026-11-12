// Pôle render : couleur et taille des paquets selon leur protocole (fonctions pures).
//
// Une couleur par protocole, assez différentes pour se distinguer sur le fond sombre de la scène
// et dans le journal de l'interface (qui les lit par app.render.packetStyle). Une diffusion
// (MAC ff:ff:ff:ff:ff:ff) est dessinée plus grosse, de la même couleur : on voit à la fois
// « quel protocole » et « envoyé à tous ».

/** Couleurs par protocole (hexadécimal CSS). */
export const PROTOCOL_COLORS = Object.freeze({
  arp: '#ffd166', // jaune
  icmp: '#ef476f', // rose
  udp: '#06d6a0', // vert
  dns: '#a78bfa', // violet
  dhcp: '#f78c3b', // orange
  tcp: '#4ea8ff', // bleu
  http: '#38d9f5', // cyan
});

/** Couleur des protocoles sans couleur propre (démonstration, protocole futur). */
export const DEFAULT_COLOR = '#c0c8d2';

export const UNICAST_RADIUS = 0.3;
export const BROADCAST_RADIUS = 0.42;

/** Libellés courts des protocoles, pour la légende. */
export const PROTOCOL_LABELS = Object.freeze({
  arp: 'ARP', icmp: 'ICMP', udp: 'UDP', dns: 'DNS', dhcp: 'DHCP', tcp: 'TCP', http: 'HTTP',
});

/**
 * Style d'un paquet.
 * @param {string} protocol champ packet.protocol
 * @param {boolean} [broadcast] paquet diffusé
 * @returns {{ color: string, radius: number }}
 */
export function packetStyle(protocol, broadcast = false) {
  const color = PROTOCOL_COLORS[String(protocol ?? '').toLowerCase()] ?? DEFAULT_COLOR;
  return { color, radius: broadcast ? BROADCAST_RADIUS : UNICAST_RADIUS };
}

/** '#ffd166' → 0xffd166 (pour Three.js). */
export function colorNumber(hex) {
  return Number.parseInt(hex.slice(1), 16);
}
