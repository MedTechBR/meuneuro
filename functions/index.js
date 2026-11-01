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
const { onCall, onRequest, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");
const { FieldValue } = require("firebase-admin/firestore");
admin.initializeApp(process.env.STORAGE_BUCKET ? { storageBucket: process.env.STORAGE_BUCKET } : {});
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
      t.set(ref, { [tipo]: atual + 1, em: FieldValue.serverTimestamp() }, { merge: true });
      return atual + 1;
    });
    if (n < 0) throw new HttpsError("resource-exhausted", "Limite diário atingido.");
  } catch (e) { if (e instanceof HttpsError) throw e; /* falha de infraestrutura não bloqueia */ }
}

// Regras fixas do assistente: Res. CFM 2.454/2026, art. 5º §2º (sem diagnóstico nem decisão terapêutica)
const SISTEMA_PACIENTE = "Você é o assistente automatizado do Meu Neuro, serviço brasileiro de renovação de receitas de remédios neurológicos de uso contínuo por telemedicina. " +
  "Responda em português do Brasil, em até 3 frases curtas, com linguagem simples. Você NÃO faz diagnóstico, NÃO sugere mudar dose, trocar, iniciar ou suspender remédio, " +
  "NÃO diz que a receita será renovada. Para qualquer decisão, diga que o médico vai avaliar no atendimento. Se a pergunta indicar urgência (crise que não para, fraqueza súbita, " +
  "fala enrolada, pior dor de cabeça da vida, pensamento suicida), oriente ligar 192 (SAMU) ou 188 (CVV) e procurar pronto-socorro.";
const SISTEMA_MEDICO = "Você é um assistente clínico que apoia médicos no Brasil. Português do Brasil, objetivo. Use apenas os dados recebidos; não invente. " +
  "Marque lacunas como [não informado]. O médico revisa tudo.";

/* ---------------- assistenteIA ---------------- */
exports.assistenteIA = onCall({ region: REGIAO, timeoutSeconds: 60, memory: "256MiB", invoker: "public" }, async req => {
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
    texto = await vertex(`Resumo estruturado da pré-consulta abaixo. Escreva uma síntese de até 8 linhas para o médico: problema e controle, esquema atual com dose diária, adesão, efeitos adversos, pontos que exigem decisão (sem prescrever). Não repita dados irrelevantes.\n\n${String(d.resumo).slice(0, 8000)}`, SISTEMA_MEDICO, false);
  } else throw new HttpsError("invalid-argument", "Tarefa desconhecida.");
  return { texto, modelo: MODELO };
});

