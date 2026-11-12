// Pôle sim : TCP. Connexion fiable entre deux ports : poignée de main en trois temps
// (SYN, SYN-ACK, ACK), numéros de séquence et d'acquittement, découpage en segments (MSS),
// acquittements cumulatifs, mise en mémoire des segments arrivés dans le désordre, ACK dupliqués,
// retransmission à l'expiration du délai (RTO), fermeture par FIN, refus par RST.
//
// Simplifications assumées (pour rester lisible) : numéros de séquence initiaux fixes (1000 côté
// client, 5000 côté serveur ; aléatoires en vrai), fenêtre fixe, pas de contrôle de congestion,
// FIN et ACK du serveur envoyés ensemble, pas d'attente TIME_WAIT.
//
// API réutilisable (HTTP l'utilise) :
//   connect(ctx, clientId, { dstIp, dstPort, protocol?, onEstablished(conn), onMessage(conn, msg),
//     onClosed(conn), onFailed(reason) })                    → ouvre une connexion
//   handleTcp(ctx, device, packet, listener)                 → à appeler depuis onReceive
//     listener = { protocol?, onAccept?(conn), onMessage?(conn, msg), onClosed?(conn) } pour un serveur
//   conn.send(message, { protocol, type, step? })            → message = { size, …champs libres }
//   conn.close()                                             → fermeture après acquittement de tout
//
// Paramètres du scénario « tcp » : client, server (id) ou serverIp, port (9000), size (3000 octets),
// loseSegment (numéro du segment de données perdu une fois, aucun par défaut), closedPort.

import { describeHeaders } from '../protocol.js';
import { primaryIp } from '../net.js';
import { explainOnce, openPort, runtimeDevice, sendIp } from '../stack.js';

export const MSS = 1000;
export const WINDOW = 8000;
export const DEFAULTS = Object.freeze({ rto: 6000, maxRetries: 3, gap: 150, port: 9000, size: 3000 });
const CLIENT_ISN = 1000;
const SERVER_ISN = 5000;

function tcpMemory(ctx, deviceId) {
  const memory = ctx.memory(deviceId);
  memory.tcp ??= { connections: new Map(), opened: 0 };
  return memory.tcp;
}

const keyOf = (localPort, remoteIp, remotePort) => `${localPort}|${remoteIp}|${remotePort}`;

function settings(ctx) {
  const rto = ctx.params.rto;
  return { rto: Number.isFinite(rto) && rto > 0 ? rto : DEFAULTS.rto, maxRetries: DEFAULTS.maxRetries };
}

/** Émet un segment ; `lose` : perdu sur le câble (perte simulée, publiée comme une perte). */
function emit(ctx, conn, { type, flags, seq, ack, protocol = 'tcp', data = {}, step = null, lose = false }) {
  const packet = {
    protocol,
    type,
    ip: { src: conn.local.ip, dst: conn.remote.ip },
    transport: { protocol: 'tcp', src: conn.local.port, dst: conn.remote.port, flags, seq, ack, window: WINDOW },
    data: { length: 0, ...data },
  };
  if (lose) {
    const lost = { id: ctx.nextPacketId(), eth: null, ...packet, ip: { ...packet.ip, ttl: 64 } };
    ctx.drop(conn.device, lost, 'segment perdu sur le câble (perte simulée)', { step });
    return;
  }
  sendIp(ctx, conn.device, packet, { step });
}

/** Garde un segment jusqu'à son acquittement ; démarre la temporisation si aucune ne tourne. */
function track(ctx, conn, segment) {
  conn.outbox.push(segment);
  if (!conn.timer) restartTimer(ctx, conn);
}

/**
 * Une seule temporisation de retransmission par connexion, comme TCP : à son expiration, seul
 * le plus ancien segment non acquitté est renvoyé. Relancée à chaque acquittement qui avance.
 */
