/* Meu Neuro — rotas, entrada, acompanhamento do paciente e verificação de receita */
(function (G) {
  const RF = G.RF;
  const { esc, $ } = RF;
  const app = $('#app');
  $('#marca-svg').innerHTML = RF.marcaSVG;

  async function rota() {
    const h = location.hash.replace(/^#\/?/, '');
    const [r, a, b] = h.split('/');
    RF.fecharModal();
    document.body.classList.toggle('pg-medico', r === 'medico');
    RF.atualizarTopo();
    G.scrollTo(0, 0);
    if (r === 'paciente') return RF.telaPaciente(app);
    if (r === 'medico') return RF.telaMedico(app, a === 'caso' ? b : a);
    if (r === 'acompanhar') return telaAcompanhar(a);
    if (r === 'verificar') return telaVerificar(a);
    if (r === 'termos') return telaTermos();
    if (r === 'entrar') return telaLogin(a);
    if (r === 'minha-area') return telaMinhaArea();
    if (r === 'admin') return telaAdmin();
    if (r === 'sala') return telaSala(a);
    if (r === 'm') return telaLink(a);
    return telaHome();
  }

  /* ---------- página pública: fala com o médico ---------- */
  function telaHome() {
    const demo = RF.backend.modo === 'local';
    const item = (cor, ic, tit, txt) => `<div class="card passo int ${cor}"><span class="ico lg"><i class="ti ${ic}"></i></span><h3>${tit}</h3><p>${txt}</p></div>`;
    app.innerHTML = `<div class="home">
      <section class="home-hero">
        <div>
          <span class="selo"><span class="ico sm solid" style="width:24px;height:24px;border-radius:8px"><i class="ti ti-brain" style="font-size:14px"></i></span>Para neurologistas e neurocirurgiões</span>
          <h1>Renovação de receita <span>neurológica</span> para o seu consultório</h1>
          <p class="lead">Você manda um link ao paciente. Um assistente pergunta quais remédios ele usa, as doses, os efeitos e os sinais de alerta. Você recebe o resumo e a receita já rascunhada, fala com ele por vídeo e assina.</p>
          <div class="home-acoes">
            <a class="btn btn-p" href="mailto:contato@medtechbr.com.br?subject=${encodeURIComponent('Quero usar o Meu Neuro')}"><i class="ti ti-mail"></i>Falar com a MedTech</a>
            ${demo ? '<a class="btn" href="#/m/demo"><i class="ti ti-eye"></i>Ver como o paciente vê</a>' : ''}
            <a class="btn" href="#/entrar/medico"><i class="ti ti-login-2"></i>Entrar</a>
          </div>
        </div>
        <div class="home-prev-wrap">
        <div class="card home-prev" aria-hidden="true">
          <div class="prev-top"><span class="av-ia">${RF.marcaSVG}</span><div><b>Assistente Meu Neuro</b><span class="on">pré-consulta</span></div></div>
          <div class="prev-msg ia">Qual é o nome do remédio que você quer renovar?</div>
          <div class="prev-msg pac">Keppra 500</div>
          <div class="prev-msg ia">Como você toma Levetiracetam 500 mg?</div>
          <div class="prev-msg pac">1 de manhã e 1 à noite</div>
          <div class="prev-rx"><div class="l"><b>Pedido para o médico</b><span class="tag acc">em revisão</span></div><div class="l"><span>Levetiracetam 500 mg</span><span class="muted">12/12 h</span></div><div class="l"><span>Sem crises há mais de 1 ano</span><span class="tag ok">sem alertas</span></div></div>
        </div></div>
      </section>
      <div class="sec-tit"><h2>O que vem pronto</h2><p>O médico decide tudo. O sistema adianta o que é repetitivo.</p></div>
      <section class="passos">
        ${item('c-azul', 'ti-link', 'Seu link e sua fila', 'Cada médico tem um endereço próprio. Os dados de cada clínica ficam separados dos demais.')}
        ${item('c-violeta', 'ti-message-circle', 'Pré-consulta guiada', 'Epilepsia, cefaleia, Parkinson, tremor, demência, dor neuropática, AVC e sono, com perguntas de controle de cada caso.')}
        ${item('c-ambar', 'ti-alert-triangle', 'Alertas na revisão', 'Interações, doses, gestação com valproato, intervalo de 180 dias da consulta presencial e sinais de urgência.')}
        ${item('c-verde', 'ti-file-certificate', 'Receita conforme a Anvisa', 'Modelos oficiais eletrônicos, numeração do SNCR e assinatura ICP-Brasil, inclusive controle especial e notificações.')}
        ${item('c-rosa', 'ti-video', 'Teleconsulta por vídeo', 'Vídeo direto com o paciente, sem instalar nada, e aviso pelo WhatsApp quando a receita fica pronta.')}
        ${item('c-teal', 'ti-notes', 'Prontuário do atendimento', 'Evolução já preenchida com o resumo, transcrição da conversa e histórico de cada pedido.')}
      </section>
      <footer class="home-rodape"><span>${rodapeEmpresa()}</span><a href="#/verificar">Verificar uma receita</a><a href="#/acompanhar">Sou paciente: acompanhar pedido</a></footer>
    </div>`;
  }

  /* ---------- página do médico: fala com o paciente ---------- */
  async function telaLink(slug) {
    app.innerHTML = '<div class="estreito"><div class="card"><p class="muted">Carregando…</p></div></div>';
    let l = null;
    try { l = slug ? await RF.backend.obterLink(slug) : null; } catch (e) { console.warn(e); }
    if (!l) { app.innerHTML = '<div class="estreito"><div class="card"><div class="cab-card c-ambar"><span class="ico lg"><i class="ti ti-link-off"></i></span><div><h2>Link indisponível</h2><p class="muted small">Confira o endereço com o seu médico.</p></div></div><a class="btn" href="#/acompanhar"><i class="ti ti-search"></i>Acompanhar um pedido que já fiz</a></div></div>'; return; }
    RF.link.gravar(l);
    const cl = l.clinica, conds = RF.CONDICOES.map(c => `<a class="cond int ${c.cor}" href="#/paciente" data-c="${c.v}"><span class="ico"><i class="ti ${c.i}"></i></span><span>${esc(c.c)}</span><i class="ti ti-arrow-right seta"></i></a>`).join('');
    app.innerHTML = `<div class="home">
      <section class="home-hero" style="grid-template-columns:1fr">
        <div>
          <span class="selo"><span class="avatar ${RF.corDe(l.medicoNome)}" style="width:26px;height:26px;font-size:11px">${esc(String(l.medicoNome || '?').split(/\s+/).filter(w => !/^(dr|dra)\.?$/i.test(w)).map(w => w[0]).slice(0, 2).join('').toUpperCase())}</span>${esc(l.medicoNome || cl.nome)}${l.crm ? ' · CRM ' + esc(l.crm) + '/' + esc(l.uf) : ''}${l.rqe ? ' · RQE ' + esc(l.rqe) : ''}</span>
          <h1>Renove sua receita <span>sem sair de casa</span></h1>
          <p class="lead">Responda às perguntas sobre seus remédios, as doses e como tem se sentido. ${esc(String(l.medicoNome || 'O médico'))} lê tudo, fala com você por vídeo e assina a receita digital, inclusive de remédio controlado.</p>
          <div class="home-acoes">
            <a class="btn btn-p" href="#/paciente"><i class="ti ti-message-circle"></i>Renovar minha receita</a>
            <a class="btn" href="#/acompanhar"><i class="ti ti-search"></i>Acompanhar pedido</a>
          </div>
          <div class="confianca">
            <div class="c-ambar"><span class="ico sm"><i class="ti ti-clock"></i></span>Cerca de 5 minutos para preencher</div>
            <div class="c-verde"><span class="ico sm"><i class="ti ti-certificate"></i></span>Assinatura digital ICP-Brasil</div>
            <div class="c-violeta"><span class="ico sm"><i class="ti ti-lock"></i></span>Dados de saúde protegidos pela LGPD</div>
          </div>
        </div>
      </section>
      <div class="sec-tit"><h2>Para quem já faz tratamento</h2><p>Escolha o seu caso para começar.</p></div>
      <section class="cond-grid">${conds}</section>
      <div class="aviso-urg"><span class="ico"><i class="ti ti-urgent"></i></span><span><b>Não atendemos urgência.</b> Dor no peito, falta de ar forte, fraqueza de repente, fala enrolada ou crise convulsiva que não para: ligue 192 (SAMU) ou vá ao pronto-socorro.</span></div>
      <footer class="home-rodape"><span>${esc(`Atendimento: ${cl.nome}${cl.cnpj ? ', CNPJ ' + cl.cnpj : ''}${cl.cidade ? ', ' + cl.cidade + '/' + (cl.uf || '') : ''}.`)}${cl.rt && cl.rt.nome ? esc(` Responsável técnico: ${cl.rt.nome}, CRM ${cl.rt.crm}/${cl.rt.uf}.`) : ''} ${rodapePlataforma()}</span><a href="#/termos">Termo de consentimento e privacidade</a></footer>
    </div>`;
    app.querySelectorAll('.cond').forEach(a => a.addEventListener('click', () => { try { sessionStorage.setItem('mn-cond', a.dataset.c); } catch (e) { } }));
  }

  function rodapePlataforma() {
    const e = (G.MEUNEURO_CONFIG || {}).empresa || {};
    return esc(`Plataforma Meu Neuro, de ${e.razao}, CNPJ ${e.cnpj}.`);
  }
  function rodapeEmpresa() {
    const r = (G.MEUNEURO_CONFIG || {}).responsavelTecnico || {};
    return rodapePlataforma() + esc(' Telemedicina conforme a Lei 14.510/2022 e a Resolução CFM 2.314/2022.') + (r.nome ? esc(` Responsável técnico: ${r.nome}, CRM ${r.crm}/${r.uf}.`) : '');
  }

  function telaTermos() {
    app.innerHTML = `<div class="estreito"><div class="card"><div class="cab-card"><span class="ico lg"><i class="ti ti-file-text"></i></span><h2>Termo de consentimento e privacidade</h2></div><div style="white-space:pre-wrap;margin-top:12px;font-size:14.5px">${esc(RF.tcleDe((RF.link.ler() || {}).clinica))}</div><p class="small muted" style="margin-top:12px">Versão ${esc(RF.TCLE_VERSAO)}</p><a class="btn" href="#/" style="margin-top:14px">Voltar</a></div></div>`;
  }

  /* ---------- conta e login de demonstração ---------- */
  const PERFIS = {
    paciente: { r: 'Paciente', cor: 'c-rosa', i: 'ti-user-heart', d: 'Renovar receitas e acompanhar pedidos', nome: 'Paciente de demonstração' },
    medico: { r: 'Médico', cor: 'c-azul', i: 'ti-stethoscope', d: 'Atender, revisar e assinar receitas', nome: 'Dra. Helena Duarte' },
    atendente: { r: 'Atendente', cor: 'c-verde', i: 'ti-headset', d: 'Contato com pacientes e andamento da fila', nome: 'Lucas Moreira' }
  };
  const MEDICO_DEMO = { nome: 'Dra. Helena Duarte', crm: '000000', uf: 'CE', rqe: '0000', especialidade: 'Neurologia', endereco: 'Endereço fictício de demonstração, 100', cidade: 'Sobral', ufEnd: 'CE', telefone: '(88) 0000-0000', nomeLocal: 'Clínica de demonstração', cnpjLocal: '0000000', demo: true };
  RF.atualizarTopo = function () {
    const box = $('#topo-conta'); if (!box) return;
    const s = RF.backend.sessao.ler();
    if (!s) { box.innerHTML = '<a class="top-link" href="#/entrar"><i class="ti ti-login-2"></i>Entrar</a>'; return; }
    const destino = s.perfil === 'paciente' ? '#/minha-area' : '#/medico';
    const ini = String(s.nome || '?').split(/\s+/).filter(w => !/^(dr|dra)\.?$/i.test(w)).map(w => w[0]).slice(0, 2).join('').toUpperCase();
    box.innerHTML = `<a class="conta" href="${destino}" title="Minha área"><span class="avatar ${PERFIS[s.perfil].cor}">${esc(ini)}</span><span class="nm">${esc(String(s.nome).split(' ').slice(0, 2).join(' '))}<small>${PERFIS[s.perfil].r}</small></span></a>`;
  };

  function telaLogin(pre) {
    let perfil = PERFIS[pre] ? pre : 'paciente';
    const firebase = RF.backend.modo === 'firebase';
    if (firebase && perfil === 'paciente') { location.hash = '#/paciente'; return; }
    const desenhar = () => {
      const P = PERFIS[perfil];
      app.innerHTML = `<div class="estreito"><div class="card">
        <div class="cab-card c-azul"><span class="ico lg"><i class="ti ti-login-2"></i></span><div><h2>Entrar no Meu Neuro</h2><p class="muted small">Escolha como você usa a plataforma.</p></div></div>
        <div class="perfis">${Object.entries(PERFIS).filter(([k]) => !firebase || k !== 'paciente').map(([k, x]) => `<button class="perfil int ${x.cor} ${k === perfil ? 'on' : ''}" data-p="${k}"><span class="ico"><i class="ti ${x.i}"></i></span><span>${x.r}<br><small>${x.d}</small></span></button>`).join('')}</div>
        <form id="fl">
          <label class="campo"><span>Nome</span><input class="inp" name="nome" value="${firebase && perfil !== 'paciente' ? '' : esc(P.nome)}" placeholder="Seu nome completo" required autocomplete="name"></label>
          ${firebase && perfil !== 'paciente' ? '<label class="campo"><span>E-mail</span><input class="inp" type="email" name="email" required autocomplete="username"></label><label class="campo"><span>Senha</span><input class="inp" type="password" name="senha" required minlength="8" autocomplete="current-password"></label><label class="check" style="margin-top:-4px"><input type="checkbox" name="novo"> Ainda não tenho conta: criar agora (fica aguardando aprovação)</label>' : ''}
          ${perfil === 'medico' ? `<p class="nota" style="margin:-4px 0 14px">${firebase ? 'Na primeira vez, marque "criar agora". A administração confere CRM e RQE no Cadastro Nacional do CFM antes de liberar o acesso.' : 'Conta fictícia com CRM 000000/CE, só para testar.'}</p>` : ''}
          ${perfil === 'atendente' ? '<p class="nota" style="margin:-4px 0 14px">O atendente vê dados de contato e o andamento dos pedidos, sem acesso às informações clínicas nem à receita.</p>' : ''}
          ${perfil === 'paciente' ? '<p class="nota" style="margin:-4px 0 14px">Na versão final o paciente entra com CPF e código enviado por SMS ou e-mail. Aqui, para testar, basta o nome.</p>' : ''}
          <button class="btn btn-p" style="width:100%"><i class="ti ti-arrow-right"></i>Entrar como ${P.r.toLowerCase()}${firebase && perfil !== 'paciente' ? '' : ' (demonstração)'}</button>
        </form></div></div>`;
      app.querySelectorAll('.perfil').forEach(b => b.onclick = () => { perfil = b.dataset.p; desenhar(); });
      $('#fl').onsubmit = async e => {
        e.preventDefault();
        const f = new FormData(e.target);
        const nome = String(f.get('nome')).trim() || P.nome;
        if (firebase && perfil !== 'paciente') {
          let m;
          try {
            m = f.get('novo') ? await RF.backend.medico.cadastrar(f.get('email'), f.get('senha'), { papel: perfil, perfil: { nome } })
              : await RF.backend.medico.entrar(f.get('email'), f.get('senha'));
          } catch (err) { return RF.toast(traduzErroAuth(err)); }
          if (!m || !m.permissoes || !m.permissoes[perfil]) {
            app.innerHTML = `<div class="estreito"><div class="card"><div class="cab-card c-ambar"><span class="ico lg"><i class="ti ti-hourglass"></i></span><div><h2>Conta aguardando aprovação</h2><p class="muted small">${esc(f.get('email'))}</p></div></div>
              <p>Seu acesso como ${P.r.toLowerCase()} será liberado depois que a administração conferir seu cadastro${perfil === 'medico' ? ' (CRM e RQE no Cadastro Nacional do CFM)' : ''}. Você recebe a liberação neste mesmo login.</p>
              ${m && m.permissoes && m.permissoes.admin ? '<a class="btn btn-p" href="#/admin" style="margin-top:14px"><i class="ti ti-shield-lock"></i>Ir para a administração</a>' : ''}
              <button class="btn btn-g" id="sair-pend" style="margin-top:14px"><i class="ti ti-logout"></i>Sair</button></div></div>`;
            $('#sair-pend').onclick = async () => { await RF.backend.medico.sair(); location.hash = '#/'; };
            return;
          }
        }
        RF.backend.sessao.entrar(perfil, nome);
        if (perfil === 'medico' && !(await RF.backend.medico.perfil())) await RF.backend.medico.salvarPerfil(Object.assign({}, MEDICO_DEMO, { nome }));
        RF.atualizarTopo();
        location.hash = perfil === 'paciente' ? '#/minha-area' : '#/medico';
      };
    };
    desenhar();
  }

  function traduzErroAuth(err) {
    const c = (err && err.code) || '';
    if (/invalid-credential|wrong-password|user-not-found/.test(c)) return 'E-mail ou senha incorretos.';
    if (/email-already-in-use/.test(c)) return 'Já existe conta com este e-mail. Desmarque "criar agora" para entrar.';
    if (/weak-password/.test(c)) return 'Senha fraca: use pelo menos 8 caracteres.';
    if (/too-many-requests/.test(c)) return 'Muitas tentativas. Aguarde alguns minutos.';
    return (err && err.message) || 'Não foi possível entrar.';
  }

  /* ---------- administração (aprovar médicos e atendentes) ---------- */
  async function telaAdmin() {
    if (RF.backend.modo !== 'firebase') { app.innerHTML = '<div class="estreito"><div class="card"><h2>Administração</h2><p class="muted" style="margin-top:8px">Disponível no modo com banco de dados (Firebase). Abra com ?backend=firebase para testar.</p></div></div>'; return; }
    const eu = await RF.backend.medico.atual();
    if (!eu || !eu.permissoes.admin) { app.innerHTML = '<div class="estreito"><div class="card"><h2>Administração</h2><p class="muted" style="margin-top:8px">Entre com a conta de administrador.</p><a class="btn btn-p" href="#/entrar/medico" style="margin-top:12px">Entrar</a></div></div>'; return; }
    let lista = [], clinicas = [];
    try { [lista, clinicas] = await Promise.all([RF.backend.listarMedicos(), RF.backend.listarClinicas()]); } catch (e) { RF.toast('Não consegui ler os cadastros: ' + e.message); }
    let sa = null; try { sa = await RF.backend.saude(); } catch (e) { }
    const cfg = G.MEUNEURO_CONFIG || {};
    const item = (ok, txt) => `<div class="small" style="padding:4px 0"><i class="ti ${ok ? 'ti-circle-check t-verde' : 'ti-alert-circle t-vermelho'}"></i> ${txt}</div>`;
    const pront = `<div style="margin-bottom:18px"><h3 style="margin-bottom:6px">Prontidão para atender</h3>${item(!!sa, 'Servidor publicado (funções)')}${item(sa && sa.vidaas, 'Assinatura VIDaaS habilitada')}${item(RF.sncr.ambiente() === 'producao', 'SNCR em produção (hoje: ' + RF.sncr.ambiente() + ')')}${item(RF.sncr.cnpjPlataforma().length === 14, 'CNPJ da plataforma no SNCR')}${item(cfg.responsavelTecnico && cfg.responsavelTecnico.nome, 'Diretor técnico da MedTech informado')}${item(cfg.ativo === true, 'Site em modo real (ativo: true)')}</div>`;
    const nomeCl = id => (clinicas.find(c => c.id === id) || {}).nome || '';
    const pendentes = lista.filter(m => !m.aprovado), aprovados = lista.filter(m => m.aprovado);
    const opcoes = clinicas.filter(c => c.ativa).map(c => `<option value="${esc(c.id)}">${esc(c.nome)}</option>`).join('');
    const linhaPend = m => `<div class="ped"><span class="avatar ${RF.corDe(m.nome || m.email)}">${esc(String(m.nome || m.email || '?').split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase())}</span>
      <span class="corpo"><b>${esc(m.nome || '(sem nome)')}</b><span class="m">${esc(m.email || '')}${m.crm ? ' · CRM ' + esc(m.crm) + '/' + esc(m.uf || '') : ''}${m.rqe ? ' · RQE ' + esc(m.rqe) : ''} · pediu: ${esc(m.papelPedido || 'medico')}</span></span>
      <select class="inp" data-cl="${esc(m.uid)}" style="width:auto;min-height:34px;padding:4px 8px" aria-label="Clínica"><option value="">Clínica</option>${opcoes}</select>
      <button class="btn btn-s btn-p" data-ap="${esc(m.uid)}" data-papel="${esc(m.papelPedido || 'medico')}">Aprovar</button></div>`;
    const linhaOk = m => `<div class="ped"><span class="avatar ${RF.corDe(m.nome || m.email)}">${esc(String(m.nome || m.email || '?').split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase())}</span>
      <span class="corpo"><b>${esc(m.nome || '(sem nome)')}</b><span class="m">${esc(nomeCl(m.clinicaId))}${m.crm ? ' · CRM ' + esc(m.crm) + '/' + esc(m.uf || '') : ''}${m.linkSlug ? ' · ' + esc(location.origin + location.pathname + '#/m/' + m.linkSlug) : ''}</span></span><span class="tag ok">aprovado</span></div>`;
    const linhaCl = c => `<div class="ped"><span class="ico c-azul"><i class="ti ti-building-hospital"></i></span><span class="corpo"><b>${esc(c.nome)}</b><span class="m">${c.cnpj ? 'CNPJ ' + esc(c.cnpj) + ' · ' : ''}${esc([c.cidade, c.uf].filter(Boolean).join('/'))}${c.rt && c.rt.nome ? ' · RT ' + esc(c.rt.nome) + ', CRM ' + esc(c.rt.crm) + '/' + esc(c.rt.uf) : ''}</span></span><button class="btn btn-s ${c.ativa ? 'btn-g' : ''}" data-ativa="${esc(c.id)}" data-v="${c.ativa ? '0' : '1'}">${c.ativa ? 'Suspender' : 'Reativar'}</button></div>`;
    const UFS = 'AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' ').map(u => `<option>${u}</option>`).join('');
    app.innerHTML = `<div class="estreito" style="max-width:860px"><div class="card"><div class="cab-card c-violeta"><span class="ico lg"><i class="ti ti-shield-lock"></i></span><div><h2>Administração</h2><p class="muted small">A MedTech gerencia clínicas e contas. Os pedidos dos pacientes ficam só com cada clínica.</p></div></div>
      ${pront}
      <h3 style="margin-bottom:6px">Clínicas</h3>
      <div class="lista-ped">${clinicas.length ? clinicas.map(linhaCl).join('') : '<p class="muted">Nenhuma clínica ainda.</p>'}</div>
      <details style="margin:12px 0 20px"><summary style="cursor:pointer;font-weight:600">Nova clínica</summary>
        <form id="fc" style="margin-top:12px">
          <label class="campo"><span>Nome da clínica ou do consultório</span><input class="inp" name="nome" required></label>
          <div class="linha2"><label class="campo"><span>CNPJ</span><input class="inp" name="cnpj" required inputmode="numeric" placeholder="00.000.000/0000-00"></label><label class="campo"><span>Telefone</span><input class="inp" name="telefone"></label></div>
          <div class="linha2"><label class="campo"><span>Cidade</span><input class="inp" name="cidade" required></label><label class="campo"><span>UF</span><select class="inp" name="uf" required><option value=""></option>${UFS}</select></label></div>
          <div class="linha2"><label class="campo"><span>Responsável técnico (médico)</span><input class="inp" name="rtNome" required></label><label class="campo"><span>CRM do responsável</span><input class="inp" name="rtCrm" required inputmode="numeric"></label></div>
          <label class="campo"><span>UF do CRM do responsável</span><select class="inp" name="rtUf" required><option value=""></option>${UFS}</select></label>
          <button class="btn btn-p"><i class="ti ti-plus"></i>Criar clínica</button>
        </form></details>
      <h3 style="margin-bottom:6px">Aguardando aprovação</h3>
      <p class="small muted" style="margin:0 0 8px">Confira CRM e RQE no Cadastro Nacional do CFM antes de aprovar (Res. CFM 2.299/2021, art. 8º).</p>
      <div class="lista-ped">${pendentes.length ? pendentes.map(linhaPend).join('') : '<p class="muted">Ninguém aguardando.</p>'}</div>
      ${aprovados.length ? `<h3 style="margin:18px 0 6px">Profissionais</h3><div class="lista-ped">${aprovados.map(linhaOk).join('')}</div>` : ''}
    </div></div>`;
    $('#fc').onsubmit = async e => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(e.target).entries());
      const d = RF.docLocal(f.cnpj);
      if (d.tipo !== 'CNPJ' || !d.valido) return RF.toast('CNPJ inválido: confira os números.');
      try { await RF.backend.salvarClinica({ nome: f.nome.trim(), cnpj: d.fmt, telefone: f.telefone.trim(), cidade: f.cidade.trim(), uf: f.uf, rt: { nome: f.rtNome.trim(), crm: f.rtCrm.trim(), uf: f.rtUf }, ativa: true, criadaEm: RF.agora() }); RF.toast('Clínica criada.'); telaAdmin(); }
      catch (err) { RF.toast('Não consegui criar: ' + err.message); }
    };
    app.querySelectorAll('[data-ativa]').forEach(b => b.onclick = async () => {
      if (b.dataset.v === '0' && !confirm('Suspender esta clínica? Os links dela param de receber pedidos novos; o que já existe continua guardado.')) return;
      try { await RF.backend.salvarClinica({ id: b.dataset.ativa, ativa: b.dataset.v === '1' }); telaAdmin(); } catch (err) { RF.toast(err.message); }
    });
    app.querySelectorAll('[data-ap]').forEach(b => b.onclick = async () => {
      const clinicaId = app.querySelector(`[data-cl="${b.dataset.ap}"]`).value;
      if (!clinicaId) return RF.toast('Escolha a clínica antes de aprovar.');
      b.disabled = true;
      try { await RF.backend.definirPapel({ uid: b.dataset.ap, papel: b.dataset.papel, clinicaId }); RF.toast('Aprovado. A pessoa precisa sair e entrar de novo.'); telaAdmin(); }
      catch (e) { RF.toast(/not-found|internal|unavailable/.test(e.code || '') ? 'A aprovação precisa do servidor publicado (plano Blaze).' : e.message); b.disabled = false; }
    });
  }

  async function telaMinhaArea() {
    const s = RF.backend.sessao.ler();
    if (!s || s.perfil !== 'paciente') { location.hash = '#/entrar/paciente'; return; }
    let meus = [];
    try { meus = JSON.parse(localStorage.getItem('meuneuro.v1.meus-pedidos') || '[]'); } catch (e) { }
    const rot = { aguardando: ['Na fila do médico', 'acc', 'ti-clock', 'c-azul'], em_atendimento: ['Em atendimento', 'warn', 'ti-stethoscope', 'c-ambar'], assinado: ['Receita assinada', 'ok', 'ti-file-certificate', 'c-verde'], recusado: ['Não renovado', 'bad', 'ti-ban', 'c-vermelho'], urgencia: ['Interrompido', 'bad', 'ti-urgent', 'c-vermelho'] };
    const pedidos = [];
    for (const m of meus) { const r = await RF.backend.consultarPorCodigo(m.codigo, m.nasc); if (r.pedido) pedidos.push(r.pedido); }
    const rasc = RF.backend.rascunho.ler();
    app.innerHTML = `<div class="estreito">
      <div class="card"><div class="cab-card c-rosa"><span class="ico lg"><i class="ti ti-user-heart"></i></span><div><h2>Olá, ${esc(String(s.nome).split(' ')[0])}</h2><p class="muted small">Suas renovações de receita neste aparelho.</p></div></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap"><a class="btn btn-p" href="#/paciente"><i class="ti ti-${rasc && rasc.status === 'rascunho' ? 'player-play' : 'plus'}"></i>${rasc && rasc.status === 'rascunho' ? 'Continuar pedido em andamento' : 'Nova renovação'}</a>
        <button class="btn btn-g" id="sair-pac"><i class="ti ti-logout"></i>Sair</button></div>
        <div class="lista-ped">${pedidos.length ? pedidos.map(p => { const x = rot[p.status] || [p.status, '', 'ti-file']; return `<a class="ped int ${x[3] || ''}" href="#/acompanhar/${esc(p.codigo)}"><span class="ico"><i class="ti ${x[2]}"></i></span><span class="corpo"><b>${esc((p.meds || []).map(m => m.nome).join(', ') || 'Pedido sem remédios listados')}</b><span class="m">${esc(p.codigo)} · ${esc(RF.fmtData(p.enviadoEm))}</span></span><span class="tag ${x[1]}">${x[0]}</span></a>`; }).join('') : '<div class="vazio" style="padding:26px 10px"><span class="ico lg"><i class="ti ti-file-plus"></i></span><p>Você ainda não fez nenhum pedido neste aparelho.</p></div>'}</div>
      </div></div>`;
    $('#sair-pac').onclick = () => { RF.backend.sessao.sair(); RF.atualizarTopo(); location.hash = '#/'; };
  }

  /* ---------- acompanhar ---------- */
  function telaAcompanhar(codigo) {
    let meus = [];
    try { meus = JSON.parse(localStorage.getItem('meuneuro.v1.meus-pedidos') || '[]'); } catch (e) { }
    const pre = meus.find(x => x.codigo === codigo);
    app.innerHTML = `<div class="estreito"><div class="card" id="acomp">
      <div class="cab-card c-violeta"><span class="ico lg"><i class="ti ti-file-search"></i></span><div><h2>Acompanhar pedido</h2><p class="muted small">Use o código que apareceu no fim da conversa e a data de nascimento do paciente.</p></div></div>
      <form id="fa"><div class="linha2">
        <label class="campo"><span>Código do pedido</span><input class="inp" name="codigo" value="${esc(codigo || '')}" placeholder="MN-XXXXXX" required style="text-transform:uppercase"></label>
        <label class="campo"><span>Data de nascimento</span><input class="inp" name="nasc" type="date" value="${esc(pre ? pre.nasc : '')}" required></label></div>
        <button class="btn btn-p" style="width:100%">Ver pedido</button></form>
      ${meus.length ? `<p class="small muted" style="margin-top:14px">Pedidos feitos neste aparelho: ${meus.map(m => `<a href="#/acompanhar/${esc(m.codigo)}">${esc(m.codigo)}</a>`).join(' · ')}</p>` : ''}
    </div><div id="res"></div></div>`;
    $('#fa').onsubmit = async e => {
      e.preventDefault();
      const f = new FormData(e.target);
      const r = await RF.backend.consultarPorCodigo(String(f.get('codigo')).trim().toUpperCase(), f.get('nasc'));
      if (r.erro) { $('#res').innerHTML = `<div class="alerta alto" style="margin-top:14px"><i class="ti ti-alert-circle"></i><span>${r.erro === 'nao_encontrado' ? 'Não encontrei esse código.' : 'Os dados não conferem.'} ${RF.backend.modo === 'local' ? 'No modo local, o pedido só aparece no aparelho em que foi feito.' : ''}</span></div>`; return; }
      mostrarPedido(r.pedido);
    };
    if (codigo && pre) $('#fa').requestSubmit();
  }

  function mostrarPedido(p) {
    const at = p.atendimento || {};
    const passos = [
      { r: 'Pedido enviado', i: 'ti-send', f: true, d: RF.fmtData(p.enviadoEm, true) },
      { r: 'Em atendimento com o médico', i: 'ti-stethoscope', f: ['em_atendimento', 'assinado', 'recusado'].includes(p.status), d: at.iniciadoEm ? RF.fmtData(at.iniciadoEm, true) : '' },
      { r: p.status === 'recusado' ? 'Receita não renovada' : 'Receita assinada', i: 'ti-file-certificate', f: ['assinado', 'recusado'].includes(p.status), d: at.concluidoEm ? RF.fmtData(at.concluidoEm, true) : '' }
    ];
    const agora = passos.findIndex(x => !x.f);
    let h = `<div class="card" style="margin-top:16px"><h3>${esc(p.paciente.nome)} · ${esc(p.codigo)}</h3>
      <ol class="linha-tempo">${passos.map((x, i) => `<li class="${x.f ? 'feito' : i === agora ? 'agora' : ''}"><span class="pt"><i class="ti ${x.f ? 'ti-check' : x.i}"></i></span><div><b>${x.r}</b>${x.d ? `<div class="small muted">${esc(x.d)}</div>` : ''}</div></li>`).join('')}</ol>`;
    if (p.status === 'aguardando') h += '<p class="muted small">Seu pedido está na fila. O médico pode entrar em contato pelo telefone informado. Continue tomando seus remédios normalmente.</p>';
    if (p.status === 'em_atendimento' && at.sala) h += `<a class="btn btn-p" href="#/sala/${esc(at.sala)}" style="margin-bottom:12px"><i class="ti ti-video"></i>Entrar na teleconsulta</a>`;
    if (p.status === 'urgencia') h += '<div class="alerta alto"><i class="ti ti-urgent"></i><span>Este pedido foi interrompido por sinais de alerta. Procure atendimento presencial.</span></div>';
    if (p.status === 'recusado') h += `<div class="alerta medio"><i class="ti ti-info-circle"></i><span><b>${esc(at.motivoRecusa || '')}</b><br>${esc(at.orientacaoMedico || '')}</span></div>`;
    const docs = (at.assinatura && at.assinatura.documentos) || [];
    if (p.status === 'assinado') {
      h += `${at.orientacaoMedico ? `<div class="alerta info" style="margin-bottom:12px"><i class="ti ti-message-2"></i><span><b>Orientação do médico:</b> ${esc(at.orientacaoMedico)}</span></div>` : ''}
        <div style="display:flex;gap:8px;flex-wrap:wrap">${docs.map(d => `<button class="btn btn-p" data-doc="${esc(d.id)}"><i class="ti ti-file-certificate"></i>${esc(d.rot)}</button>`).join('')}<button class="btn" id="imp"><i class="ti ti-printer"></i>Ver cópia</button></div>
        ${(p.receitas || []).some(b => b.papel) ? '<p class="small" style="margin-top:10px">Um dos seus remédios sai em receituário de papel. O médico vai combinar com você como recebê-lo.</p>' : ''}
        <p class="small muted" style="margin-top:10px">Leve o PDF à farmácia, no celular ou impresso. Receita de controle especial e notificações valem por 30 dias a partir da emissão, em todo o Brasil, e cada uma só pode ser usada uma vez.</p>`;
    }
    h += '</div>';
    if (p.meds && p.meds.length && p.status !== 'urgencia') h += `<div class="card" style="margin-top:16px"><h3>Informações sobre seus remédios</h3><div class="small muted" style="margin:4px 0 8px">Informações gerais. Siga sempre a orientação do seu médico.</div>${p.meds.filter(m => m.nome).map(m => `<div style="border-top:1px solid var(--line);padding:12px 0" class="msg orient" >${RF.orientacaoMed(m, p)}</div>`).join('')}<div style="border-top:1px solid var(--line);padding-top:12px" class="msg orient">${RF.seguimentoPaciente(p)}</div></div>`;
    $('#res').innerHTML = h;
    $('#res').querySelectorAll('.msg.orient').forEach(x => { x.style.border = '0'; x.style.borderTop = '1px solid var(--line)'; x.style.borderRadius = '0'; x.style.padding = '12px 0'; });
    const imp = $('#imp'); if (imp) imp.onclick = () => RF.imprimir(RF.folhasReceita(p, at.medico || {}, { orientacoes: true }));
    $('#res').querySelectorAll('[data-doc]').forEach(bt => bt.onclick = async () => {
      try {
        if (at.assinatura.tipo === 'icp') return RF.backend.baixarReceita({ codigo: p.codigo, nasc: p.paciente.nasc, docId: bt.dataset.doc });
        const x = RF.documentosDe(p).find(d => d.id === bt.dataset.doc);
        await RF.baixarPdf(x.id, x.b, p, at.medico || {}, { em: at.assinatura.em, verificacao: at.assinatura.verificacao, segredo: 'demo' }, true);
      } catch (e) { RF.toast(e.message || 'Não foi possível baixar agora.'); }
    });
  }

  /* ---------- teleconsulta: entrada do paciente ---------- */
  async function telaSala(id) {
    if (!id) { location.hash = '#/acompanhar'; return; }
    app.innerHTML = `<div class="estreito sala-pac"><div class="card"><div class="cab-card c-azul"><span class="ico lg"><i class="ti ti-video"></i></span><div><h2>Teleconsulta</h2><p class="muted small">Permita o uso da câmera e do microfone. A imagem vai direto para o médico e não é gravada.</p></div></div>
      <button class="btn btn-p" id="ent-sala" style="width:100%"><i class="ti ti-video"></i>Entrar</button><div id="sala-area" style="margin-top:12px"></div>
      <p class="small muted" style="margin-top:12px">Não conectou? O médico pode falar com você pelo WhatsApp do telefone informado.</p></div></div>`;
    $('#ent-sala').onclick = async () => {
      $('#ent-sala').remove();
      try {
        if (RF.backend.garantirLogin) await RF.backend.garantirLogin();
        await RF.abrirVideo($('#sala-area'), { id, papel: 'paciente', aoEncerrar: () => { location.hash = '#/acompanhar'; } });
      } catch (e) { RF.toast('Não consegui entrar: ' + e.message); }
    };
  }

  /* ---------- verificar autenticidade ---------- */
  async function telaVerificar(cod) {
    app.innerHTML = `<div class="estreito"><div class="card"><div class="cab-card c-verde"><span class="ico lg"><i class="ti ti-shield-check"></i></span><div><h2>Verificar receita</h2><p class="muted small">Digite o código de verificação impresso no rodapé da receita.</p></div></div>
      <form id="fv" class="escreve"><input class="inp" name="c" value="${esc(cod || '')}" placeholder="Código de verificação" required style="text-transform:uppercase"><button class="btn btn-p" aria-label="Verificar"><i class="ti ti-search"></i></button></form>
      <div id="rv"></div>
      <p class="small muted" style="margin-top:16px">A validade jurídica da assinatura digital ICP-Brasil é conferida no validador oficial: <a href="https://validar.iti.gov.br" target="_blank" rel="noopener">validar.iti.gov.br</a>.</p></div></div>`;
    $('#fv').onsubmit = async e => {
      e.preventDefault();
      const r = await RF.backend.verificarReceita(new FormData(e.target).get('c'));
      $('#rv').innerHTML = !r ? '<div class="alerta alto" style="margin-top:14px"><i class="ti ti-x"></i><span>Código não encontrado.</span></div>'
        : `<div class="alerta ${r.valida && r.tipoAssinatura === 'icp' ? 'info' : 'medio'}" style="margin-top:14px"><i class="ti ${r.valida ? 'ti-circle-check' : 'ti-alert-circle'}"></i><span>
          ${r.tipoAssinatura === 'icp' ? 'Receita emitida pelo Meu Neuro com PDF assinado digitalmente.' : 'Receita de demonstração, sem validade legal.'}<br>${(r.documentos || []).filter(d => d.numero).map(d => esc(d.rot) + ' N.º ' + esc(d.numero)).join('<br>')}${(r.documentos || []).some(d => d.numero) ? '<br>' : ''}
          Médico: ${esc(r.medico.nome)} · CRM ${esc(r.medico.crm)}/${esc(r.medico.uf)}<br>Paciente: ${esc(r.paciente)} · ${r.itens} item(ns) · emitida em ${esc(RF.fmtData(r.emitidaEm, true))}</span></div>`;
    };
    if (cod) $('#fv').requestSubmit();
  }

  /* ---------- início ---------- */
  (async function () {
    if (RF.backend.modo === 'local') { const m = $('#modo'); m.textContent = 'Modo local'; m.title = 'Dados guardados só neste navegador'; m.classList.remove('hide'); $('#demo-aviso').classList.remove('hide'); }
    // tem de ser a primeira coisa: o session_id e o token do SNCR duram 30 segundos
    try { await RF.sncr.processarRetorno(); } catch (e) { console.warn(e); }
    try { await RF.backend.iniciar(); }
    catch (e) { console.error(e); RF.backend = RF.backendLocal; RF.toast('Backend indisponível; usando modo local.'); }
    G.addEventListener('hashchange', rota);
    rota();
  })();
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => { });
})(window);
