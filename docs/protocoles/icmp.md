# ICMP — ping (echo request / echo reply)

| Prévu (planning) | Réalisé | Couche | Fichiers |
| --- | --- | --- | --- |
| Aziz, S3 | Refonte, phase 4a | Couche 3 (transporté par IP) | `src/sim/protocols/icmp.js`, `src/sim/stack.js` (réponse au ping, erreurs ICMP), `scenarios/ping.json`, `scenarios/ttl.json`, `tests/icmp.test.js` |

> Statut : **implémenté et testé.**

## Rôle

ICMP transporte les messages de contrôle d'IP. Le ping envoie une demande d'écho et attend la réponse : il vérifie qu'un hôte est joignable et mesure l'aller-retour. Un routeur qui jette un paquet renvoie un message d'erreur ICMP à l'émetteur.

## Messages simulés

| Message | Sens | Contenu essentiel |
| --- | --- | --- |
| Echo request (type 8) | Source → destination | Identifiant et numéro de séquence |
| Echo reply (type 0) | Destination → source | Même identifiant et même séquence |
| Time exceeded (type 11) | Routeur → source | TTL arrivé à 0 |
| Destination unreachable (type 3) | Routeur ou hôte → source | Pas de route (réseau inaccessible) ou port UDP fermé (port inaccessible) |

## Scénarios pédagogiques

- `ping.json` : deux réseaux reliés par un routeur, **deux pings** espacés de 7 s. Le premier montre ARP des deux côtés du routeur puis l'aller-retour ICMP (TTL 64 → 63) ; le second n'a plus besoin d'ARP. Diagramme : [séquence du ping](../cahier-conceptuel.md#5-séquence-du-ping).
- `ttl.json` : même ping avec un TTL de départ de 1 : le premier routeur détruit le paquet et renvoie « Time exceeded » à PC 1 (8 envois, 3,2 s).
- `routage.json` utilise aussi le ping (voir [routage](routage.md)).

## Champs affichés par l'inspecteur

Ethernet, IP (source, destination, TTL), type ICMP, identifiant et numéro de séquence ; pour une erreur, le paquet d'origine qu'elle signale.

## Simplifications pédagogiques

- Nombre de pings et intervalle fixés par le scénario (`count`, `interval`) ; délai d'attente de 10 s simulées.
- Pas de somme de contrôle.
- Temps d'aller-retour = temps simulé (affiché dans le résumé), pas une mesure réelle.

## Implémentation

- `protocols/icmp.js` : `start` programme les demandes (`sendIp`), `onReceive` reconnaît la réponse correspondante, annule la temporisation et explique ; à la fin, résumé (`icmp-summary`, ou `icmp-summary-loss` s'il y a eu des pertes).
- La réponse aux pings est faite par la pile (`host.js`, `router.js`) : tout équipement répond, dans tous les scénarios.
- Les erreurs (`time-exceeded`, `unreachable`) sont créées par le routeur ou l'hôte et renvoyées à l'émetteur ; une erreur n'en provoque jamais une autre.
- Tests (`tests/icmp.test.js`) : ping entre deux réseaux (ARP des deux côtés, deux échanges) ; TTL 1 ; cible inexistante (ARP sans réponse, délai écoulé) ; hôte sans passerelle (« aucune route ») ; champs de l'inspecteur.
