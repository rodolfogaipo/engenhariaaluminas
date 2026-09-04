/* =========================================================
   insights.js — motor de alertas e ideias sobre produtividade
   Baseado em regras (sem custo, sem IA generativa) — analisa os
   dados que já estão no app e aponta padrões: quedas de produção,
   funcionário abaixo da meta, desperdício subindo, destaques
   positivos. Mostrado em Admin → Mais Ferramentas.
   ========================================================= */

const Insights = {
  async gerar() {
    const alertas = [];
    const usuarios = await DB.getAll('usuarios');
    const funcionarios = usuarios.filter((u) => u.tipo !== 'admin');

    for (const f of funcionarios) {
      const resumo = await Metrics.resumoSemanal(f.id, 4);
      const semanas = resumo.semanas.filter((s) => !s.emFerias);
      if (semanas.length === 0) continue;

      const atual = semanas[semanas.length - 1];
      const primeiro = f.nome.split(' ')[0];

      // queda de produção 2 semanas seguidas
      if (semanas.length >= 3) {
        const [a, b, c] = semanas.slice(-3);
        if (a.nota > b.nota && b.nota > c.nota) {
          alertas.push({
            tipo: 'alerta',
            texto: `${primeiro} está em queda de produção há 2 semanas seguidas (Nota ${a.nota.toFixed(0)} → ${b.nota.toFixed(0)} → ${c.nota.toFixed(0)}).`,
          });
        }
      }

      // bem abaixo da meta essa semana
      if (!atual.emFerias && atual.pctMeta != null && atual.pctMeta < 0.6 && atual.projetos > 0) {
        alertas.push({
          tipo: 'alerta',
          texto: `${primeiro} está bem abaixo da meta essa semana (${(atual.pctMeta * 100).toFixed(0)}%).`,
        });
      }

      // destaque positivo
      if (!atual.emFerias && atual.pctMeta != null && atual.pctMeta >= 1.2) {
        alertas.push({
          tipo: 'destaque',
          texto: `${primeiro} está com ótimo desempenho essa semana (${(atual.pctMeta * 100).toFixed(0)}% da meta).`,
        });
      }
    }

    // aproveitamento caindo, por categoria
    const categorias = await Categorias.listarComAproveitamento();
    const agora = Date.now();
    for (const cat of categorias) {
      const indiceAtual = await Metrics.indiceSemana(agora);
      const semanaAtual = await Metrics.rangeDaSemanaPorIndice(indiceAtual);
      const semanaAnterior = await Metrics.rangeDaSemanaPorIndice(indiceAtual - 1);
      const [resAtual, resAnterior] = await Promise.all([
        Metrics.mediaAproveitamento(cat.nome, semanaAtual.inicio, semanaAtual.fim),
        Metrics.mediaAproveitamento(cat.nome, semanaAnterior.inicio, semanaAnterior.fim),
      ]);
      if (resAtual.media != null && resAnterior.media != null && resAnterior.media - resAtual.media >= 5) {
        alertas.push({
          tipo: 'alerta',
          texto: `Aproveitamento de "${cat.nome}" caiu essa semana: ${resAnterior.media.toFixed(1)}% → ${resAtual.media.toFixed(1)}%.`,
        });
      }
    }

    return alertas;
  },
};

window.Insights = Insights;
