# UDP — User Datagram Protocol

| Prévu (planning) | Réalisé | Couche | Fichiers |
| --- | --- | --- | --- |
| Aziz, S4 | Refonte, phase 4b | Couche 4 (transport) | `src/sim/protocols/udp.js`, `src/sim/stack.js` (`sendUdp`, ports), `scenarios/udp.json`, `tests/udp.test.js` |

> Statut : **implémenté et testé.** `sendUdp` sert aussi à DNS et DHCP.

## Rôle

UDP envoie des datagrammes sans connexion, sans accusé de réception et sans retransmission. C'est simple et rapide ; l'application gère elle-même les pertes. DNS et DHCP l'utilisent.

## Messages simulés

| Message | Sens | Contenu essentiel |
| --- | --- | --- |
| Datagramme | Client → serveur | Port source éphémère (49152 et plus) → port du service |
| ICMP Port unreachable | Serveur → client | Seule « réponse » possible quand le port est fermé |

## Scénario pédagogique

`udp.json` : un PC envoie des journaux (syslog, port 514) à un serveur, puis un datagramme vers un port fermé (5000). Séquence relevée (12 envois, 5,6 s) : ARP ; deux datagrammes livrés **sans aucune réponse** ; un datagramme vers le port 5000 rejeté par le serveur, qui renvoie « port inaccessible ». À comparer avec TCP (poignée de main, acquittements, RST).

## Champs affichés par l'inspecteur

Ethernet, IP, protocole de transport, ports source et destination, longueur, contenu simplifié.

## Simplifications pédagogiques

- Pas de somme de contrôle.
- Pas de perte aléatoire : le scénario montre le port fermé, pas un datagramme perdu en route.

## Implémentation

- `stack.js` : ports ouverts déclarés par le scénario (`services`) ; `sendUdp` ouvre le port source éphémère puis passe par `sendIp` ; un hôte qui reçoit un datagramme pour un port fermé le jette et renvoie ICMP « port inaccessible » (sauf pour une diffusion).
- `protocols/udp.js` : envoie les datagrammes programmés et explique leur livraison (`udp-send`, `udp-delivered`, `udp-send-closed`, `udp-icmp-received`, `udp-summary`).
- Tests (`tests/udp.test.js`) : scénario complet (livrés sans réponse, port fermé → ICMP) ; sans service déclaré, même le port 514 est fermé ; champs de l'inspecteur.
