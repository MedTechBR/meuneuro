# O que falta para atender pacientes reais (atualizado em 01/11/2026)

## Só o dono pode fazer
1. **Plano Blaze** no projeto Firebase `refilmed` (é pagamento). Depois, duplo clique em `publicar-servidor.command`.
2. **Canal VIDaaS na Valid.** A habilitação é pela equipe comercial "Vendas Health" (validcertificadora.com.br/pages/psc-integracao-via-api; 0800-725-4565; ecleoneide.santos@valid.com). Pedir client_id e client_secret da aplicação Meu Neuro; o do assinador pessoal não deve ser reaproveitado. Depois, `ativar-vidaas.command`. Até lá funciona o caminho "Assinar por fora".
3. **Teste no SNCR de treinamento:** entrar como médico no site com `?backend=firebase`, Perfil → Obter números pelo gov.br. O botão já chega ao login; o treinamento usa o gov.br de testes (sso.staging.acesso.gov.br), com conta própria criada na hora (passo a passo em docs/sncr/instrucoes.txt), não a conta gov.br de verdade. É o único trecho que os testes não alcançam.
4. **Legal (não é código; ver REGULATORIO.md):** empresa registrada no CRM da UF-sede, diretor técnico médico (preencher `responsavelTecnico` em config.js), avaliação de risco e governança da IA (Res. CFM 2.454/2026), parecer sobre software médico (RDC 657/2022), RIPD e contrato com o provedor de IA (LGPD).
5. **Cota de notificação:** cada médico pede números à Vigilância Sanitária de cada estado onde atende (P&R RDC 1.000, pergunta 54). Sem cota, Notificação A/B sai em talonário de papel.
6. **Preço e cobrança da consulta.**

## Venda a clínicas (CNPJs médicos): ainda não implementado
O código atende uma clínica só. Para vender: separar pedidos e médicos por clínica, rodapé e termo com os dados de cada uma, contrato em que a clínica é controladora e a MedTech é operadora (LGPD), cobrança por clínica ou por médico. O CNPJ enviado ao SNCR continua o da MedTech.
Registro no CRM com diretor técnico: a clínica, pelo serviço médico (Lei 14.510/2022, art. 3º; CFM 2.314/2022, art. 17); a MedTech, pela leitura da CFM 2.299/2021, art. 5º (plataforma de prescrição). Confirmar no CREMEC.

## Virada para produção (feita depois do item 3)
`config.js`: `ativo: true` e `sncr.ambiente: 'producao'`. `functions/.env.refilmed`: `SNCR_AMBIENTE=producao`. Publicar o site e as funções. Número de homologação não entra em receita de produção: o sistema recusa.

## Limites conhecidos
- **Vídeo sem TURN:** redes muito restritas (cerca de 10 a 15%) não conectam; a saída é o WhatsApp. Servidor TURN é serviço pago.
- **Cadeia do certificado:** o servidor confere integridade, CPF e "ICP-Brasil" no certificado do PDF anexado; a validação completa até a AC-Raiz é a do validar.iti.gov.br.
- **VIDaaS real nunca foi chamado do servidor em nuvem:** só com o simulador nos testes; o assinador pessoal comprova o protocolo a partir do Mac.
- **Numeração de 16 dígitos:** a Anvisa anunciou a mudança em 15/10/2026. O sistema trata o número como texto e soma só a parte final, mas o formato novo não foi visto em resposta real.
- **Assinatura X-Jws-Integradora com e-CNPJ:** opcional hoje na API. As instruções da Anvisa dizem que a validação da mantenedora vem "em breve"; pode exigir e-CNPJ.

## Testes
- `node tests/fluxos.test.cjs` (conversa, regras, documentos) e `node tests/sncr.test.cjs` (SNCR com fetch simulado).
- Com Java no PATH (`/opt/homebrew/opt/openjdk/bin`): `npx firebase-tools@13 emulators:exec --project demo-meuneuro --only firestore "node tests/regras.test.cjs"`.
- Ponta a ponta do servidor: gerar chaves de teste (ver cabeçalho de `tests/e2e-servidor.cjs`), criar `functions/.env.demo-meuneuro` e `functions/.secret.local`, e rodar `emulators:exec` com auth, firestore, functions e storage.
- Interface em modo real local: subir os emuladores e `tests/mock-externos.cjs`, abrir `http://localhost:<porta>/?emu=1`.
