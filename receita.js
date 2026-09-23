/* Meu Neuro — documentos (receita simples, controle especial em 2 vias, orientações)
   Renderiza em HTML A4; o navegador gera o PDF pela impressão (Salvar como PDF). */
(function (G) {
  const MN = G.MN = G.MN || {};
  const esc = MN.esc;

  function cabecalho(med) {
    const l2 = ['CRM ' + (med.crm || '______') + '/' + (med.uf || '__'), med.rqe ? 'RQE ' + med.rqe : '', med.especialidade || 'Neurologia'].filter(Boolean).join(' · ');
    const end = [med.endereco, med.cidade && (med.cidade + (med.ufEnd ? '/' + med.ufEnd : ''))].filter(Boolean).join(' · ');
    return `<div class="cab"><div><div class="m">${esc(med.nome || 'Nome do médico')}</div><div class="d">${esc(l2)}</div></div>
      <div class="d" style="text-align:right">${esc(end)}${med.telefone ? '<br>' + esc(med.telefone) : ''}<br>Teleconsulta · Meu Neuro</div></div>`;
  }
  // receita simples: endereço residencial (Lei 5.991/73, art. 35); controle especial: CPF (Portaria 344, art. 55, red. RDC 1.000/2025)
  function pacienteBloco(p, modo) {
    const pa = p.paciente;
    const idade = MN.idade(pa.nasc);
    let s = `<div class="pac"><b>Paciente:</b> ${esc(pa.nome)}${idade != null ? ' · ' + idade + ' anos' : ''}`;
    if (modo === 'cpf' || modo === 'tudo') s += `<br><b>CPF:</b> ${esc(MN.fmtCPF(pa.cpf) || '—')}`;
    if (modo === 'end' || modo === 'tudo') s += `<br><b>Endereço:</b> ${esc([pa.endereco, pa.bairro, pa.cidade && pa.cidade + '/' + (pa.uf || '')].filter(Boolean).join(', '))}`;
    if (pa.responsavel) s += `<br><b>Responsável:</b> ${esc(pa.responsavel)}`;
    return s + '</div>';
  }
  function assinatura(med, ass, data) {
    const cidade = med.cidade || '';
    let s = `<div style="margin-top:34px;font-family:var(--font);font-size:12.5px">${esc(cidade ? cidade + ', ' : '')}${esc(MN.fmtData(data || MN.agora(), true))} · Documento emitido em telemedicina</div>`;
    s += `<div class="ass">${esc(med.nome || '')}<br>CRM ${esc(med.crm || '')}/${esc(med.uf || '')}${med.rqe ? ' · RQE ' + esc(med.rqe) : ''}`;
    if (ass) s += `<br><span style="font-size:11px">${ass.tipo === 'icp' ? 'Original assinado digitalmente (ICP-Brasil) no PDF do pedido' : 'DEMONSTRAÇÃO: sem validade legal'} · ${esc(MN.fmtData(ass.em, true))}</span>`;
    return s + '</div>';
  }
  function rodape(p, ass) {
    const esq = ass && ass.tipo !== 'icp' ? 'DEMONSTRAÇÃO: documento sem validade legal (assinatura ICP-Brasil ausente)' : ass ? `Verificação: ${esc(ass.verificacao)} · ${esc((G.location ? location.origin + location.pathname : '') + '#/verificar/' + ass.verificacao)}` : 'RASCUNHO: sem validade até a assinatura do médico';
    return `<div class="rodape"><span>${esq}</span><span>Pedido ${esc(p.codigo)}</span></div>`;
  }
  function justificativas(b) {
    const j = b.itens.filter(i => i.justificativa);
    if (!j.length) return '';
    return '<div style="font-family:var(--font);font-size:12px;margin-top:10px"><b>Justificativa (Portaria 344/98, art. 60):</b> ' + j.map(i => esc(i.nome + ': ' + i.justificativa)).join(' · ') + '</div>';
  }
  function itensHTML(bloco) {
    return '<ol>' + bloco.itens.map(it => `<li><span class="n">${esc(it.nome)}</span>${it.forma ? ', ' + esc(it.forma) : ''}<br>
      ${esc(it.posologia || '')}<br><span style="font-size:12.5px">Quantidade: ${esc(MN.textoQuantidade(it, bloco.tipo))}${it.quantidade != null ? ' · ' + it.dias + ' dias de tratamento' : ''}${it.obs ? ' · ' + esc(it.obs) : ''}</span></li>`).join('') + '</ol>';
  }

  // devolve HTML das folhas; opts: {ass, orientacoes:boolean}
  MN.folhasReceita = function (p, med, opts) {
    opts = opts || {};
    const ass = opts.ass || (p.atendimento && p.atendimento.assinatura) || null;
    const data = ass ? ass.em : null;
    const folhas = [];
    for (const b of p.receitas || []) {
      if (!b.itens.length) continue;
      if (b.tipo === 'simples') {
        folhas.push(`<div class="folha">${cabecalho(med)}<div class="tit">RECEITUÁRIO</div>${pacienteBloco(p, 'end')}<div class="uso">USO ORAL / CONFORME INDICADO</div>${itensHTML(b)}${assinatura(med, ass, data)}${rodape(p, ass)}</div>`);
      } else if (b.tipo === 'controle_especial') {
        // eletrônica: documento único (RDC 1.000/2025, art. 10); papel: 2 vias (Portaria 344/98, art. 52)
        const vias = opts.papel ? ['1ª via: retenção da farmácia', '2ª via: orientação ao paciente'] : ['Via única eletrônica'];
        for (const via of vias) {
          folhas.push(`<div class="folha"><div class="via">${via}</div>${cabecalho(med)}<div class="tit">RECEITUÁRIO DE CONTROLE ESPECIAL</div>${pacienteBloco(p, 'cpf')}<div class="uso">USO ORAL</div>${itensHTML(b)}${justificativas(b)}${assinatura(med, ass, data)}
          <div class="caixas"><div><b>Identificação do comprador</b><br>Nome:<br>RG/Órgão emissor:<br>Endereço:<br>Cidade/UF:<br>Telefone:</div><div><b>Identificação do fornecedor</b><br><br><br>Assinatura do farmacêutico<br>Data: ___/___/_____</div></div>${rodape(p, ass)}</div>`);
        }
      }
      // Notificação A/B: não gera documento (talonário de papel; nunca imitar a notificação)
    }
    if (opts.orientacoes) {
      const meds = p.meds.filter(m => m.nome);
      const corpo = meds.map(m => {
        const k = MN.kbPorId(m.kbId);
        if (!k) return `<h4>${esc(MN.nomeRx(m))}</h4><p>Siga a orientação do médico.</p>`;
        return `<h4>${esc(MN.nomeRx(m))}</h4><ul>${(k.efeitosComuns || []).slice(0, 4).map(x => '<li>Pode causar: ' + esc(x) + '</li>').join('')}${(k.sinaisAlerta || []).slice(0, 3).map(x => '<li>Procure atendimento se: ' + esc(x) + '</li>').join('')}${k.suspensao ? '<li>' + esc(k.suspensao) + '</li>' : ''}</ul>`;
      }).join('');
      const extra = p.atendimento && p.atendimento.orientacaoMedico ? `<h4>Orientação do médico</h4><p>${esc(p.atendimento.orientacaoMedico)}</p>` : '';
      folhas.push(`<div class="folha">${cabecalho(med)}<div class="tit">ORIENTAÇÕES AO PACIENTE</div>${pacienteBloco(p, '')}<div class="orient">${extra}${corpo}</div>${rodape(p, ass)}</div>`);
    }
    return folhas.join('');
  };

  MN.imprimir = function (html) {
    let area = document.getElementById('impressao');
    if (!area) { area = document.createElement('div'); area.id = 'impressao'; document.body.appendChild(area); }
    area.innerHTML = html;
    setTimeout(() => G.print(), 60);
  };

  // conteúdo canônico que a assinatura protege
  MN.conteudoAssinado = function (p, med, em) {
    return JSON.stringify({
      pedido: p.codigo, em, medico: { nome: med.nome, crm: med.crm, uf: med.uf, rqe: med.rqe || '' },
      paciente: { nome: p.paciente.nome, nasc: p.paciente.nasc },
      receitas: (p.receitas || []).map(b => ({ tipo: b.tipo, itens: b.itens.map(i => ({ nome: i.nome, forma: i.forma, posologia: i.posologia, quantidade: i.quantidade, dias: i.dias })) }))
    });
  };

  // o PDF anexado parece conter assinatura digital (PAdES)?
  MN.pdfTemAssinatura = function (bytes) {
    const n = Math.min(bytes.length, 8 * 1024 * 1024);
    let s = '';
    for (let i = 0; i < n; i += 65536) s += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(n, i + 65536)));
    if (!s.startsWith('%PDF')) return { pdf: false, assinado: false };
    return { pdf: true, assinado: /\/ByteRange\s*\[/.test(s) && /\/(adbe\.pkcs7\.detached|ETSI\.CAdES\.detached|adbe\.pkcs7\.sha1)/.test(s) };
  };
})(typeof window !== 'undefined' ? window : globalThis);
