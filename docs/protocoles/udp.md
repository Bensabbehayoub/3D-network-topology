# UDP — User Datagram Protocol

| Responsable | Sprint | Couche | Fichiers |
| --- | --- | --- | --- |
| Aziz | S4 | Couche 4 (transport) | `src/sim/protocols/udp.js`, `scenarios/udp.json`, `tests/udp.test.js` |

> Statut : **fiche de conception (S1)**. Elle décrit ce que le scénario montrera ; la section « Implémentation » sera complétée quand le protocole sera codé.

## Rôle

UDP envoie des datagrammes sans connexion, sans accusé de réception et sans retransmission. C'est simple et rapide ; l'application gère elle-même les pertes. DNS l'utilise.

## Messages simulés

| Message | Sens | Contenu essentiel |
| --- | --- | --- |
| Datagramme | Client → serveur | Port source éphémère → port de destination du service |
| Datagramme (réponse éventuelle) | Serveur → client | Ports inversés |

## Scénario pédagogique

`scenarios/udp.json` : un client envoie un datagramme à un serveur. Le scénario montre l'absence d'ouverture de connexion, et le cas d'un datagramme perdu que personne ne renvoie, pour comparer avec TCP.

## Champs affichés par l'inspecteur

IP, ports source et destination, longueur, contenu simplifié.

## Simplifications pédagogiques

Le projet simule les échanges pour l'apprentissage, sans reproduire une pile réseau complète (cahier §2.2).

- Pas de somme de contrôle.
- La perte est provoquée par le scénario (lien coupé), pas aléatoire.

## Implémentation

À compléter en S4 : fonctions `start` et `onReceive`, étapes du scénario, et test de la séquence de messages. Contrat à respecter : [`../simulation/contrats.md`](../simulation/contrats.md#3-interface-protocole).
