// Tests de l'installation PWA et de l'indicateur hors ligne (src/ui/install.js). Sans DOM :
// la fenêtre du navigateur est remplacée par un EventTarget de Node.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createInstallController, installView, isStandalone, manualInstallHint, MESSAGES, mount } from './install.js';

/** Fausse fenêtre : EventTarget + navigator + matchMedia. */
function fakeWindow({ standalone = false, onLine = true, userAgent = 'Chrome', secure = true, promptSupport = true } = {}) {
  const env = new EventTarget();
  env.navigator = { onLine, userAgent };
  env.isSecureContext = secure;
  env.matchMedia = (query) => ({ matches: standalone && query === '(display-mode: standalone)' });
  if (promptSupport) env.onbeforeinstallprompt = null;
  return env;
}

/** Faux évènement beforeinstallprompt, avec le choix que fera l'utilisateur. */
function promptEvent(outcome) {
  const event = new Event('beforeinstallprompt', { cancelable: true });
  event.prompted = 0;
  event.prompt = async () => { event.prompted += 1; };
  event.userChoice = Promise.resolve({ outcome });
  return event;
}

test('au départ : bouton visible, pas de message ; masqué si l\'application est déjà installée', () => {
  const view = createInstallController(fakeWindow()).getView();
  assert.equal(view.showButton, true);
  assert.equal(view.message, null);
  assert.equal(view.offline, false);

  assert.equal(createInstallController(fakeWindow({ standalone: true })).getView().showButton, false);
  assert.equal(isStandalone({ navigator: { standalone: true } }), true, 'Safari iOS');
});

test('installation acceptée : l\'invite du navigateur s\'ouvre, puis appinstalled masque le bouton', async () => {
  const env = fakeWindow();
  const views = [];
  const controller = createInstallController(env, { onChange: (view) => views.push(view) });

  const event = promptEvent('accepted');
  env.dispatchEvent(event);
  assert.equal(event.defaultPrevented, true, 'le mini-bandeau du navigateur est remplacé par notre bouton');
  assert.match(controller.getView().buttonTitle, /^Installer l'application/);

  assert.equal(await controller.install(), 'accepted');
  assert.equal(event.prompted, 1);
  assert.equal(controller.getView().message, MESSAGES.accepted);

  env.dispatchEvent(new Event('appinstalled'));
  assert.equal(controller.getView().showButton, false);
  assert.equal(controller.getView().message, MESSAGES.installed);
  assert.ok(views.length >= 3);
});

test('installation refusée : message clair, le bouton reste, une nouvelle invite peut resservir', async () => {
  const env = fakeWindow();
  const controller = createInstallController(env);
  const first = promptEvent('dismissed');
  env.dispatchEvent(first);

  assert.equal(await controller.install(), 'dismissed');
  assert.equal(controller.getView().message, MESSAGES.dismissed);
  assert.equal(controller.getView().showButton, true);

  // Une invite ne sert qu'une fois : sans nouvelle invite, le clic explique quoi faire.
  assert.equal(await controller.install(), 'unavailable');
  assert.equal(first.prompted, 1);

  const second = promptEvent('accepted');
  env.dispatchEvent(second);
  assert.equal(await controller.install(), 'accepted');
});

test('invite en échec : message, aucune exception', async (t) => {
  t.mock.method(console, 'error', () => {});
  const env = fakeWindow();
  const controller = createInstallController(env);
  const event = promptEvent('accepted');
  event.prompt = async () => { throw new Error('geste utilisateur requis'); };
  env.dispatchEvent(event);
  assert.equal(await controller.install(), 'failed');
  assert.equal(controller.getView().message, MESSAGES.failed);
});

test('installation indisponible : l\'explication dépend du navigateur', async () => {
  assert.equal(manualInstallHint(fakeWindow({ secure: false })), MESSAGES.insecure);
  assert.equal(manualInstallHint(fakeWindow({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0)', promptSupport: false })), MESSAGES.ios);
  assert.equal(manualInstallHint(fakeWindow({ userAgent: 'Firefox', promptSupport: false })), MESSAGES.manual);
  assert.equal(manualInstallHint(fakeWindow()), MESSAGES.pending);

  const controller = createInstallController(fakeWindow({ userAgent: 'Firefox', promptSupport: false }));
  assert.equal(await controller.install(), 'unavailable');
  assert.equal(controller.getView().message, MESSAGES.manual);
  controller.dismissMessage();
  assert.equal(controller.getView().message, null);
});

test('indicateur hors ligne : suit les évènements offline et online', () => {
  const env = fakeWindow({ onLine: false });
  const controller = createInstallController(env);
  assert.equal(controller.getView().offline, true);
  env.dispatchEvent(new Event('online'));
  assert.equal(controller.getView().offline, false);
  env.dispatchEvent(new Event('offline'));
  assert.equal(controller.getView().offline, true);

  controller.destroy();
  env.dispatchEvent(new Event('online'));
  assert.equal(controller.getView().offline, true, 'plus d\'écoute après destroy()');
});

test('installView est une fonction pure', () => {
  assert.deepEqual(installView({ installed: true, canPrompt: false, offline: true, message: null }), {
    showButton: false, buttonTitle: 'Comment installer l\'application', offline: true, message: null,
  });
});

test('sans fenêtre ni DOM : aucun crash, le gabarit est écrit', async () => {
  const controller = createInstallController(null);
  assert.equal(controller.getView().showButton, true);
  assert.equal(await controller.install(), 'unavailable');
  controller.destroy();

  const container = { innerHTML: '' };
  const api = mount(container, {});
  assert.match(container.innerHTML, /data-role="install"/);
  assert.match(container.innerHTML, /Hors ligne/);
  api.destroy();
});
