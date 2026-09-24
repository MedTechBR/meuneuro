# Backend Firebase do RefilMed

Projeto **refilmed** (https://console.firebase.google.com/project/refilmed), conta matheusparente1@gmail.com. Criado em 24/09/2026.

## Já feito
- Projeto, app web e configuração em `config.js` (pública por design; `ativo: false` mantém o site em demonstração).
- Firestore em `southamerica-east1`, com regras publicadas (`firestore.rules`):
  paciente (login anônimo) cria e vê só o próprio pedido; só médicos aprovados listam e atendem;
  cada profissional mantém o próprio perfil em `medicos/{uid}`; "aprovado" só o servidor grava.
- Login ligado no console: **Anônimo** e **E-mail/senha**; domínio `medtechbr.com.br` autorizado.
- APIs habilitadas: Firestore, Identity Toolkit, Vertex AI, Cloud Functions, Eventarc, Storage.
- Testado em 24/09: pedido fictício gravado com login anônimo, consulta do paciente funcionando e
  leitura/listagem sem login recusadas (403). O documento de teste tem o nome começando por "[TESTE]".

## Testar o modo real antes de ligar para todos
Abra o site com `?backend=firebase` (vale para aquele navegador; `?backend=local` volta).

## Aprovar médicos e atendentes
- A pessoa cria a conta em Entrar → Médico/Atendente → "criar agora" (ela mesma define a senha).
- Aprovação: tela `#/admin` (precisa das funções) ou, antes do Blaze, no terminal:
  `python3 tools/definir_papel.py email@exemplo.com medico` (ou `atendente`, `admin`).
  Para você virar administrador: crie sua conta pelo site e rode `... seuemail admin`.

## Falta (depende de você)
1. **Plano Blaze** (Uso e faturamento). Depois, duplo clique em `publicar-servidor.command`:
   publica as funções (IA, consulta por código, verificação, assinatura VIDaaS, QR do ITI, aprovação)
   e as regras do Storage.
2. **VIDaaS:** cadastrar a aplicação RefilMed na Valid e colocar o `VIDAAS_CLIENT_ID` em
   `functions/.env.refilmed`; rodar o script de novo.
3. Ligar para todos: `ativo: true` em `config.js` e publicar o site.
