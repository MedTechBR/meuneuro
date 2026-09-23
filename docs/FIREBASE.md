# Backend Firebase do Meu Neuro

O app funciona sem backend (modo local). Para uso real — paciente no celular dele, médico no
computador — é preciso um projeto Firebase **próprio** do Meu Neuro. Criar projeto, mexer em IAM,
chaves e cobrança é feito pelo dono.

1. Console Firebase → novo projeto (ex.: `meuneuro`), plano **Blaze**, região `southamerica-east1`.
2. Authentication → habilitar **Anônimo** (pacientes) e **E-mail/senha** (médicos).
3. Firestore → criar banco em `southamerica-east1`.
4. Google Cloud do mesmo projeto → habilitar **Vertex AI API**.
5. Na pasta do projeto: `firebase use <id>` e `firebase deploy --only functions,firestore:rules`.
   Defina a variável `ADMIN_EMAILS` da função `definirMedico` com o e-mail do administrador.
6. Colar a configuração web em `config.js` e publicar.
7. Criar a conta de cada médico (Authentication) e dar a permissão chamando `definirMedico`
   logado como administrador (o painel de administração é pendência).

Regras: o paciente cria e lê só o próprio pedido; só contas com a permissão `medico` listam e
atendem; o paciente consulta de outro aparelho pela função `consultarPedido` (código + nascimento).
O PDF assinado fica no documento do pedido (até 700 KB); com volume real, mover para o Storage.
