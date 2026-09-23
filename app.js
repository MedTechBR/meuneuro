/* Meu Neuro — rotas, entrada, acompanhamento do paciente e verificação de receita */
(function (G) {
  const MN = G.MN;
  const { esc, $ } = MN;
  const app = $('#app');
  $('#marca-svg').innerHTML = MN.marcaSVG;

  async function rota() {
    const h = location.hash.replace(/^#\/?/, '');
    const [r, a, b] = h.split('/');
    MN.fecharModal();
    document.body.classList.toggle('pg-medico', r === 'medico');
    MN.atualizarTopo();
    G.scrollTo(0, 0);
    if (r === 'paciente') return MN.telaPaciente(app);
    if (r === 'medico') return MN.telaMedico(app, a === 'caso' ? b : a);
    if (r === 'acompanhar') return telaAcompanhar(a);
    if (r === 'verificar') return telaVerificar(a);
    if (r === 'termos') return telaTermos();
    if (r === 'entrar') return telaLogin(a);
    if (r === 'minha-area') return telaMinhaArea();
    return telaHome();
  }

  function telaHome() {
    const conds = MN.CONDICOES.map(c => `<a class="cond int" href="#/paciente" data-c="${c.v}"><span class="ico"><i class="ti ${c.i}"></i></span><span>${esc(c.c)}</span><i class="ti ti-arrow-right seta"></i></a>`).join('');
    app.innerHTML = `<div class="home">
      <section class="home-hero">
        <div>
          <span class="selo"><span class="ico sm solid" style="width:24px;height:24px;border-radius:8px"><i class="ti ti-stethoscope" style="font-size:14px"></i></span>Neurologista com CRM e RQE em todo atendimento</span>
          <h1>Sua receita de neurologia <span>renovada</span> sem sair de casa</h1>
          <p class="lead">Você conta ao assistente quais remédios usa, as doses e como tem se sentido. Um neurologista lê tudo, fala com você e assina a receita digital.</p>
          <div class="home-acoes">
            <a class="btn btn-p" href="#/paciente"><i class="ti ti-message-circle"></i>Renovar minha receita</a>
            <a class="btn" href="#/acompanhar"><i class="ti ti-search"></i>Acompanhar pedido</a>
          </div>
          <div class="confianca">
            <div><span class="ico sm"><i class="ti ti-clock"></i></span>Cerca de 5 minutos para preencher</div>
            <div><span class="ico sm"><i class="ti ti-certificate"></i></span>Assinatura digital ICP-Brasil</div>
            <div><span class="ico sm"><i class="ti ti-lock"></i></span>Dados de saúde protegidos pela LGPD</div>
          </div>
        </div>
        <div class="card home-prev" aria-hidden="true">
          <div class="prev-top"><span class="av-ia">${MN.marcaSVG}</span><div><b>Assistente Meu Neuro</b><span class="on">pré-consulta</span></div></div>
          <div class="prev-msg ia">Qual é o nome do remédio que você quer renovar?</div>
          <div class="prev-msg pac">Keppra 500</div>
          <div class="prev-msg ia">Como você toma Levetiracetam 500 mg?</div>
          <div class="prev-msg pac">1 de manhã e 1 à noite</div>
          <div class="prev-msg ia">Entendi: 1 comprimido pela manhã e 1 à noite, 1.000 mg por dia. Está certo?</div>
          <div class="prev-rx"><div class="l"><b>Pedido para o neurologista</b><span class="tag acc">em revisão</span></div><div class="l"><span>Levetiracetam 500 mg</span><span class="muted">12/12 h</span></div><div class="l"><span>Última crise há mais de 1 ano</span><span class="tag ok">sem alertas</span></div></div>
        </div>
      </section>

      <div class="sec-tit"><h2>Para quem já faz tratamento</h2><p>Escolha o seu caso para começar. Serve para quem já tem diagnóstico e usa remédio de forma contínua.</p></div>
      <section class="cond-grid">${conds}</section>

      <div class="sec-tit"><h2>Como funciona</h2><p>O médico decide tudo. O assistente só adianta as informações para o atendimento ser rápido.</p></div>
      <section class="passos">
        <div class="card passo int"><span class="num">1</span><span class="ico lg"><i class="ti ti-message-circle"></i></span><h3>Você conversa com o assistente</h3><p>Ele pergunta sobre remédios, doses, efeitos e sinais de alerta.</p></div>
        <div class="card passo int"><span class="num">2</span><span class="ico lg"><i class="ti ti-stethoscope"></i></span><h3>O neurologista atende você</h3><p>Lê suas respostas, confirma com você por vídeo ou mensagem e decide a receita.</p></div>
        <div class="card passo int"><span class="num">3</span><span class="ico lg"><i class="ti ti-file-certificate"></i></span><h3>Você baixa a receita assinada</h3><p>Vale em qualquer farmácia. É só entrar com o código do pedido.</p></div>
      </section>

      <div class="aviso-urg"><span class="ico"><i class="ti ti-urgent"></i></span><span><b>Não atendemos urgência.</b> Fraqueza de repente, fala enrolada, crise convulsiva que não para ou a pior dor de cabeça da vida: ligue 192 (SAMU) ou vá ao pronto-socorro.</span></div>
      <footer class="home-rodape"><span>Meu Neuro · telemedicina conforme a Lei 14.510/2022 e a Resolução CFM 2.314/2022</span><a href="#/termos">Termo de consentimento e privacidade</a><a href="#/medico">Área do médico</a></footer>
    </div>`;
    app.querySelectorAll('.cond').forEach(a => a.addEventListener('click', () => { try { sessionStorage.setItem('mn-cond', a.dataset.c); } catch (e) { } }));
  }

  function telaTermos() {
    app.innerHTML = `<div class="estreito"><div class="card"><div class="cab-card"><span class="ico lg"><i class="ti ti-file-text"></i></span><h2>Termo de consentimento e privacidade</h2></div><div style="white-space:pre-wrap;margin-top:12px;font-size:14.5px">${esc(MN.TCLE)}</div><p class="small muted" style="margin-top:12px">Versão ${esc(MN.TCLE_VERSAO)}</p><a class="btn" href="#/" style="margin-top:14px">Voltar</a></div></div>`;
  }

  /* ---------- conta e login de demonstração ---------- */
  const PERFIS = {
    paciente: { r: 'Paciente', i: 'ti-user-heart', d: 'Renovar receitas e acompanhar pedidos', nome: 'Paciente de demonstração' },
    medico: { r: 'Médico', i: 'ti-stethoscope', d: 'Atender, revisar e assinar receitas', nome: 'Dra. Helena Duarte' },
    atendente: { r: 'Atendente', i: 'ti-headset', d: 'Contato com pacientes e andamento da fila', nome: 'Lucas Moreira' }
  };
  const MEDICO_DEMO = { nome: 'Dra. Helena Duarte', crm: '000000', uf: 'CE', rqe: '0000', especialidade: 'Neurologia', endereco: 'Endereço fictício de demonstração, 100', cidade: 'Sobral', ufEnd: 'CE', telefone: '(88) 0000-0000', demo: true };
  MN.atualizarTopo = function () {
    const box = $('#topo-conta'); if (!box) return;
    const s = MN.backend.sessao.ler();
    if (!s) { box.innerHTML = '<a class="top-link" href="#/entrar"><i class="ti ti-login-2"></i>Entrar</a>'; return; }
    const destino = s.perfil === 'paciente' ? '#/minha-area' : '#/medico';
    const ini = String(s.nome || '?').split(/\s+/).filter(w => !/^(dr|dra)\.?$/i.test(w)).map(w => w[0]).slice(0, 2).join('').toUpperCase();
    box.innerHTML = `<a class="conta" href="${destino}" title="Minha área"><span class="avatar">${esc(ini)}</span><span class="nm">${esc(String(s.nome).split(' ').slice(0, 2).join(' '))}<small>${PERFIS[s.perfil].r}</small></span></a>`;
  };

  function telaLogin(pre) {
    let perfil = PERFIS[pre] ? pre : 'paciente';
    const firebase = MN.backend.modo === 'firebase';
    const desenhar = () => {
      const P = PERFIS[perfil];
      app.innerHTML = `<div class="estreito"><div class="card">
        <div class="cab-card"><span class="ico lg"><i class="ti ti-login-2"></i></span><div><h2>Entrar no Meu Neuro</h2><p class="muted small">Escolha como você usa a plataforma.</p></div></div>
        <div class="perfis">${Object.entries(PERFIS).map(([k, x]) => `<button class="perfil int ${k === perfil ? 'on' : ''}" data-p="${k}"><span class="ico"><i class="ti ${x.i}"></i></span><span>${x.r}<br><small>${x.d}</small></span></button>`).join('')}</div>
        <form id="fl">
          <label class="campo"><span>Nome</span><input class="inp" name="nome" value="${esc(P.nome)}" required></label>
          ${firebase && perfil !== 'paciente' ? '<label class="campo"><span>E-mail</span><input class="inp" type="email" name="email" required></label><label class="campo"><span>Senha</span><input class="inp" type="password" name="senha" required></label>' : ''}
          ${perfil === 'medico' ? '<p class="nota" style="margin:-4px 0 14px">Conta fictícia com CRM 000000/CE para testar. Em produção, cada médico entra com e-mail e senha e tem o CRM e o RQE conferidos no cadastro do CFM.</p>' : ''}
          ${perfil === 'atendente' ? '<p class="nota" style="margin:-4px 0 14px">O atendente vê dados de contato e o andamento dos pedidos, sem acesso às informações clínicas nem à receita.</p>' : ''}
          ${perfil === 'paciente' ? '<p class="nota" style="margin:-4px 0 14px">Na versão final o paciente entra com CPF e código enviado por SMS ou e-mail. Aqui, para testar, basta o nome.</p>' : ''}
          <button class="btn btn-p" style="width:100%"><i class="ti ti-arrow-right"></i>Entrar como ${P.r.toLowerCase()} (demonstração)</button>
        </form></div></div>`;
      app.querySelectorAll('.perfil').forEach(b => b.onclick = () => { perfil = b.dataset.p; desenhar(); });
      $('#fl').onsubmit = async e => {
        e.preventDefault();
        const f = new FormData(e.target);
        const nome = String(f.get('nome')).trim() || P.nome;
        if (firebase && perfil !== 'paciente') {
          try { await MN.backend.medico.entrar(f.get('email'), f.get('senha')); } catch (err) { return MN.toast(err.message || 'Não foi possível entrar.'); }
        }
        MN.backend.sessao.entrar(perfil, nome);
        if (perfil === 'medico' && !(await MN.backend.medico.perfil())) await MN.backend.medico.salvarPerfil(Object.assign({}, MEDICO_DEMO, { nome }));
        MN.atualizarTopo();
        location.hash = perfil === 'paciente' ? '#/minha-area' : '#/medico';
      };
    };
    desenhar();
  }

  async function telaMinhaArea() {
    const s = MN.backend.sessao.ler();
    if (!s || s.perfil !== 'paciente') { location.hash = '#/entrar/paciente'; return; }
    let meus = [];
    try { meus = JSON.parse(localStorage.getItem('meuneuro.v1.meus-pedidos') || '[]'); } catch (e) { }
    const rot = { aguardando: ['Na fila do médico', 'acc', 'ti-clock'], em_atendimento: ['Em atendimento', 'warn', 'ti-stethoscope'], assinado: ['Receita assinada', 'ok', 'ti-file-certificate'], recusado: ['Não renovado', 'bad', 'ti-ban'], urgencia: ['Interrompido', 'bad', 'ti-urgent'] };
    const pedidos = [];
    for (const m of meus) { const r = await MN.backend.consultarPorCodigo(m.codigo, m.nasc); if (r.pedido) pedidos.push(r.pedido); }
    const rasc = MN.backend.rascunho.ler();
    app.innerHTML = `<div class="estreito">
      <div class="card"><div class="cab-card"><span class="ico lg"><i class="ti ti-user-heart"></i></span><div><h2>Olá, ${esc(String(s.nome).split(' ')[0])}</h2><p class="muted small">Suas renovações de receita neste aparelho.</p></div></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap"><a class="btn btn-p" href="#/paciente"><i class="ti ti-${rasc && rasc.status === 'rascunho' ? 'player-play' : 'plus'}"></i>${rasc && rasc.status === 'rascunho' ? 'Continuar pedido em andamento' : 'Nova renovação'}</a>
        <button class="btn btn-g" id="sair-pac"><i class="ti ti-logout"></i>Sair</button></div>
        <div class="lista-ped">${pedidos.length ? pedidos.map(p => { const x = rot[p.status] || [p.status, '', 'ti-file']; return `<a class="ped int" href="#/acompanhar/${esc(p.codigo)}"><span class="ico"><i class="ti ${x[2]}"></i></span><span class="corpo"><b>${esc((p.meds || []).map(m => m.nome).join(', ') || 'Pedido sem remédios listados')}</b><span class="m">${esc(p.codigo)} · ${esc(MN.fmtData(p.enviadoEm))}</span></span><span class="tag ${x[1]}">${x[0]}</span></a>`; }).join('') : '<div class="vazio" style="padding:26px 10px"><span class="ico lg"><i class="ti ti-file-plus"></i></span><p>Você ainda não fez nenhum pedido neste aparelho.</p></div>'}</div>
      </div></div>`;
    $('#sair-pac').onclick = () => { MN.backend.sessao.sair(); MN.atualizarTopo(); location.hash = '#/'; };
  }

  /* ---------- acompanhar ---------- */
  function telaAcompanhar(codigo) {
    let meus = [];
    try { meus = JSON.parse(localStorage.getItem('meuneuro.v1.meus-pedidos') || '[]'); } catch (e) { }
    const pre = meus.find(x => x.codigo === codigo);
    app.innerHTML = `<div class="estreito"><div class="card" id="acomp">
      <div class="cab-card"><span class="ico lg"><i class="ti ti-file-search"></i></span><div><h2>Acompanhar pedido</h2><p class="muted small">Use o código que apareceu no fim da conversa e a data de nascimento do paciente.</p></div></div>
      <form id="fa"><div class="linha2">
        <label class="campo"><span>Código do pedido</span><input class="inp" name="codigo" value="${esc(codigo || '')}" placeholder="MN-XXXXXX" required style="text-transform:uppercase"></label>
        <label class="campo"><span>Data de nascimento</span><input class="inp" name="nasc" type="date" value="${esc(pre ? pre.nasc : '')}" required></label></div>
        <button class="btn btn-p" style="width:100%">Ver pedido</button></form>
      ${meus.length ? `<p class="small muted" style="margin-top:14px">Pedidos feitos neste aparelho: ${meus.map(m => `<a href="#/acompanhar/${esc(m.codigo)}">${esc(m.codigo)}</a>`).join(' · ')}</p>` : ''}
    </div><div id="res"></div></div>`;
    $('#fa').onsubmit = async e => {
      e.preventDefault();
      const f = new FormData(e.target);
      const r = await MN.backend.consultarPorCodigo(String(f.get('codigo')).trim().toUpperCase(), f.get('nasc'));
      if (r.erro) { $('#res').innerHTML = `<div class="alerta alto" style="margin-top:14px"><i class="ti ti-alert-circle"></i><span>${r.erro === 'nao_encontrado' ? 'Não encontrei esse código.' : 'Os dados não conferem.'} ${MN.backend.modo === 'local' ? 'No modo local, o pedido só aparece no aparelho em que foi feito.' : ''}</span></div>`; return; }
      mostrarPedido(r.pedido);
    };
    if (codigo && pre) $('#fa').requestSubmit();
  }

  function mostrarPedido(p) {
    const at = p.atendimento || {};
    const passos = [
      { r: 'Pedido enviado', i: 'ti-send', f: true, d: MN.fmtData(p.enviadoEm, true) },
      { r: 'Em atendimento com o neurologista', i: 'ti-stethoscope', f: ['em_atendimento', 'assinado', 'recusado'].includes(p.status), d: at.iniciadoEm ? MN.fmtData(at.iniciadoEm, true) : '' },
      { r: p.status === 'recusado' ? 'Receita não renovada' : 'Receita assinada', i: 'ti-file-certificate', f: ['assinado', 'recusado'].includes(p.status), d: at.concluidoEm ? MN.fmtData(at.concluidoEm, true) : '' }
    ];
    const agora = passos.findIndex(x => !x.f);
    let h = `<div class="card" style="margin-top:16px"><h3>${esc(p.paciente.nome)} · ${esc(p.codigo)}</h3>
      <ol class="linha-tempo">${passos.map((x, i) => `<li class="${x.f ? 'feito' : i === agora ? 'agora' : ''}"><span class="pt"><i class="ti ${x.f ? 'ti-check' : x.i}"></i></span><div><b>${x.r}</b>${x.d ? `<div class="small muted">${esc(x.d)}</div>` : ''}</div></li>`).join('')}</ol>`;
    if (p.status === 'aguardando') h += '<p class="muted small">Seu pedido está na fila. O médico pode entrar em contato pelo telefone informado. Continue tomando seus remédios normalmente.</p>';
    if (p.status === 'urgencia') h += '<div class="alerta alto"><i class="ti ti-urgent"></i><span>Este pedido foi interrompido por sinais de alerta. Procure atendimento presencial.</span></div>';
    if (p.status === 'recusado') h += `<div class="alerta medio"><i class="ti ti-info-circle"></i><span><b>${esc(at.motivoRecusa || '')}</b><br>${esc(at.orientacaoMedico || '')}</span></div>`;
    if (p.status === 'assinado') {
      h += `${at.orientacaoMedico ? `<div class="alerta info" style="margin-bottom:12px"><i class="ti ti-message-2"></i><span><b>Orientação do médico:</b> ${esc(at.orientacaoMedico)}</span></div>` : ''}
        <div style="display:flex;gap:8px;flex-wrap:wrap">${at.assinatura && at.assinatura.pdf ? '<button class="btn btn-p" id="pdfass"><i class="ti ti-file-certificate"></i>Baixar receita assinada (PDF)</button>' : ''}<button class="btn ${at.assinatura && at.assinatura.pdf ? '' : 'btn-p'}" id="imp"><i class="ti ti-printer"></i>Ver e imprimir</button></div>
        ${(p.receitas || []).some(b => b.tipo.startsWith('notificacao')) ? '<p class="small" style="margin-top:10px">Um dos seus remédios exige receita em papel especial (notificação). O médico vai combinar com você como recebê-la.</p>' : ''}
        <p class="small muted" style="margin-top:10px">A receita vale em qualquer farmácia. Receitas de remédios controlados valem por 30 dias a partir da emissão.</p>`;
    }
    h += '</div>';
    if (p.meds && p.meds.length && p.status !== 'urgencia') h += `<div class="card" style="margin-top:16px"><h3>Informações sobre seus remédios</h3><div class="small muted" style="margin:4px 0 8px">Informações gerais. Siga sempre a orientação do seu médico.</div>${p.meds.filter(m => m.nome).map(m => `<div style="border-top:1px solid var(--line);padding:12px 0" class="msg orient" >${MN.orientacaoMed(m, p)}</div>`).join('')}<div style="border-top:1px solid var(--line);padding-top:12px" class="msg orient">${MN.seguimentoPaciente(p)}</div></div>`;
    $('#res').innerHTML = h;
    $('#res').querySelectorAll('.msg.orient').forEach(x => { x.style.border = '0'; x.style.borderTop = '1px solid var(--line)'; x.style.borderRadius = '0'; x.style.padding = '12px 0'; });
    const imp = $('#imp'); if (imp) imp.onclick = () => MN.imprimir(MN.folhasReceita(p, at.medico || {}, { orientacoes: true }));
    const pa = $('#pdfass'); if (pa) pa.onclick = () => MN.baixarDataURL(at.assinatura.pdf, 'receita-' + p.codigo + '.pdf');
  }

  /* ---------- verificar autenticidade ---------- */
  async function telaVerificar(cod) {
    app.innerHTML = `<div class="estreito"><div class="card"><div class="cab-card"><span class="ico lg"><i class="ti ti-shield-check"></i></span><div><h2>Verificar receita</h2><p class="muted small">Digite o código de verificação impresso no rodapé da receita.</p></div></div>
      <form id="fv" class="escreve"><input class="inp" name="c" value="${esc(cod || '')}" placeholder="Código de verificação" required style="text-transform:uppercase"><button class="btn btn-p" aria-label="Verificar"><i class="ti ti-search"></i></button></form>
      <div id="rv"></div>
      <p class="small muted" style="margin-top:16px">A validade jurídica da assinatura digital ICP-Brasil é conferida no validador oficial: <a href="https://validar.iti.gov.br" target="_blank" rel="noopener">validar.iti.gov.br</a>.</p></div></div>`;
    $('#fv').onsubmit = async e => {
      e.preventDefault();
      const r = await MN.backend.verificarReceita(new FormData(e.target).get('c'));
      $('#rv').innerHTML = !r ? '<div class="alerta alto" style="margin-top:14px"><i class="ti ti-x"></i><span>Código não encontrado.</span></div>'
        : `<div class="alerta ${r.valida && r.tipoAssinatura === 'icp' ? 'info' : 'medio'}" style="margin-top:14px"><i class="ti ${r.valida ? 'ti-circle-check' : 'ti-alert-circle'}"></i><span>
          ${r.tipoAssinatura === 'icp' ? 'Receita emitida pelo Meu Neuro com PDF assinado digitalmente.' : 'Receita de demonstração, sem validade legal.'}<br>
          Médico: ${esc(r.medico.nome)} · CRM ${esc(r.medico.crm)}/${esc(r.medico.uf)}<br>Paciente: ${esc(r.paciente)} · ${r.itens} item(ns) · emitida em ${esc(MN.fmtData(r.emitidaEm, true))}</span></div>`;
    };
    if (cod) $('#fv').requestSubmit();
  }

  /* ---------- início ---------- */
  (async function () {
    if (MN.backend.modo === 'local') { const m = $('#modo'); m.textContent = 'Modo local'; m.title = 'Dados guardados só neste navegador'; m.classList.remove('hide'); $('#demo-aviso').classList.remove('hide'); }
    try { await MN.backend.iniciar(); }
    catch (e) { console.error(e); MN.backend = MN.backendLocal; MN.toast('Backend indisponível; usando modo local.'); }
    G.addEventListener('hashchange', rota);
    rota();
  })();
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => { });
})(window);
