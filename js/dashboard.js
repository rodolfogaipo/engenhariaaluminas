/* =========================================================
   dashboard.js — Início
   Funcionário: vê o próprio desempenho (Nota, %Meta, Tendência).
   Admin: vê o comparativo da equipe (ranking, meta semanal/mensal,
   % atingido de cada funcionário) — a produção do próprio Admin
   fica numa aba separada ("Minha Produção"), fora do ranking, já
   que é ele quem avalia e premia a equipe.
   ========================================================= */

const DashboardAdminView = {
  modo: 'equipe', // 'equipe' | 'minha'
  periodoTipo: 'semana', // 'semana' | 'mes'
  dataReferencia: Date.now(), // qualquer dia dentro da semana/mês visualizado
};

async function renderDashboard(view) {
  const user = Auth.current;

  if (!Auth.isAdmin()) {
    return renderDashboardIndividual(view, user.id, user.nome, 'Seu desempenho');
  }

  view.innerHTML = `
    <h2 class="section-title">Início</h2>
    <div style="display:flex; gap:8px; margin-bottom:18px; flex-wrap:wrap">
      <button class="btn ${DashboardAdminView.modo === 'equipe' ? 'btn--primary' : 'btn--ghost'}" id="btn-modo-equipe">Equipe</button>
      <button class="btn ${DashboardAdminView.modo === 'aproveitamento' ? 'btn--primary' : 'btn--ghost'}" id="btn-modo-aproveitamento">Aproveitamento</button>
      <button class="btn ${DashboardAdminView.modo === 'minha' ? 'btn--primary' : 'btn--ghost'}" id="btn-modo-minha">Minha Produção</button>
    </div>
    <div id="dash-conteudo"></div>
  `;

  document.getElementById('btn-modo-aproveitamento').addEventListener('click', () => {
    DashboardAdminView.modo = 'aproveitamento';
    renderDashboard(view);
  });
  document.getElementById('btn-modo-equipe').addEventListener('click', () => {
    DashboardAdminView.modo = 'equipe';
    renderDashboard(view);
  });
  document.getElementById('btn-modo-minha').addEventListener('click', () => {
    DashboardAdminView.modo = 'minha';
    renderDashboard(view);
  });

  const cont = document.getElementById('dash-conteudo');
  if (DashboardAdminView.modo === 'minha') {
    return renderDashboardIndividual(cont, user.id, user.nome, 'Sua produção pessoal — não entra no comparativo da equipe', true);
  }
  if (DashboardAdminView.modo === 'aproveitamento') {
    return renderDashboardAproveitamento(cont);
  }
  return renderDashboardEquipe(cont);
}

/* ---------------- APROVEITAMENTO POR CATEGORIA (Admin) ---------------- */

const DashboardAproveitamentoView = {
  periodoTipo: 'semana', // 'semana' | 'mes' | 'ano'
  dataReferencia: Date.now(),
};

