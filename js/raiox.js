/* =========================================================
   raiox.js — Raio-X do Funcionário + Painel de Qualidade

   - Quantos serviços cada pessoa fez, separado por categoria (CNP,
     Corte Tecido, Corte Espuma…), com barra visual e, ao lado, a
     qualidade: erros, erros novos e média de Aproveitamento /
     Desperdício (pra quem tem essa métrica).
   - Painel de Qualidade: linha só de Erros + Erros Novos por semana
     — separado da produtividade, pra usar numa conversa de feedback
     sem misturar volume com qualidade.

   Admin: escolhe qualquer funcionário e tem o modo "Comparar equipe".
   Funcionário: vê só a própria versão, sem colegas (igual ao card
   pessoal "Meta da Semana").
   ========================================================= */

const RaioXView = {
  periodoTipo: 'mes', // 'semana' | 'mes' | 'ano' | 'tudo'
  dataReferencia: Date.now(),
  funcionarioId: null, // Admin: quem está sendo visto
  modo: 'individual', // 'individual' | 'comparar' (só Admin)
  semanasQualidade: 12,
};

async function renderRaioX(view) {
  const st = RaioXView;
  const ehAdmin = Auth.isAdmin();
  const itensTodos = await Analise.itensConcluidos();

  let funcionarios = [];
  if (ehAdmin) {
    funcionarios = await Analise.funcionarios(itensTodos);
    if (!st.funcionarioId || !funcionarios.some((f) => f.id === st.funcionarioId)) {
      st.funcionarioId = funcionarios[0] ? funcionarios[0].id : null;
    }
  } else {
    st.funcionarioId = Auth.current.id;
    st.modo = 'individual';
  }

  const periodo = await Analise.periodo(st.periodoTipo, st.dataReferencia);
  const ehAtual = await Analise.periodoEhAtual(st.periodoTipo, st.dataReferencia);

  view.innerHTML = `
    <h2 class="section-title">Raio-X${ehAdmin ? ' do Funcionário' : ''}</h2>
    <p class="section-sub">${ehAdmin ? 'Produção por categoria e qualidade de cada pessoa da equipe' : 'Sua produção por categoria e a qualidade do seu trabalho'}</p>

    ${
      ehAdmin
        ? `<div class="chips" style="margin-bottom:12px">
            ${funcionarios
              .map(
                (f) =>
                  `<button class="chip chip--foto ${st.modo === 'individual' && st.funcionarioId === f.id ? 'chip--on' : ''}" data-rx-func="${f.id}">${avatarUsuario(f, 22)}${escapeHtml(primeiroNome(f.nome))}</button>`
              )
              .join('')}
            ${funcionarios.length > 1 ? `<button class="chip ${st.modo === 'comparar' ? 'chip--on' : ''}" id="rx-comparar">Comparar equipe</button>` : ''}
          </div>`
        : ''
    }

    <div class="card" style="margin-bottom:16px">
      <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap">
        <div style="display:flex; gap:8px; flex-wrap:wrap">
          <button class="btn ${st.periodoTipo === 'semana' ? 'btn--primary' : 'btn--ghost'}" data-rx-periodo="semana" style="padding:8px 12px; font-size:13px">Semana</button>
          <button class="btn ${st.periodoTipo === 'mes' ? 'btn--primary' : 'btn--ghost'}" data-rx-periodo="mes" style="padding:8px 12px; font-size:13px">Mês</button>
          <button class="btn ${st.periodoTipo === 'ano' ? 'btn--primary' : 'btn--ghost'}" data-rx-periodo="ano" style="padding:8px 12px; font-size:13px">Ano</button>
          <button class="btn ${st.periodoTipo === 'tudo' ? 'btn--primary' : 'btn--ghost'}" data-rx-periodo="tudo" style="padding:8px 12px; font-size:13px">Tudo</button>
        </div>
        ${
          st.periodoTipo === 'tudo'
            ? `<span style="font-weight:600; font-size:14px">${periodo.rotulo}</span>`
            : `<div style="display:flex; align-items:center; gap:10px">
                <button class="topbar__icon-btn" id="rx-anterior" style="background:var(--paper-dim)" aria-label="Período anterior">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><path d="M15 18l-6-6 6-6"/></svg>
                </button>
                <span style="font-weight:600; font-size:14px; min-width:130px; text-align:center">${escapeHtml(st.periodoTipo === 'semana' ? periodo.rotulo.replace('Semana ', '') : periodo.rotulo)}</span>
                <button class="topbar__icon-btn" id="rx-proximo" style="background:var(--paper-dim)" aria-label="Próximo período" ${ehAtual ? 'disabled' : ''}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><path d="M9 18l6-6-6-6"/></svg>
                </button>
              </div>`
        }
      </div>
    </div>

    <div id="rx-conteudo"><div class="wip">${ICONS.wip}<b>Calculando…</b></div></div>
  `;

  view.querySelectorAll('[data-rx-func]').forEach((btn) =>
    btn.addEventListener('click', () => {
      st.funcionarioId = btn.dataset.rxFunc;
      st.modo = 'individual';
      renderRaioX(view);
    })
  );
  const btnComparar = document.getElementById('rx-comparar');
  if (btnComparar) {
    btnComparar.addEventListener('click', () => {
      st.modo = 'comparar';
      renderRaioX(view);
    });
  }
  view.querySelectorAll('[data-rx-periodo]').forEach((btn) =>
    btn.addEventListener('click', () => {
      st.periodoTipo = btn.dataset.rxPeriodo;
      st.dataReferencia = Date.now();
      renderRaioX(view);
    })
  );
  const ant = document.getElementById('rx-anterior');
  if (ant) {
    ant.addEventListener('click', () => {
      st.dataReferencia = Analise.navegar(st.periodoTipo, st.dataReferencia, -1);
      renderRaioX(view);
    });
  }
  const prox = document.getElementById('rx-proximo');
  if (prox) {
    prox.addEventListener('click', () => {
      st.dataReferencia = Analise.navegar(st.periodoTipo, st.dataReferencia, 1);
      renderRaioX(view);
    });
  }

  const cont = document.getElementById('rx-conteudo');

  if (ehAdmin && funcionarios.length === 0) {
    cont.innerHTML = `
      <div class="card"><div class="empty">
        <div class="empty__title">Nenhum funcionário cadastrado</div>
        <div class="empty__sub">Cadastre a equipe em Admin → Usuários.</div>
      </div></div>`;
    return;
  }

  const doPeriodo = Analise.filtrar(itensTodos, { inicio: periodo.inicio, fim: periodo.fim });

  if (st.modo === 'comparar' && ehAdmin) {
    return renderRaioXComparar(cont, view, funcionarios, doPeriodo, itensTodos);
  }
  return renderRaioXIndividual(cont, view, st.funcionarioId, doPeriodo, itensTodos, periodo);
}

