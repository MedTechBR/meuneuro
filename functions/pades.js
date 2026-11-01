/* Meu Neuro — assinatura PAdES (ICP-Brasil) com assinatura RSA feita fora do servidor
   O certificado fica no prestador de assinatura em nuvem (VIDaaS etc.): o servidor monta o CMS,
   calcula o hash dos atributos assinados e pede ao prestador só a assinatura RAW (PKCS#1 v1.5).
   Atributos assinados no perfil PAdES básico: content-type, message-digest e signing-certificate-v2
   (sem signing-time, que no PAdES vai no dicionário da assinatura). */
const crypto = require('crypto');
const asn1js = require('asn1js');
const pkijs = require('pkijs');
const { PDFDocument } = require('pdf-lib');
const { SignPdf } = require('@signpdf/signpdf');
const { pdflibAddPlaceholder } = require('@signpdf/placeholder-pdf-lib');
const { Signer, SUBFILTER_ETSI_CADES_DETACHED } = require('@signpdf/utils');

pkijs.setEngine('node', new pkijs.CryptoEngine({ name: 'node', crypto: crypto.webcrypto }));

const OID = {
  data: '1.2.840.113549.1.7.1', signedData: '1.2.840.113549.1.7.2',
  contentType: '1.2.840.113549.1.9.3', messageDigest: '1.2.840.113549.1.9.4',
  signingCertificateV2: '1.2.840.113549.1.9.16.2.47', sha256: '2.16.840.1.101.3.4.2.1',
  rsaEncryption: '1.2.840.113549.1.1.1'
};

// aceita PEM ou base64 de DER
function certParaDER(c) {
  if (Buffer.isBuffer(c)) return c;
  const s = String(c).replace(/-----(BEGIN|END) CERTIFICATE-----/g, '').replace(/\s+/g, '');
  return Buffer.from(s, 'base64');
}
const ab = buf => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);

class SignerExterno extends Signer {
  /**
   * @param {Buffer[]} certsDER  [certificado do signatário, ...cadeia]
   * @param {(hash: Buffer) => Promise<Buffer>} assinarHash  devolve a assinatura RSA PKCS#1 v1.5 sobre o DigestInfo(SHA-256)
   */
  constructor(certsDER, assinarHash) { super(); this.certsDER = certsDER; this.assinarHash = assinarHash; }

  async sign(conteudo) {
    const certs = this.certsDER.map(d => pkijs.Certificate.fromBER(ab(d)));
    const cert = certs[0];
    const digest = crypto.createHash('sha256').update(conteudo).digest();
    const hashCert = crypto.createHash('sha256').update(this.certsDER[0]).digest();
    // SigningCertificateV2 ::= SEQUENCE { certs SEQUENCE OF ESSCertIDv2 }  (hash padrão = SHA-256, omitido)
    const essV2 = new asn1js.Sequence({ value: [new asn1js.Sequence({ value: [new asn1js.Sequence({ value: [new asn1js.OctetString({ valueHex: ab(hashCert) })] })] })] });
    const signedAttrs = new pkijs.SignedAndUnsignedAttributes({
      type: 0,
      attributes: [
        new pkijs.Attribute({ type: OID.contentType, values: [new asn1js.ObjectIdentifier({ value: OID.data })] }),
        new pkijs.Attribute({ type: OID.messageDigest, values: [new asn1js.OctetString({ valueHex: ab(digest) })] }),
        new pkijs.Attribute({ type: OID.signingCertificateV2, values: [essV2] })
      ]
    });
    // o que se assina é o DER dos atributos com a etiqueta SET (0x31) no lugar de [0] implícito
    const der = Buffer.from(signedAttrs.toSchema().toBER(false));
    der[0] = 0x31;
    const hashAttrs = crypto.createHash('sha256').update(der).digest();
    const assinatura = await this.assinarHash(hashAttrs);

    const signerInfo = new pkijs.SignerInfo({
      version: 1,
      sid: new pkijs.IssuerAndSerialNumber({ issuer: cert.issuer, serialNumber: cert.serialNumber }),
      digestAlgorithm: new pkijs.AlgorithmIdentifier({ algorithmId: OID.sha256 }),
      signatureAlgorithm: new pkijs.AlgorithmIdentifier({ algorithmId: OID.rsaEncryption, algorithmParams: new asn1js.Null() }),
      signedAttrs,
      signature: new asn1js.OctetString({ valueHex: ab(assinatura) })
    });
    const sd = new pkijs.SignedData({
      version: 1,
      digestAlgorithms: [new pkijs.AlgorithmIdentifier({ algorithmId: OID.sha256 })],
      encapContentInfo: new pkijs.EncapsulatedContentInfo({ eContentType: OID.data }),
      certificates: certs,
      signerInfos: [signerInfo]
    });
    const ci = new pkijs.ContentInfo({ contentType: OID.signedData, content: sd.toSchema(true) });
    return Buffer.from(ci.toSchema().toBER(false));
  }
}

/**
 * Assina um PDF (Uint8Array/Buffer) e devolve o PDF assinado (Buffer).
 * @param {Uint8Array} pdf
 * @param {{certs: (string|Buffer)[], assinarHash: Function, nome?: string, local?: string, motivo?: string}} op
 */
