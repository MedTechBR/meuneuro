// Testes do motor da conversa e das regras (node tests/fluxos.test.cjs)
const assert = require('assert');
const raiz = __dirname + '/..';
for (const f of ['core', 'kb', 'engine', 'regras', 'receita', 'demo']) require(raiz + '/' + f + '.js');
let ok = 0;
const t = async (nome, fn) => { try { await fn(); ok++; console.log('ok  ', nome); } catch (e) { console.log('FALHOU', nome, '\n   ', e.message); process.exitCode = 1; } };

(async () => {
  await t('interpretador de posologia', () => {
    const c = (txt, u) => assert.strictEqual(MN.lerPosologia(txt).unidadesDia, u, txt);
    c('1 de manhã e 2 à noite', 3); c('1 comprimido de 12 em 12 horas', 2); c('meio comprimido antes de dormir', 0.5);
    c('2 comprimidos 3x ao dia', 6); c('um e meio à noite', 1.5); c('1 a cada 8 horas', 3); c('1 comprimido por dia', 1);
    assert.ok(MN.lerPosologia('1 quando tenho crise').sos);
    assert.ok(!MN.lerPosologia('não sei').ok);
  });
  await t('identificação por nome comercial e erro de digitação', () => {
    const id = s => (MN.acharMed(s)[0] || { m: {} }).m.id;
    assert.strictEqual(id('amytril 25'), 'amitriptilina');
    assert.strictEqual(id('prolopa'), 'levodopa-benserazida');
    assert.strictEqual(id('pramipexole'), 'pramipexol');
    assert.strictEqual(id('sumax 50mg'), 'sumatriptana');
  });
  await t('CPF e extenso', () => {
    assert.ok(MN.cpfValido('529.982.247-25')); assert.ok(!MN.cpfValido('123.456.789-00'));
    assert.strictEqual(MN.extenso(270), 'duzentos e setenta'); assert.strictEqual(MN.extenso(1080), 'mil e oitenta');
  });
  for (const R of MN.ROTEIROS) {
    await t('roteiro completo: ' + R.nome, async () => {
      const p = await MN.rodarRoteiro(R);
      assert.strictEqual(p.status, 'aguardando');
      assert.ok(p.resumo.includes(R.nome));
      assert.strictEqual(p.meds.length, R.meds.length);
      for (const b of p.receitas) if (b.tipo === 'controle_especial') assert.ok(b.itens.length <= 3);
      for (const b of p.receitas) for (const i of b.itens) { const lim = MN.limiteDias(MN.kbPorId(i.kbId), p); if (lim) assert.ok(i.dias <= lim, i.nome + ' excede limite'); }
    });
  }
  await t('sinal de alarme interrompe a renovação', async () => {
    const c = new MN.Conversa(); c.perguntar();
    for (const v of ['aceito', 'Paula Teste Silva', '1980-01-01', 'F', { cpf: '52998224725', telefone: '85999990000' }, { endereco: 'Rua A, 1', bairro: 'B', cidade: 'C', uf: 'CE' }, ['cefaleia_subita']]) await c.responder(v);
    assert.strictEqual(c.passo, 'bloqueado'); assert.strictEqual(c.p.status, 'urgencia');
    const r = c.perguntar(); assert.ok(/192/.test(r.msgs[0].texto));
    await c.responder('recomecar'); assert.strictEqual(c.passo, 'alarmes');
  });
  await t('paciente recusa o assistente (CFM 2.454/2026)', async () => {
    const c = new MN.Conversa(); c.perguntar();
    for (const v of ['semia', 'Paula Teste Silva', '1980-01-01', 'F', { cpf: '52998224725', telefone: '85999990000' }, { endereco: 'Rua A, 1', bairro: 'B', cidade: 'C', uf: 'CE' }, ['nenhum'], 'Uso Keppra 500 duas vezes ao dia']) await c.responder(v);
    assert.strictEqual(c.passo, 'fim_semia'); assert.strictEqual(c.p.status, 'aguardando'); assert.ok(c.p.semAssistente);
    assert.strictEqual(c.p.consentimento.assistente, false);
  });
  await t('alertas clínicos esperados', async () => {
    const p1 = await MN.rodarRoteiro(MN.ROTEIROS[0]); // mulher 29a, valproato + pílula, última consulta 6–12m
    const tx = p1.alertas.map(a => a.texto).join(' | ');
    if (MN.kbPorId('valproato')) assert.ok(/Valproato em mulher/.test(tx), tx);
    assert.ok(/180 dias/.test(tx));
    const p3 = await MN.rodarRoteiro(MN.ROTEIROS[2]);
    assert.ok(p3.alertas.some(a => /uso excessivo/.test(a.texto)));
  });
  await t('documento: controle especial com CPF, simples com endereço', async () => {
    const p = await MN.rodarRoteiro(MN.ROTEIROS[2]);
    const html = MN.folhasReceita(p, { nome: 'Dra. X', crm: '1', uf: 'CE', cidade: 'Fortaleza' }, {});
    assert.ok(html.includes('RECEITUÁRIO DE CONTROLE ESPECIAL')); assert.ok(html.includes('CPF:')); assert.ok(html.includes('Endereço:'));
    assert.ok(html.includes('(sessenta)'));
  });
  await t('PDF: detecta assinatura PAdES', () => {
    const enc = s => new TextEncoder().encode(s);
    assert.ok(!MN.pdfTemAssinatura(enc('%PDF-1.7 nada')).assinado);
    assert.ok(MN.pdfTemAssinatura(enc('%PDF-1.7 /ByteRange [0 1 2 3] /SubFilter /ETSI.CAdES.detached')).assinado);
    assert.ok(!MN.pdfTemAssinatura(enc('texto')).pdf);
  });
  console.log(`\n${ok} testes passaram`);
})();
