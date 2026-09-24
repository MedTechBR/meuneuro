// Roda os pacientes de exemplo (demo.js) pela conversa e mostra resumo, alertas e receitas.
// Uso: node tools/simular.cjs [índice]
const raiz = __dirname + '/..';
for (const f of ['core', 'kb', 'engine', 'regras', 'receita', 'demo']) require(raiz + '/' + f + '.js');
(async () => {
  const qual = process.argv[2];
  const lista = qual != null ? [RF.ROTEIROS[+qual]] : RF.ROTEIROS;
  for (const R of lista) {
    const p = await RF.rodarRoteiro(R);
    console.log('=====', p.paciente.nome, '|', p.status, '|', p.codigo, '|', (p.especialidades || []).join(', '));
    console.log(p.resumo);
    console.log('--- alertas');
    for (const a of p.alertas) console.log(' ', a.nivel.padEnd(5), a.texto);
    console.log('--- receitas');
    for (const b of p.receitas) { console.log(' ', b.tipo); for (const i of b.itens) console.log('    ', i.nome, '|', i.forma, '|', i.posologia, '|', RF.textoQuantidade(i, b.tipo), i.dias + 'd', i.obs ? '| ' + i.obs : ''); }
  }
})().catch(e => { console.error(e); process.exit(1); });