async function renderDashboardAproveitamento(cont) {
  const st = DashboardAproveitamentoView;

  cont.innerHTML = `
    <div class="card" style="margin-bottom:16px">
      <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap">
        <div style="display:flex; gap:8px">
          <button class="btn ${st.periodoTipo === 'semana' ? 'btn--primary' : 'btn--ghost'}" id="btn-aprov-semana" style="padding:8px 12px; font-size:13px">Semana</button>
          <button class="btn ${st.periodoTipo === 'mes' ? 'btn--primary' : 'btn--ghost'}" id="btn-aprov-mes" style="padding:8px 12px; font-size:13px">Mês</button>
          <button class="btn ${st.periodoTipo === 'ano' ? 'btn--primary' : 'btn--ghost'}" id="btn-aprov-ano" style="padding:8px 12px; font-size:13px">Ano</button>
        </div>
        <div style="display:flex; align-items:center; gap:10px">
          <button class="topbar__icon-btn" id="btn-aprov-anterior" style="background:var(--paper-dim)" aria-label="Período anterior">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><path d="M15 18l-6-6 6-6"/></svg>
          </button>
          <span id="rotulo-aprov" style="font-weight:600; font-size:14px; min-width:130px; text-align:center"></span>
          <button class="topbar__icon-btn" id="btn-aprov-proximo" style="background:var(--paper-dim)" aria-label="Próximo período">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><path d="M9 18l6-6-6-6"/></svg>
          </button>
        </div>
      </div>
    </div>
    <div id="aprov-conteudo"><div class="wip">${ICONS.wip}<b>Calculando…</b></div></div>
  `;

  document.getElementById('rotulo-aprov').textContent = rotuloPeriodoAprov();

  document.getElementById('btn-aprov-semana').addEventListener('click', () => {
    st.periodoTipo = 'semana';
    renderDashboardAproveitamento(cont);
  });
  document.getElementById('btn-aprov-mes').addEventListener('click', () => {
    st.periodoTipo = 'mes';
    renderDashboardAproveitamento(cont);
  });
  document.getElementById('btn-aprov-ano').addEventListener('click', () => {
    st.periodoTipo = 'ano';
    renderDashboardAproveitamento(cont);
  });
  document.getElementById('btn-aprov-anterior').addEventListener('click', () => {
    navegarPeriodoAprov(-1);
    renderDashboardAproveitamento(cont);
  });
  const btnProximo = document.getElementById('btn-aprov-proximo');
  btnProximo.disabled = await periodoAprovEhAtualOuFuturo();
  btnProximo.addEventListener('click', () => {
    navegarPeriodoAprov(1);
    renderDashboardAproveitamento(cont);
  });

  await renderAproveitamentoConteudo(document.getElementById('aprov-conteudo'));
}

function rotuloPeriodoAprov() {
  const st = DashboardAproveitamentoView;
  const d = new Date(st.dataReferencia);
  if (st.periodoTipo === 'ano') return String(d.getFullYear());
  if (st.periodoTipo === 'mes') return d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  const pad = (n) => String(n).padStart(2, '0');
  const diaSemana = d.getDay();
  const inicio = new Date(d);
  inicio.setDate(d.getDate() - diaSemana);
  const fim = new Date(inicio);
  fim.setDate(inicio.getDate() + 6);
  return `${pad(inicio.getDate())}/${pad(inicio.getMonth() + 1)} a ${pad(fim.getDate())}/${pad(fim.getMonth() + 1)}`;
}

function navegarPeriodoAprov(direcao) {
  const st = DashboardAproveitamentoView;
  const d = new Date(st.dataReferencia);
  if (st.periodoTipo === 'ano') {
    d.setFullYear(d.getFullYear() + direcao);
  } else if (st.periodoTipo === 'mes') {
    d.setDate(1);
    d.setMonth(d.getMonth() + direcao);
  } else {
    d.setDate(d.getDate() + direcao * 7);
  }
  st.dataReferencia = d.getTime();
}

async function periodoAprovEhAtualOuFuturo() {
  const st = DashboardAproveitamentoView;
  const d = new Date(st.dataReferencia);
  const hoje = new Date();
  if (st.periodoTipo === 'ano') return d.getFullYear() === hoje.getFullYear();
  if (st.periodoTipo === 'mes') return d.getFullYear() === hoje.getFullYear() && d.getMonth() === hoje.getMonth();
  // semana: compara início da semana (domingo) de ambas as datas
  const inicioSemana = (data) => {
    const x = new Date(data);
    x.setDate(x.getDate() - x.getDay());
    x.setHours(0, 0, 0, 0);
    return x.getTime();
  };
  return inicioSemana(st.dataReferencia) === inicioSemana(hoje.getTime());
}

