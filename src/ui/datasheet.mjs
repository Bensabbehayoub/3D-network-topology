// Ramy (phase 5) : fiche d'un équipement, sur le modèle d'une fiche produit constructeur.
// Fonctions pures, sans DOM (testées sous Node), utilisées par l'inspecteur 2D et le panneau VR.
//
// - caractéristiques générales : modèle du catalogue (ports, capacité de commutation…) ;
// - tableau des ports : vitesse, état, équipement relié, débit actuel, utilisation ;
// - débit global et bande passante globale de l'équipement.
// Les débits viennent de app.sim.getTraffic() et se mettent à jour pendant la simulation.

import { CABLES, formatNumber, formatSpeed, modelOf, modelPorts, modelSheet, portConnector, portSpeed } from '../../simulation.js';

/** Note sur l'échelle de temps, affichée sous les débits. */
export const TIME_NOTE = 'Débits en temps réseau : 1 s de simulation = 1 ms de réseau.';

/** Débit en Mb/s → '0 Mb/s', '0,8 Mb/s', '98 Mb/s', '1,25 Gb/s'. */
export function formatRate(mbps) {
  if (!Number.isFinite(mbps) || mbps <= 0) return '0 Mb/s';
  if (mbps >= 1000) return `${formatNumber(mbps / 1000, 2)} Gb/s`;
  return `${formatNumber(mbps, mbps < 10 ? 1 : 0)} Mb/s`;
}

/** 0.983 → '98 %'. */
export function formatPercent(ratio) {
  if (!Number.isFinite(ratio) || ratio <= 0) return '0 %';
  const percent = ratio * 100;
  return `${formatNumber(percent, percent < 1 ? 1 : 0)} %`;
}

/** Niveau de charge pour la couleur : 'idle' (< 1 %), 'low', 'medium' (≥ 50 %), 'high' (≥ 80 %). */
export function loadLevel(ratio) {
  if (!(ratio >= 0.01)) return 'idle';
  if (ratio >= 0.8) return 'high';
  if (ratio >= 0.5) return 'medium';
  return 'low';
}

function safeTraffic(sim) {
  try {
    return typeof sim?.getTraffic === 'function' ? sim.getTraffic() : null;
  } catch {
    return null;
  }
}

/**
 * Fiche d'un équipement du scénario.
 * @returns {null | { model: object | null, specs: Array<{ label, value }>, ports: object[], freePorts: number,
 *   totals: { current: string, bandwidth: string, utilization: number, percent: string, level: string } | null,
 *   note: string | null }}
 */
export function datasheetView(app, id) {
  const sim = app?.sim;
  const scenario = sim?.getScenario?.() ?? null;
  const device = scenario?.devices?.find((candidate) => candidate.id === id);
  if (!device) return null;
  const traffic = safeTraffic(sim);
  const model = modelOf(device);
  const name = (deviceId) => scenario.devices.find((candidate) => candidate.id === deviceId)?.label ?? deviceId;

  const ports = (device.interfaces ?? []).map((itf) => {
    const key = `${device.id}:${itf.name}`;
    const link = scenario.links.find((candidate) => candidate.a === key || candidate.b === key) ?? null;
    const peer = link ? (link.a === key ? link.b : link.a) : null;
    const [peerDevice, peerInterface] = peer ? peer.split(':') : [null, null];
    const measured = traffic?.ports?.[key] ?? null;
    const speed = portSpeed(device, itf.name);
    const negotiated = measured?.negotiated ?? null;
    const utilization = measured?.utilization ?? 0;
    const current = (measured?.tx.current ?? 0) + (measured?.rx.current ?? 0);
    return {
      name: itf.name,
      speed: formatSpeed(speed),
      negotiated: negotiated && negotiated < speed ? formatSpeed(negotiated) : null,
      connector: portConnector(device, itf.name),
      state: link ? 'connecté' : 'libre',
      peer: peer ? `${name(peerDevice)} (${peerInterface})` : '—',
      cable: link?.cable ? CABLES[link.cable]?.label ?? link.cable : null,
      sent: formatRate(measured?.tx.current ?? 0),
      received: formatRate(measured?.rx.current ?? 0),
      current: formatRate(current),
      utilization,
      percent: formatPercent(utilization),
      level: loadLevel(utilization),
    };
  });

  const modelCount = modelPorts(model).length;
  const measuredDevice = traffic?.devices?.[device.id] ?? null;
  return {
    model: model ? { name: model.name, reference: model.reference, description: model.description } : null,
    specs: modelSheet(model),
    ports,
    freePorts: Math.max(0, modelCount - ports.length) + ports.filter((port) => port.state === 'libre').length,
    totals: measuredDevice ? {
      current: formatRate(measuredDevice.current),
      average: formatRate(measuredDevice.average),
      bandwidth: formatSpeed(measuredDevice.bandwidth),
      utilization: measuredDevice.utilization,
      percent: formatPercent(measuredDevice.utilization),
      level: loadLevel(measuredDevice.utilization),
    } : null,
    note: traffic ? TIME_NOTE : null,
  };
}
