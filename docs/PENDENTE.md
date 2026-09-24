# Pendências antes de atender pacientes reais

Legal e operacional (não é código; ver docs/REGULATORIO.md):
- Empresa com **registro no CRM da UF-sede e diretor técnico médico** (Lei 14.510/2022 art. 3º; CFM 2.314/2022).
- **IA:** avaliação de risco documentada, governança e, se o sistema for próprio, comissão de IA e
  telemedicina (Res. CFM 2.454/2026). Parecer sobre enquadramento como software médico (RDC 657/2022).
- LGPD: RIPD, registro de operações, contrato com o provedor de IA proibindo treino com os dados.
- Conferir CRM ativo e RQE de cada médico no Cadastro Nacional do CFM.

Receita:
- **SNCR da Anvisa** (RDC 1.000/2025, alterada pela 1.028/2026): prazo de abertura 30/09/2026. Depois,
  receita de controle especial eletrônica precisará de numeração do SNCR (tolerância de 30 dias).
  Sem integração, a emissão eletrônica de C1 para. Plano B: prescrever pelo portal do CFM ou parceiro
  integrado, usando o botão "Copiar texto" da aba Receita.
- Notificação B (clonazepam, clobazam, zolpidem) segue em talonário de papel até a integração.
- PDF gerado pela impressão do navegador não leva os OIDs do ITI (tipo de documento, CRM, UF);
  para o validador do ITI reconhecer como documento de saúde, gerar o PDF com os metadados ou
  usar assinador/plataforma que os inclua.

Produto:
- Videochamada integrada (hoje: WhatsApp e registro da modalidade).
- Painel de administração (médicos, permissões, relatórios); pagamento.
- Notificação ao paciente quando a receita for assinada (hoje ele consulta pelo código).

## SNCR (Anvisa) — integração pronta no app (24/09/2026)
Fonte: `docs/sncr/` (Manual API SNCR 2ª ed., Instruções de Integração v1.0 e o OpenAPI de homologação).
- Não existe credenciamento de plataforma. Cada médico faz o cadastro uma vez com o gov.br
  (homologação: sncr-treinamento.anvisa.gov.br) e depois, no RefilMed, Perfil → SNCR → "Entrar com gov.br".
- O app pede o bloco de 1.000 números de controle especial (máx. 3 pedidos/mês) e usa um número por
  receita, impresso no documento. Exige o **CNPJ** da empresa em `config.js → sncr.cnpj`.
- Notificação B/A: o app já busca os números autorizados pela Vigilância Sanitária (10 a 50);
  falta gerar o documento eletrônico no modelo da Anvisa (a página de solicitação de números aos
  prescritores só abre depois de 30/09/2026; até lá a Visa libera pelos canais atuais).
- Só funciona em domínio .br (medtechbr.com.br serve; localhost não).
- Produção: trocar `sncr.ambiente` para `producao` em `config.js`.

## Assinatura integrada (VIDaaS e outros certificados em nuvem)
Objetivo: o médico toca em "Assinar com VIDaaS", aprova a notificação no celular e a receita volta
assinada, sem baixar nem anexar PDF. Servidor pronto (`functions/vidaas.js`, `pades.js`, `pdf.js`) e testado com chave local: PDF com OIDs do ITI, QR no padrão do ITI e assinatura PAdES validada pelo pyHanko (íntegra, cobre o arquivo todo). No modo local continua a simulação.

Como fica (mesma API oficial da Valid que o assinador de termos do InternaMed já usa,
`~/AssinadorVIDaaS/assinador.py`):
1. Servidor do RefilMed gera o PDF da receita com os OIDs do ITI (tipo de documento, CRM, UF, especialidade).
2. `GET /v0/oauth/authorize` com PKCE e `login_hint` = CPF do médico → push no app VIDaaS.
3. Consulta `/valid/api/v1/trusted-services/authentications?code=` até a aprovação; troca por token em `/v0/oauth/token`.
4. `POST /v0/oauth/signature` com o hash (SHA-256) do trecho assinado do PDF; recebe a assinatura RAW.
5. Servidor monta o CMS/PAdES, embute no PDF e grava no pedido; o paciente baixa já assinado.

Por que precisa de servidor: a API do VIDaaS não libera chamadas vindas do navegador (sem CORS;
conferido em 23/09/2026) e montar o PAdES com a cadeia ICP-Brasil é trabalho de servidor (Node com
pkijs/@signpdf, ou Python com pyHanko numa função).
Falta, do lado do dono: projeto Firebase do RefilMed (docs/FIREBASE.md) e cadastro de uma aplicação
própria do RefilMed na Valid (client_id da plataforma; o do assinador pessoal não deve ser reaproveitado).
Depois: BirdID (Soluti), SafeID e outros certificados em nuvem têm API parecida e entram do mesmo jeito.

## Logins
Hoje é demonstração: escolha de perfil (paciente, médico, atendente) sem senha, guardada no navegador.
Produção: médico e atendente com e-mail e senha e permissão dada pelo administrador (claims `medico` e
`atendente`); paciente com CPF e código por SMS ou e-mail; conferência do CRM/RQE do médico no CFM.
