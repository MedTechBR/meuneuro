/* Meu Neuro — painel do médico: fila, revisão, receita, atendimento e assinatura */
(function (G) {
  const MN = G.MN;
  const { esc, $ } = MN;
  const UFS = 'AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' ');
  const ST = {
    aguardando: { r: 'Aguardando', c: 'acc' }, em_atendimento: { r: 'Em atendimento', c: 'warn' },
    assinado: { r: 'Receita assinada', c: 'ok' }, recusado: { r: 'Não renovado', c: 'bad' }, urgencia: { r: 'Urgência (bloqueado)', c: 'bad' }
  };
  const ABAS_FILA = [
    { k: 'aguardando', r: 'Aguardando', f: p => p.status === 'aguardando' },
    { k: 'em_atendimento', r: 'Em atendimento', f: p => p.status === 'em_atendimento' },
    { k: 'assinado', r: 'Assinados', f: p => p.status === 'assinado' },
    { k: 'outros', r: 'Encaminhados', f: p => p.status === 'recusado' || p.status === 'urgencia' }
  ];
  let S = { medico: null, pedidos: [], aba: 'aguardando', caso: null, abaCaso: 'resumo', el: null };

  MN.telaMedico = async function (el, casoId) {
    S.el = el;
    const m = await MN.backend.medico.atual();
    if (!m) return telaEntrar(el);
    S.medico = m;
    if (!m.nome || !m.crm || !m.uf) return telaPerfil(el, true);
    if (casoId === 'perfil') return telaPerfil(el, false);
    await recarregar();
    S.caso = casoId ? S.pedidos.find(p => p.id === casoId) || null : null;
    if (S.caso && S.abaCaso === 'resumo' && S.caso.status === 'assinado') S.abaCaso = 'receita';
    desenhar();
  };

  async function recarregar() {
    try { S.pedidos = (await MN.backend.listarPedidos()).filter(p => p.status !== 'rascunho'); }
    catch (e) { S.pedidos = []; MN.toast('Não consegui carregar a fila: ' + e.message); }
  }

  /* ---------- entrar / perfil ---------- */
  function telaEntrar(el) {
    const local = MN.backend.modo === 'local';
    el.innerHTML = `<div class="estreito"><div class="card">
      <div class="cab-card"><span class="ico lg"><i class="ti ti-stethoscope"></i></span><h2>Área do médico</h2></div>
      <p class="muted" style="margin:6px 0 18px">${local ? 'Modo local: os pedidos ficam neste navegador. Para uso real com vários aparelhos, configure o backend (docs/FIREBASE.md).' : 'Entre com a conta de médico cadastrada pela administração do Meu Neuro.'}</p>
      ${local ? '<button class="btn btn-p" id="ent" style="width:100%">Entrar no painel (modo local)</button>' : `
      <form id="fl"><label class="campo"><span>E-mail</span><input class="inp" type="email" name="email" required autocomplete="username"></label>
      <label class="campo"><span>Senha</span><input class="inp" type="password" name="senha" required autocomplete="current-password"></label>
      <button class="btn btn-p" style="width:100%">Entrar</button></form>`}
    </div></div>`;
    if (local) $('#ent').onclick = async () => { await MN.backend.medico.entrar(); MN.telaMedico(el); };
    else $('#fl').onsubmit = async e => {
      e.preventDefault(); const f = new FormData(e.target);
      try { await MN.backend.medico.entrar(f.get('email'), f.get('senha')); MN.telaMedico(el); }
      catch (err) { MN.toast(err.message || 'Não foi possível entrar.'); }
    };
  }

  function telaPerfil(el, primeiro) {
    const m = S.medico || {};
    const v = k => esc(m[k] || '');
    el.innerHTML = `<div class="estreito"><div class="card">
      <div class="cab-card"><span class="ico lg"><i class="ti ti-id-badge-2"></i></span><h2>${primeiro ? 'Seus dados de prescritor' : 'Perfil do médico'}</h2></div>
      <p class="muted small" style="margin:6px 0 16px">Saem no cabeçalho e na assinatura das receitas. O receituário de controle especial exige endereço completo e telefone do emitente.</p>
      <form id="fp">
        <label class="campo"><span>Nome completo</span><input class="inp" name="nome" value="${v('nome')}" required></label>
        <div class="linha2"><label class="campo"><span>CRM</span><input class="inp" name="crm" value="${v('crm')}" required inputmode="numeric"></label>
        <label class="campo"><span>UF do CRM</span><select class="inp" name="uf" required><option value="">UF</option>${UFS.map(u => `<option ${m.uf === u ? 'selected' : ''}>${u}</option>`).join('')}</select></label></div>
        <div class="linha2"><label class="campo"><span>RQE</span><input class="inp" name="rqe" value="${v('rqe')}"></label>
        <label class="campo"><span>Especialidade</span><input class="inp" name="especialidade" value="${v('especialidade') || 'Neurologia'}"></label></div>
        <label class="campo"><span>Endereço profissional completo</span><input class="inp" name="endereco" value="${v('endereco')}" required placeholder="Rua, número, sala, bairro"></label>
        <div class="linha2"><label class="campo"><span>Cidade</span><input class="inp" name="cidade" value="${v('cidade')}" required></label>
        <label class="campo"><span>UF</span><select class="inp" name="ufEnd" required><option value="">UF</option>${UFS.map(u => `<option ${m.ufEnd === u ? 'selected' : ''}>${u}</option>`).join('')}</select></label></div>
        <label class="campo"><span>Telefone profissional</span><input class="inp" name="telefone" value="${v('telefone')}" required></label>
        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:6px">${primeiro ? '' : '<a class="btn" href="#/medico">Cancelar</a>'}<button class="btn btn-p">Salvar</button></div>
      </form>
      ${primeiro ? '' : `<div style="border-top:1px solid var(--line);margin-top:22px;padding-top:16px">
        <h3>Dados deste navegador</h3><p class="small muted" style="margin:4px 0 10px">Modo ${MN.backend.modo}. ${Object.entries(MN.backend.diagnostico()).map(([k, s]) => esc(k.replace('meuneuro.v1.', '')) + ': ' + esc(s)).join(' · ') || 'nada salvo'}</p>
        <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-s" id="exp"><i class="ti ti-download"></i>Exportar cópia (JSON)</button><button class="btn btn-s btn-g" id="sair"><i class="ti ti-logout"></i>Sair</button></div></div>`}
    </div></div>`;
    $('#fp').onsubmit = async e => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(e.target).entries());
      Object.keys(f).forEach(k => f[k] = String(f[k]).trim());
      S.medico = Object.assign({}, S.medico, f);
      await MN.backend.medico.salvarPerfil(S.medico);
      MN.toast('Dados salvos.');
      location.hash = '#/medico';
      if (primeiro) MN.telaMedico(el);
    };
    const exp = $('#exp'); if (exp) exp.onclick = () => baixar('meuneuro-backup-' + new Date().toISOString().slice(0, 10) + '.json', JSON.stringify(MN.backend.exportar(), null, 1), 'application/json');
    const sair = $('#sair'); if (sair) sair.onclick = async () => { await MN.backend.medico.sair(); location.hash = '#/'; };
  }

  /* ---------- painel ---------- */
  const ICO_ABA = { aguardando: 'ti-inbox', em_atendimento: 'ti-stethoscope', assinado: 'ti-file-certificate', outros: 'ti-arrow-forward-up' };
  const CURTO = { aguardando: 'Fila', em_atendimento: 'Atendendo', assinado: 'Assinados', outros: 'Outros' };
  function iniciais(nome) { const p = String(nome || '?').trim().split(/\s+/); return ((p[0] || '')[0] + ((p.length > 1 ? p[p.length - 1] : '')[0] || '')).toUpperCase(); }

  function desenhar() {
    const el = S.el;
    const n = k => S.pedidos.filter(ABAS_FILA.find(a => a.k === k).f).length;
    el.innerHTML = `<div class="med ${S.caso ? 'com-caso' : ''}">
      <nav class="trilho" aria-label="Seções">
        ${ABAS_FILA.map(a => `<button class="trilho-it ${S.aba === a.k ? 'on' : ''}" data-a="${a.k}" title="${a.r}"><span class="ico"><i class="ti ${ICO_ABA[a.k]}"></i></span>${CURTO[a.k]}${a.k === 'aguardando' && n(a.k) ? `<span class="n">${n(a.k)}</span>` : ''}</button>`).join('')}
        <span class="trilho-sp"></span>
        <a class="trilho-it" href="#/medico/perfil" title="Perfil"><span class="ico"><i class="ti ti-user-circle"></i></span>Perfil</a>
      </nav>
      <aside class="fila"><div class="fila-top">
        <div style="display:flex;align-items:center;gap:8px"><div style="flex:1"><h2>${ABAS_FILA.find(a => a.k === S.aba).r}</h2><div class="sub">${n(S.aba)} pedido${n(S.aba) === 1 ? '' : 's'}</div></div>
        <button class="btn btn-ico btn-g" id="rec" title="Atualizar" aria-label="Atualizar"><i class="ti ti-refresh"></i></button></div>
        <label class="busca"><i class="ti ti-search"></i><input id="busca" placeholder="Buscar paciente ou remédio" value="${esc(S.busca || '')}" autocomplete="off"></label>
      </div><div class="fila-lista" id="lista"></div></aside>
      <section class="caso" id="caso"></section></div>`;
    el.querySelectorAll('.trilho-it[data-a]').forEach(b => b.onclick = () => { S.aba = b.dataset.a; if (S.caso) location.hash = '#/medico'; else desenhar(); });
    $('#rec').onclick = async () => { const b = $('#rec'); b.querySelector('.ti').style.transition = 'transform .5s'; b.querySelector('.ti').style.transform = 'rotate(360deg)'; await recarregar(); if (S.caso) S.caso = S.pedidos.find(p => p.id === S.caso.id) || null; desenhar(); };
    $('#busca').oninput = e => { S.busca = e.target.value; desenharLista(); };
    desenharLista();
    desenharCaso();
  }

  function desenharLista() {
    const aba = ABAS_FILA.find(a => a.k === S.aba);
    const q = MN.norm(S.busca || '');
    let l = S.pedidos.filter(aba.f).filter(p => !q || MN.norm(p.paciente.nome + ' ' + (p.meds || []).map(m => m.nome).join(' ') + ' ' + p.codigo).includes(q));
    if (S.aba === 'aguardando') l.sort((a, b) => String(a.enviadoEm).localeCompare(String(b.enviadoEm)));
    const box = $('#lista');
    if (!l.length) {
      box.innerHTML = `<div class="vazio"><span class="ico lg"><i class="ti ${q ? 'ti-search-off' : 'ti-mood-empty'}"></i></span><p>${q ? 'Nada encontrado.' : 'Nenhum pedido aqui.'}</p>
        ${MN.backend.modo === 'local' && !S.pedidos.length && MN.criarExemplos ? '<button class="btn btn-s" id="ex" style="margin-top:14px"><i class="ti ti-sparkles"></i>Criar 3 pedidos de exemplo</button>' : ''}</div>`;
      const ex = $('#ex'); if (ex) ex.onclick = async () => { await MN.criarExemplos(); await recarregar(); desenhar(); };
      return;
    }
    box.innerHTML = l.map(p => {
      const al = p.alertas || [], altos = al.filter(x => x.nivel === 'alto').length, med = al.filter(x => x.nivel === 'medio').length;
      const meds = (p.meds || []).map(m => m.nome).join(', ') || (p.semAssistente ? 'Sem assistente' : 'Sem remédios');
      return `<button class="fila-item ${S.caso && S.caso.id === p.id ? 'on' : ''}" data-id="${p.id}"><span class="avatar">${esc(iniciais(p.paciente.nome))}</span><span class="corpo">
        <span class="l1"><span class="nome">${esc(p.paciente.nome || 'Sem nome')}</span><span class="quando">${MN.quando(p.enviadoEm || p.atualizadoEm)}</span></span>
        <span class="l2" style="display:block">${esc(MN.idade(p.paciente.nasc) + ' anos · ' + meds)}</span>
        <span class="l3">${altos ? `<span class="tag bad"><i class="ti ti-alert-triangle" style="font-size:13px;vertical-align:-2px"></i>${altos}</span>` : ''}${med ? `<span class="tag warn"><i class="ti ti-alert-circle" style="font-size:13px;vertical-align:-2px"></i>${med}</span>` : ''}${(p.condicoes || []).slice(0, 2).map(c => `<span class="tag">${esc(c === 'outro' ? (p.condicaoOutra || 'Outro') : MN.condCurta(c))}</span>`).join('')}</span>
      </span></button>`;
    }).join('');
    box.querySelectorAll('.fila-item').forEach(b => b.onclick = () => { location.hash = '#/medico/caso/' + b.dataset.id; });
  }

  /* ---------- caso ---------- */
  function desenharCaso() {
    const box = $('#caso'), p = S.caso;
    if (!p) { box.innerHTML = '<div class="vazio" style="padding-top:120px"><span class="ico lg"><i class="ti ti-hand-click"></i></span><p>Escolha um pedido para começar o atendimento.</p></div>'; return; }
    const pa = p.paciente, st = ST[p.status] || { r: p.status, c: '' };
    const podeAgir = p.status === 'aguardando' || p.status === 'em_atendimento';
    box.innerHTML = `
      <a class="btn btn-s btn-g lado-btn" href="#/medico" style="margin:0 0 10px -6px"><i class="ti ti-arrow-left"></i>Voltar</a>
      <div class="caso-top"><div class="caso-quem"><span class="avatar lg">${esc(iniciais(pa.nome))}</span><div>
        <h1>${esc(pa.nome)}</h1>
        <div class="id"><span>${MN.idade(pa.nasc)} anos · ${pa.sexo === 'F' ? 'Feminino' : 'Masculino'} · ${esc(p.codigo)} · ${esc(MN.fmtData(p.enviadoEm, true))}</span><span class="tag ${st.c}">${st.r}</span></div>
      </div></div><div class="caso-acoes">
        ${pa.telefone ? `<a class="btn btn-s" target="_blank" rel="noopener" href="https://wa.me/55${esc(pa.telefone)}?text=${encodeURIComponent('Olá, ' + pa.nome.split(' ')[0] + '. Aqui é ' + (S.medico.nome || 'o médico') + ', do Meu Neuro. Recebi seu pedido de renovação de receita (' + p.codigo + ') e vou fazer seu atendimento agora.')}"><i class="ti ti-brand-whatsapp"></i>WhatsApp</a>` : ''}
        ${p.status === 'aguardando' ? '<button class="btn btn-s btn-p" id="iniciar"><i class="ti ti-player-play"></i>Iniciar atendimento</button>' : ''}
        ${p.status === 'em_atendimento' ? '<button class="btn btn-s btn-p" id="assinar"><i class="ti ti-signature"></i>Assinar e emitir</button>' : ''}
        ${podeAgir ? '<button class="btn btn-s btn-d" id="recusar">Não renovar</button>' : ''}
        ${p.status === 'assinado' ? '<button class="btn btn-s" id="imp"><i class="ti ti-printer"></i>Imprimir / PDF</button>' : ''}
      </div></div>
      <div class="alertas">${(p.alertas || []).map(a => `<div class="alerta ${a.nivel}"><span class="ico"><i class="ti ${a.nivel === 'alto' ? 'ti-alert-triangle' : a.nivel === 'medio' ? 'ti-alert-circle' : 'ti-info-circle'}"></i></span><span>${esc(a.texto)}</span></div>`).join('')}</div>
      <div class="abas">${[['resumo', 'Resumo', 'ti-notes'], ['conversa', 'Conversa', 'ti-messages'], ['receita', 'Receita', 'ti-prescription'], ['atendimento', 'Atendimento', 'ti-stethoscope']].map(([k, r, ic]) => `<button class="aba ${S.abaCaso === k ? 'on' : ''}" data-k="${k}"><i class="ti ${ic}"></i>${r}</button>`).join('')}</div>
      <div id="conteudo"></div>`;
    box.querySelectorAll('.aba').forEach(b => b.onclick = () => { S.abaCaso = b.dataset.k; desenharCaso(); });
    const ini = $('#iniciar'); if (ini) ini.onclick = iniciar;
    const ass = $('#assinar'); if (ass) ass.onclick = abrirAssinatura;
    const rec = $('#recusar'); if (rec) rec.onclick = abrirRecusa;
    const imp = $('#imp'); if (imp) imp.onclick = () => MN.imprimir(MN.folhasReceita(p, p.atendimento.medico || S.medico, { orientacoes: true }));
    ({ resumo: abaResumo, conversa: abaConversa, receita: abaReceita, atendimento: abaAtendimento })[S.abaCaso]($('#conteudo'), p);
  }

  async function salvar(p, evento) {
    if (evento) p.historico.push({ em: MN.agora(), evento, por: S.medico.nome });
    await MN.backend.salvarPedido(p);
  }

  async function iniciar() {
    const p = S.caso;
    p.status = 'em_atendimento';
    p.atendimento = p.atendimento || {};
    Object.assign(p.atendimento, { iniciadoEm: MN.agora(), medico: medicoResumo(), modalidade: p.atendimento.modalidade || 'video' });
    if (!p.atendimento.evolucao) p.atendimento.evolucao = modeloEvolucao(p);
    await salvar(p, 'Atendimento iniciado');
    S.abaCaso = 'atendimento';
    desenhar();
  }
  function medicoResumo() { const m = S.medico; return { nome: m.nome, crm: m.crm, uf: m.uf, rqe: m.rqe || '', especialidade: m.especialidade || 'Neurologia', endereco: m.endereco, cidade: m.cidade, ufEnd: m.ufEnd, telefone: m.telefone }; }
  function modeloEvolucao(p) {
    return `Teleconsulta para renovação de receita.\nPré-anamnese coletada por assistente automatizado (Meu Neuro ${MN.versao}), com transcrição anexa; informações revisadas e confirmadas pelo médico no atendimento.\n\n` +
      MN.resumoClinico(p) + `\n\nAvaliação:\n\nConduta:\n`;
  }

  /* ---------- aba resumo ---------- */
  function abaResumo(box, p) {
    const pa = p.paciente;
    const rx = k => k ? ({ simples: ['Simples', ''], controle_especial: ['Controle especial', 'warn'], notificacao_b: ['Notificação B', 'bad'], notificacao_a: ['Notificação A', 'bad'] }[k.receituario] || ['?', '']) : ['Não classificado', ''];
    let h = `<div class="sec"><h3><span class="ico sm"><i class="ti ti-id"></i></span>Paciente</h3><dl class="dl">
      <dt>Nome</dt><dd>${esc(pa.nome)}${pa.responsavel ? ' · responsável: ' + esc(pa.responsavel) : ''}</dd>
      <dt>Nascimento</dt><dd>${esc(MN.fmtData(pa.nasc))} (${MN.idade(pa.nasc)} anos)</dd>
      <dt>CPF</dt><dd>${esc(MN.fmtCPF(pa.cpf) || '—')}</dd>
      <dt>Telefone</dt><dd>${esc(pa.telefone || '—')}${pa.email ? ' · ' + esc(pa.email) : ''}</dd>
      <dt>Endereço</dt><dd>${esc([pa.endereco, pa.bairro, pa.cidade && pa.cidade + '/' + pa.uf].filter(Boolean).join(', ') || '—')}</dd>
      <dt>Consentimento</dt><dd>${p.consentimento ? 'Aceito em ' + esc(MN.fmtData(p.consentimento.em, true)) + ' (' + esc(p.consentimento.versao) + ')' + (p.consentimento.assistente === false ? ' · recusou o assistente' : '') : '—'}</dd>
    </dl></div>`;
    if (p.meds && p.meds.length) {
      h += `<div class="sec"><h3><span class="ico sm"><i class="ti ti-pill"></i></span>Medicações informadas</h3><div style="overflow-x:auto"><table class="tab"><thead><tr><th>Medicação</th><th>Posologia informada</th><th>Uso e adesão</th><th>Efeitos</th><th>Receituário</th></tr></thead><tbody>`;
      for (const m of p.meds) {
        const k = MN.kbPorId(m.kbId), r = rx(k), tot = MN.totalDia(m);
        const ef = (m.efeitos || []).concat(m.efeitosOutros ? [m.efeitosOutros] : []);
        h += `<tr><td><b>${esc(MN.nomeRx(m))}</b>${m.informado && MN.norm(m.informado) !== MN.norm(MN.nomeRx(m)) ? `<br><span class="small muted">digitou: "${esc(m.informado)}"</span>` : ''}</td>
          <td>${esc(m.pos ? MN.descPosologia(m.pos, m.forma) : '—')}${tot && !m.pos.sos ? `<br><span class="small muted">${MN.fmtNum(tot)} mg/dia</span>` : ''}${m.pos && m.pos.sos && m.usoMes != null ? `<br><span class="small muted">~${m.usoMes} dias/mês</span>` : ''}<br><span class="small muted">"${esc(m.posologiaTexto)}"</span></td>
          <td>${esc(MN.rotulo(MN.TEMPO_USO, m.tempoUso))}<br><span class="small muted">${esc(MN.rotulo(MN.ADESAO, m.adesao))}<br>Eficácia: ${esc(MN.rotulo(MN.EFICACIA, m.eficacia).toLowerCase())}</span></td>
          <td>${ef.length ? esc(ef.join('; ')) : '<span class="muted">Nenhum</span>'}</td>
          <td><span class="tag ${r[1]}">${r[0]}</span>${k && k.portaria344 ? `<br><span class="small muted">Lista ${esc(k.portaria344)}</span>` : ''}</td></tr>`;
        if (k && k.alertasMedico && k.alertasMedico.length) h += `<tr><td colspan="5" style="padding-top:0"><details><summary class="small" style="cursor:pointer;color:var(--acc-ink);font-weight:550"><i class="ti ti-bulb" style="font-size:15px"></i> Pontos de atenção de ${esc(k.nome)} (${k.alertasMedico.length})</summary><ul class="small" style="margin:6px 0 0;padding-left:18px">${k.alertasMedico.map(x => '<li>' + esc(x) + '</li>').join('')}${(k.monitorizacao || []).map(x => '<li>Monitorar: ' + esc(x) + '</li>').join('')}</ul></details></td></tr>`;
      }
      h += '</tbody></table></div></div>';
    }
    h += `<div class="sec"><h3><span class="ico sm"><i class="ti ti-notes"></i></span>Resumo para o prontuário<span style="flex:1"></span><button class="btn btn-s btn-g" id="copiar"><i class="ti ti-copy"></i>Copiar</button></h3><div class="resumo-txt">${esc(p.resumo || '')}</div>
      ${p.resumoIA ? `<h3 style="margin-top:14px">Síntese da IA</h3><div class="resumo-txt">${esc(p.resumoIA)}</div>` : ''}</div>`;
    h += `<div class="sec"><h3><span class="ico sm"><i class="ti ti-history"></i></span>Histórico do pedido</h3><ul class="small" style="margin:0;padding-left:18px">${(p.historico || []).map(x => `<li>${esc(MN.fmtData(x.em, true))} · ${esc(x.evento)}${x.por ? ' · ' + esc(x.por) : ''}</li>`).join('')}</ul></div>`;
    box.innerHTML = h;
    $('#copiar').onclick = () => copiar(p.resumo);
  }

  /* ---------- aba conversa ---------- */
  function abaConversa(box, p) {
    box.innerHTML = `<p class="small muted" style="margin:0 0 12px"><i class="ti ti-lock" style="font-size:15px"></i> Transcrição integral da pré-consulta com o assistente automatizado (Meu Neuro ${esc(MN.versao)}). Faz parte do prontuário.</p>
      <div class="transc">${(p.transcript || []).map(t => `<div class="msg ${t.de === 'pac' ? 'pac' : 'ia'}">${esc(t.texto)}<div style="font-size:11px;opacity:.7;margin-top:4px">${esc(MN.fmtData(t.t, true))}</div></div>`).join('')}</div>`;
  }

  /* ---------- aba receita ---------- */
  function abaReceita(box, p) {
    const edita = p.status === 'aguardando' || p.status === 'em_atendimento';
    const med = (p.atendimento && p.atendimento.medico) || medicoResumo();
    if (!edita) {
      const ass = p.atendimento && p.atendimento.assinatura;
      box.innerHTML = `<div style="display:flex;gap:8px;flex-wrap:wrap;margin:0 0 14px">
        <button class="btn btn-s" id="imp2"><i class="ti ti-printer"></i>Imprimir / salvar PDF</button>
        ${ass && ass.pdf ? '<button class="btn btn-s" id="baixpdf"><i class="ti ti-file-certificate"></i>PDF assinado</button>' : ''}</div>
        <div class="doc-area">${MN.folhasReceita(p, med, { orientacoes: true }) || '<p class="muted">Nenhuma receita emitida.</p>'}</div>`;
      $('#imp2').onclick = () => MN.imprimir(MN.folhasReceita(p, med, { orientacoes: true }));
      const bp = $('#baixpdf'); if (bp) bp.onclick = () => baixarDataURL(ass.pdf, 'receita-' + p.codigo + '-assinada.pdf');
      return;
    }
    if (!p.receitas) p.receitas = MN.montarReceitas(p);
    const blocos = p.receitas;
    let h = `<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:0 0 14px">
      <label class="small muted" style="display:flex;align-items:center;gap:6px">Duração <select class="inp" id="dur" style="min-height:34px;padding:4px 8px;width:auto">${MN.DURACAO.map(d => `<option value="${d.v}" ${+p.duracao === d.v ? 'selected' : ''}>${d.r}</option>`).join('')}</select></label>
      <button class="btn btn-s" id="refazer" title="Refaz o rascunho a partir das respostas do paciente"><i class="ti ti-refresh"></i>Refazer rascunho</button>
      <button class="btn btn-s" id="add"><i class="ti ti-plus"></i>Adicionar item</button>
      <button class="btn btn-s" id="prev"><i class="ti ti-eye"></i>Pré-visualizar</button>
      <button class="btn btn-s" id="copiarRx" title="Para colar em outra plataforma de prescrição"><i class="ti ti-copy"></i>Copiar texto</button></div>
      <p class="nota" style="margin:0 0 14px">Rascunho gerado a partir das respostas do paciente. Revise cada item: a emissão é ato do médico. Remédios controlados respeitam os limites da Portaria 344/98 (60 dias; anticonvulsivantes e antiparkinsonianos até 6 meses; acima disso, justificativa com CID).</p>`;
    if (!blocos.length) h += '<p class="muted">Sem itens. Use "Adicionar item".</p>';
    blocos.forEach((b, bi) => {
      const r = MN.RX_REGRAS[b.tipo];
      const papel = b.tipo === 'notificacao_b' || b.tipo === 'notificacao_a';
      h += `<div class="rx-bloco"><div class="rx-bloco-top"><h3><span class="ico sm ${papel ? 'bad' : b.tipo === 'controle_especial' ? 'warn' : ''}"><i class="ti ${papel ? 'ti-file-alert' : 'ti-prescription'}"></i></span>${esc(r.rot)}${b.tipo === 'controle_especial' ? ' <span class="tag warn">até 3 substâncias</span>' : ''}</h3>
        ${papel ? '<span class="tag bad">Talonário de papel</span>' : ''}</div>
        ${papel ? '<p class="nota" style="margin:0 0 10px">Não é emitida pela plataforma: exige Notificação em talonário numerado da Vigilância Sanitária até a integração ao SNCR (RDC 1.000/2025). Combine com o paciente a entrega da notificação física.</p>' : ''}
        <div class="rx-cab"><span>Medicamento e forma</span><span>Posologia</span><span>Quantidade / dias</span><span></span></div>`;
      b.itens.forEach((it, ii) => {
        const k = MN.kbPorId(it.kbId), lim = MN.limiteDias(k, p);
        const excede = lim && it.dias > lim;
        h += `<div class="rx-linha" data-b="${bi}" data-i="${ii}">
          <div><input class="inp" data-f="nome" value="${esc(it.nome)}" aria-label="Medicamento"><input class="inp" data-f="forma" value="${esc(it.forma)}" style="margin-top:6px" aria-label="Forma" placeholder="forma farmacêutica"></div>
          <textarea class="inp" data-f="posologia" rows="2" aria-label="Posologia">${esc(it.posologia)}</textarea>
          <div><input class="inp" data-f="quantidade" type="number" min="0" value="${it.quantidade != null ? it.quantidade : ''}" placeholder="uso contínuo" aria-label="Quantidade"><div style="display:flex;gap:6px;margin-top:6px;align-items:center"><input class="inp" data-f="dias" type="number" min="1" value="${it.dias || ''}" aria-label="Dias"><span class="small muted">dias</span></div></div>
          <button class="btn btn-s btn-g" data-del title="Remover" aria-label="Remover"><i class="ti ti-trash"></i></button>
          ${excede ? `<div style="grid-column:1/-1"><label class="campo" style="margin:0"><span style="color:var(--bad)">Acima do limite de ${lim} dias: justificativa com CID e posologia (art. 60)</span><input class="inp" data-f="justificativa" value="${esc(it.justificativa || '')}" placeholder="Ex.: G40.2, epilepsia focal em uso contínuo, 1 cp 12/12h"></label></div>` : ''}
        </div>`;
      });
      h += '</div>';
    });
    box.innerHTML = h;

    let t;
    const salvarDepois = () => { clearTimeout(t); t = setTimeout(() => salvar(p), 500); };
    box.querySelectorAll('.rx-linha').forEach(l => {
      const it = blocos[+l.dataset.b].itens[+l.dataset.i];
      l.querySelectorAll('[data-f]').forEach(inp => inp.oninput = () => {
        const f = inp.dataset.f;
        if (f === 'quantidade') it.quantidade = inp.value === '' ? null : Math.max(0, Math.round(+inp.value));
        else if (f === 'dias') {
          const d = Math.max(1, Math.round(+inp.value || 0)); const antes = it.dias; it.dias = d;
          const m = p.meds[it.idx];
          if (m && m.pos && m.pos.unidadesDia && !m.pos.sos) { it.quantidade = Math.ceil(m.pos.unidadesDia * d - 1e-9); l.querySelector('[data-f="quantidade"]').value = it.quantidade; }
          const k = MN.kbPorId(it.kbId), lim = MN.limiteDias(k, p);
          if (lim && ((antes > lim) !== (d > lim))) { salvar(p); abaReceita(box, p); return; }
        } else it[f] = inp.value;
        salvarDepois();
      });
      l.querySelector('[data-del]').onclick = () => {
        const b = blocos[+l.dataset.b]; b.itens.splice(+l.dataset.i, 1);
        if (!b.itens.length) blocos.splice(+l.dataset.b, 1);
        salvar(p, 'Item removido da receita'); abaReceita(box, p);
      };
    });
    $('#dur').onchange = e => { p.duracao = +e.target.value; p.receitas = MN.montarReceitas(p); salvar(p, 'Duração alterada para ' + p.duracao + ' dias'); abaReceita(box, p); };
    $('#refazer').onclick = () => { if (confirm('Refazer o rascunho a partir das respostas do paciente? Suas edições nesta aba serão perdidas.')) { p.receitas = MN.montarReceitas(p); salvar(p, 'Rascunho da receita refeito'); abaReceita(box, p); } };
    $('#add').onclick = () => abrirNovoItem(p, () => abaReceita(box, p));
    $('#prev').onclick = () => MN.modal(`<h2>Pré-visualização</h2><p class="small muted">Documento sem validade até a assinatura.</p><div class="doc-area" style="margin-top:12px">${MN.folhasReceita(p, med, {}) || '<p>Sem itens emissíveis.</p>'}</div><div class="rod"><button class="btn" onclick="MN.fecharModal()">Fechar</button></div>`, f => { f.querySelector('.modal').style.maxWidth = '900px'; });
    $('#copiarRx').onclick = () => copiar(textoReceita(p));
  }

  function textoReceita(p) {
    return (p.receitas || []).map(b => MN.RX_REGRAS[b.tipo].rot.toUpperCase() + '\n' + b.itens.map((it, i) => `${i + 1}. ${it.nome}${it.forma ? ' (' + it.forma + ')' : ''}\n   ${it.posologia}\n   Quantidade: ${MN.textoQuantidade(it, b.tipo)}${it.quantidade != null ? ' (' + it.dias + ' dias)' : ''}`).join('\n')).join('\n\n');
  }

  function abrirNovoItem(p, depois) {
    MN.modal(`<h2>Adicionar item</h2>
      <label class="campo"><span>Medicamento (busque no banco ou escreva)</span><input class="inp" id="n-nome" list="n-lista" placeholder="Ex.: Lamotrigina 100 mg"><datalist id="n-lista">${(G.MN_KB || []).map(k => `<option value="${esc(k.nome)}">`).join('')}</datalist></label>
      <label class="campo"><span>Forma</span><input class="inp" id="n-forma" placeholder="comprimido"></label>
      <label class="campo"><span>Posologia</span><textarea class="inp" id="n-pos" rows="2" placeholder="Tomar 1 comprimido por via oral de 12 em 12 horas."></textarea></label>
      <div class="linha2"><label class="campo"><span>Quantidade</span><input class="inp" id="n-qtd" type="number" min="0"></label><label class="campo"><span>Dias</span><input class="inp" id="n-dias" type="number" min="1" value="${p.duracao || 30}"></label></div>
      <div class="rod"><button class="btn" onclick="MN.fecharModal()">Cancelar</button><button class="btn btn-p" id="n-ok">Adicionar</button></div>`);
    $('#n-ok').onclick = () => {
      const nome = $('#n-nome').value.trim(); if (!nome) return MN.toast('Informe o medicamento.');
      const ach = MN.acharMed(nome)[0];
      const k = ach && ach.score >= 60 ? ach.m : null;
      const tipo = k ? k.receituario : 'simples';
      const qtd = $('#n-qtd').value;
      const item = { idx: -1, kbId: k ? k.id : null, nome, forma: $('#n-forma').value.trim(), posologia: $('#n-pos').value.trim(), quantidade: qtd === '' ? null : +qtd, unidade: MN.unidadeDe($('#n-forma').value), dias: +$('#n-dias').value || 30, manual: true };
      let b = p.receitas.find(x => x.tipo === tipo && (tipo !== 'controle_especial' || x.itens.length < 3) && !tipo.startsWith('notificacao'));
      if (!b) { b = { tipo, itens: [] }; p.receitas.push(b); p.receitas.sort((a, c) => ['simples', 'controle_especial', 'notificacao_b', 'notificacao_a'].indexOf(a.tipo) - ['simples', 'controle_especial', 'notificacao_b', 'notificacao_a'].indexOf(c.tipo)); }
      b.itens.push(item);
      salvar(p, 'Item adicionado pelo médico: ' + nome);
      MN.fecharModal(); depois();
      if (k) MN.toast(`Classificado como ${MN.RX_REGRAS[tipo].rot.toLowerCase()} (${k.nome}).`);
    };
  }

  /* ---------- aba atendimento ---------- */
  function abaAtendimento(box, p) {
    const at = p.atendimento || {};
    if (p.status === 'aguardando') {
      box.innerHTML = `<div class="card" style="padding:22px;max-width:640px"><span class="ico lg" style="margin-bottom:12px"><i class="ti ti-player-play"></i></span><h3>Atendimento ainda não iniciado</h3><p class="muted" style="margin:6px 0 14px">Ao iniciar, o pedido sai da fila de espera e o modelo de evolução é preenchido com o resumo da pré-consulta. Faça o contato pelo WhatsApp ou por vídeo, confirme as informações com o paciente e registre a evolução.</p><button class="btn btn-p" id="ini2"><i class="ti ti-player-play"></i>Iniciar atendimento</button></div>`;
      $('#ini2').onclick = iniciar; return;
    }
    const so = p.status !== 'em_atendimento';
    box.innerHTML = `<div style="max-width:820px">
      <div class="linha2"><label class="campo"><span>Modalidade</span><select class="inp" id="mod" ${so ? 'disabled' : ''}>
        ${[['video', 'Teleconsulta por vídeo (síncrona)'], ['voz', 'Chamada de voz (síncrona)'], ['mensagem', 'Mensagens (assíncrona)']].map(([v, r]) => `<option value="${v}" ${at.modalidade === v ? 'selected' : ''}>${r}</option>`).join('')}</select></label>
        <label class="campo"><span>Conduta</span><select class="inp" id="cond" ${so ? 'disabled' : ''}>
        ${[['renovar', 'Renovar sem alterações'], ['ajustar', 'Renovar com ajuste'], ['presencial', 'Renovar e solicitar consulta presencial']].map(([v, r]) => `<option value="${v}" ${at.conduta === v ? 'selected' : ''}>${r}</option>`).join('')}</select></label></div>
      <label class="campo"><span>Evolução (prontuário)</span><textarea class="inp" id="evo" rows="16" ${so ? 'readonly' : ''}>${esc(at.evolucao || '')}</textarea></label>
      <label class="campo"><span>Orientação ao paciente (aparece na tela dele e na folha de orientações)</span><textarea class="inp" id="ori" rows="4" ${so ? 'readonly' : ''} placeholder="Ex.: Manter as doses. Fazer hemograma e função hepática antes do próximo retorno. Agendar consulta presencial em até 60 dias.">${esc(at.orientacaoMedico || '')}</textarea></label>
      ${so ? '' : '<div style="display:flex;gap:8px;justify-content:flex-end"><button class="btn btn-p" id="assinar2"><i class="ti ti-signature"></i>Assinar e emitir</button></div>'}
      ${at.motivoRecusa ? `<div class="alerta alto" style="margin-top:14px"><i class="ti ti-ban"></i><span>Não renovado: ${esc(at.motivoRecusa)}</span></div>` : ''}
    </div>`;
    if (so) return;
    let t;
    const upd = () => { at.modalidade = $('#mod').value; at.conduta = $('#cond').value; at.evolucao = $('#evo').value; at.orientacaoMedico = $('#ori').value; p.atendimento = at; clearTimeout(t); t = setTimeout(() => salvar(p), 600); };
    ['mod', 'cond', 'evo', 'ori'].forEach(id => { $('#' + id).oninput = upd; $('#' + id).onchange = upd; });
    $('#assinar2').onclick = abrirAssinatura;
  }

  /* ---------- assinatura ---------- */
  function abrirAssinatura() {
    const p = S.caso, at = p.atendimento || {};
    const itens = (p.receitas || []).filter(b => !b.tipo.startsWith('notificacao')).reduce((n, b) => n + b.itens.length, 0);
    const papel = (p.receitas || []).filter(b => b.tipo.startsWith('notificacao')).flatMap(b => b.itens.map(i => i.nome));
    const faltaJust = (p.receitas || []).flatMap(b => b.itens).filter(it => { const lim = MN.limiteDias(MN.kbPorId(it.kbId), p); return lim && it.dias > lim && !String(it.justificativa || '').trim(); });
    if (!itens && !papel.length) return MN.toast('A receita está vazia.');
    if (faltaJust.length) { S.abaCaso = 'receita'; desenharCaso(); return MN.toast('Preencha a justificativa dos itens acima do limite de dias.'); }
    if (!String(at.evolucao || '').trim()) { S.abaCaso = 'atendimento'; desenharCaso(); return MN.toast('Registre a evolução do atendimento antes de assinar.'); }
    const local = MN.backend.modo === 'local';
    const c180 = MN.acima180(p) || p.ultimaConsulta === 'nunca';
    const valp = MN.valproatoFertil(p);
    MN.modal(`<h2>Assinar e emitir</h2>
      <p class="muted small">${itens} item(ns) em receita eletrônica${papel.length ? ' · ' + papel.length + ' em talonário de papel' : ''}.</p>
      <label class="check"><input type="checkbox" class="req"> Revisei a pré-anamnese e confirmei as informações com o paciente no atendimento.</label>
      <label class="check"><input type="checkbox" class="req"> Revisei cada item da receita (medicamento, posologia, quantidade e tipo de receituário).</label>
      ${c180 ? `<div class="alerta alto" style="margin:10px 0 4px"><i class="ti ti-calendar-exclamation"></i><span>Consulta presencial: CFM 2.314/2022, art. 6º §2º (intervalo máximo de 180 dias em doença crônica).</span></div>
        <select class="inp req-sel" id="dec180"><option value="">Registre sua decisão</option><option>Renovo por período de transição e oriento consulta presencial</option><option>Paciente tem consulta presencial agendada</option><option>Renovo com justificativa clínica registrada na evolução</option></select>` : ''}
      ${valp ? `<div class="alerta alto" style="margin:12px 0 4px"><i class="ti ti-alert-triangle"></i><span>Valproato em mulher com potencial de engravidar: checklist de bula.</span></div>
        <label class="check"><input type="checkbox" class="req"> Contracepção eficaz confirmada.</label>
        <label class="check"><input type="checkbox" class="req"> Gravidez descartada (teste quando indicado).</label>
        <label class="check"><input type="checkbox" class="req"> Alternativas terapêuticas consideradas e registradas.</label>
        <label class="check"><input type="checkbox" class="req"> Paciente ciente dos riscos (registrado na evolução).</label>` : ''}
      ${papel.length ? `<label class="check"><input type="checkbox" class="req"> Vou providenciar a Notificação de Receita em papel para: ${esc(papel.join(', '))}.</label>` : ''}
      <h3 style="margin:18px 0 8px">Assinatura digital ICP-Brasil</h3>
      <ol class="small" style="margin:0;padding-left:18px;line-height:1.7">
        <li><button class="btn btn-s" id="bpdf"><i class="ti ti-file-download"></i>Gerar PDF da receita</button> (na janela de impressão, escolha "Salvar como PDF").</li>
        <li>Assine o PDF no seu assinador com certificado ICP-Brasil (VIDaaS, BirdID, SafeID ou <a href="https://assinador.iti.br" target="_blank" rel="noopener">assinador.iti.br</a>), no padrão PAdES.</li>
        <li>Anexe o PDF assinado: <input type="file" id="fpdf" accept="application/pdf" style="margin-top:6px;max-width:100%"></li>
      </ol>
      <p class="small" id="fpdf-st" style="margin:8px 0 0"></p>
      <div class="rod">
        <button class="btn" onclick="MN.fecharModal()">Cancelar</button>
        ${local ? '<button class="btn" id="demo" title="Só para testar o fluxo">Assinar em modo demonstração</button>' : ''}
        <button class="btn btn-p" id="ok" disabled>Emitir com PDF assinado</button>
      </div>`, f => { f.querySelector('.modal').style.maxWidth = '640px'; });
    let pdf = null;
    const med = medicoResumo();
    $('#bpdf').onclick = () => MN.imprimir(MN.folhasReceita(Object.assign({}, p, { atendimento: null }), med, {}).replace(/RASCUNHO: sem validade até a assinatura do médico/g, 'Pedido ' + p.codigo + ' · documento para assinatura digital'));
    $('#fpdf').onchange = async e => {
      const f = e.target.files[0]; const st = $('#fpdf-st'); pdf = null; $('#ok').disabled = true;
      if (!f) return;
      if (f.size > 700 * 1024) { st.innerHTML = '<span style="color:var(--bad)">Arquivo acima de 700 KB. Gere o PDF sem imagens pesadas.</span>'; return; }
      const buf = new Uint8Array(await f.arrayBuffer());
      const r = MN.pdfTemAssinatura(buf);
      if (!r.pdf) { st.innerHTML = '<span style="color:var(--bad)">O arquivo não é um PDF.</span>'; return; }
      if (!r.assinado) { st.innerHTML = '<span style="color:var(--bad)">Não encontrei assinatura digital neste PDF. Assine no seu assinador ICP-Brasil e anexe o arquivo assinado.</span>'; return; }
      pdf = await new Promise(res => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(f); });
      st.innerHTML = '<span style="color:var(--ok)"><i class="ti ti-circle-check"></i> Assinatura digital encontrada. Confira a validade em validar.iti.gov.br.</span>';
      $('#ok').disabled = false;
    };
    const validar = () => {
      const reqs = [...document.querySelectorAll('#mn-modal .req')];
      if (reqs.some(c => !c.checked)) { MN.toast('Confirme todos os itens da lista.'); return false; }
      const d = $('#dec180'); if (d && !d.value) { MN.toast('Registre a decisão sobre a consulta presencial.'); return false; }
      return true;
    };
    const emitir = async tipo => {
      if (!validar()) return;
      const em = MN.agora();
      const hash = await MN.sha256(MN.conteudoAssinado(p, med, em));
      p.atendimento = Object.assign(p.atendimento || {}, {
        medico: med, concluidoEm: em, decisao180: $('#dec180') ? $('#dec180').value : null, checklistValproato: valp || null,
        assinatura: { em, tipo, hash, verificacao: hash.slice(0, 10).toUpperCase(), pdf: tipo === 'icp' ? pdf : null }
      });
      p.status = 'assinado';
      await salvar(p, tipo === 'icp' ? 'Receita assinada (ICP-Brasil) e emitida' : 'Receita emitida em modo demonstração (sem validade)');
      MN.fecharModal(); MN.toast('Receita emitida. O paciente já pode baixar pelo código ' + p.codigo + '.');
      S.abaCaso = 'receita'; desenhar();
    };
    $('#ok').onclick = () => emitir('icp');
    const demo = $('#demo'); if (demo) demo.onclick = () => emitir('demo');
  }

  function abrirRecusa() {
    const p = S.caso;
    MN.modal(`<h2>Não renovar</h2><p class="muted small">O paciente verá o motivo e a orientação na tela de acompanhamento.</p>
      <label class="campo"><span>Motivo</span><select class="inp" id="mot"><option>Necessita consulta presencial</option><option>Sinais de alerta: encaminhado para urgência</option><option>Medicação fora do escopo da renovação online</option><option>Informações insuficientes ou divergentes</option><option>Paciente não atendeu ao contato</option><option>Outro</option></select></label>
      <label class="campo"><span>Orientação ao paciente</span><textarea class="inp" id="ori2" rows="4" placeholder="Ex.: Procure consulta presencial com neurologista. Não suspenda os remédios por conta própria."></textarea></label>
      <div class="rod"><button class="btn" onclick="MN.fecharModal()">Cancelar</button><button class="btn btn-d" id="okr">Confirmar</button></div>`);
    $('#okr').onclick = async () => {
      const ori = $('#ori2').value.trim();
      if (!ori) return MN.toast('Escreva a orientação ao paciente.');
      p.atendimento = Object.assign(p.atendimento || {}, { medico: medicoResumo(), motivoRecusa: $('#mot').value, orientacaoMedico: ori, concluidoEm: MN.agora() });
      p.status = 'recusado';
      await salvar(p, 'Não renovado: ' + $('#mot').value);
      MN.fecharModal(); desenhar();
    };
  }

  /* ---------- utilidades ---------- */
  function copiar(txt) {
    (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(() => MN.toast('Copiado.'), () => {
      const ta = document.createElement('textarea'); ta.value = txt; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); MN.toast('Copiado.');
    });
  }
  function baixar(nome, conteudo, tipo) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([conteudo], { type: tipo })); a.download = nome; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  function baixarDataURL(url, nome) { const a = document.createElement('a'); a.href = url; a.download = nome; a.click(); }
  MN.baixarDataURL = baixarDataURL;
})(window);