function restartTimer(ctx, conn) {
  conn.timer?.();
  conn.timer = null;
  if (conn.outbox.length === 0 || conn.state === 'CLOSED') return;
  const { rto, maxRetries } = settings(ctx);
  conn.timer = ctx.schedule(rto, () => {
    conn.timer = null;
    const oldest = conn.outbox[0];
    if (!oldest || conn.state === 'CLOSED') return;
    if (oldest.retries >= maxRetries) {
      fail(ctx, conn, 'pas d\'acquittement après plusieurs retransmissions');
      return;
    }
    oldest.retries += 1;
    const step = explainOnce(ctx, [`tcp-retransmit-${oldest.number ?? oldest.kind}`, 'tcp-retransmit']);
    emit(ctx, conn, { ...oldest.fields, ack: conn.rcvNxt, step });
    restartTimer(ctx, conn);
  });
}

function fail(ctx, conn, reason) {
  conn.timer?.();
  conn.timer = null;
  conn.outbox = [];
  conn.state = 'CLOSED';
  tcpMemory(ctx, conn.device).connections.delete(conn.key);
  conn.handlers.onFailed?.(reason, conn);
}

function closed(ctx, conn) {
  conn.timer?.();
  conn.timer = null;
  conn.state = 'CLOSED';
  tcpMemory(ctx, conn.device).connections.delete(conn.key);
  explainOnce(ctx, [`tcp-closed-${conn.device}`, 'tcp-closed']);
  conn.handlers.onClosed?.(conn);
}

function createConnection(ctx, deviceId, { localIp, localPort, remoteIp, remotePort, isn, role, handlers, protocol }) {
  const conn = {
    device: deviceId, role, protocol,
    local: { ip: localIp, port: localPort },
    remote: { ip: remoteIp, port: remotePort },
    key: keyOf(localPort, remoteIp, remotePort),
    state: 'CLOSED',
    sndUna: isn, sndNxt: isn, writeSeq: isn, rcvNxt: 0,
    outbox: [], timer: null, unsent: 0, buffered: new Map(), dupAcks: 0, dataSegments: 0, messages: 0,
    closeRequested: false, handlers,
  };
  conn.send = (message, options) => sendMessage(ctx, conn, message, options);
  conn.close = () => requestClose(ctx, conn);
  tcpMemory(ctx, deviceId).connections.set(conn.key, conn);
  return conn;
}

/**
 * Ouvre une connexion TCP depuis `clientId` (port éphémère) vers dstIp:dstPort.
 * @returns {object} la connexion (état SYN_SENT)
 */
export function connect(ctx, clientId, { dstIp, dstPort, protocol = 'tcp', onEstablished, onMessage, onClosed, onFailed }) {
  const device = runtimeDevice(ctx, ctx.device(clientId));
  const memory = tcpMemory(ctx, clientId);
  const isn = CLIENT_ISN + 10000 * memory.opened;
  memory.opened += 1;
  const conn = createConnection(ctx, clientId, {
    localIp: primaryIp(device), localPort: openPort(ctx, clientId, 'tcp'), remoteIp: dstIp, remotePort: dstPort,
    isn, role: 'client', protocol, handlers: { onEstablished, onMessage, onClosed, onFailed },
  });
  conn.state = 'SYN_SENT';
  const step = explainOnce(ctx, [`tcp-syn-${clientId}`, 'tcp-syn']);
  const fields = { type: 'syn', flags: ['SYN'], seq: isn, ack: 0 };
  emit(ctx, conn, { ...fields, step });
  conn.sndNxt = isn + 1;
  conn.writeSeq = isn + 1;
  track(ctx, conn, { seq: isn, end: isn + 1, kind: 'syn', fields, retries: 0 });
  return conn;
}

