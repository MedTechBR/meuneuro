// Ponta a ponta do servidor nos emuladores, com um VIDaaS simulado que assina com chave de teste.
// Uso: PASTA_CHAVES=<pasta com chave.pem,cert.pem,chave2.pem,cert2.pem> npx firebase-tools emulators:exec --project demo-meuneuro --only auth,firestore,functions,storage "node tests/e2e-servidor.cjs"
const assert = require('assert'), http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const raiz = path.join(__dirname, '..'), fns = path.join(raiz, 'functions');
for (const f of ['core', 'kb', 'engine', 'regras', 'receita', 'demo']) require(path.join(raiz, f + '.js'));
const admin = require(path.join(fns, 'node_modules/firebase-admin'));
const { gerarDocumento, blocosEmitidos } = require(path.join(fns, 'pdf.js'));
const { assinarPDF, digestInfo, conferirAssinatura } = require(path.join(fns, 'pades.js'));
const P = process.env.PASTA_CHAVES;
const ler = n => fs.readFileSync(path.join(P, n));
const PROJ = 'demo-meuneuro';
admin.initializeApp({ projectId: PROJ, storageBucket: PROJ + '.appspot.com' });
const db = admin.firestore();

/* ---------- VIDaaS simulado ---------- */
const reqs = [];
let aprovado = false;
const srv = http.createServer(async (rq, rs) => {
  const u = new URL(rq.url, 'http://x'); let b = '';
  for await (const c of rq) b += c;
  reqs.push({ path: u.pathname, q: Object.fromEntries(u.searchParams), body: b });
  const j = (o, s = 200) => { rs.writeHead(s, { 'Content-Type': 'application/json' }); rs.end(JSON.stringify(o)); };
  if (u.pathname === '/v0/oauth/authorize') return j({ code: 'cod1' });
  if (u.pathname.endsWith('/authentications')) return aprovado ? j({ authorizationToken: 'autz' }) : (rs.writeHead(200), rs.end(''));
  if (u.pathname === '/v0/oauth/token') {
    const f = new URLSearchParams(b);
    const az = reqs.find(r => r.path === '/v0/oauth/authorize');
    const desafio = crypto.createHash('sha256').update(f.get('code_verifier') || '').digest('base64url');
    if (f.get('client_secret') !== 'segredo-teste' || desafio !== az.q.code_challenge) return j({ erro: 'pkce/segredo' }, 400);
    return j({ access_token: 'tok', expires_in: 3600 });
  }
  if (u.pathname === '/v0/oauth/certificate-discovery') return j({ certificates: [{ alias: 'a1', certificate: ler('cert.pem').toString() }] });
  if (u.pathname === '/v0/oauth/signature') {
    const h = JSON.parse(b).hashes[0];
    const raw = crypto.privateEncrypt({ key: ler('chave.pem'), padding: crypto.constants.RSA_PKCS1_PADDING }, digestInfo(Buffer.from(h.hash, 'base64')));
    return j({ signatures: [{ raw_signature: raw.toString('base64') }] });
  }
  j({}, 404);
});

/* ---------- utilidades ---------- */
const AUTH = 'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1';
async function usuario(email, claims) {
  const u = await admin.auth().createUser({ email, password: 'senha-teste-123', emailVerified: true });
  await admin.auth().setCustomUserClaims(u.uid, claims);
  const r = await (await fetch(`${AUTH}/accounts:signInWithPassword?key=x`, { method: 'POST', body: JSON.stringify({ email, password: 'senha-teste-123', returnSecureToken: true }), headers: { 'Content-Type': 'application/json' } })).json();
  return { uid: u.uid, token: r.idToken };
}
async function fn(nome, dados, token) {
  const r = await fetch(`http://127.0.0.1:5055/${PROJ}/southamerica-east1/${nome}`, { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, token ? { Authorization: 'Bearer ' + token } : {}), body: JSON.stringify({ data: dados || {} }) });
  const j = await r.json().catch(() => ({}));
  if (j.error) { const e = new Error(j.error.message); e.status = j.error.status; throw e; }
  return j.result;
}
const recusa = async (pr, re) => { let m = null; try { await pr; } catch (e) { m = e.message; } assert.ok(m, 'devia recusar'); if (re) assert.ok(re.test(m), m); return m; };
const MED = { nome: 'Dra. Teste Neuro', crm: '12345', uf: 'CE', rqe: '99', especialidade: 'Neurologia', endereco: 'Rua A, 1', cidade: 'Fortaleza', ufEnd: 'CE', telefone: '(85) 3000-0000', cpf: '529.982.247-25', nomeLocal: 'Clínica X', cnpjLocal: '11.222.333/0001-81' };
let ok = 0;
const t = async (n, f) => { try { await f(); ok++; console.log('ok  ', n); } catch (e) { console.log('FALHOU', n, '\n   ', e.stack); process.exitCode = 1; } };
async function pedidoEmAtendimento(i, uid) {
  const p = await RF.rodarRoteiro(RF.ROTEIROS[i]);
  p.pacienteUid = uid; p.clinicaId = 'cA'; p.clinica = { id: 'cA', nome: 'Clínica A', cnpj: '11.222.333/0001-81' }; p.status = 'em_atendimento'; p.atendimento = { evolucao: 'x' }; p.historico = p.historico || [];
  p.receitas.forEach(b => { b.ambienteSNCR = 'homologacao'; });
  await db.collection('pedidos').doc(p.id).set(JSON.parse(JSON.stringify(p)));
  return p;
}
const numerar = async (p, base = 1) => { let n = base; const r = p.receitas.map(b => (b.tipo === 'simples' ? b : Object.assign(b, { numeroSNCR: '2602.6-53.' + String(n++).padStart(7, '0') }))); await db.collection('pedidos').doc(p.id).update({ receitas: JSON.parse(JSON.stringify(r)) }); };

