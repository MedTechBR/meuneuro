/* Meu Neuro — motor da conversa com o paciente
   Roteiro fixo (garante que nada importante fica sem perguntar) + interpretação de texto livre
   (nome do remédio, dose, posologia). Quando o backend tem IA publicada, ela entra como reforço
   para entender respostas que o interpretador local não resolveu e para dúvidas do paciente.
   Funciona em node (testes) e no navegador. */
(function (G) {
  const MN = G.MN = G.MN || {};
  const norm = MN.norm;
  const KB = () => G.MN_KB || [];
  MN.kbPorId = id => KB().find(m => m.id === id) || null;
  // nome para receita (DCB, sem os parênteses explicativos do banco)
  MN.nomeCurto = function (k, informado) {
    if (k.id === 'valproato') {
      const t = MN.norm(informado);
      if (/depakote|divalpro/.test(t)) return 'Divalproato de sódio';
      if (/depakene|valproic/.test(t) && !/sodio/.test(t)) return 'Ácido valproico';
      return 'Valproato de sódio';
    }
    return k.nome.replace(/\s*\(.*\)\s*$/, '');
  };

  /* ====================== interpretadores ====================== */
  function lev(a, b) {
    if (a === b) return 0;
    const m = a.length, n = b.length;
    if (!m) return n; if (!n) return m;
    let prev = Array.from({ length: n + 1 }, (_, i) => i), cur = new Array(n + 1);
    for (let i = 1; i <= m; i++) {
      cur[0] = i;
      for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      [prev, cur] = [cur, prev];
    }
    return prev[n];
  }
  const STOP = new Set(['sodio', 'acido', 'cloridrato', 'maleato', 'mesilato', 'bromidrato', 'hemitartarato', 'comprimido', 'comprimidos', 'capsula', 'liberacao', 'prolongada', 'retard', 'gotas', 'solucao', 'adesivo', 'oral', 'tomo', 'tomando', 'remedio', 'generico', 'para', 'dose', 'noite', 'manha', 'desde', 'anos', 'meses']);

  // procura o remédio no banco; devolve [{m, score, forte}] do mais provável ao menos
  MN.acharMed = function (texto) {
    const t = ' ' + norm(texto).replace(/[^a-z0-9+ ]/g, ' ').replace(/\s+/g, ' ') + ' ';
    const palavras = t.trim().split(' ').filter(w => w.length >= 4 && !STOP.has(w) && !/^\d/.test(w));
    const res = [];
    for (const m of KB()) {
      const nomes = [m.nome].concat(m.marcas || [], m.aliases || []);
      let melhor = 0, forte = false;
      for (const bruto of nomes) {
        const nn = norm(bruto).replace(/\(.*?\)/g, ' ').replace(/[^a-z0-9+ ]/g, ' ').replace(/\s+/g, ' ').trim();
        if (!nn) continue;
        if (t.includes(' ' + nn + ' ')) { melhor = Math.max(melhor, 100 + nn.length); forte = true; continue; }
        const partes = nn.split(/[ +]+/).filter(p => p.length >= 4 && !STOP.has(p));
        let soma = 0;
        for (const p of partes) {
          let pm = 0;
          for (const w of palavras) {
            if (w === p) pm = Math.max(pm, 60 + p.length);
            else {
              const d = lev(w, p), tol = p.length >= 8 ? 2 : 1;
              if (d <= tol) pm = Math.max(pm, 45 + p.length - d * 6);
              else if (w.length >= 5 && p.startsWith(w)) pm = Math.max(pm, 30 + w.length);
            }
          }
          soma += pm;
        }
        melhor = Math.max(melhor, soma);
      }
      if (melhor > 0) res.push({ m, score: melhor, forte });
    }
    res.sort((a, b) => b.score - a.score);
    return res;
  };

  MN.acharDose = function (texto) {
    const t = norm(texto).replace(/(\d),(\d)/g, '$1.$2');
    let m = t.match(/(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)\s*mg\b/);
    if (m) return m[1] + '/' + m[2] + ' mg';
    m = t.match(/(\d+(?:\.\d+)?)\s*(mg\/ml|mg\/gota|mg\/g|mcg|ug|mg|g|ml|%)(?![a-z])/);
    if (m) {
      const u = { ug: 'mcg', 'mg/ml': 'mg/mL', ml: 'mL' }[m[2]] || m[2];
      return String(m[1]).replace('.', ',') + ' ' + u;
    }
    return null;
  };
  // miligramas numéricos de uma dose ("500 mg" → 500; "250/25 mg" → 250)
  MN.mgDe = function (dose) {
    const t = norm(dose).replace(',', '.');
    let m = t.match(/(\d+(?:\.\d+)?)\s*(?:\/\s*\d+(?:\.\d+)?\s*)?mg\b(?!\/)/);
    if (m) return parseFloat(m[1]);
    m = t.match(/(\d+(?:\.\d+)?)\s*g\b/);
    if (m) return parseFloat(m[1]) * 1000;
    m = t.match(/(\d+(?:\.\d+)?)\s*mcg\b/);
    if (m) return parseFloat(m[1]) / 1000;
    return null;
  };

  const NUMPAL = { meio: 0.5, meia: 0.5, um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, oito: 8, doze: 12 };
  function numerosEmTexto(t) {
    return t
      .replace(/(\d),(\d)/g, '$1.$2')
      .replace(/\bum e meio\b|\buma e meia\b/g, '1.5')
      .replace(/\b(\d+) e (meio|meia)\b/g, (_, n) => String(+n + 0.5))
      .replace(/\b1\s*\/\s*2\b|½/g, '0.5')
      .replace(/\b1\s*\/\s*4\b|¼/g, '0.25')
      .replace(/\b(meio|meia|um|uma|dois|duas|tres|quatro|cinco|seis|oito|doze)\b/g, w => String(NUMPAL[w]));
  }
  const PERIODOS = [
    { k: 'manha', re: /\b(manha|cedo|cafe|acordar|jejum|matinal)\b/, rot: 'pela manhã', o: 1 },
    { k: 'meiodia', re: /\b(almoco|meio ?dia|12 ?h(oras)?)\b/, rot: 'ao meio-dia', o: 2 },
    { k: 'tarde', re: /\b(tarde|lanche)\b/, rot: 'à tarde', o: 3 },
    { k: 'noite', re: /\b(noite|jantar|dormir|deitar|noturno)\b/, rot: 'à noite', o: 4 }
  ];

  // "1 comprimido de manhã e 2 à noite" → {tomadas:[{p:'manha',q:1},{p:'noite',q:2}], unidadesDia:3, ...}
  MN.lerPosologia = function (texto) {
    const orig = String(texto || '');
    let t = numerosEmTexto(norm(orig));
    const r = { sos: false, tomadas: [], vezesDia: null, qtdPorTomada: null, unidadesDia: null, intervaloH: null, alternado: false, semanal: false };
    if (/(se necessario|quando (tiver|tenho|sentir|precisar|comeca|comecar|da |vem)|so (na|nas|quando|em) (crise|dor)|em caso de|\bs\/n\b|\bsos\b|se (dor|crise)|na hora da (dor|crise)|quando doi)/.test(t)) r.sos = true;
    // tira doses em mg para não confundir com quantidade
    t = t.replace(/\d+(?:\.\d+)?\s*(?:\/\s*\d+(?:\.\d+)?\s*)?(mg\/ml|mg|mcg|ug|g|ml)\b/g, ' ');
    let m;
    if ((m = t.match(/(?:de\s+)?(\d+)\s*(?:\/|em)\s*(\d+)\s*(?:h|hs|horas?)?\b/)) && m[1] === m[2] && 24 % +m[1] === 0) {
      r.intervaloH = +m[1]; r.vezesDia = 24 / +m[1]; t = t.replace(m[0], ' ');
    } else if ((m = t.match(/a cada (\d+)\s*(?:h|horas?)/))) {
      r.intervaloH = +m[1]; r.vezesDia = 24 / +m[1]; t = t.replace(m[0], ' ');
    }
    if (/dia sim,? dia nao|dias alternados/.test(t)) { r.alternado = true; t = t.replace(/dia sim,? dia nao|dias alternados/, ' '); }
    if ((m = t.match(/(\d+(?:\.\d+)?)\s*(?:x|vez|vezes)\s*(?:ao|por|no|na)?\s*semana/))) { r.semanal = +m[1]; t = t.replace(m[0], ' '); }
    if (!r.vezesDia && (m = t.match(/(\d+(?:\.\d+)?)\s*(?:x|vez|vezes)\s*(?:\/|ao|por|no|pelo)?\s*dia/))) { r.vezesDia = +m[1]; t = t.replace(m[0], ' '); }
    // períodos do dia, segmento a segmento
    const segs = t.split(/\s+e\s+|,|;|\+|\s+mais\s+|\s+depois\s+/);
    let qAnt = null;
    for (const s of segs) {
      const per = PERIODOS.filter(p => p.re.test(s));
      const nm = s.match(/(\d+(?:\.\d+)?)/);
      const q = nm ? parseFloat(nm[1]) : null;
      if (per.length) {
        const qq = q != null ? q : (qAnt != null ? qAnt : 1);
        for (const p of per) {
          if (!r.tomadas.find(x => x.p === p.k)) r.tomadas.push({ p: p.k, q: qq });
        }
        qAnt = qq;
      } else if (q != null) { qAnt = q; }
    }
    r.tomadas.sort((a, b) => PERIODOS.find(p => p.k === a.p).o - PERIODOS.find(p => p.k === b.p).o);
    if (r.tomadas.length && !r.intervaloH && !(r.vezesDia && r.vezesDia !== r.tomadas.length)) {
      r.vezesDia = r.tomadas.length;
      r.unidadesDia = r.tomadas.reduce((s, x) => s + x.q, 0);
      const qs = new Set(r.tomadas.map(x => x.q));
      r.qtdPorTomada = qs.size === 1 ? r.tomadas[0].q : null;
    } else {
      r.tomadas = [];
      r.qtdPorTomada = qAnt != null ? qAnt : 1;
      if (r.semanal) r.unidadesDia = r.qtdPorTomada * r.semanal / 7;
      else if (r.alternado) { r.vezesDia = r.vezesDia || 1; r.unidadesDia = r.qtdPorTomada * r.vezesDia / 2; }
      else if (r.vezesDia) r.unidadesDia = r.qtdPorTomada * r.vezesDia;
      else if (/(por dia|ao dia|diari|todo dia|todos os dias|1 vez)/.test(t) && qAnt != null) { r.vezesDia = 1; r.unidadesDia = r.qtdPorTomada; }
    }
    if (r.sos && !r.unidadesDia) { r.unidadesDia = null; }
    r.ok = !!(r.unidadesDia || r.sos);
    return r;
  };

  // unidade de administração a partir da apresentação
  MN.unidadeDe = function (forma) {
    const f = norm(forma);
    if (/adesivo/.test(f)) return ['adesivo', 'adesivos'];
    if (/gota/.test(f)) return ['gota', 'gotas'];
    if (/solucao|suspensao|xarope|ml/.test(f)) return ['mL', 'mL'];
    if (/capsula/.test(f)) return ['cápsula', 'cápsulas'];
    if (/drageia/.test(f)) return ['drágea', 'drágeas'];
    if (/sache|granulado/.test(f)) return ['sachê', 'sachês'];
    if (/spray|nasal/.test(f)) return ['jato', 'jatos'];
    if (/injet|ampola|caneta/.test(f)) return ['aplicação', 'aplicações'];
    return ['comprimido', 'comprimidos'];
  };
  function qtdUn(q, un) { return MN.fmtQtd(q) + ' ' + (q > 1 ? un[1] : un[0]); }

  // descrição da posologia, para o paciente conferir e para a receita
  MN.descPosologia = function (pos, forma, receita) {
    if (!pos) return '';
    const un = MN.unidadeDe(forma || '');
    let s = '';
    if (pos.tomadas && pos.tomadas.length) {
      const partes = pos.tomadas.map(x => qtdUn(x.q, un) + ' ' + PERIODOS.find(p => p.k === x.p).rot);
      s = partes.length > 1 ? partes.slice(0, -1).join(', ') + ' e ' + partes[partes.length - 1] : partes[0];
    } else if (pos.intervaloH) s = qtdUn(pos.qtdPorTomada, un) + ' de ' + pos.intervaloH + ' em ' + pos.intervaloH + ' horas';
    else if (pos.semanal) s = qtdUn(pos.qtdPorTomada, un) + ' ' + (pos.semanal === 1 ? 'uma vez' : MN.fmtQtd(pos.semanal) + ' vezes') + ' por semana';
    else if (pos.alternado) s = qtdUn(pos.qtdPorTomada, un) + ' em dias alternados';
    else if (pos.vezesDia) s = qtdUn(pos.qtdPorTomada, un) + (pos.vezesDia === 1 ? ' uma vez ao dia' : ' ' + MN.fmtQtd(pos.vezesDia) + ' vezes ao dia');
    else if (pos.sos) s = qtdUn(pos.qtdPorTomada || 1, un);
    if (pos.sos) s += (s ? ' ' : '') + 'se necessário (na crise)';
    if (receita) {
      const via = /adesivo/.test(norm(forma)) ? 'Aplicar' : 'Tomar';
      const sufixo = /adesivo/.test(norm(forma)) ? ' na pele (trocar conforme orientação)' : ' por via oral';
      return via + ' ' + s.replace(/^(\S+ \S+)/, '$1' + sufixo) + '.';
    }
    return s;
  };

  /* ====================== conteúdo fixo ====================== */
  MN.CONDICOES = [
    { v: 'epilepsia', c: 'Epilepsia', r: 'Epilepsia ou crises convulsivas' },
    { v: 'enxaqueca', c: 'Cefaleia', r: 'Enxaqueca ou outra dor de cabeça crônica' },
    { v: 'parkinson', c: 'Parkinson', r: 'Doença de Parkinson' },
    { v: 'demencia', c: 'Demência', r: 'Alzheimer ou outra demência' },
    { v: 'dor_neuropatica', c: 'Dor neuropática', r: 'Dor neuropática (queimação, choque, formigamento)' },
    { v: 'tremor', c: 'Tremor', r: 'Tremor essencial' },
    { v: 'avc', c: 'AVC', r: 'AVC (derrame) prévio' },
    { v: 'sono', c: 'Sono', r: 'Insônia ou outro distúrbio do sono' },
    { v: 'espasticidade', c: 'Espasticidade', r: 'Espasticidade (rigidez muscular)' }
  ];
  MN.condRot = v => (MN.CONDICOES.find(c => c.v === v) || { r: v }).r;
  MN.condCurta = v => (MN.CONDICOES.find(c => c.v === v) || { c: v }).c;

  MN.ALARMES = [
    { v: 'deficit', r: 'Fraqueza, dormência ou formigamento de repente em um lado do corpo, boca torta, fala enrolada ou perda de visão, agora ou nas últimas horas' },
    { v: 'cefaleia_subita', r: 'Dor de cabeça que começou de repente e muito forte, a pior da sua vida' },
    { v: 'crise_prolongada', r: 'Crise convulsiva hoje que durou mais de 5 minutos, ou crises seguidas sem acordar entre elas' },
    { v: 'febre_rigidez', r: 'Febre com nuca dura, confusão ou sonolência fora do normal' },
    { v: 'pele', r: 'Manchas, bolhas ou feridas na pele ou na boca, com febre, depois de começar ou aumentar um remédio' },
    { v: 'suicidio', r: 'Pensamentos de se machucar ou de tirar a própria vida' },
    { v: 'queda_cabeca', r: 'Batida forte na cabeça nas últimas 24 horas, com vômitos, sonolência ou confusão' }
  ];

  MN.ULTIMA_CONSULTA = [
    { v: 'ate6m', r: 'Há menos de 6 meses' },
    { v: '6a12m', r: 'Entre 6 meses e 1 ano' },
    { v: '1a2a', r: 'Entre 1 e 2 anos' },
    { v: 'mais2a', r: 'Há mais de 2 anos' },
    { v: 'nunca', r: 'Nunca consultei presencialmente com neurologista' }
  ];
  MN.rotulo = (lista, v) => ((lista || []).find(x => x.v === v) || { r: v || '' }).r;
  // minúscula inicial sem estragar siglas ("DIU de cobre" continua "DIU de cobre")
  MN.minus = s => (s && s.length > 1 && s[1] === s[1].toLowerCase()) ? s[0].toLowerCase() + s.slice(1) : (s || '');

  MN.COMORB = [
    { v: 'has', r: 'Pressão alta' }, { v: 'dm', r: 'Diabetes' }, { v: 'coracao', r: 'Doença do coração (infarto, angina, arritmia)' },
    { v: 'figado', r: 'Doença do fígado' }, { v: 'rim', r: 'Doença dos rins' }, { v: 'psiq', r: 'Depressão, ansiedade ou outro problema de saúde mental' },
    { v: 'asma', r: 'Asma ou bronquite' }, { v: 'glaucoma', r: 'Glaucoma' }, { v: 'prostata', r: 'Próstata aumentada ou dificuldade para urinar' },
    { v: 'osteoporose', r: 'Osteoporose' }
  ];

  MN.TEMPO_USO = [{ v: 'lt3m', r: 'Menos de 3 meses' }, { v: '3a12m', r: '3 a 12 meses' }, { v: '1a5a', r: '1 a 5 anos' }, { v: 'gt5a', r: 'Mais de 5 anos' }];
  MN.ADESAO = [{ v: 'boa', r: 'Nunca ou quase nunca esqueço' }, { v: 'as_vezes', r: 'Esqueço às vezes (cerca de 1 vez por semana)' }, { v: 'ruim', r: 'Esqueço com frequência' }];
  MN.EFICACIA = [{ v: 'boa', r: 'Sim, está funcionando bem' }, { v: 'parcial', r: 'Mais ou menos' }, { v: 'ruim', r: 'Não sinto que funciona' }];
  MN.DURACAO = [{ v: 30, r: '30 dias' }, { v: 60, r: '60 dias' }, { v: 90, r: '90 dias' }, { v: 180, r: '6 meses' }];
  MN.GESTACAO = [{ v: 'nao', r: 'Não' }, { v: 'gestante', r: 'Estou grávida' }, { v: 'amamentando', r: 'Estou amamentando' }, { v: 'planeja', r: 'Pretendo engravidar nos próximos meses' }];
  MN.CONTRACEP = [
    { v: 'hormonal_comb', r: 'Pílula, anel vaginal ou adesivo' }, { v: 'injecao', r: 'Injeção' }, { v: 'implante', r: 'Implante (chip)' },
    { v: 'diu_horm', r: 'DIU hormonal' }, { v: 'diu_cobre', r: 'DIU de cobre' }, { v: 'definitivo', r: 'Laqueadura ou vasectomia do parceiro' },
    { v: 'preservativo', r: 'Só preservativo' }, { v: 'nenhum', r: 'Não uso método' }, { v: 'na', r: 'Não se aplica (sem relações ou menopausa)' }
  ];
  MN.EP_ULTIMA = [{ v: 'lt30d', r: 'Nos últimos 30 dias' }, { v: '1a6m', r: 'Entre 1 e 6 meses' }, { v: '6a12m', r: 'Entre 6 meses e 1 ano' }, { v: 'gt1a', r: 'Há mais de 1 ano' }];
  MN.PK_SINT = [
    { v: 'wearing_off', r: 'O efeito do remédio acaba antes da próxima dose' }, { v: 'discinesia', r: 'Movimentos involuntários (o corpo "dança")' },
    { v: 'quedas', r: 'Quedas ou quase quedas' }, { v: 'alucinacao', r: 'Vê coisas que não existem ou fica confuso' },
    { v: 'hipotensao', r: 'Tontura ao levantar' }, { v: 'sono_subito', r: 'Pega no sono de repente durante o dia' },
    { v: 'impulsos', r: 'Vontade difícil de controlar de jogar, comprar, comer ou de sexo' }, { v: 'engasgo', r: 'Engasgos para engolir' }
  ];
  MN.DM_SINT = [
    { v: 'piora_rapida', r: 'A memória piorou rápido nas últimas semanas' }, { v: 'agitacao', r: 'Agitação ou agressividade' },
    { v: 'alucinacao', r: 'Vê ou ouve coisas que não existem' }, { v: 'quedas', r: 'Quedas' }, { v: 'peso', r: 'Perda de peso ou de apetite' },
    { v: 'sono', r: 'Troca o dia pela noite' }, { v: 'gastro', r: 'Náuseas, vômitos ou diarreia' }
  ];
  MN.CONTROLE_GERAL = [{ v: 'controlado', r: 'Controlados' }, { v: 'parcial', r: 'Melhoraram, mas ainda incomodam' }, { v: 'descontrolado', r: 'Não estão controlados' }, { v: 'piorando', r: 'Estão piorando' }];

  MN.ETAPAS = ['Seus dados', 'Segurança', 'Remédios', 'Sua saúde', 'Revisão'];
  const ETAPA_DE = {
    inicio: 0, nome: 0, nasc: 0, responsavel: 0, sexo: 0, contato: 0, endereco: 0,
    alarmes: 1, bloqueado: 1, condicoes: 1, ultima_consulta: 1, ep_ultima: 1, ep_freq: 1, cef_dias: 1, cef_analg: 1, pk_sint: 1, dm_resp: 1, dm_sint: 1, dn_int: 1, geral_controle: 1,
    med_nome: 2, med_escolha: 2, med_confirma: 2, med_dose: 2, med_pos: 2, med_pos_conf: 2, med_sos_freq: 2, med_tempo: 2, med_adesao: 2, med_efeitos: 2, med_eficacia: 2, med_mais: 2,
    outros_meds: 3, alergias: 3, comorb: 3, gest: 3, contracep: 3, exames: 3, exames_txt: 3, duracao: 3, livre: 3,
    revisao: 4, semia_texto: 3, fim_semia: 4, corrigir_qual: 4, corrigir_acao: 4, orientacao: 4, fim: 4
  };

  MN.TCLE_VERSAO = 'tcle-2026-09';
  MN.TCLE = 'Termo de consentimento para teleatendimento\n\n' +
    '1. O Meu Neuro faz renovação de receitas de remédios neurológicos por telemedicina (Lei 14.510/2022 e Resolução CFM 2.314/2022). A consulta presencial continua sendo a referência: o atendimento a distância tem limitações, como a falta de exame físico, e você pode interromper e optar pelo atendimento presencial a qualquer momento.\n\n' +
    '2. A primeira etapa é conduzida por um assistente automatizado (inteligência artificial) que só coleta informações e dá orientações gerais. Ele não faz diagnóstico, não muda doses e não decide o tratamento. Você pode recusar o assistente e seguir direto com o médico.\n\n' +
    '3. Um médico neurologista revisa todas as respostas, faz o atendimento e decide se renova, ajusta ou não renova a receita, que só vale depois da assinatura digital dele.\n\n' +
    '4. Seus dados de saúde são usados apenas para o seu atendimento (LGPD, art. 11, II, f), ficam no seu prontuário pelo prazo legal de 20 anos e só são vistos pela equipe que atende você. Nada é usado para propaganda ou vendido.\n\n' +
    '5. Este serviço não atende urgências. Em caso de urgência, ligue 192 (SAMU) ou procure um pronto-socorro.';

  MN.cpfValido = function (c) {
    const d = String(c || '').replace(/\D/g, '');
    if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
    for (const n of [9, 10]) {
      let s = 0;
      for (let i = 0; i < n; i++) s += +d[i] * (n + 1 - i);
      const dv = (s * 10) % 11 % 10;
      if (dv !== +d[n]) return false;
    }
    return true;
  };
  MN.fmtCPF = c => String(c || '').replace(/\D/g, '').replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');

  /* ====================== pedido novo ====================== */
  MN.novoPedido = function () {
    return {
      id: MN.uid(10), codigo: MN.codigo(), versao: 1, criadoEm: MN.agora(), atualizadoEm: MN.agora(),
      status: 'rascunho', paciente: {}, consentimento: null, alarmes: [], condicoes: [], condicaoOutra: '',
      ultimaConsulta: '', controle: {}, meds: [], outrosMeds: '', alergias: '', comorbidades: [], gestacao: '', contracepcao: '',
      exames: '', duracao: null, relato: '', duvidas: [], transcript: [], receitas: null, atendimento: null, historico: []
    };
  };
  function medVazio() {
    return { kbId: null, informado: '', nome: '', dose: '', forma: '', posologiaTexto: '', pos: null, usoMes: null, tempoUso: '', adesao: '', efeitos: [], efeitosOutros: '', eficacia: '', manter: true };
  }

  /* ====================== conversa ====================== */
  class Conversa {
    constructor(pedido, opts) {
      this.p = pedido || MN.novoPedido();
      this.o = opts || {};
      this.passo = this.p._passo || 'inicio';
      this.fila = this.p._fila || [];
      this.mi = this.p._mi != null ? this.p._mi : -1;
      this.corrigindo = this.p._corrigindo || null;
      this.tmp = this.p._tmp || {};
    }
    get med() { return this.p.meds[this.mi]; }
    get etapa() { return ETAPA_DE[this.passo] || 0; }
    fertil() { const i = MN.idade(this.p.paciente.nasc); return this.p.paciente.sexo === 'F' && i != null && i >= 10 && i <= 55; }
    primeiroNome() { return String(this.p.paciente.nome || '').split(' ')[0]; }
    salvarEstado() { Object.assign(this.p, { _passo: this.passo, _fila: this.fila, _mi: this.mi, _corrigindo: this.corrigindo, _tmp: this.tmp }); }
    ia(t, d) { return this.o.ia ? this.o.ia(t, d) : Promise.resolve(null); }

    registrar(de, texto) { if (texto) this.p.transcript.push({ de, texto: String(texto), t: MN.agora() }); }

    // devolve {msgs:[{texto,tipo}], input}
    perguntar() {
      const out = this._perguntar();
      for (const m of out.msgs) if (m.tipo !== 'orient') this.registrar('ia', m.texto);
      this.salvarEstado();
      return out;
    }

    async responder(valor, rotulo) {
      this.registrar('pac', rotulo != null ? rotulo : (Array.isArray(valor) ? valor.join(', ') : valor));
      let extra = [];
      try {
        const r = await this._responder(valor);
        if (r && r.msgs) extra = r.msgs;
      } catch (e) {
        extra = [{ texto: e.message || 'Não entendi. Pode repetir?' }];
      }
      for (const m of extra) this.registrar('ia', m.texto);
      const prox = this.perguntar();
      prox.msgs = extra.concat(prox.msgs);
      return prox;
    }

    _perguntar() {
      const p = this.p, nm = this.primeiroNome();
      switch (this.passo) {
        case 'inicio': return {
          msgs: [
            { texto: 'Olá! Eu sou a assistente virtual do Meu Neuro, um sistema automatizado (inteligência artificial). Vou adiantar a renovação da sua receita de remédios neurológicos antes de você ser atendido pelo médico.' },
            { texto: 'Vou perguntar quais remédios você usa, as doses, como toma, há quanto tempo e se sente algum efeito. No final, explico os cuidados com cada remédio. Depois, um neurologista revisa tudo, faz o seu atendimento e é ele quem decide e assina a receita.\n\nMinha função é só coletar informações e dar orientações gerais: eu não faço diagnóstico nem decido o tratamento. Este serviço não atende urgências. Leva cerca de 5 minutos.' }
          ],
          input: { tipo: 'chips', opcoes: [{ v: 'aceito', r: 'Concordo e quero começar', p: 1 }, { v: 'termos', r: 'Ler o termo de consentimento' }, { v: 'semia', r: 'Prefiro não usar o assistente' }] }
        };
        case 'nome': return { msgs: [{ texto: 'Para começar, qual é o seu nome completo? Se você está preenchendo por outra pessoa, escreva o nome do paciente.' }], input: { tipo: 'texto', ph: 'Nome completo do paciente', auto: 'name' } };
        case 'nasc': return { msgs: [{ texto: `Obrigada, ${nm}. Qual a data de nascimento?` }], input: { tipo: 'data' } };
        case 'responsavel': return { msgs: [{ texto: 'Como o paciente é menor de idade, preciso do nome completo do responsável que está acompanhando.' }], input: { tipo: 'texto', ph: 'Nome do responsável' } };
        case 'sexo': return { msgs: [{ texto: 'Qual o sexo biológico? Alguns remédios exigem cuidados diferentes, por exemplo na gravidez.' }], input: { tipo: 'chips', opcoes: [{ v: 'F', r: 'Feminino' }, { v: 'M', r: 'Masculino' }] } };
        case 'contato': return {
          msgs: [{ texto: 'Agora o CPF do paciente, que a lei exige na receita de remédios controlados, e o melhor telefone (WhatsApp) para o médico falar com você. O e-mail é opcional.' }],
          input: { tipo: 'form', campos: [{ k: 'cpf', r: 'CPF do paciente', tipo: 'cpf', ph: '000.000.000-00', obrig: 1 }, { k: 'telefone', r: 'Telefone com DDD', tipo: 'tel', ph: '(85) 99999-9999', obrig: 1 }, { k: 'email', r: 'E-mail (opcional)', tipo: 'email', ph: 'voce@exemplo.com' }], botao: 'Continuar' }
        };
        case 'endereco': return {
          msgs: [{ texto: 'E o endereço onde você mora, que também precisa constar na receita.' }],
          input: {
            tipo: 'form', botao: 'Continuar', campos: [
              { k: 'endereco', r: 'Rua, número e complemento', ph: 'Rua das Flores, 120, apto 302', obrig: 1 },
              { k: 'bairro', r: 'Bairro', ph: 'Centro', obrig: 1 },
              { k: 'cidade', r: 'Cidade', ph: 'Fortaleza', obrig: 1 },
              { k: 'uf', r: 'UF', tipo: 'uf', obrig: 1 }
            ]
          }
        };
        case 'alarmes': return {
          msgs: [{ texto: 'Antes dos remédios, uma checagem de segurança. Você está com algum destes sinais agora ou nas últimas horas?' }],
          input: { tipo: 'multi', opcoes: MN.ALARMES, nenhum: { v: 'nenhum', r: 'Nenhum destes' } }
        };
        case 'bloqueado': {
          const tem = v => p.alarmes.includes(v);
          const linhas = ['Pelo que você marcou, o mais seguro é ser avaliado pessoalmente agora, e não renovar a receita online.'];
          if (tem('suicidio')) linhas.push('Você não está sozinho. Ligue agora para o CVV no 188 (24 horas, gratuito) ou vá ao pronto-socorro mais próximo. Se houver risco imediato, ligue 192 (SAMU).');
          if (p.alarmes.some(a => a !== 'suicidio')) linhas.push('Procure um pronto-socorro agora ou ligue 192 (SAMU). Não dirija sozinho se estiver com esses sintomas.');
          linhas.push('Continue tomando seus remédios como de costume, a menos que um médico oriente diferente. Quando estiver bem, você pode voltar aqui para renovar a receita.');
          return { msgs: [{ texto: linhas.join('\n\n'), tipo: 'alerta' }], input: { tipo: 'fim', opcoes: [{ v: 'recomecar', r: 'Marquei errado, quero refazer' }] } };
        }
        case 'condicoes': return {
          msgs: [{ texto: 'Para qual problema você usa os remédios que quer renovar? Pode marcar mais de um.' }],
          input: { tipo: 'multi', opcoes: MN.CONDICOES, outro: 'Outro problema neurológico' }
        };
        case 'ultima_consulta': return { msgs: [{ texto: 'Quando foi sua última consulta presencial com neurologista?' }], input: { tipo: 'chips', opcoes: MN.ULTIMA_CONSULTA } };
        case 'ep_ultima': return { msgs: [{ texto: 'Sobre a epilepsia: quando foi sua última crise?' }], input: { tipo: 'chips', opcoes: MN.EP_ULTIMA } };
        case 'ep_freq': return { msgs: [{ texto: 'Quantas crises você teve nos últimos 3 meses? Um número aproximado já ajuda.' }], input: { tipo: 'numero', min: 0, max: 500, sufixo: 'crises', chips: [{ v: '1', r: '1' }, { v: '2', r: '2' }, { v: '3', r: '3 a 5' }, { v: '10', r: 'Mais de 5' }] } };
        case 'cef_dias': return { msgs: [{ texto: 'Sobre a dor de cabeça: em quantos dias por mês, em média, você tem dor?' }], input: { tipo: 'numero', min: 0, max: 31, sufixo: 'dias por mês', chips: [{ v: '2', r: 'Até 3 dias' }, { v: '6', r: '4 a 8 dias' }, { v: '12', r: '9 a 14 dias' }, { v: '20', r: '15 dias ou mais' }] } };
        case 'cef_analg': return { msgs: [{ texto: 'E em quantos dias por mês você toma algum remédio para a crise de dor (analgésico, anti-inflamatório ou triptano)?' }], input: { tipo: 'numero', min: 0, max: 31, sufixo: 'dias por mês', chips: [{ v: '2', r: 'Até 3 dias' }, { v: '6', r: '4 a 9 dias' }, { v: '12', r: '10 a 14 dias' }, { v: '20', r: '15 dias ou mais' }] } };
        case 'pk_sint': return { msgs: [{ texto: 'Sobre o Parkinson: você tem notado alguma destas coisas?' }], input: { tipo: 'multi', opcoes: MN.PK_SINT, nenhum: { v: 'nenhum', r: 'Nenhuma destas' } } };
        case 'dm_resp': return { msgs: [{ texto: 'Quem está respondendo às perguntas?' }], input: { tipo: 'chips', opcoes: [{ v: 'paciente', r: 'O próprio paciente' }, { v: 'cuidador', r: 'Um familiar ou cuidador' }] } };
        case 'dm_sint': return { msgs: [{ texto: 'Nos últimos meses, você notou alguma destas mudanças?' }], input: { tipo: 'multi', opcoes: MN.DM_SINT, nenhum: { v: 'nenhum', r: 'Nenhuma destas' } } };
        case 'dn_int': return { msgs: [{ texto: 'De 0 a 10, qual a intensidade média da dor neuropática com o tratamento atual?' }], input: { tipo: 'chips', opcoes: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => ({ v: String(n), r: String(n) })), compacto: 1 } };
        case 'geral_controle': {
          const rest = p.condicoes.filter(c => !['epilepsia', 'enxaqueca', 'parkinson', 'demencia', 'dor_neuropatica'].includes(c));
          const nomes = rest.map(c => c === 'outro' ? (p.condicaoOutra || 'outro problema') : MN.condRot(c).toLowerCase());
          return { msgs: [{ texto: `Com o tratamento atual, como estão os sintomas de ${nomes.join(' e ')}?` }], input: { tipo: 'chips', opcoes: MN.CONTROLE_GERAL } };
        }
        case 'med_nome': {
          const n = p.meds.filter(m => m.nome).length;
          const t = n === 0
            ? 'Agora vamos aos remédios. Qual é o nome do primeiro remédio que você quer renovar? Pode escrever como está na caixa, inclusive o nome comercial e a dose (ex.: Keppra 500 mg).'
            : 'Qual é o nome do próximo remédio?';
          return { msgs: [{ texto: t }], input: { tipo: 'texto', ph: 'Nome do remédio', dica: 'Se tiver a caixa por perto, copie o nome e a dose que estão nela.' } };
        }
        case 'med_escolha': {
          const ops = (this.tmp.candidatos || []).map(id => { const k = MN.kbPorId(id); return { v: id, r: k.nome + (k.marcas && k.marcas.length ? ' (' + k.marcas.slice(0, 2).join(', ') + ')' : '') }; });
          ops.push({ v: '_outro', r: 'Nenhum desses' });
          return { msgs: [{ texto: 'Encontrei mais de uma opção. Qual destes é o seu?' }], input: { tipo: 'chips', opcoes: ops } };
        }
        case 'med_confirma': {
          const c = this.tmp.sugestao ? MN.kbPorId(this.tmp.sugestao) : null;
          if (c) return { msgs: [{ texto: `Você quis dizer ${c.nome}${c.marcas && c.marcas.length ? ' (' + c.marcas.slice(0, 2).join(', ') + ')' : ''}?` }], input: { tipo: 'chips', opcoes: [{ v: 'sim', r: 'Sim, é esse', p: 1 }, { v: 'nao', r: 'Não, vou escrever de novo' }, { v: 'manter', r: `Não, é "${this.med.informado}" mesmo` }] } };
          return { msgs: [{ texto: `Não encontrei "${this.med.informado}" na minha lista de remédios neurológicos. Pode ser um nome que eu não conheço. Quer manter assim para o médico conferir ou escrever de novo?` }], input: { tipo: 'chips', opcoes: [{ v: 'manter', r: 'Manter assim' }, { v: 'nao', r: 'Escrever de novo' }] } };
        }
        case 'med_dose': {
          const k = MN.kbPorId(this.med.kbId);
          const ops = k ? (k.formas || []).filter(f => !/injet/.test(f.forma)).slice(0, 10).map((f, i) => ({ v: 'f' + (k.formas.indexOf(f)), r: f.dose + ' · ' + f.forma })) : [];
          return { msgs: [{ texto: `Qual a dose de cada ${k ? 'unidade' : 'comprimido ou cápsula'} de ${this.med.nome}? Olhe na caixa; geralmente está em mg.` }], input: { tipo: 'chips', opcoes: ops, texto: 1, ph: 'Ex.: 500 mg' } };
        }
        case 'med_pos': return {
          msgs: [{ texto: `Como você toma ${this.med.nome}${this.med.dose ? ' ' + this.med.dose : ''}? Escreva do seu jeito, por exemplo: "1 de manhã e 2 à noite" ou "meio comprimido antes de dormir".` }],
          input: { tipo: 'chips', texto: 1, ph: 'Como você toma', opcoes: [{ v: '1 uma vez ao dia', r: '1 vez ao dia' }, { v: '1 de 12 em 12 horas', r: '2 vezes ao dia (12 em 12 h)' }, { v: '1 de 8 em 8 horas', r: '3 vezes ao dia (8 em 8 h)' }, { v: '1 quando tenho crise', r: 'Só quando tenho crise ou dor' }] }
        };
        case 'med_pos_conf': {
          const m = this.med;
          let t = `Entendi: ${MN.descPosologia(m.pos, m.forma)}`;
          const tot = totalDia(m);
          if (tot && !m.pos.sos) t += ` (${MN.fmtNum(tot)} mg por dia)`;
          return { msgs: [{ texto: t + '. Está certo?' }], input: { tipo: 'chips', opcoes: [{ v: 'sim', r: 'Sim, está certo', p: 1 }, { v: 'nao', r: 'Não, vou corrigir' }] } };
        }
        case 'med_sos_freq': return { msgs: [{ texto: `Em quantos dias por mês, em média, você precisa usar ${this.med.nome}?` }], input: { tipo: 'numero', min: 0, max: 31, sufixo: 'dias por mês', chips: [{ v: '2', r: 'Até 3' }, { v: '6', r: '4 a 8' }, { v: '10', r: '9 a 14' }, { v: '15', r: '15 ou mais' }] } };
        case 'med_tempo': return { msgs: [{ texto: `Há quanto tempo você usa ${this.med.nome}?` }], input: { tipo: 'chips', opcoes: MN.TEMPO_USO } };
        case 'med_adesao': return { msgs: [{ texto: 'Você costuma esquecer alguma dose?' }], input: { tipo: 'chips', opcoes: MN.ADESAO } };
        case 'med_efeitos': {
          const k = MN.kbPorId(this.med.kbId);
          const ops = k ? (k.efeitosComuns || []).map((e, i) => ({ v: 'k' + i, r: e })) : [];
          return {
            msgs: [{ texto: k ? `Você sente algum destes efeitos que ${this.med.nome} pode causar?` : `Você sente algum efeito colateral com ${this.med.nome}?` }],
            input: { tipo: 'multi', opcoes: ops, nenhum: { v: 'nenhum', r: 'Não sinto nenhum efeito' }, outro: 'Outro efeito' }
          };
        }
        case 'med_eficacia': return { msgs: [{ texto: `E você acha que ${this.med.nome} está funcionando?` }], input: { tipo: 'chips', opcoes: MN.EFICACIA } };
        case 'med_mais': {
          const lista = p.meds.filter(m => m.nome).map(m => '• ' + m.nome + (m.dose ? ' ' + m.dose : '')).join('\n');
          return { msgs: [{ texto: `Anotei:\n${lista}\n\nVocê usa mais algum remédio neurológico que precisa renovar?` }], input: { tipo: 'chips', opcoes: [{ v: 'sim', r: 'Sim, tenho outro' }, { v: 'nao', r: 'Não, são só esses', p: 1 }] } };
        }
        case 'outros_meds': return { msgs: [{ texto: 'Você toma outros remédios, para qualquer problema? Por exemplo pressão, diabetes, colesterol, anticoncepcional, remédios para dormir ou vitaminas. Escreva os nomes.' }], input: { tipo: 'chips', texto: 1, ph: 'Outros remédios', opcoes: [{ v: '', r: 'Não tomo outros remédios' }] } };
        case 'alergias': return { msgs: [{ texto: 'Tem alergia a algum remédio?' }], input: { tipo: 'chips', texto: 1, ph: 'Qual remédio e o que aconteceu', opcoes: [{ v: '', r: 'Não tenho alergia a remédios' }] } };
        case 'comorb': return { msgs: [{ texto: 'Você tem algum destes problemas de saúde?' }], input: { tipo: 'multi', opcoes: MN.COMORB, nenhum: { v: 'nenhum', r: 'Nenhum destes' }, outro: 'Outro problema' } };
        case 'gest': return { msgs: [{ texto: 'Você está grávida, amamentando ou pretende engravidar em breve? Isso muda a escolha de alguns remédios neurológicos.' }], input: { tipo: 'chips', opcoes: MN.GESTACAO } };
        case 'contracep': return { msgs: [{ texto: 'Usa algum método para evitar gravidez? Alguns remédios para epilepsia diminuem o efeito da pílula.' }], input: { tipo: 'chips', opcoes: MN.CONTRACEP } };
        case 'exames': return { msgs: [{ texto: 'Fez exames de sangue nos últimos 12 meses?' }], input: { tipo: 'chips', opcoes: [{ v: 'sim', r: 'Sim' }, { v: 'nao', r: 'Não' }, { v: 'naosei', r: 'Não lembro' }] } };
        case 'exames_txt': return { msgs: [{ texto: 'Lembra quais foram e se deu alguma alteração? Pode resumir do seu jeito (ex.: "nível de ácido valproico normal em março").' }], input: { tipo: 'chips', texto: 1, ph: 'Exames e resultados', opcoes: [{ v: '', r: 'Não lembro os detalhes' }] } };
        case 'duracao': {
          const t = 'Por quanto tempo você precisa da receita? O médico decide a quantidade final, respeitando os limites da lei para remédios controlados.';
          return { msgs: [{ texto: t }], input: { tipo: 'chips', opcoes: MN.DURACAO.map(d => ({ v: String(d.v), r: d.r })) } };
        }
        case 'livre': return { msgs: [{ texto: 'Quase lá. Quer contar mais alguma coisa ao médico? Uma queixa nova, uma dúvida, algo que mudou.' }], input: { tipo: 'chips', texto: 1, area: 1, ph: 'Escreva aqui (opcional)', opcoes: [{ v: '', r: 'Não, é só isso' }] } };
        case 'revisao': return { msgs: [{ texto: 'Confira o resumo do seu pedido. Se estiver tudo certo, eu envio para o médico.', tipo: 'resumo' }], input: { tipo: 'chips', opcoes: [{ v: 'enviar', r: 'Está tudo certo, enviar', p: 1 }, { v: 'corrigir', r: 'Corrigir um remédio' }, { v: 'adicionar', r: 'Adicionar outro remédio' }] } };
        case 'corrigir_qual': return { msgs: [{ texto: 'Qual remédio você quer corrigir?' }], input: { tipo: 'chips', opcoes: p.meds.map((m, i) => ({ v: String(i), r: m.nome + (m.dose ? ' ' + m.dose : '') })).concat([{ v: 'voltar', r: 'Voltar' }]) } };
        case 'corrigir_acao': return { msgs: [{ texto: `O que você quer fazer com ${this.med.nome}?` }], input: { tipo: 'chips', opcoes: [{ v: 'refazer', r: 'Responder de novo' }, { v: 'remover', r: 'Remover (não uso mais)' }, { v: 'voltar', r: 'Voltar' }] } };
        case 'orientacao': return { msgs: MN.orientacoesPaciente(p).map(o => ({ texto: o.texto, html: o.html, tipo: 'orient' })).concat([{ texto: `Pronto, ${nm}! Seu pedido foi enviado ao médico. Guarde o código ${p.codigo} para acompanhar. Você recebe a receita assinada aqui mesmo, na tela "Acompanhar pedido", e o médico pode entrar em contato pelo telefone informado.` }]), input: { tipo: 'fim', opcoes: [{ v: 'acompanhar', r: 'Acompanhar meu pedido', p: 1 }] } };
        case 'semia_texto': return { msgs: [{ texto: 'Escreva quais remédios você precisa renovar e o que mais quiser contar ao médico.' }], input: { tipo: 'texto', area: 1, ph: 'Remédios e observações' } };
        case 'fim_semia': return { msgs: [{ texto: `Pedido enviado. Guarde o código ${p.codigo}. O médico vai entrar em contato pelo telefone informado para fazer o atendimento.` }], input: { tipo: 'fim', opcoes: [{ v: 'acompanhar', r: 'Acompanhar meu pedido', p: 1 }] } };
        case 'fim': return { msgs: [], input: { tipo: 'fim', opcoes: [{ v: 'acompanhar', r: 'Acompanhar meu pedido', p: 1 }] } };
      }
      return { msgs: [{ texto: 'Algo saiu do roteiro. Vamos continuar.' }], input: { tipo: 'fim', opcoes: [] } };
    }

    // sequência depois das condições
    montarFilaControle() {
      const c = this.p.condicoes, f = [];
      if (c.includes('epilepsia')) f.push('ep_ultima');
      if (c.includes('enxaqueca')) f.push('cef_dias', 'cef_analg');
      if (c.includes('parkinson')) f.push('pk_sint');
      if (c.includes('demencia')) f.push('dm_resp', 'dm_sint');
      if (c.includes('dor_neuropatica')) f.push('dn_int');
      if (c.some(x => !['epilepsia', 'enxaqueca', 'parkinson', 'demencia', 'dor_neuropatica'].includes(x))) f.push('geral_controle');
      return f;
    }
    proximoDaFila(padrao) { this.passo = this.fila.length ? this.fila.shift() : padrao; }
    iniciarMed() { this.p.meds.push(medVazio()); this.mi = this.p.meds.length - 1; this.tmp = {}; this.passo = 'med_nome'; }
    posMed() {
      // fim do bloco de um remédio
      if (this.corrigindo) { this.corrigindo = null; this.passo = 'revisao'; return; }
      this.passo = 'med_mais';
    }

    async _responder(v) {
      const p = this.p;
      // pergunta do paciente no lugar da resposta
      if (typeof v === 'string' && /\?\s*$/.test(v.trim()) && !['inicio', 'nome', 'med_nome', 'livre', 'outros_meds', 'alergias', 'exames_txt'].includes(this.passo)) {
        p.duvidas.push(v.trim());
        const r = await this.ia('duvida', { pergunta: v, passo: this.passo, meds: p.meds.map(m => m.nome) });
        return { msgs: [{ texto: (r ? r + '\n\n' : 'Boa pergunta. Anotei para o médico responder no atendimento. ') + 'Agora, voltando à pergunta:' }] };
      }
      switch (this.passo) {
        case 'inicio':
          if (v === 'termos') return { msgs: [{ texto: MN.TCLE }] };
          p.consentimento = { em: MN.agora(), versao: MN.TCLE_VERSAO, texto: MN.TCLE, assistente: v !== 'semia' };
          if (v === 'semia') { p.semAssistente = true; this.passo = 'nome'; return { msgs: [{ texto: 'Tudo bem. Vou pedir só os dados obrigatórios e fazer uma checagem de segurança. O restante você conta diretamente ao médico, sem o assistente.' }] }; }
          this.passo = 'nome'; return;
        case 'nome': {
          const s = String(v || '').trim().replace(/\s+/g, ' ');
          if (s.split(' ').length < 2 || s.length < 5) throw new Error('Preciso do nome completo (nome e sobrenome), como no documento.');
          p.paciente.nome = s.replace(/\b\w/g, c => c.toUpperCase()).replace(/\b(Da|De|Do|Das|Dos|E)\b/g, w => w.toLowerCase());
          this.passo = 'nasc'; return;
        }
        case 'nasc': {
          const i = MN.idade(v);
          if (i == null || i < 0 || i > 120) throw new Error('Não consegui entender a data. Use o formato dia/mês/ano.');
          p.paciente.nasc = v; p.paciente.idade = i;
          this.passo = i < 18 ? 'responsavel' : 'sexo'; return;
        }
        case 'responsavel': {
          const s = String(v || '').trim();
          if (s.split(/\s+/).length < 2) throw new Error('Escreva o nome completo do responsável.');
          p.paciente.responsavel = s; this.passo = 'sexo'; return;
        }
        case 'sexo': p.paciente.sexo = v; this.passo = 'contato'; return;
        case 'contato': {
          const tel = String(v.telefone || '').replace(/\D/g, '');
          if (tel.length < 10 || tel.length > 13) throw new Error('Confira o telefone: coloque o DDD e o número.');
          if (v.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.email)) throw new Error('O e-mail parece incompleto. Corrija ou deixe em branco.');
          if (!MN.cpfValido(v.cpf)) throw new Error('Este CPF não parece válido. Confira os números.');
          p.paciente.cpf = String(v.cpf).replace(/\D/g, '');
          p.paciente.telefone = tel; p.paciente.email = String(v.email || '').trim(); this.passo = 'endereco'; return;
        }
        case 'endereco': {
          for (const k of ['endereco', 'bairro', 'cidade', 'uf']) if (!String(v[k] || '').trim()) throw new Error('Preencha todos os campos do endereço.');
          Object.assign(p.paciente, { endereco: v.endereco.trim(), bairro: v.bairro.trim(), cidade: v.cidade.trim(), uf: v.uf });
          this.passo = 'alarmes'; return;
        }
        case 'alarmes': {
          const sel = (v || []).filter(x => x !== 'nenhum');
          p.alarmes = sel;
          if (sel.length) { p.status = 'urgencia'; this.passo = 'bloqueado'; return; }
          this.passo = p.semAssistente ? 'semia_texto' : 'condicoes'; return;
        }
        case 'semia_texto': {
          const s = String(v || '').trim();
          if (s.length < 3) throw new Error('Escreva pelo menos o nome dos remédios que precisa renovar.');
          p.relato = s; p.status = 'aguardando'; p.enviadoEm = MN.agora();
          p.alertas = [{ nivel: 'medio', texto: 'Paciente optou por não usar o assistente: anamnese e prescrição devem ser feitas no atendimento.' }];
          p.resumo = MN.resumoClinico(p); p.receitas = [];
          p.historico.push({ em: MN.agora(), evento: 'Pedido enviado pelo paciente (sem assistente)' });
          this.passo = 'fim_semia'; return;
        }
        case 'bloqueado':
          if (v === 'recomecar') { p.alarmes = []; p.status = 'rascunho'; this.passo = 'alarmes'; }
          return;
        case 'condicoes': {
          const arr = (v.sel || v || []).slice();
          if (v.outro) { arr.push('outro'); p.condicaoOutra = String(v.outro).trim(); }
          if (!arr.length) throw new Error('Marque pelo menos uma opção.');
          p.condicoes = arr; this.passo = 'ultima_consulta'; return;
        }
        case 'ultima_consulta':
          p.ultimaConsulta = v; this.fila = this.montarFilaControle(); this.proximoDaFila('med_nome');
          if (this.passo === 'med_nome') this.iniciarMed();
          return;
        case 'ep_ultima':
          p.controle.epUltima = v;
          if (v === 'lt30d' || v === '1a6m') { this.passo = 'ep_freq'; return; }
          p.controle.epCrises3m = 0; this.proximoDaFila('med_nome'); if (this.passo === 'med_nome') this.iniciarMed(); return;
        case 'ep_freq': {
          const n = parseInt(v, 10); if (isNaN(n) || n < 0) throw new Error('Escreva um número.');
          p.controle.epCrises3m = n; this.proximoDaFila('med_nome'); if (this.passo === 'med_nome') this.iniciarMed(); return;
        }
        case 'cef_dias': { const n = parseInt(v, 10); if (isNaN(n) || n < 0 || n > 31) throw new Error('Escreva um número de 0 a 31.'); p.controle.cefDias = n; this.proximoDaFila('med_nome'); if (this.passo === 'med_nome') this.iniciarMed(); return; }
        case 'cef_analg': { const n = parseInt(v, 10); if (isNaN(n) || n < 0 || n > 31) throw new Error('Escreva um número de 0 a 31.'); p.controle.cefAnalg = n; this.proximoDaFila('med_nome'); if (this.passo === 'med_nome') this.iniciarMed(); return; }
        case 'pk_sint': p.controle.pk = (v || []).filter(x => x !== 'nenhum'); this.proximoDaFila('med_nome'); if (this.passo === 'med_nome') this.iniciarMed(); return;
        case 'dm_resp': p.controle.dmResp = v; this.passo = 'dm_sint'; return;
        case 'dm_sint': p.controle.dm = (v || []).filter(x => x !== 'nenhum'); this.proximoDaFila('med_nome'); if (this.passo === 'med_nome') this.iniciarMed(); return;
        case 'dn_int': p.controle.dnInt = parseInt(v, 10); this.proximoDaFila('med_nome'); if (this.passo === 'med_nome') this.iniciarMed(); return;
        case 'geral_controle': p.controle.geral = v; this.proximoDaFila('med_nome'); if (this.passo === 'med_nome') this.iniciarMed(); return;

        case 'med_nome': {
          const s = String(v || '').trim();
          if (s.length < 3) throw new Error('Escreva o nome do remédio.');
          const m = this.med; m.informado = s;
          const dose = MN.acharDose(s); if (dose) m.dose = dose;
          const achados = MN.acharMed(s);
          const repetido = id => p.meds.some((x, i) => i !== this.mi && x.kbId === id);
          if (achados.length) {
            const top = achados[0].score;
            const empate = achados.filter(a => a.score >= top - 2).slice(0, 4);
            if (empate.length > 1) { this.tmp.candidatos = empate.map(a => a.m.id); this.passo = 'med_escolha'; return; }
            if (achados[0].forte || top >= 60) {
              if (repetido(achados[0].m.id)) throw new Error(`Você já me falou de ${achados[0].m.nome}. Se toma em mais de um horário, tudo bem: vamos registrar a forma completa nele. Qual é o próximo remédio?`);
              this.definirMed(achados[0].m); return;
            }
            this.tmp.sugestao = achados[0].m.id; this.passo = 'med_confirma'; return;
          }
          const r = await this.ia('identificar_remedio', { texto: s, lista: KB().map(k => k.id) });
          const id = r && String(r).trim().toLowerCase();
          if (id && MN.kbPorId(id)) { this.tmp.sugestao = id; } else this.tmp.sugestao = null;
          this.passo = 'med_confirma'; return;
        }
        case 'med_escolha':
          if (v === '_outro') { this.tmp.sugestao = null; this.passo = 'med_confirma'; return; }
          this.definirMed(MN.kbPorId(v)); return;
        case 'med_confirma':
          if (v === 'sim' && this.tmp.sugestao) { this.definirMed(MN.kbPorId(this.tmp.sugestao)); return; }
          if (v === 'manter') { const m = this.med; m.kbId = null; m.nome = m.informado.replace(/\s*\d+(?:[.,]\d+)?\s*(mg|mcg|g|ml)\b.*$/i, '').trim() || m.informado; this.passo = m.dose ? 'med_pos' : 'med_dose'; return; }
          this.med.informado = ''; this.passo = 'med_nome'; return;
        case 'med_dose': {
          const m = this.med, s = String(v || '').trim();
          const k = MN.kbPorId(m.kbId);
          if (k && /^f\d+$/.test(s) && k.formas[+s.slice(1)]) { const f = k.formas[+s.slice(1)]; m.dose = f.dose; m.forma = f.forma; }
          else {
            const d = MN.acharDose(s) || (/^\d+([.,]\d+)?(\s*\/\s*\d+([.,]\d+)?)?$/.test(s) ? s.replace('.', ',').replace(/\s/g, '') + ' mg' : null);
            if (!d) throw new Error('Não entendi a dose. Escreva o número e a unidade, por exemplo 500 mg.');
            m.dose = d; this.completarForma(m);
          }
          this.passo = 'med_pos'; return;
        }
        case 'med_pos': {
          const m = this.med; m.posologiaTexto = String(v || '').trim();
          let pos = MN.lerPosologia(m.posologiaTexto);
          if (!pos.ok) {
            const r = await this.ia('posologia', { texto: m.posologiaTexto, remedio: m.nome, dose: m.dose });
            try { const j = r && JSON.parse(String(r).replace(/^```(json)?|```$/g, '').trim()); if (j && (j.unidadesDia || j.sos)) pos = Object.assign(pos, j, { ok: true }); } catch (e) { }
          }
          if (!pos.ok) throw new Error('Não consegui entender como você toma. Tente assim: quantos comprimidos e em quais horários, por exemplo "1 comprimido de manhã e 1 à noite".');
          m.pos = pos; this.passo = 'med_pos_conf'; return;
        }
        case 'med_pos_conf':
          if (v === 'nao') { this.passo = 'med_pos'; return; }
          this.passo = this.med.pos.sos ? 'med_sos_freq' : 'med_tempo'; return;
        case 'med_sos_freq': { const n = parseInt(v, 10); if (isNaN(n) || n < 0 || n > 31) throw new Error('Escreva um número de 0 a 31.'); this.med.usoMes = n; this.passo = 'med_tempo'; return; }
        case 'med_tempo': this.med.tempoUso = v; this.passo = 'med_adesao'; return;
        case 'med_adesao': this.med.adesao = v; this.passo = 'med_efeitos'; return;
        case 'med_efeitos': {
          const m = this.med, k = MN.kbPorId(m.kbId);
          const sel = (v.sel || v || []).filter(x => x !== 'nenhum');
          m.efeitos = sel.map(x => k && /^k\d+$/.test(x) ? k.efeitosComuns[+x.slice(1)] : x);
          m.efeitosOutros = v.outro ? String(v.outro).trim() : '';
          this.passo = 'med_eficacia'; return;
        }
        case 'med_eficacia': this.med.eficacia = v; this.posMed(); return;
        case 'med_mais':
          if (v === 'sim') { this.iniciarMed(); return; }
          this.passo = 'outros_meds'; return;
        case 'outros_meds': p.outrosMeds = String(v || '').trim(); this.passo = 'alergias'; return;
        case 'alergias': p.alergias = String(v || '').trim(); this.passo = 'comorb'; return;
        case 'comorb': {
          p.comorbidades = (v.sel || v || []).filter(x => x !== 'nenhum');
          if (v.outro) p.comorbidades.push('outro:' + String(v.outro).trim());
          this.passo = this.fertil() ? 'gest' : 'exames'; return;
        }
        case 'gest': p.gestacao = v; this.passo = v === 'gestante' ? 'exames' : 'contracep'; return;
        case 'contracep': p.contracepcao = v; this.passo = 'exames'; return;
        case 'exames': if (v === 'sim') { this.passo = 'exames_txt'; return; } p.exames = v === 'nao' ? 'Sem exames de sangue nos últimos 12 meses' : 'Não lembra'; this.passo = 'duracao'; return;
        case 'exames_txt': p.exames = String(v || '').trim() || 'Fez exames nos últimos 12 meses (sem detalhes)'; this.passo = 'duracao'; return;
        case 'duracao': p.duracao = parseInt(v, 10) || 30; this.passo = 'livre'; return;
        case 'livre': p.relato = String(v || '').trim(); this.passo = 'revisao'; return;
        case 'revisao':
          if (v === 'corrigir') { this.passo = 'corrigir_qual'; return; }
          if (v === 'adicionar') { this.iniciarMed(); this.corrigindo = 'um'; return; }
          p.meds = p.meds.filter(m => m.nome);
          p.alertas = MN.calcularAlertas(p);
          p.resumo = MN.resumoClinico(p);
          p.receitas = MN.montarReceitas(p);
          p.status = 'aguardando'; p.enviadoEm = MN.agora();
          p.historico.push({ em: MN.agora(), evento: 'Pedido enviado pelo paciente' });
          {
            const r = await this.ia('resumo', { resumo: p.resumo });
            if (r) p.resumoIA = r;
          }
          this.passo = 'orientacao'; return;
        case 'corrigir_qual':
          if (v === 'voltar') { this.passo = 'revisao'; return; }
          this.mi = parseInt(v, 10); this.passo = 'corrigir_acao'; return;
        case 'corrigir_acao':
          if (v === 'voltar') { this.passo = 'revisao'; return; }
          if (v === 'remover') { p.meds.splice(this.mi, 1); this.mi = -1; this.passo = p.meds.length ? 'revisao' : 'med_nome'; if (!p.meds.length) this.iniciarMed(); return; }
          p.meds[this.mi] = medVazio(); this.corrigindo = 'um'; this.tmp = {}; this.passo = 'med_nome'; return;
        case 'orientacao':
        case 'fim':
        case 'fim_semia':
          return;
      }
    }

    definirMed(k) {
      const m = this.med;
      m.kbId = k.id; m.nome = MN.nomeCurto(k, m.informado);
      if (!m.dose) {
        // "Depakote 500": número solto que bate com uma apresentação do banco
        const nums = (MN.norm(m.informado).match(/\b\d+(?:[.,]\d+)?(?:\/\d+(?:[.,]\d+)?)?\b/g) || []).map(n => n.replace('.', ','));
        const f = (k.formas || []).find(f => nums.some(n => MN.norm(f.dose).split(' ')[0] === n));
        if (f) { m.dose = f.dose; m.forma = f.forma; }
      }
      if (m.dose && !m.forma) this.completarForma(m);
      this.passo = m.dose ? 'med_pos' : 'med_dose';
    }
    completarForma(m) {
      const k = MN.kbPorId(m.kbId);
      if (!k) { m.forma = m.forma || 'comprimido'; return; }
      const alvo = MN.norm(m.dose).replace(/\s/g, '');
      const fs = (k.formas || []).filter(f => MN.norm(f.dose).replace(/\s/g, '') === alvo);
      // se o paciente escreveu a forma ("cápsula", "gotas", "liberação prolongada"), usa a que casar
      const txt = MN.norm(m.informado || '');
      const porTexto = fs.find(f => MN.norm(f.forma).split(' ').some(w => w.length > 5 && txt.includes(w)));
      if (porTexto || fs.length) m.forma = (porTexto || fs[0]).forma;
      else m.forma = m.forma || ((k.formas || [])[0] || {}).forma || 'comprimido';
    }
  }
  MN.Conversa = Conversa;

  function totalDia(m) {
    if (!m.pos || !m.pos.unidadesDia) return null;
    const mg = MN.mgDe(m.dose);
    if (mg == null || MN.unidadeDe(m.forma)[0] !== 'comprimido' && MN.unidadeDe(m.forma)[0] !== 'cápsula' && MN.unidadeDe(m.forma)[0] !== 'drágea') return null;
    return mg * m.pos.unidadesDia;
  }
  MN.totalDia = totalDia;
})(typeof window !== 'undefined' ? window : globalThis);
