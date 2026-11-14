#!/usr/bin/env bash
# Liga esta pasta ao repositório do GitHub. Só precisa rodar uma vez.
# Depois disso, ./atualizar.sh gera os dados e publica sozinho.
set -euo pipefail
cd "$(dirname "$0")"
REPO="https://github.com/lebarsildev/financas-pessoais.git"

command -v git >/dev/null || { echo "O git não está instalado. Rode: xcode-select --install"; exit 1; }
if [ ! -d .git ]; then
  git init -q -b main
  git remote add origin "$REPO"
fi
# assina as publicações com o endereço anônimo do GitHub, para o seu e-mail não aparecer no repositório público
git config user.name "lebarsildev"
git config user.email "lebarsildev@users.noreply.github.com"
git config credential.helper osxkeychain 2>/dev/null || true
git config core.fileMode false

echo "Buscando a versão publicada..."
git fetch -q origin main
git reset -q origin/main            # só alinha o registro; não mexe em nenhum arquivo seu
git branch -q -u origin/main main 2>/dev/null || git branch -q --set-upstream-to=origin/main

if [ -n "$(git status --porcelain)" ]; then
  echo "Arquivos desta pasta diferentes do site:"
  git status --short
  echo "(dados gerados e ainda não publicados aparecem aqui; o ./atualizar.sh publica)"
fi

echo
echo "Testando a permissão de publicar. Se o Terminal pedir:"
echo "  Username: lebarsildev"
echo "  Password: cole o token do GitHub (não é a senha da conta; veja o README, seção 'Publicar sozinho')"
if git push --dry-run -q origin main; then
  echo "Tudo certo. A partir de agora use:  bash atualizar.sh"
else
  echo "O GitHub recusou. Confira o token e rode de novo:  bash ligar_github.sh."
  exit 1
fi
