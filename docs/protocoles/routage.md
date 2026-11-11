# Routage statique

| Responsable | Sprint | Couche | Fichiers |
| --- | --- | --- | --- |
| Khalil | S5 | Couche 3 (réseau) | `src/sim/devices/router.js`, `scenarios/routage.json`, `tests/routage.test.js` |

> Statut : **fiche de conception (S1)**. Elle décrit ce que le scénario montrera ; la section « Implémentation » sera complétée quand le protocole sera codé.

## Rôle

Un routeur relie plusieurs réseaux IP. Pour chaque paquet, il cherche dans sa table de routage la route la plus précise vers la destination, décrémente le TTL et transmet le paquet vers l'interface ou le routeur suivant. Les routes sont saisies à la main (statiques).

## Messages simulés

| Message | Sens | Contenu essentiel |
| --- | --- | --- |
| Paquet IP transmis | Routeur → saut suivant | TTL − 1, nouvelle trame Ethernet (MAC réécrites) |
| ARP vers le saut suivant | Routeur → routeur voisin | Si la MAC du saut suivant est inconnue |
| ICMP Time Exceeded | Routeur → source | Si le TTL atteint 0 |
| Perte « pas de route » | Sur le routeur | Si aucune route ne correspond |

## Scénario pédagogique

`scenarios/routage.json` : deux routeurs et trois réseaux. Un ping traverse les deux routeurs ; l'inspecteur montre le TTL qui diminue et les MAC réécrites à chaque saut. Variante : une route manquante provoque une perte expliquée.

## Champs affichés par l'inspecteur

IP source/destination, TTL, MAC avant et après le routeur, route utilisée.

## Simplifications pédagogiques

Le projet simule les échanges pour l'apprentissage, sans reproduire une pile réseau complète (cahier §2.2).

- Routes saisies dans le scénario (`routes` de chaque routeur) ; pas de RIP ni d'OSPF (extensions F09).
- Correspondance du plus long préfixe, sans métrique ni partage de charge.

## Implémentation

À compléter en S5 : fonctions `start` et `onReceive`, étapes du scénario, et test de la séquence de messages. Contrat à respecter : [`../simulation/contrats.md`](../simulation/contrats.md#3-interface-protocole).
