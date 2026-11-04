# Choix du renderer

**Décision : `THREE.WebGLRenderer` (WebGL 2) partout, Three.js figé en r187 (0.187.0).**
Une seule voie de rendu pour le bureau, le mobile et la VR. Le repli WebGPU vers WebGL 2
prévu au cahier des charges est abandonné.

## Essai

Une scène minimale entre en session `immersive-vr` et tourne pendant 2 secondes.
Environnement : Chrome 156, Windows 11, GPU NVIDIA, émulateur IWER 2.7 (profil Meta Quest 3).

| Voie | Backend obtenu | Session VR | Images rendues |
| --- | --- | --- | --- |
| `WebGLRenderer` | WebGL 2 | oui | oui |
| `WebGPURenderer` | WebGPU | non | aucune |
| `WebGPURenderer` avec `forceWebGL` | WebGL 2 | oui | oui |

La voie WebGPU échoue dès l'ouverture de la session : `One or more required features
are not supported by the device`. Three.js r187 exige la fonctionnalité de session
`webgpu` et l'API `XRGPUBinding`, et Chrome 156 ne fournit pas `XRGPUBinding` sur ce poste.

## Justification

- La voie WebGPU n'entre pas en VR ici : elle ne peut donc pas être la voie unique.
- Garder deux voies doublerait les tests pour un gain visuel presque nul sur une
  topologie de quelques équipements.
- Entre les deux voies qui fonctionnent, `WebGLRenderer` est la plus simple.
  `forceWebGL` ajouterait la couche `WebGPURenderer` sans bénéfice.

## Limites de l'essai

- L'émulateur ne prouve pas le comportement d'un vrai casque. À revérifier sur un casque
  si l'équipe y a accès.
- IWER ne simule pas non plus la fonctionnalité `webgpu` : l'essai ne dit rien du
  navigateur d'un casque qui la fournirait.
- Le nombre d'images mesuré n'est pas une mesure de performance.
