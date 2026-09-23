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
