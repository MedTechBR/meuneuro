#!/bin/bash
# Meu Neuro — liga a assinatura pelo VIDaaS com as credenciais que a Valid fornecer para a aplicação Meu Neuro.
# Nada passa pela conversa: você copia cada valor do e-mail da Valid e tecla Enter; o script lê da área de transferência.
cd "$(dirname "$0")" || exit 1
FB="npx --yes firebase-tools@13"
read -r -p "Copie o CLIENT_ID e tecle Enter. " _
ID="$(pbpaste | tr -d '[:space:]')"
[ -z "$ID" ] && { echo "Área de transferência vazia."; exit 1; }
read -r -p "Agora copie o CLIENT_SECRET e tecle Enter. " _
pbpaste | tr -d '\n' | $FB functions:secrets:set VIDAAS_CLIENT_SECRET --project refilmed --data-file=- --force || exit 1
printf '' | pbcopy
sed -i '' "s|^VIDAAS_CLIENT_ID=.*|VIDAAS_CLIENT_ID=$ID|" functions/.env.refilmed
$FB deploy --only functions --project refilmed --non-interactive --force || exit 1
echo "VIDaaS ligado."
read -n 1 -s -r -p "Tecle algo para fechar"