async function assinarPDF(pdf, op) {
  const doc = await PDFDocument.load(pdf);
  pdflibAddPlaceholder({
    pdfDoc: doc,
    reason: op.motivo || 'Prescrição de medicamento emitida em telemedicina',
    contactInfo: op.contato || '',
    name: op.nome || '',
    location: op.local || 'Brasil',
    signatureLength: 16384,
    subFilter: SUBFILTER_ETSI_CADES_DETACHED,
    widgetRect: [0, 0, 0, 0]
  });
  const comEspaco = Buffer.from(await doc.save({ useObjectStreams: false }));
  const signer = new SignerExterno(op.certs.map(certParaDER), op.assinarHash);
  return new SignPdf().sign(comEspaco, signer);
}

/**
 * Confere um PDF assinado por fora: integridade (hash do /ByteRange contra o message-digest do CMS) e
 * titular do certificado. CPF vem do OID 2.16.76.1.3.1 (SAN do e-CPF: 8 dígitos de nascimento + 11 de CPF).
 * A cadeia até a AC-Raiz quem confirma de forma definitiva é o validar.iti.gov.br.
 * @returns {{ok:boolean, motivo?:string, cpf?:string|null, titular?:string, icp?:boolean}}
 */
function conferirAssinatura(buf) {
  try {
    const txt = buf.toString('latin1');
    const faixas = [...txt.matchAll(/\/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\]/g)];
    if (!faixas.length) return { ok: false, motivo: 'PDF sem assinatura digital.' };
    const [, a, b, c, d] = faixas[faixas.length - 1].map(Number);
    if (c + d !== buf.length) return { ok: false, motivo: 'O PDF foi alterado depois de assinado.' };
    const hex = buf.slice(a + b, c).toString('latin1').replace(/[<>\s]/g, '').replace(/(00)+$/, '');
    const der = Buffer.from(hex, 'hex');
    const ci = pkijs.ContentInfo.fromBER(ab(der));
    const sd = new pkijs.SignedData({ schema: ci.content });
    const si = sd.signerInfos[0];
    const attr = (si.signedAttrs && si.signedAttrs.attributes || []).find(x => x.type === OID.messageDigest);
    const conteudo = Buffer.concat([buf.slice(a, a + b), buf.slice(c, c + d)]);
    const alg = String(si.digestAlgorithm.algorithmId);
    const nomeAlg = { '2.16.840.1.101.3.4.2.1': 'sha256', '2.16.840.1.101.3.4.2.2': 'sha384', '2.16.840.1.101.3.4.2.3': 'sha512', '1.3.14.3.2.26': 'sha1' }[alg];
    if (!attr || !nomeAlg) return { ok: false, motivo: 'Assinatura em formato não reconhecido.' };
    const esperado = Buffer.from(attr.values[0].valueBlock.valueHexView);
    if (!crypto.createHash(nomeAlg).update(conteudo).digest().equals(esperado)) return { ok: false, motivo: 'A assinatura não confere com o conteúdo do PDF.' };
    const cert = (sd.certificates || []).find(x => x instanceof pkijs.Certificate && x.serialNumber.isEqual(si.sid.serialNumber));
    if (!cert) return { ok: false, motivo: 'Certificado do signatário ausente no PDF.' };
    const nomes = cert.subject.typesAndValues.map(x => ({ t: x.type, v: x.value.valueBlock.value }));
    const titular = (nomes.find(x => x.t === '2.5.4.3') || {}).v || '';
    const icp = nomes.some(x => x.t === '2.5.4.10' && /ICP-Brasil/i.test(x.v));
    // o OID vem em DER no SAN (06 05 60 4C 01 03 01); o valor são dígitos ASCII. Na falta dele, o CN do e-CPF traz NOME:CPF.
    let cpf = null;
    const san = (cert.extensions || []).find(x => x.extnID === '2.5.29.17');
    if (san) {
      const bruto = Buffer.from(san.extnValue.valueBlock.valueHexView);
      const i = bruto.indexOf(Buffer.from('0605604c010301', 'hex'));
      if (i >= 0) {
        // depois do OID: [0] comprimento, tipo do texto, comprimento, valor (os bytes de comprimento podem parecer dígitos)
        const pula = p => p + 1 + (bruto[p + 1] < 0x80 ? 1 : 1 + (bruto[p + 1] & 0x7f));
        const m = /^\d{19}/.exec(bruto.slice(pula(pula(i + 7))).toString('latin1'));
        if (m) cpf = m[0].slice(8, 19);
      }
    }
    if (!cpf) { const m = /:(\d{11})$/.exec(titular); if (m) cpf = m[1]; }
    return { ok: true, cpf, titular, icp };
  } catch (e) { return { ok: false, motivo: 'Não consegui ler a assinatura deste PDF.' }; }
}

// DigestInfo(SHA-256) — útil para testes locais com chave própria
const PREFIXO_SHA256 = Buffer.from('3031300d060960864801650304020105000420', 'hex');
const digestInfo = hash => Buffer.concat([PREFIXO_SHA256, hash]);

module.exports = { assinarPDF, conferirAssinatura, SignerExterno, certParaDER, digestInfo };
