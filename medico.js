/* Meu Neuro — painel do médico: fila, revisão, receita, atendimento e assinatura */
(function (G) {
  const RF = G.RF;
  const { esc, $ } = RF;
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

  RF.telaMedico = async function (el, casoId) {
    S.el = el;
    const ses = RF.backend.sessao.ler();
    if (!ses || !['medico', 'atendente'].includes(ses.perfil)) { location.hash = '#/entrar/medico'; return; }
    S.papel = ses.perfil;
    if (RF.backend.modo === 'firebase') {
      // no modo real quem manda é a permissão gravada pelo servidor, não a escolha na tela
      const conta = await RF.backend.medico.atual();
      if (!conta || !conta.permissoes[S.papel]) { RF.backend.sessao.sair(); RF.atualizarTopo(); location.hash = '#/entrar/' + S.papel; return; }
    }
    if (S.papel === 'atendente') {
      S.medico = { nome: ses.nome || 'Atendente' };
      if (casoId === 'perfil') casoId = null;
      if (S.abaCaso !== 'resumo') S.abaCaso = 'resumo';
    } else {
      const res = await RF.sncr.aplicarResultado();
      if (res) RF.toast(res.erro || res.msg);
      const m = (await RF.backend.medico.perfil()) || {};
      S.medico = m;
      if (!m.nome || !m.crm || !m.uf) return telaPerfil(el, true);
    }
    if (casoId === 'perfil') return telaPerfil(el, false);
    await recarregar();
    S.caso = casoId ? S.pedidos.find(p => p.id === casoId) || null : null;
    if (S.caso && S.abaCaso === 'resumo' && S.caso.status === 'assinado') S.abaCaso = 'receita';
    desenhar();
  };

  async function recarregar() {
    try { S.pedidos = (await RF.backend.listarPedidos()).filter(p => p.status !== 'rascunho'); }
    catch (e) { S.pedidos = []; RF.toast('Não consegui carregar a fila: ' + e.message); }
  }

  /* ---------- perfil ---------- */
  function telaPerfil(el, primeiro) {
    const m = S.medico || {};
    const v = k => esc(m[k] || '');
    el.innerHTML = `<div class="estreito"><div class="card">
      <div class="cab-card c-violeta"><span class="ico lg"><i class="ti ti-id-badge-2"></i></span><h2>${primeiro ? 'Seus dados de prescritor' : 'Perfil do médico'}</h2></div>
      <p class="muted small" style="margin:6px 0 16px">Saem no cabeçalho e na assinatura das receitas. O receituário de controle especial exige endereço completo e telefone do emitente.</p>
      <form id="fp">
        <label class="campo"><span>Nome completo</span><input class="inp" name="nome" value="${v('nome')}" required></label>
        <div class="linha2"><label class="campo"><span>CRM</span><input class="inp" name="crm" value="${v('crm')}" required inputmode="numeric"></label>
        <label class="campo"><span>UF do CRM</span><select class="inp" name="uf" required><option value="">UF</option>${UFS.map(u => `<option ${m.uf === u ? 'selected' : ''}>${u}</option>`).join('')}</select></label></div>
        <div class="linha2"><label class="campo"><span>RQE</span><input class="inp" name="rqe" value="${v('rqe')}"></label>
        <label class="campo"><span>Especialidade</span><input class="inp" name="especialidade" value="${v('especialidade')}" placeholder="Ex.: Neurologia"></label></div>
        <div class="linha2"><label class="campo"><span>Local de atendimento (clínica ou serviço)</span><input class="inp" name="nomeLocal" value="${v('nomeLocal')}" placeholder="Ex.: Clínica São Lucas"></label>
        <label class="campo"><span>CNPJ ou CNES do local</span><input class="inp" name="cnpjLocal" value="${v('cnpjLocal')}" inputmode="numeric" placeholder="00.000.000/0000-00 ou 7 dígitos do CNES"></label></div>
        <p class="nota" style="margin:-6px 0 12px">Sai junto do endereço do emitente. É do local onde você atende, não da empresa do Meu Neuro.</p>
        <label class="campo"><span>Endereço profissional completo</span><input class="inp" name="endereco" value="${v('endereco')}" required placeholder="Rua, número, sala, bairro"></label>
        <div class="linha2"><label class="campo"><span>Cidade</span><input class="inp" name="cidade" value="${v('cidade')}" required></label>
        <label class="campo"><span>UF</span><select class="inp" name="ufEnd" required><option value="">UF</option>${UFS.map(u => `<option ${m.ufEnd === u ? 'selected' : ''}>${u}</option>`).join('')}</select></label></div>
        <div class="linha2"><label class="campo"><span>Telefone profissional</span><input class="inp" name="telefone" value="${v('telefone')}" required></label>
        <label class="campo"><span>CPF (é conferido com o seu certificado)</span><input class="inp" name="cpf" value="${v('cpf')}" inputmode="numeric" placeholder="000.000.000-00"></label></div>
        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:6px">${primeiro ? '' : '<a class="btn" href="#/medico">Cancelar</a>'}<button class="btn btn-p">Salvar</button></div>
      </form>
      ${primeiro ? '' : secaoLink(m)}
      ${primeiro ? '' : secaoSNCR(m)}
      ${primeiro ? '' : `<div style="border-top:1px solid var(--line);margin-top:22px;padding-top:16px">
        <h3>Dados deste navegador</h3><p class="small muted" style="margin:4px 0 10px">Modo ${RF.backend.modo}. ${Object.entries(RF.backend.diagnostico()).map(([k, s]) => esc(k.replace('meuneuro.v1.', '')) + ': ' + esc(s)).join(' · ') || 'nada salvo'}</p>
        <div style="display:flex;gap:8px;flex-wrap:wrap">${RF.backend.modo === 'local' ? '<button class="btn btn-s" id="exp"><i class="ti ti-download"></i>Exportar cópia (JSON)</button>' : ''}<button class="btn btn-s btn-g" id="sair"><i class="ti ti-logout"></i>Sair</button></div></div>`}
    </div></div>`;
    $('#fp').onsubmit = async e => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(e.target).entries());
      Object.keys(f).forEach(k => f[k] = String(f[k]).trim());
      if (f.cnpjLocal) { const d = RF.docLocal(f.cnpjLocal); if (!d.valido) return RF.toast('CNPJ ou CNES do local inválido: confira os números (CNPJ tem 14 dígitos, CNES tem 7).'); f.cnpjLocal = d.fmt; }
      S.medico = Object.assign({}, S.medico, f);
      await RF.backend.medico.salvarPerfil(S.medico);
      RF.toast('Dados salvos.');
      location.hash = '#/medico';
      if (primeiro) RF.telaMedico(el);
    };
    ligarSNCR();
    const cl = $('#copia-link'); if (cl) cl.onclick = () => copiar(linkDe(S.medico));
    const exp = $('#exp'); if (exp) exp.onclick = () => baixar('meuneuro-backup-' + new Date().toISOString().slice(0, 10) + '.json', JSON.stringify(RF.backend.exportar(), null, 1), 'application/json');
    const sair = $('#sair'); if (sair) sair.onclick = async () => { await RF.backend.medico.sair(); RF.backend.sessao.sair(); RF.atualizarTopo(); location.hash = '#/'; };
  }

  /* ---------- link que o médico manda aos pacientes ---------- */
  function linkDe(m) { const slug = m.linkSlug || (RF.backend.modo === 'local' ? 'demo' : ''); return slug ? location.origin + location.pathname + '#/m/' + slug : ''; }
  function secaoLink(m) {
    const u = linkDe(m);
    if (!u) return '';
    const msg = 'Para renovar sua receita, responda às perguntas neste link. Eu reviso tudo e falo com você antes de assinar: ' + u;
    return `<div style="border-top:1px solid var(--line);margin-top:22px;padding-top:16px">
      <h3 style="display:flex;align-items:center;gap:10px"><span class="ico sm c-azul"><i class="ti ti-link"></i></span>Seu link para pacientes</h3>
      <p class="small muted" style="margin:6px 0 10px">O paciente que entra por ele cai na sua fila.</p>
      <input class="inp" readonly value="${esc(u)}" aria-label="Seu link" onfocus="this.select()">
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px"><button class="btn btn-s" id="copia-link" type="button"><i class="ti ti-copy"></i>Copiar</button><a class="btn btn-s" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(msg)}"><i class="ti ti-brand-whatsapp"></i>Enviar pelo WhatsApp</a></div>
    </div>`;
  }

  /* ---------- SNCR (numeração oficial da Anvisa) ---------- */
  function secaoSNCR(m) {
    const sn = RF.sncr;
    const linha = (tipo, nota) => `<dt>${sn.TIPOS[tipo].rot}</dt><dd>${sn.saldo(m, tipo)} número(s) ${nota ? `<span class="small muted">· ${nota}</span>` : ''}</dd>`;
    return `<div class="sncr-box" style="border-top:1px solid var(--line);margin-top:22px;padding-top:16px">
      <h3 style="display:flex;align-items:center;gap:10px"><span class="ico sm c-verde"><i class="ti ti-shield-check"></i></span>Numeração SNCR da Anvisa <span class="tag ${sn.ambiente() === 'producao' ? 'ok' : 'warn'}">${sn.ambiente() === 'producao' ? 'produção' : 'homologação'}</span></h3>
      <p class="small muted" style="margin:6px 0 12px">Obrigatória nos receituários controlados eletrônicos. Cada pedido abre o gov.br com a sua conta; número obtido e não usado se perde, então peça só o que vai usar.</p>
      <dl class="dl" style="grid-template-columns:200px 1fr;font-size:14px">
        ${linha('controle_especial', 'bloco de 1.000, até 3 pedidos por mês')}${linha('notificacao_b', 'da cota aprovada pela Vigilância')}${linha('notificacao_a', 'da cota aprovada pela Vigilância')}${linha('retencao', 'bloco de 1.000, até 3 pedidos por mês')}
      </dl>
      <div class="linha2" style="margin-top:12px"><label class="campo"><span>Tipo</span><select class="inp" id="sncr-tipo">${Object.entries(sn.TIPOS).map(([k, t]) => `<option value="${k}">${t.rot}</option>`).join('')}</select></label>
        <label class="campo" id="sncr-qtd-c"><span>Quantos (notificação: 10 a 50, até 50 por dia)</span><input class="inp" id="sncr-qtd" type="number" min="10" max="50" value="10"></label></div>
      <button class="btn btn-s btn-p" id="sncr-pedir" type="button" ${sn.dominioAceito() ? '' : 'disabled title="O SNCR só aceita sites .br"'}><i class="ti ti-login-2"></i>Obter números pelo gov.br</button>
      <p class="nota">Notificações dependem de cota: peça à Vigilância Sanitária de cada estado onde você atende, inclusive em telemedicina. Com o SNCR fora do ar, a saída é o receituário em papel.</p>
    </div>`;
  }
  function ligarSNCR() {
    const b = $('#sncr-pedir'); if (!b) return;
    const sel = $('#sncr-tipo'), qc = $('#sncr-qtd-c');
    sel.onchange = () => { qc.style.display = RF.sncr.TIPOS[sel.value].faixa ? 'none' : ''; };
    sel.onchange();
    b.onclick = () => {
      const tipo = sel.value, T = RF.sncr.TIPOS[tipo];
      if (T.faixa && !confirm(`Pedir um bloco de 1.000 números de ${T.rot}? O SNCR permite 3 pedidos por mês e os números não voltam.`)) return;
      try { RF.sncr.pedirNumeros(tipo, S.medico, +$('#sncr-qtd').value || 10, '#/medico/perfil'); } catch (e) { RF.toast(e.message); }
    };
  }
  // reserva um número para cada documento controlado do pedido, em transação (dois atendimentos não pegam o mesmo)
  async function reservarNumerosSNCR(p) {
    const demo = RF.backend.modo === 'local';
    const alvo = RF.documentosDe(p).filter(x => RF.RX_REGRAS[x.b.tipo].sncr && !x.b.numeroSNCR);
    if (!alvo.length) return;
    const amb = demo ? 'demonstracao' : RF.sncr.ambiente();
    const numeros = demo ? alvo.map((_, i) => '0000.0-00.' + String(Date.now() % 1e6 + i).padStart(7, '0'))
      : await RF.backend.medico.transacaoPerfil(m => alvo.map(x => RF.sncr.consumir(m, x.b.tipo)));
    alvo.forEach((x, i) => { if (numeros[i]) { x.b.numeroSNCR = numeros[i]; x.b.ambienteSNCR = amb; } });
    await salvar(p, 'Numeração SNCR reservada: ' + numeros.filter(Boolean).join(', '));
    S.medico = (await RF.backend.medico.perfil()) || S.medico;
  }

  /* ---------- painel ---------- */
  const ICO_ABA = { aguardando: 'ti-inbox', em_atendimento: 'ti-stethoscope', assinado: 'ti-file-certificate', outros: 'ti-arrow-forward-up' };
  const COR_ABA = { aguardando: 'c-azul', em_atendimento: 'c-ambar', assinado: 'c-verde', outros: 'c-rosa' };
  const CURTO = { aguardando: 'Fila', em_atendimento: 'Atendendo', assinado: 'Assinados', outros: 'Outros' };
  function iniciais(nome) { const p = String(nome || '?').trim().split(/\s+/); return ((p[0] || '')[0] + ((p.length > 1 ? p[p.length - 1] : '')[0] || '')).toUpperCase(); }

  function desenhar() {
    const el = S.el;
    const n = k => S.pedidos.filter(ABAS_FILA.find(a => a.k === k).f).length;
    el.innerHTML = `<div class="med ${S.caso ? 'com-caso' : ''}">
      <nav class="trilho" aria-label="Seções">
        ${ABAS_FILA.map(a => `<button class="trilho-it ${COR_ABA[a.k]} ${S.aba === a.k ? 'on' : ''}" data-a="${a.k}" title="${a.r}"><span class="ico"><i class="ti ${ICO_ABA[a.k]}"></i></span>${CURTO[a.k]}${a.k === 'aguardando' && n(a.k) ? `<span class="n">${n(a.k)}</span>` : ''}</button>`).join('')}
        <span class="trilho-sp"></span>
        ${S.papel === 'medico' ? '<a class="trilho-it c-violeta" href="#/medico/perfil" title="Perfil"><span class="ico"><i class="ti ti-user-circle"></i></span>Perfil</a>' : ''}
        <button class="trilho-it c-vermelho" id="sair-trilho" title="Sair"><span class="ico"><i class="ti ti-logout"></i></span>Sair</button>
      </nav>
      <aside class="fila"><div class="fila-top">
        <div style="display:flex;align-items:center;gap:8px"><div style="flex:1"><h2>${ABAS_FILA.find(a => a.k === S.aba).r}</h2><div class="sub">${n(S.aba)} pedido${n(S.aba) === 1 ? '' : 's'}</div></div>
        <button class="btn btn-ico btn-g" id="rec" title="Atualizar" aria-label="Atualizar"><i class="ti ti-refresh"></i></button></div>
        <label class="busca"><i class="ti ti-search"></i><input id="busca" placeholder="Buscar paciente ou remédio" value="${esc(S.busca || '')}" autocomplete="off"></label>
        <div class="esp-filtro">${['Todas'].concat([...new Set(S.pedidos.flatMap(p => p.especialidades || []))].sort()).map(e => `<button class="esp-chip ${(S.esp || 'Todas') === e ? 'on' : ''}" data-e="${esc(e)}">${esc(e)}</button>`).join('')}</div>
      </div><div class="fila-lista" id="lista"></div></aside>
      <section class="caso" id="caso"></section></div>`;
    el.querySelectorAll('.trilho-it[data-a]').forEach(b => b.onclick = () => { S.aba = b.dataset.a; if (S.caso) location.hash = '#/medico'; else desenhar(); });
    $('#rec').onclick = async () => { const b = $('#rec'); b.querySelector('.ti').style.transition = 'transform .5s'; b.querySelector('.ti').style.transform = 'rotate(360deg)'; await recarregar(); if (S.caso) S.caso = S.pedidos.find(p => p.id === S.caso.id) || null; desenhar(); };
    $('#busca').oninput = e => { S.busca = e.target.value; desenharLista(); };
    S.el.querySelectorAll('.esp-chip').forEach(b => b.onclick = () => { S.esp = b.dataset.e; S.el.querySelectorAll('.esp-chip').forEach(x => x.classList.toggle('on', x === b)); desenharLista(); });
    $('#sair-trilho').onclick = async () => { try { await RF.backend.medico.sair(); } catch (e) { } RF.backend.sessao.sair(); RF.atualizarTopo(); location.hash = '#/entrar'; };
    desenharLista();
    desenharCaso();
  }

  function desenharLista() {
    const aba = ABAS_FILA.find(a => a.k === S.aba);
    const q = RF.norm(S.busca || '');
    const esp = S.esp && S.esp !== 'Todas' ? S.esp : null;
    const eu = RF.backend.medico.uid && RF.backend.medico.uid();
    const deOutro = p => S.papel === 'medico' && p.medicoUid && p.medicoUid !== eu;
    const tot = S.pedidos.filter(aba.f);
    S.temOutros = tot.some(deOutro);
    let l = tot.filter(p => S.todos || !deOutro(p)).filter(p => !esp || (p.especialidades || []).includes(esp)).filter(p => !q || RF.norm(p.paciente.nome + ' ' + (p.meds || []).map(m => m.nome).join(' ') + ' ' + p.codigo).includes(q));
    if (S.aba === 'aguardando') l.sort((a, b) => String(a.enviadoEm).localeCompare(String(b.enviadoEm)));
    const box = $('#lista');
    if (!l.length) {
      box.innerHTML = `<div class="vazio"><span class="ico lg"><i class="ti ${q ? 'ti-search-off' : 'ti-mood-empty'}"></i></span><p>${q ? 'Nada encontrado.' : 'Nenhum pedido aqui.'}</p>${S.temOutros ? '<button class="btn btn-s" id="ver-todos" style="margin-top:10px">Ver toda a clínica</button>' : ''}${!q && !S.pedidos.length && S.medico.linkSlug ? '<p class="small muted">Mande seu link aos pacientes: está no seu <a href="#/medico/perfil">perfil</a>.</p>' : ''}
        ${RF.backend.modo === 'local' && !S.pedidos.length && RF.criarExemplos ? '<button class="btn btn-s" id="ex" style="margin-top:14px"><i class="ti ti-sparkles"></i>Criar 3 pedidos de exemplo</button>' : ''}</div>`;
      const ex = $('#ex'); if (ex) ex.onclick = async () => { await RF.criarExemplos(); await recarregar(); desenhar(); };
      const vt0 = $('#ver-todos'); if (vt0) vt0.onclick = () => { S.todos = true; desenharLista(); };
      return;
    }
    const quadro = S.temOutros ? `<button class="esp-chip ${S.todos ? 'on' : ''}" id="ver-todos" style="margin:0 0 10px">${S.todos ? 'Toda a clínica' : 'Só os meus'}: trocar</button>` : '';
    box.innerHTML = quadro + l.map(p => {
      const al = p.alertas || [], altos = al.filter(x => x.nivel === 'alto').length, med = al.filter(x => x.nivel === 'medio').length;
      const meds = (p.meds || []).map(m => m.nome).join(', ') || (p.semAssistente ? 'Sem assistente' : 'Sem remédios');
      return `<button class="fila-item ${S.caso && S.caso.id === p.id ? 'on' : ''}" data-id="${p.id}"><span class="avatar ${RF.corDe(p.paciente.nome)}">${esc(iniciais(p.paciente.nome))}</span><span class="corpo">
        <span class="l1"><span class="nome">${esc(p.paciente.nome || 'Sem nome')}</span><span class="quando">${RF.quando(p.enviadoEm || p.atualizadoEm)}</span></span>
        <span class="l2" style="display:block">${esc(RF.idade(p.paciente.nasc) + ' anos · ' + meds)}</span>
        <span class="l3">${altos ? `<span class="tag bad"><i class="ti ti-alert-triangle" style="font-size:13px;vertical-align:-2px"></i>${altos}</span>` : ''}${med ? `<span class="tag warn"><i class="ti ti-alert-circle" style="font-size:13px;vertical-align:-2px"></i>${med}</span>` : ''}${(p.condicoes || []).slice(0, 2).map(c => `<span class="tag">${esc(c === 'outro' ? (p.condicaoOutra || 'Outro') : RF.condCurta(c))}</span>`).join('')}</span>
      </span></button>`;
    }).join('');
    const vt = $('#ver-todos'); if (vt) vt.onclick = () => { S.todos = !S.todos; desenharLista(); };
    box.querySelectorAll('.fila-item').forEach(b => b.onclick = () => { location.hash = '#/medico/caso/' + b.dataset.id; });
  }

  /* ---------- caso ---------- */
  function desenharCaso() {
    const box = $('#caso'), p = S.caso;
    if (!p) { box.innerHTML = '<div class="vazio" style="padding-top:120px"><span class="ico lg"><i class="ti ti-hand-click"></i></span><p>Escolha um pedido para começar o atendimento.</p></div>'; return; }
    const pa = p.paciente, st = ST[p.status] || { r: p.status, c: '' };
    const atend = S.papel === 'atendente';
    const podeAgir = !atend && (p.status === 'aguardando' || p.status === 'em_atendimento');
    box.innerHTML = `
      <a class="btn btn-s btn-g lado-btn" href="#/medico" style="margin:0 0 10px -6px"><i class="ti ti-arrow-left"></i>Voltar</a>
      <div class="caso-top"><div class="caso-quem"><span class="avatar lg ${RF.corDe(pa.nome)}">${esc(iniciais(pa.nome))}</span><div>
        <h1>${esc(pa.nome)}</h1>
        <div class="id"><span>${RF.idade(pa.nasc)} anos · ${pa.sexo === 'F' ? 'Feminino' : 'Masculino'} · ${esc(p.codigo)} · ${esc(RF.fmtData(p.enviadoEm, true))}</span><span class="tag ${st.c}">${st.r}</span></div>
      </div></div><div class="caso-acoes">
        ${pa.telefone ? `<a class="btn btn-s" target="_blank" rel="noopener" href="https://wa.me/55${esc(pa.telefone)}?text=${encodeURIComponent('Olá, ' + pa.nome.split(' ')[0] + '. Aqui é ' + (S.medico.nome || 'o médico') + ', do Meu Neuro. Recebi seu pedido de renovação de receita (' + p.codigo + ') e vou fazer seu atendimento agora.')}"><i class="ti ti-brand-whatsapp"></i>WhatsApp</a>` : ''}
        ${atend ? '<button class="btn btn-s btn-p" id="contato"><i class="ti ti-phone-check"></i>Registrar contato</button>' : ''}
        ${!atend && p.status === 'aguardando' ? '<button class="btn btn-s btn-p" id="iniciar"><i class="ti ti-player-play"></i>Iniciar atendimento</button>' : ''}
        ${!atend && p.status === 'em_atendimento' ? '<button class="btn btn-s btn-p" id="assinar"><i class="ti ti-signature"></i>Assinar e emitir</button>' : ''}
        ${podeAgir ? '<button class="btn btn-s btn-d" id="recusar">Não renovar</button>' : ''}
        ${p.status === 'assinado' ? '<button class="btn btn-s" id="imp"><i class="ti ti-printer"></i>Imprimir / PDF</button>' : ''}
      </div></div>
      ${atend ? '<div class="alerta info" style="margin-top:14px"><span class="ico"><i class="ti ti-lock"></i></span><span>Perfil atendente: você vê dados de contato e o andamento do pedido. Informações clínicas e a receita ficam com o médico.</span></div>' : ''}
      <div class="alertas">${(atend ? [] : p.alertas || []).map(a => `<div class="alerta ${a.nivel}"><span class="ico"><i class="ti ${a.nivel === 'alto' ? 'ti-alert-triangle' : a.nivel === 'medio' ? 'ti-alert-circle' : 'ti-info-circle'}"></i></span><span>${esc(a.texto)}</span></div>`).join('')}</div>
      <div class="abas">${(atend ? [['resumo', 'Dados e contato', 'ti-address-book t-verde']] : [['resumo', 'Resumo', 'ti-notes t-teal'], ['conversa', 'Conversa', 'ti-messages t-azul'], ['receita', 'Receita', 'ti-prescription t-violeta'], ['atendimento', 'Atendimento', 'ti-stethoscope t-ambar']]).map(([k, r, ic]) => `<button class="aba ${S.abaCaso === k ? 'on' : ''}" data-k="${k}"><i class="ti ${ic}"></i>${r}</button>`).join('')}</div>
      <div id="conteudo"></div>`;
    box.querySelectorAll('.aba').forEach(b => b.onclick = () => { S.abaCaso = b.dataset.k; desenharCaso(); });
    const ini = $('#iniciar'); if (ini) ini.onclick = iniciar;
    const ass = $('#assinar'); if (ass) ass.onclick = abrirAssinatura;
    const rec = $('#recusar'); if (rec) rec.onclick = abrirRecusa;
    const ct = $('#contato'); if (ct) ct.onclick = () => abrirContato(p);
    const imp = $('#imp'); if (imp) imp.onclick = () => RF.imprimir(RF.folhasReceita(p, p.atendimento.medico || S.medico, { orientacoes: true }));
    ({ resumo: abaResumo, conversa: abaConversa, receita: abaReceita, atendimento: abaAtendimento })[S.abaCaso]($('#conteudo'), p);
  }

  async function salvar(p, evento) {
    if (evento) p.historico.push({ em: RF.agora(), evento, por: S.medico.nome });
    if (S.papel === 'atendente' && RF.backend.registrarContato) return RF.backend.registrarContato(p.id, evento);
    try { await RF.backend.salvarPedido(p); }
    catch (e) { RF.toast('Não consegui salvar: ' + e.message); throw e; }
  }

  async function iniciar() {
    const p = S.caso;
    p.status = 'em_atendimento';
    p.atendimento = p.atendimento || {};
    Object.assign(p.atendimento, { iniciadoEm: RF.agora(), medico: medicoResumo(), modalidade: p.atendimento.modalidade || 'video' });
    if (!p.atendimento.evolucao) p.atendimento.evolucao = modeloEvolucao(p);
    await salvar(p, 'Atendimento iniciado');
    S.abaCaso = 'atendimento';
    desenhar();
  }
  function medicoResumo() { const m = S.medico; return { nome: m.nome, crm: m.crm, uf: m.uf, rqe: m.rqe || '', especialidade: m.especialidade || '', endereco: m.endereco, cidade: m.cidade, ufEnd: m.ufEnd, telefone: m.telefone, nomeLocal: m.nomeLocal || '', cnpjLocal: m.cnpjLocal || '' }; }
  function modeloEvolucao(p) {
    return `Teleconsulta neurológica para renovação de receita.\nPré-anamnese coletada por assistente automatizado (Meu Neuro ${RF.versao}), com transcrição anexa; informações revisadas e confirmadas pelo médico no atendimento.\n\n` +
      RF.resumoClinico(p) + `\n\nAvaliação:\n\nConduta:\n`;
  }

  /* ---------- aba resumo ---------- */
  function abaResumo(box, p) {
    const pa = p.paciente;
    const rx = k => k ? ({ simples: ['Simples', ''], controle_especial: ['Controle especial', 'warn'], notificacao_b: ['Notificação B', 'bad'], notificacao_a: ['Notificação A', 'bad'] }[k.receituario] || ['?', '']) : ['Não classificado', ''];
    let h = `<div class="sec"><h3><span class="ico sm c-azul"><i class="ti ti-id"></i></span>Paciente</h3><dl class="dl">
      <dt>Nome</dt><dd>${esc(pa.nome)}${pa.responsavel ? ' · responsável: ' + esc(pa.responsavel) : ''}</dd>
      <dt>Nascimento</dt><dd>${esc(RF.fmtData(pa.nasc))} (${RF.idade(pa.nasc)} anos)</dd>
      <dt>CPF</dt><dd>${esc(RF.fmtCPF(pa.cpf) || '—')}</dd>
      <dt>Telefone</dt><dd>${esc(pa.telefone || '—')}${pa.email ? ' · ' + esc(pa.email) : ''}</dd>
      <dt>Endereço</dt><dd>${esc([pa.endereco, pa.bairro, pa.cidade && pa.cidade + '/' + pa.uf].filter(Boolean).join(', ') || '—')}</dd>
      <dt>Consentimento</dt><dd>${p.consentimento ? 'Aceito em ' + esc(RF.fmtData(p.consentimento.em, true)) + ' (' + esc(p.consentimento.versao) + ')' + (p.consentimento.assistente === false ? ' · recusou o assistente' : '') : '—'}</dd>
    </dl></div>`;
    if (S.papel !== 'atendente' && p.meds && p.meds.length) {
      h += `<div class="sec"><h3><span class="ico sm c-violeta"><i class="ti ti-pill"></i></span>Medicações informadas</h3><div style="overflow-x:auto"><table class="tab"><thead><tr><th>Medicação</th><th>Posologia informada</th><th>Uso e adesão</th><th>Efeitos</th><th>Receituário</th></tr></thead><tbody>`;
      for (const m of p.meds) {
        const k = RF.kbPorId(m.kbId), r = rx(k), tot = RF.totalDia(m);
        const ef = (m.efeitos || []).concat(m.efeitosOutros ? [m.efeitosOutros] : []);
        h += `<tr><td><b>${esc(RF.nomeRx(m))}</b>${m.informado && RF.norm(m.informado) !== RF.norm(RF.nomeRx(m)) ? `<br><span class="small muted">digitou: "${esc(m.informado)}"</span>` : ''}</td>
          <td>${esc(m.pos ? RF.descPosologia(m.pos, m.forma) : '—')}${tot && !m.pos.sos ? `<br><span class="small muted">${RF.fmtNum(tot)} mg/dia</span>` : ''}${m.pos && m.pos.sos && m.usoMes != null ? `<br><span class="small muted">~${m.usoMes} dias/mês</span>` : ''}<br><span class="small muted">"${esc(m.posologiaTexto)}"</span></td>
          <td>${esc(RF.rotulo(RF.TEMPO_USO, m.tempoUso))}<br><span class="small muted">${esc(RF.rotulo(RF.ADESAO, m.adesao))}<br>Eficácia: ${esc(RF.rotulo(RF.EFICACIA, m.eficacia).toLowerCase())}</span></td>
          <td>${ef.length ? esc(ef.join('; ')) : '<span class="muted">Nenhum</span>'}</td>
          <td><span class="tag ${r[1]}">${r[0]}</span>${k && k.portaria344 ? `<br><span class="small muted">Lista ${esc(k.portaria344)}</span>` : ''}</td></tr>`;
        if (k && k.alertasMedico && k.alertasMedico.length) h += `<tr><td colspan="5" style="padding-top:0"><details><summary class="small" style="cursor:pointer;color:var(--acc-ink);font-weight:550"><i class="ti ti-bulb" style="font-size:15px"></i> Pontos de atenção de ${esc(k.nome)} (${k.alertasMedico.length})</summary><ul class="small" style="margin:6px 0 0;padding-left:18px">${k.alertasMedico.map(x => '<li>' + esc(x) + '</li>').join('')}${(k.monitorizacao || []).map(x => '<li>Monitorar: ' + esc(x) + '</li>').join('')}</ul></details></td></tr>`;
      }
      h += '</tbody></table></div></div>';
    }
    if (S.papel !== 'atendente') h += `<div class="sec"><h3><span class="ico sm c-teal"><i class="ti ti-notes"></i></span>Resumo para o prontuário<span style="flex:1"></span><button class="btn btn-s btn-g" id="copiar"><i class="ti ti-copy"></i>Copiar</button></h3><div class="resumo-txt">${esc(p.resumo || '')}</div>
      ${p.resumoIA ? `<h3 style="margin-top:14px">Síntese da IA</h3><div class="resumo-txt">${esc(p.resumoIA)}</div>` : ''}</div>`;
    h += `<div class="sec"><h3><span class="ico sm c-ambar"><i class="ti ti-history"></i></span>Histórico do pedido</h3><ul class="small" style="margin:0;padding-left:18px">${(p.historico || []).map(x => `<li>${esc(RF.fmtData(x.em, true))} · ${esc(x.evento)}${x.por ? ' · ' + esc(x.por) : ''}</li>`).join('')}</ul></div>`;
    box.innerHTML = h;
    const cp = $('#copiar'); if (cp) cp.onclick = () => copiar(p.resumo);
  }

  /* ---------- aba conversa ---------- */
  function abaConversa(box, p) {
    box.innerHTML = `<p class="small muted" style="margin:0 0 12px"><i class="ti ti-lock" style="font-size:15px"></i> Transcrição integral da pré-consulta com o assistente automatizado (Meu Neuro ${esc(RF.versao)}). Faz parte do prontuário.</p>
      <div class="transc">${(p.transcript || []).map(t => `<div class="msg ${t.de === 'pac' ? 'pac' : 'ia'}">${esc(t.texto)}<div style="font-size:11px;opacity:.7;margin-top:4px">${esc(RF.fmtData(t.t, true))}</div></div>`).join('')}</div>`;
  }

  /* ---------- aba receita ---------- */
  function abaReceita(box, p) {
    const edita = p.status === 'aguardando' || p.status === 'em_atendimento';
    const med = (p.atendimento && p.atendimento.medico) || medicoResumo();
    if (!edita) {
      const ass = p.atendimento && p.atendimento.assinatura;
      const dcs = (ass && ass.documentos) || [];
      box.innerHTML = `<div style="display:flex;gap:8px;flex-wrap:wrap;margin:0 0 14px">
        ${dcs.map(d => `<button class="btn btn-s ${ass.tipo === 'icp' ? 'btn-p' : ''}" data-doc="${esc(d.id)}"><i class="ti ti-file-certificate"></i>${esc(d.rot)}${d.numero ? ' ' + esc(d.numero) : ''}</button>`).join('')}
        <button class="btn btn-s" id="imp2"><i class="ti ti-printer"></i>Cópia para impressão</button>
        ${ass && p.paciente.telefone ? `<a class="btn btn-s" target="_blank" rel="noopener" href="${linkAvisoPaciente(p)}"><i class="ti ti-brand-whatsapp"></i>Avisar paciente</a>` : ''}</div>
        <div class="doc-area">${RF.folhasReceita(p, med, { orientacoes: true }) || '<p class="muted">Nenhuma receita emitida.</p>'}</div>`;
      $('#imp2').onclick = () => RF.imprimir(RF.folhasReceita(p, med, { orientacoes: true }));
      box.querySelectorAll('[data-doc]').forEach(bt => bt.onclick = async () => {
        try {
          if (ass.tipo === 'icp') return RF.backend.baixarReceita({ pedidoId: p.id, docId: bt.dataset.doc });
          const x = RF.documentosDe(p).find(d => d.id === bt.dataset.doc);
          await RF.baixarPdf(x.id, x.b, p, med, { em: ass.em, verificacao: ass.verificacao, segredo: 'demo' }, true);
        } catch (e) { RF.toast(e.message); }
      });
      return;
    }
    if (!p.receitas) p.receitas = RF.montarReceitas(p);
    const blocos = p.receitas;
    let h = `<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:0 0 14px">
      <label class="small muted" style="display:flex;align-items:center;gap:6px">Duração <select class="inp" id="dur" style="min-height:34px;padding:4px 8px;width:auto">${RF.DURACAO.map(d => `<option value="${d.v}" ${+p.duracao === d.v ? 'selected' : ''}>${d.r}</option>`).join('')}</select></label>
      <button class="btn btn-s" id="refazer" title="Refaz o rascunho a partir das respostas do paciente"><i class="ti ti-refresh"></i>Refazer rascunho</button>
      <button class="btn btn-s" id="add"><i class="ti ti-plus"></i>Adicionar item</button>
      <button class="btn btn-s" id="prev"><i class="ti ti-eye"></i>Pré-visualizar</button>
      <button class="btn btn-s" id="copiarRx" title="Para colar em outra plataforma de prescrição"><i class="ti ti-copy"></i>Copiar texto</button></div>
      <p class="nota" style="margin:0 0 14px">Rascunho gerado a partir das respostas do paciente. Revise cada item: a emissão é ato do médico. Remédios controlados respeitam os limites da Portaria 344/98 (60 dias; anticonvulsivantes e antiparkinsonianos até 6 meses; acima disso, justificativa com CID).</p>`;
    if (!blocos.length) h += '<p class="muted">Sem itens. Use "Adicionar item".</p>';
    blocos.forEach((b, bi) => {
      const r = RF.RX_REGRAS[b.tipo] || RF.RX_REGRAS.simples;
      const conf = b.tipo === 'confirmar';
      h += `<div class="rx-bloco"><div class="rx-bloco-top"><h3><span class="ico sm ${conf ? 'bad' : r.sncr ? 'warn' : ''}"><i class="ti ${conf ? 'ti-help-circle' : r.sncr ? 'ti-file-alert' : 'ti-prescription'}"></i></span>${esc(r.rot)}${b.numeroSNCR ? ` <span class="tag ok">N.º ${esc(b.numeroSNCR)}</span>` : ''}${b.papel ? ' <span class="tag bad">em papel, fora da plataforma</span>' : ''}</h3>
        ${r.sncr ? `<button class="btn btn-s btn-g" data-papel="${bi}" title="Contingência: o documento não sai por aqui">${b.papel ? 'Voltar para eletrônica' : 'Sair em papel'}</button>` : ''}</div>
        ${conf ? '<p class="nota" style="margin:0 0 10px">Não reconheci este remédio com segurança. Escolha o receituário: controlado não pode sair em receita comum.</p>' : ''}
        ${b.papel ? '<p class="nota" style="margin:0 0 10px">Combine com o paciente a entrega do receituário físico.</p>' : ''}
        <div class="rx-cab"><span>Medicamento e forma</span><span>Posologia</span><span>Quantidade / dias</span><span></span></div>`;
      b.itens.forEach((it, ii) => {
        const k = RF.kbPorId(it.kbId), lim = RF.limiteDias(k, p);
        const excede = lim && it.dias > lim;
        h += `<div class="rx-linha" data-b="${bi}" data-i="${ii}">
          <div><input class="inp" data-f="nome" value="${esc(it.nome)}" aria-label="Medicamento"><input class="inp" data-f="forma" value="${esc(it.forma)}" style="margin-top:6px" aria-label="Forma" placeholder="forma farmacêutica"></div>
          <textarea class="inp" data-f="posologia" rows="2" aria-label="Posologia">${esc(it.posologia)}</textarea>
          <div><input class="inp" data-f="quantidade" type="number" min="0" value="${it.quantidade != null ? it.quantidade : ''}" placeholder="uso contínuo" aria-label="Quantidade"><div style="display:flex;gap:6px;margin-top:6px;align-items:center"><input class="inp" data-f="dias" type="number" min="1" value="${it.dias || ''}" aria-label="Dias"><span class="small muted">dias</span></div></div>
          <button class="btn btn-s btn-g" data-del title="Remover" aria-label="Remover"><i class="ti ti-trash"></i></button>
          ${conf ? `<div style="grid-column:1/-1"><select class="inp" data-classe aria-label="Receituário"><option value="">Escolha o receituário</option>${['simples', 'controle_especial', 'notificacao_b', 'notificacao_b2', 'notificacao_a', 'retencao'].map(t => `<option value="${t}">${RF.RX_REGRAS[t].rot}</option>`).join('')}</select></div>` : ''}
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
          const k = RF.kbPorId(it.kbId), lim = RF.limiteDias(k, p);
          if (lim && ((antes > lim) !== (d > lim))) { salvar(p); abaReceita(box, p); return; }
        } else it[f] = inp.value;
        salvarDepois();
      });
      const cl = l.querySelector('[data-classe]'); if (cl) cl.onchange = () => {
        if (!cl.value) return;
        const b = blocos[+l.dataset.b]; b.itens.splice(+l.dataset.i, 1);
        if (!b.itens.length) blocos.splice(+l.dataset.b, 1);
        it.tipoConfirmado = cl.value;
        colocarNoBloco(p, it, cl.value);
        salvar(p, `Receituário de ${it.nome} definido pelo médico: ${RF.RX_REGRAS[cl.value].rot}`); abaReceita(box, p);
      };
      l.querySelector('[data-del]').onclick = () => {
        const b = blocos[+l.dataset.b]; b.itens.splice(+l.dataset.i, 1);
        if (!b.itens.length) blocos.splice(+l.dataset.b, 1);
        salvar(p, 'Item removido da receita'); abaReceita(box, p);
      };
    });
    box.querySelectorAll('[data-papel]').forEach(x => x.onclick = () => { const b = blocos[+x.dataset.papel]; b.papel = !b.papel; salvar(p, `${RF.RX_REGRAS[b.tipo].rot} de ${b.itens[0].nome}: ${b.papel ? 'sai em papel' : 'volta para eletrônica'}`); abaReceita(box, p); });
    $('#dur').onchange = e => { p.duracao = +e.target.value; p.receitas = RF.montarReceitas(p); salvar(p, 'Duração alterada para ' + p.duracao + ' dias'); abaReceita(box, p); };
    $('#refazer').onclick = () => { if (confirm('Refazer o rascunho a partir das respostas do paciente? Suas edições nesta aba serão perdidas.')) { p.receitas = RF.montarReceitas(p); salvar(p, 'Rascunho da receita refeito'); abaReceita(box, p); } };
    $('#add').onclick = () => abrirNovoItem(p, () => abaReceita(box, p));
    $('#prev').onclick = () => RF.modal(`<h2>Pré-visualização</h2><p class="small muted">Documento sem validade até a assinatura.</p><div class="doc-area" style="margin-top:12px">${RF.folhasReceita(p, med, {}) || '<p>Sem itens emissíveis.</p>'}</div><div class="rod"><button class="btn" onclick="RF.fecharModal()">Fechar</button></div>`, f => { f.querySelector('.modal').style.maxWidth = '900px'; });
    $('#copiarRx').onclick = () => copiar(textoReceita(p));
  }

  function textoReceita(p) {
    return (p.receitas || []).map(b => RF.RX_REGRAS[b.tipo].rot.toUpperCase() + '\n' + b.itens.map((it, i) => `${i + 1}. ${it.nome}${it.forma ? ' (' + it.forma + ')' : ''}\n   ${it.posologia}\n   Quantidade: ${RF.textoQuantidade(it, b.tipo)}${it.quantidade != null ? ' (' + it.dias + ' dias)' : ''}`).join('\n')).join('\n\n');
  }

  // simples agrupa; os demais são um documento por remédio
  function colocarNoBloco(p, item, tipo) {
    let b = tipo === 'simples' || tipo === 'confirmar' ? p.receitas.find(x => x.tipo === tipo) : null;
    if (!b) { b = { tipo, itens: [] }; p.receitas.push(b); p.receitas.sort((a, c) => (RF.RX_REGRAS[a.tipo].ordem || 0) - (RF.RX_REGRAS[c.tipo].ordem || 0)); }
    b.itens.push(item);
  }
  function linkAvisoPaciente(p) {
    const t = `Olá, ${p.paciente.nome.split(' ')[0]}. Sua receita do Meu Neuro está pronta. Baixe em ${location.origin + location.pathname}#/acompanhar/${p.codigo} com o código ${p.codigo} e a sua data de nascimento.`;
    return 'https://wa.me/55' + String(p.paciente.telefone).replace(/\D/g, '') + '?text=' + encodeURIComponent(t);
  }
  function abrirNovoItem(p, depois) {
    RF.modal(`<h2>Adicionar item</h2>
      <label class="campo"><span>Medicamento (busque no banco ou escreva)</span><input class="inp" id="n-nome" list="n-lista" placeholder="Ex.: Lamotrigina 100 mg"><datalist id="n-lista">${(G.RF_KB || []).map(k => `<option value="${esc(k.nome)}">`).join('')}</datalist></label>
      <label class="campo"><span>Forma</span><input class="inp" id="n-forma" placeholder="comprimido"></label>
      <label class="campo"><span>Posologia</span><textarea class="inp" id="n-pos" rows="2" placeholder="Tomar 1 comprimido por via oral de 12 em 12 horas."></textarea></label>
      <div class="linha2"><label class="campo"><span>Quantidade</span><input class="inp" id="n-qtd" type="number" min="0"></label><label class="campo"><span>Dias</span><input class="inp" id="n-dias" type="number" min="1" value="${p.duracao || 30}"></label></div>
      <div class="rod"><button class="btn" onclick="RF.fecharModal()">Cancelar</button><button class="btn btn-p" id="n-ok">Adicionar</button></div>`);
    $('#n-ok').onclick = () => {
      const nome = $('#n-nome').value.trim(); if (!nome) return RF.toast('Informe o medicamento.');
      const cl = RF.classificar(nome, null), k = cl.k || null, tipo = cl.tipo;
      const qtd = $('#n-qtd').value;
      const item = { idx: -1, kbId: k ? k.id : null, nome, forma: $('#n-forma').value.trim(), posologia: $('#n-pos').value.trim(), quantidade: qtd === '' ? null : +qtd, unidade: RF.unidadeDe($('#n-forma').value), dias: +$('#n-dias').value || 30, manual: true };
      colocarNoBloco(p, item, tipo);
      salvar(p, 'Item adicionado pelo médico: ' + nome);
      RF.fecharModal(); depois();
      RF.toast(cl.certo ? `Classificado como ${RF.RX_REGRAS[tipo].rot.toLowerCase()}.` : 'Escolha o receituário deste item.');
    };
  }

  /* ---------- aba atendimento ---------- */
  function abaAtendimento(box, p) {
    const at = p.atendimento || {};
    if (p.status === 'aguardando') {
      box.innerHTML = `<div class="card" style="padding:22px;max-width:640px"><span class="ico lg" style="margin-bottom:12px"><i class="ti ti-player-play"></i></span><h3>Atendimento ainda não iniciado</h3><p class="muted" style="margin:6px 0 14px">Ao iniciar, o pedido sai da fila de espera e o modelo de evolução é preenchido com o resumo da pré-consulta. Abra o vídeo com o paciente, confirme as informações com o paciente e registre a evolução.</p><button class="btn btn-p" id="ini2"><i class="ti ti-player-play"></i>Iniciar atendimento</button></div>`;
      $('#ini2').onclick = iniciar; return;
    }
    const so = p.status !== 'em_atendimento';
    box.innerHTML = `<div style="max-width:820px">
      ${so ? '' : `<div class="alerta info" style="margin-bottom:14px"><span class="ico"><i class="ti ti-video"></i></span><span style="flex:1">Teleconsulta por vídeo direto com o paciente. O paciente entra pelo link ou pela tela de acompanhamento.<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px"><button class="btn btn-s btn-p" id="abrir-video"><i class="ti ti-video"></i>${S.video ? 'Vídeo aberto' : 'Abrir sala de vídeo'}</button>${at.sala && p.paciente.telefone ? `<a class="btn btn-s" target="_blank" rel="noopener" href="https://wa.me/55${String(p.paciente.telefone).replace(/\D/g, '')}?text=${encodeURIComponent('Olá, ' + p.paciente.nome.split(' ')[0] + '. Sua teleconsulta do Meu Neuro vai começar: ' + location.origin + location.pathname + '#/sala/' + at.sala)}"><i class="ti ti-brand-whatsapp"></i>Enviar link</a>` : ''}</div></span></div>`}
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
    $('#abrir-video').onclick = async () => {
      if (S.video) return;
      const novo = !at.sala;
      if (novo) at.sala = (RF.backend.modo === 'local' ? 'loop:' : '') + RF.uid() + RF.uid();
      p.atendimento = at;
      S.video = true;
      if (novo) await salvar(p, 'Sala de vídeo aberta');
      abaAtendimento(box, p);
      try { S.videoCtl = await RF.abrirVideo(document.body, { id: at.sala, papel: 'medico', aoEncerrar: () => { S.video = false; S.videoCtl = null; if (S.caso === p && S.abaCaso === 'atendimento') abaAtendimento($('#conteudo'), p); } }); }
      catch (e) { S.video = false; RF.toast('Não consegui abrir o vídeo: ' + e.message); }
    };
  }

  /* ---------- assinatura ---------- */
  const paraBase64 = buf => { let t = ''; for (let i = 0; i < buf.length; i += 32768) t += String.fromCharCode.apply(null, buf.subarray(i, i + 32768)); return btoa(t); };
  function abrirAssinatura() {
    const p = S.caso, at = p.atendimento || {}, demo = RF.backend.modo === 'local', m = S.medico;
    const docs = RF.documentosDe(p);
    const papel = (p.receitas || []).filter(b => b.papel).flatMap(b => b.itens.map(i => i.nome));
    const itens = (p.receitas || []).flatMap(b => b.itens);
    const conf = (p.receitas || []).filter(b => b.tipo === 'confirmar');
    // o nome pode ter sido editado: controlado nunca sai em leiaute errado
    const trocado = (p.receitas || []).flatMap(b => b.itens.map(it => ({ b, it, c: RF.classificar(it.nome, it.kbId) }))).filter(x => x.c.certo && x.c.tipo !== x.b.tipo && !x.it.tipoConfirmado);
    const faltaJust = itens.filter(it => { const lim = RF.limiteDias(RF.kbPorId(it.kbId), p); return lim && it.dias > lim && !String(it.justificativa || '').trim(); });
    const ir = (aba, msg) => { S.abaCaso = aba; desenharCaso(); RF.toast(msg); };
    if (!docs.length && !papel.length) return RF.toast('A receita está vazia.');
    if (conf.length) return ir('receita', 'Escolha o receituário dos itens que não reconheci.');
    if (trocado.length) return ir('receita', `${trocado[0].it.nome} precisa de ${RF.RX_REGRAS[trocado[0].c.tipo].rot.toLowerCase()}: use "Refazer rascunho" ou remova e adicione o item.`);
    if (faltaJust.length) return ir('receita', 'Preencha a justificativa dos itens acima do limite de dias.');
    if (!String(at.evolucao || '').trim()) return ir('atendimento', 'Registre a evolução do atendimento antes de assinar.');
    if (!m.endereco || !m.telefone) return RF.toast('Complete endereço e telefone no perfil: saem no receituário.');
    if (docs.some(x => RF.RX_REGRAS[x.b.tipo].sncr && x.b.tipo !== 'retencao') && !p.paciente.endereco) return RF.toast('Falta o endereço do paciente, obrigatório nos controlados.');
    const c180 = RF.acima180(p) || p.ultimaConsulta === 'nunca';
    const valp = RF.valproatoFertil(p);
    // falta de numeração por tipo (já reservados não contam)
    const faltam = {};
    if (!demo) docs.forEach(x => { if (RF.RX_REGRAS[x.b.tipo].sncr && !x.b.numeroSNCR) faltam[x.b.tipo] = (faltam[x.b.tipo] || 0) + 1; });
    const semNumero = Object.keys(faltam).filter(t => RF.sncr.saldo(m, t) < faltam[t]);
    RF.modal(`<h2>Assinar e emitir</h2>
      <p class="muted small">${docs.length} documento(s) eletrônico(s)${papel.length ? ' · ' + papel.length + ' em papel' : ''}: ${esc(docs.map(x => x.b.tipo === 'simples' ? 'Receita simples' : RF.RX_REGRAS[x.b.tipo].rot + ' de ' + x.b.itens[0].nome).join('; '))}.</p>
      <label class="check"><input type="checkbox" class="req"> Revisei a pré-anamnese e confirmei as informações com o paciente no atendimento.</label>
      <label class="check"><input type="checkbox" class="req"> Revisei cada item da receita (medicamento, posologia, quantidade e tipo de receituário).</label>
      ${c180 ? `<div class="alerta alto" style="margin:10px 0 4px"><i class="ti ti-calendar-exclamation"></i><span>Consulta presencial: CFM 2.314/2022, art. 6º §2º (intervalo máximo de 180 dias em doença crônica).</span></div>
        <select class="inp req-sel" id="dec180"><option value="">Registre sua decisão</option><option>Renovo por período de transição e oriento consulta presencial</option><option>Paciente tem consulta presencial agendada</option><option>Renovo com justificativa clínica registrada na evolução</option></select>` : ''}
      ${valp ? `<div class="alerta alto" style="margin:12px 0 4px"><i class="ti ti-alert-triangle"></i><span>Valproato em mulher com potencial de engravidar: checklist de bula.</span></div>
        <label class="check"><input type="checkbox" class="req"> Contracepção eficaz confirmada.</label>
        <label class="check"><input type="checkbox" class="req"> Gravidez descartada (teste quando indicado).</label>
        <label class="check"><input type="checkbox" class="req"> Alternativas terapêuticas consideradas e registradas.</label>
        <label class="check"><input type="checkbox" class="req"> Paciente ciente dos riscos (registrado na evolução).</label>` : ''}
      ${papel.length ? `<label class="check"><input type="checkbox" class="req"> Vou providenciar em papel: ${esc(papel.join(', '))}.</label>` : ''}
      ${semNumero.map(t => `<div class="alerta medio" style="margin:12px 0 0"><span class="ico"><i class="ti ti-numbers"></i></span><span style="flex:1">Faltam números de ${esc(RF.sncr.TIPOS[t].rot)} (preciso de ${faltam[t]}, tenho ${RF.sncr.saldo(m, t)}). <button class="btn btn-s btn-p" data-numeros="${t}" style="margin-top:6px"><i class="ti ti-login-2"></i>Obter pelo gov.br</button><br><span class="small">Sem cota ou com o SNCR fora do ar: feche e marque "Sair em papel" na aba Receita.</span></span></div>`).join('')}
      ${demo ? '<p class="nota" style="margin-top:12px">Demonstração: a numeração é fictícia e os PDFs saem marcados como sem validade.</p>' : ''}
      <div id="ass-corpo"></div>
      <div class="rod">
        <button class="btn" onclick="RF.fecharModal()">Cancelar</button>
        ${demo ? '<button class="btn btn-p" id="demo"><i class="ti ti-device-mobile-check"></i>Assinar com VIDaaS (simulação)</button>' : `<button class="btn btn-p" id="vidaas" ${semNumero.length ? 'disabled' : ''}><i class="ti ti-device-mobile-check"></i>Assinar com VIDaaS</button>`}
      </div>`, f => { f.querySelector('.modal').style.maxWidth = '660px'; });
    document.querySelectorAll('[data-numeros]').forEach(b => b.onclick = () => {
      try { RF.sncr.pedirNumeros(b.dataset.numeros, m, Math.max(10, faltam[b.dataset.numeros]), '#/medico/caso/' + p.id); } catch (e) { RF.toast(e.message); }
    });
    let decisao180 = null;
    const med = medicoResumo();
    const validar = () => {
      const reqs = [...document.querySelectorAll('#rf-modal .req')];
      if (reqs.some(c => !c.checked)) { RF.toast('Confirme todos os itens da lista.'); return false; }
      const d = $('#dec180'); if (d && !d.value) { RF.toast('Registre a decisão sobre a consulta presencial.'); return false; }
      decisao180 = d ? d.value : null;
      return true;
    };
    // verificação e data entram no PDF antes de assinar: ficam gravadas para o servidor usar as mesmas
    const prepararEmissao = async () => {
      await reservarNumerosSNCR(p);
      const semN = RF.documentosDe(p).filter(x => RF.RX_REGRAS[x.b.tipo].sncr && !x.b.numeroSNCR);
      if (semN.length) throw new Error('Saldo de numeração insuficiente. Obtenha números no perfil.');
      const hex = n => [...crypto.getRandomValues(new Uint8Array(n))].map(x => x.toString(16).padStart(2, '0')).join('');
      const a = p.atendimento;
      a.medico = med; a.decisao180 = decisao180; a.checklistValproato = valp || null;
      a.preparo = a.preparo || { em: RF.agora(), verificacao: hex(5).toUpperCase(), segredo: hex(18) };
      await salvar(p);
      return a.preparo;
    };
    const depois = async msg => {
      Object.assign(p, await RF.backend.obterPedido(p.id));
      RF.fecharModal(); RF.toast(msg);
      S.abaCaso = 'receita'; await recarregar(); desenhar();
    };
    const corpo = $('#ass-corpo');
    if (!demo) {
      // caminho alternativo: PDF oficial assinado no assinador do médico
      corpo.innerHTML = `<details style="margin-top:16px"><summary style="cursor:pointer;font-weight:600">Assinar por fora (BirdID, SafeID, token, assinador.iti.br)</summary>
        <p class="small muted" style="margin:8px 0">Baixe cada PDF, assine em PAdES com o certificado ICP-Brasil do CPF do seu perfil e anexe aqui. Não edite o arquivo.</p>
        <div id="anexos">${docs.map(x => `<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:8px 0;border-top:1px solid var(--line)"><span style="flex:1;min-width:180px" class="small"><b>${esc(RF.RX_REGRAS[x.b.tipo].rot)}</b><br>${esc(x.b.itens.map(i => i.nome).join(', '))}</span><button class="btn btn-s" data-baixa="${x.id}"><i class="ti ti-download"></i>PDF</button><input type="file" accept="application/pdf" data-anexo="${x.id}" style="max-width:190px"><span data-st="${x.id}" class="small"></span></div>`).join('')}</div>
        <button class="btn btn-p" id="ok" disabled style="margin-top:8px"><i class="ti ti-send"></i>Emitir com os PDFs assinados</button></details>`;
      const anexos = {};
      corpo.querySelectorAll('[data-baixa]').forEach(b => b.onclick = async () => {
        if (!validar()) return;
        try { const pr = await prepararEmissao(); const x = RF.documentosDe(p).find(d => d.id === b.dataset.baixa); await RF.baixarPdf(x.id, x.b, p, med, pr, false); }
        catch (e) { RF.toast(e.message); }
      });
      corpo.querySelectorAll('[data-anexo]').forEach(inp => inp.onchange = async () => {
        const id = inp.dataset.anexo, st = corpo.querySelector(`[data-st="${id}"]`), f = inp.files[0];
        delete anexos[id];
        if (f) {
          const buf = new Uint8Array(await f.arrayBuffer()), r = RF.pdfTemAssinatura(buf);
          if (r.assinado) { anexos[id] = paraBase64(buf); st.innerHTML = '<i class="ti ti-circle-check t-verde"></i>'; }
          else st.textContent = r.pdf ? 'Sem assinatura digital.' : 'Não é PDF.';
        } else st.textContent = '';
        $('#ok').disabled = docs.some(x => !anexos[x.id]) || !p.atendimento.preparo;
      });
      $('#ok').onclick = async () => {
        if (!validar()) return;
        $('#ok').disabled = true;
        try {
          await prepararEmissao();
          const r = await RF.backend.emitirComAnexos(p.id, docs.map(x => ({ id: x.id, pdfBase64: anexos[x.id] })));
          await depois('Receita emitida. Verificação ' + r.verificacao + '.');
        } catch (e) { RF.toast(e.message); $('#ok').disabled = false; }
      };
    }
    const vd = $('#vidaas'); if (vd) vd.onclick = async () => {
      if (!validar()) return;
      const mm = document.querySelector('#rf-modal .modal');
      const tela = (tit, txt, carregando) => { mm.innerHTML = `<div style="text-align:center;padding:10px 4px"><span class="ico lg c-verde" style="margin:0 auto 14px;width:64px;height:64px;border-radius:20px"><i class="ti ti-device-mobile-message" style="font-size:30px"></i></span><h2>${tit}</h2><p class="muted" style="margin:8px 0 18px">${txt}</p>${carregando ? '<div class="digitando" style="justify-content:center;display:flex"><i></i><i></i><i></i></div>' : ''}<div class="rod" style="justify-content:center"><button class="btn" onclick="RF.fecharModal()">Fechar</button></div></div>`; };
      try {
        await prepararEmissao();
        let st = await RF.backend.assinatura.status();
        if (!st.autorizado) {
          await RF.backend.assinatura.iniciar();
          tela('Aprove no seu celular', 'Enviamos uma notificação para o app VIDaaS do CPF do seu perfil. Toque em Autorizar.', true);
          const t0 = Date.now();
          while (!st.autorizado && Date.now() - t0 < 5 * 60 * 1000 && document.getElementById('rf-modal')) {
            await new Promise(r => setTimeout(r, 3000));
            st = await RF.backend.assinatura.status();
            if (st.expirado) throw new Error('A autorização expirou. Tente de novo.');
          }
          if (!st.autorizado) return;
        }
        tela('Assinando', `Gerando ${docs.length} documento(s) e assinando com seu certificado ICP-Brasil.`, true);
        const r = await RF.backend.assinatura.assinar(p.id);
        await depois('Receita assinada. Verificação ' + r.verificacao + '.');
      } catch (e) {
        const semServidor = /functions\/(not-found|internal|unavailable)/.test((e && e.code) || '');
        tela('Não foi possível assinar', semServidor ? 'O servidor de assinatura não respondeu. Use "Assinar por fora" ou tente em instantes.' : RF.esc(e.message || 'Erro na assinatura.'), false);
      }
    };
    const dm = $('#demo'); if (dm) dm.onclick = () => {
      if (!validar()) return;
      // simulação do fluxo integrado: push no app VIDaaS do médico, aprovação no celular, PDF assinado volta sozinho
      const mm = document.querySelector('#rf-modal .modal');
      mm.innerHTML = `<div style="text-align:center;padding:10px 4px">
        <span class="ico lg" style="margin:0 auto 14px;width:64px;height:64px;border-radius:20px"><i class="ti ti-device-mobile-message" style="font-size:30px"></i></span>
        <h2>Aprove no seu celular</h2>
        <p class="muted" style="margin:8px 0 18px">Enviamos uma notificação para o app VIDaaS do CPF cadastrado. Abra o app e toque em Autorizar.</p>
        <div class="digitando" style="justify-content:center;display:flex"><i></i><i></i><i></i></div>
        <p class="nota" style="margin:14px 0 18px">Simulação para demonstração: nenhuma notificação real é enviada e a receita não tem validade legal.</p>
        <div class="rod" style="justify-content:center"><button class="btn" onclick="RF.fecharModal()">Cancelar</button><button class="btn btn-p" id="aprovar"><i class="ti ti-check"></i>Simular aprovação no celular</button></div></div>`;
      document.getElementById('aprovar').onclick = async () => {
        await reservarNumerosSNCR(p);
        const em = RF.agora(), hash = await RF.sha256(RF.conteudoAssinado(p, med, em));
        p.atendimento = Object.assign(p.atendimento || {}, { medico: med, concluidoEm: em, decisao180, checklistValproato: valp || null,
          assinatura: { em, tipo: 'demo', hash, verificacao: hash.slice(0, 10).toUpperCase(), documentos: RF.documentosDe(p).map(x => ({ id: x.id, tipo: x.b.tipo, rot: RF.RX_REGRAS[x.b.tipo].rot, numero: x.b.numeroSNCR || '' })) } });
        p.status = 'assinado';
        await salvar(p, 'Receita emitida em modo demonstração (sem validade)');
        RF.fecharModal(); RF.toast('Receita emitida (demonstração). O paciente já pode baixar pelo código ' + p.codigo + '.');
        S.abaCaso = 'receita'; desenhar();
      };
    };
  }

  function abrirContato(p) {
    RF.modal(`<div class="cab-card"><span class="ico lg"><i class="ti ti-phone-check"></i></span><h2>Registrar contato</h2></div>
      <label class="campo"><span>Resultado</span><select class="inp" id="res-ct"><option>Paciente confirmou os dados e aguarda o médico</option><option>Não atendeu; nova tentativa depois</option><option>Horário do atendimento combinado</option><option>Paciente pediu para cancelar</option></select></label>
      <label class="campo"><span>Observação (opcional)</span><textarea class="inp" id="obs-ct" rows="3" placeholder="Ex.: prefere contato à tarde"></textarea></label>
      <div class="rod"><button class="btn" onclick="RF.fecharModal()">Cancelar</button><button class="btn btn-p" id="ok-ct"><i class="ti ti-check"></i>Registrar</button></div>`);
    $('#ok-ct').onclick = async () => {
      const obs = $('#obs-ct').value.trim();
      await salvar(p, 'Contato: ' + $('#res-ct').value + (obs ? ' (' + obs + ')' : ''));
      RF.fecharModal(); RF.toast('Contato registrado no histórico.'); desenharCaso();
    };
  }

  function abrirRecusa() {
    const p = S.caso;
    RF.modal(`<h2>Não renovar</h2><p class="muted small">O paciente verá o motivo e a orientação na tela de acompanhamento.</p>
      <label class="campo"><span>Motivo</span><select class="inp" id="mot"><option>Necessita consulta presencial</option><option>Sinais de alerta: encaminhado para urgência</option><option>Medicação fora do escopo da renovação online</option><option>Informações insuficientes ou divergentes</option><option>Paciente não atendeu ao contato</option><option>Outro</option></select></label>
      <label class="campo"><span>Orientação ao paciente</span><textarea class="inp" id="ori2" rows="4" placeholder="Ex.: Procure consulta presencial com o seu médico. Não suspenda os remédios por conta própria."></textarea></label>
      <div class="rod"><button class="btn" onclick="RF.fecharModal()">Cancelar</button><button class="btn btn-d" id="okr">Confirmar</button></div>`);
    $('#okr').onclick = async () => {
      const ori = $('#ori2').value.trim();
      if (!ori) return RF.toast('Escreva a orientação ao paciente.');
      p.atendimento = Object.assign(p.atendimento || {}, { medico: medicoResumo(), motivoRecusa: $('#mot').value, orientacaoMedico: ori, concluidoEm: RF.agora() });
      p.status = 'recusado';
      await salvar(p, 'Não renovado: ' + $('#mot').value);
      RF.fecharModal(); desenhar();
    };
  }

  /* ---------- utilidades ---------- */
  function copiar(txt) {
    (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(() => RF.toast('Copiado.'), () => {
      const ta = document.createElement('textarea'); ta.value = txt; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); RF.toast('Copiado.');
    });
  }
  function baixar(nome, conteudo, tipo) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([conteudo], { type: tipo })); a.download = nome; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  function baixarDataURL(url, nome) { const a = document.createElement('a'); a.href = url; a.download = nome; a.click(); }
  RF.baixarDataURL = baixarDataURL;
})(window);