function intervaloPeriodoAprov() {
  const st = DashboardAproveitamentoView;
  const d = new Date(st.dataReferencia);
  if (st.periodoTipo === 'ano') {
    return { inicio: new Date(d.getFullYear(), 0, 1).getTime(), fim: new Date(d.getFullYear() + 1, 0, 1).getTime() };
  }
  if (st.periodoTipo === 'mes') {
    return { inicio: new Date(d.getFullYear(), d.getMonth(), 1).getTime(), fim: new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime() };
  }
  const inicio = new Date(d);
  inicio.setDate(d.getDate() - d.getDay());
  inicio.setHours(0, 0, 0, 0);
  const fim = new Date(inicio);
  fim.setDate(inicio.getDate() + 7);
  return { inicio: inicio.getTime(), fim: fim.getTime() };
}

async function renderAproveitamentoConteudo(cont) {
  const categorias = await Categorias.listar();
  const comAproveitamento = categorias.filter((c) => c.temPorcentagem);

  if (comAproveitamento.length === 0) {
    cont.innerHTML = `
      <div class="card">
        <div class="empty">
          <div class="empty__title">Nenhuma categoria com % Aproveitamento</div>
          <div class="empty__sub">Crie categorias com essa opção marcada em Admin → Categorias.</div>
        </div>
      </div>`;
    return;
  }

  const { inicio, fim } = intervaloPeriodoAprov();
  const linhas = await Promise.all(
    comAproveitamento.map(async (c) => ({
      categoria: c.nome,
      resultado: await Metrics.mediaAproveitamento(c.nome, inicio, fim),
    }))
  );

  cont.innerHTML = `
    <p class="section-sub" style="margin-top:0">Média de % Aproveitamento no período — o número entre parênteses é a quantidade de cortes.</p>
    <div class="card" style="padding:0">
      ${linhas
        .map(
          (l) => `
        <div class="row" style="padding:14px 18px">
          <div class="row__main">
            <div class="row__title">${escapeHtml(l.categoria)}</div>
          </div>
          <div class="row__title" style="font-size:15px">${l.resultado.media == null ? '—' : `${l.resultado.media.toFixed(1)}% (${l.resultado.quantidade})`}</div>
        </div>`
        )
        .join('')}
    </div>
  `;
}

/* ---------------- COMPARATIVO DE EQUIPE (Admin) ---------------- */

async function renderDashboardEquipe(cont) {
  cont.innerHTML = `
    <div class="card" style="margin-bottom:16px">
      <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap">
        <div style="display:flex; gap:8px">
          <button class="btn ${DashboardAdminView.periodoTipo === 'semana' ? 'btn--primary' : 'btn--ghost'}" id="btn-periodo-semana" style="padding:8px 14px; font-size:13px">Semana</button>
          <button class="btn ${DashboardAdminView.periodoTipo === 'mes' ? 'btn--primary' : 'btn--ghost'}" id="btn-periodo-mes" style="padding:8px 14px; font-size:13px">Mês</button>
          <button class="btn ${DashboardAdminView.periodoTipo === 'ano' ? 'btn--primary' : 'btn--ghost'}" id="btn-periodo-ano" style="padding:8px 14px; font-size:13px">Ano</button>
        </div>
        <div style="display:flex; align-items:center; gap:10px">
          <button class="topbar__icon-btn" id="btn-periodo-anterior" style="background:var(--paper-dim)" aria-label="Período anterior">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><path d="M15 18l-6-6 6-6"/></svg>
          </button>
          <span id="rotulo-periodo" style="font-weight:600; font-size:14px; min-width:150px; text-align:center"></span>
          <button class="topbar__icon-btn" id="btn-periodo-proximo" style="background:var(--paper-dim)" aria-label="Próximo período">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><path d="M9 18l6-6-6-6"/></svg>
          </button>
        </div>
      </div>
    </div>
    <div id="dash-equipe-conteudo"><div class="wip">${ICONS.wip}<b>Calculando…</b></div></div>
  `;

  document.getElementById('rotulo-periodo').textContent = await rotuloPeriodo();

  document.getElementById('btn-periodo-semana').addEventListener('click', () => {
    DashboardAdminView.periodoTipo = 'semana';
    renderDashboardEquipe(cont);
  });
  document.getElementById('btn-periodo-mes').addEventListener('click', () => {
    DashboardAdminView.periodoTipo = 'mes';
    renderDashboardEquipe(cont);
  });
  document.getElementById('btn-periodo-ano').addEventListener('click', () => {
    DashboardAdminView.periodoTipo = 'ano';
    renderDashboardEquipe(cont);
  });
  document.getElementById('btn-periodo-anterior').addEventListener('click', () => {
    navegarPeriodo(-1);
    renderDashboardEquipe(cont);
  });
  const btnProximo = document.getElementById('btn-periodo-proximo');
  btnProximo.disabled = await periodoEhAtualOuFuturo();
  btnProximo.addEventListener('click', () => {
    navegarPeriodo(1);
    renderDashboardEquipe(cont);
  });

  await renderDashboardEquipeConteudo(document.getElementById('dash-equipe-conteudo'));
}

