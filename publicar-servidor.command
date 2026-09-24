#!/bin/bash
# RefilMed — publica o servidor (funções, regras do banco e do armazenamento) no projeto refilmed.
# Rode DEPOIS de ativar o plano Blaze no console do Firebase. Duplo clique ou: bash publicar-servidor.command
cd "$(dirname "$0")" || exit 1
echo "== Habilitando APIs (Functions, Build, Artifact Registry, Storage, Vertex AI)"
firebase --version >/dev/null || { echo "Instale o firebase-tools"; exit 1; }
echo "== Instalando dependências das funções"
(cd functions && npm install --no-audit --no-fund) || exit 1
echo "== Publicando regras do Firestore e do Storage e as funções"
firebase deploy --only firestore:rules,storage,functions --project refilmed --non-interactive || exit 1
echo
echo "Pronto. Falta:"
echo " 1) Preencher VIDAAS_CLIENT_ID em functions/.env.refilmed quando a Valid liberar o cadastro e rodar de novo."
echo " 2) Trocar ativo:false para ativo:true em config.js e publicar o site (git push)."
read -n 1 -s -r -p "Tecle algo para fechar"