/* ---------------- paciente consulta o pedido pelo código ---------------- */
const publicoAssinatura = a => a ? { em: a.em, tipo: a.tipo, provedor: a.provedor || "", verificacao: a.verificacao, documentos: (a.documentos || []).map(d => ({ id: d.id, tipo: d.tipo, rot: d.rot, numero: d.numero || "" })) } : null;
exports.consultarPedido = onCall({ region: REGIAO, invoker: "public" }, async req => {
  const codigo = String((req.data || {}).codigo || "").toUpperCase().replace(/\s/g, "");
  const nasc = String((req.data || {}).nasc || "");
  if (!/^(MN|RF)-[2-9A-Z]{6}$/.test(codigo) || !/^\d{4}-\d{2}-\d{2}$/.test(nasc)) return { erro: "nao_encontrado" };
  if (req.auth) await consumirCota(req.auth.uid, "consulta");
  const s = await db.collection("pedidos").where("codigo", "==", codigo).limit(1).get();
  if (s.empty) return { erro: "nao_encontrado" };
  const p = s.docs[0].data();
  if (!p.paciente || p.paciente.nasc !== nasc) return { erro: "nao_confere" };
  // devolve só o que a tela de acompanhamento usa
  const at = p.atendimento || {};
  return {
    pedido: {
      codigo: p.codigo, status: p.status, enviadoEm: p.enviadoEm, clinica: p.clinica || null, paciente: { nome: p.paciente.nome, nasc: p.paciente.nasc, sexo: p.paciente.sexo, cpf: p.paciente.cpf, endereco: p.paciente.endereco, bairro: p.paciente.bairro, cidade: p.paciente.cidade, uf: p.paciente.uf, responsavel: p.paciente.responsavel || "" },
      meds: p.meds, condicoes: p.condicoes, gestacao: p.gestacao,
      receitas: p.status === "assinado" ? p.receitas : null,
      atendimento: { iniciadoEm: at.iniciadoEm || null, concluidoEm: at.concluidoEm || null, medico: at.medico || null, orientacaoMedico: at.orientacaoMedico || "", motivoRecusa: at.motivoRecusa || "", sala: p.status === "em_atendimento" ? (at.sala || null) : null, assinatura: p.status === "assinado" ? publicoAssinatura(at.assinatura) : null }
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
  return { valida: p.status === "assinado", emitidaEm: a.assinatura.em, medico: { nome: a.medico.nome, crm: a.medico.crm, uf: a.medico.uf }, paciente: ini, hash: a.assinatura.hash || "", itens: (p.receitas || []).reduce((n, r) => n + r.itens.length, 0), tipoAssinatura: a.assinatura.tipo, documentos: (a.assinatura.documentos || []).map(d => ({ rot: d.rot, numero: d.numero || "" })) };
});

/* ---------------- emissão ----------------
   Dois caminhos que terminam iguais (documentos no Storage, pedido "assinado", imutável pelas regras):
   - VIDaaS: vidaasIniciar → (médico aprova no celular) → vidaasStatus → assinarReceita.
   - PDF assinado por fora: o navegador gera os PDFs, o médico assina no assinador dele e anexa em emitirComAnexos.
   A sessão do VIDaaS fica em sessoesAssinatura/{uid}, coleção que só o servidor lê (regras fecham tudo). */
const crypto = require("crypto");
const vidaas = require("./vidaas");
const { gerarDocumento, blocosEmitidos, ROTULO } = require("./pdf");
const { assinarPDF, conferirAssinatura } = require("./pades");
const BASE_FUNCOES = () => `https://${REGIAO}-${PROJECT}.cloudfunctions.net`;
const SITE = process.env.SITE_URL || "https://medtechbr.com.br/meuneuro/";
const AMBIENTE_SNCR = process.env.SNCR_AMBIENTE === "producao" ? "producao" : "homologacao";
const COM_NUMERO = new Set(["controle_especial", "notificacao_a", "notificacao_b", "notificacao_b2", "retencao"]);
const vidaasSegredo = defineSecret("VIDAAS_CLIENT_SECRET");

async function exigirMedico(req) {
  if (!req.auth || req.auth.token.medico !== true) throw new HttpsError("permission-denied", "Somente médicos.");
  if (typeof req.auth.token.clinica !== "string") throw new HttpsError("permission-denied", "Sua conta ainda não está ligada a uma clínica.");
  const s = await db.collection("medicos").doc(req.auth.uid).get();
  if (!s.exists) throw new HttpsError("failed-precondition", "Complete seu perfil de prescritor.");
  return s.data();
}
function resumoMedico(med) { return { nome: med.nome, crm: med.crm, uf: med.uf, rqe: med.rqe || "", especialidade: med.especialidade || "", endereco: med.endereco, cidade: med.cidade, ufEnd: med.ufEnd, telefone: med.telefone, nomeLocal: med.nomeLocal || "", cnpjLocal: med.cnpjLocal || "" }; }
function idadeDe(nasc) { const d = new Date(nasc), h = new Date(); let i = h.getFullYear() - d.getFullYear(); if (h < new Date(h.getFullYear(), d.getMonth(), d.getDate())) i--; return isFinite(i) ? i : null; }

// lê o pedido e confere tudo que a emissão exige, antes de gastar assinatura
async function pedidoEmissivel(pedidoId, req) {
  const ref = db.collection("pedidos").doc(String(pedidoId || ""));
  const p = (await ref.get()).data();
  if (!p || p.clinicaId !== req.auth.token.clinica) throw new HttpsError("not-found", "Pedido não encontrado.");
  if (p.status !== "em_atendimento") throw new HttpsError("failed-precondition", "O pedido não está em atendimento.");
  const docs = blocosEmitidos(p);
  if (!docs.length) throw new HttpsError("failed-precondition", "A receita está vazia.");
  for (const { b } of docs) {
    if (COM_NUMERO.has(b.tipo) && !b.numeroSNCR) throw new HttpsError("failed-precondition", `${ROTULO[b.tipo]} sem numeração do SNCR: obtenha os números no perfil ou marque para sair em papel.`);
    if (AMBIENTE_SNCR === "producao" && b.numeroSNCR && b.ambienteSNCR !== "producao") throw new HttpsError("failed-precondition", "Este pedido usa numeração de homologação. Refaça a reserva com números de produção.");
    if (["controle_especial", "notificacao_a", "notificacao_b", "notificacao_b2"].includes(b.tipo) && !p.paciente.endereco) throw new HttpsError("failed-precondition", "Falta o endereço do paciente, obrigatório neste receituário.");
  }
  return { ref, p, docs };
}
// a identificação usada no PDF sai da preparação gravada pelo médico (caminho do anexo) ou é criada aqui
function preparo(p) {
  const pr = (p.atendimento && p.atendimento.preparo) || {};
  const segredo = pr.segredo || crypto.randomBytes(18).toString("base64url");
  const em = pr.em || new Date().toISOString();
  const verificacao = pr.verificacao || crypto.randomBytes(5).toString("hex").toUpperCase();
  return { segredo, em, verificacao };
}
function opcoesDoc(b, p, pr) {
  const semQRiti = ["controle_especial", "notificacao_a", "notificacao_b", "notificacao_b2"].includes(b.tipo);
  return {
    emitidoEm: pr.em, verificacao: pr.verificacao, urlVerificar: SITE.replace(/^https?:\/\//, "") + "#/verificar/" + pr.verificacao,
    urlQR: semQRiti ? null : `${BASE_FUNCOES()}/receitaITI?_format=application/validador-iti+json&_secretCode=${pr.segredo}`,
    idade: idadeDe(p.paciente.nasc), ambienteSNCR: b.ambienteSNCR || AMBIENTE_SNCR, marca: b.numeroSNCR && b.ambienteSNCR !== "producao" ? "HOMOLOGACAO - SEM VALIDADE" : ""
  };
}
async function finalizar(ref, p, med, pr, documentos, provedor, por) {
  const medico = resumoMedico(med);
  const at = Object.assign({}, p.atendimento || {}, {
    medico, concluidoEm: pr.em,
    assinatura: { em: pr.em, tipo: "icp", provedor, verificacao: pr.verificacao, segredo: pr.segredo, documentos, hash: documentos[0].hash }
  });
  delete at.preparo; delete at.sala;
  await ref.update({ status: "assinado", atendimento: at, atualizadoEm: pr.em, historico: FieldValue.arrayUnion({ em: pr.em, evento: `Receita assinada (ICP-Brasil, ${por}) e emitida: ${documentos.map(d => d.rot + (d.numero ? " " + d.numero : "")).join("; ")}`, por: medico.nome }) });
  return { ok: true, verificacao: pr.verificacao };
}
async function guardar(pedidoId, verificacao, id, bytes) {
  const arquivo = `receitas/${pedidoId}/${verificacao}-${id}.pdf`;
  await admin.storage().bucket().file(arquivo).save(Buffer.from(bytes), { contentType: "application/pdf", resumable: false });
  return { arquivo, hash: crypto.createHash("sha256").update(bytes).digest("hex") };
}

exports.vidaasIniciar = onCall({ region: REGIAO, invoker: "public", secrets: [vidaasSegredo] }, async req => {
  const med = await exigirMedico(req);
  if (!med.cpf) throw new HttpsError("failed-precondition", "Informe seu CPF no perfil para usar o VIDaaS.");
  if (!process.env.VIDAAS_CLIENT_ID) throw new HttpsError("failed-precondition", "VIDaaS ainda não habilitado: falta o cadastro da aplicação na Valid. Use o PDF assinado por fora.");
  const { code, verifier } = await vidaas.autorizar(med.cpf, 3600);
  await db.collection("sessoesAssinatura").doc(req.auth.uid).set({ code, verifier, pedidoEm: Date.now(), token: null, expiraEm: 0 });
  return { aguardando: true };
});

exports.vidaasStatus = onCall({ region: REGIAO, invoker: "public", secrets: [vidaasSegredo] }, async req => {
  await exigirMedico(req);
  const ref = db.collection("sessoesAssinatura").doc(req.auth.uid);
  const s = await ref.get();
  if (!s.exists) return { autorizado: false, iniciado: false };
  const d = s.data();
  if (d.token && d.expiraEm > Date.now()) return { autorizado: true };
  if (!d.code || Date.now() - d.pedidoEm > 6 * 60 * 1000) return { autorizado: false, expirado: !!d.code };
  const aut = await vidaas.consultarAprovacao(d.code);
  if (!aut) return { autorizado: false };
  const t = await vidaas.trocarToken(aut, d.verifier);
  await ref.set({ token: t.token, expiraEm: t.expiraEm, code: null, verifier: null }, { merge: true });
  return { autorizado: true };
});

exports.assinarReceita = onCall({ region: REGIAO, invoker: "public", timeoutSeconds: 180, memory: "512MiB", secrets: [vidaasSegredo] }, async req => {
  const med = await exigirMedico(req);
  const pedidoId = String((req.data || {}).pedidoId || "");
  const sess = (await db.collection("sessoesAssinatura").doc(req.auth.uid).get()).data() || {};
  if (!sess.token || sess.expiraEm < Date.now()) throw new HttpsError("failed-precondition", "Autorize a assinatura no app VIDaaS primeiro.");
  const { ref, p, docs } = await pedidoEmissivel(pedidoId, req);
  const pr = preparo(p), medico = resumoMedico(med);
  const certs = await vidaas.certificados(sess.token);
  const alvo = certs[0];
  const documentos = [];
  for (const { b, id } of docs) {
    const pdf = await gerarDocumento(b, p, medico, opcoesDoc(b, p, pr));
    const assinado = await assinarPDF(pdf, {
      certs: [alvo.certificate], nome: medico.nome, local: [medico.cidade, medico.ufEnd].filter(Boolean).join("/"),
      assinarHash: hash => vidaas.assinarHash(sess.token, alvo.alias, hash)
    });
    const g = await guardar(pedidoId, pr.verificacao, id, assinado);
    documentos.push({ id, tipo: b.tipo, rot: ROTULO[b.tipo], numero: b.numeroSNCR || "", arquivo: g.arquivo, hash: g.hash });
  }
  return finalizar(ref, p, med, pr, documentos, "vidaas", "VIDaaS");
});

// caminho sem VIDaaS: { pedidoId, documentos: [{ id, pdfBase64 }] }, um PDF assinado para cada documento do pedido
exports.emitirComAnexos = onCall({ region: REGIAO, invoker: "public", timeoutSeconds: 120, memory: "512MiB" }, async req => {
  const med = await exigirMedico(req);
  const d = req.data || {};
  const { ref, p, docs } = await pedidoEmissivel(d.pedidoId, req);
  const recebidos = new Map((d.documentos || []).map(x => [String(x.id), x.pdfBase64]));
  const cpfMed = String(med.cpf || "").replace(/\D/g, "");
  if (cpfMed.length !== 11) throw new HttpsError("failed-precondition", "Informe seu CPF no perfil: ele é conferido com o certificado da assinatura.");
  const pr = preparo(p);
  if (!(p.atendimento && p.atendimento.preparo)) throw new HttpsError("failed-precondition", "Gere os PDFs pelo sistema antes de anexar.");
  const documentos = [];
  for (const { b, id } of docs) {
    const b64 = recebidos.get(id);
    if (!b64) throw new HttpsError("invalid-argument", `Falta o PDF assinado de: ${ROTULO[b.tipo]}.`);
    const buf = Buffer.from(String(b64), "base64");
    if (buf.length > 3 * 1024 * 1024) throw new HttpsError("invalid-argument", "PDF acima de 3 MB.");
    const c = conferirAssinatura(buf);
    if (!c.ok) throw new HttpsError("failed-precondition", `${ROTULO[b.tipo]}: ${c.motivo}`);
    if (!c.icp) throw new HttpsError("failed-precondition", `${ROTULO[b.tipo]}: o certificado não é ICP-Brasil.`);
    if (c.cpf !== cpfMed) throw new HttpsError("failed-precondition", `${ROTULO[b.tipo]}: o certificado não é do CPF do seu perfil.`);
    const g = await guardar(p.id || d.pedidoId, pr.verificacao, id, buf);
    documentos.push({ id, tipo: b.tipo, rot: ROTULO[b.tipo], numero: b.numeroSNCR || "", arquivo: g.arquivo, hash: g.hash });
  }
  return finalizar(ref, p, med, pr, documentos, "anexo", "PDF anexado");
});

// PDF assinado: médico, ou paciente com código + nascimento. Vai pela própria função (sem URL assinada, que exigiria permissão extra de IAM).
exports.baixarReceita = onCall({ region: REGIAO, invoker: "public", memory: "512MiB" }, async req => {
  const d = req.data || {};
  let p = null;
  if (d.pedidoId && req.auth && req.auth.token.medico === true) {
    p = (await db.collection("pedidos").doc(String(d.pedidoId)).get()).data();
    if (p && p.clinicaId !== req.auth.token.clinica) p = null;
  } else if (d.codigo) {
    const s = await db.collection("pedidos").where("codigo", "==", String(d.codigo).toUpperCase()).limit(1).get();
    if (!s.empty && s.docs[0].data().paciente.nasc === d.nasc) p = s.docs[0].data();
  }
  const docs = (p && p.status === "assinado" && p.atendimento.assinatura.documentos) || [];
  const alvo = docs.find(x => x.id === d.docId) || docs[0];
  if (!alvo) throw new HttpsError("not-found", "Receita assinada não encontrada.");
  const [bytes] = await admin.storage().bucket().file(alvo.arquivo).download();
  return { base64: bytes.toString("base64"), nome: `${p.codigo}-${alvo.tipo.replace(/_/g, "-")}-${alvo.id}.pdf` };
});

// QR code no padrão do ITI (receita simples e retenção): o validar.iti.gov.br chama esta URL e baixa os PDFs
async function pedidoPorSegredo(segredo) {
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(segredo)) return null;
  const s = await db.collection("pedidos").where("atendimento.assinatura.segredo", "==", segredo).limit(1).get();
  return s.empty || s.docs[0].data().status !== "assinado" ? null : s.docs[0].data();
}
const comQRiti = d => d.tipo === "simples" || d.tipo === "retencao";
exports.receitaITI = onRequest({ region: REGIAO, cors: true, invoker: "public" }, async (req, res) => {
  const segredo = String(req.query._secretCode || "");
  const p = await pedidoPorSegredo(segredo);
  if (!p) { res.status(404).json({ erro: "não encontrado" }); return; }
  const signatureFiles = p.atendimento.assinatura.documentos.filter(comQRiti).map(d => ({ url: `${BASE_FUNCOES()}/receitaArquivo?_secretCode=${segredo}&doc=${d.id}` }));
  res.set("Cache-Control", "no-store").json({ version: "1.0.0", prescription: { signatureFiles } });
});
exports.receitaArquivo = onRequest({ region: REGIAO, cors: true, invoker: "public", memory: "512MiB" }, async (req, res) => {
  const p = await pedidoPorSegredo(String(req.query._secretCode || ""));
  const d = p && p.atendimento.assinatura.documentos.filter(comQRiti).find(x => x.id === String(req.query.doc || ""));
  if (!d) { res.status(404).json({ erro: "não encontrado" }); return; }
  const [bytes] = await admin.storage().bucket().file(d.arquivo).download();
  res.set("Cache-Control", "no-store").type("application/pdf").send(bytes);
});

/* ---------------- atendente: só contato, sem dados clínicos ---------------- */
const exigirAtendente = req => { if (!req.auth || req.auth.token.atendente !== true || typeof req.auth.token.clinica !== "string") throw new HttpsError("permission-denied", "Somente atendentes."); };
exports.atendenteFila = onCall({ region: REGIAO, invoker: "public" }, async req => {
  exigirAtendente(req);
  const s = await db.collection("pedidos").where("clinicaId", "==", req.auth.token.clinica).orderBy("atualizadoEm", "desc").limit(300).get();
  return s.docs.map(x => x.data()).filter(p => p.status !== "rascunho").map(p => ({
    id: p.id, codigo: p.codigo, status: p.status, enviadoEm: p.enviadoEm, atualizadoEm: p.atualizadoEm, especialidades: [], meds: [], alertas: [], condicoes: [],
    paciente: { nome: p.paciente.nome, telefone: p.paciente.telefone, email: p.paciente.email || "", nasc: p.paciente.nasc, responsavel: p.paciente.responsavel || "" },
    historico: (p.historico || []).filter(h => /^(Contato|Pedido|Atendimento iniciado)/.test(h.evento || "")), atendimento: { sala: (p.atendimento || {}).sala || null }
  }));
});
exports.atendenteRegistrar = onCall({ region: REGIAO, invoker: "public" }, async req => {
  exigirAtendente(req);
  const d = req.data || {};
  const evento = String(d.evento || "").slice(0, 400);
  if (!evento) throw new HttpsError("invalid-argument", "Evento vazio.");
  const ref = db.collection("pedidos").doc(String(d.pedidoId || ""));
  const p = (await ref.get()).data();
  if (!p || p.clinicaId !== req.auth.token.clinica) throw new HttpsError("not-found", "Pedido não encontrado.");
  await ref.update({ historico: FieldValue.arrayUnion({ em: new Date().toISOString(), evento: "Contato: " + evento.replace(/^Contato:\s*/, ""), por: req.auth.token.name || req.auth.token.email || "Atendente" }) });
  return { ok: true };
});

/* ---------------- prontidão (tela de administração) ---------------- */
exports.saude = onCall({ region: REGIAO, invoker: "public" }, async req => {
  if (!ehAdmin(req)) throw new HttpsError("permission-denied", "Somente o administrador.");
  return { servidor: true, vidaas: !!process.env.VIDAAS_CLIENT_ID, sncrAmbiente: AMBIENTE_SNCR, site: SITE };
});

/* ---------------- administração: papéis (medico, atendente, admin) ----------------
   Quem pode: e-mail em ADMIN_EMAILS (variável da função) ou conta com a permissão admin. */
function ehAdmin(req) {
  const email = req.auth && req.auth.token.email && req.auth.token.email.toLowerCase();
  return !!req.auth && (req.auth.token.admin === true || (email && ADMIN_EMAILS.includes(email) && req.auth.token.email_verified));
}
// endereço público do médico: #/m/<slug>
function paraSlug(t) { return String(t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\b(dra?|prof[a]?)\.?\s+/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40); }
async function criarLink(uid, clinicaId, perfil, email) {
  const base = paraSlug(perfil.nome) || paraSlug(String(email).split("@")[0]) || "medico";
  for (let i = 0; i < 20; i++) {
    const slug = i ? `${base}-${i + 1}` : base;
    const r = db.collection("links").doc(slug);
    try { await r.create({ medicoUid: uid, clinicaId, medicoNome: perfil.nome || "", crm: perfil.crm || "", uf: perfil.uf || "", rqe: perfil.rqe || "", especialidade: perfil.especialidade || "", criadoEm: new Date().toISOString() }); return slug; }
    catch (e) { if (e.code !== 6) throw e; } // 6 = já existe
  }
  throw new HttpsError("internal", "Não consegui criar o link do médico.");
}
exports.definirPapel = onCall({ region: REGIAO, invoker: "public" }, async req => {
  if (!ehAdmin(req)) throw new HttpsError("permission-denied", "Somente o administrador.");
  const d = req.data || {};
  const papel = String(d.papel || "medico");
  if (!["medico", "atendente", "admin"].includes(papel)) throw new HttpsError("invalid-argument", "Papel inválido.");
  const u = d.uid ? await admin.auth().getUser(String(d.uid)) : await admin.auth().getUserByEmail(String(d.email || "").toLowerCase().trim());
  const ativo = d.ativo !== false;
  const claims = Object.assign({}, u.customClaims, { [papel]: ativo });
  const ref = db.collection("medicos").doc(u.uid);
  if (papel === "admin" || !ativo) {
    await admin.auth().setCustomUserClaims(u.uid, claims);
    if (papel !== "admin") await ref.set({ aprovado: false }, { merge: true });
    return { ok: true, uid: u.uid, claims };
  }
  // médico e atendente pertencem a uma clínica: é o que separa os dados de cada cliente
  const clinicaId = String(d.clinicaId || "");
  const cl = clinicaId ? await db.collection("clinicas").doc(clinicaId).get() : null;
  if (!cl || !cl.exists) throw new HttpsError("invalid-argument", "Escolha a clínica.");
  claims.clinica = clinicaId;
  await admin.auth().setCustomUserClaims(u.uid, claims);
  const perfil = (await ref.get()).data() || {};
  const novo = { aprovado: true, aprovadoEm: new Date().toISOString(), clinicaId };
  let linkSlug = perfil.linkSlug || null;
  if (papel === "medico") {
    if (!perfil.nomeLocal) novo.nomeLocal = cl.data().nome;
    if (!perfil.cnpjLocal && cl.data().cnpj) novo.cnpjLocal = cl.data().cnpj;
    if (!linkSlug) { linkSlug = await criarLink(u.uid, clinicaId, perfil, u.email); novo.linkSlug = linkSlug; }
  }
  await ref.set(novo, { merge: true });
  return { ok: true, uid: u.uid, claims, linkSlug };
});
// compatibilidade com o nome antigo
exports.definirMedico = exports.definirPapel;