async function rotuloPeriodo() {
  const d = new Date(DashboardAdminView.dataReferencia);
  if (DashboardAdminView.periodoTipo === 'ano') {
    return String(d.getFullYear());
  }
  if (DashboardAdminView.periodoTipo === 'mes') {
    return d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  }
  const indice = await Metrics.indiceSemana(DashboardAdminView.dataReferencia);
  const { inicio, fim } = await Metrics.rangeDaSemanaPorIndice(indice);
  const inicioD = new Date(inicio);
  const fimD = new Date(fim - 1);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(inicioD.getDate())}/${pad(inicioD.getMonth() + 1)} a ${pad(fimD.getDate())}/${pad(fimD.getMonth() + 1)}`;
}

function navegarPeriodo(direcao) {
  const d = new Date(DashboardAdminView.dataReferencia);
  if (DashboardAdminView.periodoTipo === 'ano') {
    d.setFullYear(d.getFullYear() + direcao);
  } else if (DashboardAdminView.periodoTipo === 'mes') {
    d.setDate(1);
    d.setMonth(d.getMonth() + direcao);
  } else {
    d.setDate(d.getDate() + direcao * 7);
  }
  DashboardAdminView.dataReferencia = d.getTime();
}

async function periodoEhAtualOuFuturo() {
  const agora = Date.now();
  if (DashboardAdminView.periodoTipo === 'ano') {
    const d = new Date(DashboardAdminView.dataReferencia);
    return d.getFullYear() === new Date().getFullYear();
  }
  if (DashboardAdminView.periodoTipo === 'mes') {
    const d = new Date(DashboardAdminView.dataReferencia);
    const hoje = new Date();
    return d.getFullYear() === hoje.getFullYear() && d.getMonth() === hoje.getMonth();
  }
  const indiceRef = await Metrics.indiceSemana(DashboardAdminView.dataReferencia);
  const indiceAgora = await Metrics.indiceSemana(agora);
  return indiceRef === indiceAgora;
}

async function renderDashboardEquipeConteudo(cont) {
  const usuarios = await DB.getAll('usuarios');
  const funcionarios = usuarios.filter((u) => u.tipo !== 'admin');

  if (funcionarios.length === 0) {
    cont.innerHTML = `
      <div class="card">
        <div class="empty">
          <div class="empty__title">Nenhum funcionário cadastrado</div>
          <div class="empty__sub">Cadastre a equipe em Admin → Usuários pra ver o comparativo aqui.</div>
        </div>
      </div>`;
    return;
  }

  const dataRef = DashboardAdminView.dataReferencia;
  const modoMes = DashboardAdminView.periodoTipo === 'mes';
  const modoAno = DashboardAdminView.periodoTipo === 'ano';

  const linhas = await Promise.all(
    funcionarios.map(async (f) => {
      // a "nota" e a "meta semanal" sempre vêm da semana que contém a data de
      // referência — em modo mês/ano, usamos o meta semanal como base pra
      // estimar a meta do período (meta semanal × semanas do período)
      const resumo = await Metrics.resumoSemanal(f.id, 1, dataRef);
      const atual = resumo.atual;

      if (!modoMes && !modoAno) {
        return {
          usuario: f,
          emFerias: atual.emFerias,
          projetos: atual.projetos,
          meta: atual.meta,
          pctMeta: atual.pctMeta,
          nota: atual.nota,
        };
      }

      const d = new Date(dataRef);
      if (modoAno) {
        const projetosAno = await Metrics.totalAnoEspecifico(f.id, d.getFullYear());
        const metaAno = atual.meta * 52.14; // média de semanas por ano
        return {
          usuario: f,
          emFerias: false,
          projetos: projetosAno,
          meta: metaAno,
          pctMeta: metaAno > 0 ? projetosAno / metaAno : 0,
          nota: atual.nota,
        };
      }

      const projetosMes = await Metrics.totalMesEspecifico(f.id, d.getFullYear(), d.getMonth());
      const metaMes = atual.meta * 4.345;
      return {
        usuario: f,
        emFerias: false,
        projetos: projetosMes,
        meta: metaMes,
        pctMeta: metaMes > 0 ? projetosMes / metaMes : 0,
        nota: atual.nota,
      };
    })
  );

  linhas.sort((a, b) => {
    if (a.emFerias && !b.emFerias) return 1;
    if (!a.emFerias && b.emFerias) return -1;
    return (b.pctMeta || 0) - (a.pctMeta || 0);
  });

  const medalhas = ['🥇', '🥈', '🥉'];
  const dadosGrafico = linhas.map((l) => ({
    label: primeiroNome(l.usuario.nome),
    value: l.emFerias ? 0 : Math.round((l.pctMeta || 0) * 100),
  }));

  cont.innerHTML = `
    <div class="card">
      <h3 class="section-title" style="font-size:16px; margin-bottom:14px">% da Meta no período, por funcionário</h3>
      <div id="grafico-equipe"></div>
    </div>

    <div class="card" style="margin-top:16px; padding:0">
      ${linhas
        .map((l, i) => {
          const posicao = l.emFerias ? '—' : medalhas[i] || `${i + 1}º`;
          return `
          <div class="row" style="padding:14px 18px; align-items:flex-start; flex-wrap:wrap; gap:10px">
            <div class="row__main" style="flex:1 1 200px">
              <div class="row__title">${posicao} ${escapeHtml(l.usuario.nome)}</div>
              ${
                l.emFerias
                  ? '<div class="row__meta">🏖️ De férias neste período</div>'
                  : `<div class="row__meta">${l.projetos} / ${l.meta.toFixed(1)} projetos · ${(l.pctMeta * 100).toFixed(0)}% da meta</div>`
              }
            </div>
            <div>${l.emFerias ? '' : `<span class="badge ${l.pctMeta >= 1 ? 'badge--ok' : l.pctMeta >= 0.7 ? 'badge--warn' : 'badge--danger'}">Nota ${l.nota.toFixed(0)}</span>`}</div>
          </div>`;
        })
        .join('')}
    </div>

    ${modoMes ? '<div class="row__meta" style="margin-top:14px; text-align:center">Meta do mês é uma aproximação (meta semanal × 4,345 semanas).</div>' : ''}
    ${modoAno ? '<div class="row__meta" style="margin-top:14px; text-align:center">Meta do ano é uma aproximação (meta semanal × 52,14 semanas).</div>' : ''}
  `;

  document.getElementById('grafico-equipe').innerHTML = graficoBarrasSVG(dadosGrafico, 100, '%');
}

function primeiroNome(nomeCompleto) {
  return (nomeCompleto || '').split(' ')[0];
}

/* ---------------- DESEMPENHO INDIVIDUAL (Funcionário, ou Admin em "Minha Produção") ---------------- */

const IndividualDashboardView = {
  periodoTipo: 'semana', // 'semana' | 'mes' | 'ano'
  dataReferencia: Date.now(),
};

function rotuloPeriodoIndividual() {
  const st = IndividualDashboardView;
  const d = new Date(st.dataReferencia);
  if (st.periodoTipo === 'ano') return String(d.getFullYear());
  if (st.periodoTipo === 'mes') return d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  const dia = d.getDay();
  const inicio = new Date(d);
  inicio.setDate(d.getDate() - dia);
  const fim = new Date(inicio);
  fim.setDate(inicio.getDate() + 6);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(inicio.getDate())}/${pad(inicio.getMonth() + 1)} a ${pad(fim.getDate())}/${pad(fim.getMonth() + 1)}`;
}

