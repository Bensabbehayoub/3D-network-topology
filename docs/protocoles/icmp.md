# ICMP — ping (echo request / echo reply)

| Responsable | Sprint | Couche | Fichiers |
| --- | --- | --- | --- |
| Aziz | S3 | Couche 3 (transporté par IP) | `src/sim/protocols/icmp.js`, `scenarios/ping.json` (Ayoub), `tests/icmp.test.js` |

> Statut : **fiche de conception (S1)**. Elle décrit ce que le scénario montrera ; la section « Implémentation » sera complétée quand le protocole sera codé.

## Rôle

ICMP transporte les messages de contrôle d'IP. Le ping envoie une demande d'écho et attend la réponse : il vérifie qu'un hôte est joignable et mesure l'aller-retour. Un routeur qui jette un paquet dont le TTL tombe à 0 renvoie un message ICMP « Time Exceeded ».

## Messages simulés

| Message | Sens | Contenu essentiel |
| --- | --- | --- |
| Echo request (type 8) | Source → destination | Demande d'écho avec un numéro de séquence |
| Echo reply (type 0) | Destination → source | Même numéro de séquence |
| Time exceeded (type 11), S5 | Routeur → source | TTL arrivé à 0 (utile avec le routage statique) |

## Scénario pédagogique

`scenarios/ping.json` (Ayoub, S3) : deux réseaux reliés par un routeur. L'utilisateur choisit deux PC ; on voit d'abord ARP vers la passerelle, puis l'echo request traverser le routeur (TTL − 1), puis la réponse. C'est le scénario du MVP (22 novembre).

## Champs affichés par l'inspecteur

IP source/destination, TTL, type ICMP, numéro de séquence.

## Simplifications pédagogiques

Le projet simule les échanges pour l'apprentissage, sans reproduire une pile réseau complète (cahier §2.2).

- Une seule demande d'écho par lancement (pas de série de 4).
- Pas de calcul de somme de contrôle.
- Temps d'aller-retour = temps simulé, pas une mesure réelle.

## Implémentation

À compléter en S3 : fonctions `start` et `onReceive`, étapes du scénario, et test de la séquence de messages. Contrat à respecter : [`../simulation/contrats.md`](../simulation/contrats.md#3-interface-protocole).