/* ---------------- INDIVIDUAL ---------------- */

async function renderRaioXIndividual(cont, view, funcionarioId, doPeriodo, itensTodos, periodo) {
  const st = RaioXView;
  const meus = doPeriodo.filter((i) => i.funcionarioId === funcionarioId);
  const totais = Analise.totais(meus);
  const categorias = Analise.porCategoria(meus);
  const maxQtd = Math.max(0, ...categorias.map((c) => c.qtd));

  const faixas = await Analise.faixasSemanais(st.semanasQualidade, Date.now());
  const meusTodos = itensTodos.filter((i) => i.funcionarioId === funcionarioId);
  const serieErros = faixas.map((f) => meusTodos.filter((i) => i.dataFinal >= f.inicio && i.dataFinal < f.fim).reduce((s, i) => s + i.erros, 0));
  const serieNovos = faixas.map((f) => meusTodos.filter((i) => i.dataFinal >= f.inicio && i.dataFinal < f.fim).reduce((s, i) => s + i.errosNovos, 0));
  const serieQtd = faixas.map((f) => meusTodos.filter((i) => i.dataFinal >= f.inicio && i.dataFinal < f.fim).length);
  const totalErrosJanela = serieErros.reduce((a, b) => a + b, 0);
  const totalNovosJanela = serieNovos.reduce((a, b) => a + b, 0);
  const totalQtdJanela = serieQtd.reduce((a, b) => a + b, 0);

  const pessoa = await DB.get('usuarios', funcionarioId);
  cont.innerHTML = `
    ${
      pessoa
        ? `<div style="display:flex; align-items:center; gap:12px; margin:0 0 14px 2px">
            ${avatarUsuario(pessoa, 48)}
            <div><div class="row__title" style="font-size:16px">${escapeHtml(pessoa.nome)}</div><div class="row__meta">${escapeHtml(periodo.rotulo)}</div></div>
          </div>`
        : ''
    }
    <div class="stat-grid">
      <div class="card"><div class="stat"><div class="stat__value">${totais.qtd}</div><div class="stat__label">Serviços concluídos</div></div></div>
      <div class="card"><div class="stat"><div class="stat__value">${totais.erros}</div><div class="stat__label">Erros</div></div></div>
      <div class="card"><div class="stat"><div class="stat__value">${totais.errosNovos}</div><div class="stat__label">Erros novos</div></div></div>
      <div class="card"><div class="stat"><div class="stat__value">${totais.mediaAprov != null ? formatarPct(totais.mediaAprov, 1) : '—'}</div><div class="stat__label">Aproveitamento médio</div></div></div>
    </div>

    <div class="card" style="margin-top:16px">
      <h3 class="section-title" style="font-size:16px">Serviços por categoria</h3>
      <p class="section-sub">${escapeHtml(periodo.rotulo)} · quantidade e qualidade de cada tipo de serviço</p>
      ${
        categorias.length === 0
          ? '<div class="empty" style="padding:24px 8px"><div class="empty__title">Nada concluído nesse período</div><div class="empty__sub">Só entram serviços concluídos e aprovados.</div></div>'
          : `<div class="rx-lista">
              ${categorias
                .map(
                  (c) => `
                <div class="rx-linha">
                  <div class="rx-linha__topo">
                    <span class="rx-linha__nome">${escapeHtml(c.categoria)}</span>
                    <span class="rx-linha__qtd">${c.qtd}</span>
                  </div>
                  ${barraHorizontalSVG(c.qtd, maxQtd)}
                  <div class="rx-linha__meta">
                    <span>Erros <b>${c.erros}</b></span>
                    <span>Erros novos <b>${c.errosNovos}</b></span>
                    ${
                      c.mediaAprov != null
                        ? `<span>Aproveitamento <b>${formatarPct(c.mediaAprov)}</b></span><span>Desperdício <b>${formatarPct(c.mediaDesp)}</b></span>`
                        : ''
                    }
                  </div>
                </div>`
                )
                .join('')}
            </div>`
      }
    </div>

    <div class="card" style="margin-top:16px">
      <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:10px; flex-wrap:wrap">
        <div>
          <h3 class="section-title" style="font-size:16px">Painel de Qualidade</h3>
          <p class="section-sub" style="margin-bottom:10px">Só Erros e Erros Novos por semana — separado da produtividade</p>
        </div>
        <div class="chips">
          ${[6, 12, 26]
            .map((n) => `<button class="chip ${st.semanasQualidade === n ? 'chip--on' : ''}" data-rx-semanas="${n}">${n} sem.</button>`)
            .join('')}
        </div>
      </div>
      ${graficoLinhaSVG(
        faixas.map((f) => f.rotulo),
        [
          { nome: 'Erros', valores: serieErros, cor: '#7A1F2B' },
          { nome: 'Erros novos', valores: serieNovos, cor: '#9A6B08', tracejado: true },
        ],
        { minMaximo: 2 }
      )}
      <div class="row__meta" style="margin-top:10px; text-align:center">
        Nas últimas ${st.semanasQualidade} semanas: <b>${totalErrosJanela}</b> erro(s) e <b>${totalNovosJanela}</b> erro(s) novo(s) em ${totalQtdJanela} serviço(s)
        ${totalQtdJanela ? ` · ${formatarNumero((totalErrosJanela + totalNovosJanela) / totalQtdJanela, 2)} por serviço` : ''}
      </div>
    </div>
  `;

  cont.querySelectorAll('[data-rx-semanas]').forEach((btn) =>
    btn.addEventListener('click', () => {
      st.semanasQualidade = Number(btn.dataset.rxSemanas);
      renderRaioX(view);
    })
  );
}

