// Pôle sim : HTTP. Un navigateur charge des pages d'un site : il traduit le nom du site par DNS
// (protocols/dns.js), ouvre une connexion TCP vers le port 80 (protocols/tcp.js), envoie une
// requête GET par page sur la même connexion (HTTP/1.1, connexion persistante), reçoit chaque
// réponse (200 OK, ou 404 si la page n'existe pas), puis ferme la connexion.
// Le serveur web décrit ses pages dans le champ "pages" du scénario.
//
// Paramètres (scenario.params) :
//   client  id de l'hôte qui navigue
//   urls    adresses à charger, toutes sur le même site (ex. ["http://www.ecole.test/", "http://www.ecole.test/absent"])
//
// Étapes standard (n = rang de l'URL) : http-start, http-dns, http-dns-done, http-dns-failed,
// http-connect, http-request[-<n>], http-response[-<code>], http-received[-<n>], http-not-found[-<n>],
// http-close, http-failed, http-summary ; plus celles de DNS et TCP (dns-*, tcp-*).

import { describeHeaders } from '../protocol.js';
import { explainOnce } from '../stack.js';
import { handleDns, resolveName } from './dns.js';
import { connect, handleTcp, tcpFields } from './tcp.js';

export const HTTP_PORT = 80;
/** Taille des en-têtes HTTP (octets), ajoutée au corps de chaque message. */
export const HEADER_SIZE = 250;
const REASONS = { 200: 'OK', 404: 'Not Found' };

/** 'http://www.ecole.test:8080/a/b' → { host: 'www.ecole.test', port: 8080, path: '/a/b' } ; null si invalide. */
export function parseUrl(text) {
  const match = /^http:\/\/([a-z0-9.-]+)(?::(\d{1,5}))?(\/[^\s?#]*)?$/i.exec(String(text ?? ''));
  if (!match) return null;
  return { host: match[1].toLowerCase(), port: match[2] ? Number(match[2]) : HTTP_PORT, path: match[3] ?? '/' };
}

/** Réponse du serveur web pour un chemin : sa page, ou 404. */
export function respond(server, path) {
  const page = (server.pages ?? []).find((candidate) => candidate.path === path);
  const status = page ? page.status ?? 200 : 404;
  const body = page ? page.size : 180;
  return {
    kind: 'response',
    version: 'HTTP/1.1',
    status,
    reason: REASONS[status] ?? '',
    contentType: page?.type ?? 'text/html',
    title: page?.title ?? 'Page introuvable',
    path,
    body,
    size: HEADER_SIZE + body,
  };
}

/** Comportement du serveur web pour les connexions entrantes (via handleTcp). */
function webServer(ctx, device) {
  return {
    protocol: 'http',
    onMessage(conn, request) {
      if (request?.kind !== 'request') return;
      const response = respond(device, request.path);
      const step = explainOnce(ctx, [`http-response-${response.status}`, 'http-response']);
      conn.send(response, { protocol: 'http', type: 'response', step });
    },
  };
}

export default {
  name: 'http',

  start(ctx) {
    const { client } = ctx.params;
    const urls = (Array.isArray(ctx.params.urls) ? ctx.params.urls : []).map(parseUrl).filter(Boolean);
    const results = [];
    ctx.memory(client).httpResults = results;
    explainOnce(ctx, ['http-start']);
    if (urls.length === 0) return;
    const { host, port } = urls[0];
    const summary = () => explainOnce(ctx, ['http-summary']);

    resolveName(ctx, client, host, {
      step: explainOnce(ctx, ['http-dns']),
      onFailed(reason) {
        explainOnce(ctx, ['http-dns-failed']);
        results.push({ error: reason });
        summary();
      },
      onResolved(ip) {
        explainOnce(ctx, ['http-dns-done']);
        let index = 0;
        const sendNext = (conn) => {
          const url = urls[index];
          index += 1;
          const step = explainOnce(ctx, [`http-request-${index}`, 'http-request']);
          conn.send({ kind: 'request', method: 'GET', path: url.path, host: url.host, version: 'HTTP/1.1', size: HEADER_SIZE + url.path.length },
            { protocol: 'http', type: 'request', step });
        };
        explainOnce(ctx, ['http-connect']);
        connect(ctx, client, {
          dstIp: ip,
          dstPort: port,
          protocol: 'http',
          onEstablished: sendNext,
          onMessage(conn, response) {
            if (response?.kind !== 'response') return;
            results.push({ path: response.path, status: response.status, size: response.size });
            explainOnce(ctx, response.status === 200
              ? [`http-received-${index}`, 'http-received']
              : [`http-not-found-${index}`, 'http-not-found']);
            if (index < urls.length) sendNext(conn);
            else {
              explainOnce(ctx, ['http-close']);
              conn.close();
            }
          },
          onClosed: summary,
          onFailed(reason) {
            results.push({ error: reason });
            explainOnce(ctx, ['http-failed']);
            summary();
          },
        });
      },
    });
  },

  onReceive(device, packet, ctx) {
    if (handleDns(ctx, device, packet)) return;
    handleTcp(ctx, device, packet, webServer(ctx, device));
  },

  describe(packet) {
    const fields = [...describeHeaders(packet), ...tcpFields(packet)];
    const message = packet.data?.message;
    if (packet.protocol !== 'http' || !message) return fields;
    if (packet.data.part > 1) {
      fields.push({ layer: 'HTTP', field: 'Suite du message', value: `partie ${packet.data.part} sur ${packet.data.parts}` });
      return fields;
    }
    if (message.kind === 'request') {
      fields.push(
        { layer: 'HTTP', field: 'Requête', value: `${message.method} ${message.path} ${message.version}` },
        { layer: 'HTTP', field: 'Host', value: message.host },
      );
    } else {
      fields.push(
        { layer: 'HTTP', field: 'Statut', value: `${message.version} ${message.status} ${message.reason}` },
        { layer: 'HTTP', field: 'Content-Type', value: message.contentType },
        { layer: 'HTTP', field: 'Content-Length', value: `${message.body} octets` },
      );
    }
    return fields;
  },
};
