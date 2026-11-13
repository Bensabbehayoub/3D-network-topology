# TCP — Transmission Control Protocol

| Prévu (planning) | Réalisé | Couche | Fichiers |
| --- | --- | --- | --- |
| Khalil, S4 | Refonte, phase 4c (fenêtre d'émission en phase 5) | Couche 4 (transport) | `src/sim/protocols/tcp.js`, `src/sim/devices/host.js` (RST sur port fermé), `scenarios/tcp.json`, `scenarios/debit.json`, `tests/tcp.test.js` |

> Statut : **implémenté et testé.** HTTP et le scénario Débit réutilisent les connexions de `tcp.js`.

## Rôle

TCP fournit un flux fiable et ordonné entre deux applications : ouverture de connexion, numérotation des octets, accusés de réception, retransmission des pertes et fermeture propre.

## Messages simulés

| Message | Sens | Contenu essentiel |
| --- | --- | --- |
| SYN | Client → serveur | Demande d'ouverture, numéro de séquence initial |
| SYN-ACK | Serveur → client | Accepte et accuse réception |
| ACK | Client → serveur | Connexion établie (fin des trois temps) |
| Données (ACK, PSH sur le dernier) | Dans les deux sens | Segments de 1000 octets numérotés |
| ACK | En retour | Acquittement cumulatif ; ACK dupliqué après un trou |
| FIN / FIN-ACK / ACK | Dans les deux sens | Fermeture |
| RST | Serveur → client | Port fermé : connexion refusée |

## Scénario pédagogique

`tcp.json` : PC 1 envoie le fichier `rapport.txt` (3000 octets) au serveur, port 9000, puis tente le port 9001, fermé. Séquence relevée (33 envois, 14,6 s) :

1. ARP ; SYN, SYN-ACK, ACK : connexion établie.
2. Trois segments de données ; **le deuxième est perdu sur le câble** (perte simulée).
3. Le serveur acquitte le premier, puis renvoie le **même ACK** à l'arrivée du troisième (ACK dupliqué : il manque un segment ; le troisième est mis de côté).
4. La temporisation (RTO, 4 s) expire : le client **retransmet** le segment 2 ; le serveur acquitte tout d'un coup (ACK cumulatif).
5. FIN, FIN-ACK, ACK : fermeture.
6. SYN vers le port 9001 : le serveur répond **RST**, connexion refusée.

Le scénario **Débit** ouvre trois connexions en même temps vers un serveur derrière un câble lent : la fenêtre d'émission fait suivre aux émetteurs le rythme du lien le plus lent.

## Champs affichés par l'inspecteur

Ports, numéros de séquence et d'acquittement, indicateurs (SYN, ACK, FIN, RST, PSH), fenêtre, longueur des données, rang du segment.

## Simplifications pédagogiques

- Numéros de séquence initiaux fixes et lisibles (1000 côté client, 5000 côté serveur).
- Fenêtre d'émission fixe de 8000 octets ; pas de contrôle de congestion (démarrage lent, évitement).
- Une seule temporisation de retransmission par connexion, qui renvoie le plus ancien segment non acquitté ; pas de retransmission rapide sur trois ACK dupliqués.
- Pas d'état TIME_WAIT. Ces limites sont dites dans les explications.

## Implémentation

- `protocols/tcp.js` : `connect(ctx, client, { dstIp, dstPort, onEstablished, onMessage, onClosed, onFailed })` ; `handleTcp(ctx, device, packet, listener)` côté serveur ; `conn.send(message)` découpe en segments (MSS 1000), `conn.close()` ferme une fois tout acquitté. Segments hors ordre mis de côté, ACK cumulatifs, ACK dupliqués, RTO, FIN, RST.
- `host.js` : un SYN vers un port fermé reçoit un RST (jamais en réponse à un RST).
- Perte : paramètre `loseSegment` du scénario ; la trame part puis disparaît à mi-câble (option `lost` du moteur).
- Tests (`tests/tcp.test.js`) : scénario complet (poignée de main, perte, ACK dupliqué, retransmission, fermeture, RST) ; sans perte ; serveur muet (SYN renvoyé puis abandon) ; champs de l'inspecteur. `tests/traffic.test.js` vérifie le débit du scénario Débit.
