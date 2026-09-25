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
  funcionarioId: '', // '' = todos (separado por pessoa) · '__equipe__' = equipe sem nomes · ou o id de alguém
  categorias: [], // várias ao mesmo tempo; vazio = todas
  material: '',
  nome: '',
  // o que entra no PDF
  incluirResumo: true,
  incluirEvolucao: true,
  evolucaoTipo: 'semanal', // 'semanal' | 'mensal'
  evolucaoQtdSemanas: 8,
  evolucaoQtdMeses: 6,
  incluirPrazo: true,
  incluirAproveitamento: true,
  incluirLista: true,
  ordemLista: 'data', // 'data' | 'cat-nome' | 'cat-data'
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
  const semNomes = st.funcionarioId === '__equipe__';
  const filtrosSemPeriodo = { funcionarioId: st.funcionarioId && !semNomes ? st.funcionarioId : null, categorias: st.categorias.length ? [...st.categorias] : null, material: st.material || null, nome: st.nome };
  const base = periodo.invalido ? [] : Analise.filtrar(itensTodos, { ...filtrosSemPeriodo, inicio: periodo.inicio, fim: periodo.fim });
  const finais = st.selecaoManual ? base.filter((i) => st.selecionados.has(i.id)) : base;
  const funcionario = st.funcionarioId && !semNomes ? funcionarios.find((f) => f.id === st.funcionarioId) || null : null;
  return { itensTodos, periodo, funcionarios, filtrosSemPeriodo, base, finais, funcionario , semNomes };
}

const ORDENS_LISTA = {
  data: 'Por data de conclusão',
  'cat-nome': 'Por categoria, depois nome (A→Z)',
  'cat-data': 'Por categoria, depois data de conclusão',
};

function ordenarItensRelatorio(itens, ordem) {
  const porData = (a, b) => a.dataFinal - b.dataFinal;
  const porCategoria = (a, b) => (a.categoria || '').localeCompare(b.categoria || '', 'pt-BR');
  const porNome = (a, b) => (a.nome || '').localeCompare(b.nome || '', 'pt-BR', { numeric: true });
  const lista = [...itens];
  if (ordem === 'cat-nome') return lista.sort((a, b) => porCategoria(a, b) || porNome(a, b) || porData(a, b));
  if (ordem === 'cat-data') return lista.sort((a, b) => porCategoria(a, b) || porData(a, b) || porNome(a, b));
  return lista.sort((a, b) => porData(a, b) || porCategoria(a, b) || porNome(a, b));
}

// "Máyra Fernada Amaral de Souza" → "Máyra Souza" (economiza linhas na lista impressa)
function nomeCurtoRelatorio(nome) {
  const partes = (nome || '').trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return '—';
  if (partes.length === 1) return partes[0];
  return `${partes[0]} ${partes[partes.length - 1]}`;
}

function secoesLigadas() {
  const st = RelatorioView;
  return st.incluirResumo || st.incluirEvolucao || st.incluirPrazo || st.incluirAproveitamento || st.incluirLista;
}

