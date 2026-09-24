/* RefilMed — integração com o SNCR da Anvisa (Sistema Nacional de Controle de Receituários)
   Baseado no "Manual API SNCR – 2ª ed." e nas "Instruções de Integração API SNCR v1.0" (docs/sncr/).
   - Não há credenciamento de plataforma: o PRÓPRIO médico entra com gov.br e a API devolve a numeração.
   - A API aceita chamadas do navegador (CORS) de qualquer domínio .br (localhost não funciona).
   - Receita de controle especial (RCE) e sujeita a retenção (RET): bloco de 1.000 números por pedido,
     no máximo 3 pedidos por mês por inscrição; exige o CNPJ da empresa da plataforma.
   - Notificações (NRA, NRB, NRB2...): números já autorizados pela Vigilância Sanitária, de 10 a 50 por vez. */
(function (G) {
  const RF = G.RF;
  const AMB = { homologacao: 'https://sncr-api.hmg.apps.anvisa.gov.br', producao: 'https://sncr-api.apps.anvisa.gov.br' };
  const K_TOKEN = 'refilmed.sncr.token', K_VOLTA = 'refilmed.sncr.voltar';
  const cfg = () => (G.REFILMED_CONFIG && G.REFILMED_CONFIG.sncr) || {};

  function erroLegivel(status, corpo) {
    const msg = (corpo && (corpo.mensagem || (corpo.errorObject && corpo.errorObject.description))) || '';
    if (status === 401) return 'Sessão do gov.br expirada. Entre de novo.';
    if (status === 403) return msg || 'A inscrição no CRM informada não está vinculada ao CPF que entrou no gov.br.';
    if (status === 204) return 'Nenhuma numeração disponível para este tipo de receita.';
    return msg || ('Erro ' + status + ' no SNCR.');
  }

  RF.sncr = {
    ambiente() { return cfg().ambiente === 'producao' ? 'producao' : 'homologacao'; },
    base() { return AMB[this.ambiente()]; },
    dominioAceito() { return /\.br$/i.test(location.hostname); },

    token() {
      let t = null;
      try { t = sessionStorage.getItem(K_TOKEN); } catch (e) { }
      if (!t) return null;
      try {
        const payload = JSON.parse(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
        if (payload.exp && payload.exp * 1000 < Date.now()) { this.sair(); return null; }
      } catch (e) { /* token opaco: confia até dar 401 */ }
      return t;
    },
    conectado() { return !!this.token(); },
    sair() { try { sessionStorage.removeItem(K_TOKEN); } catch (e) { } },

    // 1) manda o médico para o gov.br; volta para a mesma página com ?session_id=
    entrar() {
      try { sessionStorage.setItem(K_VOLTA, location.hash || '#/medico/perfil'); } catch (e) { }
      const clientUrl = location.origin + location.pathname;
      location.href = this.base() + '/api/v1/auth/login?client_url=' + encodeURIComponent(clientUrl);
    },

    // 2) chamado ao abrir o app: troca o session_id (uso único, 30 s) pelo token
    async processarRetorno() {
      const sid = new URLSearchParams(location.search).get('session_id');
      if (!sid) return false;
      let volta = '#/medico/perfil';
      try { volta = sessionStorage.getItem(K_VOLTA) || volta; sessionStorage.removeItem(K_VOLTA); } catch (e) { }
      try {
        const r = await fetch(this.base() + '/api/v1/auth/token?session_id=' + encodeURIComponent(sid));
        if (r.ok) {
          const d = await r.json();
          if (d.access_token) sessionStorage.setItem(K_TOKEN, d.access_token);
          RF.toast && RF.toast('Conectado ao SNCR pelo gov.br.');
        } else RF.toast && RF.toast('Não foi possível concluir a entrada no SNCR (' + r.status + ').');
      } catch (e) { RF.toast && RF.toast('Falha de rede ao falar com o SNCR.'); }
      history.replaceState({}, document.title, location.pathname + volta);
      return true;
    },

    async _post(caminho, corpo) {
      const t = this.token();
      if (!t) throw new Error('Entre com o gov.br no SNCR primeiro.');
      const r = await fetch(this.base() + '/api/v1' + caminho, {
        method: 'POST', headers: { 'Authorization': 'Bearer ' + t, 'Content-Type': 'application/json' }, body: JSON.stringify(corpo)
      });
      let d = null; try { d = await r.json(); } catch (e) { }
      if (r.status === 401) this.sair();
      if (r.status !== 201) throw new Error(erroLegivel(r.status, d));
      return d;
    },

    // bloco de 1.000 números de Receita de Controle Especial (ou RET)
    async pedirBloco(med, tipo) {
      const cnpj = String(cfg().cnpj || '').replace(/\D/g, '');
      if (cnpj.length !== 14) throw new Error('Falta o CNPJ da empresa responsável pelo RefilMed (config.js → sncr.cnpj).');
      const d = await this._post('/numeracoes/receita-especial-retencao', { conselho: 'CRM', tipo: tipo || 'RCE', documento: String(med.crm), uf: med.uf, cnpj });
      return { inicio: d.inicio, fim: d.fim, proximo: d.inicio, quantidade: d.quantidade, obtidoEm: RF.agora(), ambiente: this.ambiente() };
    },

    // números de Notificação de Receita já autorizados pela Visa (10 a 50)
    async pedirNotificacoes(med, receita, quantidade) {
      const d = await this._post('/numeracoes/notificacao-receita', { receita: receita || 'NRB', conselho: 'CRM', uf: med.uf, documento: String(med.crm), quantidade: Math.min(50, Math.max(10, quantidade || 10)) });
      return { numeros: d.numeracoesReceita || [], saldo: d.saldoReceitas, mensagem: d.mensagem || '' };
    },

    // "2602.6-53.0000001" → "2602.6-53.0000002"
    seguinte(numero) {
      const m = String(numero).match(/^(.*?)(\d+)$/);
      if (!m) return null;
      return m[1] + String(+m[2] + 1).padStart(m[2].length, '0');
    },
    restantes(bloco) {
      if (!bloco || !bloco.proximo) return 0;
      const n = s => +String(s).match(/(\d+)$/)[1];
      return Math.max(0, n(bloco.fim) - n(bloco.proximo) + 1);
    },
    // consome o próximo número do bloco do médico (muta o objeto)
    consumir(bloco) {
      if (!this.restantes(bloco)) return null;
      const atual = bloco.proximo;
      bloco.proximo = this.restantes(bloco) > 1 ? this.seguinte(atual) : null;
      bloco.usados = (bloco.usados || 0) + 1;
      return atual;
    }
  };
})(window);
