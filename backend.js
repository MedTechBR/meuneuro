/* Meu Neuro — camada de dados
   Dois adaptadores atrás da MESMA interface:
   - local (padrão): tudo no navegador. Paciente e médico precisam usar o mesmo aparelho;
     serve para demonstração e para validar o fluxo.
   - firebase: projeto Firebase PRÓPRIO do Meu Neuro (config em config.js). Paciente entra
     anônimo, médico por e-mail/senha com a permissão "medico" dada pela função definirMedico.
   Interface: iniciar, salvarPedido, obterPedido, listarPedidos, consultarPorCodigo,
              verificarReceita, ia, medico (perfil/entrar/sair). */
(function (G) {
  const MN = G.MN = G.MN || {};
  const PREF = 'meuneuro.v1.';
  const K = { pedidos: PREF + 'pedidos', medico: PREF + 'medico', sessaoMed: PREF + 'sessao-medico', rascunho: PREF + 'rascunho' };
  const LS_RUIM = {};
  let primeiroSave = true;

  /* ---------- armazenamento local blindado ---------- */
  function ler(k, padrao) {
    let bruto = null;
    try { bruto = G.localStorage.getItem(k); } catch (e) { return padrao; }
    if (bruto == null) return padrao;
    try { return JSON.parse(bruto); } catch (e) { LS_RUIM[k] = true; console.warn('[Meu Neuro] chave ilegível preservada:', k); return padrao; }
  }
  function gravar(k, v) {
    if (LS_RUIM[k]) { MN.toast && MN.toast('Dados locais com problema: não gravei por cima. Veja Configurações.'); return false; }
    try { G.localStorage.setItem(k, JSON.stringify(v)); return true; }
    catch (e) { MN.toast && MN.toast('Não foi possível salvar neste navegador (espaço cheio?).'); return false; }
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
          console.warn('[Meu Neuro] pedidos vazios com backup presente — restaurando antes de gravar');
          Object.assign(todos, bak);
        }
      }
      primeiroSave = false;
      p.atualizadoEm = MN.agora();
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
    medico: {
      async atual() { return ler(K.sessaoMed, null) ? ler(K.medico, null) || {} : null; },
      async entrar() { G.localStorage.setItem(K.sessaoMed, 'true'); return ler(K.medico, null) || {}; },
      async sair() { try { G.localStorage.removeItem(K.sessaoMed); } catch (e) { } },
      async salvarPerfil(m) { return gravar(K.medico, m); },
      async perfil() { return ler(K.medico, null); }
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
    exportar() { return { app: 'meuneuro', versao: 1, exportadoEm: MN.agora(), pedidos: ler(K.pedidos, {}), medico: ler(K.medico, null) }; }
  };

  function iniciais(nome) {
    return String(nome || '').split(/\s+/).filter(Boolean).map(p => p[0].toUpperCase() + '.').join(' ');
  }
  MN.iniciais = iniciais;

  /* ---------- adaptador Firebase (projeto próprio) ---------- */
  const SDK = 'https://www.gstatic.com/firebasejs/10.12.2/';
  const firebase = {
    modo: 'firebase',
    _: null,
    async iniciar() {
      const cfg = G.MEUNEURO_CONFIG;
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
      p.atualizadoEm = MN.agora();
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
      const f = this._.Fn.httpsCallable(this._.fns, 'consultarPedido');
      const r = await f({ codigo, nasc });
      return r.data;
    },
    async verificarReceita(cod) {
      const f = this._.Fn.httpsCallable(this._.fns, 'verificarReceita');
      const r = await f({ codigo: cod });
      return r.data;
    },
    async ia(tarefa, dados) {
      try {
        await this._garantirLogin();
        const f = this._.Fn.httpsCallable(this._.fns, 'neuroIA');
        const r = await f({ tarefa, dados });
        return (r.data && r.data.texto) || null;
      } catch (e) { console.warn('[Meu Neuro] IA indisponível:', e && e.message); return null; }
    },
    medico: {
      async atual() {
        const { auth } = firebase._;
        const u = auth.currentUser;
        if (!u || u.isAnonymous) return null;
        const tok = await u.getIdTokenResult(true);
        if (!tok.claims.medico) return null;
        return (await this.perfil()) || { email: u.email };
      },
      async entrar(email, senha) {
        const { A, auth } = firebase._;
        await A.signInWithEmailAndPassword(auth, email, senha);
        const m = await this.atual();
        if (!m) { await A.signOut(auth); throw new Error('Esta conta não tem permissão de médico no Meu Neuro.'); }
        return m;
      },
      async sair() { await firebase._.A.signOut(firebase._.auth); },
      async salvarPerfil(m) {
        const { F, db, auth } = firebase._;
        await F.setDoc(F.doc(db, 'medicos', auth.currentUser.uid), m, { merge: true });
        return true;
      },
      async perfil() {
        const { F, db, auth } = firebase._;
        if (!auth.currentUser) return null;
        const s = await F.getDoc(F.doc(db, 'medicos', auth.currentUser.uid));
        return s.exists() ? s.data() : null;
      }
    },
    rascunho: local.rascunho,
    diagnostico: local.diagnostico,
    exportar: local.exportar
  };

  const cfg = G.MEUNEURO_CONFIG || {};
  MN.backend = (cfg.apiKey && cfg.projectId) ? firebase : local;
  MN.backendLocal = local;
})(typeof window !== 'undefined' ? window : globalThis);