/** Découpe un message applicatif en segments de MSS octets et les envoie l'un après l'autre. */
function sendMessage(ctx, conn, message, { protocol = conn.protocol, type = 'data', step = null } = {}) {
  const size = Math.max(1, Math.floor(message.size ?? 1));
  const parts = Math.ceil(size / MSS);
  conn.messages += 1;
  const messageId = conn.messages;
  for (let part = 1; part <= parts; part += 1) {
    const length = part < parts ? MSS : size - MSS * (parts - 1);
    const seq = conn.writeSeq; // numéro réservé maintenant, segment émis un peu plus tard
    conn.writeSeq += length;
    conn.dataSegments += 1;
    conn.unsent += 1;
    const number = conn.dataSegments;
    ctx.schedule((part - 1) * DEFAULTS.gap, () => {
      conn.unsent -= 1;
      if (conn.state === 'CLOSED') return;
      const lose = shouldLose(ctx, conn, number);
      const segmentStep = lose
        ? explainOnce(ctx, [`tcp-lost-${number}`, 'tcp-lost'])
        : explainOnce(ctx, [`tcp-data-${conn.role}-${number}`, `tcp-data-${number}`, 'tcp-data']) ?? step;
      const fields = { type, flags: part === parts ? ['PSH', 'ACK'] : ['ACK'], seq, protocol,
        data: { length, messageId, part, parts, message } };
      emit(ctx, conn, { ...fields, ack: conn.rcvNxt, step: segmentStep ?? step, lose });
      conn.sndNxt = Math.max(conn.sndNxt, seq + length);
      track(ctx, conn, { seq, end: seq + length, kind: 'data', number, fields, retries: 0 });
    });
  }
}

/** Perte simulée : le segment de données numéro params.loseSegment de l'émetteur params.loseFrom, une seule fois. */
function shouldLose(ctx, conn, number) {
  const { loseSegment, loseFrom = 'client' } = ctx.params;
  if (!Number.isInteger(loseSegment) || loseSegment !== number || loseFrom !== conn.role) return false;
  const memory = tcpMemory(ctx, conn.device);
  memory.lost ??= new Set();
  const key = `${conn.key}#${number}`;
  if (memory.lost.has(key)) return false;
  memory.lost.add(key);
  return true;
}

function requestClose(ctx, conn) {
  conn.closeRequested = true;
  maybeClose(ctx, conn);
}

function maybeClose(ctx, conn) {
  if (!conn.closeRequested || conn.unsent > 0 || conn.outbox.length > 0 || conn.state !== 'ESTABLISHED') return;
  conn.state = 'FIN_WAIT';
  const step = explainOnce(ctx, [`tcp-fin-${conn.device}`, 'tcp-fin']);
  const fields = { type: 'fin', flags: ['FIN', 'ACK'], seq: conn.sndNxt };
  emit(ctx, conn, { ...fields, ack: conn.rcvNxt, step });
  track(ctx, conn, { seq: conn.sndNxt, end: conn.sndNxt + 1, kind: 'fin', fields, retries: 0 });
  conn.sndNxt += 1;
  conn.writeSeq = conn.sndNxt;
}

function sendAck(ctx, conn, step = null) {
  emit(ctx, conn, { type: 'ack', flags: ['ACK'], seq: conn.sndNxt, ack: conn.rcvNxt, step });
}

/** Acquittement reçu : retire du suivi tout ce qui est couvert (acquittement cumulatif). */
function processAck(ctx, conn, ack, hasPayload) {
  if (ack > conn.sndUna) {
    const jumped = conn.outbox.some((segment) => segment.end <= ack) && conn.outbox.filter((segment) => segment.end <= ack).length > 1;
    conn.sndUna = ack;
    conn.dupAcks = 0;
    conn.outbox = conn.outbox.filter((segment) => segment.end > ack);
    restartTimer(ctx, conn);
    if (jumped) explainOnce(ctx, [`tcp-cumulative-ack-${conn.device}`, 'tcp-cumulative-ack']);
    return;
  }
  if (!hasPayload && conn.outbox.some((segment) => segment.kind === 'data')) {
    conn.dupAcks += 1;
    explainOnce(ctx, [`tcp-dup-ack-${conn.device}`, 'tcp-dup-ack']);
  }
}

/** Données reçues : en ordre → livrées et acquittées ; dans le désordre → gardées, ACK dupliqué. */
function receiveData(ctx, conn, packet) {
  const { seq } = packet.transport;
  const length = packet.data?.length ?? 0;
  if (seq === conn.rcvNxt) {
    const complete = [];
    accept(conn, packet, complete);
    while (conn.buffered.has(conn.rcvNxt)) {
      const next = conn.buffered.get(conn.rcvNxt);
      conn.buffered.delete(conn.rcvNxt);
      accept(conn, next, complete);
    }
    // L'acquittement part d'abord ; l'application reçoit ensuite les messages complets.
    sendAck(ctx, conn, explainOnce(ctx, [`tcp-ack-${conn.device}`, 'tcp-ack']));
    for (const done of complete) {
      explainOnce(ctx, [`tcp-delivered-${conn.device}`, 'tcp-delivered']);
      conn.handlers.onMessage?.(conn, done.data.message, done);
    }
  } else if (seq > conn.rcvNxt) {
    conn.buffered.set(seq, packet);
    sendAck(ctx, conn, explainOnce(ctx, [`tcp-out-of-order-${conn.device}`, 'tcp-out-of-order']));
  } else if (length > 0) {
    sendAck(ctx, conn); // doublon (retransmission inutile) : on redit où on en est
  }
}

