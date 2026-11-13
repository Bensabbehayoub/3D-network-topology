#!/usr/bin/env bash
# Vérification du site publié en HTTPS (phase 8) : lancée par la CI après chaque déploiement et
# chaque semaine, et utilisable sur un poste (Git Bash sous Windows, Linux, macOS).
#
#   bash tools/verify-tls.sh https://bensabbehayoub.github.io/3D-network-topology/
#
# Affiche dans le journal la version de TLS, la suite de chiffrement négociée, l'échange de clés et
# le certificat (sujet, émetteur, dates de validité), puis vérifie la redirection HTTP → HTTPS,
# l'en-tête HSTS et l'acceptation de TLS 1.2. Résumé en tableau dans la page de l'exécution
# GitHub Actions ($GITHUB_STEP_SUMMARY).
#
# Échoue (code 1) si le site ne répond pas en HTTPS, si la poignée de main TLS échoue, si le
# certificat n'est pas vérifié ou s'il a expiré. Avertit si le certificat expire dans moins de
# WARN_DAYS jours, s'il n'y a pas de redirection vers HTTPS ou pas d'en-tête HSTS.
#
# Variables : ATTEMPTS (10) essais et DELAY (15 s) entre deux essais pour laisser GitHub Pages
# publier ; WARN_DAYS (14).

set -uo pipefail

URL="${1:?usage : bash tools/verify-tls.sh https://hôte/chemin/}"
case "$URL" in https://*) ;; *) echo "L'adresse doit commencer par https:// : $URL" >&2; exit 2 ;; esac
HOST=$(printf '%s' "$URL" | sed -E 's#^https://([^/:]+).*#\1#')
ATTEMPTS="${ATTEMPTS:-10}"
DELAY="${DELAY:-15}"
WARN_DAYS="${WARN_DAYS:-14}"
SUMMARY="${GITHUB_STEP_SUMMARY:-/dev/null}"
STATUS=0

note() { printf '%s\n' "$*"; }
warn() { printf '::warning::%s\n' "$*"; printf -- '- ⚠️ %s\n' "$*" >> "$SUMMARY"; }
fail() { printf '::error::%s\n' "$*"; printf -- '- ❌ %s\n' "$*" >> "$SUMMARY"; STATUS=1; }
field() { grep -m1 -i "^$1" | cut -d: -f2- | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//'; }

note "== Vérification HTTPS de $URL (hôte $HOST)"

# 1. Le site répond-il en HTTPS ? (GitHub Pages met parfois une minute à publier.)
code=000
for attempt in $(seq 1 "$ATTEMPTS"); do
  code=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 20 "$URL" 2>/dev/null || true)
  [ "$code" = "200" ] && break
  if [ "$attempt" -lt "$ATTEMPTS" ]; then
    note "Essai $attempt/$ATTEMPTS : HTTP ${code:-000}, nouvel essai dans ${DELAY} s"
    sleep "$DELAY"
  fi
done
if [ "$code" != "200" ]; then
  fail "Le site ne répond pas en HTTPS (dernier code HTTP : ${code:-aucun}) : $URL"
  exit 1
fi
note "Réponse HTTPS : 200"

# 2. Poignée de main TLS : version, suite de chiffrement, échange de clés, vérification du certificat.
brief=$(echo | openssl s_client -connect "$HOST:443" -servername "$HOST" -brief 2>&1 || true)
protocol=$(printf '%s\n' "$brief" | field 'Protocol version')
cipher=$(printf '%s\n' "$brief" | field 'Ciphersuite')
group=$(printf '%s\n' "$brief" | field 'Server Temp Key')
[ -z "$group" ] && group=$(printf '%s\n' "$brief" | field 'Negotiated TLS1.3 group')
verification=$(printf '%s\n' "$brief" | field 'Verification')
note "--- openssl s_client -brief"
printf '%s\n' "$brief" | grep -E 'Protocol version|Ciphersuite|Server Temp Key|Negotiated|Peer certificate|Verification|Signature type' || true
[ -z "$protocol" ] && fail "Poignée de main TLS impossible avec $HOST"
[ "$verification" != "OK" ] && fail "Certificat non vérifié par OpenSSL : ${verification:-résultat absent}"

