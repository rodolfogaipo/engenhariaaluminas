/* =========================================================
   metrics.js — motor de cálculo de desempenho
   Porta 1:1 a fórmula que já existia nas abas por funcionário
   da planilha (CONFIGURAÇÕES define os pesos). Roda 100% local,
   em cima dos serviços concluídos (Data Final) e dos registros
   de Plano de Corte concluídos (Data Final Corte).

   OBS: a exclusão de semanas de férias do cálculo de Meta entra
   quando o módulo de Férias for construído (próximo passo). Por
   enquanto todas as semanas contam normalmente.
   ========================================================= */

const Metrics = {
  async pesos() {
    const cfg = await DB.get('config', 'pesos_formula');
    return (
      cfg || {
        peso_produtividade: 0.45,
        peso_prazo: 0.25,
        peso_atraso: 0.15,
        peso_erro: 0.1,
        peso_erro_novo: 0.05,
        crescimento_min: 0.05,
        meta_minima: 4,
      }
    );
  },

  segundaFeira(ts) {
    const d = new Date(ts);
    const dia = d.getDay(); // 0=domingo
    const diff = (dia === 0 ? -6 : 1) - dia;
    d.setDate(d.getDate() + diff);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  },

  rangeDaSemana(referenciaTs, semanasAtras) {
    const segunda = this.segundaFeira(referenciaTs);
    const inicio = new Date(segunda);
    inicio.setDate(inicio.getDate() - 7 * semanasAtras);
    const fim = new Date(inicio);
    fim.setDate(fim.getDate() + 7);
    return { inicio: inicio.getTime(), fim: fim.getTime() };
  },

  /* eventos de conclusão do funcionário: serviços com Data Final +
     itens de Plano de Corte com Data Final Corte */
  async eventosConcluidosDoFuncionario(funcionarioId) {
    const [servicos, planoCorte] = await Promise.all([
      DB.getAll('servicos'),
      DB.getAll('plano_corte'),
    ]);

    const eventos = [];

    servicos.forEach((s) => {
      if (s.funcionarioId === funcionarioId && s.dataFinal) {
        eventos.push({
          dataFinal: s.dataFinal,
          dataProgramada: s.dataProgramada || null,
          erros: s.erros || 0,
          errosNovos: s.errosNovos || 0,
        });
      }
    });

    planoCorte.forEach((p) => {
      if (p.funcionarioCorteId === funcionarioId && p.dataFinalCorte) {
        eventos.push({
          dataFinal: p.dataFinalCorte,
          dataProgramada: p.dataProgramada || null,
          erros: 0,
          errosNovos: 0,
        });
      }
    });

    return eventos;
  },

  async feriasDoFuncionario(funcionarioId) {
    const todas = await DB.getAll('ferias');
    return todas.filter((f) => f.funcionarioId === funcionarioId);
  },

  semanaEmFerias(feriasDoFunc, inicio, fim) {
    return feriasDoFunc.some((f) => f.dataInicio < fim && f.dataFim >= inicio);
  },

  calcularSemana(eventos, referenciaTs, semanasAtras, pesos, feriasDoFunc = []) {
    const { inicio, fim } = this.rangeDaSemana(referenciaTs, semanasAtras);
    const emFerias = this.semanaEmFerias(feriasDoFunc, inicio, fim);
    const daSemana = eventos.filter((e) => e.dataFinal >= inicio && e.dataFinal < fim);

    const projetos = daSemana.length;
    const prazo = daSemana.filter((e) => !e.dataProgramada || e.dataFinal <= e.dataProgramada).length;
    const atraso = projetos - prazo;
    const erros = daSemana.reduce((s, e) => s + (e.erros || 0), 0);
    const errosNovos = daSemana.reduce((s, e) => s + (e.errosNovos || 0), 0);
    const pctPrazo = projetos > 0 ? prazo / projetos : 0;

    let nota =
      projetos * pesos.peso_produtividade +
      pctPrazo * 100 * pesos.peso_prazo -
      atraso * pesos.peso_atraso -
      erros * pesos.peso_erro -
      errosNovos * pesos.peso_erro_novo;
    nota = Math.max(0, Math.min(100, nota));

    return { inicio, fim, projetos, prazo, atraso, erros, errosNovos, pctPrazo, nota, emFerias };
  },

  async calcularMeta(eventos, referenciaTs, semanasAtras, pesos, feriasDoFunc = []) {
    let soma = 0;
    let contadas = 0;
    for (let i = 1; i <= 4; i++) {
      const s = this.calcularSemana(eventos, referenciaTs, semanasAtras + i, pesos, feriasDoFunc);
      if (s.emFerias) continue; // semana de férias não conta pra média
      soma += s.projetos;
      contadas++;
    }
    const media = contadas > 0 ? soma / contadas : 0;
    return Math.max(pesos.meta_minima, media * (1 + pesos.crescimento_min));
  },

  async calcularPctMeta(semana, meta, pesos) {
    if (!meta || meta <= 0) return 0;
    return (
      semana.projetos / meta +
      (semana.pctPrazo - 1) * pesos.peso_prazo -
      (semana.atraso * pesos.peso_atraso + semana.erros * pesos.peso_erro + semana.errosNovos * pesos.peso_erro_novo) / meta
    );
  },

  tendencia(projetosAtual, projetosAnterior) {
    if (projetosAtual > projetosAnterior) return { icone: '📈', label: 'Subindo' };
    if (projetosAtual < projetosAnterior) return { icone: '📉', label: 'Caindo' };
    return { icone: '➡️', label: 'Estável' };
  },

  /* Resumo completo de N semanas (mais recente por último), pra
     alimentar o Dashboard e o gráfico */
  async resumoSemanal(funcionarioId, numSemanas = 6, referenciaTs = Date.now()) {
    const pesos = await this.pesos();
    const eventos = await this.eventosConcluidosDoFuncionario(funcionarioId);
    const feriasDoFunc = await this.feriasDoFuncionario(funcionarioId);

    const semanas = [];
    for (let i = numSemanas - 1; i >= 0; i--) {
      const semana = this.calcularSemana(eventos, referenciaTs, i, pesos, feriasDoFunc);
      const meta = await this.calcularMeta(eventos, referenciaTs, i, pesos, feriasDoFunc);
      const pctMeta = semana.emFerias ? null : await this.calcularPctMeta(semana, meta, pesos);
      semanas.push({ ...semana, meta, pctMeta });
    }

    const atual = semanas[semanas.length - 1];
    const anterior = semanas.length > 1 ? semanas[semanas.length - 2] : null;
    const tend = atual.emFerias ? { icone: '🏖️', label: 'Férias' } : this.tendencia(atual.projetos, anterior ? anterior.projetos : 0);

    return { semanas, atual, tendencia: tend };
  },

  /* números de mês/ano — soma simples de projetos concluídos no
     período, útil pros cartões do Dashboard */
  async totalPeriodo(funcionarioId, dias) {
    const eventos = await this.eventosConcluidosDoFuncionario(funcionarioId);
    const agora = Date.now();
    const limite = agora - dias * 24 * 60 * 60 * 1000;
    const doPeriodo = eventos.filter((e) => e.dataFinal >= limite && e.dataFinal <= agora);
    return doPeriodo.length;
  },
};

window.Metrics = Metrics;
