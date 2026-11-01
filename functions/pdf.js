/* Meu Neuro — PDF dos receituários (o mesmo arquivo roda no servidor e no navegador)
   - Controle especial e notificações: desenhados SOBRE o modelo oficial da Anvisa (functions/modelos/),
     sem logotipo nem alteração de leiaute (P&R Integração SNCR 2026, perguntas 40 e 41). Um medicamento
     por documento, um número SNCR por documento. QR code aponta para a consulta do SNCR.
   - Receita simples e receita sujeita a retenção: não há modelo oficial; layout próprio com QR do ITI.
   - Metadados com os OIDs que o validador do ITI usa para reconhecer documento de saúde. */
(function (raiz, fabrica) {
  if (typeof module === 'object' && module.exports) {
    const fs = require('fs'), path = require('path');
    module.exports = fabrica(require('pdf-lib'), require('qrcode'), require('./extenso'), async n => fs.readFileSync(path.join(__dirname, 'modelos', n + '.pdf')));
  } else {
    const base = (raiz.document && raiz.document.currentScript && raiz.document.currentScript.src || '').replace(/[^/]*$/, '');
    raiz.MNPdf = fabrica(raiz.PDFLib, raiz.QRCode, n => raiz.RF.extenso(n), async n => new Uint8Array(await (await fetch(base + 'modelos/' + n + '.pdf')).arrayBuffer()));
  }
})(typeof window !== 'undefined' ? window : globalThis, function (PDFLib, QRCode, extenso, lerModelo) {
  const { PDFDocument, StandardFonts, rgb, PDFName, PDFString } = PDFLib;
  const PLATAFORMA = 'Meu Neuro - M PARENTE OLIVEIRA TECNOLOGIA LTDA - CNPJ 69.544.873/0001-61';
  const A4 = [595.28, 841.89], M = 48;
  const PRETO = rgb(0.07, 0.07, 0.07), CINZA = rgb(0.3, 0.3, 0.3);

  // onde cada campo fica em cada modelo (pontos, origem no topo, medidos nos PDFs oficiais de 30/06/2026)
  const ESQ_RCE = { emit: 31, emitL: 245, pac: 307, pacL: 275, pacY: 0, rx: 36, rxL: 520, num: 398 };
  const ESQ_NR = { emit: 70, emitL: 245, pac: 334, pacL: 248, pacY: 5, rx: 72, rxL: 510, num: 398 };
  const MODELOS = {
    controle_especial: Object.assign({ arq: 'rce', ctx: [281, 134, 171, 115, 107], rod: [[139, 716], [173, 738], [181, 780]], qr: [489, 708, 78] }, ESQ_RCE),
    notificacao_b: Object.assign({ arq: 'nrb', ctx: [316, 170, 206, 151, 142], rod: [[178, 722], [211, 743], [220, 785]], qr: [506, 710, 78] }, ESQ_NR),
    notificacao_a: Object.assign({ arq: 'nra', ctx: [316, 170, 206, 151, 142], rod: [[176, 722], [209, 743], [218, 785]], qr: [506, 710, 78] }, ESQ_NR),
    notificacao_b2: Object.assign({ arq: 'nrb2', ctx: [316, 170, 206, 151, 142], rod: [[176, 725], [209, 746], [218, 788]], qr: [506, 713, 78] }, ESQ_NR, { num: 405 })
  };
  const Y_RX = [386, 416, 446, 476, 506];   // base do texto de cada rótulo da prescrição
  const ROTULO = { simples: 'Receita simples', controle_especial: 'Receita de Controle Especial', notificacao_a: 'Notificação de Receita A', notificacao_b: 'Notificação de Receita B', notificacao_b2: 'Notificação de Receita B2', retencao: 'Receita sujeita a retenção' };

  // fontes padrão do PDF usam WinAnsi: troca o que não existe nela
  const limpa = s => String(s == null ? '' : s).replace(/[½]/g, '1/2').replace(/[¼]/g, '1/4').replace(/[¾]/g, '3/4').replace(/[–—]/g, '-').replace(/[≥]/g, '>=').replace(/[≤]/g, '<=').replace(/[·]/g, '-').replace(/[^\x00-\xFF]/g, '');
  const fmtCPF = c => String(c || '').replace(/\D/g, '').replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  function quebra(texto, fonte, tam, larg) {
    const linhas = [];
    for (const par of limpa(texto).split('\n')) {
      let l = '';
      for (const p of par.split(/\s+/)) {
        const t = l ? l + ' ' + p : p;
        if (fonte.widthOfTextAtSize(t, tam) > larg && l) { linhas.push(l); l = p; } else l = t;
      }
      linhas.push(l);
    }
    return linhas;
  }
  // reduz o corpo até caber na largura (nunca abaixo de 6,5 pt)
  function caber(texto, fonte, tam, larg) { let t = tam; while (t > 6.5 && fonte.widthOfTextAtSize(limpa(texto), t) > larg) t -= 0.25; return t; }
  function dataTexto(iso) { return new Date(iso || Date.now()).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }); }

  // "Pregabalina 75 mg" → { nome: 'Pregabalina', conc: '75 mg' }
  function separarConcentracao(nome) {
    const m = /^(.*?\D)\s+(\d[\d.,]*\s*(?:mg|mcg|µg|g|ui|mL|ml|%)\b.*)$/i.exec(String(nome || '').trim());
    return m ? { nome: m[1].trim(), conc: m[2].trim() } : { nome: String(nome || '').trim(), conc: '' };
  }
  function textoQtd(it, tipo) {
    if (it.quantidade == null) return 'Uso contínuo' + (it.obs ? ' (' + it.obs + ')' : '');
    const un = (it.unidade || ['unidade', 'unidades'])[it.quantidade > 1 ? 1 : 0];
    return tipo !== 'simples' ? `${it.quantidade} (${extenso(it.quantidade)}) ${un}` : `${it.quantidade} ${un}`;
  }
  const enderecoPaciente = pa => [pa.endereco, pa.bairro, pa.cidade && pa.cidade + '/' + (pa.uf || '')].filter(Boolean).join(', ');
  function enderecoEmitente(med) {
    const dl = String(med.cnpjLocal || '').replace(/\D/g, '');
    const doc = dl.length === 14 ? 'CNPJ ' + dl.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5') : dl.length === 7 ? 'CNES ' + dl : '';
    return [[med.nomeLocal, doc].filter(Boolean).join(' - '), med.endereco, [med.cidade, med.ufEnd].filter(Boolean).join('/')].filter(Boolean).join(', ');
  }
  async function metadados(doc, p, med, rot) {
    doc.setTitle(rot + ' ' + (p.codigo || ''));
    doc.setAuthor(limpa(med.nome));
    doc.setSubject('Prescrição de medicamento');
    doc.setCreator('Meu Neuro'); doc.setProducer('Meu Neuro');
    doc.setKeywords(['prescricao', 'telemedicina']);
    const info = doc.getInfoDict();
    const oid = (k, v) => info.set(PDFName.of(k), PDFString.of(limpa(v)));
    oid('2.16.76.1.12.1.1', 'Prescrição de medicamento');
    oid('2.16.76.1.4.2.2.1', med.crm || '');
    oid('2.16.76.1.4.2.2.2', med.uf || '');
    oid('2.16.76.1.4.2.2.3', med.especialidade || '');
  }
  async function imagemQR(doc, url) {
    const d = await QRCode.toDataURL(url, { margin: 1, width: 300 });
    const bin = Uint8Array.from(typeof atob === 'function' ? atob(d.split(',')[1]).split('').map(c => c.charCodeAt(0)) : Buffer.from(d.split(',')[1], 'base64'));
    return doc.embedPng(bin);
  }
  function marcaTeste(pg, neg, texto) {
    pg.drawText(limpa(texto), { x: 70, y: 300, size: 30, font: neg, color: rgb(0.8, 0.1, 0.1), opacity: 0.22, rotate: PDFLib.degrees(30) });
  }

  /* ---------- modelos oficiais ---------- */
  async function documentoOficial(b, p, med, op) {
    const L = MODELOS[b.tipo], it = b.itens[0];
    const doc = await PDFDocument.create();
    const base = await PDFDocument.load(await lerModelo(L.arq));
    const [pg] = await doc.copyPages(base, [0]); doc.addPage(pg);
    const H = pg.getHeight();
    const reg = await doc.embedFont(StandardFonts.Helvetica), neg = await doc.embedFont(StandardFonts.HelveticaBold);
    const t = (s, x, y, f = reg, sz = 9) => pg.drawText(limpa(s), { x, y: H - y, size: sz, font: f, color: PRETO });
    const linha = (s, x, y, larg, sz = 9, f = reg) => t(s, x, y, f, caber(s, f, sz, larg));
    const pa = p.paciente || {};
    await metadados(doc, p, med, ROTULO[b.tipo]);
    if (b.numeroSNCR) linha(b.numeroSNCR, L.num, 45, 180, 11, neg);
    // emitente
    linha(med.nome, L.emit, 177, L.emitL);
    linha(`CRM ${med.crm}/${med.uf}${med.rqe ? ' - RQE ' + med.rqe : ''}`, L.emit, 216, L.emitL);
    quebra(enderecoEmitente(med), reg, 8, L.emitL).slice(0, 2).forEach((l, i) => t(l, L.emit, 252 + i * 9, reg, 8));
    linha(med.telefone, L.emit, 294, L.emitL);
    // paciente
    linha(pa.nome + (pa.responsavel ? ' (responsável: ' + pa.responsavel + ')' : ''), L.pac, 177 + L.pacY, L.pacL);
    linha(pa.cpf ? fmtCPF(pa.cpf) : (pa.passaporte || 'não possui'), L.pac, 216 + L.pacY, L.pacL);
    quebra(enderecoPaciente(pa), reg, 8.5, L.pacL).slice(0, 4).forEach((l, i) => t(l, L.pac, 254 + L.pacY + i * 10, reg, 8.5));
    // prescrição
    const n = separarConcentracao(it.nome);
    const vals = [n.nome, n.conc || it.concentracao || '', it.forma || '', textoQtd(it, b.tipo)];
    vals.forEach((v, i) => linha(v, L.ctx[i] + 6, Y_RX[i], L.rxL + L.rx - L.ctx[i] - 6, 10.5));
    let y = Y_RX[4];
    const pos = quebra(it.posologia || '', reg, 10.5, L.rxL + L.rx - L.ctx[4] - 6);
    pos.forEach((l, i) => { t(l, i === 0 ? L.ctx[4] + 6 : L.rx, y, reg, 10.5); y += 14; });
    y += 4;
    t(`Duração: ${it.dias} dias de tratamento.`, L.rx, y, reg, 9.5); y += 14;
    if (it.justificativa) quebra('Justificativa (Portaria 344/98, art. 60): ' + it.justificativa, reg, 9, L.rxL).forEach(l => { t(l, L.rx, y, reg, 9); y += 12; });
    // rodapé do modelo: só os valores
    const rod = (i, s) => { const [x, yy] = L.rod[i]; linha(s, x + 5, yy - 3.5, 490 - x - 5 + (L.arq === 'rce' ? 0 : 12), 7.5); };
    rod(0, PLATAFORMA);
    rod(1, op.emitidoEm ? `${med.nome}, CRM ${med.crm}/${med.uf}, certificado ICP-Brasil, ${dataTexto(op.emitidoEm)}` : 'Aguardando a assinatura digital do prescritor');
    if (op.urlVerificar) rod(2, op.urlVerificar);
    // QR: troca a amostra cinza do modelo pelo QR real da consulta no SNCR
    const [qx, qy, qs] = L.qr;
    pg.drawRectangle({ x: qx - 3, y: H - qy - qs - 3, width: qs + 6, height: qs + 14, color: rgb(1, 1, 1) });
    if (b.numeroSNCR) {
      const host = op.ambienteSNCR === 'producao' ? 'https://sncr.anvisa.gov.br' : 'https://sncr-treinamento.anvisa.gov.br';
      pg.drawImage(await imagemQR(doc, `${host}/receita/consultar?numero=${b.numeroSNCR}`), { x: qx, y: H - qy - qs, width: qs, height: qs });
    }
    if (op.marca) marcaTeste(pg, neg, op.marca);
    return doc.save({ useObjectStreams: false });
  }

  /* ---------- receita simples e sujeita a retenção (sem modelo oficial) ---------- */
  async function documentoLivre(b, p, med, op) {
    const doc = await PDFDocument.create();
    const reg = await doc.embedFont(StandardFonts.Helvetica), neg = await doc.embedFont(StandardFonts.HelveticaBold);
    await metadados(doc, p, med, ROTULO[b.tipo]);
    const qr = op.urlQR ? await imagemQR(doc, op.urlQR) : null;
    const W = A4[0] - 2 * M, pa = p.paciente || {}, ret = b.tipo === 'retencao';
    let pg, y;
    const t = (s, x, yy, f = reg, sz = 10, cor = PRETO) => pg.drawText(limpa(s), { x, y: yy, size: sz, font: f, color: cor });
    const direita = [[med.nomeLocal, enderecoEmitente({ cnpjLocal: med.cnpjLocal })].filter(Boolean).join(' - '), med.endereco, [med.cidade, med.ufEnd].filter(Boolean).join('/'), med.telefone, 'Teleconsulta - Meu Neuro'].filter(Boolean);
    const pagina = () => {
      pg = doc.addPage(A4); y = A4[1] - M;
      t(med.nome, M, y, neg, 15);
      direita.forEach((s, i) => { const w = reg.widthOfTextAtSize(limpa(s), 9); t(s, A4[0] - M - w, y - i * 12, reg, 9, CINZA); });
      t(['CRM ' + med.crm + '/' + med.uf, med.rqe ? 'RQE ' + med.rqe : '', med.especialidade].filter(Boolean).join(' - '), M, y - 16, reg, 9.5, CINZA);
      y -= Math.max(34, direita.length * 12 + 6);
      pg.drawLine({ start: { x: M, y }, end: { x: A4[0] - M, y }, thickness: 1.2 });
      y -= 26;
      const tit = ret ? 'RECEITA SUJEITA A RETENÇÃO' : 'RECEITUÁRIO';
      t(tit, (A4[0] - neg.widthOfTextAtSize(limpa(tit), 12)) / 2, y, neg, 12);
      if (ret && b.numeroSNCR) { const s = 'N.º ' + b.numeroSNCR; t(s, A4[0] - M - reg.widthOfTextAtSize(s, 9), y, reg, 9); }
      y -= 26;
    };
    pagina();
    t('Paciente: ', M, y, neg, 10.5); t(pa.nome, M + neg.widthOfTextAtSize('Paciente: ', 10.5), y, reg, 10.5); y -= 15;
    if (ret) { t(`Idade: ${op.idade != null ? op.idade + ' anos' : '-'}   Sexo: ${pa.sexo === 'F' ? 'feminino' : pa.sexo === 'M' ? 'masculino' : '-'}`, M, y, reg, 10.5); y -= 15; }
    for (const l of quebra('Endereço: ' + enderecoPaciente(pa), reg, 10.5, W)) { t(l, M, y, reg, 10.5); y -= 14; }
    if (pa.responsavel) { t('Responsável: ' + pa.responsavel, M, y, reg, 10.5); y -= 15; }
    y -= 12;
    b.itens.forEach((it, i) => {
      const pos = quebra(it.posologia, reg, 10.5, W - 14);
      if (y - (pos.length * 14 + 40) < 215) pagina();
      t(`${i + 1}. ${it.nome}${it.forma ? ', ' + it.forma : ''}`, M, y, neg, 11); y -= 15;
      pos.forEach(l => { t(l, M + 14, y, reg, 10.5); y -= 14; });
      t('Quantidade: ' + textoQtd(it, b.tipo) + (it.quantidade != null ? ' - ' + it.dias + ' dias de tratamento' : ''), M + 14, y, reg, 9.5, rgb(0.2, 0.2, 0.2)); y -= 23;
    });
    y = Math.min(y, 200);
    t(`${med.cidade || ''}${med.cidade ? ', ' : ''}${dataTexto(op.emitidoEm)} - Documento emitido em telemedicina`, M, y, reg, 9.5);
    const lx = (A4[0] - 260) / 2;
    pg.drawLine({ start: { x: lx, y: y - 38 }, end: { x: lx + 260, y: y - 38 }, thickness: 0.8 });
    const n1 = limpa(med.nome), n2 = limpa(`CRM ${med.crm}/${med.uf}${med.rqe ? ' - RQE ' + med.rqe : ''}`), n3 = 'Assinado digitalmente com certificado ICP-Brasil';
    t(n1, (A4[0] - reg.widthOfTextAtSize(n1, 10)) / 2, y - 51, reg, 10);
    t(n2, (A4[0] - reg.widthOfTextAtSize(n2, 9.5)) / 2, y - 63, reg, 9.5);
    t(n3, (A4[0] - reg.widthOfTextAtSize(n3, 8)) / 2, y - 75, reg, 8, CINZA);
    if (qr) {
      pg.drawImage(qr, { x: A4[0] - M - 78, y: 30, width: 78, height: 78 });
      const s = 'Valide em validar.iti.gov.br';
      t(s, A4[0] - M - 84 - reg.widthOfTextAtSize(s, 7.5), 36, reg, 7.5, CINZA);
    }
    t(`Pedido ${p.codigo || ''}${op.verificacao ? ' - Verificação ' + op.verificacao : ''}`, M, 36, reg, 8, CINZA);
    if (op.marca) doc.getPages().forEach(q => marcaTeste(q, neg, op.marca));
    return doc.save({ useObjectStreams: false });
  }

  /**
   * Gera o PDF de um bloco de p.receitas.
   * @param {object} b   bloco { tipo, itens, numeroSNCR }
   * @param {object} p   pedido
   * @param {object} med médico
   * @param {object} op  { emitidoEm, verificacao, urlVerificar, urlQR, idade, ambienteSNCR, marca }
   */
  async function gerarDocumento(b, p, med, op) {
    return MODELOS[b.tipo] ? documentoOficial(b, p, med, op || {}) : documentoLivre(b, p, med, op || {});
  }
  // blocos que viram documento: tudo com itens, menos o que o médico marcou para sair em papel
  const blocosEmitidos = p => (p.receitas || []).map((b, i) => ({ b, id: 'd' + i })).filter(x => x.b.itens && x.b.itens.length && !x.b.papel);

  return { gerarDocumento, blocosEmitidos, separarConcentracao, ROTULO, MODELOS, PLATAFORMA };
});
