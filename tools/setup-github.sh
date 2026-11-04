#!/usr/bin/env bash
# Étape 1 : crée le dépôt public sur le compte connecté, le pousse et active GitHub Pages.
# À lancer une seule fois depuis la racine du projet. Prérequis : gh installé, puis `gh auth login`.
# Étape 2, quand les identifiants de l'équipe sont connus : tools/setup-team.sh
set -euo pipefail

# Public : GitHub Pages gratuit et protection de branche sans abonnement.
gh repo create 3d-network-topology --public --source=. --remote=origin --push
repo=$(gh repo view --json nameWithOwner --jq .nameWithOwner)

gh api -X POST "repos/$repo/pages" -f build_type=workflow --silent

# Le premier push a précédé l'activation de Pages : on relance pour déployer.
gh workflow run CI --repo "$repo" --ref main
echo "Dépôt prêt : https://github.com/$repo"
