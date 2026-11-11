# TCP — Transmission Control Protocol

| Responsable | Sprint | Couche | Fichiers |
| --- | --- | --- | --- |
| Khalil | S4 | Couche 4 (transport) | `src/sim/protocols/tcp.js`, `scenarios/tcp.json`, `tests/tcp.test.js` |

> Statut : **fiche de conception (S1)**. Elle décrit ce que le scénario montrera ; la section « Implémentation » sera complétée quand le protocole sera codé.

## Rôle

TCP fournit un flux fiable et ordonné entre deux applications : ouverture de connexion, numérotation des octets, accusés de réception et fermeture propre.

## Messages simulés

| Message | Sens | Contenu essentiel |
| --- | --- | --- |
| SYN | Client → serveur | Demande d'ouverture, numéro de séquence initial |
| SYN-ACK | Serveur → client | Accepte et accuse réception |
| ACK | Client → serveur | Connexion établie (fin des trois temps) |
| Données + ACK | Dans les deux sens | Segments numérotés et accusés |
| FIN / ACK | Dans les deux sens | Fermeture de chaque côté |

## Scénario pédagogique

`scenarios/tcp.json` : un client et un serveur. On suit l'ouverture en trois temps, l'envoi d'un segment de données et son accusé, puis la fermeture par FIN. L'inspecteur affiche les numéros de séquence et d'accusé, et les indicateurs.

## Champs affichés par l'inspecteur

Ports, numéros de séquence et d'accusé, indicateurs (SYN, ACK, FIN), taille des données.

## Simplifications pédagogiques

Le projet simule les échanges pour l'apprentissage, sans reproduire une pile réseau complète (cahier §2.2).

- Numéros de séquence initiaux fixés (lisibles) au lieu d'aléatoires.
- Pas de fenêtre glissante ni de contrôle de congestion.
- Pas de retransmission sur temporisation (prévue seulement si le temps le permet).

## Implémentation

À compléter en S4 : fonctions `start` et `onReceive`, étapes du scénario, et test de la séquence de messages. Contrat à respecter : [`../simulation/contrats.md`](../simulation/contrats.md#3-interface-protocole).
