// Tests du pipeline (phase 8) : structure de .github/workflows/ci.yml et script de vérification
// HTTPS. Sans réseau : la vérification réelle du site se fait en CI et à la main (docs/ci-cd.md).
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const script = fileURLToPath(new URL('../tools/verify-tls.sh', import.meta.url));

/** Bloc d'un job (lignes indentées sous « nom: » dans jobs). */
function job(yaml, name) {
  const start = yaml.indexOf(`\n  ${name}:\n`);
  assert.ok(start >= 0, `job ${name} absent`);
  const rest = yaml.slice(start + 1);
  const end = rest.slice(1).search(/\n {2}[a-z-]+:\n/);
  return end < 0 ? rest : rest.slice(0, end + 1);
}

test('déclencheurs : pull request, push sur main, lancement manuel, chaque semaine', async () => {
  const yaml = await read('.github/workflows/ci.yml');
  assert.match(yaml, /\n {2}pull_request:/);
  assert.match(yaml, /push:\n {4}branches: \[main\]/);
  assert.match(yaml, /workflow_dispatch:/);
  assert.match(yaml, /schedule:\n {4}- cron: '0 6 \* \* 1'/);
});

test('jobs : tests, déploiement (adresse publiée en sortie), vérification HTTPS après le déploiement', async () => {
  const yaml = await read('.github/workflows/ci.yml');
  const tests = job(yaml, 'test');
  assert.match(tests, /run: node --test/);
  assert.match(tests, /run: node tools\/build-precache\.js/);
  const deploy = job(yaml, 'deploy');
  assert.match(deploy, /needs: test/);
  assert.match(deploy, /page_url: \$\{\{ steps\.deployment\.outputs\.page_url \}\}/);
  assert.match(deploy, /actions\/deploy-pages@v5/);
  const verify = job(yaml, 'verify-tls');
  assert.match(verify, /needs: deploy/);
  assert.match(verify, /needs\.deploy\.result == 'success' \|\| github\.event_name == 'schedule'/);
  assert.match(verify, /bash tools\/verify-tls\.sh "\$PAGE_URL"/);
  assert.match(verify, /openssl version/);
});

test('actions officielles aux versions majeures vérifiées (13 novembre 2026)', async () => {
  const yaml = await read('.github/workflows/ci.yml');
  const used = [...new Set([...yaml.matchAll(/uses: (actions\/[a-z-]+@v\d+)/g)].map((match) => match[1]))].sort();
  assert.deepEqual(used, ['actions/checkout@v7', 'actions/configure-pages@v6', 'actions/deploy-pages@v5', 'actions/setup-node@v7', 'actions/upload-pages-artifact@v5']);
});

test('script de vérification : syntaxe bash, refus d\'une adresse non HTTPS', async (t) => {
  const check = spawnSync('bash', ['-n', script], { encoding: 'utf8' });
  if (check.error?.code === 'ENOENT') {
    t.skip('bash absent de ce poste');
    return;
  }
  assert.equal(check.status, 0, check.stderr);
  const refused = spawnSync('bash', [script, 'http://exemple.test/'], { encoding: 'utf8' });
  assert.equal(refused.status, 2);
  assert.match(refused.stderr, /doit commencer par https:\/\//);
  const text = await readFile(script, 'utf8');
  for (const piece of ['openssl s_client', '-servername', '-checkend', '-tls1_2', 'Strict-Transport-Security', 'GITHUB_STEP_SUMMARY']) {
    assert.ok(text.includes(piece) || text.toLowerCase().includes(piece.toLowerCase()), piece);
  }
});
