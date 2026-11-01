// Regras do Firestore no emulador. Uso: npx firebase-tools emulators:exec --project demo-meuneuro --only firestore "node tests/regras.test.cjs"
const assert = require('assert');
const BASE = 'http://127.0.0.1:8085/v1/projects/demo-meuneuro/databases/(default)/documents';
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const tok = (uid, claims = {}, prov = 'password') => uid ? b64({ alg: 'none' }) + '.' + b64({ sub: uid, user_id: uid, aud: 'demo-meuneuro', iss: 'https://securetoken.google.com/demo-meuneuro', iat: 1, exp: 9999999999, firebase: { sign_in_provider: prov }, ...claims }) + '.' : null;
const paraFS = v => v === null ? { nullValue: null } : typeof v === 'string' ? { stringValue: v } : typeof v === 'boolean' ? { booleanValue: v } : typeof v === 'number' ? { integerValue: String(v) } : { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, paraFS(x)])) } };
const corpo = o => JSON.stringify({ fields: Object.fromEntries(Object.entries(o).map(([k, x]) => [k, paraFS(x)])) });
async function req(met, cam, t, c) { const r = await fetch(BASE + cam, { method: met, headers: Object.assign({ 'Content-Type': 'application/json' }, t ? { Authorization: 'Bearer ' + t } : {}), body: c }); return r.status; }
const gravar = (cam, t, o) => req('PATCH', cam, t, corpo(o));
const ler = (cam, t) => req('GET', cam, t);
let ok = 0;
const t = async (n, f) => { try { await f(); ok++; console.log('ok  ', n); } catch (e) { console.log('FALHOU', n, '\n   ', e.message); process.exitCode = 1; } };
const pode = async (pr, m) => assert.strictEqual(await pr, 200, m);
const nao = async (pr, m) => assert.strictEqual(await pr, 403, m);
const pac = tok('pac1', {}, 'anonymous'), outro = tok('pac2', {}, 'anonymous');
const med = tok('med1', { medico: true, clinica: 'cA' }), medB = tok('med2', { medico: true, clinica: 'cB' }), semCl = tok('med3', { medico: true });
const atd = tok('atd1', { atendente: true, clinica: 'cA' }), adm = tok('adm1', { admin: true });
const P = { pacienteUid: 'pac1', clinicaId: 'cA', status: 'aguardando' };
(async () => {
  await t('clínica: dados públicos por id; só o administrador grava e lista', async () => {
    await pode(gravar('/clinicas/cA', adm, { nome: 'A', ativa: true })); await pode(gravar('/clinicas/cB', adm, { nome: 'B', ativa: true })); await pode(gravar('/clinicas/cX', adm, { nome: 'X', ativa: false }));
    await pode(ler('/clinicas/cA', null)); await nao(ler('/clinicas', med)); await pode(ler('/clinicas', adm));
    await nao(gravar('/clinicas/cA', med, { nome: 'hack', ativa: true })); await nao(gravar('/clinicas/novo', pac, { nome: 'hack', ativa: true }));
  });
  await t('paciente cria só em clínica ativa, em nome próprio, sem assinatura', async () => {
    await pode(gravar('/pedidos/a', pac, P));
    await nao(gravar('/pedidos/b', pac, { ...P, pacienteUid: 'pac2' }));
    await nao(gravar('/pedidos/c', pac, { ...P, status: 'assinado' }));
    await nao(gravar('/pedidos/d', pac, { ...P, atendimento: { assinatura: { tipo: 'icp' } } }));
    await nao(gravar('/pedidos/e', null, P));
    await nao(gravar('/pedidos/f', pac, { pacienteUid: 'pac1', status: 'aguardando' }), 'sem clínica');
    await nao(gravar('/pedidos/g', pac, { ...P, clinicaId: 'cX' }), 'clínica suspensa');
    await nao(gravar('/pedidos/h', pac, { ...P, clinicaId: 'naoexiste' }), 'clínica inexistente');
  });
  await t('médico só vê a própria clínica; outro médico, atendente e administrador não', async () => {
    await pode(ler('/pedidos/a', pac)); await pode(ler('/pedidos/a', med));
    await nao(ler('/pedidos/a', medB), 'médico de outra clínica'); await nao(ler('/pedidos/a', semCl), 'médico sem clínica');
    await nao(ler('/pedidos/a', outro)); await nao(ler('/pedidos/a', atd)); await nao(ler('/pedidos/a', adm)); await nao(ler('/pedidos/a', null));
    const consulta = async (tk, cl) => (await fetch(BASE + ':runQuery', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tk }, body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'pedidos' }], ...(cl ? { where: { fieldFilter: { field: { fieldPath: 'clinicaId' }, op: 'EQUAL', value: { stringValue: cl } } } } : {}) } }) })).status;
    assert.strictEqual(await consulta(med, 'cA'), 200, 'lista a própria');
    assert.strictEqual(await consulta(med, 'cB'), 403, 'lista a de outra');
    assert.strictEqual(await consulta(med), 403, 'lista sem filtro');
    assert.strictEqual(await consulta(adm, 'cA'), 403, 'administrador não lista pedidos');
  });
  await t('paciente não mexe no pedido em fila; só refaz triagem de urgência', async () => {
    await nao(gravar('/pedidos/a', pac, { ...P, status: 'em_atendimento' }));
    await nao(gravar('/pedidos/a', pac, { ...P, x: 'y' }));
    await pode(gravar('/pedidos/u', pac, { ...P, status: 'urgencia' }));
    await nao(gravar('/pedidos/u', pac, { ...P, clinicaId: 'cB', status: 'aguardando' }), 'não troca de clínica');
    await pode(gravar('/pedidos/u', pac, P));
  });
  await t('médico atende na própria clínica; não assina pelo navegador nem move o pedido', async () => {
    await pode(gravar('/pedidos/a', med, { ...P, status: 'em_atendimento' }));
    await nao(gravar('/pedidos/a', medB, { ...P, status: 'recusado' }), 'outra clínica');
    await nao(gravar('/pedidos/a', med, { ...P, clinicaId: 'cB', status: 'em_atendimento' }), 'mover de clínica');
    await nao(gravar('/pedidos/a', med, { ...P, status: 'assinado' }), 'assinar é do servidor');
    await nao(gravar('/pedidos/a', atd, { ...P, status: 'recusado' }));
    await pode(gravar('/pedidos/a', med, { ...P, status: 'recusado' }));
  });
  await t('ninguém apaga pedido', async () => { await nao(req('DELETE', '/pedidos/a', med)); await nao(req('DELETE', '/pedidos/a', pac)); await nao(req('DELETE', '/pedidos/a', adm)); });
  await t('perfil do médico: aprovação, clínica e link só o servidor grava', async () => {
    await pode(gravar('/medicos/med1', med, { nome: 'X', sncr: { rce: { proximo: '1' } } }));
    await nao(gravar('/medicos/med2', med, { nome: 'X' }));
    await nao(gravar('/medicos/novo', tok('novo'), { nome: 'X', aprovado: true }));
    await nao(gravar('/medicos/novo', tok('novo'), { nome: 'X', clinicaId: 'cA' }));
    await nao(gravar('/medicos/pac1', pac, { nome: 'X' }));
    await nao(gravar('/medicos/med1', med, { nome: 'X', aprovado: true }));
    await nao(gravar('/medicos/med1', med, { nome: 'X', clinicaId: 'cB' }));
    await nao(gravar('/medicos/med1', med, { nome: 'X', linkSlug: 'outro' }));
    await pode(ler('/medicos/med1', med)); await nao(ler('/medicos/med1', outro)); await pode(ler('/medicos/med1', adm)); await nao(ler('/medicos', med)); await pode(ler('/medicos', adm));
  });
  await t('link: público por id, não lista; só o próprio médico atualiza, sem trocar de dono', async () => {
    const seed = await fetch(BASE + '/links/dra-x', { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' }, body: corpo({ medicoUid: 'med1', clinicaId: 'cA', medicoNome: 'X' }) });
    assert.strictEqual(seed.status, 200);
    await pode(ler('/links/dra-x', null)); await nao(ler('/links', null)); await nao(ler('/links', adm));
    await pode(gravar('/links/dra-x', med, { medicoUid: 'med1', clinicaId: 'cA', medicoNome: 'Y' }));
    await nao(gravar('/links/dra-x', medB, { medicoUid: 'med2', clinicaId: 'cB', medicoNome: 'Z' }));
    await nao(gravar('/links/dra-x', med, { medicoUid: 'med1', clinicaId: 'cB', medicoNome: 'Y' }));
    await nao(gravar('/links/novo', med, { medicoUid: 'med1', clinicaId: 'cA' }));
  });
  await t('sala de vídeo: logado usa pelo id, não lista, e deslogado não entra', async () => {
    await pode(gravar('/salas/s1', med, { offer: { type: 'offer', sdp: 'x' } }));
    await pode(ler('/salas/s1', pac)); await pode(gravar('/salas/s1/pacienteCands/c1', pac, { candidate: 'x' })); await pode(ler('/salas/s1/pacienteCands', med));
    await nao(ler('/salas', med)); await nao(ler('/salas/s1', null)); await nao(gravar('/salas/s2', null, { a: 'b' }));
    await pode(req('DELETE', '/salas/s1', med));
  });
  await t('pedido assinado não muda', async () => {
    const seed = await fetch(BASE + '/pedidos/ass', { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' }, body: corpo({ ...P, status: 'assinado' }) });
    assert.strictEqual(seed.status, 200);
    await pode(ler('/pedidos/ass', med));
    await nao(gravar('/pedidos/ass', med, { ...P, status: 'assinado', x: 'y' })); await nao(gravar('/pedidos/ass', med, { ...P, status: 'em_atendimento' })); await nao(gravar('/pedidos/ass', pac, { ...P, status: 'aguardando' }));
  });
  await t('coleções do servidor fechadas', async () => {
    for (const c of ['/sessoesAssinatura/med1', '/uso/x']) { await nao(ler(c, med)); await nao(ler(c, adm)); await nao(gravar(c, med, { a: 'b' })); }
  });
  console.log(`\n${ok} testes de regras passaram`);
  process.exit(process.exitCode || 0);
})();
