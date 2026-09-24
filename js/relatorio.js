/* =========================================================
   relatorio.js — Relatório em PDF + Exportar planilha (só Admin)

   - Escolhe período (Semana / Mês / Ano / Intervalo), funcionário
     (um ou todos), categoria, material e nome do móvel.
   - Aproveitamento/Desperdício agrupado por MÓVEL (ex: só "SOFÁ
     MARROCOS") ou por CATEGORIA inteira — escolhido na hora.
   - Seleção manual: busca + caixinhas pra escolher item por item o
     que entra, em vez de sempre ser o período inteiro.
   - PDF: gerado pela impressão do navegador (window.print), com as
     páginas montadas aqui mesmo (cabeçalho com a logo, rodapé
     "Aplicativo desenvolvido por Rodolfo Gaipo" e número de página
     quando passa de uma folha). Sem biblioteca externa.
   - Exportar: mesmos filtros, em .xlsx ou .csv (exportar.js).
   ========================================================= */

const RelatorioView = {
  aba: 'relatorio', // 'relatorio' | 'comparar'
  periodoTipo: 'mes', // 'semana' | 'mes' | 'ano' | 'intervalo'
  dataReferencia: Date.now(),
  inicioStr: '',
  fimStr: '',
  funcionarioId: '', // '' = todos
  categoria: '',
  material: '',
  nome: '',
  agrupamento: 'movel', // 'movel' | 'categoria'
  incluirLista: true,
  selecaoManual: false,
  selecionados: new Set(),
  buscaSelecao: '',
  status: '',
};

async function renderRelatorio(view) {
  const st = RelatorioView;
  view.innerHTML = `
    <h2 class="section-title">Relatório</h2>
    <p class="section-sub">Relatório em PDF, exportação de planilha e comparação de meses</p>
    <div style="display:flex; gap:8px; margin-bottom:18px; flex-wrap:wrap">
      <button class="btn ${st.aba === 'relatorio' ? 'btn--primary' : 'btn--ghost'}" data-rel-aba="relatorio">PDF e planilha</button>
      <button class="btn ${st.aba === 'comparar' ? 'btn--primary' : 'btn--ghost'}" data-rel-aba="comparar">Comparar meses</button>
    </div>
    <div id="rel-conteudo"><div class="wip">${ICONS.wip}<b>Carregando…</b></div></div>
  `;
  view.querySelectorAll('[data-rel-aba]').forEach((btn) =>
    btn.addEventListener('click', () => {
      st.aba = btn.dataset.relAba;
      renderRelatorio(view);
    })
  );
  const cont = document.getElementById('rel-conteudo');
  if (st.aba === 'comparar') return renderCompararMeses(cont);
  return renderRelatorioFiltros(cont);
}

/* Junta tudo que o relatório precisa a partir dos filtros atuais */
async function dadosDoRelatorio() {
  const st = RelatorioView;
  const itensTodos = await Analise.itensConcluidos();
  const periodo = await Analise.periodo(st.periodoTipo, st.dataReferencia, st.inicioStr, st.fimStr);
  const funcionarios = await Analise.funcionarios(itensTodos);
  const filtrosSemPeriodo = { funcionarioId: st.funcionarioId || null, categoria: st.categoria || null, material: st.material || null, nome: st.nome };
  const base = periodo.invalido ? [] : Analise.filtrar(itensTodos, { ...filtrosSemPeriodo, inicio: periodo.inicio, fim: periodo.fim });
  const finais = st.selecaoManual ? base.filter((i) => st.selecionados.has(i.id)) : base;
  const funcionario = st.funcionarioId ? funcionarios.find((f) => f.id === st.funcionarioId) || null : null;
  return { itensTodos, periodo, funcionarios, filtrosSemPeriodo, base, finais, funcionario };
}

function descricaoFiltros(d, comData) {
  const st = RelatorioView;
  const partes = [`Período: ${d.periodo.rotulo}`, `Funcionário: ${d.funcionario ? d.funcionario.nome : 'Todos'}`];
  if (st.categoria) partes.push(`Categoria: ${st.categoria}`);
  if (st.material) partes.push(`Material: ${st.material}`);
  if (st.nome && st.nome.trim()) partes.push(`Nome contém: "${st.nome.trim()}"`);
  if (st.selecaoManual) partes.push(`Seleção manual: ${d.finais.length} item(ns)`);
  if (comData) partes.push(`Gerado em ${Const.formatarDataHora(Date.now())}`);
  return partes.join(' | ');
}

/* ---------------- TELA DE FILTROS ---------------- */

