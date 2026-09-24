// número por extenso (0–99.999) para quantidades de receita controlada (mesma regra do core.js)
module.exports = function extenso(n) {
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
    if (x >= 20) partes.push(d[Math.floor(x / 10)] + (x % 10 ? ' e ' + u[x % 10] : ''));
    else if (x > 0) partes.push(u[x]);
    return partes.join(' e ');
  }
  if (n < 1000) return ate999(n);
  const mil = Math.floor(n / 1000), resto = n % 1000;
  let s = mil === 1 ? 'mil' : ate999(mil) + ' mil';
  if (resto) s += (resto < 100 || resto % 100 === 0 ? ' e ' : ' ') + ate999(resto);
  return s;
};
