// Pôle xr : panneaux d'information de la session VR.
// - fiche de l'équipement sélectionné : mêmes données que l'inspecteur HTML (src/ui/inspector.js) ;
// - explication de l'étape en cours : textes publiés par le moteur (TOPICS.STEP).
//
// Les modèles (ce qu'il faut écrire) sont calculés par des fonctions pures testées sous Node ;
// le dessin sur canvas est séparé. Les textes des scénarios sont dessinés avec fillText :
// ils ne sont jamais interprétés comme du HTML.

import { TOPICS } from '../../simulation.js';
import { describeSelection } from '../ui/inspector.js';
import { createCanvasPanel, drawBackground, FONT, MONO, PALETTE } from './canvasPanel.js';
import { DEVICE_PANEL, panelPlane, STEP_PANEL, wrapText } from './panelLayout.js';

export const DEVICE_HINT = 'Visez un équipement avec le rayon d\'une manette, puis appuyez sur la gâchette pour afficher sa fiche.';
export const STEP_HINT = 'Lancez la simulation avec le panneau de commandes : chaque étape sera expliquée ici.';

/**
 * Contenu de la fiche d'équipement.
 * @param {ReturnType<typeof describeSelection>} view null = aucune sélection
 * @returns {{ heading: string, title: string | null, hint: string | null,
 *   props: Array<{ label: string, value: string }>, interfaces: Array<{ name: string, ip: string, mac: string }> }}
 */
export function deviceSheet(view) {
  const base = { heading: 'ÉQUIPEMENT', title: null, hint: null, props: [], interfaces: [], model: null, ports: [], totals: null };
  if (!view) return { ...base, hint: DEVICE_HINT };
  if (!view.found) return { ...base, title: view.id, hint: 'Équipement introuvable dans le scénario.' };
  // Phase 5 : modèle, ports reliés avec leur débit et leur charge, débit global (fiche de src/ui/datasheet.js).
  const sheet = view.sheet ?? null;
  return {
    ...base,
    title: view.info.title,
    props: view.info.props,
    interfaces: view.info.interfaces,
    model: sheet?.model ? `${sheet.model.name} · ${sheet.model.reference}` : null,
    ports: (sheet?.ports ?? []).filter((port) => port.state === 'connecté'),
    totals: sheet?.totals ?? null,
  };
}

/** Couleurs des barres de charge (mêmes seuils que les liens de la scène). */
const LOAD = { idle: '#70b7df', low: '#06d6a0', medium: '#f7b538', high: '#ef476f' };

/**
 * Contenu du panneau d'explications.
 * @param {{ title: string, text: string } | null} step dernière étape publiée
 * @param {{ title?: string } | null} scenario scénario chargé
 */
export function stepSheet(step, scenario) {
  const heading = scenario?.title ? `EXPLICATIONS · ${scenario.title}` : 'EXPLICATIONS';
  if (!step) return { heading, title: null, text: STEP_HINT, hint: true };
  return { heading, title: String(step.title ?? ''), text: String(step.text ?? ''), hint: false };
}

/**
 * Étape en cours d'après ce que le moteur a déjà joué (panneau créé au milieu d'une lecture).
 * @returns {{ title: string, text: string } | null}
 */
export function currentStep(sim) {
  try {
    const stepId = [...(sim?.getHistory?.() ?? [])].reverse().find((event) => event.step)?.step;
    const step = sim?.getScenario?.()?.steps?.find((candidate) => candidate.id === stepId);
    return step ? { title: step.title, text: step.text } : null;
  } catch {
    return null;
  }
}

const MARGIN = 44;

function drawHeading(ctx, layout, heading) {
  drawBackground(ctx, layout);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = PALETTE.muted;
  ctx.font = `600 30px ${FONT}`;
  const width = layout.pxWidth - 2 * MARGIN;
  ctx.fillText(wrapText(heading, width, (text) => ctx.measureText(text).width, 1)[0] ?? '', MARGIN, 70);
  ctx.fillStyle = PALETTE.border;
  ctx.fillRect(MARGIN, 92, width, 3);
  return width;
}

/** Écrit un paragraphe avec retour à la ligne ; renvoie l'ordonnée de la ligne suivante. */
function drawParagraph(ctx, text, x, y, width, lineHeight, maxLines) {
  for (const line of wrapText(text, width, (candidate) => ctx.measureText(candidate).width, maxLines)) {
    ctx.fillText(line, x, y);
    y += lineHeight;
  }
  return y;
}

