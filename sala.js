/* Meu Neuro — teleconsulta por vídeo: WebRTC direto médico↔paciente (criptografado, DTLS-SRTP).
   O Firestore só carrega a sinalização (SDP e ICE, sem dado de saúde) em salas/{id}; o médico apaga ao encerrar.
   Salas "loop:*" sinalizam por BroadcastChannel (demonstração no mesmo aparelho, sem servidor).
   Limite conhecido: sem servidor TURN, redes muito restritas não conectam; o caminho alternativo é o WhatsApp. */
(function (G) {
  const RF = G.RF;
  const ICE = { iceServers: [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }] };

  function sinalFirestore(id) {
    const { F, db } = RF.backend._;
    const sala = F.doc(db, 'salas', id), desl = [];
    return {
      async oferta(o) { await F.setDoc(sala, { offer: { type: o.type, sdp: o.sdp }, em: Date.now() }); },
      async resposta(a) { await F.updateDoc(sala, { answer: { type: a.type, sdp: a.sdp } }); },
      aoOfertar(cb) { desl.push(F.onSnapshot(sala, s => { const d = s.data(); if (d && d.offer) cb(d.offer); })); },
      aoResponder(cb) { desl.push(F.onSnapshot(sala, s => { const d = s.data(); if (d && d.answer) cb(d.answer); })); },
      async candidato(papel, c) { await F.addDoc(F.collection(sala, papel + 'Cands'), c.toJSON()); },
      aoCandidato(papel, cb) { desl.push(F.onSnapshot(F.collection(sala, papel + 'Cands'), s => s.docChanges().forEach(x => { if (x.type === 'added') cb(x.doc.data()); }))); },
      async limpar(dono) {
        desl.forEach(u => { try { u(); } catch (e) { } });
        if (!dono) return;
        try {
          for (const sub of ['medicoCands', 'pacienteCands']) { const q = await F.getDocs(F.collection(sala, sub)); await Promise.all(q.docs.map(d => F.deleteDoc(d.ref))); }
          await F.deleteDoc(sala);
        } catch (e) { }
      }
    };
  }
  function sinalLocal(id) {
    const ch = new BroadcastChannel('mn-sala-' + id), h = {}, est = {};
    const on = (k, f) => { (h[k] = h[k] || []).push(f); };
    ch.onmessage = e => {
      const m = e.data || {};
      if (m.t === 'oferta') { est.oferta = m.d; (h.oferta || []).forEach(f => f(m.d)); }
      if (m.t === 'resposta') (h.resposta || []).forEach(f => f(m.d));
      if (m.t === 'cand') (h['c:' + m.p] || []).forEach(f => f(m.d));
      if (m.t === 'oi' && est.oferta) ch.postMessage({ t: 'oferta', d: est.oferta });
    };
    return {
      async oferta(o) { est.oferta = { type: o.type, sdp: o.sdp }; ch.postMessage({ t: 'oferta', d: est.oferta }); },
      async resposta(a) { ch.postMessage({ t: 'resposta', d: { type: a.type, sdp: a.sdp } }); },
      aoOfertar(cb) { on('oferta', cb); ch.postMessage({ t: 'oi' }); },
      aoResponder(cb) { on('resposta', cb); },
      async candidato(p, c) { ch.postMessage({ t: 'cand', p, d: c.toJSON() }); },
      aoCandidato(p, cb) { on('c:' + p, cb); },
      async limpar() { try { ch.close(); } catch (e) { } }
    };
  }
  async function midia() {
    try { return await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 } }, audio: { echoCancellation: true, noiseSuppression: true } }); }
    catch (e1) { try { return await navigator.mediaDevices.getUserMedia({ audio: true }); } catch (e2) { return null; } }
  }

  const TXT = { conectando: 'Conectando…', aguardando: 'Aguardando a outra pessoa entrar', conectado: 'Em chamada', reconectando: 'Reconectando…', caiu: 'A ligação caiu. Saia e entre de novo, ou use o WhatsApp.', fim: 'Chamada encerrada' };

  // monta o painel de vídeo em `onde`; papel: 'medico' (cria a sala) ou 'paciente'
  RF.abrirVideo = async function (onde, { id, papel, aoEncerrar }) {
    const caixa = document.createElement('div');
    caixa.className = 'video-dock';
    caixa.innerHTML = `<div class="vd-rem"><video autoplay playsinline id="vd-remoto"></video><span class="vd-st" id="vd-st">${TXT.conectando}</span><div class="vd-loc"><video autoplay playsinline muted id="vd-local"></video></div></div>
      <div class="vd-bar"><button id="vd-mic" title="Microfone" aria-label="Microfone"><i class="ti ti-microphone"></i></button><button id="vd-cam" title="Câmera" aria-label="Câmera"><i class="ti ti-video"></i></button><button id="vd-fim" class="fim" title="Encerrar" aria-label="Encerrar"><i class="ti ti-phone-off"></i></button></div>`;
    onde.appendChild(caixa);
    const $ = s => caixa.querySelector(s);
    const st = k => { $('#vd-st').textContent = TXT[k] || k; };
    const local = await midia();
    if (!local) RF.toast('Sem acesso à câmera e ao microfone: libere a permissão no navegador.');
    const sig = id.startsWith('loop:') ? sinalLocal(id) : sinalFirestore(id);
    const pc = new RTCPeerConnection(ICE);
    const eu = papel === 'medico' ? 'medico' : 'paciente', outro = papel === 'medico' ? 'paciente' : 'medico';
    if (local) { local.getTracks().forEach(t => pc.addTrack(t, local)); $('#vd-local').srcObject = local; }
    else { pc.addTransceiver('audio', { direction: 'recvonly' }); pc.addTransceiver('video', { direction: 'recvonly' }); }
    const remoto = new MediaStream();
    pc.ontrack = e => { remoto.addTrack(e.track); $('#vd-remoto').srcObject = remoto; };
    let fechado = false, temRemota = false;
    const espera = [];
    pc.onicecandidate = e => { if (e.candidate) sig.candidato(eu, e.candidate).catch(() => { }); };
    pc.onconnectionstatechange = () => {
      if (fechado) return;
      const s = pc.connectionState;
      if (s === 'connected') st('conectado'); else if (s === 'disconnected') st('reconectando'); else if (s === 'failed') st('caiu');
    };
    const addCand = async c => { if (!temRemota) { espera.push(c); return; } try { await pc.addIceCandidate(new RTCIceCandidate(c)); } catch (e) { } };
    sig.aoCandidato(outro, addCand);
    const soltar = async () => { for (const c of espera.splice(0)) { try { await pc.addIceCandidate(new RTCIceCandidate(c)); } catch (e) { } } };
    if (papel === 'medico') {
      const o = await pc.createOffer();
      await pc.setLocalDescription(o);
      await sig.oferta(o);
      st('aguardando');
      sig.aoResponder(async a => { if (temRemota) return; temRemota = true; await pc.setRemoteDescription(new RTCSessionDescription(a)); await soltar(); });
    } else {
      st('aguardando');
      let respondeu = false;
      sig.aoOfertar(async o => {
        if (respondeu) return; respondeu = true;
        await pc.setRemoteDescription(new RTCSessionDescription(o));
        temRemota = true; await soltar();
        const a = await pc.createAnswer();
        await pc.setLocalDescription(a);
        await sig.resposta(a);
        st('conectando');
      });
    }
    const alterna = (trilhas, btn) => { const t = local && trilhas()[0]; if (!t) return; t.enabled = !t.enabled; btn.classList.toggle('off', !t.enabled); };
    $('#vd-mic').onclick = e => alterna(() => local.getAudioTracks(), e.currentTarget);
    $('#vd-cam').onclick = e => alterna(() => local.getVideoTracks(), e.currentTarget);
    const encerrar = async () => {
      if (fechado) return; fechado = true;
      try { pc.close(); } catch (e) { }
      if (local) local.getTracks().forEach(t => t.stop());
      await sig.limpar(papel === 'medico');
      caixa.remove();
      if (aoEncerrar) aoEncerrar();
    };
    $('#vd-fim').onclick = encerrar;
    return { encerrar, pc, estado: () => pc.connectionState };
  };
})(window);
