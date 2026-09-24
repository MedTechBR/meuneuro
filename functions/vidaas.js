/* RefilMed — cliente da API de assinatura em nuvem (padrão ITI para prestadores de serviço de confiança)
   Mesmo fluxo do assinador local do Matheus (~/AssinadorVIDaaS/assinador.py), que já funciona em produção:
   1. autorizar: GET /v0/oauth/authorize com PKCE e login_hint = CPF → notificação no app do celular
   2. aguardar:  GET /valid/api/v1/trusted-services/authentications?code= até vir authorizationToken
   3. token:     POST /v0/oauth/token (authorization_code)
   4. certificado: GET /v0/oauth/certificate-discovery (Bearer) → [{alias, certificate}]
   5. assinar:   POST /v0/oauth/signature com o hash SHA-256 → assinatura RAW PKCS#1 v1.5
   Configuração (variáveis da função): VIDAAS_BASE_URL (padrão https://certificado.vidaas.com.br),
   VIDAAS_CLIENT_ID (cadastro da aplicação RefilMed na Valid) e, se a Valid exigir, VIDAAS_CLIENT_SECRET. */
const crypto = require('crypto');

const base = () => process.env.VIDAAS_BASE_URL || 'https://certificado.vidaas.com.br';
const clientId = () => { const c = process.env.VIDAAS_CLIENT_ID; if (!c) throw new Error('VIDAAS_CLIENT_ID não configurado.'); return c; };
const b64url = b => b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function autorizar(cpf, validadeSeg) {
  const verifier = b64url(crypto.randomBytes(48));
  const challenge = b64url(crypto.createHash('sha256').update(verifier).digest());
  const q = new URLSearchParams({
    client_id: clientId(), code_challenge: challenge, code_challenge_method: 'S256', response_type: 'code',
    scope: 'signature_session', login_hint: String(cpf).replace(/\D/g, ''), lifetime: String(validadeSeg || 3600), redirect_uri: 'push://'
  });
  const r = await fetch(base() + '/v0/oauth/authorize?' + q, { redirect: 'manual' });
  const corpo = await r.text();
  let code = null;
  try { code = JSON.parse(corpo).code; } catch (e) { }
  if (!code) {
    const loc = r.headers.get('location') || corpo;
    const m = /[?&]code=([^&\s"]+)/.exec(loc);
    if (m) code = m[1];
  }
  if (!code) throw new Error('VIDaaS não iniciou a autorização (HTTP ' + r.status + ').');
  return { code, verifier };
}

// uma consulta; devolve o authorizationToken quando o médico aprovar no celular
async function consultarAprovacao(code) {
  const r = await fetch(base() + '/valid/api/v1/trusted-services/authentications?' + new URLSearchParams({ code }));
  if (r.status !== 200) return null;
  const t = (await r.text()).trim();
  if (!t) return null;
  try { return JSON.parse(t).authorizationToken || null; } catch (e) { return null; }
}

async function trocarToken(authorizationToken) {
  const form = new URLSearchParams({ grant_type: 'authorization_code', client_id: clientId(), code: authorizationToken });
  if (process.env.VIDAAS_CLIENT_SECRET) form.set('client_secret', process.env.VIDAAS_CLIENT_SECRET);
  const r = await fetch(base() + '/v0/oauth/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form });
  if (r.status !== 200) throw new Error('VIDaaS recusou o token (HTTP ' + r.status + ').');
  const j = await r.json();
  return { token: j.access_token, expiraEm: Date.now() + ((j.expires_in || 3600) - 60) * 1000 };
}

async function certificados(token) {
  const r = await fetch(base() + '/v0/oauth/certificate-discovery', { headers: { Authorization: 'Bearer ' + token } });
  if (r.status !== 200) throw new Error('Não foi possível obter o certificado no VIDaaS (HTTP ' + r.status + ').');
  const j = await r.json();
  const lista = j.certificates || [];
  if (!lista.length) throw new Error('Nenhum certificado encontrado nesta conta VIDaaS.');
  return lista; // [{alias, certificate}]
}

async function assinarHash(token, alias, hash) {
  const corpo = { hashes: [{ id: '1', alias, hash: hash.toString('base64'), hash_algorithm: '2.16.840.1.101.3.4.2.1', signature_format: 'RAW', padding_method: 'PKCS1V1_5' }] };
  const r = await fetch(base() + '/v0/oauth/signature', { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
  if (r.status !== 200) throw new Error('VIDaaS recusou a assinatura (HTTP ' + r.status + ').');
  const j = await r.json();
  const s = (j.signatures || [])[0];
  if (!s || !s.raw_signature) throw new Error('VIDaaS não devolveu a assinatura.');
  return Buffer.from(s.raw_signature, 'base64');
}

module.exports = { autorizar, consultarAprovacao, trocarToken, certificados, assinarHash };