(async () => {
  await new Promise(r => srv.listen(9911, '127.0.0.1', r));
  await db.collection('clinicas').doc('cA').set({ nome: 'Clínica A', cnpj: '11.222.333/0001-81', ativa: true });
  await db.collection('clinicas').doc('cB').set({ nome: 'Clínica B', ativa: true });
  const medU = await usuario('med@teste.br', { medico: true, clinica: 'cA' });
  const medB = await usuario('medb@teste.br', { medico: true, clinica: 'cB' });
  const medSem = await usuario('medsem@teste.br', { medico: true });
  const atd = await usuario('atd@teste.br', { atendente: true, clinica: 'cA' });
  const atdB = await usuario('atdb@teste.br', { atendente: true, clinica: 'cB' });
  const adm = await usuario('admin@teste.br', {});
  await db.collection('medicos').doc(medU.uid).set(MED);
  await db.collection('medicos').doc(medB.uid).set(MED);
  await db.collection('medicos').doc(medSem.uid).set(MED);

  // ---------- VIDaaS ----------
  const p = await pedidoEmAtendimento(1, 'pac1'); // Parkinson: simples + controle especial + notificação B
  await t('recusa emitir controlado sem numeração', async () => {
    aprovado = true; await fn('vidaasIniciar', {}, medU.token); await fn('vidaasStatus', {}, medU.token);
    await recusa(fn('assinarReceita', { pedidoId: p.id }, medU.token), /numeração do SNCR/);
  });
  await t('VIDaaS: troca o token com PKCE e segredo', async () => {
    assert.ok(reqs.some(r => r.path === '/v0/oauth/token'));
    assert.strictEqual(reqs.find(r => r.path === '/v0/oauth/authorize').q.login_hint, '52998224725');
    assert.strictEqual((await fn('vidaasStatus', {}, medU.token)).autorizado, true);
  });
  let vres;
  await t('VIDaaS: assina um PDF por documento e fecha o pedido', async () => {
    await numerar(p);
    vres = await fn('assinarReceita', { pedidoId: p.id }, medU.token);
    assert.ok(/^[0-9A-F]{10}$/.test(vres.verificacao));
    const d = (await db.collection('pedidos').doc(p.id).get()).data();
    assert.strictEqual(d.status, 'assinado');
    const docs = d.atendimento.assinatura.documentos;
    assert.strictEqual(docs.length, blocosEmitidos(p).length); assert.ok(docs.length >= 3);
    assert.ok(docs.every(x => x.tipo === 'simples' || x.numero));
    assert.strictEqual(reqs.filter(r => r.path === '/v0/oauth/signature').length, docs.length);
    assert.ok(!d.atendimento.preparo);
  });
  await t('PDF assinado íntegro, com certificado do médico', async () => {
    const d = (await db.collection('pedidos').doc(p.id).get()).data();
    for (const doc of d.atendimento.assinatura.documentos) {
      const r = await fn('baixarReceita', { pedidoId: p.id, docId: doc.id }, medU.token);
      const c = conferirAssinatura(Buffer.from(r.base64, 'base64'));
      assert.ok(c.ok, c.motivo); assert.strictEqual(c.cpf, '52998224725'); assert.ok(c.icp);
      if (process.env.SAIDA) fs.writeFileSync(path.join(process.env.SAIDA, r.nome), Buffer.from(r.base64, 'base64'));
    }
  });
  await t('paciente baixa com código + nascimento; data errada não', async () => {
    const r = await fn('baixarReceita', { codigo: p.codigo, nasc: p.paciente.nasc });
    assert.ok(Buffer.from(r.base64, 'base64').slice(0, 4).toString() === '%PDF');
    await recusa(fn('baixarReceita', { codigo: p.codigo, nasc: '1900-01-01' }));
    const c = await fn('consultarPedido', { codigo: p.codigo, nasc: p.paciente.nasc });
    assert.strictEqual(c.pedido.status, 'assinado'); assert.ok(!JSON.stringify(c).includes('segredo')); assert.ok(!JSON.stringify(c).includes('receitas/'));
    assert.strictEqual((await fn('consultarPedido', { codigo: p.codigo, nasc: '1900-01-01' })).erro, 'nao_confere');
  });
  await t('verificação pública e QR do ITI', async () => {
    const v = await fn('verificarReceita', { codigo: vres.verificacao });
    assert.strictEqual(v.valida, true); assert.strictEqual(v.tipoAssinatura, 'icp'); assert.ok(v.documentos.length >= 3); assert.ok(!JSON.stringify(v).includes(p.paciente.cpf));
    const d = (await db.collection('pedidos').doc(p.id).get()).data();
    const seg = d.atendimento.assinatura.segredo;
    const r = await (await fetch(`http://127.0.0.1:5055/${PROJ}/southamerica-east1/receitaITI?_format=application/validador-iti%2Bjson&_secretCode=${seg}`)).json();
    assert.strictEqual(r.prescription.signatureFiles.length, 1); // só a receita simples usa o QR do ITI
    const q = new URL(r.prescription.signatureFiles[0].url);
    const a = await fetch(`http://127.0.0.1:5055/${PROJ}/southamerica-east1/receitaArquivo${q.search}`);
    assert.strictEqual(a.status, 200); assert.strictEqual(a.headers.get('content-type').split(';')[0], 'application/pdf');
    assert.strictEqual((await fetch(`http://127.0.0.1:5055/${PROJ}/southamerica-east1/receitaITI?_secretCode=aaaaaaaaaaaa`)).status, 404);
  });
  await t('pedido assinado não é emitido de novo', () => recusa(fn('assinarReceita', { pedidoId: p.id }, medU.token), /não está em atendimento/));

  // ---------- PDF anexado ----------
  const p2 = await pedidoEmAtendimento(2, 'pac2');
  const assina = async (b, chave, cert) => {
    const pr = { em: new Date().toISOString(), verificacao: 'ABCDEF0123', segredo: 'segredoteste123' };
    const pdf = await gerarDocumento(b, p2, MED, { emitidoEm: pr.em, verificacao: pr.verificacao, urlVerificar: 'x/#/verificar/' + pr.verificacao, urlQR: 'https://x/y', ambienteSNCR: 'homologacao' });
    return assinarPDF(pdf, { certs: [ler(cert).toString()], nome: 'x', assinarHash: async h => crypto.privateEncrypt({ key: ler(chave), padding: crypto.constants.RSA_PKCS1_PADDING }, digestInfo(h)) });
  };
  const anexos = async (chave, cert, muda) => Promise.all(blocosEmitidos(p2).map(async x => { let b = await assina(x.b, chave, cert); if (muda) { b = Buffer.from(b); b[300] = b[300] ^ 1; } return { id: x.id, pdfBase64: b.toString('base64') }; }));
  await numerar(p2, 50);
  await db.collection('pedidos').doc(p2.id).update({ 'atendimento.preparo': { em: new Date().toISOString(), verificacao: 'ABCDEF0123', segredo: 'segredoteste123' } });
  await t('anexo: recusa PDF de outro CPF', async () => { await recusa(fn('emitirComAnexos', { pedidoId: p2.id, documentos: await anexos('chave2.pem', 'cert2.pem') }, medU.token), /CPF do seu perfil/); });
  await t('anexo: recusa PDF alterado depois de assinado', async () => { await recusa(fn('emitirComAnexos', { pedidoId: p2.id, documentos: await anexos('chave.pem', 'cert.pem', true) }, medU.token), /não confere|alterado|ler a assinatura/); });
  await t('anexo: recusa se faltar documento', async () => { const a = await anexos('chave.pem', 'cert.pem'); await recusa(fn('emitirComAnexos', { pedidoId: p2.id, documentos: a.slice(1) }, medU.token), /Falta o PDF/); });
  await t('anexo: PDF certo emite', async () => {
    const r = await fn('emitirComAnexos', { pedidoId: p2.id, documentos: await anexos('chave.pem', 'cert.pem') }, medU.token);
    assert.strictEqual(r.verificacao, 'ABCDEF0123');
    const d = (await db.collection('pedidos').doc(p2.id).get()).data();
    assert.strictEqual(d.status, 'assinado'); assert.strictEqual(d.atendimento.assinatura.provedor, 'anexo');
  });

  // ---------- separação entre clínicas ----------
  await t('médico e atendente de outra clínica não alcançam o pedido', async () => {
    const q = await pedidoEmAtendimento(3, 'pac3');
    await numerar(q, 200);
    await recusa(fn('assinarReceita', { pedidoId: q.id }, medB.token), /não encontrado|VIDaaS/);
    await recusa(fn('emitirComAnexos', { pedidoId: q.id, documentos: [] }, medB.token), /não encontrado/);
    await recusa(fn('assinarReceita', { pedidoId: q.id }, medSem.token), /clínica/);
    await recusa(fn('baixarReceita', { pedidoId: p.id }, medB.token), /não encontrada/);
    await recusa(fn('atendenteRegistrar', { pedidoId: q.id, evento: 'x' }, atdB.token), /não encontrado/);
    assert.strictEqual((await fn('atendenteFila', {}, atdB.token)).length, 0);
  });
  await t('aprovar liga a conta à clínica e cria o link público do médico', async () => {
    const novo = await usuario('nova@teste.br', {});
    await db.collection('medicos').doc(novo.uid).set({ nome: 'Dra. Ana Lúcia Sá', crm: '777', uf: 'CE', rqe: '1', especialidade: 'Neurocirurgia' });
    await recusa(fn('definirPapel', { uid: novo.uid, papel: 'medico' }, adm.token), /clínica/);
    await recusa(fn('definirPapel', { uid: novo.uid, papel: 'medico', clinicaId: 'naoexiste' }, adm.token), /clínica/);
    const r = await fn('definirPapel', { uid: novo.uid, papel: 'medico', clinicaId: 'cA' }, adm.token);
    assert.strictEqual(r.claims.clinica, 'cA'); assert.strictEqual(r.linkSlug, 'ana-lucia-sa');
    const l = (await db.collection('links').doc('ana-lucia-sa').get()).data();
    assert.strictEqual(l.medicoUid, novo.uid); assert.strictEqual(l.clinicaId, 'cA'); assert.strictEqual(l.medicoNome, 'Dra. Ana Lúcia Sá');
    const m = (await db.collection('medicos').doc(novo.uid).get()).data();
    assert.strictEqual(m.clinicaId, 'cA'); assert.strictEqual(m.nomeLocal, 'Clínica A'); assert.strictEqual(m.cnpjLocal, '11.222.333/0001-81');
    const homon = await usuario('homon@teste.br', {});
    await db.collection('medicos').doc(homon.uid).set({ nome: 'Dra. Ana Lúcia Sá' });
    assert.strictEqual((await fn('definirPapel', { uid: homon.uid, papel: 'medico', clinicaId: 'cB' }, adm.token)).linkSlug, 'ana-lucia-sa-2');
    const r2 = await fn('definirPapel', { uid: novo.uid, papel: 'medico', clinicaId: 'cA' }, adm.token);
    assert.strictEqual(r2.linkSlug, 'ana-lucia-sa', 'aprovar de novo não cria outro link');
  });

  // ---------- papéis ----------
  await t('quem não é médico não assina nem baixa pelo id', async () => {
    await recusa(fn('assinarReceita', { pedidoId: p.id }, atd.token), /Somente médicos/);
    await recusa(fn('vidaasIniciar', {}, null));
    await recusa(fn('baixarReceita', { pedidoId: p.id }, atd.token));
  });
  await t('atendente vê a fila sem dado clínico e registra contato', async () => {
    const f = await fn('atendenteFila', {}, atd.token);
    assert.ok(f.length >= 2);
    const txt = JSON.stringify(f);
    for (const proibido of ['Prolopa', 'evolucao', 'posologia', 'receitas', p.paciente.cpf, 'Levodopa']) assert.ok(!txt.includes(proibido), proibido);
    await fn('atendenteRegistrar', { pedidoId: p2.id, evento: 'Não atendeu' }, atd.token);
    const d = (await db.collection('pedidos').doc(p2.id).get()).data();
    assert.ok(d.historico.some(h => h.evento === 'Contato: Não atendeu'));
    await recusa(fn('atendenteFila', {}, medU.token), /Somente atendentes/);
  });
  await t('aprovação de papel e prontidão só para administrador', async () => {
    await recusa(fn('definirPapel', { email: 'atd@teste.br', papel: 'admin' }, atd.token));
    await recusa(fn('saude', {}, medU.token));
    const s = await fn('saude', {}, adm.token);
    assert.strictEqual(s.vidaas, true); assert.strictEqual(s.sncrAmbiente, 'homologacao');
    const r = await fn('definirPapel', { email: 'atd@teste.br', papel: 'medico', clinicaId: 'cA' }, adm.token);
    assert.strictEqual(r.claims.medico, true);
  });
  console.log(`\n${ok} testes de ponta a ponta passaram`);
  srv.close();
  process.exit(process.exitCode || 0);
})().catch(e => { console.error(e); process.exit(1); });
