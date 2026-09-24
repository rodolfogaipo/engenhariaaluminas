/* =========================================================
   comparar.js — Comparação de meses avulsos (só Admin)
   Escolhe meses soltos, não precisam ser seguidos (ex: Janeiro,
   Março e Setembro), de um funcionário ou da equipe toda, e compara
   em barras agrupadas: total geral e por categoria.
   ========================================================= */

const CompararView = {
  ano: new Date().getFullYear(),
  meses: [], // 'AAAA-MM'
  funcionarioId: '', // '' = equipe toda
};

const MAX_MESES_COMPARAR = 6;

function rotuloMesChave(chave) {
  const [a, m] = chave.split('-').map(Number);
  return `${MESES_CURTOS[m - 1]}/${String(a).slice(2)}`;
}

function rangeMesChave(chave) {
  const [a, m] = chave.split('-').map(Number);
  return { inicio: new Date(a, m - 1, 1).getTime(), fim: new Date(a, m, 1).getTime() };
}

async function renderCompararMeses(cont) {
  const st = CompararView;
  const itensTodos = await Analise.itensConcluidos();
  const funcionarios = await Analise.funcionarios(itensTodos);
  const hoje = new Date();
  const anoMin = itensTodos.length ? new Date(itensTodos[0].dataFinal).getFullYear() : hoje.getFullYear();

  const contagemMes = {};
  itensTodos.forEach((i) => {
    if (st.funcionarioId && i.funcionarioId !== st.funcionarioId) return;
    const d = new Date(i.dataFinal);
    const chave = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    contagemMes[chave] = (contagemMes[chave] || 0) + 1;
  });

  st.meses.sort();

  cont.innerHTML = `
    <div class="card">
      <h3 class="section-title" style="font-size:16px">Meses para comparar</h3>
      <p class="section-sub">Toque nos meses — não precisam ser seguidos (até ${MAX_MESES_COMPARAR})</p>
      <div style="display:flex; align-items:center; justify-content:center; gap:12px; margin-bottom:12px">
        <button class="topbar__icon-btn" id="cmp-ano-ant" style="background:var(--paper-dim)" aria-label="Ano anterior" ${st.ano <= anoMin ? 'disabled' : ''}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><path d="M15 18l-6-6 6-6"/></svg>
        </button>
        <b style="font-size:16px; min-width:60px; text-align:center">${st.ano}</b>
        <button class="topbar__icon-btn" id="cmp-ano-prox" style="background:var(--paper-dim)" aria-label="Próximo ano" ${st.ano >= hoje.getFullYear() ? 'disabled' : ''}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><path d="M9 18l6-6-6-6"/></svg>
        </button>
      </div>
      <div class="mes-grid">
        ${MESES_CURTOS.map((nome, i) => {
          const chave = `${st.ano}-${String(i + 1).padStart(2, '0')}`;
          const futuro = st.ano > hoje.getFullYear() || (st.ano === hoje.getFullYear() && i > hoje.getMonth());
          const on = st.meses.includes(chave);
          return `<button class="mes-btn ${on ? 'mes-btn--on' : ''}" data-cmp-mes="${chave}" ${futuro ? 'disabled' : ''}>
            <span>${nome}</span><small>${contagemMes[chave] || 0}</small>
          </button>`;
        }).join('')}
      </div>
      ${
        st.meses.length
          ? `<div class="chips" style="margin-top:12px">
              ${st.meses.map((m, i) => `<button class="chip chip--on" data-cmp-remover="${m}" style="--chip-cor:${corDaSerie(i)}">${rotuloMesChave(m)} ✕</button>`).join('')}
              <button class="chip" id="cmp-limpar">Limpar</button>
            </div>`
          : ''
      }
      <div class="field" style="margin:14px 0 0">
        <label for="cmp-func">Funcionário</label>
        <select id="cmp-func">
          <option value="">Equipe toda</option>
          ${funcionarios.map((f) => `<option value="${f.id}" ${st.funcionarioId === f.id ? 'selected' : ''}>${escapeHtml(f.nome)}</option>`).join('')}
        </select>
      </div>
    </div>
    <div id="cmp-resultado"></div>
  `;

  document.getElementById('cmp-ano-ant').addEventListener('click', () => ((st.ano -= 1), renderCompararMeses(cont)));
  document.getElementById('cmp-ano-prox').addEventListener('click', () => ((st.ano += 1), renderCompararMeses(cont)));
  cont.querySelectorAll('[data-cmp-mes]').forEach((btn) =>
    btn.addEventListener('click', () => {
      const chave = btn.dataset.cmpMes;
      if (st.meses.includes(chave)) st.meses = st.meses.filter((m) => m !== chave);
      else if (st.meses.length >= MAX_MESES_COMPARAR) {
        alert(`Dá pra comparar até ${MAX_MESES_COMPARAR} meses de uma vez — tire um antes de escolher outro.`);
        return;
      } else st.meses.push(chave);
      renderCompararMeses(cont);
    })
  );
  cont.querySelectorAll('[data-cmp-remover]').forEach((btn) =>
    btn.addEventListener('click', () => ((st.meses = st.meses.filter((m) => m !== btn.dataset.cmpRemover)), renderCompararMeses(cont)))
  );
  const limpar = document.getElementById('cmp-limpar');
  if (limpar) limpar.addEventListener('click', () => ((st.meses = []), renderCompararMeses(cont)));
  document.getElementById('cmp-func').addEventListener('change', (ev) => ((st.funcionarioId = ev.target.value), renderCompararMeses(cont)));

  const res = document.getElementById('cmp-resultado');
  if (st.meses.length === 0) {
    res.innerHTML = `
      <div class="card"><div class="empty">
        <div class="empty__title">Escolha pelo menos um mês</div>
        <div class="empty__sub">O número embaixo de cada mês é quantos serviços foram concluídos nele.</div>
      </div></div>`;
    return;
  }

  const funcionario = st.funcionarioId ? funcionarios.find((f) => f.id === st.funcionarioId) : null;
  const itensDoMes = st.meses.map((m) => {
    const r = rangeMesChave(m);
    return Analise.filtrar(itensTodos, { inicio: r.inicio, fim: r.fim, funcionarioId: st.funcionarioId || null });
  });
  const rotulos = st.meses.map(rotuloMesChave);
  const totaisMes = itensDoMes.map((l) => Analise.totais(l));

  // Total por mês: na equipe, uma barra por pessoa dentro de cada mês
  let graficoTotal;
  if (!funcionario) {
    const ids = new Set(itensDoMes.flat().map((i) => i.funcionarioId).filter(Boolean));
    const pessoas = funcionarios.filter((f) => ids.has(f.id));
    const series = pessoas.map((p, i) => ({
      nome: primeiroNome(p.nome),
      cor: corDaSerie(i),
      valores: itensDoMes.map((l) => l.filter((it) => it.funcionarioId === p.id).length),
    }));
    series.push({ nome: 'Total', cor: '#3D0308', valores: totaisMes.map((t) => t.qtd) });
    graficoTotal = barrasAgrupadasSVG(rotulos, series, { altura: 220 });
  } else {
    graficoTotal = barrasVerticaisSVG(rotulos, totaisMes.map((t) => t.qtd), { altura: 200 });
  }

  // Por categoria: uma barra por mês dentro de cada categoria
  const categorias = Analise.porCategoria(itensDoMes.flat()).map((c) => c.categoria);
  const seriesCategoria = st.meses.map((m, i) => ({
    nome: rotuloMesChave(m),
    cor: corDaSerie(i),
    valores: categorias.map((c) => itensDoMes[i].filter((it) => it.categoria === c).length),
  }));

  res.innerHTML = `
    <div class="card">
      <h3 class="section-title" style="font-size:16px">Total por mês</h3>
      <p class="section-sub">${funcionario ? escapeHtml(funcionario.nome) : 'Equipe toda — uma barra por pessoa e o total'}</p>
      ${graficoTotal}
    </div>

    <div class="card">
      <h3 class="section-title" style="font-size:16px">Por categoria</h3>
      <p class="section-sub">Cada cor é um mês</p>
      ${categorias.length ? barrasAgrupadasSVG(categorias, seriesCategoria, { rotulosInclinados: true, altura: 250 }) : '<div class="row__meta">Nada concluído nos meses escolhidos.</div>'}
    </div>

    <div class="card">
      <h3 class="section-title" style="font-size:16px">Tabela</h3>
      <div class="tabela-wrap">
        <table class="tabela">
          <thead><tr><th>Categoria</th>${rotulos.map((r) => `<th class="num">${r}</th>`).join('')}</tr></thead>
          <tbody>
            ${categorias
              .map((c, ci) => `<tr><td>${escapeHtml(c)}</td>${seriesCategoria.map((s) => `<td class="num">${s.valores[ci]}</td>`).join('')}</tr>`)
              .join('')}
            <tr class="tabela__total"><td>Total</td>${totaisMes.map((t) => `<td class="num">${t.qtd}</td>`).join('')}</tr>
            <tr><td>Erros</td>${totaisMes.map((t) => `<td class="num">${t.erros}</td>`).join('')}</tr>
            <tr><td>Erros novos</td>${totaisMes.map((t) => `<td class="num">${t.errosNovos}</td>`).join('')}</tr>
            <tr><td>Aproveitamento médio</td>${totaisMes.map((t) => `<td class="num">${formatarPct(t.mediaAprov)}</td>`).join('')}</tr>
          </tbody>
        </table>
      </div>
    </div>
  `;
}
