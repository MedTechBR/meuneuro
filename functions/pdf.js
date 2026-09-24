/* RefilMed — PDF da receita gerado no servidor (pdf-lib)
   - Metadados com os OIDs que o validador do ITI usa para reconhecer documento de saúde
     (tipo de documento 2.16.76.1.12.1.1 = prescrição; CRM 2.16.76.1.4.2.2.1; UF 2.16.76.1.4.2.2.2;
     especialidade 2.16.76.1.4.2.2.3) — ver validar.iti.gov.br/guia-desenvolvedor.html.
   - QR code no padrão do ITI: aponta para a função receitaITI com _format e _secretCode.
   - Receita simples: endereço do paciente (Lei 5.991/73, art. 35); controle especial: CPF e numeração SNCR
     (Portaria 344/98, art. 55, redação da RDC 1.000/2025), via única eletrônica (RDC 1.000, art. 10). */
const { PDFDocument, StandardFonts, rgb, PDFName, PDFString, PDFDict } = require('pdf-lib');
const QRCode = require('qrcode');

const A4 = [595.28, 841.89];
const M = 48;

function quebra(texto, fonte, tamanho, largura) {
  const linhas = [];
  for (const par of String(texto || '').split('\n')) {
    let linha = '';
    for (const palavra of par.split(/\s+/)) {
      const teste = linha ? linha + ' ' + palavra : palavra;
      if (fonte.widthOfTextAtSize(teste, tamanho) > largura && linha) { linhas.push(linha); linha = palavra; }
      else linha = teste;
    }
    linhas.push(linha);
  }
  return linhas;
}
// fontes padrão do PDF usam WinAnsi: troca o que não existe nela
const limpa = s => String(s == null ? '' : s).replace(/[½]/g, '1/2').replace(/[¼]/g, '1/4').replace(/[¾]/g, '3/4').replace(/[–—]/g, '-').replace(/[≥]/g, '>=').replace(/[≤]/g, '<=').replace(/[^\x00-\xFF]/g, '');
const fmtCPF = c => String(c || '').replace(/\D/g, '').replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
const extenso = require('./extenso');

function textoQtd(it, tipo) {
  if (it.quantidade == null) return 'Uso contínuo' + (it.obs ? ' (' + it.obs + ')' : '');
  const un = it.quantidade > 1 ? it.unidade[1] : it.unidade[0];
  return tipo !== 'simples' ? `${it.quantidade} (${extenso(it.quantidade)}) ${un}` : `${it.quantidade} ${un}`;
}

/**
 * @param {object} p   pedido (paciente, receitas, codigo)
 * @param {object} med médico (nome, crm, uf, rqe, especialidade, endereco, cidade, ufEnd, telefone)
 * @param {object} op  { urlQR, emitidoEm, verificacao }
 * @returns {Promise<Uint8Array>}
 */