export function drawDeviceSheet(ctx, sheet, layout = DEVICE_PANEL) {
  const width = drawHeading(ctx, layout, sheet.heading);
  let y = 160;
  if (sheet.title) {
    ctx.fillStyle = PALETTE.text;
    ctx.font = `700 56px ${FONT}`;
    y = drawParagraph(ctx, sheet.title, MARGIN, y, width, 62, 2) + 14;
  }
  if (sheet.model) {
    ctx.fillStyle = PALETTE.accent;
    ctx.font = `32px ${FONT}`;
    y = drawParagraph(ctx, sheet.model, MARGIN, y - 4, width, 42, 1) + 10;
  }
  if (sheet.hint) {
    ctx.fillStyle = PALETTE.muted;
    ctx.font = `36px ${FONT}`;
    drawParagraph(ctx, sheet.hint, MARGIN, y, width, 50, 8);
    return;
  }
  for (const { label, value } of sheet.props) {
    ctx.fillStyle = PALETTE.muted;
    ctx.font = `34px ${FONT}`;
    ctx.fillText(label, MARGIN, y);
    ctx.fillStyle = PALETTE.text;
    ctx.fillText(wrapText(value, width - 260, (text) => ctx.measureText(text).width, 1)[0] ?? '', MARGIN + 260, y);
    y += 50;
  }
  y += 40;
  // Ports reliés : une ligne chacun (port, voisin, débit, charge), puis le débit global en bas.
  const bottom = layout.pxHeight - (sheet.totals ? 110 : 40);
  if (sheet.ports.length) {
    // Place gardée pour un bloc IP/MAC seulement si l'équipement a des adresses (pas un switch).
    const reserve = sheet.interfaces.some((itf) => itf.ip !== '—' || itf.mac !== '—') ? 140 : 0;
    const rows = Math.max(0, Math.min(sheet.ports.length, Math.floor((bottom - y - reserve) / 64)));
    // Les ports les plus chargés d'abord : en VR, la place est comptée.
    const busiest = [...sheet.ports].sort((a, b) => b.utilization - a.utilization);
    for (const port of busiest.slice(0, rows)) {
      ctx.fillStyle = PALETTE.accent;
      ctx.font = `600 32px ${MONO}`;
      ctx.fillText(port.name, MARGIN, y);
      ctx.fillStyle = PALETTE.text;
      ctx.font = `30px ${FONT}`;
      ctx.fillText(wrapText(port.peer, 330, (text) => ctx.measureText(text).width, 1)[0] ?? '', MARGIN + 120, y);
      ctx.font = `30px ${MONO}`;
      ctx.fillText(port.current, MARGIN + 470, y);
      ctx.fillStyle = PALETTE.border;
      ctx.fillRect(MARGIN + 660, y - 22, 150, 20);
      ctx.fillStyle = LOAD[port.level] ?? LOAD.idle;
      ctx.fillRect(MARGIN + 660, y - 22, Math.round(150 * Math.min(1, port.utilization)), 20);
      ctx.fillStyle = PALETTE.muted;
      ctx.font = `26px ${FONT}`;
      ctx.fillText(port.percent, MARGIN + 660, y + 22);
      y += 64;
    }
    if (rows < sheet.ports.length) {
      ctx.fillStyle = PALETTE.muted;
      ctx.font = `28px ${FONT}`;
      ctx.fillText(`… et ${sheet.ports.length - rows} autre(s) port(s) relié(s)`, MARGIN, y);
      y += 50;
    }
    y += 30;
  }
  if (sheet.totals) {
    ctx.fillStyle = PALETTE.border;
    ctx.fillRect(MARGIN, layout.pxHeight - 104, width, 2);
    ctx.fillStyle = PALETTE.text;
    ctx.font = `600 32px ${FONT}`;
    ctx.fillText(`Débit global ${sheet.totals.current} · charge ${sheet.totals.percent}`, MARGIN, layout.pxHeight - 62);
    ctx.fillStyle = PALETTE.muted;
    ctx.font = `26px ${FONT}`;
    ctx.fillText(`Bande passante globale ${sheet.totals.bandwidth} · 1 s ici = 1 ms de réseau`, MARGIN, layout.pxHeight - 24);
  }
  // Une interface par bloc : nom, puis IP et MAC en chasse fixe. On s'arrête avant le bord.
  const room = Math.max(0, Math.floor((bottom - y) / 138));
  const shown = sheet.interfaces.filter((itf) => itf.ip !== '—' || itf.mac !== '—').slice(0, room);
  for (const itf of shown) {
    ctx.fillStyle = PALETTE.border;
    ctx.fillRect(MARGIN, y - 34, width, 2);
    ctx.fillStyle = PALETTE.accent;
    ctx.font = `600 36px ${FONT}`;
    ctx.fillText(itf.name, MARGIN, y + 8);
    ctx.fillStyle = PALETTE.text;
    ctx.font = `34px ${MONO}`;
    ctx.fillText(`IP   ${itf.ip}`, MARGIN + 24, y + 54);
    ctx.fillText(`MAC  ${itf.mac}`, MARGIN + 24, y + 96);
    y += 138;
  }
  const addressed = sheet.interfaces.filter((itf) => itf.ip !== '—' || itf.mac !== '—').length;
  if (shown.length < addressed && !sheet.totals) {
    ctx.fillStyle = PALETTE.muted;
    ctx.font = `30px ${FONT}`;
    ctx.fillText(`… et ${addressed - shown.length} autre(s) interface(s)`, MARGIN, layout.pxHeight - 36);
  }
}

