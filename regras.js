/* RefilMed — regras clínicas e regulatórias
   Alertas para o médico, resumo clínico, rascunho das receitas e orientações ao paciente.
   Tudo determinístico e auditável; os textos clínicos vêm do banco verificado (kb.js). */
(function (G) {
  const RF = G.RF = G.RF || {};
  const esc = RF.esc;

  /* ---- grupos de fármacos (ids do kb.js) ---- */
  const GR = {
    indutor: ['carbamazepina', 'oxcarbazepina', 'fenitoina', 'fenobarbital', 'primidona', 'topiramato'],
    teratoAlto: ['valproato'],
    teratoMod: ['topiramato', 'carbamazepina', 'fenitoina', 'fenobarbital', 'primidona'],
    bzd: ['clonazepam', 'clobazam', 'zolpidem', 'alprazolam', 'lorazepam', 'diazepam', 'bromazepam'],
    triptano: ['sumatriptana', 'naratriptana', 'rizatriptana', 'zolmitriptana'],
    tca: ['amitriptilina', 'nortriptilina'],
    agonistaDA: ['pramipexol'],
    renal: ['gabapentina', 'pregabalina', 'levetiracetam', 'amantadina', 'memantina', 'pramipexol', 'lacosamida', 'topiramato', 'metformina', 'dabigatrana', 'rivaroxabana', 'apixabana', 'sitagliptina', 'vildagliptina', 'alopurinol', 'colchicina', 'litio'],
    serotoninergico: ['venlafaxina', 'duloxetina', 'amitriptilina', 'nortriptilina', 'trazodona', 'sertralina', 'escitalopram', 'citalopram', 'fluoxetina', 'paroxetina', 'desvenlafaxina'],
    antipsicotico: ['quetiapina', 'risperidona', 'olanzapina', 'aripiprazol'],
    anticolinergico: ['biperideno', 'amitriptilina', 'nortriptilina', 'paroxetina'],
    iache: ['donepezila', 'rivastigmina-oral', 'rivastigmina-adesivo', 'galantamina'],
    hepato: ['valproato', 'carbamazepina', 'fenitoina', 'fenobarbital', 'atorvastatina', 'duloxetina', 'rosuvastatina', 'sinvastatina', 'pioglitazona'],
    betabloq: ['propranolol'],
    iecaBra: ['losartana', 'valsartana', 'enalapril', 'captopril'],
    ieca: ['enalapril', 'captopril'],
    bra: ['losartana', 'valsartana'],
    poupaK: ['espironolactona'],
    diuretico: ['hidroclorotiazida', 'clortalidona', 'indapamida', 'furosemida'],
    anticoag: ['varfarina', 'rivaroxabana', 'apixabana', 'dabigatrana'],
    doac: ['rivaroxabana', 'apixabana', 'dabigatrana'],
    estatina: ['atorvastatina', 'rosuvastatina', 'sinvastatina'],
    hipoglic: ['glibenclamida', 'gliclazida', 'glimepirida', 'insulina-nph', 'insulina-regular', 'insulina-glargina'],
    sulfonil: ['glibenclamida', 'gliclazida', 'glimepirida'],
    isglt2: ['dapagliflozina', 'empagliflozina'],
    estrogenio: ['etinilestradiol-levonorgestrel', 'drospirenona-etinilestradiol'],
    litio: ['litio'],
    isrs: ['sertralina', 'escitalopram', 'citalopram', 'fluoxetina', 'paroxetina'],
    antiagregante: ['aas', 'clopidogrel']
  };
  RF.GRUPOS = GR;
  const temGrupo = (p, g) => p.meds.filter(m => GR[g].includes(m.kbId));
  const nomes = arr => arr.map(m => m.nome).join(', ');

  /* ---- limites de receituário (Portaria SVS/MS 344/1998; ver docs/REGULATORIO.md) ---- */
  RF.RX_REGRAS = {
    simples: { rot: 'Receita simples', vias: 1, diasMax: null },
    controle_especial: { rot: 'Receituário de controle especial', vias: 2, diasMax: 60, diasMaxExcecao: 180 },
    notificacao_b: { rot: 'Notificação de Receita B', vias: 1, diasMax: 60, eletronica: false },
    notificacao_a: { rot: 'Notificação de Receita A', vias: 1, diasMax: 30, eletronica: false }
  };
  // exceção de 6 meses (art. 59, p.u.) só quando a indicação informada é a do grupo (epilepsia/Parkinson)
  RF.limiteDias = function (k, p) {
    if (!k) return null;
    const r = RF.RX_REGRAS[k.receituario] || RF.RX_REGRAS.simples;
    if (!r.diasMax) return null;
    if (k.excecao6meses && r.diasMaxExcecao && (!p || (p.condicoes || []).includes(k.excecao6meses))) return r.diasMaxExcecao;
    return r.diasMax;
  };

  function mgMax(k) {
    if (!k || !k.doseMaxDia) return null;
    const t = RF.norm(k.doseMaxDia).replace(/\./g, '').replace(',', '.');
    const m = t.match(/(\d+(?:\.\d+)?)\s*(mg\/kg|mg|g)\b/);
    if (!m || m[2] === 'mg/kg') return null;  // dose por peso: sem peso do paciente, não compara
    return parseFloat(m[1]) * (m[2] === 'g' ? 1000 : 1);
  }

  RF.acima180 = p => ['6a12m', '1a2a', 'mais2a'].includes(p.ultimaConsulta);
  RF.valproatoFertil = function (p) {
    const i = RF.idade(p.paciente.nasc);
    return p.paciente.sexo === 'F' && i != null && i >= 10 && i <= 55 && p.meds.some(m => m.kbId === 'valproato' && m.manter !== false);
  };

  /* ====================== alertas ====================== */
  RF.calcularAlertas = function (p) {
    const A = [];
    const add = (nivel, texto) => A.push({ nivel, texto });
    const idade = RF.idade(p.paciente.nasc);
    const fertil = p.paciente.sexo === 'F' && idade != null && idade >= 10 && idade <= 55;
    const c = p.controle || {};
    const cond = p.condicoes || [];
    const comorbBruta = p.comorbidades || [];
    // a doença pode ter sido marcada como motivo da renovação ou como comorbidade
    const comorb = { includes: x => comorbBruta.includes(x) || cond.includes((RF.COMORB_COND || {})[x]) };

    // acompanhamento
    if (p.ultimaConsulta === 'nunca') add('alto', 'Nunca consultou presencialmente para este problema: a relação pode começar a distância, mas o seguimento deve ser presencial (CFM 2.314/2022, art. 6º §3º). Plataforma é para renovação.');
    else if (RF.acima180(p)) add('alto', `Última consulta presencial ${RF.rotulo(RF.ULTIMA_CONSULTA, p.ultimaConsulta).toLowerCase()}: doença crônica exige consulta presencial em intervalo de até 180 dias (CFM 2.314/2022, art. 6º §2º). Registre sua decisão ao assinar.`);

    // controle da doença
    if (c.pa === 'ge160') add('alto', 'Pressão referida ≥160/100: hipertensão não controlada; avaliar ajuste e urgência se houver sintomas.');
    else if (c.pa === '140a159') add('medio', 'Pressão referida entre 140/90 e 159/99: acima da meta.');
    else if (c.pa === 'naomede' && cond.includes('hipertensao')) add('info', 'Não mede a pressão: orientar medida residencial ou em farmácia antes do retorno.');
    if (c.hba1c === 'gt9') add('alto', 'HbA1c referida >9%: diabetes descontrolado.');
    else if (c.hba1c === '8a9') add('medio', 'HbA1c referida entre 8% e 9%: acima da meta usual.');
    else if (c.hba1c === 'naosei' && cond.includes('diabetes')) add('info', 'HbA1c não informada: solicitar.');
    const hipo = temGrupo(p, 'hipoglic');
    if (c.hipo === 'grave') add('alto', 'Hipoglicemia grave (precisou de ajuda) no último mês' + (hipo.length ? ` em uso de ${nomes(hipo)}` : '') + ': rever esquema.');
    else if (c.hipo === 'varias') add('medio', 'Hipoglicemias repetidas no último mês' + (hipo.length ? ` (${nomes(hipo)})` : '') + '.');
    if (c.resgate === 'mais2' || c.resgate === 'diario') add(c.resgate === 'diario' ? 'alto' : 'medio', 'Uso do broncodilatador de alívio ' + (c.resgate === 'diario' ? 'diário' : 'mais de 2 vezes por semana') + ': asma/DPOC não controlada (GINA).');
    if (c.asmaCrise === 'sim') add('medio', 'Exacerbação com pronto-socorro ou corticoide oral nos últimos 12 meses.');
    if (c.humor === 'metade' || c.humor === 'quase') add('medio', 'Humor deprimido ou anedonia na maior parte dos dias nas últimas 2 semanas (rastreio PHQ-2 positivo).');
    if (c.tsh === 'alterado') add('medio', 'TSH recente alterado: ajustar dose de levotiroxina conforme resultado.');
    else if (c.tsh === 'nao' || c.tsh === 'naosei') { if (cond.includes('tireoide')) add('info', 'Sem TSH nos últimos 12 meses: solicitar.'); }
    if (c.lipidio === 'nao' || c.lipidio === 'naosei') { if (cond.includes('colesterol')) add('info', 'Sem perfil lipídico nos últimos 12 meses: solicitar.'); }
    if (c.cor && c.cor.length) {
      if (c.cor.includes('angina') || c.cor.includes('tontura')) add('alto', 'Sintoma cardíaco relatado (' + c.cor.filter(x => ['angina', 'tontura'].includes(x)).map(x => RF.rotulo(RF.CORACAO_SINT, x).toLowerCase()).join('; ') + '): avaliação presencial.');
      if (c.cor.includes('falta_ar') || c.cor.includes('inchaco')) add('alto', 'Piora de dispneia ou edema: possível descompensação cardíaca.');
      if (c.cor.includes('palpitacao')) add('medio', 'Palpitações relatadas.');
    }
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
    if (ind.length && ['hormonal_comb', 'implante'].includes(p.contracepcao)) add('alto', `Indutor enzimático (${nomes(ind)}) reduz a eficácia de ${RF.minus(RF.rotulo(RF.CONTRACEP, p.contracepcao))}: orientar DIU ou injeção trimestral.`);
    const lam = p.meds.find(m => m.kbId === 'lamotrigina');
    if (lam && p.contracepcao === 'hormonal_comb') add('medio', 'Lamotrigina com contraceptivo com estrogênio: estrogênio reduz o nível de lamotrigina (e a pausa pode elevá-lo).');
    if (lam && valp.length) add('medio', 'Lamotrigina com valproato: valproato eleva o nível de lamotrigina; dose deve ser reduzida (risco de rash grave).');

    // medicação a medicação
    for (const m of p.meds) {
      const k = RF.kbPorId(m.kbId);
      if (!k) add('info', `"${m.nome}" não reconhecido no banco: conferir nome, dose e classificação do receituário.`);
      const tot = RF.totalDia(m), max = mgMax(k);
      if (tot && max && tot > max * 1.001) add('alto', `${m.nome}: ${RF.fmtNum(tot)} mg/dia acima da dose máxima usual (${k.doseMaxDia}). Conferir posologia informada.`);
      if (m.adesao === 'ruim') add('medio', `${m.nome}: esquece doses com frequência.`);
      if (m.eficacia === 'ruim') add('medio', `${m.nome}: paciente acha que não funciona.`);
      if (m.tempoUso === 'lt3m') add('medio', `${m.nome}: em uso há menos de 3 meses (fase de titulação/efeitos iniciais).`);
      const ef = (m.efeitos || []).concat(m.efeitosOutros ? [m.efeitosOutros] : []);
      if (ef.length) add('info', `${m.nome}, efeitos relatados: ${ef.join('; ')}.`);
    }

    // cardiovascular, renal e metabólico
    const ieca = temGrupo(p, 'ieca'), bra = temGrupo(p, 'bra');
    if (ieca.length && bra.length) add('alto', `IECA + BRA juntos (${nomes(ieca.concat(bra))}): duplo bloqueio do SRAA não recomendado (hipercalemia, lesão renal).`);
    const sraa = temGrupo(p, 'iecaBra');
    if (sraa.length && (fertil && ['gestante', 'planeja'].includes(p.gestacao))) add('alto', `${nomes(sraa)}: contraindicado na gestação (fetotóxico).`);
    else if (sraa.length && fertil && !['definitivo', 'diu_cobre', 'diu_horm', 'implante', 'injecao', 'hormonal_comb'].includes(p.contracepcao)) add('medio', `${nomes(sraa)} em mulher em idade fértil sem contracepção eficaz: fetotóxico se engravidar.`);
    if ((sraa.length || temGrupo(p, 'poupaK').length) && comorb.includes('rim')) add('medio', 'Doença renal com IECA/BRA ou espironolactona: monitorar potássio e creatinina.');
    if (sraa.length && temGrupo(p, 'poupaK').length) add('info', 'IECA/BRA + espironolactona: risco de hipercalemia; potássio periódico.');
    const ac = temGrupo(p, 'anticoag'), aap = temGrupo(p, 'antiagregante');
    if (ac.length && aap.length) add('medio', `Anticoagulante + antiagregante (${nomes(ac.concat(aap))}): risco de sangramento; confirmar indicação.`);
    if (ac.length > 1) add('alto', `Mais de um anticoagulante (${nomes(ac)}).`);
    if (ac.length && temGrupo(p, 'isrs').length) add('info', 'Anticoagulante + ISRS: aumento do risco de sangramento.');
    if (temGrupo(p, 'doac').length && comorb.includes('rim')) add('medio', `DOAC (${nomes(temGrupo(p, 'doac'))}) com doença renal: ajustar dose conforme os critérios de função renal da bula (definidos por Cockcroft-Gault).`);
    if (p.meds.some(m => m.kbId === 'varfarina')) add('info', 'Varfarina: conferir INR recente e interações de todos os medicamentos novos.');
    const est = temGrupo(p, 'estatina');
    if (est.length && fertil && ['gestante', 'planeja', 'amamentando'].includes(p.gestacao)) add('alto', `Estatina (${nomes(est)}) na gestação, lactação ou planejamento: em geral suspender (bulas divergem; rosuvastatina passou a categoria D em 2026).`);
    if (p.meds.some(m => m.kbId === 'metformina') && comorb.includes('rim')) add('medio', 'Metformina com doença renal: reduzir se TFG <45 e suspender se <30.');
    const sulf = temGrupo(p, 'sulfonil');
    if (sulf.length && idade >= 65) add('medio', `Sulfonilureia em ≥65 anos (${nomes(sulf)}): risco de hipoglicemia (Beers; glibenclamida evitar).`);
    if (temGrupo(p, 'isglt2').length) add('info', 'iSGLT2: orientar hidratação, higiene genital e suspender em jejum prolongado ou doença aguda (cetoacidose euglicêmica).');
    const estro = temGrupo(p, 'estrogenio');
    if (estro.length && cond.includes('enxaqueca')) add('medio', `Contraceptivo com estrogênio (${nomes(estro)}) e enxaqueca: confirmar ausência de aura (com aura é contraindicado, MEC 4).`);
    if (estro.length && (c.pa === 'ge160' || c.pa === '140a159')) add('alto', 'Contraceptivo com estrogênio e pressão acima de 140/90: contraindicação relativa a absoluta (MEC 3–4).');
    if (estro.length && idade >= 35) add('info', 'Contraceptivo com estrogênio após 35 anos: confirmar que não fuma (MEC 4 se ≥15 cigarros/dia).');
    const li = temGrupo(p, 'litio');
    if (li.length) {
      add('info', 'Lítio: litemia, função renal, TSH e cálcio periódicos.');
      if (sraa.length || temGrupo(p, 'diuretico').length) add('alto', 'Lítio com IECA/BRA ou diurético: risco de intoxicação por lítio; litemia após qualquer ajuste.');
    }
    if (p.meds.some(m => m.kbId === 'citalopram') && idade >= 60) add('medio', 'Citalopram em ≥60 anos: dose máxima 20 mg/dia (prolongamento do QT).');
    const na = p.meds.filter(m => { const k = RF.kbPorId(m.kbId); return k && k.receituario === 'notificacao_a'; });
    if (na.length) add('medio', `${nomes(na)}: exige Notificação de Receita A (amarela) em papel; a plataforma não emite.`);

    const bzd = temGrupo(p, 'bzd');
    if (bzd.length) {
      if (idade >= 65) add('medio', `Benzodiazepínico/hipnótico em ≥65 anos (${nomes(bzd)}): risco de quedas e cognição (critérios de Beers).`);
      if (bzd.length > 1) add('medio', `Mais de um benzodiazepínico/hipnótico (${nomes(bzd)}).`);
    }
    const nb = p.meds.filter(m => { const k = RF.kbPorId(m.kbId); return k && k.receituario === 'notificacao_b'; });
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
  RF.linhaMed = function (m) {
    const partes = [m.nome + (m.dose ? ' ' + m.dose : '')];
    if (m.pos) {
      let s = RF.descPosologia(m.pos, m.forma);
      const tot = RF.totalDia(m);
      if (tot && !m.pos.sos) s += ` (${RF.fmtNum(tot)} mg/dia)`;
      if (m.pos.sos && m.usoMes != null) s += `, cerca de ${m.usoMes} dias/mês`;
      partes.push(s);
    }
    if (m.tempoUso) partes.push('uso há ' + RF.rotulo(RF.TEMPO_USO, m.tempoUso).toLowerCase());
    if (m.adesao) partes.push('adesão: ' + ({ boa: 'boa', as_vezes: 'esquece às vezes', ruim: 'esquece com frequência' }[m.adesao]));
    if (m.eficacia) partes.push('eficácia percebida: ' + ({ boa: 'boa', parcial: 'parcial', ruim: 'ruim' }[m.eficacia]));
    const ef = (m.efeitos || []).concat(m.efeitosOutros ? [m.efeitosOutros] : []);
    partes.push(ef.length ? 'efeitos: ' + ef.join('; ') : 'sem efeitos adversos relatados');
    return partes.join(' · ');
  };

  RF.resumoClinico = function (p) {
    const pa = p.paciente, c = p.controle || {};
    const idade = RF.idade(pa.nasc);
    const L = [];
    L.push(`${pa.nome}, ${idade} anos, ${pa.sexo === 'F' ? 'feminino' : 'masculino'}. Solicita renovação de receita.`);
    if (pa.responsavel) L.push(`Responsável: ${pa.responsavel}.`);
    const conds = (p.condicoes || []).map(x => x === 'outro' ? p.condicaoOutra : RF.condRot(x));
    L.push(`Condição de base (referida): ${conds.join('; ')}.`);
    L.push(`Última consulta presencial para o problema: ${RF.rotulo(RF.ULTIMA_CONSULTA, p.ultimaConsulta).toLowerCase()}.`);
    const ctl = [];
    if (c.epUltima) ctl.push(`última crise ${RF.rotulo(RF.EP_ULTIMA, c.epUltima).toLowerCase()}${c.epCrises3m != null ? `, ${c.epCrises3m} crise(s) nos últimos 3 meses` : ''}`);
    if (c.cefDias != null) ctl.push(`cefaleia em ${c.cefDias} dias/mês, medicação de crise em ${c.cefAnalg != null ? c.cefAnalg : '?'} dias/mês`);
    if (c.pk) ctl.push('Parkinson: ' + (c.pk.length ? c.pk.map(x => RF.rotulo(RF.PK_SINT, x).toLowerCase()).join('; ') : 'sem flutuações, quedas ou sintomas não motores relatados'));
    if (c.dm) ctl.push('Demência (informante: ' + (c.dmResp === 'cuidador' ? 'cuidador' : 'paciente') + '): ' + (c.dm.length ? c.dm.map(x => RF.rotulo(RF.DM_SINT, x).toLowerCase()).join('; ') : 'sem mudanças relatadas'));
    if (c.dnInt != null) ctl.push(`dor neuropática ${c.dnInt}/10`);
    if (c.pa) ctl.push('PA referida ' + RF.rotulo(RF.PA_CASA, c.pa).toLowerCase());
    if (c.hba1c) ctl.push('HbA1c ' + RF.rotulo(RF.HBA1C, c.hba1c).toLowerCase() + (c.hipo ? ', hipoglicemia no último mês: ' + RF.rotulo(RF.HIPO, c.hipo).toLowerCase() : ''));
    if (c.resgate) ctl.push('broncodilatador de alívio ' + RF.rotulo(RF.RESGATE, c.resgate).toLowerCase() + (c.asmaCrise === 'sim' ? ', exacerbação no último ano' : ''));
    if (c.humor) ctl.push('humor deprimido/anedonia: ' + RF.rotulo(RF.HUMOR, c.humor).toLowerCase());
    if (c.tsh) ctl.push('TSH no último ano: ' + RF.rotulo(RF.EXAME_ANO, c.tsh).toLowerCase());
    if (c.lipidio) ctl.push('perfil lipídico no último ano: ' + RF.rotulo(RF.EXAME_ANO, c.lipidio).toLowerCase());
    if (c.cor) ctl.push('coração: ' + (c.cor.length ? c.cor.map(x => RF.rotulo(RF.CORACAO_SINT, x).toLowerCase()).join('; ') : 'sem sintomas novos'));
    if (c.geral) ctl.push('sintomas ' + RF.rotulo(RF.CONTROLE_GERAL, c.geral).toLowerCase());
    if (ctl.length) L.push('Controle: ' + ctl.join('; ') + '.');
    L.push('');
    L.push('Medicações de uso contínuo:');
    p.meds.forEach((m, i) => L.push(`${i + 1}. ${RF.linhaMed(m)}`));
    L.push('');
    L.push(`Outras medicações: ${p.outrosMeds || 'nega'}.`);
    L.push(`Alergias medicamentosas: ${p.alergias || 'nega'}.`);
    const com = (p.comorbidades || []).map(x => x.startsWith('outro:') ? x.slice(6) : RF.rotulo(RF.COMORB, x));
    L.push(`Comorbidades: ${com.length ? com.join('; ') : 'nega as pesquisadas'}.`);
    if (p.gestacao) L.push(`Gestação/lactação: ${RF.rotulo(RF.GESTACAO, p.gestacao).toLowerCase()}.` + (p.contracepcao ? ` Contracepção: ${RF.minus(RF.rotulo(RF.CONTRACEP, p.contracepcao))}.` : ''));
    L.push(`Exames recentes: ${p.exames || 'não informado'}.`);
    L.push(`Duração solicitada: ${p.duracao || 30} dias.`);
    if (p.relato) L.push(`Relato livre: "${p.relato}"`);
    if (p.duvidas && p.duvidas.length) L.push('Dúvidas do paciente: ' + p.duvidas.map(d => `"${d}"`).join('; '));
    return L.join('\n');
  };

  /* ====================== receitas (rascunho) ====================== */
  RF.nomeRx = function (m) {
    return (m.nome + (m.dose ? ' ' + m.dose : '')).trim();
  };
  RF.montarReceitas = function (p, diasPedido) {
    const dias = diasPedido || p.duracao || 30;
    const blocos = {};
    p.meds.forEach((m, idx) => {
      if (!m.nome || m.manter === false) return;
      const k = RF.kbPorId(m.kbId);
      const tipo = k ? k.receituario : 'simples';
      const lim = RF.limiteDias(k, p);
      const d = lim ? Math.min(dias, lim) : dias;
      const un = RF.unidadeDe(m.forma);
      let qtd = null;
      const contavel = RF.unidadeContavel(m.forma);
      if (!contavel) qtd = null;   // bombinha, insulina, xarope: o médico informa frascos/canetas
      else if (m.pos && m.pos.unidadesDia && !m.pos.sos) qtd = Math.ceil(m.pos.unidadesDia * d - 1e-9);
      else if (m.pos && m.pos.sos) qtd = Math.max(1, Math.ceil((m.usoMes != null ? m.usoMes : 4) * (m.pos.qtdPorTomada || 1) * d / 30));
      const item = {
        idx, kbId: m.kbId, nome: RF.nomeRx(m), forma: m.forma || '', posologia: RF.descPosologia(m.pos, m.forma, true),
        quantidade: qtd, unidade: un, dias: d, limitado: !!(lim && dias > lim), sos: !!(m.pos && m.pos.sos),
        obs: RF.unidadeContavel(m.forma) ? '' : 'informar a quantidade de frascos, canetas ou dispositivos'
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
  RF.textoQuantidade = function (it, tipo) {
    if (it.quantidade == null) return 'Uso contínuo';
    const un = it.quantidade > 1 ? it.unidade[1] : it.unidade[0];
    if (tipo && tipo !== 'simples') return `${it.quantidade} (${RF.extenso(it.quantidade)}) ${un}`;
    return `${it.quantidade} ${un}`;
  };

  /* ====================== orientações ao paciente ====================== */
  function lista(arr) { return arr && arr.length ? '<ul>' + arr.map(x => '<li>' + esc(x) + '</li>').join('') + '</ul>' : ''; }
  RF.orientacaoMed = function (m, p) {
    const k = RF.kbPorId(m.kbId);
    const idade = RF.idade(p.paciente.nasc);
    const fertil = p.paciente.sexo === 'F' && idade >= 10 && idade <= 55;
    let h = `<h3><span class="ico sm c-violeta"><i class="ti ti-pill"></i></span>${esc(RF.nomeRx(m))}</h3>`;
    const it = p.status === 'assinado' ? (p.receitas || []).flatMap(b => b.itens).find(i => (m.kbId && i.kbId === m.kbId) || RF.norm(i.nome) === RF.norm(RF.nomeRx(m))) : null;
    if (p.status === 'assinado') h += it ? `<p><b>Como tomar (receita do médico):</b> ${esc(it.posologia)}</p>` : '<p><b>Este remédio não entrou na receita.</b> Siga a orientação do médico.</p>';
    else if (m.pos) h += `<p><b>Como você toma:</b> ${esc(RF.descPosologia(m.pos, m.forma))}. Continue assim até o médico decidir a receita.</p>`;
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
  RF.seguimentoPaciente = function (p) {
    const c = p.condicoes || [];
    const itens = [];
    itens.push('O médico vai ler suas respostas, fazer o seu atendimento e, se estiver tudo certo, assinar a receita. Ele pode ajustar doses ou pedir exames.');
    itens.push('Renovação online não substitui a consulta presencial. Para doenças crônicas, o Conselho Federal de Medicina pede consulta presencial com o seu médico pelo menos a cada 6 meses.');
    if (c.includes('hipertensao')) itens.push('Pressão alta: meça a pressão algumas vezes por semana e anote; diminua o sal e não pare o remédio quando a pressão normalizar.');
    if (c.includes('diabetes')) itens.push('Diabetes: faça a hemoglobina glicada a cada 3 a 6 meses e examine os pés e os olhos uma vez por ano. Em caso de glicose baixa, tome 15 g de açúcar e meça de novo em 15 minutos.');
    if (c.includes('asma_dpoc')) itens.push('Asma ou DPOC: use a bombinha de manutenção todos os dias, mesmo sem sintomas, e enxágue a boca depois do corticoide inalado. Se precisar da de alívio mais de 2 vezes por semana, avise o médico.');
    if (c.includes('depressao_ansiedade')) itens.push('Saúde mental: o efeito dos antidepressivos leva semanas; não pare de repente. Se surgirem pensamentos de se machucar, ligue 188 (CVV) ou 192.');
    if (c.includes('tireoide')) itens.push('Tireoide: tome a levotiroxina em jejum, sempre no mesmo horário, e faça o TSH quando o médico pedir.');
    if (c.includes('coracao')) itens.push('Coração: se tiver dor no peito, falta de ar que piora ou desmaio, procure atendimento na hora. Pese-se com frequência se tiver insuficiência cardíaca.');
    if (c.includes('epilepsia')) itens.push('Epilepsia: anote as crises (data, duração, o que aconteceu), durma bem, evite álcool e não fique sem remédio. Não dirija se teve crise recente; converse com o médico sobre isso.');
    if (c.includes('enxaqueca')) itens.push('Dor de cabeça: use um diário de dor e evite remédio para crise em mais de 2 dias por semana, porque o excesso pode piorar a dor.');
    if (c.includes('parkinson')) itens.push('Parkinson: tome os remédios sempre nos mesmos horários, mantenha atividade física e fisioterapia, e avise sobre quedas ou engasgos.');
    if (c.includes('demencia')) itens.push('Demência: o cuidador deve acompanhar os horários dos remédios. Avise o médico se houver confusão de repente, febre, quedas ou agitação intensa.');
    if (c.includes('avc')) itens.push('AVC: controle pressão, colesterol e glicose. Se tiver fraqueza, fala enrolada ou boca torta de repente, ligue 192 na hora.');
    if (p.gestacao === 'planeja' || p.gestacao === 'gestante') itens.push('Gravidez: não pare os remédios por conta própria. Converse com o médico sobre o planejamento e sobre o ácido fólico.');
    itens.push('Sinais de urgência, como crise que não para, fraqueza súbita ou pior dor de cabeça da vida, não esperam a renovação: ligue 192 ou procure um pronto-socorro.');
    return '<h3><span class="ico sm c-verde"><i class="ti ti-calendar-heart"></i></span>Seu acompanhamento</h3>' + lista(itens);
  };
  RF.orientacoesPaciente = function (p) {
    const out = [{ html: '<p>Aqui estão informações gerais sobre os remédios que você informou. Não são uma decisão de tratamento: quem decide a receita é o médico. Elas também ficam salvas na tela de acompanhamento.</p>', texto: 'Orientações' }];
    for (const m of p.meds.filter(x => x.nome)) out.push({ html: RF.orientacaoMed(m, p), texto: 'Orientação: ' + m.nome });
    out.push({ html: RF.seguimentoPaciente(p), texto: 'Acompanhamento' });
    return out;
  };
})(typeof window !== 'undefined' ? window : globalThis);
