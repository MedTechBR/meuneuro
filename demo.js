/* Meu Neuro — roteiros de exemplo (dados fictícios)
   Usado pelos testes automáticos (node) e pelo botão "Criar pedidos de exemplo" no modo local.
   Cada roteiro responde à conversa real, passo a passo, como um paciente faria. */
(function (G) {
  const MN = G.MN;

  function cpfFicticio(base9) {
    const d = String(base9).split('').map(Number);
    for (const n of [9, 10]) {
      let s = 0; for (let i = 0; i < n; i++) s += d[i] * (n + 1 - i);
      d.push((s * 10) % 11 % 10);
    }
    return d.join('');
  }
  function nascDeIdade(anos) { const d = new Date(); d.setFullYear(d.getFullYear() - anos); d.setMonth(2, 15); return d.toISOString().slice(0, 10); }

  MN.ROTEIROS = [
    {
      nome: 'Mariana Souza Lima', idade: 29, sexo: 'F', cpf: cpfFicticio('123456789'), tel: '85999990001',
      end: { endereco: 'Rua das Acácias, 120, apto 302', bairro: 'Aldeota', cidade: 'Fortaleza', uf: 'CE' },
      condicoes: ['epilepsia'], ultima: '6a12m', ep: { ultima: 'gt1a' },
      meds: [
        { texto: 'Depakote 500', pos: '1 de manhã e 1 à noite', tempo: '1a5a', adesao: 'boa', efeitos: [1], eficacia: 'boa' },
        { texto: 'keppra', dose: '500 mg', pos: '1 comprimido de 12 em 12 horas', tempo: '1a5a', adesao: 'as_vezes', efeitos: [], eficacia: 'boa' }
      ],
      outros: 'Anticoncepcional oral', alergias: '', comorb: [], gest: 'nao', contracep: 'hormonal_comb', exames: 'sim', examesTxt: 'Nível de ácido valproico normal em março', duracao: '90', livre: ''
    },
    {
      nome: 'José Carlos Andrade', idade: 71, sexo: 'M', cpf: cpfFicticio('987654321'), tel: '85988880002',
      end: { endereco: 'Av. Beira Mar, 900', bairro: 'Meireles', cidade: 'Fortaleza', uf: 'CE' },
      condicoes: ['parkinson', 'sono'], ultima: 'ate6m', pk: ['wearing_off', 'quedas'], geral: 'parcial',
      meds: [
        { texto: 'Prolopa 250', pos: '1 comprimido 3 vezes ao dia', tempo: 'gt5a', adesao: 'boa', efeitos: [], eficacia: 'parcial' },
        { texto: 'pramipexol 0,25 mg', pos: '1 de 8 em 8 horas', tempo: '1a5a', adesao: 'boa', efeitos: [0], eficacia: 'boa' },
        { texto: 'rivotril 0,5 mg', pos: 'meio comprimido antes de dormir', tempo: 'gt5a', adesao: 'boa', efeitos: [], eficacia: 'boa' }
      ],
      outros: 'Losartana 50 mg', alergias: 'Dipirona (manchas na pele)', comorb: ['has', 'prostata'], exames: 'nao', duracao: '90', livre: 'Tenho acordado várias vezes à noite.'
    },
    {
      nome: 'Fernanda Oliveira Castro', idade: 38, sexo: 'F', cpf: cpfFicticio('456789123'), tel: '85977770003',
      end: { endereco: 'Rua Tibúrcio Cavalcante, 45', bairro: 'Dionísio Torres', cidade: 'Fortaleza', uf: 'CE' },
      condicoes: ['enxaqueca'], ultima: 'ate6m', cef: { dias: '12', analg: '12' },
      meds: [
        { texto: 'amitriptilina 25mg', pos: '1 à noite', tempo: '3a12m', adesao: 'boa', efeitos: [0, 1], eficacia: 'parcial' },
        { texto: 'sumatriptana 50 mg', pos: '1 comprimido quando tenho crise', sosFreq: '12', tempo: '1a5a', adesao: 'boa', efeitos: [], eficacia: 'boa' }
      ],
      outros: '', alergias: '', comorb: [], gest: 'nao', contracep: 'diu_cobre', exames: 'naosei', duracao: '60', livre: 'A dor piorou nos últimos 2 meses?'
    }
  ];

  // conduz a conversa até o envio; devolve o pedido
  MN.rodarRoteiro = async function (R, opts) {
    const c = new MN.Conversa(null, opts || {});
    let mi = -1, guarda = 0;
    c.perguntar();
    while (!['orientacao', 'fim', 'bloqueado', 'fim_semia'].includes(c.passo)) {
      if (++guarda > 200) throw new Error('roteiro não terminou; parado em ' + c.passo);
      const m = R.meds[mi];
      const k = m && c.med ? MN.kbPorId(c.med.kbId) : null;
      let v;
      switch (c.passo) {
        case 'inicio': v = 'aceito'; break;
        case 'nome': v = R.nome; break;
        case 'nasc': v = nascDeIdade(R.idade); break;
        case 'responsavel': v = 'Responsável Exemplo Silva'; break;
        case 'sexo': v = R.sexo; break;
        case 'contato': v = { cpf: R.cpf, telefone: R.tel, email: '' }; break;
        case 'endereco': v = R.end; break;
        case 'alarmes': v = R.alarmes || ['nenhum']; break;
        case 'condicoes': v = R.condicoes; break;
        case 'ultima_consulta': v = R.ultima; break;
        case 'ep_ultima': v = R.ep.ultima; break;
        case 'ep_freq': v = String(R.ep.freq || 0); break;
        case 'cef_dias': v = R.cef.dias; break;
        case 'cef_analg': v = R.cef.analg; break;
        case 'pk_sint': v = R.pk.length ? R.pk : ['nenhum']; break;
        case 'dm_resp': v = 'cuidador'; break;
        case 'dm_sint': v = R.dm && R.dm.length ? R.dm : ['nenhum']; break;
        case 'dn_int': v = String(R.dn || 5); break;
        case 'geral_controle': v = R.geral || 'controlado'; break;
        case 'med_nome': mi++; v = R.meds[mi].texto; break;
        case 'med_escolha': v = c.tmp.candidatos[0]; break;
        case 'med_confirma': v = c.tmp.sugestao ? 'sim' : 'manter'; break;
        case 'med_dose': {
          const alvo = MN.norm(m.dose || '').replace(/\s/g, '');
          const i = k ? k.formas.findIndex(f => MN.norm(f.dose).replace(/\s/g, '') === alvo) : -1;
          v = i >= 0 ? 'f' + i : (m.dose || (k && k.formas[0] ? 'f0' : '10 mg'));
          break;
        }
        case 'med_pos': v = m.pos; break;
        case 'med_pos_conf': v = 'sim'; break;
        case 'med_sos_freq': v = m.sosFreq || '4'; break;
        case 'med_tempo': v = m.tempo; break;
        case 'med_adesao': v = m.adesao; break;
        case 'med_efeitos': v = m.efeitos.length ? m.efeitos.map(i => 'k' + i) : ['nenhum']; break;
        case 'med_eficacia': v = m.eficacia; break;
        case 'med_mais': v = mi < R.meds.length - 1 ? 'sim' : 'nao'; break;
        case 'outros_meds': v = R.outros; break;
        case 'alergias': v = R.alergias; break;
        case 'comorb': v = R.comorb.length ? R.comorb : ['nenhum']; break;
        case 'gest': v = R.gest || 'nao'; break;
        case 'contracep': v = R.contracep || 'na'; break;
        case 'exames': v = R.exames; break;
        case 'exames_txt': v = R.examesTxt || ''; break;
        case 'duracao': v = R.duracao; break;
        case 'livre': v = R.livre; break;
        case 'revisao': v = 'enviar'; break;
        default: throw new Error('passo sem resposta no roteiro: ' + c.passo);
      }
      await c.responder(v);
    }
    const p = JSON.parse(JSON.stringify(c.p));
    delete p._passo; delete p._fila; delete p._mi; delete p._corrigindo; delete p._tmp;
    return p;
  };

  MN.criarExemplos = async function () {
    for (const R of MN.ROTEIROS) {
      const p = await MN.rodarRoteiro(R);
      p.exemplo = true;
      await MN.backend.salvarPedido(p);
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
