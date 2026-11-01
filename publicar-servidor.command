#!/bin/bash
# Meu Neuro — publica o servidor (funções e regras) no projeto Firebase "refilmed" (o id do projeto continua esse).
# Rode depois de ativar o plano Blaze. Duplo clique ou: bash publicar-servidor.command
cd "$(dirname "$0")" || exit 1
FB="npx --yes firebase-tools@13"
echo "== 1/5 Entrando na conta do Firebase (abre o navegador se precisar)"
$FB login || exit 1
echo "== 2/5 Ligando APIs e criando o armazenamento dos PDFs"
python3 tools/preparar_projeto.py || { read -n 1 -s -r -p "Tecle algo para fechar"; exit 1; }
echo "== 3/5 Instalando dependências das funções"
(cd functions && npm install --no-audit --no-fund) || exit 1
echo "== 4/5 Conferindo o segredo do VIDaaS"
if ! $FB functions:secrets:access VIDAAS_CLIENT_SECRET --project refilmed >/dev/null 2>&1; then
  printf 'nao-usado' | $FB functions:secrets:set VIDAAS_CLIENT_SECRET --project refilmed --data-file=- --force || exit 1
fi
echo "== 5/5 Publicando regras e funções"
$FB deploy --only firestore:rules,storage,functions --project refilmed --non-interactive --force || { read -n 1 -s -r -p "Falhou. Tecle algo para fechar"; exit 1; }
echo
echo "Pronto. O servidor está no ar. Próximo: ativar-vidaas.command, quando a Valid liberar o cadastro."
read -n 1 -s -r -p "Tecle algo para fechar"
