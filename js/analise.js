/* =========================================================
   analise.js — base de dados "achatada" para Raio-X, Painel de
   Qualidade, Comparação de meses, Relatório em PDF e Exportação.

   Junta numa lista só tudo que foi CONCLUÍDO e APROVADO (mesma
   regra usada no cálculo de Nota/Meta em metrics.js):
   - Serviços com Data Final
   - Itens da aba Corte (Plano de Corte) com Data Final Corte
   ========================================================= */

// Itens da aba Corte (vieram de uma CNP) são a MESMA categoria dos
// serviços lançados direto como "Plano de Corte" (produto que já existia)
// — só muda por onde entraram. Nos relatórios contam juntos; a coluna
// "Origem" da planilha ainda diz de onde cada um veio.
const CATEGORIA_ABA_CORTE = 'Plano de Corte';

const MESES_PT = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const MESES_CURTOS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

const Analise = {
  async itensConcluidos() {
    const [servicos, planoCorte, catsAtelie, inicioAtelie] = await Promise.all([
      DB.getAll('servicos'),
      DB.getAll('plano_corte'),
      Atelie.nomesCategorias(),
      Atelie.inicio(),
    ]);
    const itens = [];

    servicos.forEach((s) => {
      if (!s.dataFinal || s.aprovado !== 'aprovado') return;
      itens.push({
        id: s.id,
        origem: 'servico',
        categoria: s.tipo || 'Sem categoria',
        nome: s.nome || '',
        numeroPedido: s.numeroPedido || '',
        funcionarioId: s.funcionarioId || null,
        funcionarioNome: s.funcionarioNome || '',
        dataFinal: s.dataFinal,
        dataProgramada: s.dataProgramada || null,
        erros: Number(s.erros) || 0,
        errosNovos: Number(s.errosNovos) || 0,
        aproveitamento: s.percentualAproveitamento != null && !isNaN(Number(s.percentualAproveitamento)) ? Number(s.percentualAproveitamento) : null,
        materialNome: s.materialNome || '',
        materialTipo: s.materialTipo || '',
        materialLargura: s.materialLargura ?? null,
        observacoes: s.observacoes || '',
        atelie: catsAtelie.has(s.tipo) ? Atelie.rotulo(Atelie.situacao(s, inicioAtelie)) : '',
        atelieObs: catsAtelie.has(s.tipo) ? s.atelieObs || '' : '',
      });
    });

    planoCorte.forEach((p) => {
      if (!p.dataFinalCorte || p.aprovado !== 'aprovado') return;
      itens.push({
        id: p.id,
        origem: 'corte',
        categoria: CATEGORIA_ABA_CORTE,
        nome: p.nomeProduto || '',
        numeroPedido: p.numeroPedido || '',
        funcionarioId: p.funcionarioCorteId || null,
        funcionarioNome: p.funcionarioCorteNome || '',
        dataFinal: p.dataFinalCorte,
        dataProgramada: p.dataProgramada || null,
        erros: 0,
        errosNovos: 0,
        aproveitamento: null,
        materialNome: '',
        materialTipo: '',
        materialLargura: null,
        observacoes: '',
      });
    });

    itens.sort((a, b) => a.dataFinal - b.dataFinal);
    return itens;
  },

  situacaoPrazo(item) {
    if (!item.dataProgramada) return 'Sem data programada';
    return item.dataFinal <= item.dataProgramada ? 'No prazo' : 'Atrasado';
  },

  desperdicio(item) {
    return item.aproveitamento == null ? null : Math.round((100 - item.aproveitamento) * 10) / 10;
  },

  normaliza(s) {
    return (s || '')
      .toString()
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  },

  filtrar(itens, f = {}) {
    const nomeAlvo = this.normaliza(f.nome);
    return itens.filter((i) => {
      if (f.inicio != null && i.dataFinal < f.inicio) return false;
      if (f.fim != null && i.dataFinal >= f.fim) return false;
      if (f.funcionarioId && i.funcionarioId !== f.funcionarioId) return false;
      if (f.categoria && i.categoria !== f.categoria) return false;
      if (f.categorias && f.categorias.length && !f.categorias.includes(i.categoria)) return false;
      if (f.material && i.materialNome !== f.material) return false;
      if (nomeAlvo && !this.normaliza(i.nome).includes(nomeAlvo)) return false;
      return true;
    });
  },

  /* Resumo por categoria: quantidade + qualidade (erros, erros novos,
     média de aproveitamento/desperdício pra quem tem a métrica). */
  porCategoria(itens) {
    const mapa = new Map();
    itens.forEach((i) => {
      if (!mapa.has(i.categoria)) {
        mapa.set(i.categoria, { categoria: i.categoria, qtd: 0, erros: 0, errosNovos: 0, somaAprov: 0, qtdAprov: 0 });
      }
      const g = mapa.get(i.categoria);
      g.qtd++;
      g.erros += i.erros;
      g.errosNovos += i.errosNovos;
      if (i.aproveitamento != null) {
        g.somaAprov += i.aproveitamento;
        g.qtdAprov++;
      }
    });
    return Array.from(mapa.values())
      .map((g) => ({
        ...g,
        mediaAprov: g.qtdAprov ? g.somaAprov / g.qtdAprov : null,
        mediaDesp: g.qtdAprov ? 100 - g.somaAprov / g.qtdAprov : null,
      }))
      .sort((a, b) => b.qtd - a.qtd || a.categoria.localeCompare(b.categoria, 'pt-BR'));
  },

  /* Aproveitamento agrupado por móvel (nome do serviço) ou por categoria */
  aproveitamentoAgrupado(itens, agrupamento) {
    const mapa = new Map();
    itens
      .filter((i) => i.aproveitamento != null)
      .forEach((i) => {
        const chave = agrupamento === 'categoria' ? i.categoria : (i.nome || '(sem nome)').trim().toUpperCase();
        if (!mapa.has(chave)) mapa.set(chave, { grupo: chave, qtd: 0, soma: 0, min: Infinity, max: -Infinity });
        const g = mapa.get(chave);
        g.qtd++;
        g.soma += i.aproveitamento;
        g.min = Math.min(g.min, i.aproveitamento);
        g.max = Math.max(g.max, i.aproveitamento);
      });
    return Array.from(mapa.values())
      .map((g) => ({ ...g, media: g.soma / g.qtd, desperdicio: 100 - g.soma / g.qtd }))
      .sort((a, b) => b.qtd - a.qtd || a.grupo.localeCompare(b.grupo, 'pt-BR'));
  },

  totais(itens) {
    const comAprov = itens.filter((i) => i.aproveitamento != null);
    return {
      qtd: itens.length,
      erros: itens.reduce((s, i) => s + i.erros, 0),
      errosNovos: itens.reduce((s, i) => s + i.errosNovos, 0),
      noPrazo: itens.filter((i) => this.situacaoPrazo(i) === 'No prazo').length,
      atrasados: itens.filter((i) => this.situacaoPrazo(i) === 'Atrasado').length,
      semPrazo: itens.filter((i) => this.situacaoPrazo(i) === 'Sem data programada').length,
      mediaAprov: comAprov.length ? comAprov.reduce((s, i) => s + i.aproveitamento, 0) / comAprov.length : null,
      qtdAprov: comAprov.length,
    };
  },

  /* Funcionários pra escolher nos filtros: todo mundo do tipo
     Funcionário + quem mais tiver algum item concluído (ex: o
     próprio Admin, se ele se atribuiu serviços). */
  async funcionarios(itens) {
    const usuarios = await DB.getAll('usuarios');
    const comItens = new Set((itens || []).map((i) => i.funcionarioId).filter(Boolean));
    return usuarios
      .filter((u) => u.tipo === 'funcionario' || comItens.has(u.id))
      // funcionários primeiro; Admin/PCP/MKT com itens vêm depois
      .sort((a, b) => {
        const pa = a.tipo === 'funcionario' ? 0 : 1;
        const pb = b.tipo === 'funcionario' ? 0 : 1;
        if (pa !== pb) return pa - pb;
        return (a.nome || '').localeCompare(b.nome || '', 'pt-BR');
      });
  },

  /* ---------- períodos ---------- */

  async periodo(tipo, ref, inicioStr, fimStr) {
    const d = new Date(ref);
    if (tipo === 'semana') {
      const idx = await Metrics.indiceSemana(ref);
      const r = await Metrics.rangeDaSemanaPorIndice(idx);
      return { inicio: r.inicio, fim: r.fim, rotulo: `Semana ${formatarDataCurta(r.inicio)} a ${formatarDataCurta(r.fim - 1)}` };
    }
    if (tipo === 'mes') {
      const inicio = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
      const fim = new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime();
      return { inicio, fim, rotulo: `${MESES_PT[d.getMonth()]} de ${d.getFullYear()}` };
    }
    if (tipo === 'ano') {
      const inicio = new Date(d.getFullYear(), 0, 1).getTime();
      const fim = new Date(d.getFullYear() + 1, 0, 1).getTime();
      return { inicio, fim, rotulo: `Ano de ${d.getFullYear()}` };
    }
    if (tipo === 'intervalo') {
      const ini = Const.inputDateParaTimestamp(inicioStr);
      const fimDia = Const.inputDateParaTimestamp(fimStr);
      if (!ini || !fimDia || fimDia < ini) return { inicio: null, fim: null, rotulo: 'Intervalo incompleto', invalido: true };
      const fim = fimDia + 24 * 60 * 60 * 1000;
      return { inicio: ini, fim, rotulo: `${formatarDataCurta(ini)} a ${formatarDataCurta(fimDia)}` };
    }
    return { inicio: null, fim: null, rotulo: 'Todo o histórico' };
  },

  navegar(tipo, ref, direcao) {
    const d = new Date(ref);
    if (tipo === 'semana') return ref + direcao * 7 * 24 * 60 * 60 * 1000;
    if (tipo === 'mes') return new Date(d.getFullYear(), d.getMonth() + direcao, 15).getTime();
    if (tipo === 'ano') return new Date(d.getFullYear() + direcao, 6, 1).getTime();
    return ref;
  },

  async periodoEhAtual(tipo, ref) {
    if (tipo === 'semana') return (await Metrics.indiceSemana(ref)) >= (await Metrics.indiceSemana(Date.now()));
    const d = new Date(ref);
    const h = new Date();
    if (tipo === 'mes') return d.getFullYear() * 12 + d.getMonth() >= h.getFullYear() * 12 + h.getMonth();
    if (tipo === 'ano') return d.getFullYear() >= h.getFullYear();
    return true;
  },

  /* Faixas de tempo pra gráficos de evolução */
  async faixasSemanais(qtd, refFimTs) {
    const idxFim = await Metrics.indiceSemana(refFimTs);
    const faixas = [];
    for (let i = qtd - 1; i >= 0; i--) {
      const r = await Metrics.rangeDaSemanaPorIndice(idxFim - i);
      faixas.push({ inicio: r.inicio, fim: r.fim, rotulo: formatarDataCurta(r.inicio).slice(0, 5), tipo: 'semana', indice: idxFim - i });
    }
    return faixas;
  },

  faixasMensais(qtd, refFimTs) {
    const d = new Date(refFimTs);
    const faixas = [];
    for (let i = qtd - 1; i >= 0; i--) {
      const ini = new Date(d.getFullYear(), d.getMonth() - i, 1);
      const fim = new Date(d.getFullYear(), d.getMonth() - i + 1, 1);
      faixas.push({
        inicio: ini.getTime(),
        fim: fim.getTime(),
        rotulo: `${MESES_CURTOS[ini.getMonth()]}/${String(ini.getFullYear()).slice(2)}`,
        tipo: 'mes',
      });
    }
    return faixas;
  },

  /* Nota média e %Meta média de um funcionário num período, usando o
     cálculo OFICIAL (metrics.js) — média das semanas que começam
     dentro do período, pulando semanas de férias. */
  async indicadoresPeriodo(funcionarioId, inicio, fim) {
    const pesos = await Metrics.pesos();
    const eventos = await Metrics.eventosConcluidosDoFuncionario(funcionarioId);
    const ferias = await Metrics.feriasDoFuncionario(funcionarioId);
    const agora = Date.now();
    let iniTs = inicio;
    if (iniTs == null) {
      iniTs = eventos.length ? Math.min(...eventos.map((e) => e.dataFinal)) : agora;
    }
    const fimTs = Math.min(fim == null ? agora + 1 : fim, agora + 7 * 24 * 60 * 60 * 1000);
    const idxIni = await Metrics.indiceSemana(iniTs);
    const idxFim = await Metrics.indiceSemana(fimTs - 1);

    let somaNota = 0;
    let somaPct = 0;
    let contadas = 0;
    // igual à planilha: entra a semana cujo INÍCIO cai dentro do período
    // (sem período definido = todo o histórico, desde a 1ª semana)
    for (let i = idxIni; i <= idxFim && i - idxIni < 520; i++) {
      const r = await Metrics.rangeDaSemanaPorIndice(i);
      if (inicio != null && r.inicio < iniTs) continue;
      if (r.inicio >= fimTs) continue;
      if (r.inicio > agora) continue;
      const semana = await Metrics.calcularSemanaPorIndice(eventos, i, pesos, ferias);
      if (semana.emFerias) continue;
      const meta = await Metrics.calcularMetaPorIndice(eventos, i, pesos, ferias);
      const pct = await Metrics.calcularPctMeta(semana, meta, pesos);
      somaNota += semana.nota;
      somaPct += pct;
      contadas++;
    }
    return {
      notaMedia: contadas ? somaNota / contadas : null,
      pctMetaMedia: contadas ? somaPct / contadas : null,
      semanas: contadas,
    };
  },
};

function formatarDataCurta(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

function formatarNumero(v, casas = 1) {
  if (v == null || isNaN(v)) return '—';
  return Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: casas });
}

function formatarPct(v, casas = 1) {
  if (v == null || isNaN(v)) return '—';
  return `${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })}%`;
}

window.Analise = Analise;
