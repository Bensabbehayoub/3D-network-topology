// Pôle sim : DHCP. Un hôte sans adresse IP obtient sa configuration (adresse, masque,
// passerelle, serveur DNS, durée du bail) d'un serveur DHCP du même réseau local, en quatre
// messages diffusés : DISCOVER, OFFER, REQUEST, ACK (« DORA »). Client : port UDP 68 ;
// serveur : port 67 (à déclarer dans "services"). Le serveur choisit la première adresse libre
// de sa plage (champ "dhcp" du serveur), en évitant les adresses fixes du scénario.
// Une fois configuré, le client peut vérifier sa configuration par un ping vers sa passerelle.
//
// Paramètres (scenario.params) :
//   clients  ids des hôtes à configurer (ou client : un seul id)
//   spacing  ms simulées entre le démarrage de deux clients (6000 par défaut)
//   verify   true : ping vers la passerelle reçue, une fois configuré
//
// Étapes standard (<eq> = id du client ou du serveur) : dhcp-start, dhcp-discover[-<eq>],
// dhcp-offer[-<eq>], dhcp-request[-<eq>], dhcp-ack[-<eq>], dhcp-configured[-<eq>],
// dhcp-verify[-<eq>], dhcp-verified[-<eq>], dhcp-pool-empty, dhcp-summary.

import { describeHeaders } from '../protocol.js';
import { addressedInterfaces, intToIp, ipToInt, maskOf } from '../net.js';
import { configureDevice, explainOnce, LIMITED_BROADCAST, runtimeDevice, sendIp, sendUdp } from '../stack.js';

export const CLIENT_PORT = 68;
export const SERVER_PORT = 67;
export const DEFAULTS = Object.freeze({ spacing: 6000, lease: 86400 });

const BOOTREQUEST = 'BOOTREQUEST';
const BOOTREPLY = 'BOOTREPLY';

/** Adresses fixes déjà utilisées dans le scénario (à ne jamais distribuer). */
function staticAddresses(ctx) {
  const used = new Set();
  for (const device of ctx.scenario.devices) for (const itf of addressedInterfaces(device)) used.add(itf.ip);
  return used;
}

function serverMemory(ctx, serverId) {
  const memory = ctx.memory(serverId);
  memory.dhcpServer ??= { leases: new Map(), offers: new Map() };
  return memory.dhcpServer;
}

/** Première adresse libre de la plage, ou celle déjà proposée / louée à ce client. */
export function chooseAddress(config, { leases, offers }, used, mac) {
  if (leases.has(mac)) return leases.get(mac);
  if (offers.has(mac)) return offers.get(mac);
  const taken = new Set([...leases.values(), ...offers.values(), ...used]);
  for (let value = ipToInt(config.start); value <= ipToInt(config.end); value += 1) {
    const candidate = intToIp(value);
    if (!taken.has(candidate)) return candidate;
  }
  return null;
}

function clientIds(params) {
  if (Array.isArray(params.clients)) return params.clients;
  return params.client ? [params.client] : [];
}

function clientState(ctx, deviceId) {
  return ctx.memory(deviceId).dhcpClient ?? null;
}

function reply(ctx, server, request, type, offered, step) {
  const config = server.dhcp;
  const own = addressedInterfaces(server)[0];
  sendUdp(ctx, server.id, {
    protocol: 'dhcp',
    type,
    dst: LIMITED_BROADCAST, // drapeau de diffusion : le client n'a pas encore d'adresse
    srcPort: SERVER_PORT,
    dstPort: CLIENT_PORT,
    src: own.ip,
    data: {
      op: BOOTREPLY,
      xid: request.data.xid,
      chaddr: request.data.chaddr,
      ciaddr: '0.0.0.0',
      yiaddr: offered,
      siaddr: own.ip,
      options: {
        messageType: type.toUpperCase(),
        serverId: own.ip,
        subnetMask: intToIp(maskOf(config.prefix)),
        router: config.gateway ?? null,
        dns: config.dns ?? null,
        leaseTime: config.lease ?? DEFAULTS.lease,
      },
    },
  }, { step });
}

