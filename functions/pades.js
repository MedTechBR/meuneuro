/* RefilMed — assinatura PAdES (ICP-Brasil) com assinatura RSA feita fora do servidor
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

// DigestInfo(SHA-256) — útil para testes locais com chave própria
const PREFIXO_SHA256 = Buffer.from('3031300d060960864801650304020105000420', 'hex');
const digestInfo = hash => Buffer.concat([PREFIXO_SHA256, hash]);

module.exports = { assinarPDF, SignerExterno, certParaDER, digestInfo };
