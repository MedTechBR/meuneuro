// VIDaaS e SNCR simulados, para testar a interface com os emuladores. Uso: PASTA_CHAVES=<pasta> node tests/mock-externos.cjs
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const P = process.env.PASTA_CHAVES;
const INFO = Buffer.from('3031300d060960864801650304020105000420', 'hex');
let aprovadoEm = 0, nb = 1;
http.createServer(async (rq, rs) => {
  const u = new URL(rq.url, 'http://127.0.0.1:9911');
  const origem = rq.headers.origin || '*';
  rs.setHeader('Access-Control-Allow-Origin', origem); rs.setHeader('Access-Control-Allow-Headers', 'authorization,content-type'); rs.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  if (rq.method === 'OPTIONS') { rs.writeHead(200); return rs.end(); }
  let b = ''; for await (const c of rq) b += c;
  const j = (o, s = 200) => { rs.writeHead(s, { 'Content-Type': 'application/json' }); rs.end(JSON.stringify(o)); };
  console.log(rq.method, u.pathname + u.search.slice(0, 60), b.slice(0, 120));
  // SNCR
  if (u.pathname === '/sncr/auth/login') { rs.writeHead(302, { Location: u.searchParams.get('client_url') + '?session_id=sess' + Date.now() }); return rs.end(); }
  if (u.pathname === '/sncr/auth/token') return j({ access_token: 'jwt-teste', token_type: 'Bearer' });
  if (u.pathname.startsWith('/sncr/numeracoes')) {
    if (rq.headers.authorization !== 'Bearer jwt-teste') return j({ mensagem: 'x' }, 401);
    const d = JSON.parse(b);
    if (u.pathname.endsWith('receita-especial-retencao')) { const pre = d.tipo === 'RCE' ? '2602.6-53.' : '2602.7-53.'; return j({ inicio: pre + '0000001', fim: pre + '0001000', quantidade: 1000, mensagem: 'ok' }, 201); }
    if (d.receita === 'NRA') return j({ codigo: 'ERRO_NEGOCIO', mensagem: 'Prescritor não possui saldo disponível. Favor gerar novos números de receita.' }, 400);
    const nums = []; for (let i = 0; i < d.quantidade; i++) nums.push('2311.2-00.' + String(nb++).padStart(7, '0'));
    return j({ numeracoesReceita: nums, saldoReceitas: 100, mensagem: '' }, 200);
  }
  // VIDaaS
  if (u.pathname === '/v0/oauth/authorize') { aprovadoEm = Date.now() + 4000; return j({ code: 'c1' }); }
  if (u.pathname.endsWith('/authentications')) { if (Date.now() >= aprovadoEm) return j({ authorizationToken: 'z' }); rs.writeHead(200); return rs.end(''); }
  if (u.pathname === '/v0/oauth/token') return j({ access_token: 't', expires_in: 3600 });
  if (u.pathname === '/v0/oauth/certificate-discovery') return j({ certificates: [{ alias: 'a', certificate: fs.readFileSync(path.join(P, 'cert.pem'), 'utf8') }] });
  if (u.pathname === '/v0/oauth/signature') { const h = JSON.parse(b).hashes[0]; return j({ signatures: [{ raw_signature: crypto.privateEncrypt({ key: fs.readFileSync(path.join(P, 'chave.pem')), padding: crypto.constants.RSA_PKCS1_PADDING }, Buffer.concat([INFO, Buffer.from(h.hash, 'base64')])).toString('base64') }] }); }
  j({}, 404);
}).listen(9911, '127.0.0.1', () => console.log('mock em 9911'));