function navegarPeriodoIndividual(direcao) {
  const st = IndividualDashboardView;
  const d = new Date(st.dataReferencia);
  if (st.periodoTipo === 'ano') {
    d.setFullYear(d.getFullYear() + direcao);
  } else if (st.periodoTipo === 'mes') {
    d.setDate(1);
    d.setMonth(d.getMonth() + direcao);
  } else {
    d.setDate(d.getDate() + direcao * 7);
  }
  st.dataReferencia = d.getTime();
}

function periodoIndividualEhAtualOuFuturo() {
  const st = IndividualDashboardView;
  const d = new Date(st.dataReferencia);
  const hoje = new Date();
  if (st.periodoTipo === 'ano') return d.getFullYear() === hoje.getFullYear();
  if (st.periodoTipo === 'mes') return d.getFullYear() === hoje.getFullYear() && d.getMonth() === hoje.getMonth();
  const inicioSemana = (data) => {
    const x = new Date(data);
    x.setDate(x.getDate() - x.getDay());
    x.setHours(0, 0, 0, 0);
    return x.getTime();
  };
  return inicioSemana(st.dataReferencia) === inicioSemana(hoje.getTime());
}

async function renderDashboardIndividual(view, userId, nomeExibicao, subtitulo, ehModoAdmin) {
  const st = IndividualDashboardView;

  view.innerHTML = `
    ${!ehModoAdmin ? `<h2 class="section-title">Olá, ${escapeHtml(primeiroNome(nomeExibicao))}</h2>` : ''}
    <p class="section-sub" style="margin-bottom:14px">${subtitulo}</p>

    <div class="card" style="margin-bottom:16px">
      <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap">
        <div style="display:flex; gap:8px">
          <button class="btn ${st.periodoTipo === 'semana' ? 'btn--primary' : 'btn--ghost'}" id="btn-ind-semana" style="padding:8px 12px; font-size:13px">Semana</button>
          <button class="btn ${st.periodoTipo === 'mes' ? 'btn--primary' : 'btn--ghost'}" id="btn-ind-mes" style="padding:8px 12px; font-size:13px">Mês</button>
          <button class="btn ${st.periodoTipo === 'ano' ? 'btn--primary' : 'btn--ghost'}" id="btn-ind-ano" style="padding:8px 12px; font-size:13px">Ano</button>
        </div>
        <div style="display:flex; align-items:center; gap:10px">
          <button class="topbar__icon-btn" id="btn-ind-anterior" style="background:var(--paper-dim)" aria-label="Período anterior">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><path d="M15 18l-6-6 6-6"/></svg>
          </button>
          <span id="rotulo-ind" style="font-weight:600; font-size:14px; min-width:130px; text-align:center">${rotuloPeriodoIndividual()}</span>
          <button class="topbar__icon-btn" id="btn-ind-proximo" style="background:var(--paper-dim)" aria-label="Próximo período">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><path d="M9 18l6-6-6-6"/></svg>
          </button>
        </div>
      </div>
    </div>

    <div id="dash-conteudo-individual">
      <div class="wip">${ICONS.wip}<b>Calculando…</b></div>
    </div>
  `;

  document.getElementById('btn-ind-semana').addEventListener('click', () => {
    st.periodoTipo = 'semana';
    renderDashboardIndividual(view, userId, nomeExibicao, subtitulo, ehModoAdmin);
  });
  document.getElementById('btn-ind-mes').addEventListener('click', () => {
    st.periodoTipo = 'mes';
    renderDashboardIndividual(view, userId, nomeExibicao, subtitulo, ehModoAdmin);
  });
  document.getElementById('btn-ind-ano').addEventListener('click', () => {
    st.periodoTipo = 'ano';
    renderDashboardIndividual(view, userId, nomeExibicao, subtitulo, ehModoAdmin);
  });
  document.getElementById('btn-ind-anterior').addEventListener('click', () => {
    navegarPeriodoIndividual(-1);
    renderDashboardIndividual(view, userId, nomeExibicao, subtitulo, ehModoAdmin);
  });
  const btnProximo = document.getElementById('btn-ind-proximo');
  btnProximo.disabled = periodoIndividualEhAtualOuFuturo();
  btnProximo.addEventListener('click', () => {
    navegarPeriodoIndividual(1);
    renderDashboardIndividual(view, userId, nomeExibicao, subtitulo, ehModoAdmin);
  });

  const cont = document.getElementById('dash-conteudo-individual');

  if (st.periodoTipo !== 'semana') {
    return renderIndividualPeriodoLongo(cont, userId, st);
  }

  const resumo = await Metrics.resumoSemanal(userId, 6, st.dataReferencia);
  const mensal = await Metrics.totalMesCalendario(userId);
  const anual = await Metrics.totalAnoCalendario(userId);
  const atual = resumo.atual;
  const semTrabalhoNenhum = resumo.semanas.every((s) => s.projetos === 0) && mensal === 0 && anual === 0;

  if (semTrabalhoNenhum) {
    cont.innerHTML = `
      <div class="card">
        <div class="empty">
          <div class="empty__title">Ainda não há serviços concluídos</div>
          <div class="empty__sub">Os números aparecem aqui assim que houver um serviço concluído e validado em "Serviços".</div>
        </div>
      </div>
    `;
    return;
  }

  cont.innerHTML = `
    <div class="stat-grid">
      <div class="card"><div class="stat"><div class="stat__value">${atual.emFerias ? '🏖️' : atual.projetos}</div><div class="stat__label">Projetos na semana</div></div></div>
      <div class="card"><div class="stat"><div class="stat__value">${atual.emFerias ? '—' : atual.nota.toFixed(0)}</div><div class="stat__label">Nota</div></div></div>
      <div class="card"><div class="stat"><div class="stat__value">${atual.emFerias ? '—' : (atual.pctMeta * 100).toFixed(0) + '%'}</div><div class="stat__label">% da Meta</div></div></div>
      <div class="card"><div class="stat"><div class="stat__value">${resumo.tendencia.icone}</div><div class="stat__label">Tendência (${resumo.tendencia.label})</div></div></div>
    </div>

    ${atual.emFerias ? '<div class="row__meta" style="text-align:center; margin-top:10px">🏖️ De férias nesta semana — não conta contra a meta.</div>' : ''}

    <div class="card" style="margin-top:16px">
      <h3 class="section-title" style="font-size:16px; margin-bottom:14px">% da Meta nas últimas 6 semanas</h3>
      <div id="grafico-nota"></div>
    </div>

    <div class="stat-grid" style="margin-top:16px">
      <div class="card"><div class="stat"><div class="stat__value">${mensal}</div><div class="stat__label">Projetos concluídos no mês</div></div></div>
      <div class="card"><div class="stat"><div class="stat__value">${anual}</div><div class="stat__label">Projetos concluídos no ano</div></div></div>
    </div>

    <div class="row__meta" style="margin-top:14px; text-align:center">
      Meta desta semana: ${atual.meta.toFixed(1)} projetos ${atual.emFerias ? '' : `· Prazo: ${(atual.pctPrazo * 100).toFixed(0)}% · Atrasos: ${atual.atraso}`}
    </div>
  `;

  const dadosGrafico = resumo.semanas.map((s) => ({
    label: rotuloSemana(s.inicio),
    value: s.emFerias || s.pctMeta == null ? 0 : Math.round(s.pctMeta * 100),
  }));
  document.getElementById('grafico-nota').innerHTML = graficoBarrasSVG(dadosGrafico, 100, '%');
}

