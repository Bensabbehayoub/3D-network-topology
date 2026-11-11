# Manuel utilisateur

Rédaction : Ramy. **Version S1** : elle décrit ce qui fonctionne aujourd'hui. Les sections marquées « à venir » seront complétées au sprint indiqué (version finale : S6).

## 1. Ouvrir l'application

1. Ouvrir **https://bensabbehayoub.github.io/3D-network-topology/** dans Chrome (PC ou smartphone).
2. Rien à installer : la page charge la topologie 3D directement.

Navigateurs : Chrome recommandé (WebXR et installation PWA). Firefox et Safari affichent la 3D en mode classique, sans VR.

## 2. L'écran

| Zone | Rôle |
| --- | --- |
| En-tête, à gauche | Titre et choix du scénario (liste active en S4) |
| En-tête, à droite | **Statut WebXR** et bouton **Entrer en VR** ; bouton **Installer** (S5) |
| Centre | Scène 3D : PC (bleu), switches (vert), routeurs (orange), serveurs (violet) |
| Barre du bas | Lecture, Pause, Pas à pas, Vitesse, Réinitialiser (actifs en S2) |
| Panneau droit | Inspecteur de paquet (S3) et explications de chaque étape (S3) |

Sur smartphone, les zones s'empilent en une colonne qui défile.

## 3. Explorer la topologie

| Action | Souris | Tactile |
| --- | --- | --- |
| Tourner autour de la scène | glisser avec le bouton gauche | glisser un doigt |
| Zoomer | molette | pincer |
| Déplacer la vue | glisser avec le bouton droit | glisser deux doigts |
| Sélectionner un équipement | clic | toucher |

## 4. Statut WebXR et mode VR

Le badge en haut à droite indique si le navigateur peut afficher la scène en VR :

| Badge | Signification | Que faire |
| --- | --- | --- |
| 🟢 **WebXR détectée** | Un casque (réel ou émulé) est disponible | Cliquer sur **Entrer en VR** |
| 🟠 **WebXR détectée** | L'API existe mais aucun casque n'est branché | Activer un appareil dans Immersive Web Emulator, puis recharger |
| 🔴 **WebXR non détectée** | Navigateur sans WebXR, ou page hors HTTPS | Utiliser le mode classique, ou Chrome en HTTPS |

Un clic sur le badge affiche le détail : contexte HTTPS, WebXR Device API, sessions VR et AR, WebGL 2, WebGPU.

**Tester la VR sans casque**
1. Installer l'extension Chrome **Immersive Web Emulator**.
2. Ouvrir les outils de développement (F12), onglet **WebXR**, choisir un appareil (par exemple Meta Quest 3).
3. Recharger la page : le badge devient vert.
4. **Entrer en VR** : la topologie apparaît devant vous, à hauteur de table. Bougez le casque émulé dans l'onglet WebXR.
5. **Quitter la VR** pour revenir au mode classique.

## 5. Lancer une simulation (à venir, S2–S3)

Choisir deux PC, lancer un ping, suivre ARP puis ICMP, mettre en pause, avancer pas à pas, changer la vitesse, réinitialiser.

## 6. Inspecter un paquet (à venir, S3)

Cliquer sur un paquet en mouvement : l'inspecteur affiche ses champs (MAC, IP, ports, TTL, indicateurs).

## 7. Installer l'application et l'utiliser hors ligne (à venir, S5–S6)

## 8. Dépannage

| Problème | Solution |
| --- | --- |
| Page blanche en ouvrant `index.html` par double-clic | Les modules JavaScript exigent un serveur : utiliser l'adresse en ligne ou un serveur local (voir le README) |
| « WebXR non détectée » dans Chrome | Vérifier que l'adresse commence par `https://` (ou `localhost`) |
| Badge orange alors que l'émulateur est installé | Choisir un appareil dans l'onglet WebXR des outils de développement, puis recharger |
| Bouton « Entrer en VR » grisé | La VR n'est pas disponible : cliquer sur le badge WebXR pour voir la raison |
| Scène vide | Ouvrir la console (F12) et signaler l'erreur à l'équipe |
