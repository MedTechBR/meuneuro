/* Meu Neuro — regras clínicas e regulatórias
   Alertas para o médico, resumo clínico, rascunho das receitas e orientações ao paciente.
   Tudo determinístico e auditável; os textos clínicos vêm do banco verificado (kb.js). */
(function (G) {
  const MN = G.MN = G.MN || {};
  const esc = MN.esc;

  /* ---- grupos de fármacos (ids do kb.js) ---- */
  const GR = {
    indutor: ['carbamazepina', 'oxcarbazepina', 'fenitoina', 'fenobarbital', 'primidona', 'topiramato'],
    teratoAlto: ['valproato'],
    teratoMod: ['topiramato', 'carbamazepina', 'fenitoina', 'fenobarbital', 'primidona'],
    bzd: ['clonazepam', 'clobazam', 'zolpidem'],
    triptano: ['sumatriptana', 'naratriptana', 'rizatriptana', 'zolmitriptana'],
    tca: ['amitriptilina', 'nortriptilina'],
    agonistaDA: ['pramipexol'],
    renal: ['gabapentina', 'pregabalina', 'levetiracetam', 'amantadina', 'memantina', 'pramipexol', 'lacosamida', 'topiramato'],
    serotoninergico: ['venlafaxina', 'duloxetina', 'amitriptilina', 'nortriptilina', 'trazodona'],
    antipsicotico: ['quetiapina'],
    anticolinergico: ['biperideno', 'amitriptilina', 'nortriptilina'],
    iache: ['donepezila', 'rivastigmina-oral', 'rivastigmina-adesivo', 'galantamina'],
    hepato: ['valproato', 'carbamazepina', 'fenitoina', 'fenobarbital', 'atorvastatina', 'duloxetina'],
    betabloq: ['propranolol'],
    antiagregante: ['aas', 'clopidogrel']
  };
  MN.GRUPOS = GR;
  const temGrupo = (p, g) => p.meds.filter(m => GR[g].includes(m.kbId));
  const nomes = arr => arr.map(m => m.nome).join(', ');

  /* ---- limites de receituário (Portaria SVS/MS 344/1998; ver docs/REGULATORIO.md) ---- */
  MN.RX_REGRAS = {
    simples: { rot: 'Receita simples', vias: 1, diasMax: null },
    controle_especial: { rot: 'Receituário de controle especial', vias: 2, diasMax: 60, diasMaxExcecao: 180 },
    notificacao_b: { rot: 'Notificação de Receita B', vias: 1, diasMax: 60, eletronica: false },
    notificacao_a: { rot: 'Notificação de Receita A', vias: 1, diasMax: 30, eletronica: false }
  };
  // exceção de 6 meses (art. 59, p.u.) só quando a indicação informada é a do grupo (epilepsia/Parkinson)
  MN.limiteDias = function (k, p) {
    if (!k) return null;
    const r = MN.RX_REGRAS[k.receituario] || MN.RX_REGRAS.simples;
    if (!r.diasMax) return null;
    if (k.excecao6meses && r.diasMaxExcecao && (!p || (p.condicoes || []).includes(k.excecao6meses))) return r.diasMaxExcecao;
    return r.diasMax;
  };

  function mgMax(k) {
    if (!k || !k.doseMaxDia) return null;
    const t = MN.norm(k.doseMaxDia).replace(/\./g, '').replace(',', '.');
    const m = t.match(/(\d+(?:\.\d+)?)\s*(mg\/kg|mg|g)\b/);
    if (!m || m[2] === 'mg/kg') return null;  // dose por peso: sem peso do paciente, não compara
    return parseFloat(m[1]) * (m[2] === 'g' ? 1000 : 1);
  }

  MN.acima180 = p => ['6a12m', '1a2a', 'mais2a'].includes(p.ultimaConsulta);
  MN.valproatoFertil = function (p) {
    const i = MN.idade(p.paciente.nasc);
    return p.paciente.sexo === 'F' && i != null && i >= 10 && i <= 55 && p.meds.some(m => m.kbId === 'valproato' && m.manter !== false);
  };

  /* ====================== alertas ====================== */
  MN.calcularAlertas = function (p) {
    const A = [];
    const add = (nivel, texto) => A.push({ nivel, texto });
    const idade = MN.idade(p.paciente.nasc);
    const fertil = p.paciente.sexo === 'F' && idade != null && idade >= 10 && idade <= 55;
    const c = p.controle || {};
    const cond = p.condicoes || [];
    const comorb = p.comorbidades || [];

    // acompanhamento
    if (p.ultimaConsulta === 'nunca') add('alto', 'Nunca consultou neurologista presencialmente: a relação pode começar a distância, mas o seguimento deve ser presencial (CFM 2.314/2022, art. 6º §3º). Plataforma é para renovação.');
    else if (MN.acima180(p)) add('alto', `Última consulta presencial ${MN.rotulo(MN.ULTIMA_CONSULTA, p.ultimaConsulta).toLowerCase()}: doença crônica exige consulta presencial em intervalo de até 180 dias (CFM 2.314/2022, art. 6º §2º). Registre sua decisão ao assinar.`);

    // controle da doença
    if (cond.includes('epilepsia')) {
      if (c.epUltima === 'lt30d') add('alto', `Crise nos últimos 30 dias (${c.epCrises3m != null ? c.epCrises3m : '?'} nos últimos 3 meses): epilepsia não controlada, avaliar ajuste e orientar sobre direção.`);
      else if (c.epUltima === '1a6m') add('medio', `Crise entre 1 e 6 meses (${c.epCrises3m != null ? c.epCrises3m : '?'} nos últimos 3 meses).`);
    }
    if (cond.includes('enxaqueca')) {
      if (c.cefAnalg >= 10) add(c.cefAnalg >= 15 ? 'alto' : 'medio', `Medicação de crise em ${c.cefAnalg} dias/mês: risco de cefaleia por uso excessivo de medicamentos (≥10 dias/mês para triptanos e combinados; ≥15 para analgésicos simples).`);
      if (c.cefDias >= 15) add('medio', `Cefaleia em ${c.cefDias} dias/mês: preenche critério de frequência de enxaqueca crônica; profilaxia atual pode ser insuficiente.`);
    }
    if (cond.includes('parkinson') && c.pk && c.pk.length) {
      const ag = temGrupo(p, 'agonistaDA');
      if (c.pk.includes('impulsos')) add('alto', 'Relata comportamento impulsivo/compulsivo' + (ag.length ? ` em uso de agonista dopaminérgico (${nomes(ag)})` : '') + ': transtorno do controle de impulsos.');
      if (c.pk.includes('alucinacao')) add('alto', 'Alucinações ou confusão: rever medicações (anticolinérgicos, amantadina, agonistas) e investigar causa.');
      if (c.pk.includes('sono_subito')) add(ag.length ? 'alto' : 'medio', 'Ataques de sono diurnos: orientar não dirigir' + (ag.length ? `; associado a ${nomes(ag)}` : '') + '.');
      if (c.pk.includes('quedas')) add('medio', 'Quedas ou quase quedas.');
      if (c.pk.includes('engasgo')) add('medio', 'Disfagia (engasgos): risco de aspiração.');
      if (c.pk.includes('wearing_off') || c.pk.includes('discinesia')) add('medio', 'Flutuações motoras (' + c.pk.filter(x => ['wearing_off', 'discinesia'].includes(x)).map(x => x === 'wearing_off' ? 'wearing-off' : 'discinesias').join(' e ') + '): ajuste de esquema pode ser necessário.');
      if (c.pk.includes('hipotensao')) add('medio', 'Tontura ao levantar: hipotensão ortostática.');
    }
    if (cond.includes('demencia') && c.dm && c.dm.length) {
      if (c.dm.includes('piora_rapida')) add('alto', 'Piora cognitiva rápida nas últimas semanas: investigar causa aguda (delirium, infecção, metabólica, medicação).');
      if (c.dm.includes('agitacao') || c.dm.includes('alucinacao')) add('medio', 'Sintomas neuropsiquiátricos (agitação/alucinações).');
      if (c.dm.includes('gastro') && temGrupo(p, 'iache').length) add('medio', 'Sintomas gastrointestinais em uso de anticolinesterásico.');
      if (c.dm.includes('peso')) add('medio', 'Perda de peso/apetite' + (temGrupo(p, 'iache').length ? ' (efeito possível do anticolinesterásico)' : '') + '.');
      if (c.dm.includes('quedas')) add('medio', 'Quedas.');
    }
    if (c.dnInt >= 7) add('medio', `Dor neuropática intensa (${c.dnInt}/10) apesar do tratamento.`);
    if (c.geral === 'descontrolado' || c.geral === 'piorando') add('medio', 'Paciente relata sintomas ' + (c.geral === 'piorando' ? 'piorando' : 'não controlados') + '.');

    // gestação e contracepção
    if (p.gestacao === 'gestante') add('alto', 'Gestante: rever cada medicação quanto a risco fetal; não renovar sem avaliação dirigida.');
    if (p.gestacao === 'amamentando') add('alto', 'Amamentando: conferir compatibilidade com lactação.');
    if (p.gestacao === 'planeja') add('alto', 'Planeja engravidar: planejamento pré-concepcional (ácido fólico, troca de fármacos teratogênicos).');
    const valp = temGrupo(p, 'teratoAlto');
    if (valp.length && fertil) add('alto', 'Valproato em mulher com potencial de engravidar: risco teratogênico e de neurodesenvolvimento (exigência de bula). Checklist obrigatório ao assinar: contracepção eficaz, gravidez descartada, alternativa considerada, ciência de risco.');
    const fb = p.meds.filter(m => m.kbId === 'fenobarbital');
    if (fb.length && fertil) add('alto', 'Fenobarbital em mulher com potencial de engravidar: a bula brasileira (Gardenal, ANVISA 2022) contraindica o uso em gestantes e em mulheres que podem engravidar; em meninas, trocar antes da menarca.');
    const tMod = temGrupo(p, 'teratoMod');
    if (tMod.length && fertil && p.gestacao !== 'gestante') add('medio', `Fármaco com risco teratogênico em mulher em idade fértil (${nomes(tMod)}): confirmar contracepção e planejamento.`);
    const ind = temGrupo(p, 'indutor');
    if (ind.length && ['hormonal_comb', 'implante'].includes(p.contracepcao)) add('alto', `Indutor enzimático (${nomes(ind)}) reduz a eficácia de ${MN.minus(MN.rotulo(MN.CONTRACEP, p.contracepcao))}: orientar DIU ou injeção trimestral.`);
    const lam = p.meds.find(m => m.kbId === 'lamotrigina');
    if (lam && p.contracepcao === 'hormonal_comb') add('medio', 'Lamotrigina com contraceptivo com estrogênio: estrogênio reduz o nível de lamotrigina (e a pausa pode elevá-lo).');
    if (lam && valp.length) add('medio', 'Lamotrigina com valproato: valproato eleva o nível de lamotrigina; dose deve ser reduzida (risco de rash grave).');

    // medicação a medicação
    for (const m of p.meds) {
      const k = MN.kbPorId(m.kbId);
      if (!k) add('info', `"${m.nome}" não reconhecido no banco: conferir nome, dose e classificação do receituário.`);
      const tot = MN.totalDia(m), max = mgMax(k);
      if (tot && max && tot > max * 1.001) add('alto', `${m.nome}: ${MN.fmtNum(tot)} mg/dia acima da dose máxima usual (${k.doseMaxDia}). Conferir posologia informada.`);
      if (m.adesao === 'ruim') add('medio', `${m.nome}: esquece doses com frequência.`);
      if (m.eficacia === 'ruim') add('medio', `${m.nome}: paciente acha que não funciona.`);
      if (m.tempoUso === 'lt3m') add('medio', `${m.nome}: em uso há menos de 3 meses (fase de titulação/efeitos iniciais).`);
      const ef = (m.efeitos || []).concat(m.efeitosOutros ? [m.efeitosOutros] : []);
      if (ef.length) add('info', `${m.nome}, efeitos relatados: ${ef.join('; ')}.`);
    }

    const bzd = temGrupo(p, 'bzd');
    if (bzd.length) {
      if (idade >= 65) add('medio', `Benzodiazepínico/hipnótico em ≥65 anos (${nomes(bzd)}): risco de quedas e cognição (critérios de Beers).`);
      if (bzd.length > 1) add('medio', `Mais de um benzodiazepínico/hipnótico (${nomes(bzd)}).`);
    }
    const nb = p.meds.filter(m => { const k = MN.kbPorId(m.kbId); return k && k.receituario === 'notificacao_b'; });
    if (nb.length) add('medio', `${nomes(nb)}: exige Notificação de Receita B em talonário de papel. A emissão eletrônica depende de integração ao SNCR da Anvisa (RDC 1.000/2025, art. 4º §2º), que a plataforma ainda não tem.`);
    const tca = temGrupo(p, 'tca');
    if (tca.length && (comorb.includes('glaucoma') || comorb.includes('prostata'))) add('medio', `Tricíclico (${nomes(tca)}) com ${comorb.includes('glaucoma') ? 'glaucoma' : 'prostatismo'}: efeito anticolinérgico.`);
    if (tca.length && comorb.includes('coracao')) add('medio', `Tricíclico (${nomes(tca)}) com cardiopatia: risco de arritmia; considerar ECG.`);
    const anticol = temGrupo(p, 'anticolinergico');
    if (anticol.length && (idade >= 65 || cond.includes('demencia'))) add('medio', `Anticolinérgico (${nomes(anticol)}) em idoso ou com demência: piora cognitiva (Beers).`);
    const trip = temGrupo(p, 'triptano');
    if (trip.length && (comorb.includes('coracao') || cond.includes('avc'))) add('alto', `Triptano (${nomes(trip)}) com doença cardiovascular ou AVC prévio: contraindicado.`);
    if (trip.length && temGrupo(p, 'serotoninergico').length) add('info', 'Triptano com antidepressivo serotoninérgico: risco teórico de síndrome serotoninérgica (evidência fraca); orientar sinais.');
    if (temGrupo(p, 'betabloq').length && comorb.includes('asma')) add('alto', 'Propranolol com asma: betabloqueador não seletivo pode desencadear broncoespasmo.');
    const ren = temGrupo(p, 'renal');
    if (ren.length && comorb.includes('rim')) add('medio', `Doença renal com fármaco de eliminação renal (${nomes(ren)}): ajustar dose ao clearance (CKD-EPI).`);
    const hep = temGrupo(p, 'hepato');
    if (hep.length && comorb.includes('figado')) add('medio', `Doença hepática com ${nomes(hep)}: rever dose e monitorar função hepática.`);
    if (temGrupo(p, 'antipsicotico').length && (cond.includes('demencia') || idade >= 65)) add('medio', 'Quetiapina em idoso/demência: aumento de mortalidade (alerta de bula); usar menor dose e reavaliar.');
    if (temGrupo(p, 'antiagregante').length === 2) add('medio', 'AAS + clopidogrel: dupla antiagregação prolongada aumenta sangramento; confirmar indicação e duração.');
    if (p.duvidas && p.duvidas.length) add('info', `Paciente deixou ${p.duvidas.length === 1 ? 'uma dúvida' : p.duvidas.length + ' dúvidas'} para o atendimento.`);

    const ordem = { alto: 0, medio: 1, info: 2 };
    return A.sort((a, b) => ordem[a.nivel] - ordem[b.nivel]);
  };

  /* ====================== resumo clínico ====================== */
  MN.linhaMed = function (m) {
    const partes = [m.nome + (m.dose ? ' ' + m.dose : '')];
    if (m.pos) {
      let s = MN.descPosologia(m.pos, m.forma);
      const tot = MN.totalDia(m);
      if (tot && !m.pos.sos) s += ` (${MN.fmtNum(tot)} mg/dia)`;
      if (m.pos.sos && m.usoMes != null) s += `, cerca de ${m.usoMes} dias/mês`;
      partes.push(s);
    }
    if (m.tempoUso) partes.push('uso há ' + MN.rotulo(MN.TEMPO_USO, m.tempoUso).toLowerCase());
    if (m.adesao) partes.push('adesão: ' + ({ boa: 'boa', as_vezes: 'esquece às vezes', ruim: 'esquece com frequência' }[m.adesao]));
    if (m.eficacia) partes.push('eficácia percebida: ' + ({ boa: 'boa', parcial: 'parcial', ruim: 'ruim' }[m.eficacia]));
    const ef = (m.efeitos || []).concat(m.efeitosOutros ? [m.efeitosOutros] : []);
    partes.push(ef.length ? 'efeitos: ' + ef.join('; ') : 'sem efeitos adversos relatados');
    return partes.join(' · ');
  };

  MN.resumoClinico = function (p) {
    const pa = p.paciente, c = p.controle || {};
    const idade = MN.idade(pa.nasc);
    const L = [];
    L.push(`${pa.nome}, ${idade} anos, ${pa.sexo === 'F' ? 'feminino' : 'masculino'}. Solicita renovação de receita.`);
    if (pa.responsavel) L.push(`Responsável: ${pa.responsavel}.`);
    const conds = (p.condicoes || []).map(x => x === 'outro' ? p.condicaoOutra : MN.condRot(x));
    L.push(`Condição de base (referida): ${conds.join('; ')}.`);
    L.push(`Última consulta presencial com neurologista: ${MN.rotulo(MN.ULTIMA_CONSULTA, p.ultimaConsulta).toLowerCase()}.`);
    const ctl = [];
    if (c.epUltima) ctl.push(`última crise ${MN.rotulo(MN.EP_ULTIMA, c.epUltima).toLowerCase()}${c.epCrises3m != null ? `, ${c.epCrises3m} crise(s) nos últimos 3 meses` : ''}`);
    if (c.cefDias != null) ctl.push(`cefaleia em ${c.cefDias} dias/mês, medicação de crise em ${c.cefAnalg != null ? c.cefAnalg : '?'} dias/mês`);
    if (c.pk) ctl.push('Parkinson: ' + (c.pk.length ? c.pk.map(x => MN.rotulo(MN.PK_SINT, x).toLowerCase()).join('; ') : 'sem flutuações, quedas ou sintomas não motores relatados'));
    if (c.dm) ctl.push('Demência (informante: ' + (c.dmResp === 'cuidador' ? 'cuidador' : 'paciente') + '): ' + (c.dm.length ? c.dm.map(x => MN.rotulo(MN.DM_SINT, x).toLowerCase()).join('; ') : 'sem mudanças relatadas'));
    if (c.dnInt != null) ctl.push(`dor neuropática ${c.dnInt}/10`);
    if (c.geral) ctl.push('sintomas ' + MN.rotulo(MN.CONTROLE_GERAL, c.geral).toLowerCase());
    if (ctl.length) L.push('Controle: ' + ctl.join('; ') + '.');
    L.push('');
    L.push('Medicações neurológicas em uso:');
    p.meds.forEach((m, i) => L.push(`${i + 1}. ${MN.linhaMed(m)}`));
    L.push('');
    L.push(`Outras medicações: ${p.outrosMeds || 'nega'}.`);
    L.push(`Alergias medicamentosas: ${p.alergias || 'nega'}.`);
    const com = (p.comorbidades || []).map(x => x.startsWith('outro:') ? x.slice(6) : MN.rotulo(MN.COMORB, x));
    L.push(`Comorbidades: ${com.length ? com.join('; ') : 'nega as pesquisadas'}.`);
    if (p.gestacao) L.push(`Gestação/lactação: ${MN.rotulo(MN.GESTACAO, p.gestacao).toLowerCase()}.` + (p.contracepcao ? ` Contracepção: ${MN.minus(MN.rotulo(MN.CONTRACEP, p.contracepcao))}.` : ''));
    L.push(`Exames recentes: ${p.exames || 'não informado'}.`);
    L.push(`Duração solicitada: ${p.duracao || 30} dias.`);
    if (p.relato) L.push(`Relato livre: "${p.relato}"`);
    if (p.duvidas && p.duvidas.length) L.push('Dúvidas do paciente: ' + p.duvidas.map(d => `"${d}"`).join('; '));
    return L.join('\n');
  };

  /* ====================== receitas (rascunho) ====================== */
  MN.nomeRx = function (m) {
    return (m.nome + (m.dose ? ' ' + m.dose : '')).trim();
  };
  MN.montarReceitas = function (p, diasPedido) {
    const dias = diasPedido || p.duracao || 30;
    const blocos = {};
    p.meds.forEach((m, idx) => {
      if (!m.nome || m.manter === false) return;
      const k = MN.kbPorId(m.kbId);
      const tipo = k ? k.receituario : 'simples';
      const lim = MN.limiteDias(k, p);
      const d = lim ? Math.min(dias, lim) : dias;
      const un = MN.unidadeDe(m.forma);
      let qtd = null;
      if (m.pos && m.pos.unidadesDia && !m.pos.sos) qtd = Math.ceil(m.pos.unidadesDia * d - 1e-9);
      else if (m.pos && m.pos.sos) qtd = Math.max(1, Math.ceil((m.usoMes != null ? m.usoMes : 4) * (m.pos.qtdPorTomada || 1) * d / 30));
      const item = {
        idx, kbId: m.kbId, nome: MN.nomeRx(m), forma: m.forma || '', posologia: MN.descPosologia(m.pos, m.forma, true),
        quantidade: qtd, unidade: un, dias: d, limitado: !!(lim && dias > lim), sos: !!(m.pos && m.pos.sos)
      };
      if (tipo === 'notificacao_b' || tipo === 'notificacao_a') {
        // uma notificação por substância
        const chave = tipo + ':' + (m.kbId || m.nome);
        (blocos[chave] = blocos[chave] || { tipo, itens: [] }).itens.push(item);
      } else (blocos[tipo] = blocos[tipo] || { tipo, itens: [] }).itens.push(item);
    });
    const ordem = { simples: 0, controle_especial: 1, notificacao_b: 2, notificacao_a: 3 };
    const out = [];
    for (const b of Object.values(blocos).sort((a, b) => ordem[a.tipo] - ordem[b.tipo])) {
      // Portaria 344/98, art. 57: no máximo 3 substâncias por receituário de controle especial
      if (b.tipo === 'controle_especial' && b.itens.length > 3) {
        for (let i = 0; i < b.itens.length; i += 3) out.push({ tipo: b.tipo, itens: b.itens.slice(i, i + 3) });
      } else out.push(b);
    }
    return out;
  };
  MN.textoQuantidade = function (it, tipo) {
    if (it.quantidade == null) return 'Uso contínuo';
    const un = it.quantidade > 1 ? it.unidade[1] : it.unidade[0];
    if (tipo && tipo !== 'simples') return `${it.quantidade} (${MN.extenso(it.quantidade)}) ${un}`;
    return `${it.quantidade} ${un}`;
  };

  /* ====================== orientações ao paciente ====================== */
  function lista(arr) { return arr && arr.length ? '<ul>' + arr.map(x => '<li>' + esc(x) + '</li>').join('') + '</ul>' : ''; }
  MN.orientacaoMed = function (m, p) {
    const k = MN.kbPorId(m.kbId);
    const idade = MN.idade(p.paciente.nasc);
    const fertil = p.paciente.sexo === 'F' && idade >= 10 && idade <= 55;
    let h = `<h3><span class="ico sm c-violeta"><i class="ti ti-pill"></i></span>${esc(MN.nomeRx(m))}</h3>`;
    const it = p.status === 'assinado' ? (p.receitas || []).flatMap(b => b.itens).find(i => (m.kbId && i.kbId === m.kbId) || MN.norm(i.nome) === MN.norm(MN.nomeRx(m))) : null;
    if (p.status === 'assinado') h += it ? `<p><b>Como tomar (receita do médico):</b> ${esc(it.posologia)}</p>` : '<p><b>Este remédio não entrou na receita.</b> Siga a orientação do médico.</p>';
    else if (m.pos) h += `<p><b>Como você toma:</b> ${esc(MN.descPosologia(m.pos, m.forma))}. Continue assim até o médico decidir a receita.</p>`;
    if (!k) return h + '<p class="small muted">Este remédio não está no meu banco de orientações. O médico vai orientar você no atendimento.</p>';
    h += '<div class="sub"><i class="ti ti-info-circle t-azul"></i>Efeitos mais comuns</div>' + lista(k.efeitosComuns);
    h += '<div class="sub"><i class="ti ti-alert-triangle t-vermelho"></i>Procure atendimento médico se tiver</div>' + lista(k.sinaisAlerta);
    const cuid = [].concat(k.orientacoes || []);
    if (k.suspensao) cuid.push(k.suspensao);
    if (fertil && k.gestacao) cuid.push(k.gestacao);
    h += '<div class="sub"><i class="ti ti-heart-handshake t-verde"></i>Cuidados</div>' + lista(cuid);
    if (k.monitorizacao && k.monitorizacao.length) h += '<div class="sub"><i class="ti ti-calendar-check t-violeta"></i>Acompanhamento que o médico pode pedir</div>' + lista(k.monitorizacao);
    const ef = (m.efeitos || []).concat(m.efeitosOutros ? [m.efeitosOutros] : []);
    if (ef.length) h += `<p class="small"><b>Você relatou:</b> ${esc(ef.join('; '))}. Eu anotei para o médico avaliar. Não mude a dose por conta própria.</p>`;
    return h;
  };
  MN.seguimentoPaciente = function (p) {
    const c = p.condicoes || [];
    const itens = [];
    itens.push('O neurologista vai ler suas respostas, fazer o seu atendimento e, se estiver tudo certo, assinar a receita. Ele pode ajustar doses ou pedir exames.');
    itens.push('Renovação online não substitui a consulta presencial. Para doenças crônicas, o Conselho Federal de Medicina pede consulta presencial com o seu neurologista pelo menos a cada 6 meses.');
    if (c.includes('epilepsia')) itens.push('Epilepsia: anote as crises (data, duração, o que aconteceu), durma bem, evite álcool e não fique sem remédio. Não dirija se teve crise recente; converse com o médico sobre isso.');
    if (c.includes('enxaqueca')) itens.push('Dor de cabeça: use um diário de dor e evite remédio para crise em mais de 2 dias por semana, porque o excesso pode piorar a dor.');
    if (c.includes('parkinson')) itens.push('Parkinson: tome os remédios sempre nos mesmos horários, mantenha atividade física e fisioterapia, e avise sobre quedas ou engasgos.');
    if (c.includes('demencia')) itens.push('Demência: o cuidador deve acompanhar os horários dos remédios. Avise o médico se houver confusão de repente, febre, quedas ou agitação intensa.');
    if (c.includes('avc')) itens.push('AVC: controle pressão, colesterol e glicose. Se tiver fraqueza, fala enrolada ou boca torta de repente, ligue 192 na hora.');
    if (p.gestacao === 'planeja' || p.gestacao === 'gestante') itens.push('Gravidez: não pare os remédios por conta própria. Converse com o médico sobre o planejamento e sobre o ácido fólico.');
    itens.push('Sinais de urgência, como crise que não para, fraqueza súbita ou pior dor de cabeça da vida, não esperam a renovação: ligue 192 ou procure um pronto-socorro.');
    return '<h3><span class="ico sm c-verde"><i class="ti ti-calendar-heart"></i></span>Seu acompanhamento</h3>' + lista(itens);
  };
  MN.orientacoesPaciente = function (p) {
    const out = [{ html: '<p>Aqui estão informações gerais sobre os remédios que você informou. Não são uma decisão de tratamento: quem decide a receita é o médico. Elas também ficam salvas na tela de acompanhamento.</p>', texto: 'Orientações' }];
    for (const m of p.meds.filter(x => x.nome)) out.push({ html: MN.orientacaoMed(m, p), texto: 'Orientação: ' + m.nome });
    out.push({ html: MN.seguimentoPaciente(p), texto: 'Acompanhamento' });
    return out;
  };
})(typeof window !== 'undefined' ? window : globalThis);