function descricaoFiltros(d, comData) {
  const st = RelatorioView;
  const partes = [`Período: ${d.periodo.rotulo}`, `Funcionário: ${d.funcionario ? d.funcionario.nome : d.semNomes ? 'Equipe (sem nomes)' : 'Todos'}`];
  if (st.categorias.length) partes.push(`${st.categorias.length === 1 ? 'Categoria' : 'Categorias'}: ${st.categorias.join(', ')}`);
  if (st.material) partes.push(`Material: ${st.material}`);
  if (st.nome && st.nome.trim()) partes.push(`Nome contém: "${st.nome.trim()}"`);
  if (st.selecaoManual) partes.push(`Seleção manual: ${d.finais.length} item(ns)`);
  if (comData) partes.push(`Ordem: ${ORDENS_LISTA[st.ordemLista] || ORDENS_LISTA.data}`);
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

  const modoItem = !!(st.nome && st.nome.trim());
  const qtdPorCategoria = {};
  if (!d.periodo.invalido) {
    Analise.filtrar(d.itensTodos, { ...d.filtrosSemPeriodo, categorias: null, inicio: d.periodo.inicio, fim: d.periodo.fim }).forEach(
      (i) => (qtdPorCategoria[i.categoria] = (qtdPorCategoria[i.categoria] || 0) + 1)
    );
  }
  const grupos = Analise.aproveitamentoAgrupado(d.finais, 'categoria');
  const itensComAprov = d.finais.filter((i) => i.aproveitamento != null);

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
              </div>
              <div class="row__meta" style="flex-basis:100%; text-align:right">Digite ou escolha as datas — o filtro é aplicado ao sair do campo ou apertar Enter.</div>`
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
            <option value="" ${!st.funcionarioId ? 'selected' : ''}>Todos (separado por funcionário)</option>
            <option value="__equipe__" ${st.funcionarioId === '__equipe__' ? 'selected' : ''}>Equipe (sem nomes)</option>
            ${d.funcionarios.map((f) => `<option value="${f.id}" ${st.funcionarioId === f.id ? 'selected' : ''}>${escapeHtml(f.nome)}</option>`).join('')}
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

      <div class="field" style="margin-bottom:0">
        <label>Categorias ${st.categorias.length ? `<span class="rel-cat-conta">${st.categorias.length} marcada${st.categorias.length === 1 ? '' : 's'}</span>` : ''}</label>
        <div class="chips" style="margin-bottom:10px">
          <button class="chip ${st.categorias.length === 0 ? 'chip--on' : ''}" id="rel-cat-todas">Todas</button>
          <button class="chip" id="rel-cat-cortes">Só cortes</button>
          ${st.categorias.length ? '<button class="chip" id="rel-cat-limpar">Limpar</button>' : ''}
        </div>
        <div class="rel-cat-grid">
          ${categorias
            .map((c) => {
              const n = qtdPorCategoria[c] || 0;
              return `<label class="perm-item ${n ? '' : 'rel-cat--vazia'}">
                <input type="checkbox" data-rel-cat="${escapeHtml(c)}" ${st.categorias.includes(c) ? 'checked' : ''} />
                <span>${escapeHtml(c)} <small>${n}</small></span>
              </label>`;
            })
            .join('')}
        </div>
        <div class="row__meta" style="margin-top:8px">${
          st.categorias.length ? 'Só as categorias marcadas entram no relatório e na planilha.' : 'Nenhuma marcada = todas as categorias entram.'
        } O número ao lado é quantos itens tem no período.</div>
      </div>
    </div>

    <div class="card">
      <h3 class="section-title" style="font-size:16px">Aproveitamento e desperdício</h3>
      <p class="section-sub" style="margin-bottom:6px">${
        modoItem
          ? `Item por item — filtrado pelo nome "${escapeHtml(st.nome.trim())}"`
          : 'Por categoria (Corte Tecido, Corte Tela, Corte Espuma…)'
      }</p>
      <div class="row__meta">${
        modoItem
          ? itensComAprov.length
            ? `${itensComAprov.length} item(ns) com % de aproveitamento. Cada um aparece na sua linha, com a categoria — o mesmo móvel com tela e tecido sai separado.`
            : 'Nenhum item com % de aproveitamento nesse filtro — essa parte não aparece no relatório.'
          : grupos.length
          ? `${grupos.length} categoria(s) com % de aproveitamento. Pra ver um móvel específico item por item, digite o nome em "Nome do móvel contém".`
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
    </div>

    <div class="card">
      <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:10px; flex-wrap:wrap">
        <div>
          <h3 class="section-title" style="font-size:16px">O que incluir no PDF</h3>
          <p class="section-sub" style="margin:0">Ligue só as partes que quiser</p>
        </div>
        <button class="btn btn--ghost" id="rel-so-lista" style="padding:8px 14px; font-size:13px">Apenas a lista detalhada</button>
      </div>
      <div class="rel-incluir">
        <label class="perm-item"><input type="checkbox" data-rel-incluir="incluirResumo" ${st.incluirResumo ? 'checked' : ''} /><span>Resumo (projetos, nota, % da meta)</span></label>

        <label class="perm-item"><input type="checkbox" data-rel-incluir="incluirEvolucao" ${st.incluirEvolucao ? 'checked' : ''} /><span>Evolução</span></label>
        ${
          st.incluirEvolucao
            ? `<div class="rel-sub">
                <div class="chips">
                  <button class="chip ${st.evolucaoTipo === 'semanal' ? 'chip--on' : ''}" data-rel-evo="semanal">Semanal</button>
                  <button class="chip ${st.evolucaoTipo === 'mensal' ? 'chip--on' : ''}" data-rel-evo="mensal">Mensal</button>
                </div>
                <div class="rel-qtd">
                  <span>Últimas</span>
                  <input id="rel-evo-qtd" type="number" inputmode="numeric" min="1" max="${st.evolucaoTipo === 'semanal' ? 104 : 36}" step="1" value="${st.evolucaoTipo === 'semanal' ? st.evolucaoQtdSemanas : st.evolucaoQtdMeses}" aria-label="Quantidade" />
                  <span>${st.evolucaoTipo === 'semanal' ? 'semanas' : 'meses'}, terminando no período escolhido</span>
                </div>
              </div>`
            : ''
        }

        <label class="perm-item"><input type="checkbox" data-rel-incluir="incluirPrazo" ${st.incluirPrazo ? 'checked' : ''} /><span>Prazo, atraso e erros</span></label>
        <label class="perm-item"><input type="checkbox" data-rel-incluir="incluirAproveitamento" ${st.incluirAproveitamento ? 'checked' : ''} /><span>Aproveitamento e desperdício</span></label>

        <label class="perm-item"><input type="checkbox" data-rel-incluir="incluirLista" ${st.incluirLista ? 'checked' : ''} /><span>Lista detalhada item por item</span></label>
        ${
          st.incluirLista
            ? `<div class="rel-sub">
                <div class="row__meta" style="margin-bottom:6px">Ordem da lista (vale também pra planilha)</div>
                <div class="chips">
                  ${Object.entries(ORDENS_LISTA)
                    .map(([v, l]) => `<button class="chip ${st.ordemLista === v ? 'chip--on' : ''}" data-rel-ordem="${v}">${l}</button>`)
                    .join('')}
                </div>
              </div>`
            : `<div class="rel-sub">
                <div class="row__meta" style="margin-bottom:6px">Ordem das linhas na planilha</div>
                <div class="chips">
                  ${Object.entries(ORDENS_LISTA)
                    .map(([v, l]) => `<button class="chip ${st.ordemLista === v ? 'chip--on' : ''}" data-rel-ordem="${v}">${l}</button>`)
                    .join('')}
                </div>
              </div>`
        }
      </div>
      ${secoesLigadas() ? '' : '<div class="row__meta" style="margin-top:10px; color:var(--danger-fg)">Nenhuma parte ligada — ligue pelo menos uma pra gerar o PDF.</div>'}
    </div>

    <div class="card">
      <h3 class="section-title" style="font-size:16px">Gerar</h3>
      <p class="section-sub">${escapeHtml(descricaoFiltros(d, false))}</p>
      <div style="display:flex; gap:8px; flex-wrap:wrap">
        <button class="btn btn--ghost" id="rel-visualizar" ${d.finais.length && secoesLigadas() ? '' : 'disabled'}>Visualizar</button>
        <button class="btn btn--primary" id="rel-pdf" ${d.finais.length && secoesLigadas() ? '' : 'disabled'}>Gerar PDF</button>
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
  // Datas digitadas à mão: o campo de data avisa "mudou" a cada número
  // digitado, e redesenhar a tela nessa hora tirava o cursor do campo.
  // Então só guarda o valor enquanto digita e aplica o filtro quando a
  // pessoa sai do campo (ou aperta Enter).
  const ligarCampoData = (el, chave) => {
    if (!el) return;
    const guardar = () => (st[chave] = el.value);
    el.addEventListener('input', guardar);
    el.addEventListener('change', guardar);
    el.addEventListener('blur', () => {
      guardar();
      // espera o foco assentar: se a pessoa só pulou pro outro campo de
      // data, ainda não aplica (senão o cursor sairia desse também)
      setTimeout(() => {
        const ativo = document.activeElement;
        if (ativo && (ativo.id === 'rel-ini' || ativo.id === 'rel-fim')) return;
        if (RelatorioView._datasAplicadas !== `${st.inicioStr}|${st.fimStr}`) rerender();
      }, 0);
    });
    el.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') el.blur();
    });
  };
  RelatorioView._datasAplicadas = `${st.inicioStr}|${st.fimStr}`;
  ligarCampoData(document.getElementById('rel-ini'), 'inicioStr');
  ligarCampoData(document.getElementById('rel-fim'), 'fimStr');

  document.getElementById('rel-func').addEventListener('change', (ev) => ((st.funcionarioId = ev.target.value), rerender()));
  cont.querySelectorAll('[data-rel-cat]').forEach((chk) =>
    chk.addEventListener('change', () => {
      const c = chk.dataset.relCat;
      const set = new Set(st.categorias);
      if (chk.checked) set.add(c);
      else set.delete(c);
      // mantém na ordem da lista
      st.categorias = categorias.filter((x) => set.has(x));
      st.status = '';
      rerender();
    })
  );
  document.getElementById('rel-cat-todas').addEventListener('click', () => ((st.categorias = []), (st.status = ''), rerender()));
  const limparCat = document.getElementById('rel-cat-limpar');
  if (limparCat) limparCat.addEventListener('click', () => ((st.categorias = []), (st.status = ''), rerender()));
  document.getElementById('rel-cat-cortes').addEventListener('click', () => {
    st.categorias = categorias.filter((c) => Analise.normaliza(c).startsWith('corte'));
    st.status = '';
    rerender();
  });
  document.getElementById('rel-mat').addEventListener('change', (ev) => ((st.material = ev.target.value), rerender()));
  const nomeInput = document.getElementById('rel-nome');
  nomeInput.addEventListener('change', () => ((st.nome = nomeInput.value), rerender()));
  nomeInput.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') nomeInput.blur();
  });

  cont.querySelectorAll('[data-rel-incluir]').forEach((chk) =>
    chk.addEventListener('change', () => {
      st[chk.dataset.relIncluir] = chk.checked;
      st.status = '';
      rerender();
    })
  );
  document.getElementById('rel-so-lista').addEventListener('click', () => {
    st.incluirResumo = false;
    st.incluirEvolucao = false;
    st.incluirPrazo = false;
    st.incluirAproveitamento = false;
    st.incluirLista = true;
    st.status = '';
    rerender();
  });
  cont.querySelectorAll('[data-rel-evo]').forEach((btn) =>
    btn.addEventListener('click', () => ((st.evolucaoTipo = btn.dataset.relEvo), rerender()))
  );
  cont.querySelectorAll('[data-rel-ordem]').forEach((btn) =>
    btn.addEventListener('click', () => ((st.ordemLista = btn.dataset.relOrdem), rerender()))
  );
  const qtdInput = document.getElementById('rel-evo-qtd');
  if (qtdInput) {
    qtdInput.addEventListener('change', () => {
      const max = st.evolucaoTipo === 'semanal' ? 104 : 36;
      let v = parseInt(qtdInput.value, 10);
      if (isNaN(v) || v < 1) v = 1;
      if (v > max) v = max;
      if (st.evolucaoTipo === 'semanal') st.evolucaoQtdSemanas = v;
      else st.evolucaoQtdMeses = v;
      rerender();
    });
    qtdInput.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') qtdInput.blur();
    });
  }

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
    Exportar.baixar(Exportar.gerarXLSX(ordenarItensRelatorio(dados.finais, st.ordemLista), descricaoFiltros(dados, true), { semFuncionario: dados.semNomes }), Exportar.nomeArquivo('xlsx'));
    setStatus(`Planilha .xlsx com ${dados.finais.length} linha(s) baixada.`);
  });

  document.getElementById('rel-csv').addEventListener('click', async () => {
    const dados = await dadosDoRelatorio();
    if (!dados.finais.length) return rerender();
    Exportar.baixar(Exportar.gerarCSV(ordenarItensRelatorio(dados.finais, st.ordemLista), descricaoFiltros(dados, true), { semFuncionario: dados.semNomes }), Exportar.nomeArquivo('csv'));
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
    if (!b) return;
    const precisaSecao = id === 'rel-visualizar' || id === 'rel-pdf';
    b.disabled = n === 0 || (precisaSecao && !secoesLigadas());
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

/* Faixas do gráfico de evolução: N semanas ou N meses, terminando no
   período escolhido (sem passar de hoje). */
async function faixasDaEvolucao(periodo) {
  const st = RelatorioView;
  const agora = Date.now();
  const fimRef = periodo.fim != null ? Math.min(periodo.fim - 1, agora) : agora;
  if (st.evolucaoTipo === 'mensal') return Analise.faixasMensais(Math.max(1, Math.min(36, st.evolucaoQtdMeses || 6)), fimRef);
  return Analise.faixasSemanais(Math.max(1, Math.min(104, st.evolucaoQtdSemanas || 8)), fimRef);
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
  if (st.incluirResumo) {
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
      ${d.semNomes ? caixa(totais.atrasados, 'Atrasados') : caixa(idsComItens.size, 'Pessoas com entregas')}
      ${caixa(totais.erros, 'Erros')}
      ${caixa(totais.errosNovos, 'Erros novos')}
      ${caixa(totais.qtd ? `${formatarNumero((totais.noPrazo / Math.max(1, totais.noPrazo + totais.atrasados)) * 100, 0)}%` : '—', 'No prazo (com data)')}
      ${caixa(totais.mediaAprov != null ? formatarPct(totais.mediaAprov) : '—', 'Aproveitamento médio')}
    </div>`);
    if (!d.semNomes) {
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
    } else {
      html(`<p class="rp-nota">Produção da equipe como um todo, sem separar por funcionário.</p>`);
    }
  }
  } // fim Resumo

  /* 2. Evolução (semanal ou mensal, N faixas) */
  const faixas = await faixasDaEvolucao(d.periodo);
  const baseEvolucao = Analise.filtrar(d.itensTodos, d.filtrosSemPeriodo);
  if (st.incluirEvolucao) {
  const qtdPorFaixa = faixas.map((f) => baseEvolucao.filter((i) => i.dataFinal >= f.inicio && i.dataFinal < f.fim).length);
  const muitasFaixas = faixas.length > 16;
  secao(
    st.evolucaoTipo === 'semanal'
      ? faixas.length === 1 ? 'Evolução na última semana' : `Evolução nas últimas ${faixas.length} semanas`
      : faixas.length === 1 ? 'Evolução no último mês' : `Evolução nos últimos ${faixas.length} meses`,
    'Projetos concluídos em cada período, com os mesmos filtros de funcionário, categoria, material e nome (sem a seleção manual).'
  );
  html(`<div class="rp-grafico">${barrasVerticaisSVG(faixas.map((f) => f.rotulo), qtdPorFaixa, { altura: muitasFaixas ? 210 : 190, largura: 640, rotulosInclinados: muitasFaixas })}</div>`);
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
  } // fim Evolução

  /* 3. Prazo / Atraso / Erros */
  if (st.incluirPrazo) {
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
  } // fim Prazo

  /* 4. Aproveitamento / Desperdício
     - sem nome digitado: por categoria (visão geral)
     - com nome digitado (ex: MARROCOS): item por item, com a categoria
       de cada um — o mesmo móvel com tela e tecido sai separado.
     O "gráfico" é montado em linhas de tabela, assim ele continua na
     folha seguinte quando for grande, em vez de ser cortado. */
  const modoItem = !!(st.nome && st.nome.trim());
  const grupos = Analise.aproveitamentoAgrupado(finais, 'categoria');
  const itensComAprov = finais
    .filter((i) => i.aproveitamento != null)
    .sort(
      (a, b) =>
        (a.nome || '').localeCompare(b.nome || '', 'pt-BR', { numeric: true }) ||
        (a.categoria || '').localeCompare(b.categoria || '', 'pt-BR') ||
        a.dataFinal - b.dataFinal
    );
  const linhaBarra = (rotulo, sub, valor) =>
    `<tr>
      <td class="rp-barras__rot">${escapeHtml(rotulo)}${sub ? `<div class="rp-fraco">${escapeHtml(sub)}</div>` : ''}</td>
      <td class="rp-barras__barra">${barraHorizontalSVG(valor, 100, '#7A1F2B')}</td>
      <td class="num rp-barras__val">${formatarPct(valor)}</td>
      <td class="num rp-barras__val rp-fraco">${formatarPct(100 - valor)}</td>
    </tr>`;
  const cabecalhoBarras = '<tr><th></th><th>Aproveitamento (barra) · desperdício (fundo)</th><th class="num">Aprov.</th><th class="num">Desp.</th></tr>';

  if (st.incluirAproveitamento && !modoItem && grupos.length) {
    secao('Aproveitamento e desperdício por categoria', 'Média do % de aproveitamento informado pelo programa de corte. Desperdício = 100% − aproveitamento.');
    tabela(
      cabecalhoBarras,
      grupos.map((g) => linhaBarra(g.grupo, `${g.qtd} item(ns)`, g.media)),
      'rp-barras'
    );
    tabela(
      `<tr><th>Categoria</th><th class="num">Itens</th><th class="num">Aproveitamento</th><th class="num">Desperdício</th><th class="num">Mín.</th><th class="num">Máx.</th></tr>`,
      grupos.map(
        (g) =>
          `<tr><td>${escapeHtml(g.grupo)}</td><td class="num">${g.qtd}</td><td class="num">${formatarPct(g.media)}</td><td class="num">${formatarPct(g.desperdicio)}</td><td class="num">${formatarPct(g.min)}</td><td class="num">${formatarPct(g.max)}</td></tr>`
      )
    );
  }

  if (st.incluirAproveitamento && modoItem && itensComAprov.length) {
    secao(
      `Aproveitamento e desperdício — item por item`,
      `Filtrado pelo nome "${st.nome.trim()}". Cada corte na sua linha, com a categoria e a data.`
    );
    tabela(
      cabecalhoBarras,
      itensComAprov.map((i) => linhaBarra(i.nome || '(sem nome)', `${i.categoria} · ${formatarDataCurta(i.dataFinal)}${i.materialNome ? ` · ${i.materialNome}` : ''}`, i.aproveitamento)),
      'rp-barras'
    );
  }

  // ao longo do tempo: média de cada categoria (dos itens filtrados) em cada faixa da Evolução
  if (st.incluirAproveitamento && (modoItem ? itensComAprov.length : grupos.length)) {
    const principais = grupos.slice(0, 6).map((g) => g.grupo);
    const comAprovTempo = baseEvolucao.filter((i) => i.aproveitamento != null);
    const series = principais.map((g, gi) => ({
      nome: g,
      cor: corDaSerie(gi),
      valores: faixas.map((f) => {
        const it = comAprovTempo.filter((i) => i.categoria === g && i.dataFinal >= f.inicio && i.dataFinal < f.fim);
        return it.length ? Math.round((it.reduce((s, i) => s + i.aproveitamento, 0) / it.length) * 10) / 10 : null;
      }),
    }));
    if (series.some((s) => s.valores.some((v) => v != null))) {
      html(`<div class="rp-grafico"><div class="rp-grafico__titulo">Aproveitamento médio por categoria ao longo do tempo (${
        st.evolucaoTipo === 'mensal' ? 'por mês' : 'por semana'
      })</div>${graficoLinhaSVG(faixas.map((f) => f.rotulo), series, { sufixo: '%', minMaximo: 100, altura: 180, largura: 640 })}</div>`);
    }
  }

  /* 5. Lista detalhada — na ordem escolhida */
  if (st.incluirLista) {
    const ordem = st.ordemLista;
    const ordenados = ordenarItensRelatorio(finais, ordem);
    const porCategoria = ordem === 'cat-nome' || ordem === 'cat-data';
    const subtituloOrdem =
      ordem === 'cat-nome'
        ? 'agrupados por categoria (A→Z) e, dentro dela, por nome'
        : ordem === 'cat-data'
        ? 'agrupados por categoria (A→Z) e, dentro dela, por data de conclusão'
        : 'do mais antigo para o mais recente (data de conclusão)';
    secao('Lista detalhada', `${finais.length} item(ns), ${subtituloOrdem}.`);
    const mostrarFunc = !d.funcionario && !d.semNomes;
    const nColunas = mostrarFunc ? 10 : 9;
    const qtdPorCat = {};
    ordenados.forEach((i) => (qtdPorCat[i.categoria] = (qtdPorCat[i.categoria] || 0) + 1));
    const linhas = [];
    let catAtual = null;
    ordenados.forEach((i) => {
      if (porCategoria && i.categoria !== catAtual) {
        catAtual = i.categoria;
        linhas.push(`<tr class="rp-grupo"><td colspan="${nColunas}">${escapeHtml(catAtual)} — ${qtdPorCat[catAtual]} item(ns)</td></tr>`);
      }
      const prazo = Analise.situacaoPrazo(i);
      linhas.push(`<tr>
          <td class="nowrap">${formatarDataCurta(i.dataFinal)}</td>
          <td>${escapeHtml(i.categoria)}</td>
          <td>${escapeHtml(i.nome)}</td>
          <td>${escapeHtml(i.numeroPedido || '')}</td>
          ${mostrarFunc ? `<td class="nowrap">${escapeHtml(nomeCurtoRelatorio(i.funcionarioNome))}</td>` : ''}
          <td>${escapeHtml(i.materialNome || '')}${i.materialLargura != null && i.materialNome ? ` <span class="rp-fraco">${formatarLarguraMaterial(i.materialLargura)}</span>` : ''}</td>
          <td class="nowrap ${prazo === 'Atrasado' ? 'rp-ruim' : ''}">${prazo === 'Sem data programada' ? 'Sem data' : prazo}</td>
          <td class="num">${i.erros}</td>
          <td class="num">${i.errosNovos}</td>
          <td class="num">${i.aproveitamento != null ? formatarPct(i.aproveitamento) : ''}</td>
        </tr>`);
    });
    tabela(
      `<tr><th>Data</th><th>Categoria</th><th>Nome</th><th>Nº ped.</th>${mostrarFunc ? '<th>Funcionário</th>' : ''}<th>Material</th><th>Prazo</th><th class="num">Erros</th><th class="num">E. novos</th><th class="num">Aprov.</th></tr>`,
      linhas,
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
    if (b.tipo === 'quebra') {
      if (corpo.children.length) novaPagina();
      return;
    }
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
      // linha de título de categoria não fica sozinha no pé da página
      let grupoPendente = null;
      const ultima = tbody.lastElementChild;
      if (ultima && ultima.classList.contains('rp-grupo')) {
        grupoPendente = ultima;
        ultima.remove();
      }
      if (tbody.children.length === 0) {
        // nem a 1ª linha coube: a tabela inteira (e o título dela) vai pra próxima folha
        wrap.remove();
        const titulo = levarTituloPendente();
        if (corpo.children.length === 0 && !titulo) {
          // página já vazia — não adianta trocar, deixa a linha aqui mesmo
          wrap = montarTabela();
          tbody = wrap.querySelector('tbody');
          if (grupoPendente) tbody.appendChild(grupoPendente);
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
      if (grupoPendente) tbody.appendChild(grupoPendente);
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
