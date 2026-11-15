// Pôle xr : panneau de commandes 3D de la session VR.
//
// Mêmes commandes que la barre HTML (lecture, pause, pas à pas, vitesse, réinitialisation, état,
// temps simulé) : le panneau réutilise le contrôleur de src/ui/controls.js, donc les mêmes
// appels à app.sim et les mêmes règles d'activation (app.sim.isAllowed). Seul l'affichage
// change : un canvas dessiné ici, visé par le rayon des manettes (controllers.js).

import { createControlsController } from '../ui/controls.js';
import { createCanvasPanel, drawBackground, FONT, MONO, PALETTE, roundedRect } from './canvasPanel.js';
import { CONTROL_PANEL, controlAction, hitTest, panelPlane } from './panelLayout.js';

const STATUS_COLORS = { playing: PALETTE.playing, paused: PALETTE.hover, finished: PALETTE.accent, unavailable: PALETTE.danger };

/**
 * Dessine le panneau (séparé de Three.js : testé avec un faux contexte 2D).
 * @param {CanvasRenderingContext2D} ctx
 * @param {ReturnType<import('../ui/controls.js').controlsView>} view état des commandes
 * @param {string | null} hoverId bouton visé par une manette
 */
export function drawControlPanel(ctx, view, hoverId = null, layout = CONTROL_PANEL) {
  drawBackground(ctx, layout);
  ctx.textBaseline = 'middle';

  // Ligne d'état : pastille, libellé, temps simulé, erreur éventuelle.
  const { status } = layout;
  const middle = status.y + status.h / 2;
  ctx.beginPath();
  ctx.arc(status.x + 34, middle, 16, 0, Math.PI * 2);
  ctx.fillStyle = STATUS_COLORS[view.status] ?? PALETTE.muted;
  ctx.fill();
  ctx.textAlign = 'left';
  ctx.fillStyle = PALETTE.text;
  ctx.font = `600 52px ${FONT}`;
  ctx.fillText(view.statusLabel, status.x + 68, middle);
  ctx.textAlign = 'right';
  ctx.font = `48px ${MONO}`;
  ctx.fillStyle = view.error ? PALETTE.danger : PALETTE.muted;
  ctx.fillText(view.error ? 'Erreur de la simulation' : `t = ${view.time}`, status.x + status.w - 12, middle);

  // Boutons.
  ctx.textAlign = 'center';
  for (const button of layout.buttons) {
    const enabled = controlAction(button.id, view) !== null;
    const primary = button.id === 'play';
    roundedRect(ctx, button.x, button.y, button.w, button.h, 22);
    ctx.fillStyle = primary && enabled ? PALETTE.accent : PALETTE.surface;
    ctx.globalAlpha = enabled ? 1 : 0.4;
    ctx.fill();
    ctx.lineWidth = hoverId === button.id && enabled ? 8 : 3;
    ctx.strokeStyle = hoverId === button.id && enabled ? PALETTE.hover : PALETTE.border;
    ctx.stroke();
    ctx.fillStyle = primary && enabled ? PALETTE.accentText : PALETTE.text;
    ctx.font = button.label.length === 1 ? `600 96px ${FONT}` : `600 44px ${FONT}`;
    ctx.fillText(button.label, button.x + button.w / 2, button.y + button.h / 2);
    ctx.globalAlpha = 1;
  }

  // Vitesse courante, entre les boutons − et +.
  const { speed } = layout;
  ctx.fillStyle = PALETTE.muted;
  ctx.font = `30px ${FONT}`;
  ctx.fillText('Vitesse', speed.x + speed.w / 2, speed.y + 56);
  ctx.fillStyle = PALETTE.text;
  ctx.font = `600 50px ${MONO}`;
  ctx.fillText(view.speedLabel, speed.x + speed.w / 2, speed.y + 130);
}

/**
 * @param {object} app objet partagé (app.sim)
 * @param {{ documentRef?: Document }} [options]
 * @returns {{ mesh: object, setPose(pose: object): void, getPlane(): object,
 *   hover(u: number | null, v?: number): void, press(u: number, v: number): boolean, dispose(): void }}
 */
export function createVrControlPanel(app, { documentRef } = {}) {
  const panel = createCanvasPanel(CONTROL_PANEL, { documentRef, name: 'Commandes VR' });
  let hoverId = null;
  let view = null;

  const redraw = () => {
    drawControlPanel(panel.ctx, view, hoverId);
    panel.commit();
  };
  const controller = createControlsController(app, { onChange: (next) => { view = next; redraw(); } });
  view = controller.getView();
  redraw();

  return {
    mesh: panel.mesh,
    setPose: panel.setPose,
    getPlane: () => panelPlane(panel.mesh.matrixWorld.elements, CONTROL_PANEL.width, CONTROL_PANEL.height),
    /** Survol par le rayon d'une manette (u = null : plus de survol). */
    hover(u, v) {
      const next = u === null ? null : hitTest(CONTROL_PANEL, u, v);
      if (next === hoverId) return;
      hoverId = next;
      redraw();
    },
    /** Gâchette pressée sur le point (u, v) : exécute la commande du bouton visé. */
    press(u, v) {
      const action = controlAction(hitTest(CONTROL_PANEL, u, v), view);
      return action ? controller.run(action.control, action.value) : false;
    },
    dispose() {
      controller.destroy();
      panel.dispose();
    },
  };
}