/** Segment en ordre : avance rcvNxt ; s'il termine un message, le met dans `complete`. */
function accept(conn, packet, complete) {
  conn.rcvNxt += packet.data.length;
  if (packet.data.part === packet.data.parts) complete.push(packet);
}

/**
 * Traite un segment TCP reçu par `device`. À appeler depuis onReceive du protocole du scénario.
 * @param {{ protocol?: string, onAccept?(conn), onMessage?(conn, msg), onClosed?(conn) }} [listener]
 *   comportement d'un serveur pour les connexions entrantes (port déclaré dans "services")
 * @returns {boolean} true si le paquet était un segment TCP
 */
export function handleTcp(ctx, scenarioDevice, packet, listener = {}) {
  if (packet.transport?.protocol !== 'tcp') return false;
  const device = runtimeDevice(ctx, scenarioDevice);
  const { src, dst, flags = [], seq, ack } = packet.transport;
  const memory = tcpMemory(ctx, device.id);
  let conn = memory.connections.get(keyOf(dst, packet.ip.src, src));

  if (flags.includes('RST')) {
    if (conn) {
      explainOnce(ctx, [`tcp-rst-${device.id}`, 'tcp-rst']);
      fail(ctx, conn, 'connexion refusée (RST)');
    }
    return true;
  }

  if (!conn) {
    if (!(flags.includes('SYN') && !flags.includes('ACK'))) return true; // segment orphelin : ignoré
    const serverIsn = SERVER_ISN + 10000 * memory.opened;
    memory.opened += 1;
    conn = createConnection(ctx, device.id, {
      localIp: packet.ip.dst, localPort: dst, remoteIp: packet.ip.src, remotePort: src, isn: serverIsn,
      role: 'server', protocol: listener.protocol ?? 'tcp',
      handlers: { onEstablished: listener.onAccept, onMessage: listener.onMessage, onClosed: listener.onClosed },
    });
    conn.state = 'SYN_RCVD';
    conn.rcvNxt = seq + 1;
    const step = explainOnce(ctx, [`tcp-syn-ack-${device.id}`, 'tcp-syn-ack']);
    const fields = { type: 'syn-ack', flags: ['SYN', 'ACK'], seq: serverIsn };
    emit(ctx, conn, { ...fields, ack: conn.rcvNxt, step });
    conn.sndNxt = serverIsn + 1;
    conn.writeSeq = serverIsn + 1;
    track(ctx, conn, { seq: serverIsn, end: serverIsn + 1, kind: 'syn-ack', fields, retries: 0 });
    return true;
  }

  const length = packet.data?.length ?? 0;
  if (flags.includes('SYN') && flags.includes('ACK') && conn.state === 'SYN_SENT') {
    processAck(ctx, conn, ack, false);
    conn.rcvNxt = seq + 1;
    conn.state = 'ESTABLISHED';
    sendAck(ctx, conn, explainOnce(ctx, [`tcp-established-${device.id}`, 'tcp-established']));
    conn.handlers.onEstablished?.(conn);
    return true;
  }
  if (flags.includes('SYN')) {
    if (conn.state === 'SYN_RCVD') emit(ctx, conn, { type: 'syn-ack', flags: ['SYN', 'ACK'], seq: conn.sndUna, ack: conn.rcvNxt }); // SYN répété
    return true;
  }
  if (flags.includes('ACK')) processAck(ctx, conn, ack, length > 0);
  if (conn.state === 'SYN_RCVD' && conn.outbox.length === 0) {
    conn.state = 'ESTABLISHED';
    explainOnce(ctx, [`tcp-accepted-${device.id}`, 'tcp-accepted']);
    conn.handlers.onEstablished?.(conn);
  }
  if (length > 0) receiveData(ctx, conn, packet);

  if (flags.includes('FIN') && seq + length === conn.rcvNxt) {
    conn.rcvNxt += 1;
    if (conn.state === 'FIN_WAIT') {
      sendAck(ctx, conn, explainOnce(ctx, [`tcp-last-ack-${device.id}`, 'tcp-last-ack']));
      closed(ctx, conn);
      return true;
    }
    // Fermeture demandée par l'autre côté : on acquitte et on ferme aussi (FIN + ACK ensemble).
    conn.state = 'LAST_ACK';
    const step = explainOnce(ctx, [`tcp-fin-ack-${device.id}`, 'tcp-fin-ack']);
    const fields = { type: 'fin-ack', flags: ['FIN', 'ACK'], seq: conn.sndNxt };
    emit(ctx, conn, { ...fields, ack: conn.rcvNxt, step });
    track(ctx, conn, { seq: conn.sndNxt, end: conn.sndNxt + 1, kind: 'fin', fields, retries: 0 });
    conn.sndNxt += 1;
    conn.writeSeq = conn.sndNxt;
    return true;
  }
  if (conn.state === 'LAST_ACK' && conn.outbox.length === 0) {
    closed(ctx, conn);
    return true;
  }
  maybeClose(ctx, conn);
  return true;
}