async function gerarPDF(p, med, op) {
  const doc = await PDFDocument.create();
  const reg = await doc.embedFont(StandardFonts.Helvetica);
  const neg = await doc.embedFont(StandardFonts.HelveticaBold);
  const emitido = new Date(op.emitidoEm || Date.now());
  const dataTxt = emitido.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const qrPng = op.urlQR ? await QRCode.toBuffer(op.urlQR, { margin: 1, width: 240 }) : null;
  const qrImg = qrPng ? await doc.embedPng(qrPng) : null;

  doc.setTitle('Receita ' + (p.codigo || ''));
  doc.setAuthor(limpa(med.nome));
  doc.setSubject('Prescrição de medicamento');
  doc.setCreator('RefilMed');
  doc.setProducer('RefilMed');
  doc.setKeywords(['prescricao', 'telemedicina']);
  // OIDs do ITI no dicionário de informações do documento
  const info = doc.getInfoDict();
  const oid = (k, v) => info.set(PDFName.of(k), PDFString.of(limpa(v)));
  oid('2.16.76.1.12.1.1', 'Prescrição de medicamento');
  oid('2.16.76.1.4.2.2.1', med.crm || '');
  oid('2.16.76.1.4.2.2.2', med.uf || '');
  oid('2.16.76.1.4.2.2.3', med.especialidade || '');

  const blocos = (p.receitas || []).filter(b => b.itens && b.itens.length && (b.tipo === 'simples' || b.tipo === 'controle_especial'));
  for (const b of blocos) {
    const pg = doc.addPage(A4);
    const W = A4[0] - 2 * M;
    let y = A4[1] - M;
    const t = (s, x, yy, f = reg, sz = 10, cor = rgb(0.07, 0.07, 0.07)) => pg.drawText(limpa(s), { x, y: yy, size: sz, font: f, color: cor });
    // cabeçalho
    t(med.nome, M, y, neg, 15);
    const direita = [med.endereco, [med.cidade, med.ufEnd].filter(Boolean).join('/'), med.telefone, 'Teleconsulta - RefilMed'].filter(Boolean);
    direita.forEach((s, i) => { const w = reg.widthOfTextAtSize(limpa(s), 9); t(s, A4[0] - M - w, y - i * 12, reg, 9, rgb(0.25, 0.25, 0.25)); });
    t(['CRM ' + med.crm + '/' + med.uf, med.rqe ? 'RQE ' + med.rqe : '', med.especialidade].filter(Boolean).join(' - '), M, y - 16, reg, 9.5, rgb(0.25, 0.25, 0.25));
    y -= Math.max(34, direita.length * 12 + 6);
    pg.drawLine({ start: { x: M, y }, end: { x: A4[0] - M, y }, thickness: 1.2 });
    y -= 26;
    const tit = b.tipo === 'controle_especial' ? 'RECEITUÁRIO DE CONTROLE ESPECIAL' : 'RECEITUÁRIO';
    t(tit, (A4[0] - neg.widthOfTextAtSize(limpa(tit), 12)) / 2, y, neg, 12);
    if (b.tipo === 'controle_especial') {
      const via = 'Via única eletrônica' + (b.numeroSNCR ? ' - Numeração SNCR ' + b.numeroSNCR : '');
      t(via, A4[0] - M - reg.widthOfTextAtSize(limpa(via), 8.5), A4[1] - M + 16, reg, 8.5, rgb(0.3, 0.3, 0.3));
    }
    y -= 26;
    // paciente
    const pa = p.paciente || {};
    t('Paciente: ', M, y, neg, 10.5); t(pa.nome, M + neg.widthOfTextAtSize('Paciente: ', 10.5), y, reg, 10.5);
    y -= 15;
    if (b.tipo === 'controle_especial') { t('CPF: ' + fmtCPF(pa.cpf), M, y, reg, 10.5); y -= 15; }
    else { for (const l of quebra('Endereço: ' + [pa.endereco, pa.bairro, pa.cidade && pa.cidade + '/' + (pa.uf || '')].filter(Boolean).join(', '), reg, 10.5, W)) { t(l, M, y, reg, 10.5); y -= 14; } }
    if (pa.responsavel) { t('Responsável: ' + pa.responsavel, M, y, reg, 10.5); y -= 15; }
    y -= 12;
    t('USO ORAL / CONFORME INDICADO', M, y, neg, 9.5);
    y -= 20;
    b.itens.forEach((it, i) => {
      t(`${i + 1}. ${it.nome}${it.forma ? ', ' + it.forma : ''}`, M, y, neg, 11); y -= 15;
      for (const l of quebra(it.posologia, reg, 10.5, W - 14)) { t(l, M + 14, y, reg, 10.5); y -= 14; }
      t('Quantidade: ' + textoQtd(it, b.tipo) + (it.quantidade != null ? ' - ' + it.dias + ' dias de tratamento' : ''), M + 14, y, reg, 9.5, rgb(0.2, 0.2, 0.2)); y -= 13;
      if (it.justificativa) { for (const l of quebra('Justificativa (Portaria 344/98, art. 60): ' + it.justificativa, reg, 9, W - 14)) { t(l, M + 14, y, reg, 9); y -= 12; } }
      y -= 10;
    });
    // data, assinatura e QR
    y = Math.min(y, 300);
    t(`${med.cidade || ''}${med.cidade ? ', ' : ''}${dataTxt} - Documento emitido em telemedicina`, M, y, reg, 9.5);
    const lx = (A4[0] - 260) / 2;
    pg.drawLine({ start: { x: lx, y: y - 44 }, end: { x: lx + 260, y: y - 44 }, thickness: 0.8 });
    const n1 = limpa(med.nome), n2 = limpa(`CRM ${med.crm}/${med.uf}${med.rqe ? ' - RQE ' + med.rqe : ''}`);
    t(n1, (A4[0] - reg.widthOfTextAtSize(n1, 10)) / 2, y - 58, reg, 10);
    t(n2, (A4[0] - reg.widthOfTextAtSize(n2, 9.5)) / 2, y - 71, reg, 9.5);
    t('Assinado digitalmente com certificado ICP-Brasil', (A4[0] - reg.widthOfTextAtSize('Assinado digitalmente com certificado ICP-Brasil', 8)) / 2, y - 84, reg, 8, rgb(0.3, 0.3, 0.3));
    if (b.tipo === 'controle_especial') {
      const cy = 118;
      pg.drawRectangle({ x: M, y: cy, width: W / 2 - 6, height: 70, borderWidth: 0.8, borderColor: rgb(0, 0, 0) });
      pg.drawRectangle({ x: M + W / 2 + 6, y: cy, width: W / 2 - 6, height: 70, borderWidth: 0.8, borderColor: rgb(0, 0, 0) });
      ['Identificação do comprador', 'Nome:', 'RG/Órgão emissor:', 'Endereço:', 'Telefone:'].forEach((s, i) => t(s, M + 6, cy + 58 - i * 12, i ? reg : neg, 8));
      ['Identificação do fornecedor', '', '', 'Assinatura do farmacêutico', 'Data: ___/___/_____'].forEach((s, i) => s && t(s, M + W / 2 + 12, cy + 58 - i * 12, i ? reg : neg, 8));
    }
    if (qrImg) {
      pg.drawImage(qrImg, { x: A4[0] - M - 78, y: 30, width: 78, height: 78 });
      t('Valide em validar.iti.gov.br', A4[0] - M - 78 - reg.widthOfTextAtSize('Valide em validar.iti.gov.br', 7.5) - 6, 36, reg, 7.5, rgb(0.3, 0.3, 0.3));
    }
    t(`Pedido ${p.codigo || ''}${op.verificacao ? ' - Verificação ' + op.verificacao : ''}`, M, 36, reg, 8, rgb(0.3, 0.3, 0.3));
  }
  if (!blocos.length) throw new Error('Nenhuma receita emissível no pedido.');
  return doc.save({ useObjectStreams: false });
}

module.exports = { gerarPDF };
