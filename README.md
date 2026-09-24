# RefilMed

Plataforma de **renovação de receitas de uso contínuo** (qualquer especialidade) por telemedicina. O paciente conversa com um
assistente que adianta queixas, remédios, doses, posologia, tempo de uso, adesão e efeitos adversos,
checa sinais de alarme e, no fim, orienta sobre os efeitos de cada remédio e o seguimento. O pedido
chega ao médico com resumo clínico, alertas e a **receita pré-pronta**; o médico faz o
atendimento, revisa, assina com certificado ICP-Brasil e o paciente baixa a receita pelo código.

Marca, repositório e backend próprios.

## Rodar
Sem build, sem npm. Qualquer servidor estático:
```
python3 -m http.server 5231
```
Abra `http://localhost:5231`. Sem `config.js` preenchido o app roda em **modo local** (dados só no
navegador; paciente e médico no mesmo aparelho). Na área do médico, com a fila vazia, há o botão
"Criar 3 pedidos de exemplo".

## Arquivos
| Arquivo | Papel |
|---|---|
| `index.html`, `styles.css` | casca e estilos (fonte do sistema, uma cor de acento, Tabler Icons) |
| `core.js` | utilidades (`RF`) |
| `kb.js` | banco de 115 fármacos, **gerado** por `tools/build_kb.py` a partir de `kb-fontes/*.json` |
| `engine.js` | roteiro da conversa + interpretação de nome, dose e posologia em texto livre |
| `regras.js` | alertas ao médico, resumo clínico, rascunho da receita, orientações ao paciente |
| `receita.js` | documentos A4 (simples, controle especial), verificação de PDF assinado |
| `backend.js` | adaptadores `local` e `firebase` atrás da mesma interface (`?backend=firebase` força o modo real) |
| `sncr.js` | numeração oficial da Anvisa (login gov.br do médico, bloco de controle especial, notificações) |
| `paciente.js`, `medico.js`, `app.js` | telas |
| `demo.js` | pacientes fictícios (testes e exemplos) |
| `functions/` | servidor: IA, consulta por código, verificação, assinatura VIDaaS (PAdES), PDF com OIDs e QR do ITI, aprovação de papéis |
| `firestore.rules`, `storage.rules` | segurança do banco e dos PDFs assinados |
| `tools/definir_papel.py` | aprova médico/atendente/admin sem as funções |
| `publicar-servidor.command` | publica o servidor depois do plano Blaze |
| `docs/REGULATORIO.md` | regras legais verificadas (fonte, artigo, ano) |

## Testes
```
node tests/fluxos.test.cjs
node tests/assinatura.test.cjs <pasta com chave.pem e cert.pem de teste>
```

## Atualizar o banco de remédios
Edite/adicione JSON em `kb-fontes/` (mesmas chaves) e rode `python3 tools/build_kb.py`.
Depois de mudar qualquer arquivo publicado: `sh tools/bump.sh <n>` (evita cache velho).
