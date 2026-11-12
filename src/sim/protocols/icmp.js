// Aziz (S3) : ICMP Echo Request / Echo Reply.
// ICMP ne fait ni ARP, ni commutation, ni routage : ces responsabilites restent aux equipements.

import { describeHeaders } from '../protocol.js';
import { parseCidr } from '../scenario.js';

export const ICMP_TYPES = Object.freeze({ ECHO_REQUEST: 'echo-request', ECHO_REPLY: 'echo-reply' });
export const DEFAULT_TTL = 64;
export const DEFAULT_IDENTIFIER = 1;
export const DEFAULT_SEQUENCE = 1;

const isIntegerIn = (value, minimum, maximum) => Number.isInteger(value) && value >= minimum && value <= maximum;

function deviceAddresses(device) {
  return (device?.interfaces ?? [])
    .map((networkInterface) => ({ networkInterface, cidr: parseCidr(networkInterface.ip) }))
    .filter(({ cidr }) => cidr);
}

function requireAddress(device, interfaceName) {
  const addresses = deviceAddresses(device);
  const selected = interfaceName
    ? addresses.find(({ networkInterface }) => networkInterface.name === interfaceName)
    : addresses[0];
  if (!selected) {
    const suffix = interfaceName ? ` sur l'interface "${interfaceName}"` : '';
    throw new Error(`ICMP : ${device?.id ?? 'equipement'} n'a pas d'adresse IPv4${suffix}`);
  }
  return selected;
}

function requireCounter(value, fallback, name) {
  const result = value ?? fallback;
  if (!isIntegerIn(result, 0, 65_535)) throw new RangeError(`ICMP : ${name} doit etre un entier entre 0 et 65535`);
  return result;
}

function requireTtl(value) {
  const ttl = value ?? DEFAULT_TTL;
  if (!isIntegerIn(ttl, 1, 255)) throw new RangeError('ICMP : ttl doit etre un entier entre 1 et 255');
  return ttl;
}

function hasStep(ctx, id) {
  return ctx.scenario?.steps?.some((step) => step.id === id) === true;
}

/** Construit une demande d'echo conforme au contrat Packet. */
export function createEchoRequest({ id, source, destination, identifier, sequence, payload, ttl = DEFAULT_TTL }) {
  if (typeof id !== 'string' || id === '') throw new TypeError('ICMP : id de paquet non vide requis');
  if (!parseCidr(`${source}/32`) || !parseCidr(`${destination}/32`)) {
    throw new TypeError('ICMP : adresses IPv4 source et destination valides requises');
  }
  return {
    id,
    protocol: 'icmp',
    type: ICMP_TYPES.ECHO_REQUEST,
    // La couche hote/ARP remplacera cette valeur lorsqu'elle sera branchee au moteur.
    eth: null,
    ip: { src: source, dst: destination, ttl: requireTtl(ttl) },
    transport: null,
    data: {
      identifier: requireCounter(identifier, DEFAULT_IDENTIFIER, 'identifier'),
      sequence: requireCounter(sequence, DEFAULT_SEQUENCE, 'sequence'),
      ...(payload === undefined ? {} : { payload }),
    },
  };
}

/** Construit la reponse correspondant exactement a une requete valide. */
export function createEchoReply(request, id, ttl = DEFAULT_TTL) {
  validateEcho(request, ICMP_TYPES.ECHO_REQUEST);
  if (typeof id !== 'string' || id === '') throw new TypeError('ICMP : id de paquet non vide requis');
  return {
    id,
    protocol: 'icmp',
    type: ICMP_TYPES.ECHO_REPLY,
    eth: request.eth ? { src: request.eth.dst, dst: request.eth.src } : null,
    ip: { src: request.ip.dst, dst: request.ip.src, ttl: requireTtl(ttl) },
    transport: null,
    data: {
      identifier: request.data.identifier,
      sequence: request.data.sequence,
      ...(Object.hasOwn(request.data, 'payload') ? { payload: structuredClone(request.data.payload) } : {}),
    },
  };
}

