#!/usr/bin/env bash
# Atualiza os dados cifrados com o que está em ./extratos e publica no site.
# Uso:  bash atualizar.sh
set -euo pipefail
cd "$(dirname "$0")"

if [ -d .git ]; then
  # traz as melhorias do painel publicadas desde a última vez; os dados são gerados de novo logo abaixo
  git checkout -q -- data 2>/dev/null || true
  if ! git pull -q --rebase --autostash; then
    echo "Não consegui buscar a versão mais nova do painel no GitHub. Confira a internet e tente de novo."
    exit 1
  fi
fi

python3 tools/gerar_cofre.py "$@"

if [ ! -d .git ]; then
  echo "Esta pasta ainda não está ligada ao GitHub. Rode uma vez:  bash ligar_github.sh (ou peça ao Claude para publicar)."
  exit 0
fi
git add data/vault.json data/investimentos.json data/indices.json 2>/dev/null || true
if git diff --cached --quiet; then echo "Nada mudou; não há o que publicar."; exit 0; fi
git commit -q -m "Atualiza dados ($(date +%d/%m/%Y))"
git push -q
echo "Publicado. O site atualiza em cerca de 1 minuto: https://lebarsildev.github.io/financas-pessoais/"
