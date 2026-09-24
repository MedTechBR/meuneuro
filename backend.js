/* RefilMed — camada de dados
   Dois adaptadores atrás da MESMA interface:
   - local (padrão): tudo no navegador. Paciente e médico precisam usar o mesmo aparelho;
     serve para demonstração e para validar o fluxo.
   - firebase: projeto Firebase PRÓPRIO do RefilMed (config em config.js). Paciente entra
     anônimo, médico por e-mail/senha com a permissão "medico" dada pela função definirMedico.
   Interface: iniciar, salvarPedido, obterPedido, listarPedidos, consultarPorCodigo,
              verificarReceita, ia, medico (perfil/entrar/sair). */
(function (G) {
  const RF = G.RF = G.RF || {};
  const PREF = 'refilmed.v1.';
  const K = { pedidos: PREF + 'pedidos', medico: PREF + 'medico', sessao: PREF + 'sessao', rascunho: PREF + 'rascunho' };
  const LS_RUIM = {};
  let primeiroSave = true;

  /* ---------- armazenamento local blindado ---------- */
  function ler(k, padrao) {
    let bruto = null;
    try { bruto = G.localStorage.getItem(k); } catch (e) { return padrao; }
    if (bruto == null) return padrao;
    try { return JSON.parse(bruto); } catch (e) { LS_RUIM[k] = true; console.warn('[RefilMed] chave ilegível preservada:', k); return padrao; }
  }
  function gravar(k, v) {
    if (LS_RUIM[k]) { RF.toast && RF.toast('Dados locais com problema: não gravei por cima. Veja Configurações.'); return false; }
    try { G.localStorage.setItem(k, JSON.stringify(v)); return true; }
    catch (e) { RF.toast && RF.toast('Não foi possível salvar neste navegador (espaço cheio?).'); return false; }
  }
  function backupPedidos(obj) {
    const n = Object.keys(obj || {}).length;
    if (!n) return;
    try {
      const b2 = G.localStorage.getItem(K.pedidos + '.bak1');
      if (b2) G.localStorage.setItem(K.pedidos + '.bak2', b2);
      G.localStorage.setItem(K.pedidos + '.bak1', JSON.stringify(obj));
    } catch (e) { /* backup é melhor-esforço */ }
  }

  const local = {
    modo: 'local',
    async iniciar() { return true; },
    async salvarPedido(p) {
      const todos = ler(K.pedidos, {});
      const antes = Object.keys(todos).length;
      if (primeiroSave && antes === 0) {
        // trava: se o armazenamento parece vazio mas existe backup com dados, não sobrescreve
        const bak = ler(K.pedidos + '.bak1', null);
        if (bak && Object.keys(bak).length > 1 && !LS_RUIM[K.pedidos]) {
          console.warn('[RefilMed] pedidos vazios com backup presente — restaurando antes de gravar');
          Object.assign(todos, bak);
        }
      }
      primeiroSave = false;
      p.atualizadoEm = RF.agora();
      todos[p.id] = JSON.parse(JSON.stringify(p));
      backupPedidos(todos);
      return gravar(K.pedidos, todos);
    },
    async obterPedido(id) { const t = ler(K.pedidos, {}); return t[id] || null; },
    async listarPedidos() {
      const t = ler(K.pedidos, {});
      return Object.values(t).sort((a, b) => String(b.atualizadoEm).localeCompare(String(a.atualizadoEm)));
    },
    async consultarPorCodigo(codigo, nasc) {
      const c = String(codigo || '').toUpperCase().replace(/\s/g, '');
      const t = ler(K.pedidos, {});
      const p = Object.values(t).find(x => x.codigo === c);
      if (!p) return { erro: 'nao_encontrado' };
      if (!p.paciente || p.paciente.nasc !== nasc) return { erro: 'nao_confere' };
      return { pedido: p };
    },
    async verificarReceita(cod) {
      const c = String(cod || '').toUpperCase().trim();
      const t = ler(K.pedidos, {});
      const p = Object.values(t).find(x => x.atendimento && x.atendimento.assinatura && x.atendimento.assinatura.verificacao === c);
      if (!p) return null;
      const a = p.atendimento;
      return {
        valida: p.status === 'assinado', emitidaEm: a.assinatura.em, medico: a.medico,
        paciente: iniciais(p.paciente && p.paciente.nome), hash: a.assinatura.hash,
        itens: (p.receitas || []).reduce((n, r) => n + r.itens.length, 0), tipoAssinatura: a.assinatura.tipo
      };
    },
    async ia() { return null; },
    async baixarReceita() { throw new Error('Disponível só com o servidor publicado.'); },
    assinatura: null,
    medico: {
      async atual() { const s = local.sessao.ler(); return s && s.perfil === 'medico' ? ler(K.medico, null) || {} : null; },
      async entrar() { return ler(K.medico, null) || {}; },
      async sair() { local.sessao.sair(); },
      async salvarPerfil(m) { return gravar(K.medico, m); },
      async perfil() { return ler(K.medico, null); }
    },
    // sessão de demonstração: perfil (medico | atendente | paciente) escolhido na tela Entrar
    sessao: {
      ler() { return ler(K.sessao, null); },
      entrar(perfil, nome, extra) { const s = Object.assign({ perfil, nome, em: RF.agora() }, extra || {}); gravar(K.sessao, s); return s; },
      sair() { try { G.localStorage.removeItem(K.sessao); G.localStorage.removeItem(PREF + 'sessao-medico'); } catch (e) { } }
    },
    rascunho: {
      ler() { return ler(K.rascunho, null); },
      gravar(v) { return gravar(K.rascunho, v); },
      apagar() { try { G.localStorage.removeItem(K.rascunho); } catch (e) { } }
    },
    diagnostico() {
      const out = {};
      try {
        for (let i = 0; i < G.localStorage.length; i++) {
          const k = G.localStorage.key(i);
          if (k.startsWith(PREF)) out[k] = Math.round((G.localStorage.getItem(k) || '').length / 1024) + ' KB' + (LS_RUIM[k] ? ' (ilegível)' : '');
        }
      } catch (e) { }
      return out;
    },
    exportar() { return { app: 'refilmed', versao: 1, exportadoEm: RF.agora(), pedidos: ler(K.pedidos, {}), medico: ler(K.medico, null) }; }
  };

  function iniciais(nome) {
    return String(nome || '').split(/\s+/).filter(Boolean).map(p => p[0].toUpperCase() + '.').join(' ');
  }
  RF.iniciais = iniciais;

  /* ---------- adaptador Firebase (projeto próprio) ---------- */
  const SDK = 'https://www.gstatic.com/firebasejs/10.12.2/';
  const firebase = {
    modo: 'firebase',
    _: null,
    async iniciar() {
      const cfg = G.REFILMED_CONFIG;
      const [app, auth, fs, fn] = await Promise.all([
        import(SDK + 'firebase-app.js'), import(SDK + 'firebase-auth.js'),
        import(SDK + 'firebase-firestore.js'), import(SDK + 'firebase-functions.js')
      ]);
      const a = app.initializeApp(cfg);
      this._ = { A: auth, F: fs, Fn: fn, auth: auth.getAuth(a), db: fs.getFirestore(a), fns: fn.getFunctions(a, cfg.regiaoFunctions || 'southamerica-east1') };
      await new Promise(r => { const off = auth.onAuthStateChanged(this._.auth, () => { off(); r(); }); });
      return true;
    },
    async _garantirLogin() {
      const { A, auth } = this._;
      if (!auth.currentUser) await A.signInAnonymously(auth);
      return auth.currentUser;
    },
    async salvarPedido(p) {
      const { F, db } = this._;
      const u = await this._garantirLogin();
      if (!p.pacienteUid) p.pacienteUid = u.uid;
      p.atualizadoEm = RF.agora();
      await F.setDoc(F.doc(db, 'pedidos', p.id), JSON.parse(JSON.stringify(p)));
      return true;
    },
    async obterPedido(id) {
      const { F, db } = this._;
      const s = await F.getDoc(F.doc(db, 'pedidos', id));
      return s.exists() ? s.data() : null;
    },
    async listarPedidos() {
      const { F, db } = this._;
      const q = F.query(F.collection(db, 'pedidos'), F.orderBy('atualizadoEm', 'desc'), F.limit(300));
      const s = await F.getDocs(q);
      return s.docs.map(d => d.data());
    },
    async consultarPorCodigo(codigo, nasc) {
      try {
        const f = this._.Fn.httpsCallable(this._.fns, 'consultarPedido');
        const r = await f({ codigo, nasc });
        return r.data;
      } catch (e) {
        // sem as funções publicadas: o paciente ainda vê os pedidos feitos neste aparelho (mesmo login anônimo)
        const { F, db, auth } = this._;
        if (!auth.currentUser) return { erro: 'nao_encontrado' };
        const q = F.query(F.collection(db, 'pedidos'), F.where('pacienteUid', '==', auth.currentUser.uid), F.where('codigo', '==', String(codigo).toUpperCase()));
        const s = await F.getDocs(q);
        if (s.empty) return { erro: 'nao_encontrado' };
        const p = s.docs[0].data();
        return p.paciente.nasc === nasc ? { pedido: p } : { erro: 'nao_confere' };
      }
    },
    async baixarReceita(dados) {
      const f = this._.Fn.httpsCallable(this._.fns, 'baixarReceita');
      return (await f(dados)).data.url;
    },
    // assinatura integrada (VIDaaS) — exige as funções publicadas (plano Blaze)
    assinatura: {
      async iniciar() { const f = firebase._.Fn.httpsCallable(firebase._.fns, 'vidaasIniciar'); return (await f({})).data; },
      async status() { const f = firebase._.Fn.httpsCallable(firebase._.fns, 'vidaasStatus'); return (await f({})).data; },
      async assinar(pedidoId) { const f = firebase._.Fn.httpsCallable(firebase._.fns, 'assinarReceita'); return (await f({ pedidoId })).data; }
    },
    async definirPapel(dados) { const f = this._.Fn.httpsCallable(this._.fns, 'definirPapel'); return (await f(dados)).data; },
    async listarMedicos() {
      const { F, db } = this._;
      const s = await F.getDocs(F.collection(db, 'medicos'));
      return s.docs.map(d => Object.assign({ uid: d.id }, d.data()));
    },
    async verificarReceita(cod) {
      const f = this._.Fn.httpsCallable(this._.fns, 'verificarReceita');
      const r = await f({ codigo: cod });
      return r.data;
    },
    async ia(tarefa, dados) {
      try {
        await this._garantirLogin();
        const f = this._.Fn.httpsCallable(this._.fns, 'assistenteIA');
        const r = await f({ tarefa, dados });
        return (r.data && r.data.texto) || null;
      } catch (e) { console.warn('[RefilMed] IA indisponível:', e && e.message); return null; }
    },
    medico: {
      // devolve o perfil com as permissões; null se não houver conta de profissional logada
      async atual() {
        const { auth } = firebase._;
        const u = auth.currentUser;
        if (!u || u.isAnonymous) return null;
        const tok = await u.getIdTokenResult(true);
        const perfil = (await this.perfil()) || {};
        return Object.assign({ email: u.email }, perfil, { permissoes: { medico: !!tok.claims.medico, atendente: !!tok.claims.atendente, admin: !!tok.claims.admin } });
      },
      async entrar(email, senha) {
        const { A, auth } = firebase._;
        await A.signInWithEmailAndPassword(auth, email, senha);
        return this.atual();
      },
      // o próprio profissional cria a conta; fica pendente até o administrador aprovar
      async cadastrar(email, senha, dados) {
        const { A, F, db, auth } = firebase._;
        const c = await A.createUserWithEmailAndPassword(auth, email, senha);
        await F.setDoc(F.doc(db, 'medicos', c.user.uid), Object.assign({ email, criadoEm: RF.agora(), papelPedido: dados.papel || 'medico' }, dados.perfil || {}));
        try { await A.sendEmailVerification(c.user); } catch (e) { }
        return this.atual();
      },
      async sair() { await firebase._.A.signOut(firebase._.auth); },
      async salvarPerfil(m) {
        const { F, db, auth } = firebase._;
        const copia = Object.assign({}, m); delete copia.permissoes; delete copia.aprovado; delete copia.aprovadoEm;
        await F.setDoc(F.doc(db, 'medicos', auth.currentUser.uid), copia, { merge: true });
        return true;
      },
      async perfil() {
        const { F, db, auth } = firebase._;
        if (!auth.currentUser || auth.currentUser.isAnonymous) return null;
        const s = await F.getDoc(F.doc(db, 'medicos', auth.currentUser.uid));
        return s.exists() ? s.data() : null;
      }
    },
    rascunho: local.rascunho,
    sessao: local.sessao,
    diagnostico: local.diagnostico,
    exportar: local.exportar
  };

  const cfg = G.REFILMED_CONFIG || {};
  // ?backend=firebase (ou =local) força o modo e fica guardado neste navegador, para testar antes de ligar para todos
  let forcado = null;
  try {
    const q = new URLSearchParams(G.location ? G.location.search : '').get('backend');
    if (q === 'firebase' || q === 'local') G.localStorage.setItem(PREF + 'backend', q);
    forcado = G.localStorage.getItem(PREF + 'backend');
  } catch (e) { }
  const temConfig = !!(cfg.apiKey && cfg.projectId);
  RF.backend = temConfig && (forcado === 'firebase' || (forcado !== 'local' && cfg.ativo !== false)) ? firebase : local;
  RF.backendLocal = local;
})(typeof window !== 'undefined' ? window : globalThis);