/** Lignes TCP pour l'inspecteur (réutilisées par HTTP). */
export function tcpFields(packet) {
  const transport = packet.transport ?? {};
  const data = packet.data ?? {};
  const fields = [
    { layer: 'TCP', field: 'Numéro de séquence', value: String(transport.seq ?? '') },
    { layer: 'TCP', field: 'Numéro d\'acquittement', value: transport.flags?.includes('ACK') ? String(transport.ack ?? '') : '—' },
    { layer: 'TCP', field: 'Fenêtre', value: `${transport.window ?? WINDOW} octets` },
    { layer: 'TCP', field: 'Données', value: `${data.length ?? 0} octets` },
  ];
  if (data.parts > 1) fields.push({ layer: 'TCP', field: 'Segment', value: `${data.part} sur ${data.parts}` });
  return fields;
}

export default {
  name: 'tcp',

  start(ctx) {
    const { params } = ctx;
    const serverIp = params.serverIp ?? primaryIp(ctx.device(params.server));
    const port = Number.isInteger(params.port) ? params.port : DEFAULTS.port;
    const size = Number.isInteger(params.size) && params.size > 0 ? params.size : DEFAULTS.size;
    explainOnce(ctx, ['tcp-start']);
    const refused = () => {
      if (!Number.isInteger(params.closedPort)) {
        explainOnce(ctx, ['tcp-summary']);
        return;
      }
      ctx.schedule(1000, () => {
        explainOnce(ctx, ['tcp-connect-closed']);
        connect(ctx, params.client, {
          dstIp: serverIp, dstPort: params.closedPort,
          onFailed: (reason) => {
            explainOnce(ctx, [reason.includes('RST') ? 'tcp-refused' : 'tcp-failed']);
            explainOnce(ctx, ['tcp-summary']);
          },
        });
      });
    };
    connect(ctx, params.client, {
      dstIp: serverIp,
      dstPort: port,
      onEstablished(conn) {
        conn.send({ size, name: params.fileName ?? 'rapport.txt' }, { type: 'data' });
        conn.close();
      },
      onClosed: refused,
      onFailed(reason) {
        explainOnce(ctx, [reason.includes('RST') ? 'tcp-refused' : 'tcp-failed']);
        explainOnce(ctx, ['tcp-summary']);
      },
    });
  },

  onReceive(device, packet, ctx) {
    handleTcp(ctx, device, packet, {});
  },

  describe(packet) {
    const fields = [...describeHeaders(packet), ...tcpFields(packet)];
    if (packet.data?.message?.name && packet.data.part === 1) {
      fields.push({ layer: 'Données', field: 'Fichier', value: `${packet.data.message.name} (${packet.data.message.size} octets)` });
    }
    return fields;
  },
};
