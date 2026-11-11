# DNS — Domain Name System

| Responsable | Sprint | Couche | Fichiers |
| --- | --- | --- | --- |
| Aziz | S4 | Couche 7 (application), sur UDP port 53 | `src/sim/protocols/dns.js`, `scenarios/dns.json`, `tests/dns.test.js` |

> Statut : **fiche de conception (S1)**. Elle décrit ce que le scénario montrera ; la section « Implémentation » sera complétée quand le protocole sera codé.

## Rôle

DNS traduit un nom (`www.supcom.tn`) en adresse IP. Le client interroge son serveur DNS, qui répond directement ou après avoir interrogé d'autres serveurs.

## Messages simulés

| Message | Sens | Contenu essentiel |
| --- | --- | --- |
| Requête DNS (type A) | Client → serveur DNS (UDP 53) | « Quelle est l'adresse de www.exemple.tn ? » |
| Réponse DNS | Serveur DNS → client | « www.exemple.tn = 10.0.2.80 » |

## Scénario pédagogique

`scenarios/dns.json` : un PC, un serveur DNS et un serveur web. Le PC résout le nom du serveur web. Le scénario HTTP (S5) réutilise cette étape par import.

## Champs affichés par l'inspecteur

Ports UDP, identifiant de requête, nom demandé, type d'enregistrement, adresse répondue.

## Simplifications pédagogiques

Le projet simule les échanges pour l'apprentissage, sans reproduire une pile réseau complète (cahier §2.2).

- Résolution directe par un seul serveur (pas de récursion racine → TLD → autoritaire).
- Seuls les enregistrements A sont gérés.
- Pas de cache côté client entre deux lancements.

## Implémentation

À compléter en S4 : fonctions `start` et `onReceive`, étapes du scénario, et test de la séquence de messages. Contrat à respecter : [`../simulation/contrats.md`](../simulation/contrats.md#3-interface-protocole).
