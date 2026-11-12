// Pôle xr (phase 6) : panneau « Recommandations » de la session VR.
//
// Même contenu et même logique que le panneau 2D (src/ui/recommendations.js, dont il réutilise
// le contrôleur) : problèmes triés par gravité, recalculés pendant la lecture. Le rayon d'une
// manette survole une ligne ; la gâchette choisit le problème : l'équipement est sélectionné (sa
// fiche VR s'affiche), le lien est mis en évidence, et la cause et la correction s'écrivent en bas.
//
// Ce qu'il faut écrire est calculé par recoSheet() (pur, testé sous Node) ; le dessin est à part.

import { createRecommendationsController } from '../ui/recommendations.js';
import { createCanvasPanel, drawBackground, FONT, PALETTE } from './canvasPanel.js';
import { panelPlane, RECO_PANEL, recoRowAt, wrapText } from './panelLayout.js';

export const SEVERITY_COLORS = Object.freeze({ critique: '#ef476f', avertissement: '#f7b538', conseil: '#70b7df' });
export const RECO_HINT = 'Visez un problème et appuyez sur la gâchette : il est montré dans la maquette et sa correction s\'affiche ici.';

/**
 * Contenu du panneau (fonction pure).
 * @param {ReturnType<import('../ui/recommendations.js').recommendationsView>} view
 * @param {number} [first] rang du premier problème affiché (défilement)
 */
export function recoSheet(view, first = 0) {
  const { critique, avertissement, conseil } = view.counts;
  const heading = view.available
    ? `RECOMMANDATIONS · ${critique} critique${critique > 1 ? 's' : ''} · ${avertissement} avertissement${avertissement > 1 ? 's' : ''} · ${conseil} conseil${conseil > 1 ? 's' : ''}`
    : 'RECOMMANDATIONS';
  const rows = view.items.slice(first, first + RECO_PANEL.rows).map((item) => ({
    id: item.id,
    severity: item.severity,
    severityLabel: item.severityLabel,
    title: item.problem,
    where: item.target.kind === 'link' ? `Lien ${item.target.label}` : item.target.label,
    selected: item.selected,
  }));
  const chosen = view.items.find((item) => item.selected) ?? null;
  return {
    heading,
    rows,
    more: Math.max(0, view.items.length - first - rows.length),
    message: view.message,
    detail: chosen ? { title: chosen.problem, cause: chosen.cause, fix: chosen.recommendation } : null,
    hint: chosen || view.items.length === 0 ? null : RECO_HINT,
  };
}

const MARGIN = 24;

export function drawRecoSheet(ctx, sheet, hoverIndex = null, layout = RECO_PANEL) {
  drawBackground(ctx, layout);
  const width = layout.pxWidth - 2 * MARGIN;
  const measure = (text) => ctx.measureText(text).width;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = PALETTE.muted;
  ctx.font = `600 28px ${FONT}`;
  ctx.fillText(wrapText(sheet.heading, width, measure, 1)[0] ?? '', MARGIN, 64);
  ctx.fillStyle = PALETTE.border;
  ctx.fillRect(MARGIN, 86, width, 3);

  if (sheet.message) {
    ctx.fillStyle = PALETTE.text;
    ctx.font = `34px ${FONT}`;
    wrapText(sheet.message, width, measure, 4).forEach((line, i) => ctx.fillText(line, MARGIN, 160 + i * 46));
    return;
  }

  const { x, y, w, rowHeight } = layout.list;
  sheet.rows.forEach((row, i) => {
    const top = y + i * rowHeight;
    if (row.selected || i === hoverIndex) {
      ctx.fillStyle = row.selected ? PALETTE.surface : 'rgba(255, 209, 102, 0.12)';
      ctx.fillRect(x, top, w, rowHeight - 6);
    }
    ctx.fillStyle = SEVERITY_COLORS[row.severity];
    ctx.fillRect(x, top, 10, rowHeight - 6);
    ctx.font = `600 24px ${FONT}`;
    ctx.fillText(row.severityLabel.toUpperCase(), x + 26, top + 30);
    ctx.fillStyle = PALETTE.text;
    ctx.font = `600 32px ${FONT}`;
    ctx.fillText(wrapText(row.title, 720, measure, 1)[0] ?? '', x + 26, top + 66);
    ctx.fillStyle = PALETTE.muted;
    ctx.font = `26px ${FONT}`;
    ctx.textAlign = 'right';
    ctx.fillText(wrapText(row.where, 320, measure, 1)[0] ?? '', x + w - 12, top + 66);
    ctx.textAlign = 'left';
  });
  if (sheet.more > 0) {
    ctx.fillStyle = PALETTE.muted;
    ctx.font = `26px ${FONT}`;
    ctx.fillText(`… et ${sheet.more} autre(s) dans le panneau « Recommandations » de l'écran`, x, y + layout.rows * rowHeight + 10);
  }

  const top = layout.detail.y;
  ctx.fillStyle = PALETTE.border;
  ctx.fillRect(MARGIN, top, width, 2);
  if (sheet.detail) {
    ctx.fillStyle = PALETTE.text;
    ctx.font = `600 30px ${FONT}`;
    ctx.fillText(wrapText(sheet.detail.title, width, measure, 1)[0] ?? '', MARGIN, top + 44);
    ctx.font = `26px ${FONT}`;
    let line = top + 84;
    for (const text of wrapText(sheet.detail.cause, width, measure, 4)) { ctx.fillText(text, MARGIN, line); line += 34; }
    ctx.fillStyle = PALETTE.playing;
    ctx.font = `600 26px ${FONT}`;
    for (const text of wrapText(`À faire : ${sheet.detail.fix}`, width, measure, 3)) { ctx.fillText(text, MARGIN, line + 8); line += 34; }
  } else if (sheet.hint) {
    ctx.fillStyle = PALETTE.muted;
    ctx.font = `28px ${FONT}`;
    wrapText(sheet.hint, width, measure, 3).forEach((text, i) => ctx.fillText(text, MARGIN, top + 50 + i * 38));
  }
}

/** Panneau VR des recommandations, tenu à jour par le moteur. */
export function createVrRecoPanel(app, { documentRef } = {}) {
  const panel = createCanvasPanel(RECO_PANEL, { documentRef, name: 'Recommandations VR' });
  let view = null;
  let hoverIndex = null;
  const redraw = () => {
    if (!view) return;
    drawRecoSheet(panel.ctx, recoSheet(view), hoverIndex);
    panel.commit();
  };
  const controller = createRecommendationsController(app, {
    onChange: (next) => { view = next; redraw(); },
    selection: app?.ui ? { select: (id) => app.ui.select?.(id), clear: () => app.ui.clear?.() } : null,
  });
  view = controller.getView();
  redraw();
  return {
    mesh: panel.mesh,
    setPose: panel.setPose,
    getPlane: () => panelPlane(panel.mesh.matrixWorld.elements, RECO_PANEL.width, RECO_PANEL.height),
    hover(u, v) {
      const next = u === null ? null : recoRowAt(u, v, recoSheet(view).rows.length);
      if (next === hoverIndex) return;
      hoverIndex = next;
      redraw();
    },
    /** Gâchette : choisit le problème visé (montré dans la maquette, détail en bas du panneau). */
    press(u, v) {
      const index = recoRowAt(u, v, recoSheet(view).rows.length);
      if (index === null) return false;
      return controller.choose(recoSheet(view).rows[index].id);
    },
    dispose() {
      controller.dispose();
      panel.dispose();
    },
  };
}