/* Mês/Ano: Nota e Tendência são conceitos semanais, então aqui mostramos
   uma versão mais simples — total de projetos do período e % da meta,
   igual ao estilo usado no comparativo de Equipe. */
async function renderIndividualPeriodoLongo(cont, userId, st) {
  const d = new Date(st.dataReferencia);
  const resumoSemanaAtual = await Metrics.resumoSemanal(userId, 1, st.dataReferencia);
  const metaSemanal = resumoSemanaAtual.atual.meta;

  let projetos, meta, rotuloPeriodo;
  if (st.periodoTipo === 'ano') {
    projetos = await Metrics.totalAnoEspecifico(userId, d.getFullYear());
    meta = metaSemanal * 52.14;
    rotuloPeriodo = 'no ano';
  } else {
    projetos = await Metrics.totalMesEspecifico(userId, d.getFullYear(), d.getMonth());
    meta = metaSemanal * 4.345;
    rotuloPeriodo = 'no mês';
  }
  const pctMeta = meta > 0 ? projetos / meta : 0;

  if (projetos === 0 && meta <= 4) {
    cont.innerHTML = `
      <div class="card">
        <div class="empty">
          <div class="empty__title">Nenhum serviço concluído nesse período</div>
          <div class="empty__sub">Os números aparecem aqui assim que houver um serviço concluído e validado em "Serviços".</div>
        </div>
      </div>
    `;
    return;
  }

  cont.innerHTML = `
    <div class="stat-grid">
      <div class="card"><div class="stat"><div class="stat__value">${projetos}</div><div class="stat__label">Projetos ${rotuloPeriodo}</div></div></div>
      <div class="card"><div class="stat"><div class="stat__value">${meta.toFixed(1)}</div><div class="stat__label">Meta estimada</div></div></div>
      <div class="card"><div class="stat"><div class="stat__value">${(pctMeta * 100).toFixed(0)}%</div><div class="stat__label">% da Meta</div></div></div>
    </div>
    <div class="row__meta" style="margin-top:14px; text-align:center">Meta ${rotuloPeriodo} é uma aproximação (meta semanal × ${st.periodoTipo === 'ano' ? '52,14 semanas' : '4,345 semanas'}).</div>
  `;
}

