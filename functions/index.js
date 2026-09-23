/* ============================================================================
   Meu Neuro — functions/index.js (projeto Firebase PRÓPRIO do Meu Neuro)
   IA via Vertex AI SEM chave de API (conta de serviço do projeto), consulta do pedido
   pelo paciente, verificação pública de receita e gestão da permissão de médico.

   Publicar (feito pelo dono do projeto; ver docs/FIREBASE.md):
     1. Plano Blaze + "Vertex AI API" habilitada no Google Cloud do projeto.
     2. firebase use <id> && firebase deploy --only functions,firestore:rules
     3. Colar a configuração web em config.js.
     4. Definir ADMIN_EMAILS (variável de ambiente da função) com o e-mail do administrador.
   ============================================================================ */
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
admin.initializeApp();
const db = admin.firestore();

const REGIAO = "southamerica-east1";
const PROJECT = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || "";
const LOCATION = process.env.VERTEX_LOCATION || "global";
const MODELO = "gemini-2.5-flash";
const TETO_DIA = 120;              // chamadas de IA por usuário por dia (anônimo incluso)
const ADMIN_EMAILS = String(process.env.ADMIN_EMAILS || "").split(",").map(s => s.trim().toLowerCase()).filter(Boolean);

/* ---------------- Vertex ---------------- */
async function tokenServico() {
  const r = await fetch("http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token", { headers: { "Metadata-Flavor": "Google" } });
  if (!r.ok) throw new Error("Sem token da conta de serviço.");
  return (await r.json()).access_token;
}
async function vertex(prompt, sistema, json) {
  const url = `https://aiplatform.googleapis.com/v1/projects/${PROJECT}/locations/${LOCATION}/publishers/google/models/${MODELO}:generateContent`;
  const corpo = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    systemInstruction: { parts: [{ text: sistema }] },
    generationConfig: Object.assign({ temperature: 0.2, maxOutputTokens: 4096 }, json ? { responseMimeType: "application/json" } : {})
  };
  const r = await fetch(url, { method: "POST", headers: { Authorization: "Bearer " + await tokenServico(), "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
  if (!r.ok) throw new HttpsError("internal", "Falha na IA (" + r.status + ").");
  const d = await r.json();
  const c = d.candidates && d.candidates[0];
  if (json && c && c.finishReason === "MAX_TOKENS") throw new HttpsError("internal", "Resposta da IA incompleta.");
  return ((c && c.content && c.content.parts) || []).map(p => p.text || "").join("").trim();
}

async function consumirCota(uid, tipo) {
  const dia = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const ref = db.collection("uso").doc(uid + "_" + dia);
  try {
    const n = await db.runTransaction(async t => {
      const s = await t.get(ref);
      const atual = (s.exists && s.data()[tipo]) || 0;
      if (atual >= TETO_DIA) return -1;
      t.set(ref, { [tipo]: atual + 1, em: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
      return atual + 1;
    });
    if (n < 0) throw new HttpsError("resource-exhausted", "Limite diário atingido.");
  } catch (e) { if (e instanceof HttpsError) throw e; /* falha de infraestrutura não bloqueia */ }
}

// Regras fixas do assistente: Res. CFM 2.454/2026, art. 5º §2º (sem diagnóstico nem decisão terapêutica)
const SISTEMA_PACIENTE = "Você é o assistente automatizado do Meu Neuro, serviço brasileiro de renovação de receitas neurológicas por telemedicina. " +
  "Responda em português do Brasil, em até 3 frases curtas, com linguagem simples. Você NÃO faz diagnóstico, NÃO sugere mudar dose, trocar, iniciar ou suspender remédio, " +
  "NÃO diz que a receita será renovada. Para qualquer decisão, diga que o médico vai avaliar no atendimento. Se a pergunta indicar urgência (crise que não para, fraqueza súbita, " +
  "fala enrolada, pior dor de cabeça da vida, pensamento suicida), oriente ligar 192 (SAMU) ou 188 (CVV) e procurar pronto-socorro.";
const SISTEMA_MEDICO = "Você é um assistente clínico que apoia neurologistas no Brasil. Português do Brasil, objetivo. Use apenas os dados recebidos; não invente. " +
  "Marque lacunas como [não informado]. O médico revisa tudo.";

/* ---------------- neuroIA ---------------- */
exports.neuroIA = onCall({ region: REGIAO, timeoutSeconds: 60, memory: "256MiB", invoker: "public" }, async req => {
  if (!req.auth) throw new HttpsError("unauthenticated", "Entre para continuar.");
  const { tarefa, dados } = req.data || {};
  const d = dados || {};
  const tam = JSON.stringify(d).length;
  if (tam > 12000) throw new HttpsError("invalid-argument", "Dados muito longos.");
  await consumirCota(req.auth.uid, "ia");
  let texto;
  if (tarefa === "duvida") {
    texto = await vertex(`Pergunta do paciente: "${String(d.pergunta).slice(0, 600)}"\nRemédios informados: ${(d.meds || []).join(", ") || "nenhum ainda"}.`, SISTEMA_PACIENTE, false);
  } else if (tarefa === "identificar_remedio") {
    const lista = (d.lista || []).slice(0, 200).join(", ");
    texto = await vertex(`O paciente escreveu o nome de um remédio: "${String(d.texto).slice(0, 200)}". Qual destes ids corresponde (considere nomes comerciais brasileiros e erros de digitação)? Ids: ${lista}. Responda JSON {"id": "<id ou nenhum>"}.`, SISTEMA_MEDICO, true);
    try { texto = JSON.parse(texto).id; } catch (e) { texto = "nenhum"; }
  } else if (tarefa === "posologia") {
    texto = await vertex(`Converta a posologia escrita pelo paciente em JSON com as chaves exatamente estas: tomadas (lista de {p: "manha"|"meiodia"|"tarde"|"noite", q: número}), vezesDia, qtdPorTomada, unidadesDia (unidades por dia), intervaloH, sos (true se só quando necessário). Use null quando não souber. Remédio: ${String(d.remedio).slice(0, 80)} ${String(d.dose || "").slice(0, 30)}. Texto: "${String(d.texto).slice(0, 300)}"`, SISTEMA_MEDICO, true);
  } else if (tarefa === "resumo") {
    texto = await vertex(`Resumo estruturado da pré-consulta abaixo. Escreva uma síntese de até 8 linhas para o neurologista: problema e controle, esquema atual com dose diária, adesão, efeitos adversos, pontos que exigem decisão (sem prescrever). Não repita dados irrelevantes.\n\n${String(d.resumo).slice(0, 8000)}`, SISTEMA_MEDICO, false);
  } else throw new HttpsError("invalid-argument", "Tarefa desconhecida.");
  return { texto, modelo: MODELO };
});

/* ---------------- paciente consulta o pedido pelo código ---------------- */
exports.consultarPedido = onCall({ region: REGIAO, invoker: "public" }, async req => {
  const codigo = String((req.data || {}).codigo || "").toUpperCase().replace(/\s/g, "");
  const nasc = String((req.data || {}).nasc || "");
  if (!/^MN-[2-9A-Z]{6}$/.test(codigo) || !/^\d{4}-\d{2}-\d{2}$/.test(nasc)) return { erro: "nao_encontrado" };
  if (req.auth) await consumirCota(req.auth.uid, "consulta");
  const s = await db.collection("pedidos").where("codigo", "==", codigo).limit(1).get();
  if (s.empty) return { erro: "nao_encontrado" };
  const p = s.docs[0].data();
  if (!p.paciente || p.paciente.nasc !== nasc) return { erro: "nao_confere" };
  // devolve só o que a tela de acompanhamento usa
  const at = p.atendimento || {};
  return {
    pedido: {
      codigo: p.codigo, status: p.status, enviadoEm: p.enviadoEm, paciente: { nome: p.paciente.nome, nasc: p.paciente.nasc, sexo: p.paciente.sexo, cpf: p.paciente.cpf, endereco: p.paciente.endereco, bairro: p.paciente.bairro, cidade: p.paciente.cidade, uf: p.paciente.uf, responsavel: p.paciente.responsavel || "" },
      meds: p.meds, condicoes: p.condicoes, gestacao: p.gestacao,
      receitas: p.status === "assinado" ? p.receitas : null,
      atendimento: { iniciadoEm: at.iniciadoEm || null, concluidoEm: at.concluidoEm || null, medico: at.medico || null, orientacaoMedico: at.orientacaoMedico || "", motivoRecusa: at.motivoRecusa || "", assinatura: p.status === "assinado" ? at.assinatura : null }
    }
  };
});

/* ---------------- verificação pública de receita ---------------- */
exports.verificarReceita = onCall({ region: REGIAO, invoker: "public" }, async req => {
  const c = String((req.data || {}).codigo || "").toUpperCase().trim();
  if (!/^[0-9A-F]{10}$/.test(c)) return null;
  const s = await db.collection("pedidos").where("atendimento.assinatura.verificacao", "==", c).limit(1).get();
  if (s.empty) return null;
  const p = s.docs[0].data(), a = p.atendimento;
  const ini = String(p.paciente.nome || "").split(/\s+/).filter(Boolean).map(x => x[0].toUpperCase() + ".").join(" ");
  return { valida: p.status === "assinado", emitidaEm: a.assinatura.em, medico: { nome: a.medico.nome, crm: a.medico.crm, uf: a.medico.uf }, paciente: ini, hash: a.assinatura.hash, itens: (p.receitas || []).reduce((n, r) => n + r.itens.length, 0), tipoAssinatura: a.assinatura.tipo };
});

/* ---------------- administração: dar/tirar permissão de médico ---------------- */
exports.definirMedico = onCall({ region: REGIAO, invoker: "public" }, async req => {
  const quem = req.auth && req.auth.token.email && req.auth.token.email.toLowerCase();
  if (!quem || !ADMIN_EMAILS.includes(quem) || !req.auth.token.email_verified) throw new HttpsError("permission-denied", "Somente o administrador.");
  const email = String((req.data || {}).email || "").toLowerCase().trim();
  const ativo = (req.data || {}).ativo !== false;
  const u = await admin.auth().getUserByEmail(email);
  await admin.auth().setCustomUserClaims(u.uid, Object.assign({}, u.customClaims, { medico: ativo }));
  return { ok: true, uid: u.uid, medico: ativo };
});
