// Tests de l'adressage IPv4 et des tables de routage (src/sim/net.js), fonctions pures.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  addressedInterfaces, formatRoute, inNetwork, intToIp, ipToInt, lookupRoute, maskOf, networkAddress,
  ownsIp, parseNetwork, primaryIp, routingTable,
} from '../src/sim/net.js';

test('conversions d\'adresses et masques', () => {
  assert.equal(ipToInt('192.168.1.10'), 0xc0a8010a);
  assert.equal(intToIp(0xc0a8010a), '192.168.1.10');
  assert.equal(intToIp(ipToInt('255.255.255.255')), '255.255.255.255');
  assert.equal(maskOf(24), 0xffffff00);
  assert.equal(maskOf(0), 0);
  assert.equal(maskOf(32), 0xffffffff);
  assert.equal(networkAddress('10.0.0.2', 30), '10.0.0.0');
  assert.deepEqual(parseNetwork('192.168.3.77/24'), { network: '192.168.3.0', prefix: 24 });
  assert.equal(parseNetwork('pas une route'), null);
});

test('appartenance à un réseau', () => {
  assert.equal(inNetwork('192.168.1.200', '192.168.1.0', 24), true);
  assert.equal(inNetwork('192.168.2.1', '192.168.1.0', 24), false);
  assert.equal(inNetwork('10.0.0.2', '10.0.0.0', 30), true);
  assert.equal(inNetwork('10.0.0.4', '10.0.0.0', 30), false, 'un /30 ne contient que 4 adresses');
  assert.equal(inNetwork('8.8.8.8', '0.0.0.0', 0), true, 'la route par défaut contient tout');
});

const router = {
  id: 'r1', type: 'router',
  interfaces: [
    { name: 'g0', mac: '02:00:00:00:00:a0', ip: '192.168.1.1/24' },
    { name: 'g1', mac: '02:00:00:00:00:a1', ip: '10.0.0.1/30' },
    { name: 'g2', mac: '02:00:00:00:00:a2' },
  ],
  routes: [
    { network: '192.168.3.0/24', via: '10.0.0.2' },
    { network: '192.168.3.128/25', via: '10.0.0.2' },
    { network: '0.0.0.0/0', via: '10.0.0.2' },
    { network: '172.16.0.0/16', via: '203.0.113.1' }, // voisin injoignable : ignorée à la recherche
  ],
};
const host = { id: 'pc1', type: 'host', gateway: '192.168.1.1', interfaces: [{ name: 'eth0', mac: '02:00:00:00:01:10', ip: '192.168.1.10/24' }] };

test('interfaces adressées et adresses possédées', () => {
  assert.deepEqual(addressedInterfaces(router).map((itf) => `${itf.name} ${itf.network}/${itf.prefix}`), ['g0 192.168.1.0/24', 'g1 10.0.0.0/30']);
  assert.equal(ownsIp(router, '10.0.0.1'), true);
  assert.equal(ownsIp(router, '10.0.0.2'), false);
  assert.equal(primaryIp(host), '192.168.1.10');
  assert.equal(primaryIp({ interfaces: [{ name: 'p1' }] }), null);
});

test('table de routage : réseaux connectés, routes statiques, route par défaut', () => {
  assert.deepEqual(routingTable(host).map(formatRoute), ['192.168.1.0/24 (connecté, eth0)', '0.0.0.0/0 via 192.168.1.1']);
  assert.deepEqual(routingTable(router).map((route) => route.kind), ['connected', 'connected', 'static', 'static', 'default', 'static']);
  assert.deepEqual(routingTable({ interfaces: [], routes: [{ network: 'x', via: '1.1.1.1' }, null] }), [], 'routes invalides ignorées');
});

test('recherche de route : le plus long préfixe gagne', () => {
  assert.deepEqual(lookupRoute(host, '192.168.1.20'), { interface: 'eth0', nextHop: '192.168.1.20', route: routingTable(host)[0] });
  assert.equal(lookupRoute(host, '192.168.2.20').nextHop, '192.168.1.1', 'autre réseau → passerelle');
  assert.equal(lookupRoute(router, '192.168.3.200').route.prefix, 25, '/25 plus précis que /24');
  assert.equal(lookupRoute(router, '192.168.3.10').route.prefix, 24);
  assert.deepEqual([lookupRoute(router, '192.168.3.10').interface, lookupRoute(router, '192.168.3.10').nextHop], ['g1', '10.0.0.2']);
  assert.equal(lookupRoute(router, '8.8.8.8').route.kind, 'default');
  assert.equal(lookupRoute(router, '172.16.5.5').route.kind, 'default', 'route vers un voisin injoignable sautée');
  assert.equal(lookupRoute({ interfaces: [{ name: 'eth0', ip: '192.168.1.10/24' }] }, '192.168.9.9'), null, 'sans passerelle : aucune route');
  assert.equal(lookupRoute(host, 'pas une adresse'), null);
});
