/* Meu Neuro — integração com o SNCR da Anvisa (Sistema Nacional de Controle de Receituários)
   Fonte: Manual da API 3ª ed. (set/2026) e P&R Integração 1ª ed., em docs/sncr/.
   - Sem credenciamento: o PRÓPRIO médico entra com gov.br e a API devolve a numeração.
   - O token vale 30 segundos e não se renova: cada pedido de números é um login, e o pedido sai logo na volta.
   - Chamadas do navegador (CORS) só de domínio .br; localhost e 127.0.0.1 são aceitos para desenvolvimento.
   - RCE e RET: bloco de 1.000 números, até 3 pedidos por mês por tipo, sem depender da Vigilância; exige o CNPJ da plataforma.
   - Notificações (NRA, NRB, NRB2): de 10 a 50 por chamada, 50 por dia, da cota que a Vigilância Sanitária aprovou.
   - Número obtido e não usado se perde: não há devolução (P&R 35 e 36). Quem controla o saldo é a plataforma (P&R 38). */
(function (G) {
  const RF = G.RF;
  const AMB = {
    homologacao: 'https://api-gateway.hmg.apps.anvisa.gov.br/api-sncr/api/v1',
    producao: 'https://api-gateway.prd.apps.anvisa.gov.br/api-sncr/api/v1'
  };
  const K_PEDIDO = 'meuneuro.sncr.pedido', K_RESULT = 'meuneuro.sncr.resultado';
  const cfg = () => (G.MEUNEURO_CONFIG && G.MEUNEURO_CONFIG.sncr) || {};
  const ler = (st, k) => { try { return JSON.parse(st.getItem(k) || 'null'); } catch (e) { return null; } };

  // o que cada tipo de receituário usa no SNCR, e onde o saldo fica no perfil do médico
  const TIPOS = {
    controle_especial: { cod: 'RCE', campo: 'rce', faixa: true, rot: 'Controle especial (RCE)' },
    retencao: { cod: 'RET', campo: 'ret', faixa: true, rot: 'Sujeita a retenção (RET)' },
    notificacao_b: { cod: 'NRB', campo: 'nrb', rot: 'Notificação B' },
    notificacao_b2: { cod: 'NRB2', campo: 'nrb2', rot: 'Notificação B2' },
    notificacao_a: { cod: 'NRA', campo: 'nra', rot: 'Notificação A' }
  };

  function erroLegivel(status, d) {
    const msg = (d && (d.mensagem || d.error || (d.errorObject && d.errorObject.description))) || '';
    if (status === 401) return 'A sessão do gov.br expirou antes do pedido (dura 30 segundos). Tente de novo.';
    if (status === 204) return 'O SNCR não tem numeração disponível para este tipo agora.';
    if (/saldo/i.test(msg)) return 'Você não tem cota deste tipo: peça à Vigilância Sanitária do seu estado. Enquanto isso, use o talonário de papel.';
    if (/difere|diferente|vínculo|vinculo/i.test(msg)) return 'O CRM do seu perfil não confere com o CPF que entrou no gov.br. Confira CRM e UF.';
    if (status === 403 && !msg) return 'O SNCR recusou o acesso. Confira o CRM e a UF do seu perfil.';
    return msg || ('Erro ' + status + ' no SNCR.');
  }

  RF.sncr = {
    TIPOS,
    ambiente() { return cfg().ambiente === 'producao' ? 'producao' : 'homologacao'; },
    base() { return cfg().baseUrl || AMB[this.ambiente()]; },
    dominioAceito() { return /\.br$/i.test(location.hostname) || ['localhost', '127.0.0.1'].includes(location.hostname); },
    cnpjPlataforma() { return String(cfg().cnpj || '').replace(/\D/g, ''); },

    // 1) guarda o que vamos pedir e manda o médico para o gov.br; ele volta com ?session_id=
    pedirNumeros(tipo, med, quantidade, volta) {
      const T = TIPOS[tipo];
      if (!T) throw new Error('Tipo sem numeração no SNCR.');
      if (!med.crm || !med.uf) throw new Error('Complete CRM e UF no perfil.');
      if (T.faixa && this.cnpjPlataforma().length !== 14) throw new Error('Falta o CNPJ da plataforma em config.js (sncr.cnpj).');
      sessionStorage.setItem(K_PEDIDO, JSON.stringify({ tipo, crm: String(med.crm), uf: med.uf, quantidade: quantidade || 10, volta: volta || location.hash || '#/medico/perfil', ambiente: this.ambiente() }));
      location.href = this.base() + '/auth/login?client_url=' + encodeURIComponent(location.origin + location.pathname);
    },

    // 2) na volta: troca o session_id pelo token e já faz o pedido, antes de qualquer outra coisa (30 s)
    async processarRetorno() {
      const sid = new URLSearchParams(location.search).get('session_id');
      if (!sid) return false;
      const ped = ler(sessionStorage, K_PEDIDO);
      sessionStorage.removeItem(K_PEDIDO);
      const volta = (ped && ped.volta) || '#/medico/perfil';
      history.replaceState({}, document.title, location.pathname + volta);
      let res;
      try {
        if (!ped) throw new Error('Pedido de numeração perdido. Tente de novo.');
        const r = await fetch(this.base() + '/auth/token?session_id=' + encodeURIComponent(sid));
        const d = await r.json().catch(() => null);
        if (!r.ok || !d || !d.access_token) throw new Error((d && d.error) || 'Não foi possível concluir a entrada no gov.br.');
        res = { ok: true, tipo: ped.tipo, ...(await this._pedir(d.access_token, ped)) };
      } catch (e) { res = { ok: false, tipo: ped && ped.tipo, erro: e.message }; }
      // números já são nossos e não voltam: guarda antes de tudo, até entrarem no perfil
      try { localStorage.setItem(K_RESULT, JSON.stringify(res)); } catch (e) { }
      return true;
    },

    async _pedir(token, ped) {
      const T = TIPOS[ped.tipo];
      const corpo = T.faixa
        ? { conselho: 'CRM', tipo: T.cod, documento: ped.crm, uf: ped.uf, cnpj: this.cnpjPlataforma() }
        : { receita: T.cod, conselho: 'CRM', uf: ped.uf, documento: ped.crm, quantidade: Math.min(50, Math.max(10, ped.quantidade || 10)) };
      const r = await fetch(this.base() + (T.faixa ? '/numeracoes/receita-especial-retencao' : '/numeracoes/notificacao-receita'), {
        method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify(corpo)
      });
      const d = r.status === 204 ? null : await r.json().catch(() => null);
      if (r.status === 204 || !r.ok) throw new Error(erroLegivel(r.status, d));
      const amb = ped.ambiente;
      if (T.faixa) return { faixa: { inicio: d.inicio, fim: d.fim, proximo: d.inicio, quantidade: d.quantidade, obtidoEm: RF.agora(), ambiente: amb } };
      return { numeros: d.numeracoesReceita || [], saldo: d.saldoReceitas, aviso: d.mensagem || '', ambiente: amb };
    },

    // 3) depois que o perfil do médico abriu: grava o resultado pendente nele. Devolve mensagem para a tela.
    async aplicarResultado() {
      const res = ler(localStorage, K_RESULT);
      if (!res) return null;
      if (!res.ok) { localStorage.removeItem(K_RESULT); return { erro: res.erro }; }
      const T = TIPOS[res.tipo];
      await RF.backend.medico.transacaoPerfil(m => {
        m.sncr = m.sncr || {};
        if (T.faixa) m.sncr[T.campo] = { ...res.faixa, reservas: (m.sncr[T.campo] && this.restantes(m.sncr[T.campo]) ? [m.sncr[T.campo]] : []).concat((m.sncr[T.campo] && m.sncr[T.campo].reservas) || []) };
        else {
          const atual = m.sncr[T.campo] && m.sncr[T.campo].ambiente === res.ambiente ? m.sncr[T.campo].numeros : [];
          m.sncr[T.campo] = { ambiente: res.ambiente, numeros: (atual || []).concat(res.numeros), saldo: res.saldo };
        }
      });
      localStorage.removeItem(K_RESULT);
      const qtd = T.faixa ? res.faixa.quantidade : res.numeros.length;
      return { msg: qtd ? `${qtd} número(s) de ${T.rot} recebidos.` : (res.aviso || 'Nenhum número disponível.'), aviso: res.aviso };
    },

    // "2602.6-53.0000001" → "2602.6-53.0000002" (só a parte final é sequencial; aceita o formato de 16 dígitos)
    seguinte(numero) {
      const m = String(numero).match(/^(.*?)(\d+)$/);
      return m ? m[1] + String(+m[2] + 1).padStart(m[2].length, '0') : null;
    },
    restantes(bl) {
      if (!bl || !bl.proximo) return 0;
      const n = s => +String(s).match(/(\d+)$/)[1];
      return Math.max(0, n(bl.fim) - n(bl.proximo) + 1);
    },
    // saldo do médico neste tipo, só do ambiente em uso (número de homologação nunca entra em receita real)
    saldo(m, tipo) {
      const T = TIPOS[tipo], g = (m && m.sncr && m.sncr[T.campo]) || null, amb = this.ambiente();
      if (!g || g.ambiente !== amb) return T.faixa ? ((g && g.reservas) || []).filter(x => x.ambiente === amb).reduce((s, x) => s + this.restantes(x), 0) : 0;
      if (!T.faixa) return (g.numeros || []).length;
      return this.restantes(g) + (g.reservas || []).filter(x => x.ambiente === amb).reduce((s, x) => s + this.restantes(x), 0);
    },
    // tira o próximo número do saldo (muta m); null se não houver
    consumir(m, tipo) {
      const T = TIPOS[tipo], amb = this.ambiente();
      const g = m.sncr && m.sncr[T.campo];
      if (!g) return null;
      if (!T.faixa) { if (g.ambiente !== amb || !(g.numeros || []).length) return null; return g.numeros.shift(); }
      const tira = bl => { const a = bl.proximo; bl.proximo = this.restantes(bl) > 1 ? this.seguinte(a) : null; bl.usados = (bl.usados || 0) + 1; return a; };
      const fila = [g].concat(g.reservas || []).filter(x => x.ambiente === amb && this.restantes(x));
      return fila.length ? tira(fila[fila.length - 1]) : null; // gasta primeiro o bloco mais antigo
    }
  };
})(window);
