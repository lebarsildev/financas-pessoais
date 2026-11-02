#!/usr/bin/env bash
# Atualiza o cofre com os extratos da pasta ./extratos e publica no GitHub.
set -euo pipefail
cd "$(dirname "$0")"
python3 tools/gerar_cofre.py "$@"
if [ ! -d .git ]; then
  echo "Esta pasta ainda não está ligada ao GitHub. Peça ao Claude para publicar, ou veja o README."
  exit 0
fi
git add data/vault.json data/investimentos.json
git commit -m "Atualiza dados ($(date +%d/%m/%Y))" || { echo "Nada mudou."; exit 0; }
git push
echo "Publicado. O site atualiza em cerca de 1 minuto."