export function drawStepSheet(ctx, sheet, layout = STEP_PANEL) {
  const width = drawHeading(ctx, layout, sheet.heading);
  let y = 164;
  if (sheet.title) {
    ctx.fillStyle = PALETTE.text;
    ctx.font = `700 50px ${FONT}`;
    y = drawParagraph(ctx, sheet.title, MARGIN, y, width, 58, 2) + 12;
  }
  ctx.fillStyle = sheet.hint ? PALETTE.muted : PALETTE.text;
  ctx.font = `38px ${FONT}`;
  const maxLines = Math.max(1, Math.floor((layout.pxHeight - 30 - y) / 52) + 1);
  drawParagraph(ctx, sheet.text, MARGIN, y, width, 52, maxLines);
}

/** Fiche de l'équipement sélectionné, tenue à jour par app.ui.onChange. */
export function createVrDevicePanel(app, { documentRef } = {}) {
  const panel = createCanvasPanel(DEVICE_PANEL, { documentRef, name: 'Fiche équipement VR' });
  const show = (id) => {
    drawDeviceSheet(panel.ctx, deviceSheet(describeSelection(app, id ?? null)));
    panel.commit();
  };
  const off = typeof app?.ui?.onChange === 'function' ? app.ui.onChange((id) => show(id)) : null;
  show(app?.ui?.getSelection?.() ?? null);
  // Débits en direct pendant la lecture (phase 5), deux fois par seconde au plus : redessiner un
  // canevas a un coût, surtout sur un casque.
  let last = 0;
  const live = () => {
    const id = app?.ui?.getSelection?.() ?? null;
    const now = globalThis.performance?.now?.() ?? Date.now();
    if (id === null || now - last < 500) return;
    last = now;
    show(id);
  };
  const offLive = typeof app?.sim?.on === 'function' ? app.sim.on(TOPICS.TICK, live) : null;
  return {
    mesh: panel.mesh,
    setPose: panel.setPose,
    getPlane: () => panelPlane(panel.mesh.matrixWorld.elements, DEVICE_PANEL.width, DEVICE_PANEL.height),
    hover() {},
    press: () => false,
    dispose() {
      off?.();
      offLive?.();
      panel.dispose();
    },
  };
}

/** Explication de l'étape en cours, tenue à jour par le bus du moteur. */
export function createVrStepPanel(app, { documentRef } = {}) {
  const panel = createCanvasPanel(STEP_PANEL, { documentRef, name: 'Explications VR' });
  const sim = app?.sim;
  let step = currentStep(sim);
  const redraw = () => {
    let scenario = null;
    try {
      scenario = sim?.getScenario?.() ?? null;
    } catch {
      scenario = null;
    }
    drawStepSheet(panel.ctx, stepSheet(step, scenario));
    panel.commit();
  };
  const subscriptions = [];
  if (typeof sim?.on === 'function') {
    subscriptions.push(sim.on(TOPICS.STEP, ({ title, text }) => { step = { title, text }; redraw(); }));
    // Réinitialisation ou nouveau scénario : on efface l'étape (le contrat demande de tout effacer).
    subscriptions.push(sim.on(TOPICS.RESET, () => { step = null; redraw(); }));
    subscriptions.push(sim.on(TOPICS.SCENARIO, () => { step = null; redraw(); }));
  }
  redraw();
  return {
    mesh: panel.mesh,
    setPose: panel.setPose,
    getPlane: () => panelPlane(panel.mesh.matrixWorld.elements, STEP_PANEL.width, STEP_PANEL.height),
    hover() {},
    press: () => false,
    dispose() {
      for (const off of subscriptions) if (typeof off === 'function') off();
      panel.dispose();
    },
  };
}
