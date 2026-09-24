/* RefilMed — utilidades compartilhadas (global RF) */
(function (G) {
  const RF = G.RF = G.RF || {};

  RF.versao = 'rf-v1';

  RF.norm = function (s) {
    return String(s == null ? '' : s).toLowerCase().normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
  };

  RF.esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  };

  RF.uid = function (n) {
    const a = new Uint8Array(n || 12);
    (G.crypto || require('crypto').webcrypto).getRandomValues(a);
    return Array.from(a, b => b.toString(16).padStart(2, '0')).join('');
  };

  // código curto que o paciente guarda: sem letras ambíguas (0/O, 1/I/L)
  RF.codigo = function () {
    const abc = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
    const a = new Uint8Array(6);
    (G.crypto || require('crypto').webcrypto).getRandomValues(a);
    return 'RF-' + Array.from(a, b => abc[b % abc.length]).join('');
  };

  RF.idade = function (nasc, ref) {
    if (!nasc) return null;
    const d = new Date(nasc + 'T12:00:00');
    if (isNaN(d)) return null;
    const h = ref ? new Date(ref) : new Date();
    let i = h.getFullYear() - d.getFullYear();
    const m = h.getMonth() - d.getMonth();
    if (m < 0 || (m === 0 && h.getDate() < d.getDate())) i--;
    return i;
  };

  RF.fmtData = function (iso, comHora) {
    if (!iso) return '';
    const d = new Date(iso.length === 10 ? iso + 'T12:00:00' : iso);
    if (isNaN(d)) return '';
    const p = n => String(n).padStart(2, '0');
    let s = p(d.getDate()) + '/' + p(d.getMonth() + 1) + '/' + d.getFullYear();
    if (comHora) s += ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
    return s;
  };

  RF.quando = function (iso) {
    if (!iso) return '';
    const s = (Date.now() - new Date(iso).getTime()) / 1000;
    if (s < 60) return 'agora';
    if (s < 3600) return Math.floor(s / 60) + ' min';
    if (s < 86400) return Math.floor(s / 3600) + ' h';
    const d = Math.floor(s / 86400);
    return d === 1 ? 'ontem' : d + ' dias';
  };

  RF.agora = () => new Date().toISOString();

  // número por extenso (0–99.999), para quantidades de receita controlada
  RF.extenso = function (n) {
    n = Math.round(Number(n));
    if (!isFinite(n) || n < 0) return '';
    if (n === 0) return 'zero';
    const u = ['', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez', 'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
    const d = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
    const c = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];
    function ate999(x) {
      if (x === 100) return 'cem';
      const partes = [];
      if (x >= 100) { partes.push(c[Math.floor(x / 100)]); x %= 100; }
      if (x >= 20) { partes.push(d[Math.floor(x / 10)] + (x % 10 ? ' e ' + u[x % 10] : '')); }
      else if (x > 0) partes.push(u[x]);
      return partes.join(' e ');
    }
    if (n < 1000) return ate999(n);
    const mil = Math.floor(n / 1000), resto = n % 1000;
    let s = mil === 1 ? 'mil' : ate999(mil) + ' mil';
    if (resto) s += (resto < 100 || resto % 100 === 0 ? ' e ' : ' ') + ate999(resto);
    return s;
  };

  RF.fmtQtd = function (q) {
    if (q == null || isNaN(q)) return '';
    const int = Math.floor(q), fr = Math.round((q - int) * 100) / 100;
    const frs = fr === 0.5 ? '½' : fr === 0.25 ? '¼' : fr === 0.75 ? '¾' : fr ? String(fr).replace('0.', ',') : '';
    if (!int) return frs || '0';
    return frs ? int + ' e ' + frs : String(int);
  };

  RF.fmtNum = function (x) {
    if (x == null || isNaN(x)) return '';
    return (Math.round(x * 100) / 100).toLocaleString('pt-BR');
  };

  // cor estável a partir de um texto (avatar de paciente etc.)
  RF.CORES = ['azul', 'violeta', 'rosa', 'laranja', 'verde', 'teal', 'ciano', 'indigo', 'ambar'];
  RF.corDe = function (txt) { let h = 0; for (const ch of String(txt || '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return 'c-' + RF.CORES[h % RF.CORES.length]; };

  RF.sha256 = async function (txt) {
    const c = G.crypto || require('crypto').webcrypto;
    const buf = await c.subtle.digest('SHA-256', new TextEncoder().encode(txt));
    return Array.from(new Uint8Array(buf), b => b.toString(16).padStart(2, '0')).join('');
  };

  if (typeof document === 'undefined') return;

  /* ---------- interface ---------- */
  RF.$ = (s, r) => (r || document).querySelector(s);
  RF.$$ = (s, r) => Array.from((r || document).querySelectorAll(s));

  let toastT;
  RF.toast = function (msg) {
    let t = document.getElementById('rf-toast');
    if (!t) { t = document.createElement('div'); t.id = 'rf-toast'; t.className = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
    t.textContent = msg; t.classList.remove('hide');
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.add('hide'), 3200);
  };

  // um modal por vez: abrir outro remove o anterior
  RF.modal = function (html, aoMontar) {
    RF.fecharModal();
    const f = document.createElement('div');
    f.className = 'modal-fundo'; f.id = 'rf-modal';
    f.innerHTML = '<div class="modal" role="dialog" aria-modal="true">' + html + '</div>';
    f.addEventListener('mousedown', e => { if (e.target === f) RF.fecharModal(); });
    document.body.appendChild(f);
    const primeiro = f.querySelector('input,textarea,select,button');
    if (primeiro) setTimeout(() => primeiro.focus(), 30);
    if (aoMontar) aoMontar(f);
    return f;
  };
  RF.fecharModal = function () { const m = document.getElementById('rf-modal'); if (m) m.remove(); };
  document.addEventListener('keydown', e => { if (e.key === 'Escape') RF.fecharModal(); });

  RF.marcaSVG = '<svg viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="9" fill="#0f7b6c"/><path d="M25.6 12.4a10.4 10.4 0 0 0 -18.9 -2.6M6.4 19.6a10.4 10.4 0 0 0 18.9 2.6" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="1.7" stroke-linecap="round"/><path d="M6.2 5.8v4.3h4.3M25.8 26.2v-4.3h-4.3" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><g transform="translate(6.2 6.2) scale(.82)" fill="none" stroke="#fff" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 12.5l8 -8a4.95 4.95 0 0 1 7 7l-8 8a4.95 4.95 0 0 1 -7 -7"/><path d="M8.5 8.5l7 7"/></g></svg>';
})(typeof window !== 'undefined' ? window : globalThis);
