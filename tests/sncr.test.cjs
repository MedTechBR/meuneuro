// Testes da integração com o SNCR (fetch e navegador simulados): node tests/sncr.test.cjs
const assert = require('assert');
function armazem() { const d = {}; return { getItem: k => (k in d ? d[k] : null), setItem: (k, v) => { d[k] = String(v); }, removeItem: k => { delete d[k]; } }; }
global.window = global;
global.sessionStorage = armazem(); global.localStorage = armazem();
global.location = { hostname: 'medtechbr.com.br', origin: 'https://medtechbr.com.br', pathname: '/meuneuro/', hash: '#/medico/perfil', search: '', href: '' };
global.history = { replaceState: (a, b, u) => { location.search = ''; location.hash = u.replace(/^[^#]*/, ''); } };
global.document = { title: '' };
global.MEUNEURO_CONFIG = { sncr: { ambiente: 'homologacao', cnpj: '69544873000161' } };
global.RF = { agora: () => '2026-11-01T12:00:00Z' };
require('../sncr.js');
const sn = RF.sncr;
const BASE = 'https://api-gateway.hmg.apps.anvisa.gov.br/api-sncr/api/v1';
const med = { crm: '12345', uf: 'CE' };
let perfil = {};
RF.backend = { medico: { async transacaoPerfil(fn) { return fn(perfil); } } };
let ok = 0;
const t = async (n, f) => { try { await f(); ok++; console.log('ok  ', n); } catch (e) { console.log('FALHOU', n, '\n   ', e.message); process.exitCode = 1; } };
const resp = (status, corpo) => ({ status, ok: status >= 200 && status < 300, json: async () => { if (corpo === undefined) throw new Error('sem corpo'); return corpo; } });

(async () => {
  await t('login vai para o gateway novo, com o site de volta', () => {
    sn.pedirNumeros('controle_especial', med, 0, '#/medico/caso/x');
    assert.strictEqual(location.href, BASE + '/auth/login?client_url=' + encodeURIComponent('https://medtechbr.com.br/meuneuro/'));
  });
  await t('na volta troca o token e pede o bloco na hora; ninguém fica com o token guardado', async () => {
    const chamadas = [];
    global.fetch = async (u, o) => {
      chamadas.push([u, o]);
      if (u.includes('/auth/token')) return resp(200, { access_token: 'jwt', token_type: 'Bearer' });
      return resp(201, { inicio: '2602.6-53.0000001', fim: '2602.6-53.0001000', quantidade: 1000, mensagem: 'ok' });
    };
    location.search = '?session_id=abc';
    assert.strictEqual(await sn.processarRetorno(), true);
    assert.strictEqual(chamadas[0][0], BASE + '/auth/token?session_id=abc');
    assert.strictEqual(chamadas[1][0], BASE + '/numeracoes/receita-especial-retencao');
    assert.strictEqual(chamadas[1][1].headers.Authorization, 'Bearer jwt');
    assert.deepStrictEqual(JSON.parse(chamadas[1][1].body), { conselho: 'CRM', tipo: 'RCE', documento: '12345', uf: 'CE', cnpj: '69544873000161' });
    assert.strictEqual(location.hash, '#/medico/caso/x');
    assert.ok(!JSON.stringify([sessionStorage, localStorage]).includes('jwt'));
    const r = await sn.aplicarResultado();
    assert.ok(/1000 número/.test(r.msg));
    assert.strictEqual(sn.saldo(perfil, 'controle_especial'), 1000);
    assert.strictEqual(await sn.aplicarResultado(), null);
  });
  await t('consome em sequência e não repete', () => {
    assert.strictEqual(sn.consumir(perfil, 'controle_especial'), '2602.6-53.0000001');
    assert.strictEqual(sn.consumir(perfil, 'controle_especial'), '2602.6-53.0000002');
    assert.strictEqual(sn.saldo(perfil, 'controle_especial'), 998);
  });
  await t('bloco novo não apaga o que sobrou do anterior; gasta o antigo primeiro', async () => {
    sn.pedirNumeros('controle_especial', med, 0, '#/medico/perfil');
    global.fetch = async u => u.includes('/auth/token') ? resp(200, { access_token: 'j' }) : resp(201, { inicio: '2602.6-53.0002001', fim: '2602.6-53.0003000', quantidade: 1000 });
    location.search = '?session_id=b'; await sn.processarRetorno(); await sn.aplicarResultado();
    assert.strictEqual(sn.saldo(perfil, 'controle_especial'), 1998);
    assert.strictEqual(sn.consumir(perfil, 'controle_especial'), '2602.6-53.0000003');
  });
  await t('número de homologação não serve em produção', () => {
    MEUNEURO_CONFIG.sncr.ambiente = 'producao';
    assert.strictEqual(sn.saldo(perfil, 'controle_especial'), 0);
    assert.strictEqual(sn.consumir(perfil, 'controle_especial'), null);
    assert.ok(sn.base().includes('api-gateway.prd'));
    MEUNEURO_CONFIG.sncr.ambiente = 'homologacao';
  });
  await t('notificação: aceita 200, usa a cota e respeita 10 a 50', async () => {
    let corpo;
    sn.pedirNumeros('notificacao_b', med, 200, '#/medico/perfil');
    global.fetch = async (u, o) => { if (u.includes('/auth/token')) return resp(200, { access_token: 'j' }); corpo = JSON.parse(o.body); return resp(200, { numeracoesReceita: ['2411.1-00.00000000001', '2411.1-00.00000000002'], saldoReceitas: 49, mensagem: 'Saldo inferior a 50 receitas disponíveis' }); };
    location.search = '?session_id=c'; await sn.processarRetorno();
    const r = await sn.aplicarResultado();
    assert.strictEqual(corpo.quantidade, 50); assert.strictEqual(corpo.receita, 'NRB');
    assert.ok(/2 número/.test(r.msg)); assert.ok(/Saldo inferior/.test(r.aviso));
    assert.strictEqual(sn.consumir(perfil, 'notificacao_b'), '2411.1-00.00000000001');
    assert.strictEqual(sn.saldo(perfil, 'notificacao_b'), 1);
  });
  await t('sem cota da Vigilância: mensagem clara, nada entra no saldo', async () => {
    sn.pedirNumeros('notificacao_a', med, 10, '#/medico/perfil');
    global.fetch = async u => u.includes('/auth/token') ? resp(200, { access_token: 'j' }) : resp(400, { codigo: 'ERRO_NEGOCIO', mensagem: 'Prescritor não possui saldo disponível. Favor gerar novos números de receita.' });
    location.search = '?session_id=d'; await sn.processarRetorno();
    const r = await sn.aplicarResultado();
    assert.ok(/Vigilância Sanitária/.test(r.erro)); assert.strictEqual(sn.saldo(perfil, 'notificacao_a'), 0);
  });
  await t('sessão expirada e 204 viram mensagem legível', async () => {
    sn.pedirNumeros('retencao', med, 0, '#/medico/perfil');
    global.fetch = async u => u.includes('/auth/token') ? resp(200, { access_token: 'j' }) : resp(401);
    location.search = '?session_id=e'; await sn.processarRetorno();
    assert.ok(/30 segundos/.test((await sn.aplicarResultado()).erro));
    sn.pedirNumeros('retencao', med, 0, '#/medico/perfil');
    global.fetch = async u => u.includes('/auth/token') ? resp(200, { access_token: 'j' }) : resp(204);
    location.search = '?session_id=f'; await sn.processarRetorno();
    assert.ok(/não tem numeração/.test((await sn.aplicarResultado()).erro));
  });
  await t('numeração sobrevive mesmo se o perfil demorar a abrir', async () => {
    sn.pedirNumeros('retencao', med, 0, '#/medico/perfil');
    global.fetch = async u => u.includes('/auth/token') ? resp(200, { access_token: 'j' }) : resp(201, { inicio: '2602.7-53.0000001', fim: '2602.7-53.0001000', quantidade: 1000 });
    location.search = '?session_id=g'; await sn.processarRetorno();
    assert.ok(localStorage.getItem('meuneuro.sncr.resultado'));
    await sn.aplicarResultado();
    assert.strictEqual(sn.saldo(perfil, 'retencao'), 1000);
  });
  await t('sem CNPJ não pede bloco', () => {
    const c = MEUNEURO_CONFIG.sncr.cnpj; MEUNEURO_CONFIG.sncr.cnpj = '';
    assert.throws(() => sn.pedirNumeros('controle_especial', med, 0), /CNPJ/);
    MEUNEURO_CONFIG.sncr.cnpj = c;
  });
  console.log(`\n${ok} testes de SNCR passaram`);
})();