function serverReceive(ctx, server, packet) {
  const data = packet.data ?? {};
  const memory = serverMemory(ctx, server.id);
  const mac = data.chaddr;
  if (packet.type === 'discover') {
    const offered = chooseAddress(server.dhcp, memory, staticAddresses(ctx), mac);
    if (!offered) {
      const step = explainOnce(ctx, ['dhcp-pool-empty']);
      ctx.drop(server.id, packet, 'plage d\'adresses DHCP épuisée', { step });
      return;
    }
    memory.offers.set(mac, offered);
    reply(ctx, server, packet, 'offer', offered, explainOnce(ctx, [`dhcp-offer-${server.id}`, 'dhcp-offer']));
    return;
  }
  if (packet.type === 'request') {
    const own = addressedInterfaces(server)[0];
    if (data.options?.serverId !== own.ip) {
      memory.offers.delete(mac); // le client a choisi un autre serveur
      return;
    }
    const offered = memory.offers.get(mac) ?? memory.leases.get(mac);
    if (!offered || offered !== data.options?.requestedIp) return;
    memory.offers.delete(mac);
    memory.leases.set(mac, offered);
    reply(ctx, server, packet, 'ack', offered, explainOnce(ctx, [`dhcp-ack-${server.id}`, 'dhcp-ack']));
  }
}

function clientReceive(ctx, client, packet) {
  const state = clientState(ctx, client.id);
  const data = packet.data ?? {};
  if (!state || data.xid !== state.xid || data.chaddr !== state.mac) return; // pour un autre client
  if (packet.type === 'offer' && state.phase === 'discovering') {
    state.phase = 'requesting';
    state.offer = { ip: data.yiaddr, serverId: data.options.serverId };
    const step = explainOnce(ctx, [`dhcp-request-${client.id}`, 'dhcp-request']);
    sendUdp(ctx, client.id, {
      protocol: 'dhcp',
      type: 'request',
      dst: LIMITED_BROADCAST,
      srcPort: CLIENT_PORT,
      dstPort: SERVER_PORT,
      src: '0.0.0.0',
      data: { op: BOOTREQUEST, xid: state.xid, chaddr: state.mac, ciaddr: '0.0.0.0', yiaddr: '0.0.0.0', siaddr: '0.0.0.0',
        options: { messageType: 'REQUEST', requestedIp: data.yiaddr, serverId: data.options.serverId } },
    }, { step });
    return;
  }
  if (packet.type === 'ack' && state.phase === 'requesting') {
    state.phase = 'bound';
    const length = prefixOfMask(data.options.subnetMask);
    state.lease = { ip: data.yiaddr, prefix: length, gateway: data.options.router, dns: data.options.dns, leaseTime: data.options.leaseTime };
    configureDevice(ctx, client.id, {
      interface: state.interface,
      ip: `${data.yiaddr}/${length}`,
      gateway: data.options.router ?? undefined,
      dns: data.options.dns ?? undefined,
    });
    explainOnce(ctx, [`dhcp-configured-${client.id}`, 'dhcp-configured']);
    if (ctx.params.verify && data.options.router) {
      ctx.schedule(500, () => {
        const step = explainOnce(ctx, [`dhcp-verify-${client.id}`, 'dhcp-verify']);
        sendIp(ctx, client.id, { protocol: 'icmp', type: 'echo-request', ip: { dst: data.options.router }, data: { identifier: 1, sequence: 1 } }, { step });
      });
    } else {
      finish(ctx);
    }
  }
}

function finish(ctx) {
  const ids = clientIds(ctx.params);
  const done = ids.every((id) => {
    const state = clientState(ctx, id);
    return state && (state.phase === 'verified' || (state.phase === 'bound' && !ctx.params.verify));
  });
  if (done) explainOnce(ctx, ['dhcp-summary']);
}