function rotuloSemana(ts) {
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
}

/* Gráfico de barras simples em SVG puro — sem biblioteca externa,
   funciona 100% offline e segue as cores do app. Largura travada
   (max-width) pra não esticar demais em telas largas, e escala
   dinâmica pra números acima de 100% (ex: %Meta) não cortarem. */
function graficoBarrasSVG(dados, valorMaxSugerido, sufixo) {
  const largura = 320;
  const altura = 130;
  const padTopo = 20;
  const padBase = 22;
  const alturaUtil = altura - padTopo - padBase;
  const gap = 10;
  const larguraBarra = (largura - gap * (dados.length + 1)) / Math.max(dados.length, 1);

  const maiorValor = Math.max(0, ...dados.map((d) => d.value));
  const valorMax = Math.max(valorMaxSugerido, maiorValor) * 1.18; // folga pro número não cortar

  const barras = dados
    .map((d, i) => {
      const h = valorMax > 0 ? (Math.max(d.value, 0) / valorMax) * alturaUtil : 0;
      const x = gap + i * (larguraBarra + gap);
      const y = padTopo + (alturaUtil - h);
      return `
        <rect x="${x}" y="${y}" width="${larguraBarra}" height="${Math.max(h, 2)}" rx="4" fill="var(--brand-700)" />
        <text x="${x + larguraBarra / 2}" y="${Math.max(y - 6, 11)}" text-anchor="middle" font-size="10" fill="var(--ink-soft)" font-family="var(--font-body)">${Math.round(d.value)}${sufixo || ''}</text>
        <text x="${x + larguraBarra / 2}" y="${altura - 5}" text-anchor="middle" font-size="9" fill="var(--ink-faint)" font-family="var(--font-body)">${d.label}</text>
      `;
    })
    .join('');

  return `<svg viewBox="0 0 ${largura} ${altura}" style="width:100%; max-width:380px; height:auto; display:block; margin:0 auto">${barras}</svg>`;
}
