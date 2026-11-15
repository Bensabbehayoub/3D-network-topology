// Aide des tests d'équipements : faux ctx qui enregistre envois, pertes et explications.
// Pas un fichier de test. Le vrai ctx est décrit dans docs/simulation/contrats.md (§3).
export function fakeCtx(scenario, params = {}) {
  const memory = new Map();
  const sent = [];
  const dropped = [];
  const explained = [];
  const scheduled = [];
  let packetId = 0;
  const ctx = {
    scenario,
    params,
    now: () => 0,
    device(id) {
      const device = scenario.devices.find((d) => d.id === id);
      if (!device) throw new Error(`équipement "${id}" absent`);
      return device;
    },
    memory(id) {
      if (!memory.has(id)) memory.set(id, {});
      return memory.get(id);
    },
    nextPacketId: () => `p${++packetId}`,
    send(deviceId, packet, options = {}) { sent.push({ deviceId, packet, ...options }); },
    drop(deviceId, packet, reason, options = {}) { dropped.push({ deviceId, packet, reason, ...options }); },
    explain(step) { explained.push(step); },
    schedule(delay, action) {
      const entry = { delay, action, cancelled: false };
      scheduled.push(entry);
      return () => { entry.cancelled = true; return true; };
    },
  };
  return { ctx, sent, dropped, explained, scheduled };
}

/** Petit réseau local : deux PC, un serveur, un switch à 4 ports (p4 non relié). */
export const LAN = Object.freeze({
  schema: 1, id: 'lan', title: 'LAN', protocol: 'icmp',
  devices: [
    { id: 'pc1', type: 'host', interfaces: [{ name: 'eth0', mac: '02:00:00:00:00:01', ip: '192.168.1.10/24' }], gateway: '192.168.1.1' },
    { id: 'pc2', type: 'host', interfaces: [{ name: 'eth0', mac: '02:00:00:00:00:02', ip: '192.168.1.20/24' }] },
    { id: 'srv', type: 'server', interfaces: [{ name: 'eth0', mac: '02:00:00:00:00:03', ip: '192.168.1.30/24' }] },
    { id: 'sw1', type: 'switch', interfaces: [{ name: 'p1' }, { name: 'p2' }, { name: 'p3' }, { name: 'p4' }] },
    { id: 'r1', type: 'router', interfaces: [
      { name: 'g0', mac: '02:00:00:00:00:a0', ip: '192.168.1.1/24' },
      { name: 'g1', mac: '02:00:00:00:00:a1', ip: '192.168.2.1/24' },
    ] },
  ],
  links: [
    { id: 'l1', a: 'pc1:eth0', b: 'sw1:p1' },
    { id: 'l2', a: 'pc2:eth0', b: 'sw1:p2' },
    { id: 'l3', a: 'srv:eth0', b: 'sw1:p3' },
  ],
  steps: [
    { id: 'switch-learn', title: 'a', text: 'a' },
    { id: 'switch-flood', title: 'b', text: 'b' },
    { id: 'switch-forward-sw1', title: 'c', text: 'c' },
    { id: 'host-not-for-me', title: 'd', text: 'd' },
  ],
});

export const frame = (fields) => ({ id: 'f1', protocol: 'icmp', type: 'echo-request', eth: null, ip: null, transport: null, data: {}, ...fields });