/** Longueur de préfixe d'un masque : '255.255.255.0' → 24. */
export function prefixOfMask(mask) {
  const value = ipToInt(mask);
  let length = 0;
  while (length < 32 && (value & (0x80000000 >>> length)) !== 0) length += 1;
  return length;
}

export default {
  name: 'dhcp',

  start(ctx) {
    const spacing = Number.isFinite(ctx.params.spacing) && ctx.params.spacing > 0 ? ctx.params.spacing : DEFAULTS.spacing;
    explainOnce(ctx, ['dhcp-start']);
    clientIds(ctx.params).forEach((id, index) => {
      ctx.schedule(index * spacing, () => {
        const client = ctx.device(id);
        const itf = client.interfaces.find((candidate) => candidate.mac);
        const state = { xid: 0x3c00 + index, mac: itf.mac, interface: itf.name, phase: 'discovering', offer: null, lease: null };
        ctx.memory(id).dhcpClient = state;
        const step = explainOnce(ctx, [`dhcp-discover-${id}`, 'dhcp-discover']);
        sendUdp(ctx, id, {
          protocol: 'dhcp',
          type: 'discover',
          dst: LIMITED_BROADCAST,
          srcPort: CLIENT_PORT,
          dstPort: SERVER_PORT,
          src: '0.0.0.0',
          data: { op: BOOTREQUEST, xid: state.xid, chaddr: state.mac, ciaddr: '0.0.0.0', yiaddr: '0.0.0.0', siaddr: '0.0.0.0',
            options: { messageType: 'DISCOVER' } },
        }, { interface: itf.name, step });
      });
    });
  },

  onReceive(device, packet, ctx) {
    if (packet.protocol === 'dhcp') {
      if (device.dhcp && (packet.type === 'discover' || packet.type === 'request')) serverReceive(ctx, device, packet);
      else if (packet.type === 'offer' || packet.type === 'ack') clientReceive(ctx, runtimeDevice(ctx, device), packet);
      return;
    }
    if (packet.protocol === 'icmp' && packet.type === 'echo-reply') {
      const state = clientState(ctx, device.id);
      if (state?.phase !== 'bound') return;
      state.phase = 'verified';
      explainOnce(ctx, [`dhcp-verified-${device.id}`, 'dhcp-verified']);
      finish(ctx);
    }
  },

  describe(packet) {
    const data = packet.data ?? {};
    const options = data.options ?? {};
    const fields = [
      ...describeHeaders(packet),
      { layer: 'DHCP', field: 'Message', value: String(options.messageType ?? packet.type).toUpperCase() },
      { layer: 'DHCP', field: 'Transaction (xid)', value: `0x${Number(data.xid ?? 0).toString(16)}` },
      { layer: 'DHCP', field: 'MAC du client', value: String(data.chaddr ?? '') },
    ];
    if (data.yiaddr && data.yiaddr !== '0.0.0.0') fields.push({ layer: 'DHCP', field: 'Adresse proposée', value: data.yiaddr });
    if (options.requestedIp) fields.push({ layer: 'DHCP', field: 'Adresse demandée', value: options.requestedIp });
    if (options.serverId) fields.push({ layer: 'DHCP', field: 'Serveur', value: options.serverId });
    if (options.subnetMask) fields.push({ layer: 'DHCP', field: 'Masque', value: options.subnetMask });
    if (options.router) fields.push({ layer: 'DHCP', field: 'Passerelle', value: options.router });
    if (options.dns) fields.push({ layer: 'DHCP', field: 'Serveur DNS', value: options.dns });
    if (options.leaseTime) fields.push({ layer: 'DHCP', field: 'Durée du bail', value: `${options.leaseTime} s` });
    return fields;
  },
};
