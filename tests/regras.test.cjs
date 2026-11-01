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
const pac = tok('pac1', {}, 'anonymous'), outro = tok('pac2', {}, 'anonymous'), med = tok('med1', { medico: true }), atd = tok('atd1', { atendente: true }), adm = tok('adm1', { admin: true });
(async () => {
  await t('paciente cria o próprio pedido; não em nome de outro nem já assinado', async () => {
    await pode(gravar('/pedidos/a', pac, { pacienteUid: 'pac1', status: 'aguardando' }));
    await nao(gravar('/pedidos/b', pac, { pacienteUid: 'pac2', status: 'aguardando' }));
    await nao(gravar('/pedidos/c', pac, { pacienteUid: 'pac1', status: 'assinado' }));
    await nao(gravar('/pedidos/d', pac, { pacienteUid: 'pac1', status: 'aguardando', atendimento: { assinatura: { tipo: 'icp' } } }));
    await nao(gravar('/pedidos/e', null, { pacienteUid: 'x', status: 'aguardando' }));
  });
  await t('só o dono e o médico leem o pedido; atendente não', async () => {
    await pode(ler('/pedidos/a', pac)); await pode(ler('/pedidos/a', med));
    await nao(ler('/pedidos/a', outro)); await nao(ler('/pedidos/a', atd)); await nao(ler('/pedidos/a', null));
    await nao(ler('/pedidos', pac)); await nao(ler('/pedidos', atd)); await pode(ler('/pedidos', med));
  });
  await t('paciente não mexe no pedido em fila; só refaz triagem de urgência', async () => {
    await nao(gravar('/pedidos/a', pac, { pacienteUid: 'pac1', status: 'em_atendimento' }));
    await nao(gravar('/pedidos/a', pac, { pacienteUid: 'pac1', status: 'aguardando', x: 'y' }));
    await pode(gravar('/pedidos/u', pac, { pacienteUid: 'pac1', status: 'urgencia' }));
    await pode(gravar('/pedidos/u', pac, { pacienteUid: 'pac1', status: 'aguardando' }));
  });
  await t('médico atende, mas não marca como assinado; pedido assinado fica imutável', async () => {
    await pode(gravar('/pedidos/a', med, { pacienteUid: 'pac1', status: 'em_atendimento' }));
    await nao(gravar('/pedidos/a', med, { pacienteUid: 'pac1', status: 'assinado' }), 'assinar é do servidor');
    await nao(gravar('/pedidos/a', atd, { pacienteUid: 'pac1', status: 'recusado' }));
    await pode(gravar('/pedidos/a', med, { pacienteUid: 'pac1', status: 'recusado' }));
  });
  await t('ninguém apaga pedido', async () => { await nao(req('DELETE', '/pedidos/a', med)); await nao(req('DELETE', '/pedidos/a', pac)); await nao(req('DELETE', '/pedidos/a', adm)); });
  await t('perfil do médico: só o próprio; aprovação só o servidor; anônimo não cria', async () => {
    await pode(gravar('/medicos/med1', med, { nome: 'X', sncr: { rce: { proximo: '1' } } }));
    await nao(gravar('/medicos/med2', med, { nome: 'X' }));
    await nao(gravar('/medicos/novo', tok('novo'), { nome: 'X', aprovado: true }));
    await nao(gravar('/medicos/pac1', pac, { nome: 'X' }));
    await nao(gravar('/medicos/med1', med, { nome: 'X', aprovado: true }));
    await pode(ler('/medicos/med1', med)); await nao(ler('/medicos/med1', outro)); await pode(ler('/medicos/med1', adm)); await nao(ler('/medicos', med)); await pode(ler('/medicos', adm));
  });
  await t('sala de vídeo: logado usa pelo id, não lista, e deslogado não entra', async () => {
    await pode(gravar('/salas/s1', med, { offer: { type: 'offer', sdp: 'x' } }));
    await pode(ler('/salas/s1', pac)); await pode(gravar('/salas/s1/pacienteCands/c1', pac, { candidate: 'x' })); await pode(ler('/salas/s1/pacienteCands', med));
    await nao(ler('/salas', med)); await nao(ler('/salas/s1', null)); await nao(gravar('/salas/s2', null, { a: 'b' }));
    await pode(req('DELETE', '/salas/s1', med));
  });
  await t('coleções do servidor fechadas', async () => {
    for (const c of ['/sessoesAssinatura/med1', '/uso/x']) { await nao(ler(c, med)); await nao(ler(c, adm)); await nao(gravar(c, med, { a: 'b' })); }
  });
  console.log(`\n${ok} testes de regras passaram`);
  process.exit(process.exitCode || 0);
})();
