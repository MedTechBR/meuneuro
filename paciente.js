/* Meu Neuro — tela do paciente (conversa com o assistente) */
(function (G) {
  const MN = G.MN;
  const { esc, $ } = MN;
  const UFS = 'AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' ');
  let conv = null, ocupado = false;

  MN.telaPaciente = function (el) {
    const salvo = MN.backend.rascunho.ler();
    const pedido = salvo && salvo.status === 'rascunho' || (salvo && salvo.status === 'urgencia') ? salvo : null;
    conv = new MN.Conversa(pedido, { ia: (t, d) => MN.backend.ia(t, d) });
    el.innerHTML = `
      <div class="conv-wrap">
        <section class="conv" aria-label="Conversa com o assistente">
          <div class="etapas" id="etapas"></div>
          <div class="msgs" id="msgs" aria-live="polite"></div>
          <div class="entrada" id="entrada"></div>
        </section>
        <aside class="lado" id="lado"></aside>
      </div>`;
    const msgs = $('#msgs');
    if (pedido && pedido.transcript.length) {
      // retoma a conversa de onde parou
      for (const t of pedido.transcript) msgs.appendChild(bolha(t.de === 'pac' ? 'pac' : 'ia', t.texto));
      const r = conv._perguntar();
      desenharEntrada(r.input);
      desenharEtapas(); desenharLado();
      const aviso = document.createElement('div');
      aviso.className = 'small muted'; aviso.style.textAlign = 'center';
      aviso.innerHTML = 'Você voltou de onde parou. <button class="btn btn-s btn-g" id="recomecar">Começar de novo</button>';
      msgs.appendChild(aviso);
      $('#recomecar').onclick = () => { if (confirm('Apagar as respostas e começar de novo?')) { MN.backend.rascunho.apagar(); MN.telaPaciente(el); } };
      rolar();
    } else {
      mostrar(conv.perguntar());
    }
  };

  function bolha(tipo, texto, html) {
    const d = document.createElement('div');
    d.className = 'msg ' + tipo;
    if (html) d.innerHTML = html; else d.textContent = texto;
    return d;
  }
  function rolar() { setTimeout(() => G.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }), 30); }
  const espera = ms => new Promise(r => setTimeout(r, ms));

  async function mostrar(r) {
    const msgs = $('#msgs'); if (!msgs) return;
    $('#entrada').innerHTML = '';
    for (const m of r.msgs) {
      const dig = document.createElement('div');
      dig.className = 'msg ia digitando'; dig.innerHTML = '<i></i><i></i><i></i>';
      msgs.appendChild(dig); rolar();
      await espera(Math.min(900, 280 + (m.texto || '').length * 4));
      dig.remove();
      if (m.tipo === 'orient') msgs.appendChild(bolha('orient', '', m.html));
      else if (m.tipo === 'resumo') { msgs.appendChild(bolha('ia', m.texto)); msgs.appendChild(bolha('orient', '', resumoHTML(conv.p))); }
      else msgs.appendChild(bolha('ia' + (m.tipo === 'alerta' ? ' alerta' : ''), m.texto));
      rolar();
    }
    desenharEtapas(); desenharLado();
    desenharEntrada(r.input);
    await persistir();
  }

  async function persistir() {
    const p = conv.p;
    if (p.status === 'rascunho' || p.status === 'urgencia') {
      MN.backend.rascunho.gravar(p);
      if (p.status === 'urgencia') { try { await MN.backend.salvarPedido(limpo(p)); } catch (e) { } }
      return;
    }
    // enviado: grava no backend e guarda o código para acompanhar
    try {
      await MN.backend.salvarPedido(limpo(p));
      MN.backend.rascunho.apagar();
      try {
        const k = 'meuneuro.v1.meus-pedidos';
        const l = JSON.parse(localStorage.getItem(k) || '[]');
        if (!l.find(x => x.codigo === p.codigo)) l.unshift({ codigo: p.codigo, nasc: p.paciente.nasc, em: p.enviadoEm });
        localStorage.setItem(k, JSON.stringify(l.slice(0, 10)));
      } catch (e) { }
    } catch (e) {
      MN.toast('Não consegui enviar agora. Verifique a internet; suas respostas estão guardadas.');
      MN.backend.rascunho.gravar(p);
    }
  }
  function limpo(p) {
    const c = JSON.parse(JSON.stringify(p));
    delete c._passo; delete c._fila; delete c._mi; delete c._corrigindo; delete c._tmp;
    return c;
  }

  async function responder(valor, rotulo) {
    if (ocupado) return; ocupado = true;
    const msgs = $('#msgs');
    if (rotulo !== null) msgs.appendChild(bolha('pac', rotulo != null ? rotulo : String(valor)));
    $('#entrada').innerHTML = '';
    rolar();
    try {
      const r = await conv.responder(valor, rotulo);
      if (valor === 'acompanhar') { G.location.hash = '#/acompanhar/' + conv.p.codigo; return; }
      await mostrar(r);
    } finally { ocupado = false; }
  }

  function desenharEtapas() {
    const e = conv.etapa;
    $('#etapas').innerHTML = MN.ETAPAS.map((n, i) => `<div class="etapa ${i <= e ? 'on' : ''}"><i></i><span>${n}</span></div>`).join('')
      + `<button class="btn btn-s lado-btn" id="abrir-lado" style="margin-left:6px"><i class="ti ti-list-details"></i></button>`;
    const b = $('#abrir-lado'); if (b) b.onclick = () => $('#lado').classList.toggle('aberto');
  }

  function desenharLado() {
    const p = conv.p, pa = p.paciente;
    const meds = p.meds.filter(m => m.nome);
    let h = '<div class="card"><h3><i class="ti ti-clipboard-list"></i>O que você informou</h3>';
    h += '<div class="grupo"><div class="rot">Paciente</div>' + (pa.nome ? esc(pa.nome) + (pa.nasc ? ' · ' + MN.idade(pa.nasc) + ' anos' : '') : '<span class="muted small">Ainda não informado</span>') + '</div>';
    if (p.condicoes.length) h += '<div class="grupo"><div class="rot">Motivo</div>' + p.condicoes.map(c => esc(c === 'outro' ? p.condicaoOutra : MN.condRot(c))).join('<br>') + '</div>';
    h += '<div class="grupo"><div class="rot">Remédios</div>';
    h += meds.length ? meds.map(m => `<div class="rx-item"><b>${esc(MN.nomeRx(m))}</b><span>${esc(m.pos ? MN.descPosologia(m.pos, m.forma) : 'posologia a informar')}</span></div>`).join('') : '<span class="muted small">Nenhum ainda</span>';
    h += '</div><p class="nota">O médico revisa tudo e decide a receita no atendimento.</p>';
    h += '<button class="btn btn-s lado-btn" style="width:100%;margin-top:10px" onclick="document.getElementById(\'lado\').classList.remove(\'aberto\')">Fechar</button></div>';
    $('#lado').innerHTML = h;
  }

  function resumoHTML(p) {
    const pa = p.paciente, meds = p.meds.filter(m => m.nome);
    const linha = (r, v) => v ? `<div style="display:flex;gap:10px;padding:4px 0"><span class="muted" style="min-width:130px">${r}</span><span>${v}</span></div>` : '';
    let h = '<h3>Resumo do pedido</h3>';
    h += linha('Paciente', esc(pa.nome) + ' · ' + MN.idade(pa.nasc) + ' anos');
    h += linha('Motivo', p.condicoes.map(c => esc(c === 'outro' ? p.condicaoOutra : MN.condRot(c))).join('; '));
    h += '<div class="sub" style="margin-top:10px">Remédios</div><ul>' + meds.map(m => `<li><b>${esc(MN.nomeRx(m))}</b>: ${esc(m.pos ? MN.descPosologia(m.pos, m.forma) : '')}${(m.efeitos.length || m.efeitosOutros) ? '. Efeitos: ' + esc(m.efeitos.concat(m.efeitosOutros ? [m.efeitosOutros] : []).join('; ')) : ''}</li>`).join('') + '</ul>';
    h += linha('Outros remédios', esc(p.outrosMeds || 'Nenhum'));
    h += linha('Alergias', esc(p.alergias || 'Nenhuma'));
    h += linha('Receita para', (p.duracao || 30) + ' dias');
    if (p.relato) h += linha('Recado ao médico', esc(p.relato));
    return h;
  }

  /* ---------- entrada ---------- */
  function desenharEntrada(inp) {
    const box = $('#entrada'); if (!box || !inp) return;
    let h = '';
    const chips = (ops, cls) => '<div class="chips' + (cls || '') + '">' + ops.map((o, i) => `<button class="chip ${o.p ? 'p' : ''}" data-i="${i}">${esc(o.r)}</button>`).join('') + '</div>';
    if (inp.tipo === 'chips' || inp.tipo === 'fim') {
      h += chips(inp.opcoes || []);
      if (inp.texto) h += campoTexto(inp);
    } else if (inp.tipo === 'texto') {
      if (inp.dica) h += `<p class="dica">${esc(inp.dica)}</p>`;
      h += campoTexto(inp);
    } else if (inp.tipo === 'data') {
      h += `<form class="escreve" id="f"><input class="inp" type="date" id="t" required max="${new Date().toISOString().slice(0, 10)}" aria-label="Data de nascimento"><button class="btn btn-p" aria-label="Enviar"><i class="ti ti-arrow-up"></i></button></form>`;
    } else if (inp.tipo === 'numero') {
      h += chips(inp.chips || []);
      h += `<form class="escreve" id="f"><input class="inp" type="number" inputmode="numeric" id="t" min="${inp.min}" max="${inp.max}" placeholder="Ou escreva o número (${esc(inp.sufixo || '')})"><button class="btn btn-p" aria-label="Enviar"><i class="ti ti-arrow-up"></i></button></form>`;
    } else if (inp.tipo === 'multi') {
      h += '<div class="lista-sel">' + (inp.opcoes || []).map((o, i) => `<label class="opt"><input type="checkbox" data-v="${esc(o.v)}" data-r="${esc(o.r)}"><span>${esc(o.r)}</span></label>`).join('');
      if (inp.nenhum) h += `<label class="opt"><input type="checkbox" data-v="${esc(inp.nenhum.v)}" data-r="${esc(inp.nenhum.r)}" data-nenhum="1"><span><b>${esc(inp.nenhum.r)}</b></span></label>`;
      if (inp.outro) h += `<div style="padding:6px 10px 10px"><input class="inp" id="outro" placeholder="${esc(inp.outro)} (opcional)"></div>`;
      h += '</div><button class="btn btn-p" id="conf" style="width:100%">Confirmar</button>';
    } else if (inp.tipo === 'form') {
      h += '<form class="form-chat" id="f">' + inp.campos.map(c => {
        if (c.tipo === 'uf') return `<label class="campo"><span>${esc(c.r)}</span><select class="inp" name="${c.k}" required><option value="">Selecione</option>${UFS.map(u => `<option>${u}</option>`).join('')}</select></label>`;
        const tp = c.tipo === 'tel' ? 'tel' : c.tipo === 'email' ? 'email' : 'text';
        const im = c.tipo === 'tel' || c.tipo === 'cpf' ? ' inputmode="numeric"' : '';
        return `<label class="campo"><span>${esc(c.r)}</span><input class="inp" name="${c.k}" type="${tp}"${im} placeholder="${esc(c.ph || '')}" ${c.obrig ? 'required' : ''} data-tipo="${c.tipo || ''}" autocomplete="${c.k === 'telefone' ? 'tel' : c.k === 'email' ? 'email' : c.k === 'endereco' ? 'street-address' : c.k === 'cidade' ? 'address-level2' : 'off'}"></label>`;
      }).join('') + `<button class="btn btn-p" style="width:100%">${esc(inp.botao || 'Continuar')}</button></form>`;
    }
    box.innerHTML = h;

    // eventos
    box.querySelectorAll('.chips .chip').forEach(b => b.onclick = () => {
      const src = inp.tipo === 'numero' ? inp.chips : inp.opcoes;
      const o = src[+b.dataset.i];
      responder(o.v, o.r);
    });
    const f = $('#f', box);
    if (f && inp.tipo !== 'form') {
      f.onsubmit = e => {
        e.preventDefault();
        const t = $('#t', box); const v = t.value.trim();
        if (!v) return;
        if (inp.tipo === 'data') responder(v, MN.fmtData(v));
        else responder(v, v);
      };
      const t = $('#t', box);
      if (t && t.tagName === 'TEXTAREA') t.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); f.requestSubmit(); } });
      if (t && G.matchMedia('(min-width: 761px)').matches) setTimeout(() => t.focus(), 50);
    }
    if (inp.tipo === 'form') {
      f.querySelectorAll('input[data-tipo="cpf"]').forEach(i => i.oninput = () => { i.value = mascaraCPF(i.value); });
      f.querySelectorAll('input[data-tipo="tel"]').forEach(i => i.oninput = () => { i.value = mascaraTel(i.value); });
      f.onsubmit = e => {
        e.preventDefault();
        const v = {}; new FormData(f).forEach((val, k) => v[k] = String(val).trim());
        const rot = inp.campos.some(c => c.k === 'cpf') ? 'CPF, telefone' + (v.email ? ' e e-mail' : '') + ' informados'
          : inp.campos.some(c => c.k === 'endereco') ? `${v.endereco}, ${v.bairro}, ${v.cidade}/${v.uf}` : 'Enviado';
        responder(v, rot);
      };
    }
    if (inp.tipo === 'multi') {
      const cks = box.querySelectorAll('input[type=checkbox]');
      cks.forEach(c => c.onchange = () => {
        if (c.checked && c.dataset.nenhum) cks.forEach(o => { if (o !== c) o.checked = false; });
        if (c.checked && !c.dataset.nenhum) cks.forEach(o => { if (o.dataset.nenhum) o.checked = false; });
      });
      $('#conf', box).onclick = () => {
        const sel = [...cks].filter(c => c.checked);
        const outro = inp.outro ? ($('#outro', box).value || '').trim() : '';
        if (!sel.length && !outro) { MN.toast('Marque pelo menos uma opção.'); return; }
        const vals = sel.map(c => c.dataset.v), rots = sel.map(c => c.dataset.r);
        if (outro) rots.push(outro);
        responder(inp.outro ? { sel: vals, outro } : vals, rots.join('; '));
      };
    }
  }
  function campoTexto(inp) {
    const tag = inp.area
      ? `<textarea class="inp" id="t" rows="2" placeholder="${esc(inp.ph || 'Escreva aqui')}"></textarea>`
      : `<input class="inp" id="t" placeholder="${esc(inp.ph || 'Escreva aqui')}" autocomplete="${inp.auto || 'off'}" autocapitalize="sentences">`;
    return `<form class="escreve" id="f">${tag}<button class="btn btn-p" aria-label="Enviar"><i class="ti ti-arrow-up"></i></button></form>`;
  }
  function mascaraCPF(v) { return v.replace(/\D/g, '').slice(0, 11).replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2'); }
  function mascaraTel(v) { const d = v.replace(/\D/g, '').slice(0, 11); return d.length <= 10 ? d.replace(/(\d{2})(\d{0,4})(\d{0,4})/, (m, a, b, c) => '(' + a + ') ' + b + (c ? '-' + c : '')) : d.replace(/(\d{2})(\d{5})(\d{0,4})/, '($1) $2-$3'); }
})(window);