/* ---------------- COMPARAR EQUIPE (só Admin) ---------------- */

async function renderRaioXComparar(cont, view, funcionarios, doPeriodo, itensTodos) {
  const st = RaioXView;
  const categorias = Analise.porCategoria(doPeriodo).map((c) => c.categoria);
  const porFunc = funcionarios.map((f) => {
    const itens = doPeriodo.filter((i) => i.funcionarioId === f.id);
    const mapaCat = {};
    Analise.porCategoria(itens).forEach((c) => (mapaCat[c.categoria] = c));
    return { f, itens, totais: Analise.totais(itens), mapaCat };
  });

  const faixas = await Analise.faixasSemanais(st.semanasQualidade, Date.now());
  const seriesQualidade = funcionarios.map((f, i) => ({
    nome: primeiroNome(f.nome),
    cor: corDaSerie(i),
    valores: faixas.map((fx) =>
      itensTodos
        .filter((it) => it.funcionarioId === f.id && it.dataFinal >= fx.inicio && it.dataFinal < fx.fim)
        .reduce((s, it) => s + it.erros + it.errosNovos, 0)
    ),
  }));

  const topCategorias = categorias.slice(0, 10);

  cont.innerHTML = `
    <div class="card">
      <h3 class="section-title" style="font-size:16px">Serviços por categoria — equipe</h3>
      <p class="section-sub">Quantidade de cada categoria, por pessoa</p>
      ${
        categorias.length === 0
          ? '<div class="empty" style="padding:24px 8px"><div class="empty__title">Nada concluído nesse período</div></div>'
          : barrasAgrupadasSVG(
              topCategorias,
              porFunc.map((p, i) => ({ nome: primeiroNome(p.f.nome), cor: corDaSerie(i), valores: topCategorias.map((c) => (p.mapaCat[c] ? p.mapaCat[c].qtd : 0)) })),
              { rotulosInclinados: true }
            )
      }
      ${
        categorias.length
          ? `<div class="tabela-wrap" style="margin-top:14px">
              <table class="tabela">
                <thead><tr><th>Categoria</th>${porFunc.map((p) => `<th class="num">${escapeHtml(primeiroNome(p.f.nome))}</th>`).join('')}<th class="num">Total</th></tr></thead>
                <tbody>
                  ${categorias
                    .map(
                      (c) => `<tr><td>${escapeHtml(c)}</td>${porFunc
                        .map((p) => `<td class="num">${p.mapaCat[c] ? p.mapaCat[c].qtd : 0}</td>`)
                        .join('')}<td class="num"><b>${porFunc.reduce((s, p) => s + (p.mapaCat[c] ? p.mapaCat[c].qtd : 0), 0)}</b></td></tr>`
                    )
                    .join('')}
                  <tr class="tabela__total"><td>Total</td>${porFunc.map((p) => `<td class="num">${p.totais.qtd}</td>`).join('')}<td class="num">${doPeriodo.filter((i) => porFunc.some((p) => p.f.id === i.funcionarioId)).length}</td></tr>
                </tbody>
              </table>
            </div>`
          : ''
      }
    </div>

    <div class="card" style="margin-top:16px">
      <h3 class="section-title" style="font-size:16px">Qualidade — equipe</h3>
      <p class="section-sub">Erros, erros novos e aproveitamento no período</p>
      <div class="tabela-wrap">
        <table class="tabela">
          <thead><tr><th>Funcionário</th><th class="num">Serviços</th><th class="num">Erros</th><th class="num">Erros novos</th><th class="num">Erros / serviço</th><th class="num">Aprov. médio</th><th class="num">Desperd. médio</th></tr></thead>
          <tbody>
            ${porFunc
              .map(
                (p) => `<tr>
                  <td><span style="display:inline-flex; align-items:center; gap:8px">${avatarUsuario(p.f, 26)}${escapeHtml(p.f.nome)}</span></td>
                  <td class="num">${p.totais.qtd}</td>
                  <td class="num">${p.totais.erros}</td>
                  <td class="num">${p.totais.errosNovos}</td>
                  <td class="num">${p.totais.qtd ? formatarNumero((p.totais.erros + p.totais.errosNovos) / p.totais.qtd, 2) : '—'}</td>
                  <td class="num">${formatarPct(p.totais.mediaAprov)}</td>
                  <td class="num">${p.totais.mediaAprov != null ? formatarPct(100 - p.totais.mediaAprov) : '—'}</td>
                </tr>`
              )
              .join('')}
          </tbody>
        </table>
      </div>

      <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap; margin-top:18px">
        <b style="font-size:14px">Erros + erros novos por semana</b>
        <div class="chips">
          ${[6, 12, 26]
            .map((n) => `<button class="chip ${st.semanasQualidade === n ? 'chip--on' : ''}" data-rx-semanas="${n}">${n} sem.</button>`)
            .join('')}
        </div>
      </div>
      <div style="margin-top:10px">
        ${graficoLinhaSVG(faixas.map((f) => f.rotulo), seriesQualidade, { minMaximo: 2 })}
      </div>
    </div>
  `;

  cont.querySelectorAll('[data-rx-semanas]').forEach((btn) =>
    btn.addEventListener('click', () => {
      st.semanasQualidade = Number(btn.dataset.rxSemanas);
      renderRaioX(view);
    })
  );
}
