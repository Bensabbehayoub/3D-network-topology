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

Le module S3 construit des paquets `echo-request`, répond uniquement quand l'adresse IP de
destination appartient à l'équipement récepteur, puis construit un `echo-reply` avec les
adresses IP inversées. L'identifiant, le numéro de séquence et la charge utile sont conservés.
Les identifiants de paquets viennent de `ctx.nextPacketId()` et tout envoi passe par `ctx.send()` :
le protocole ne dépend donc ni de l'horloge réelle, ni de la fréquence d'affichage.

ICMP ne réalise pas lui-même ARP, la commutation ou le routage. Le test d'intégration direct
valide le cycle demande/réponse avec le moteur. Le scénario complet à deux sous-réseaux restera
à valider quand `arp.js`, `host.js`, `router.js`, `switch.js` et `scenarios/ping.json` seront
implémentés par leurs propriétaires.

## Premier jet du diagramme de séquence du ping

> **Artefact proposé S3.** Le flux ci-dessous suit la topologie prévue (deux LAN reliés par un
> routeur), car `scenarios/ping.json` est encore un placeholder invalide. Le fichier final visé
> est `docs/conception/sequence-ping.md`. Le diagramme reste ici pour respecter CODEOWNERS tant
> que la règle de propriété de ce nouveau document n'a pas été ajoutée par le propriétaire de
> `.github/CODEOWNERS`.

```mermaid
sequenceDiagram
    autonumber
    participant A as PC source<br/>192.168.1.10
    participant S1 as Switch LAN 1
    participant R as Routeur<br/>192.168.1.1 / 192.168.2.1
    participant S2 as Switch LAN 2
    participant B as PC destination<br/>192.168.2.10

    A->>A: Évalue 192.168.2.10/24 : réseau distant
    Note over A: Prochain saut = passerelle 192.168.1.1<br/>Cache ARP : absence de correspondance
    A-->>S1: ARP Request broadcast<br/>MAC dst ff:ff:ff:ff:ff:ff<br/>« Qui a 192.168.1.1 ? »
    S1-->>R: Inonde la trame sur les autres ports du LAN 1
    Note over S1,R: Le switch lit la MAC, pas l'IP.<br/>Le routeur ne propage pas ce broadcast vers le LAN 2.
    R->>S1: ARP Reply unicast<br/>192.168.1.1 = MAC R-g0
    S1->>A: Transmet selon sa table MAC
    Note over A: Cache ARP : 192.168.1.1 → MAC R-g0

    A->>S1: Trame unicast : ICMP Echo Request<br/>MAC dst R-g0, IP dst 192.168.2.10, TTL 64
    S1->>R: Transmet selon la MAC destination
    R->>R: Retire l'en-tête Ethernet, choisit la route,<br/>décrémente TTL à 63
    Note over R: Cache ARP LAN 2 : absence de 192.168.2.10
    R-->>S2: ARP Request broadcast sur le LAN 2<br/>« Qui a 192.168.2.10 ? »
    S2-->>B: Inonde la diffusion sur le LAN 2
    B->>S2: ARP Reply unicast<br/>192.168.2.10 = MAC PC-B
    S2->>R: Transmet la réponse vers MAC R-g1
    Note over R: Cache ARP : 192.168.2.10 → MAC PC-B
    R->>S2: Nouvelle trame unicast : même Echo Request IP<br/>MAC src R-g1, MAC dst PC-B, TTL 63
    S2->>B: Transmet selon la MAC destination

    B->>B: IP locale reconnue ; construit Echo Reply<br/>même identifiant, séquence et payload
    Note over B: Prochain saut = 192.168.2.1<br/>MAC connue grâce à la requête ARP précédente
    B->>S2: Trame unicast : ICMP Echo Reply<br/>IP dst 192.168.1.10, TTL 64, MAC dst R-g1
    S2->>R: Transmet selon la MAC destination
    R->>R: Choisit le LAN 1 et décrémente TTL à 63
    Note over R: MAC de PC source connue grâce aux échanges ARP du LAN 1
    R->>S1: Nouvelle trame unicast : Echo Reply<br/>MAC dst PC-A, IP dst 192.168.1.10
    S1->>A: Transmet selon la MAC destination
    A->>A: Associe la réponse à l'identifiant et à la séquence<br/>Ping réussi au temps simulé courant
```

### Lecture pédagogique simplifiée

Le PC source constate d'abord que la destination est sur un autre réseau : il ne cherche donc
pas directement la MAC du PC distant, mais celle de sa passerelle. ARP reste toujours limité au
réseau local. À chaque traversée du routeur, l'enveloppe Ethernet change et le TTL IP diminue,
alors que les adresses IP source et destination restent celles des deux PC. Les switches ne
choisissent jamais une route IP : ils apprennent les adresses MAC et transmettent les trames.
Le PC destination renvoie enfin un Echo Reply avec le même identifiant, la même séquence et la
même charge utile ; le retour suit les mêmes principes dans l'autre sens.
