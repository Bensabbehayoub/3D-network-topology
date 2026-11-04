#!/usr/bin/env bash
# Étape 2 : renseigne CODEOWNERS, invite l'équipe et protège main.
# À lancer une seule fois, après tools/setup-github.sh, depuis la racine du projet.
#
#   tools/setup-team.sh <ramy> <aziz> <khalil> <ayoub>
#
# Les arguments sont les identifiants GitHub, sans @.
set -euo pipefail

if [ "$#" -ne 4 ]; then
  sed -n '2,7p' "$0"
  exit 1
fi
ramy=$1 aziz=$2 khalil=$3 ayoub=$4
repo=$(gh repo view --json nameWithOwner --jq .nameWithOwner)

sed -i "s/@RAMY_GH/@$ramy/g; s/@AZIZ_GH/@$aziz/g; s/@KHALIL_GH/@$khalil/g; s/@AYOUB_GH/@$ayoub/g" .github/CODEOWNERS
if ! git diff --quiet -- .github/CODEOWNERS; then
  git add .github/CODEOWNERS
  git commit -q -m "Renseigner les identifiants GitHub dans CODEOWNERS"
fi
# Dernier push direct sur main : la protection ci-dessous l'interdit ensuite.
git push origin main

# Un propriétaire sans droit d'écriture est ignoré par CODEOWNERS. Chacun doit accepter l'invitation.
me=$(gh api user --jq .login)
for member in "$ramy" "$aziz" "$khalil" "$ayoub"; do
  if [ "$member" != "$me" ]; then
    gh api -X PUT "repos/$repo/collaborators/$member" -f permission=push --silent
  fi
done

gh api -X PUT "repos/$repo/branches/main/protection" --silent --input - <<'JSON'
{
  "required_status_checks": { "strict": false, "contexts": ["test"] },
  "enforce_admins": true,
  "required_pull_request_reviews": {
    "required_approving_review_count": 1,
    "require_code_owner_reviews": true
  },
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false
}
JSON

echo "Équipe invitée et main protégée sur https://github.com/$repo"
