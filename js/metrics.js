/* =========================================================
   metrics.js — motor de cálculo de desempenho
   Porta 1:1 as fórmulas reais da planilha (conferidas direto nas
   células, não de memória):

   - As semanas são contadas em blocos fixos de 7 dias a partir de
     uma ÂNCORA (domingo 28/12/2025 na planilha original) — não da
     semana ISO (segunda a domingo) nem relativas a "hoje".
   - Prazo/Atraso só contam itens que TÊM Data Programada. Itens
     sem Data Programada contam em Projetos, mas não em Prazo nem
     em Atraso (igual às fórmulas SUMPRODUCT da planilha).
   - Meta = MAX(Meta_Mínima, MÉDIA de Projetos de TODAS as semanas
     anteriores × (1 + Crescimento_Mín)). É uma média que cresce
     desde o início, não uma janela de 4 semanas.
   - Única regra que a planilha não tinha: semanas de férias somem
     do cálculo da média de Meta (e não recebem Nota).
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

  async ancoraSemanas() {
    const cfg = await DB.get('config', 'semana_ancora');
    if (cfg && cfg.data) return cfg.data;
    // Igual à planilha original: primeira semana começa no domingo 28/12/2025
    return new Date(2025, 11, 28).getTime();
  },

  async indiceSemana(ts) {
    const ancora = await this.ancoraSemanas();
    return Math.floor((ts - ancora) / (7 * 24 * 60 * 60 * 1000));
  },

  async rangeDaSemanaPorIndice(indice) {
    const ancora = await this.ancoraSemanas();
    const inicio = ancora + indice * 7 * 24 * 60 * 60 * 1000;
    const fim = inicio + 7 * 24 * 60 * 60 * 1000;
    return { inicio, fim };
  },

  segundaFeira(ts) {
    // mantido só pra uso pontual de exibição; o cálculo em si usa
    // indiceSemana/rangeDaSemanaPorIndice, ancorado na planilha
    const d = new Date(ts);
    const dia = d.getDay();
    const diff = (dia === 0 ? -6 : 1) - dia;
    d.setDate(d.getDate() + diff);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  },

  async feriasDoFuncionario(funcionarioId) {
    const todas = await DB.getAll('ferias');
    return todas.filter((f) => f.funcionarioId === funcionarioId);
  },

  semanaEmFerias(feriasDoFunc, inicio, fim) {
    return feriasDoFunc.some((f) => f.dataInicio < fim && f.dataFim >= inicio);
  },

  /* eventos de conclusão do funcionário: serviços com Data Final +
     itens de Plano de Corte com Data Final Corte. Guarda também se
     tinha Data Programada, porque isso muda a regra de Prazo/Atraso. */
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
          temPrazo: s.dataProgramada != null,
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
          temPrazo: p.dataProgramada != null,
          dataProgramada: p.dataProgramada || null,
          erros: 0,
          errosNovos: 0,
        });
      }
    });

    return eventos;
  },

  async calcularSemanaPorIndice(eventos, indice, pesos, feriasDoFunc = []) {
    const { inicio, fim } = await this.rangeDaSemanaPorIndice(indice);
    const emFerias = this.semanaEmFerias(feriasDoFunc, inicio, fim);
    const daSemana = eventos.filter((e) => e.dataFinal >= inicio && e.dataFinal < fim);

    const projetos = daSemana.length;
    // Prazo/Atraso só contam quem tem Data Programada preenchida —
    // igual às fórmulas SUMPRODUCT da planilha.
    const prazo = daSemana.filter((e) => e.temPrazo && e.dataFinal <= e.dataProgramada).length;
    const atraso = daSemana.filter((e) => e.temPrazo && e.dataFinal > e.dataProgramada).length;
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

    return { indice, inicio, fim, projetos, prazo, atraso, erros, errosNovos, pctPrazo, nota, emFerias };
  },

  /* Meta da semana `indice` = média de Projetos das ÚLTIMAS 4 semanas
     (pulando semanas de férias), vezes (1+crescimento). Nas primeiras
     semanas (antes de existirem 4 anteriores), usa quantas houver —
     igual à planilha, que usa AVERAGE(C[n-4]:C[n-1]) a partir da 5ª
     semana e uma janela crescente antes disso. */
  async calcularMetaPorIndice(eventos, indice, pesos, feriasDoFunc = []) {
    if (indice <= 0) return pesos.meta_minima;

    const inicioJanela = Math.max(0, indice - 4);
    let soma = 0;
    let contadas = 0;
    for (let i = inicioJanela; i < indice; i++) {
      const s = await this.calcularSemanaPorIndice(eventos, i, pesos, feriasDoFunc);
      if (s.emFerias) continue; // semana de férias não conta
      soma += s.projetos;
      contadas++;
    }
    if (contadas === 0) return pesos.meta_minima;
    const media = soma / contadas;
    return Math.max(pesos.meta_minima, media * (1 + pesos.crescimento_min));
  },

  async calcularPctMeta(semana, meta, pesos) {
    if (!meta || meta <= 0) return 0;
    return Math.max(
      0,
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

  /* Resumo de N semanas terminando na semana que contém referenciaTs
     (mais recente por último), pra alimentar o Dashboard e o gráfico. */
  async resumoSemanal(funcionarioId, numSemanas = 6, referenciaTs = Date.now()) {
    const pesos = await this.pesos();
    const eventos = await this.eventosConcluidosDoFuncionario(funcionarioId);
    const feriasDoFunc = await this.feriasDoFuncionario(funcionarioId);
    const indiceAtual = await this.indiceSemana(referenciaTs);

    const semanas = [];
    for (let i = numSemanas - 1; i >= 0; i--) {
      const indice = indiceAtual - i;
      const semana = await this.calcularSemanaPorIndice(eventos, indice, pesos, feriasDoFunc);
      const meta = await this.calcularMetaPorIndice(eventos, indice, pesos, feriasDoFunc);
      const pctMeta = semana.emFerias ? null : await this.calcularPctMeta(semana, meta, pesos);
      semanas.push({ ...semana, meta, pctMeta });
    }

    const atual = semanas[semanas.length - 1];
    const anterior = semanas.length > 1 ? semanas[semanas.length - 2] : null;
    const tend = atual.emFerias ? { icone: '🏖️', label: 'Férias' } : this.tendencia(atual.projetos, anterior ? anterior.projetos : 0);

    return { semanas, atual, tendencia: tend };
  },

  /* números de mês/ano — período CIVIL (do dia 1 do mês / 1º de
     janeiro até hoje), não janela corrida de N dias */
  async totalMesCalendario(funcionarioId, referenciaTs = Date.now()) {
    const eventos = await this.eventosConcluidosDoFuncionario(funcionarioId);
    const agora = new Date(referenciaTs);
    const inicioMes = new Date(agora.getFullYear(), agora.getMonth(), 1).getTime();
    return eventos.filter((e) => e.dataFinal >= inicioMes && e.dataFinal <= referenciaTs).length;
  },

  async totalAnoCalendario(funcionarioId, referenciaTs = Date.now()) {
    const eventos = await this.eventosConcluidosDoFuncionario(funcionarioId);
    const agora = new Date(referenciaTs);
    const inicioAno = new Date(agora.getFullYear(), 0, 1).getTime();
    return eventos.filter((e) => e.dataFinal >= inicioAno && e.dataFinal <= referenciaTs).length;
  },

  /* %Meta de um período (mês/ano) = MÉDIA da %Meta de cada semana cujo
     início cai dentro do período — igual à fórmula real da planilha
     (AVERAGEIFS na coluna K, filtrando pela Data Inicial da semana).
     NÃO é projetos-do-período dividido por meta-do-período. */
  async mediaPctMetaPeriodo(funcionarioId, inicioTs, fimTs) {
    const pesos = await this.pesos();
    const eventos = await this.eventosConcluidosDoFuncionario(funcionarioId);
    const feriasDoFunc = await this.feriasDoFuncionario(funcionarioId);
    const indiceInicio = await this.indiceSemana(inicioTs);
    const indiceFim = await this.indiceSemana(fimTs - 1);

    let soma = 0;
    let contadas = 0;
    for (let i = indiceInicio; i <= indiceFim; i++) {
      const range = await this.rangeDaSemanaPorIndice(i);
      if (range.inicio < inicioTs || range.inicio >= fimTs) continue;
      const semana = await this.calcularSemanaPorIndice(eventos, i, pesos, feriasDoFunc);
      if (semana.emFerias) continue;
      const meta = await this.calcularMetaPorIndice(eventos, i, pesos, feriasDoFunc);
      const pctMeta = await this.calcularPctMeta(semana, meta, pesos);
      soma += pctMeta;
      contadas++;
    }
    return contadas > 0 ? soma / contadas : 0;
  },

  async totalAnoEspecifico(funcionarioId, ano) {
    const eventos = await this.eventosConcluidosDoFuncionario(funcionarioId);
    const inicio = new Date(ano, 0, 1).getTime();
    const fim = new Date(ano + 1, 0, 1).getTime();
    return eventos.filter((e) => e.dataFinal >= inicio && e.dataFinal < fim).length;
  },

  async totalMesEspecifico(funcionarioId, ano, mes) {
    const eventos = await this.eventosConcluidosDoFuncionario(funcionarioId);
    const inicio = new Date(ano, mes, 1).getTime();
    const fim = new Date(ano, mes + 1, 1).getTime();
    return eventos.filter((e) => e.dataFinal >= inicio && e.dataFinal < fim).length;
  },

  /* Média de % Aproveitamento de uma categoria (Corte Tecido, Espuma,
     Tela, Outline, Couro, ou qualquer categoria custom marcada com
     temPorcentagem) num intervalo de tempo — usa Data Final. */
  async mediaAproveitamento(categoria, inicio, fim) {
    const todos = await DB.getAll('servicos');
    const doPeriodo = todos.filter(
      (s) =>
        s.tipo === categoria &&
        s.dataFinal &&
        s.dataFinal >= inicio &&
        s.dataFinal < fim &&
        s.percentualAproveitamento != null
    );
    if (doPeriodo.length === 0) return { media: null, quantidade: 0 };
    const soma = doPeriodo.reduce((acc, s) => acc + s.percentualAproveitamento, 0);
    return { media: soma / doPeriodo.length, quantidade: doPeriodo.length };
  },

  async mediaAproveitamentoResumo(categoria, referenciaTs = Date.now()) {
    const indiceSemanaAtual = await this.indiceSemana(referenciaTs);
    const semana = await this.rangeDaSemanaPorIndice(indiceSemanaAtual);
    const d = new Date(referenciaTs);
    const inicioMes = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
    const inicioAno = new Date(d.getFullYear(), 0, 1).getTime();

    const [semanaRes, mesRes, anoRes] = await Promise.all([
      this.mediaAproveitamento(categoria, semana.inicio, semana.fim),
      this.mediaAproveitamento(categoria, inicioMes, referenciaTs + 1),
      this.mediaAproveitamento(categoria, inicioAno, referenciaTs + 1),
    ]);
    return { semana: semanaRes, mes: mesRes, ano: anoRes };
  },

  /* mantido para compatibilidade — janela corrida de N dias */
  async totalPeriodo(funcionarioId, dias) {
    const eventos = await this.eventosConcluidosDoFuncionario(funcionarioId);
    const agora = Date.now();
    const limite = agora - dias * 24 * 60 * 60 * 1000;
    const doPeriodo = eventos.filter((e) => e.dataFinal >= limite && e.dataFinal <= agora);
    return doPeriodo.length;
  },
};

window.Metrics = Metrics;
