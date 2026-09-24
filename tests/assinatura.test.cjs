// Teste da cadeia de assinatura do servidor: PDF da receita → PAdES com assinatura RAW externa.
// Usa uma chave de teste local no lugar do VIDaaS. Uso: node tests/assinatura.test.cjs <pasta-com-chave.pem-e-cert.pem>
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const raiz = path.join(__dirname, '..');
for (const f of ['core', 'kb', 'engine', 'regras', 'receita', 'demo']) require(path.join(raiz, f + '.js'));
const { gerarPDF } = require(path.join(raiz, 'functions/pdf.js'));
const { assinarPDF, digestInfo } = require(path.join(raiz, 'functions/pades.js'));
(async () => {
  const pasta = process.argv[2];
  const chave = fs.readFileSync(path.join(pasta, 'chave.pem'));
  const cert = fs.readFileSync(path.join(pasta, 'cert.pem'), 'utf8');
  const p = await RF.rodarRoteiro(RF.ROTEIROS[2]);                 // enxaqueca: simples + controle especial
  p.receitas.find(b => b.tipo === 'controle_especial').numeroSNCR = '2602.6-53.0000001';
  const med = { nome: 'Dra. Teste Assinatura', crm: '000000', uf: 'CE', rqe: '0000', especialidade: 'Clínica Médica', endereco: 'Rua Teste, 1', cidade: 'Sobral', ufEnd: 'CE', telefone: '(88) 0000-0000' };
  const pdf = await gerarPDF(p, med, { urlQR: 'https://southamerica-east1-refilmed.cloudfunctions.net/receitaITI?_format=application/validador-iti+json&_secretCode=TESTE123', verificacao: 'ABC123' });
  let chamadas = 0;
  const assinado = await assinarPDF(pdf, {
    certs: [cert], nome: med.nome,
    assinarHash: async hash => { chamadas++; return crypto.privateEncrypt({ key: chave, padding: crypto.constants.RSA_PKCS1_PADDING }, digestInfo(hash)); }
  });
  const saida = path.join(pasta, 'receita-assinada-teste.pdf');
  fs.writeFileSync(saida, assinado);
  const txt = assinado.toString('latin1');
  console.log('páginas de receita:', (txt.match(/\/Type\s*\/Page\b/g) || []).length, '| chamadas de assinatura:', chamadas, '| bytes:', assinado.length);
  console.log('ETSI.CAdES.detached:', /ETSI\.CAdES\.detached/.test(txt), '| ByteRange:', /\/ByteRange\s*\[\s*0\s+\d+\s+\d+\s+\d+\s*\]/.test(txt), '| OID prescrição:', txt.includes('2.16.76.1.12.1.1'));
  console.log('arquivo:', saida);
})().catch(e => { console.error('FALHOU', e); process.exit(1); });