function validateEcho(packet, expectedType = null) {
  if (!packet || typeof packet !== 'object' || packet.protocol !== 'icmp') throw new TypeError('ICMP : paquet ICMP requis');
  if (expectedType && packet.type !== expectedType) throw new TypeError(`ICMP : message ${expectedType} requis`);
  if (!Object.values(ICMP_TYPES).includes(packet.type)) throw new TypeError(`ICMP : type non pris en charge "${packet.type}"`);
  if (!packet.ip || !parseCidr(`${packet.ip.src}/32`) || !parseCidr(`${packet.ip.dst}/32`)) {
    throw new TypeError('ICMP : en-tete IP valide requis');
  }
  if (!Number.isInteger(packet.ip.ttl)) throw new TypeError('ICMP : TTL entier requis');
  if (!packet.data || !isIntegerIn(packet.data.identifier, 0, 65_535)
      || !isIntegerIn(packet.data.sequence, 0, 65_535)) {
    throw new TypeError('ICMP : identifier et sequence (0..65535) requis');
  }
}

const icmp = {
  name: 'icmp',

  start(ctx) {
    const sourceId = ctx.params?.source;
    const targetId = ctx.params?.target;
    if (typeof sourceId !== 'string' || typeof targetId !== 'string') {
      throw new Error('ICMP : params.source et params.target sont requis');
    }
    const source = requireAddress(ctx.device(sourceId), ctx.params.interface);
    const destination = requireAddress(ctx.device(targetId), ctx.params.targetInterface);
    const packet = createEchoRequest({
      id: ctx.nextPacketId(),
      source: source.cidr.address,
      destination: destination.cidr.address,
      identifier: ctx.params.identifier,
      sequence: ctx.params.sequence,
      payload: ctx.params.payload,
      ttl: ctx.params.ttl,
    });
    const step = hasStep(ctx, 'icmp-request') ? 'icmp-request' : null;
    if (step) ctx.explain(step);
    ctx.send(sourceId, packet, { interface: source.networkInterface.name, step });
    return packet;
  },

  onReceive(device, packet, ctx) {
    // Un scenario ping transporte aussi ARP : ce message appartient a son propre gestionnaire.
    if (packet?.protocol !== 'icmp') return false;
    try {
      validateEcho(packet);
    } catch (error) {
      if (packet?.id && packet?.type) ctx.drop(device.id, packet, error.message);
      return false;
    }
    if (packet.ip.ttl <= 0) {
      ctx.drop(device.id, packet, 'TTL expire');
      return true;
    }
    const local = deviceAddresses(device).find(({ cidr }) => cidr.address === packet.ip.dst);
    if (!local) return false;
    if (packet.type === ICMP_TYPES.ECHO_REPLY) return true;

    const reply = createEchoReply(packet, ctx.nextPacketId(), ctx.params?.replyTtl ?? DEFAULT_TTL);
    const step = hasStep(ctx, 'icmp-reply') ? 'icmp-reply' : null;
    if (step) ctx.explain(step);
    ctx.send(device.id, reply, { interface: local.networkInterface.name, step });
    return true;
  },

  describe(packet) {
    const fields = [];
    try {
      fields.push(...describeHeaders(packet));
    } catch {
      fields.push({ layer: 'Paquet', field: 'Protocole', value: 'ICMP' });
    }
    const labels = {
      [ICMP_TYPES.ECHO_REQUEST]: ['Echo Request (type 8)', 'Demande une reponse a l\'hote destinataire pour verifier son accessibilite.'],
      [ICMP_TYPES.ECHO_REPLY]: ['Echo Reply (type 0)', 'Confirme que la demande d\'echo a atteint sa destination.'],
    };
    const [message, explanation] = labels[packet?.type]
      ?? ['Message ICMP inconnu', 'Ce type ICMP simplifie n\'est pas pris en charge par ce scenario.'];
    fields.push(
      { layer: 'ICMP', field: 'Message', value: message },
      { layer: 'ICMP', field: 'Identifiant', value: packet?.data?.identifier == null ? '—' : String(packet.data.identifier) },
      { layer: 'ICMP', field: 'Sequence', value: packet?.data?.sequence == null ? '—' : String(packet.data.sequence) },
      { layer: 'ICMP', field: 'Explication', value: explanation },
    );
    return fields;
  },
};

export default icmp;