async function renderRelatorioFiltros(cont) {
  const st = RelatorioView;
  const d = await dadosDoRelatorio();
  const ehAtual = await Analise.periodoEhAtual(st.periodoTipo, st.dataReferencia);

  const categoriasCad = (await Categorias.listar()).map((c) => c.nome);
  const categoriasItens = d.itensTodos.map((i) => i.categoria);
  const categorias = Array.from(new Set([...categoriasCad, CATEGORIA_ABA_CORTE, ...categoriasItens])).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const materiaisNomes = Array.from(
    new Set([...(await Materiais.listar()).map((m) => m.nome), ...d.itensTodos.map((i) => i.materialNome).filter(Boolean)])
  ).sort((a, b) => a.localeCompare(b, 'pt-BR'));

  const grupos = Analise.aproveitamentoAgrupado(d.finais, st.agrupamento);

  cont.innerHTML = `
    <div class="card">
      <h3 class="section-title" style="font-size:16px">Período</h3>
      <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap; margin-top:10px">
        <div class="chips">
          ${[
            ['semana', 'Semana'],
            ['mes', 'Mês'],
            ['ano', 'Ano'],
            ['intervalo', 'Intervalo'],
          ]
            .map(([v, l]) => `<button class="chip ${st.periodoTipo === v ? 'chip--on' : ''}" data-rel-periodo="${v}">${l}</button>`)
            .join('')}
        </div>
        ${
          st.periodoTipo === 'intervalo'
            ? `<div style="display:flex; gap:8px; flex-wrap:wrap">
                <div class="field" style="margin:0"><input id="rel-ini" type="date" value="${escapeHtml(st.inicioStr)}" aria-label="Data inicial" /></div>
                <div class="field" style="margin:0"><input id="rel-fim" type="date" value="${escapeHtml(st.fimStr)}" aria-label="Data final" /></div>
              </div>`
            : `<div style="display:flex; align-items:center; gap:10px">
                <button class="topbar__icon-btn" id="rel-anterior" style="background:var(--paper-dim)" aria-label="Período anterior">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><path d="M15 18l-6-6 6-6"/></svg>
                </button>
                <span style="font-weight:600; font-size:14px; min-width:150px; text-align:center">${escapeHtml(d.periodo.rotulo)}</span>
                <button class="topbar__icon-btn" id="rel-proximo" style="background:var(--paper-dim)" aria-label="Próximo período" ${ehAtual ? 'disabled' : ''}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><path d="M9 18l6-6-6-6"/></svg>
                </button>
              </div>`
        }
      </div>
      ${d.periodo.invalido ? '<div class="row__meta" style="margin-top:8px; color:var(--danger-fg)">Escolha a data inicial e a data final.</div>' : ''}
    </div>

    <div class="card">
      <h3 class="section-title" style="font-size:16px">Filtros</h3>
      <div class="rel-grid" style="margin-top:10px">
        <div class="field">
          <label for="rel-func">Funcionário</label>
          <select id="rel-func">
            <option value="">Todos</option>
            ${d.funcionarios.map((f) => `<option value="${f.id}" ${st.funcionarioId === f.id ? 'selected' : ''}>${escapeHtml(f.nome)}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label for="rel-cat">Categoria</label>
          <select id="rel-cat">
            <option value="">Todas</option>
            ${categorias.map((c) => `<option value="${escapeHtml(c)}" ${st.categoria === c ? 'selected' : ''}>${escapeHtml(c)}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label for="rel-mat">Material</label>
          <select id="rel-mat">
            <option value="">Todos</option>
            ${materiaisNomes.map((m) => `<option value="${escapeHtml(m)}" ${st.material === m ? 'selected' : ''}>${escapeHtml(m)}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label for="rel-nome">Nome do móvel contém</label>
          <input id="rel-nome" value="${escapeHtml(st.nome)}" placeholder="Ex: SOFÁ MARROCOS" autocomplete="off" />
        </div>
      </div>
    </div>

    <div class="card">
      <h3 class="section-title" style="font-size:16px">Aproveitamento e desperdício</h3>
      <p class="section-sub" style="margin-bottom:10px">Como agrupar no relatório</p>
      <div class="chips">
        <button class="chip ${st.agrupamento === 'movel' ? 'chip--on' : ''}" data-rel-agrup="movel">Por móvel</button>
        <button class="chip ${st.agrupamento === 'categoria' ? 'chip--on' : ''}" data-rel-agrup="categoria">Por categoria</button>
      </div>
      <div class="row__meta" style="margin-top:10px">${
        grupos.length
          ? `${grupos.length} ${st.agrupamento === 'movel' ? 'móvel(is)' : 'categoria(s)'} com % de aproveitamento nos itens escolhidos.`
          : 'Nenhum item com % de aproveitamento nos itens escolhidos — essa parte não aparece no relatório.'
      }</div>
    </div>

    <div class="card">
      <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:10px; flex-wrap:wrap">
        <div>
          <h3 class="section-title" style="font-size:16px">Itens do relatório</h3>
          <p class="section-sub" style="margin:0">${
            st.selecaoManual
              ? `${d.finais.length} de ${d.base.length} item(ns) escolhidos a dedo`
              : `${d.base.length} item(ns) concluídos e aprovados nesse período e filtros`
          }</p>
        </div>
        <button class="btn ${st.selecaoManual ? 'btn--primary' : 'btn--ghost'}" id="rel-toggle-manual" style="padding:8px 14px; font-size:13px">${st.selecaoManual ? 'Usar o período inteiro' : 'Escolher itens manualmente'}</button>
      </div>
      ${
        st.selecaoManual
          ? `<div class="field" style="margin:14px 0 10px">
              <input id="rel-busca-sel" value="${escapeHtml(st.buscaSelecao)}" placeholder="Buscar por nome, categoria, material ou funcionário…" autocomplete="off" />
            </div>
            <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:10px">
              <button class="btn btn--ghost" id="rel-marcar-visiveis" style="padding:6px 12px; font-size:13px">Marcar os da busca</button>
              <button class="btn btn--ghost" id="rel-desmarcar-todos" style="padding:6px 12px; font-size:13px">Desmarcar todos</button>
            </div>
            <div id="rel-lista-sel"></div>`
          : ''
      }
      <label class="perm-item" style="margin-top:14px">
        <input type="checkbox" id="rel-incluir-lista" ${st.incluirLista ? 'checked' : ''} />
        <span>Incluir a lista detalhada item por item no PDF</span>
      </label>
    </div>

    <div class="card">
      <h3 class="section-title" style="font-size:16px">Gerar</h3>
      <p class="section-sub">${escapeHtml(descricaoFiltros(d, false))}</p>
      <div style="display:flex; gap:8px; flex-wrap:wrap">
        <button class="btn btn--ghost" id="rel-visualizar" ${d.finais.length ? '' : 'disabled'}>Visualizar</button>
        <button class="btn btn--primary" id="rel-pdf" ${d.finais.length ? '' : 'disabled'}>Gerar PDF</button>
        <button class="btn btn--metal" id="rel-xlsx" ${d.finais.length ? '' : 'disabled'}>Exportar Excel (.xlsx)</button>
        <button class="btn btn--ghost" id="rel-csv" ${d.finais.length ? '' : 'disabled'}>Exportar CSV</button>
      </div>
      <div class="row__meta" id="rel-status" style="margin-top:10px">${
        d.finais.length ? escapeHtml(st.status || '') : 'Nenhum item pra gerar — ajuste o período, os filtros ou a seleção.'
      }</div>
      <div class="row__meta" style="margin-top:6px">No PDF: na janela de impressão, escolha "Salvar como PDF". Planilha: só os dados, sem logo, prontos pro Excel.</div>
    </div>

    <div id="rel-previa"></div>
  `;

  const rerender = () => renderRelatorioFiltros(cont);

  cont.querySelectorAll('[data-rel-periodo]').forEach((btn) =>
    btn.addEventListener('click', () => {
      st.periodoTipo = btn.dataset.relPeriodo;
      st.dataReferencia = Date.now();
      if (st.periodoTipo === 'intervalo' && !st.inicioStr) {
        const hoje = new Date();
        st.fimStr = dataParaInputDate(hoje.getTime());
        st.inicioStr = dataParaInputDate(new Date(hoje.getFullYear(), hoje.getMonth(), 1).getTime());
      }
      st.status = '';
      rerender();
    })
  );
  const ant = document.getElementById('rel-anterior');
  if (ant) ant.addEventListener('click', () => ((st.dataReferencia = Analise.navegar(st.periodoTipo, st.dataReferencia, -1)), (st.status = ''), rerender()));
  const prox = document.getElementById('rel-proximo');
  if (prox) prox.addEventListener('click', () => ((st.dataReferencia = Analise.navegar(st.periodoTipo, st.dataReferencia, 1)), (st.status = ''), rerender()));
  const ini = document.getElementById('rel-ini');
  if (ini) ini.addEventListener('change', () => ((st.inicioStr = ini.value), rerender()));
  const fim = document.getElementById('rel-fim');
  if (fim) fim.addEventListener('change', () => ((st.fimStr = fim.value), rerender()));

  document.getElementById('rel-func').addEventListener('change', (ev) => ((st.funcionarioId = ev.target.value), rerender()));
  document.getElementById('rel-cat').addEventListener('change', (ev) => ((st.categoria = ev.target.value), rerender()));
  document.getElementById('rel-mat').addEventListener('change', (ev) => ((st.material = ev.target.value), rerender()));
  const nomeInput = document.getElementById('rel-nome');
  nomeInput.addEventListener('change', () => ((st.nome = nomeInput.value), rerender()));
  nomeInput.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') nomeInput.blur();
  });

  cont.querySelectorAll('[data-rel-agrup]').forEach((btn) =>
    btn.addEventListener('click', () => ((st.agrupamento = btn.dataset.relAgrup), rerender()))
  );
  document.getElementById('rel-incluir-lista').addEventListener('change', (ev) => (st.incluirLista = ev.target.checked));

  document.getElementById('rel-toggle-manual').addEventListener('click', () => {
    st.selecaoManual = !st.selecaoManual;
    rerender();
  });

  if (st.selecaoManual) {
    const itensVisiveis = () => {
      const alvo = Analise.normaliza(st.buscaSelecao);
      return d.base.filter(
        (i) =>
          !alvo ||
          Analise.normaliza(i.nome).includes(alvo) ||
          Analise.normaliza(i.categoria).includes(alvo) ||
          Analise.normaliza(i.materialNome).includes(alvo) ||
          Analise.normaliza(i.funcionarioNome).includes(alvo) ||
          Analise.normaliza(i.numeroPedido).includes(alvo)
      );
    };
    const desenharLista = () => {
      const lista = itensVisiveis().slice().reverse(); // mais recentes primeiro
      const el = document.getElementById('rel-lista-sel');
      if (!el) return;
      if (lista.length === 0) {
        el.innerHTML = '<div class="row__meta">Nenhum item com essa busca.</div>';
        return;
      }
      el.innerHTML = `
        <div class="card" style="padding:0; max-height:420px; overflow-y:auto">
          ${lista
            .map(
              (i) => `
            <label class="row rel-sel-item">
              <input type="checkbox" data-rel-sel="${i.id}" ${st.selecionados.has(i.id) ? 'checked' : ''} />
              <div class="row__main" style="flex:1; min-width:0">
                <div class="row__title">${escapeHtml(i.nome || '(sem nome)')}</div>
                <div class="row__meta">${escapeHtml(i.categoria)} · ${escapeHtml(i.funcionarioNome || '—')} · ${formatarDataCurta(i.dataFinal)}${
                  i.materialNome ? ` · ${escapeHtml(i.materialNome)}` : ''
                }${i.aproveitamento != null ? ` · ${formatarPct(i.aproveitamento)}` : ''}</div>
              </div>
            </label>`
            )
            .join('')}
        </div>`;
      el.querySelectorAll('[data-rel-sel]').forEach((chk) =>
        chk.addEventListener('change', () => {
          if (chk.checked) st.selecionados.add(chk.dataset.relSel);
          else st.selecionados.delete(chk.dataset.relSel);
          atualizarContagemSelecao(d);
        })
      );
    };
    const busca = document.getElementById('rel-busca-sel');
    busca.addEventListener('input', () => {
      st.buscaSelecao = busca.value;
      desenharLista();
    });
    document.getElementById('rel-marcar-visiveis').addEventListener('click', () => {
      itensVisiveis().forEach((i) => st.selecionados.add(i.id));
      rerender();
    });
    document.getElementById('rel-desmarcar-todos').addEventListener('click', () => {
      st.selecionados.clear();
      rerender();
    });
    desenharLista();
  }

  const setStatus = (msg) => {
    st.status = msg;
    const el = document.getElementById('rel-status');
    if (el) el.textContent = msg;
  };

  const btnVis = document.getElementById('rel-visualizar');
  btnVis.addEventListener('click', async () => {
    setStatus('Montando as páginas…');
    const dados = await dadosDoRelatorio();
    if (!dados.finais.length) return rerender();
    const n = await montarPaginasRelatorio(dados);
    mostrarPreviaRelatorio(document.getElementById('rel-previa'));
    setStatus(`Prévia pronta: ${n} página(s).`);
  });

  document.getElementById('rel-pdf').addEventListener('click', async () => {
    setStatus('Montando as páginas…');
    const dados = await dadosDoRelatorio();
    if (!dados.finais.length) return rerender();
    const n = await montarPaginasRelatorio(dados);
    setStatus(`${n} página(s). Abrindo a impressão — escolha "Salvar como PDF".`);
    imprimirRelatorio();
  });

  document.getElementById('rel-xlsx').addEventListener('click', async () => {
    const dados = await dadosDoRelatorio();
    if (!dados.finais.length) return rerender();
    Exportar.baixar(Exportar.gerarXLSX(dados.finais, descricaoFiltros(dados, true)), Exportar.nomeArquivo('xlsx'));
    setStatus(`Planilha .xlsx com ${dados.finais.length} linha(s) baixada.`);
  });

  document.getElementById('rel-csv').addEventListener('click', async () => {
    const dados = await dadosDoRelatorio();
    if (!dados.finais.length) return rerender();
    Exportar.baixar(Exportar.gerarCSV(dados.finais, descricaoFiltros(dados, true)), Exportar.nomeArquivo('csv'));
    setStatus(`Arquivo .csv com ${dados.finais.length} linha(s) baixado.`);
  });
}

function atualizarContagemSelecao(d) {
  const st = RelatorioView;
  const n = d.base.filter((i) => st.selecionados.has(i.id)).length;
  const sub = document.querySelector('#rel-toggle-manual')?.parentElement?.querySelector('.section-sub');
  if (sub) sub.textContent = `${n} de ${d.base.length} item(ns) escolhidos a dedo`;
  ['rel-visualizar', 'rel-pdf', 'rel-xlsx', 'rel-csv'].forEach((id) => {
    const b = document.getElementById(id);
    if (b) b.disabled = n === 0;
  });
}

/* ---------------- MONTAGEM DAS PÁGINAS ---------------- */

function garantirPrintRoot() {
  let root = document.getElementById('print-root');
  if (!root) {
    root = document.createElement('div');
    root.id = 'print-root';
    document.body.appendChild(root);
  }
  return root;
}

async function faixasDaEvolucao(periodo) {
  const st = RelatorioView;
  if (st.periodoTipo === 'semana') return Analise.faixasSemanais(8, periodo.inicio);
  if (st.periodoTipo === 'mes') return Analise.faixasMensais(6, periodo.inicio);
  if (st.periodoTipo === 'ano') return Analise.faixasMensais(12, new Date(new Date(periodo.inicio).getFullYear(), 11, 1).getTime());
  const dias = (periodo.fim - periodo.inicio) / 86400000;
  if (dias <= 84) return Analise.faixasSemanais(Math.max(1, Math.ceil(dias / 7)), periodo.fim - 1);
  const ini = new Date(periodo.inicio);
  const fimD = new Date(periodo.fim - 1);
  const meses = (fimD.getFullYear() - ini.getFullYear()) * 12 + fimD.getMonth() - ini.getMonth() + 1;
  return Analise.faixasMensais(Math.min(24, meses), periodo.fim - 1);
}

async function montarPaginasRelatorio(d) {
  const st = RelatorioView;
  const finais = d.finais;
  const totais = Analise.totais(finais);
  const blocos = [];
  const secao = (titulo, sub) => blocos.push({ tipo: 'titulo', html: `<h2 class="rp-secao">${escapeHtml(titulo)}</h2>${sub ? `<p class="rp-nota">${escapeHtml(sub)}</p>` : ''}` });
  const html = (h) => blocos.push({ tipo: 'html', html: h });
  const tabela = (cabecalho, linhas, classe) => blocos.push({ tipo: 'tabela', cabecalho, linhas, classe: classe || '' });
  const caixa = (valor, rotulo) => `<div class="rp-caixa"><div class="rp-caixa__v">${valor}</div><div class="rp-caixa__l">${escapeHtml(rotulo)}</div></div>`;

  /* 1. Resumo */
  secao('Resumo');
  if (d.funcionario) {
    const ind = await Analise.indicadoresPeriodo(d.funcionario.id, d.periodo.inicio, d.periodo.fim);
    html(`<div class="rp-caixas">
      ${caixa(totais.qtd, 'Projetos')}
      ${caixa(ind.notaMedia != null ? formatarNumero(ind.notaMedia, 0) : '—', 'Nota média')}
      ${caixa(ind.pctMetaMedia != null ? `${formatarNumero(ind.pctMetaMedia * 100, 0)}%` : '—', '% da Meta')}
      ${caixa(totais.erros, 'Erros')}
      ${caixa(totais.errosNovos, 'Erros novos')}
      ${caixa(totais.mediaAprov != null ? formatarPct(totais.mediaAprov) : '—', 'Aproveitamento médio')}
    </div>`);
    html(`<p class="rp-nota">Nota e % da Meta seguem o cálculo oficial do app (média das semanas do período, sem semanas de férias), com todas as entregas aprovadas — não mudam com os filtros de categoria, material ou seleção manual.</p>`);
  } else {
    const idsComItens = new Set(finais.map((i) => i.funcionarioId).filter(Boolean));
    const pessoas = d.funcionarios.filter((f) => idsComItens.has(f.id) || f.tipo === 'funcionario');
    html(`<div class="rp-caixas">
      ${caixa(totais.qtd, 'Projetos')}
      ${caixa(idsComItens.size, 'Pessoas com entregas')}
      ${caixa(totais.erros, 'Erros')}
      ${caixa(totais.errosNovos, 'Erros novos')}
      ${caixa(totais.qtd ? `${formatarNumero((totais.noPrazo / Math.max(1, totais.noPrazo + totais.atrasados)) * 100, 0)}%` : '—', 'No prazo (com data)')}
      ${caixa(totais.mediaAprov != null ? formatarPct(totais.mediaAprov) : '—', 'Aproveitamento médio')}
    </div>`);
    const linhas = [];
    for (const p of pessoas) {
      const itens = finais.filter((i) => i.funcionarioId === p.id);
      const t = Analise.totais(itens);
      const ind = await Analise.indicadoresPeriodo(p.id, d.periodo.inicio, d.periodo.fim);
      linhas.push(`<tr><td>${escapeHtml(p.nome)}</td><td class="num">${t.qtd}</td><td class="num">${ind.notaMedia != null ? formatarNumero(ind.notaMedia, 0) : '—'}</td><td class="num">${
        ind.pctMetaMedia != null ? formatarNumero(ind.pctMetaMedia * 100, 0) + '%' : '—'
      }</td><td class="num">${t.erros}</td><td class="num">${t.errosNovos}</td><td class="num">${formatarPct(t.mediaAprov)}</td></tr>`);
    }
    const semDono = finais.filter((i) => !i.funcionarioId || !pessoas.some((p) => p.id === i.funcionarioId));
    if (semDono.length) {
      const t = Analise.totais(semDono);
      linhas.push(`<tr><td>Outros / sem funcionário</td><td class="num">${t.qtd}</td><td class="num">—</td><td class="num">—</td><td class="num">${t.erros}</td><td class="num">${t.errosNovos}</td><td class="num">${formatarPct(t.mediaAprov)}</td></tr>`);
    }
    tabela('<tr><th>Funcionário</th><th class="num">Projetos</th><th class="num">Nota média</th><th class="num">% da Meta</th><th class="num">Erros</th><th class="num">Erros novos</th><th class="num">Aprov. médio</th></tr>', linhas);
    html(`<p class="rp-nota">Nota e % da Meta seguem o cálculo oficial do app (média das semanas do período, sem férias) e não mudam com os filtros de categoria, material ou seleção manual.</p>`);
  }

  /* 2. Evolução */
  const faixas = await faixasDaEvolucao(d.periodo);
  const baseEvolucao = Analise.filtrar(d.itensTodos, d.filtrosSemPeriodo);
  const qtdPorFaixa = faixas.map((f) => baseEvolucao.filter((i) => i.dataFinal >= f.inicio && i.dataFinal < f.fim).length);
  secao(
    faixas[0] && faixas[0].tipo === 'semana' ? `Evolução nas últimas ${faixas.length} semanas` : `Evolução nos últimos ${faixas.length} meses`,
    'Projetos concluídos em cada período, com os mesmos filtros de funcionário, categoria, material e nome (sem a seleção manual).'
  );
  html(`<div class="rp-grafico">${barrasVerticaisSVG(faixas.map((f) => f.rotulo), qtdPorFaixa, { altura: 190, largura: 640 })}</div>`);
  if (d.funcionario) {
    const pcts = [];
    for (const f of faixas) {
      const ind = await Analise.indicadoresPeriodo(d.funcionario.id, f.inicio, f.fim);
      pcts.push(ind.pctMetaMedia != null ? Math.round(ind.pctMetaMedia * 100) : null);
    }
    if (pcts.some((v) => v != null)) {
      html(`<div class="rp-grafico"><div class="rp-grafico__titulo">% da Meta — ${escapeHtml(primeiroNome(d.funcionario.nome))}</div>${graficoLinhaSVG(
        faixas.map((f) => f.rotulo),
        [{ nome: '% da Meta', valores: pcts, cor: '#7A1F2B' }],
        { sufixo: '%', minMaximo: 100, semLegenda: true, altura: 170, largura: 640 }
      )}</div>`);
    }
  }

  /* 3. Prazo / Atraso / Erros */
  secao('Prazo, atraso e erros', 'Itens incluídos no relatório.');
  html(`<div class="rp-duas">
    <div>${barrasHorizontaisSVG(
      [
        { rotulo: 'No prazo', valor: totais.noPrazo, cor: '#1F7A4D' },
        { rotulo: 'Atrasado', valor: totais.atrasados, cor: '#B0332B' },
        { rotulo: 'Sem data programada', valor: totais.semPrazo, cor: '#9CA0A4' },
      ],
      { colRotulo: 150, largura: 340, maxLargura: 400 }
    )}</div>
    <div>${barrasHorizontaisSVG(
      [
        { rotulo: 'Erros', valor: totais.erros, cor: '#7A1F2B' },
        { rotulo: 'Erros novos', valor: totais.errosNovos, cor: '#9A6B08' },
      ],
      { colRotulo: 150, largura: 340, maxLargura: 400 }
    )}</div>
  </div>`);
  const porCat = Analise.porCategoria(finais);
  tabela(
    '<tr><th>Categoria</th><th class="num">Qtde</th><th class="num">No prazo</th><th class="num">Atrasado</th><th class="num">Sem data</th><th class="num">Erros</th><th class="num">Erros novos</th></tr>',
    porCat.map((c) => {
      const itens = finais.filter((i) => i.categoria === c.categoria);
      const t = Analise.totais(itens);
      return `<tr><td>${escapeHtml(c.categoria)}</td><td class="num">${c.qtd}</td><td class="num">${t.noPrazo}</td><td class="num">${t.atrasados}</td><td class="num">${t.semPrazo}</td><td class="num">${c.erros}</td><td class="num">${c.errosNovos}</td></tr>`;
    })
  );

  /* 4. Aproveitamento / Desperdício */
  const grupos = Analise.aproveitamentoAgrupado(finais, st.agrupamento);
  if (grupos.length) {
    const rotuloAgr = st.agrupamento === 'movel' ? 'por móvel' : 'por categoria';
    secao(`Aproveitamento e desperdício ${rotuloAgr}`, 'Média do % de aproveitamento informado pelo programa de corte. Desperdício = 100% − aproveitamento.');
    const topo = grupos.slice(0, 15);
    html(`<div class="rp-grafico">${barrasHorizontaisSVG(
      topo.map((g) => ({ rotulo: g.grupo, valor: g.media, textoValor: `${formatarPct(g.media)} (${g.qtd})` })),
      { maximo: 100, colRotulo: 200, largura: 640, maxLargura: 680 }
    )}</div>`);
    tabela(
      `<tr><th>${st.agrupamento === 'movel' ? 'Móvel' : 'Categoria'}</th><th class="num">Itens</th><th class="num">Aproveitamento</th><th class="num">Desperdício</th><th class="num">Mín.</th><th class="num">Máx.</th></tr>`,
      grupos.map(
        (g) =>
          `<tr><td>${escapeHtml(g.grupo)}</td><td class="num">${g.qtd}</td><td class="num">${formatarPct(g.media)}</td><td class="num">${formatarPct(g.desperdicio)}</td><td class="num">${formatarPct(g.min)}</td><td class="num">${formatarPct(g.max)}</td></tr>`
      )
    );

    // cruzado com o tempo: média de aproveitamento dos maiores grupos em cada faixa
    const principais = grupos.slice(0, 4).map((g) => g.grupo);
    const chaveDe = (i) => (st.agrupamento === 'categoria' ? i.categoria : (i.nome || '(sem nome)').trim().toUpperCase());
    const comAprovTempo = baseEvolucao.filter((i) => i.aproveitamento != null);
    const series = principais.map((g, gi) => ({
      nome: g,
      cor: corDaSerie(gi),
      valores: faixas.map((f) => {
        const it = comAprovTempo.filter((i) => chaveDe(i) === g && i.dataFinal >= f.inicio && i.dataFinal < f.fim);
        return it.length ? Math.round((it.reduce((s, i) => s + i.aproveitamento, 0) / it.length) * 10) / 10 : null;
      }),
    }));
    if (series.some((s) => s.valores.filter((v) => v != null).length >= 1)) {
      html(`<div class="rp-grafico"><div class="rp-grafico__titulo">Aproveitamento médio ao longo do tempo (${rotuloAgr})</div>${graficoLinhaSVG(
        faixas.map((f) => f.rotulo),
        series,
        { sufixo: '%', minMaximo: 100, altura: 180, largura: 640 }
      )}</div>`);
    }
  }

  /* 5. Lista detalhada */
  if (st.incluirLista) {
    secao('Lista detalhada', `${finais.length} item(ns), do mais antigo para o mais recente.`);
    const mostrarFunc = !d.funcionario;
    tabela(
      `<tr><th>Data</th><th>Categoria</th><th>Nome</th><th>Nº ped.</th>${mostrarFunc ? '<th>Funcionário</th>' : ''}<th>Material</th><th>Prazo</th><th class="num">Erros</th><th class="num">E. novos</th><th class="num">Aprov.</th></tr>`,
      finais.map((i) => {
        const prazo = Analise.situacaoPrazo(i);
        return `<tr>
          <td class="nowrap">${formatarDataCurta(i.dataFinal)}</td>
          <td>${escapeHtml(i.categoria)}</td>
          <td>${escapeHtml(i.nome)}</td>
          <td>${escapeHtml(i.numeroPedido || '')}</td>
          ${mostrarFunc ? `<td>${escapeHtml(i.funcionarioNome || '—')}</td>` : ''}
          <td>${escapeHtml(i.materialNome || '')}${i.materialLargura != null && i.materialNome ? ` <span class="rp-fraco">${formatarLarguraMaterial(i.materialLargura)}</span>` : ''}</td>
          <td class="nowrap ${prazo === 'Atrasado' ? 'rp-ruim' : ''}">${prazo === 'Sem data programada' ? 'Sem data' : prazo}</td>
          <td class="num">${i.erros}</td>
          <td class="num">${i.errosNovos}</td>
          <td class="num">${i.aproveitamento != null ? formatarPct(i.aproveitamento) : ''}</td>
        </tr>`;
      }),
      'rp-tabela--lista'
    );
  }

  const cabecalho = {
    titulo: d.funcionario ? `Relatório de Produção — ${d.funcionario.nome}` : 'Relatório de Produção — Equipe',
    periodo: d.periodo.rotulo,
    detalhes: descricaoFiltros(d, false)
      .split(' | ')
      .filter((p) => !p.startsWith('Período:') && !p.startsWith('Funcionário:'))
      .join(' · '),
    geradoEm: Const.formatarDataHora(Date.now()),
  };

  const root = garantirPrintRoot();
  const n = paginarRelatorio(root, blocos, cabecalho);
  // espera a logo carregar antes de imprimir (já vem do cache do app)
  await Promise.all(
    Array.from(root.querySelectorAll('img')).map((img) => (img.complete ? Promise.resolve() : img.decode ? img.decode().catch(() => {}) : Promise.resolve()))
  );
  return n;
}

function criarPaginaRelatorio(primeira, cab) {
  const pg = document.createElement('section');
  pg.className = 'rp-pg';
  pg.innerHTML = `
    <div class="rp-faixa"></div>
    ${
      primeira
        ? `<header class="rp-cab">
            <div class="rp-marca">
              <img src="icons/icon-192.png" alt="" />
              <div>
                <div class="rp-app">Engenharia Aluminas</div>
                <div class="rp-app-sub">Relatório gerado em ${escapeHtml(cab.geradoEm)}</div>
              </div>
            </div>
            <div class="rp-cab__info">
              <div class="rp-titulo">${escapeHtml(cab.titulo)}</div>
              <div class="rp-periodo">${escapeHtml(cab.periodo)}</div>
              ${cab.detalhes ? `<div class="rp-detalhes">${escapeHtml(cab.detalhes)}</div>` : ''}
            </div>
          </header>`
        : `<header class="rp-cab rp-cab--mini">
            <div class="rp-marca"><img src="icons/icon-192.png" alt="" /><div class="rp-app">Engenharia Aluminas</div></div>
            <div class="rp-cab__info"><div class="rp-titulo">${escapeHtml(cab.titulo)}</div><div class="rp-periodo">${escapeHtml(cab.periodo)}</div></div>
          </header>`
    }
    <div class="rp-corpo"></div>
    <footer class="rp-rod">
      <span>Aplicativo desenvolvido por Rodolfo Gaipo</span>
      <span class="rp-num"></span>
    </footer>
  `;
  return pg;
}

/* Distribui os blocos em folhas A4 medindo de verdade o que cabe.
   Tabelas quebram entre linhas (repetindo o cabeçalho na folha
   seguinte) e um título nunca fica sozinho no pé da página. */
function paginarRelatorio(root, blocos, cab) {
  root.innerHTML = '';
  root.classList.add('medindo');
  const paginas = [];
  let corpo = null;

  const novaPagina = () => {
    const pg = criarPaginaRelatorio(paginas.length === 0, cab);
    root.appendChild(pg);
    paginas.push(pg);
    corpo = pg.querySelector('.rp-corpo');
  };
  const cabe = () => corpo.scrollHeight <= corpo.clientHeight + 1;
  const paraElemento = (h) => {
    const t = document.createElement('div');
    t.innerHTML = h;
    const frag = document.createDocumentFragment();
    const wrap = document.createElement('div');
    wrap.className = 'rp-bloco';
    while (t.firstChild) wrap.appendChild(t.firstChild);
    frag.appendChild(wrap);
    return wrap;
  };
  // se o último elemento da página é um título, ele vai junto pra próxima
  const levarTituloPendente = () => {
    const ultimo = corpo.lastElementChild;
    if (ultimo && ultimo.classList.contains('rp-bloco--titulo')) {
      ultimo.remove();
      return ultimo;
    }
    return null;
  };

  novaPagina();

  blocos.forEach((b) => {
    if (b.tipo === 'titulo' || b.tipo === 'html') {
      const el = paraElemento(b.html);
      if (b.tipo === 'titulo') el.classList.add('rp-bloco--titulo');
      corpo.appendChild(el);
      if (!cabe() && corpo.children.length > 1) {
        el.remove();
        const titulo = levarTituloPendente();
        novaPagina();
        if (titulo) corpo.appendChild(titulo);
        corpo.appendChild(el);
      }
      return;
    }

    // tabela
    const montarTabela = () => {
      const wrap = document.createElement('div');
      wrap.className = 'rp-bloco';
      wrap.innerHTML = `<table class="rp-tabela ${b.classe}"><thead>${b.cabecalho}</thead><tbody></tbody></table>`;
      corpo.appendChild(wrap);
      return wrap;
    };
    let wrap = montarTabela();
    let tbody = wrap.querySelector('tbody');
    const tmp = document.createElement('tbody');

    b.linhas.forEach((linhaHtml) => {
      tmp.innerHTML = linhaHtml;
      const tr = tmp.firstElementChild;
      if (!tr) return;
      tbody.appendChild(tr);
      if (cabe()) return;
      tr.remove();
      if (tbody.children.length === 0) {
        // nem a 1ª linha coube: a tabela inteira (e o título dela) vai pra próxima folha
        wrap.remove();
        const titulo = levarTituloPendente();
        if (corpo.children.length === 0 && !titulo) {
          // página já vazia — não adianta trocar, deixa a linha aqui mesmo
          wrap = montarTabela();
          tbody = wrap.querySelector('tbody');
          tbody.appendChild(tr);
          return;
        }
        novaPagina();
        if (titulo) corpo.appendChild(titulo);
      } else {
        novaPagina();
      }
      wrap = montarTabela();
      tbody = wrap.querySelector('tbody');
      tbody.appendChild(tr);
    });
  });

  const total = paginas.length;
  paginas.forEach((pg, i) => {
    const num = pg.querySelector('.rp-num');
    if (num) num.textContent = total > 1 ? `Página ${i + 1} de ${total}` : '';
  });
  root.classList.remove('medindo');
  return total;
}

function mostrarPreviaRelatorio(alvo) {
  if (!alvo) return;
  const root = document.getElementById('print-root');
  if (!root) return;
  const paginas = Array.from(root.querySelectorAll('.rp-pg'));
  alvo.innerHTML = `
    <div class="card" style="background:var(--paper-dim)">
      <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap; margin-bottom:12px">
        <h3 class="section-title" style="font-size:16px; margin:0">Prévia (${paginas.length} página${paginas.length > 1 ? 's' : ''})</h3>
        <button class="btn btn--primary" id="rel-previa-imprimir" style="padding:8px 14px; font-size:13px">Gerar PDF</button>
      </div>
      <div class="rp-previa"></div>
    </div>`;
  const cont = alvo.querySelector('.rp-previa');
  const larguraDisponivel = Math.max(200, cont.clientWidth);
  const larguraPagina = paginas[0] ? paginas[0].offsetWidth || 794 : 794;
  const alturaPagina = paginas[0] ? paginas[0].offsetHeight || 1119 : 1119;
  const escala = Math.min(1, larguraDisponivel / larguraPagina);
  paginas.forEach((pg) => {
    const slot = document.createElement('div');
    slot.className = 'rp-previa__slot';
    slot.style.width = `${larguraPagina * escala}px`;
    slot.style.height = `${alturaPagina * escala}px`;
    const clone = pg.cloneNode(true);
    clone.style.transform = `scale(${escala})`;
    clone.style.transformOrigin = 'top left';
    slot.appendChild(clone);
    cont.appendChild(slot);
  });
  document.getElementById('rel-previa-imprimir').addEventListener('click', imprimirRelatorio);
  alvo.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function imprimirRelatorio() {
  const root = document.getElementById('print-root');
  if (!root || !root.children.length) return;
  document.body.classList.add('imprimindo-relatorio');
  const limpar = () => {
    document.body.classList.remove('imprimindo-relatorio');
    window.removeEventListener('afterprint', limpar);
  };
  window.addEventListener('afterprint', limpar);
  // pequeno atraso: deixa o navegador aplicar a classe antes de abrir a impressão
  setTimeout(() => {
    window.print();
    // alguns navegadores de celular não disparam afterprint
    setTimeout(limpar, 60000);
  }, 60);
}
