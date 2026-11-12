# Choix du renderer

**Décision (phase 2, 12 novembre 2026) : Three.js r187 (0.187.0), rendu 100 % WebGPU.
`WebGPURenderer` sur son backend WebGPU, en mode classique comme en VR. Aucun contexte WebGL n'est créé.**

| Situation | Rendu | Comment |
| --- | --- | --- |
| Mode classique (PC, mobile) | WebGPU | `WebGPURenderer` |
| Session `immersive-vr`, navigateur qui accorde la fonctionnalité `webgpu` (vrai casque) | WebGPU | `XRGPUBinding` du navigateur (**non vérifié** : pas de casque dans l'équipe) |
| Session `immersive-vr` dans Immersive Web Emulator | WebGPU | pont `src/render/xrBridge.js` (ci-dessous) |
| Navigateur sans WebGPU | aucun | message « WebGPU requis » à la place de la scène ; le reste de l'interface reste utilisable |
| Navigateur réel sans `XRGPUBinding` (VR) | aucun | la session VR est refermée, erreur dans la console ; le mode classique continue |

Le choix est codé dans `src/render/renderers.js` : on vérifie `navigator.gpu` et un adaptateur
**avant** de créer le renderer, parce que `WebGPURenderer` basculerait sinon en silence sur son
backend WebGL 2. Le build WebGL de Three.js (`three.module.js`, `WebGLRenderer`) n'est plus embarqué :
tous les modules importent `three.webgpu.js`. Un test (`renderers.test.mjs`) vérifie qu'aucun fichier
de `src/` ne crée de contexte WebGL.

Le panneau de statut WebXR (badge en haut à droite) affiche le rendu réel : « Rendu en mode
classique : WebGPU (WebGPURenderer) », « Rendu en VR : WebGPU — pont WebGPU de l'émulateur » ou
« … — XRGPUBinding du navigateur ».

## Le pont WebGPU de l'émulateur

Three.js r187 rend une session VR en WebGPU avec l'API **WebXR/WebGPU Binding** : `XRGPUBinding`
crée une couche de projection (une texture WebGPU à deux tranches, une par œil) et la fonctionnalité
de session `webgpu` doit être accordée. L'émulateur (IWER, moteur de l'extension Immersive Web
Emulator) ne fournit ni l'une ni l'autre. Le pont, chargé avant la création du renderer :

1. **fournit `XRGPUBinding`** pour les sessions de l'émulateur : Three.js rend chaque œil en WebGPU
   dans sa tranche de texture, comme sur un casque. La largeur de l'image suit la projection
   calculée par l'émulateur (mono ou stéréo), sinon l'image serait étirée ;
2. **présente l'image** : après chaque image, les tranches sont copiées (`copyTextureToTexture`)
   dans un canevas configuré en WebGPU — les deux yeux côte à côte en stéréo, l'œil gauche en mono ;
3. **fait afficher ce canevas par l'émulateur** : IWER n'avance ses images que si la session a une
   couche `XRWebGLLayer`, et il ne lit sur son contexte que la taille du canevas et des appels
   d'effacement. Le pont lui remet une couche dont le « contexte » est une simple surface (taille du
   canevas, constantes, fonctions vides) : aucun contexte WebGL n'existe. L'émulateur affiche alors
   notre canevas WebGPU dans sa vue du casque.

Pour la soutenance : l'objet remis à l'émulateur porte le nom `XRWebGLLayer` parce que c'est le
type imposé par son API, mais il ne contient aucun contexte WebGL. Formulation exacte : « rendu et
affichage 100 % WebGPU ; l'émulateur ne connaissant pas l'API WebXR/WebGPU, un pont la fournit ».

## Essais du 12 novembre 2026

Environnement : Chrome 157, Windows 11, GPU Intel (architecture gen-12lp) avec WebGPU réel,
émulateur IWER 2.8 (moteur de l'extension Immersive Web Emulator), profil Meta Quest 3. Chaque voie
est jugée sur une capture d'écran prise pendant la session.

| Voie | Session VR | Image en VR | Contextes WebGL |
| --- | --- | --- | --- |
| `WebGPURenderer` WebGPU, sans fonctionnalité `webgpu` | refusée par Three.js : « WebGPU XR sessions require the "webgpu" session feature » | — | 0 |
| `WebGPURenderer` WebGPU, `requiredFeatures: ['webgpu']` | refusée par l'émulateur : « One or more required features are not supported by the device » | — | 0 |
| `XRGPUBinding` de Chrome (drapeau « Experimental Web Platform features ») | refusé : « parameter 1 is not of type 'XRSession' » (session de l'émulateur) | — | 0 |
| `WebGPURenderer({ forceWebGL: true })` | ouverte | **vide** (« Invalid value used as weak map key ») | 1 |
| Bascule vers `WebGLRenderer` pendant la VR | ouverte | correcte | 1 |
| **`WebGPURenderer` WebGPU + pont `xrBridge.js`** | ouverte | **correcte, mono et stéréo** | **0** |

La bascule vers `WebGLRenderer` a été la première version de la phase 2 ; elle a été remplacée par
le pont avant d'être commitée, à la demande du professeur (100 % WebGPU).

## Vérifié dans l'application

Chrome 157 piloté, site servi sous `/3D-network-topology/`, compteur de `getContext('webgl…')`
injecté avant le chargement de la page :

- **0 contexte WebGL** du chargement à la fin de l'essai ;
- mode classique : topologie, modèles GLB, étiquettes, surbrillance, sélection au clic, animation
  des paquets ;
- session VR avec IWER, émulateur en mono, en stéréo et passage de l'un à l'autre pendant la session : image aux bonnes proportions, panneaux
  VR, rayons des manettes, commandes, sélection, horloge de la simulation ; retour à la vue
  d'origine à la sortie ; deux entrées et sorties de suite ;
- page sans `navigator.gpu` : message « WebGPU requis », aucun canevas, bouton VR désactivé ;
- console vide dans tous les cas.

## Limites

- **Fragilité** : le pont s'appuie sur le fonctionnement de Three.js r187 (`XRManager`) et d'IWER 2.8
  (lecture du contexte de la couche). À revérifier à chaque changement de version de l'un des deux.
- L'extension Immersive Web Emulator installée peut avoir une autre version qu'IWER 2.8 : à essayer.
- La voie native (`XRGPUBinding` d'un vrai navigateur de casque) n'est pas vérifiée.
- Navigateurs sans WebGPU (anciens Firefox et Safari, certains téléphones) : l'application affiche
  « WebGPU requis » au lieu de la scène.
- Dans l'émulateur, l'image est rendue à la taille de la fenêtre en pixels CSS (comme la vue de
  l'émulateur), pas à la résolution d'un casque.

## Historique

- **S1 (novembre 2026)** : essai avec Three.js r187, `WebGPURenderer` sans VR dans l'émulateur ;
  décision de garder `WebGLRenderer` partout. Version réellement embarquée en S1 : r180.
- **Phase 2 (12 novembre 2026)** : passage à r187. Première version : WebGPU en mode classique et
  bascule vers `WebGLRenderer` en VR. Version retenue, à la demande du professeur : 100 % WebGPU
  avec le pont de l'émulateur.
