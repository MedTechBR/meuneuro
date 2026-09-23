# Meu Neuro

Plataforma de **renovação de receita neurológica** por telemedicina. O paciente conversa com um
assistente que adianta queixas, remédios, doses, posologia, tempo de uso, adesão e efeitos adversos,
checa sinais de alarme e, no fim, orienta sobre os efeitos de cada remédio e o seguimento. O pedido
chega ao neurologista com resumo clínico, alertas e a **receita pré-pronta**; o médico faz o
atendimento, revisa, assina com certificado ICP-Brasil e o paciente baixa a receita pelo código.

Produto separado do MedTech: marca, repositório e backend próprios (mesmo modelo do Clinicar).

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
| `core.js` | utilidades (`MN`) |
| `kb.js` | banco de 45 fármacos, **gerado** por `tools/build_kb.py` a partir de `kb-fontes/*.json` |
| `engine.js` | roteiro da conversa + interpretação de nome, dose e posologia em texto livre |
| `regras.js` | alertas ao médico, resumo clínico, rascunho da receita, orientações ao paciente |
| `receita.js` | documentos A4 (simples, controle especial), verificação de PDF assinado |
| `backend.js` | adaptadores `local` e `firebase` atrás da mesma interface |
| `paciente.js`, `medico.js`, `app.js` | telas |
| `demo.js` | pacientes fictícios (testes e exemplos) |
| `functions/`, `firestore.rules` | backend Firebase próprio (IA Vertex sem chave, consulta por código, verificação) |
| `docs/REGULATORIO.md` | regras legais verificadas (fonte, artigo, ano) |

## Testes
```
node tests/fluxos.test.cjs
```

## Atualizar o banco de remédios
Edite/adicione JSON em `kb-fontes/` (mesmas chaves) e rode `python3 tools/build_kb.py`.
Depois de mudar qualquer arquivo publicado: `sh tools/bump.sh <n>` (evita cache velho).