# 3. Certificat : sujet, émetteur, dates ; expiré → échec, bientôt expiré → avertissement.
pem=$(echo | openssl s_client -connect "$HOST:443" -servername "$HOST" 2>/dev/null | openssl x509 2>/dev/null || true)
if [ -z "$pem" ]; then
  fail "Certificat illisible pour $HOST"
else
  subject=$(printf '%s\n' "$pem" | openssl x509 -noout -subject | sed 's/^subject=//')
  issuer=$(printf '%s\n' "$pem" | openssl x509 -noout -issuer | sed 's/^issuer=//')
  not_before=$(printf '%s\n' "$pem" | openssl x509 -noout -startdate | cut -d= -f2)
  not_after=$(printf '%s\n' "$pem" | openssl x509 -noout -enddate | cut -d= -f2)
  note "--- Certificat"
  note "Sujet     : $subject"
  note "Émetteur  : $issuer"
  note "Valide du : $not_before"
  note "      au  : $not_after"
  days=$(( ( $(date -d "$not_after" +%s 2>/dev/null || echo 0) - $(date +%s) ) / 86400 ))
  if ! printf '%s\n' "$pem" | openssl x509 -noout -checkend 0 >/dev/null; then
    fail "Le certificat a expiré le $not_after"
  elif ! printf '%s\n' "$pem" | openssl x509 -noout -checkend $(( WARN_DAYS * 86400 )) >/dev/null; then
    warn "Le certificat expire dans $days jour(s) ($not_after)"
  fi
fi

# 4. TLS 1.2 (encore accepté pour les navigateurs anciens ?).
tls12=$(echo | openssl s_client -connect "$HOST:443" -servername "$HOST" -tls1_2 -brief 2>&1 | field 'Ciphersuite' || true)
note "TLS 1.2   : ${tls12:-refusé}"

# 5. Redirection HTTP → HTTPS et en-tête HSTS.
redirect=$(curl -sS -o /dev/null -w '%{http_code} %{redirect_url}' --max-time 20 "http://${URL#https://}" 2>/dev/null || true)
redirect_code=${redirect%% *}
redirect_to=${redirect#* }
note "HTTP      : $redirect_code → ${redirect_to:-(aucune redirection)}"
case "$redirect_code:$redirect_to" in
  30[1278]:https://*) ;;
  *) warn "Pas de redirection de HTTP vers HTTPS (réponse : $redirect)" ;;
esac
hsts=$(curl -sSI --max-time 20 "$URL" 2>/dev/null | tr -d '\r' | field 'strict-transport-security' || true)
note "HSTS      : ${hsts:-absent}"
[ -z "$hsts" ] && warn "En-tête Strict-Transport-Security absent"

# 6. Résumé dans la page de l'exécution GitHub Actions.
{
  printf '\n### Vérification HTTPS de %s\n\n' "$URL"
  printf '| Élément | Valeur |\n| --- | --- |\n'
  printf '| Réponse HTTPS | %s |\n' "$code"
  printf '| Version TLS | %s |\n' "${protocol:-?}"
  printf '| Suite de chiffrement | %s |\n' "${cipher:-?}"
  printf '| Échange de clés | %s |\n' "${group:-?}"
  printf '| Certificat (sujet) | %s |\n' "${subject:-?}"
  printf '| Émetteur | %s |\n' "${issuer:-?}"
  printf '| Validité | du %s au %s (%s jours restants) |\n' "${not_before:-?}" "${not_after:-?}" "${days:-?}"
  printf '| Vérification du certificat | %s |\n' "${verification:-?}"
  printf '| TLS 1.2 | %s |\n' "${tls12:-refusé}"
  printf '| HTTP → HTTPS | %s %s |\n' "$redirect_code" "${redirect_to:-}"
  printf '| HSTS | %s |\n' "${hsts:-absent}"
} >> "$SUMMARY"

if [ "$STATUS" -eq 0 ]; then note "== Site disponible en HTTPS, certificat valide"; fi
exit "$STATUS"
