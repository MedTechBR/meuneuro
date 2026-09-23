/* Meu Neuro — utilidades compartilhadas (global MN) */
(function (G) {
  const MN = G.MN = G.MN || {};

  MN.versao = 'mn-v1';

  MN.norm = function (s) {
    return String(s == null ? '' : s).toLowerCase().normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
  };

  MN.esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  };

  MN.uid = function (n) {
    const a = new Uint8Array(n || 12);
    (G.crypto || require('crypto').webcrypto).getRandomValues(a);
    return Array.from(a, b => b.toString(16).padStart(2, '0')).join('');
  };

  // código curto que o paciente guarda: sem letras ambíguas (0/O, 1/I/L)
  MN.codigo = function () {
    const abc = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
    const a = new Uint8Array(6);
    (G.crypto || require('crypto').webcrypto).getRandomValues(a);
    return 'MN-' + Array.from(a, b => abc[b % abc.length]).join('');
  };

  MN.idade = function (nasc, ref) {
    if (!nasc) return null;
    const d = new Date(nasc + 'T12:00:00');
    if (isNaN(d)) return null;
    const h = ref ? new Date(ref) : new Date();
    let i = h.getFullYear() - d.getFullYear();
    const m = h.getMonth() - d.getMonth();
    if (m < 0 || (m === 0 && h.getDate() < d.getDate())) i--;
    return i;
  };

  MN.fmtData = function (iso, comHora) {
    if (!iso) return '';
    const d = new Date(iso.length === 10 ? iso + 'T12:00:00' : iso);
    if (isNaN(d)) return '';
    const p = n => String(n).padStart(2, '0');
    let s = p(d.getDate()) + '/' + p(d.getMonth() + 1) + '/' + d.getFullYear();
    if (comHora) s += ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
    return s;
  };

  MN.quando = function (iso) {
    if (!iso) return '';
    const s = (Date.now() - new Date(iso).getTime()) / 1000;
    if (s < 60) return 'agora';
    if (s < 3600) return Math.floor(s / 60) + ' min';
    if (s < 86400) return Math.floor(s / 3600) + ' h';
    const d = Math.floor(s / 86400);
    return d === 1 ? 'ontem' : d + ' dias';
  };

  MN.agora = () => new Date().toISOString();

  // número por extenso (0–99.999), para quantidades de receita controlada
  MN.extenso = function (n) {
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

  MN.fmtQtd = function (q) {
    if (q == null || isNaN(q)) return '';
    const int = Math.floor(q), fr = Math.round((q - int) * 100) / 100;
    const frs = fr === 0.5 ? '½' : fr === 0.25 ? '¼' : fr === 0.75 ? '¾' : fr ? String(fr).replace('0.', ',') : '';
    if (!int) return frs || '0';
    return frs ? int + ' e ' + frs : String(int);
  };

  MN.fmtNum = function (x) {
    if (x == null || isNaN(x)) return '';
    return (Math.round(x * 100) / 100).toLocaleString('pt-BR');
  };

  MN.sha256 = async function (txt) {
    const c = G.crypto || require('crypto').webcrypto;
    const buf = await c.subtle.digest('SHA-256', new TextEncoder().encode(txt));
    return Array.from(new Uint8Array(buf), b => b.toString(16).padStart(2, '0')).join('');
  };

  if (typeof document === 'undefined') return;

  /* ---------- interface ---------- */
  MN.$ = (s, r) => (r || document).querySelector(s);
  MN.$$ = (s, r) => Array.from((r || document).querySelectorAll(s));

  let toastT;
  MN.toast = function (msg) {
    let t = document.getElementById('mn-toast');
    if (!t) { t = document.createElement('div'); t.id = 'mn-toast'; t.className = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
    t.textContent = msg; t.classList.remove('hide');
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.add('hide'), 3200);
  };

  // um modal por vez: abrir outro remove o anterior
  MN.modal = function (html, aoMontar) {
    MN.fecharModal();
    const f = document.createElement('div');
    f.className = 'modal-fundo'; f.id = 'mn-modal';
    f.innerHTML = '<div class="modal" role="dialog" aria-modal="true">' + html + '</div>';
    f.addEventListener('mousedown', e => { if (e.target === f) MN.fecharModal(); });
    document.body.appendChild(f);
    const primeiro = f.querySelector('input,textarea,select,button');
    if (primeiro) setTimeout(() => primeiro.focus(), 30);
    if (aoMontar) aoMontar(f);
    return f;
  };
  MN.fecharModal = function () { const m = document.getElementById('mn-modal'); if (m) m.remove(); };
  document.addEventListener('keydown', e => { if (e.key === 'Escape') MN.fecharModal(); });

  MN.marcaSVG = '<svg viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="9" fill="#3346c4"/><g transform="translate(5 4.6) scale(.92)" fill="none" stroke="#fff" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M15.5 13a3.5 3.5 0 0 0 -3.5 3.5v1a3.5 3.5 0 0 0 7 0v-1.8"/><path d="M8.5 13a3.5 3.5 0 0 1 3.5 3.5v1a3.5 3.5 0 0 1 -7 0v-1.8"/><path d="M17.5 16a3.5 3.5 0 0 0 0 -7h-.5"/><path d="M19 9.3v-2.8a3.5 3.5 0 0 0 -7 0"/><path d="M6.5 16a3.5 3.5 0 0 1 0 -7h.5"/><path d="M5 9.3v-2.8a3.5 3.5 0 0 1 7 0v10"/></g></svg>';
})(typeof window !== 'undefined' ? window : globalThis);
