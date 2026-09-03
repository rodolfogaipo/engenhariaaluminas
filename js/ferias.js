/* =========================================================
   ferias.js — Férias
   Só o Admin cadastra períodos de férias por funcionário.
   O motor de cálculo (Metrics) passa a ignorar, na Meta e na Nota,
   as semanas em que o funcionário estava de férias.
   ========================================================= */

const FeriasView = {
  subView: 'lista', // 'lista' | 'form'
  formState: null,
};

async function renderFerias(view) {
  if (FeriasView.subView === 'form' && Auth.isAdmin()) {
    return renderFeriasForm(view);
  }
  return renderFeriasLista(view);
}

/* ---------------- LISTA ---------------- */

async function renderFeriasLista(view) {
  const user = Auth.current;
  const [todas, usuarios] = await Promise.all([DB.getAll('ferias'), DB.getAll('usuarios')]);
  const usuariosPorId = Object.fromEntries(usuarios.map((u) => [u.id, u]));

  const minhas = user.tipo === 'admin' ? todas : todas.filter((f) => f.funcionarioId === user.id);
  const ordenadas = minhas.sort((a, b) => (b.dataInicio || 0) - (a.dataInicio || 0));

  const agora = Date.now();

  view.innerHTML = `
    <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:16px; flex-wrap:wrap">
      <div>
        <h2 class="section-title" style="margin-bottom:2px">Férias</h2>
        <p class="section-sub" style="margin:0">${user.tipo === 'admin' ? 'Períodos de férias da equipe' : 'Seus períodos de férias'}</p>
      </div>
      ${Auth.isAdmin() ? '<button class="btn btn--primary" id="btn-nova-ferias">+ Novo Período</button>' : ''}
    </div>

    <div id="lista-ferias"></div>
  `;

  if (Auth.isAdmin()) {
    document.getElementById('btn-nova-ferias').addEventListener('click', () => {
      FeriasView.subView = 'form';
      FeriasView.formState = criarEstadoFeriasVazio();
      renderView('ferias');
    });
  }

  const listaEl = document.getElementById('lista-ferias');
  if (ordenadas.length === 0) {
    listaEl.innerHTML = `
      <div class="card">
        <div class="empty">
          <div class="empty__title">Nenhum período de férias cadastrado</div>
          <div class="empty__sub">${Auth.isAdmin() ? 'Toque em "+ Novo Período" para cadastrar.' : 'Quando o administrador cadastrar suas férias, aparecem aqui.'}</div>
        </div>
      </div>`;
    return;
  }

  listaEl.innerHTML = `
    <div class="card" style="padding:0">
      ${ordenadas
        .map((f) => {
          const func = usuariosPorId[f.funcionarioId];
          const emAndamento = agora >= f.dataInicio && agora <= f.dataFim;
          const statusBadge = emAndamento
            ? '<span class="badge badge--ok">🏖️ Em andamento</span>'
            : agora > f.dataFim
            ? '<span class="badge badge--idle">Encerrado</span>'
            : '<span class="badge badge--brand">Programado</span>';
          const acoesAdmin = Auth.isAdmin()
            ? `
            <div style="display:flex; gap:6px">
              <button class="btn btn--ghost" data-editar="${f.id}" style="padding:6px 12px; font-size:13px">Editar</button>
              <button class="btn btn--danger" data-excluir="${f.id}" style="padding:6px 12px; font-size:13px">Excluir</button>
            </div>`
            : '';
          return `
          <div class="row" style="padding:14px 18px; flex-wrap:wrap; gap:10px">
            <div class="row__main">
              <div class="row__title">${escapeHtml(func ? func.nome : 'Funcionário removido')}</div>
              <div class="row__meta">${Const.formatarData(f.dataInicio)} até ${Const.formatarData(f.dataFim)}</div>
            </div>
            <div style="display:flex; flex-direction:column; align-items:flex-end; gap:8px">
              ${statusBadge}
              ${acoesAdmin}
            </div>
          </div>`;
        })
        .join('')}
    </div>
  `;

  if (!Auth.isAdmin()) return;

  listaEl.querySelectorAll('[data-editar]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const f = await DB.get('ferias', btn.dataset.editar);
      if (!f) return;
      FeriasView.subView = 'form';
      FeriasView.formState = await criarEstadoFeriasEdicao(f);
      renderView('ferias');
    });
  });

  listaEl.querySelectorAll('[data-excluir]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('Excluir este período de férias?')) return;
      await DB.delete('ferias', btn.dataset.excluir);
      renderFeriasLista(view);
    });
  });
}

/* ---------------- FORMULÁRIO (Admin) ---------------- */

function criarEstadoFeriasVazio() {
  return {
    editId: null,
    funcionarioId: '',
    dataInicio: '',
    dataFim: '',
    erro: '',
    usuarios: [],
  };
}

async function criarEstadoFeriasEdicao(f) {
  return {
    editId: f.id,
    funcionarioId: f.funcionarioId,
    dataInicio: dataParaInputDate(f.dataInicio),
    dataFim: dataParaInputDate(f.dataFim),
    erro: '',
    usuarios: [],
  };
}

async function renderFeriasForm(view) {
  const st = FeriasView.formState;
  st.usuarios = await DB.getAll('usuarios');
  const editando = !!st.editId;

  view.innerHTML = `
    <div style="display:flex; align-items:center; gap:10px; margin-bottom:16px">
      <button class="topbar__icon-btn" id="btn-voltar-ferias" aria-label="Voltar" style="background:var(--paper-dim)">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="20" height="20"><path d="M15 18l-6-6 6-6"/></svg>
      </button>
      <h2 class="section-title" style="margin:0">${editando ? 'Editar Período' : 'Novo Período de Férias'}</h2>
    </div>

    ${st.erro ? `<div class="auth__error show" style="text-align:left; margin-bottom:16px">${escapeHtml(st.erro)}</div>` : ''}

    <div class="card">
      <div class="field">
        <label for="f-func-ferias">Funcionário</label>
        <select id="f-func-ferias">
          <option value="">Selecione…</option>
          ${st.usuarios.map((u) => `<option value="${u.id}" ${u.id === st.funcionarioId ? 'selected' : ''}>${escapeHtml(u.nome)}</option>`).join('')}
        </select>
      </div>

      <div style="display:flex; gap:12px">
        <div class="field" style="flex:1">
          <label for="f-inicio-ferias">Data Início</label>
          <input id="f-inicio-ferias" type="date" value="${escapeHtml(st.dataInicio)}" />
        </div>
        <div class="field" style="flex:1">
          <label for="f-fim-ferias">Data Fim</label>
          <input id="f-fim-ferias" type="date" value="${escapeHtml(st.dataFim)}" />
        </div>
      </div>

      <div class="row__meta" style="margin-bottom:14px">As semanas dentro deste período não vão contar contra a Meta e a Nota do funcionário no Dashboard.</div>

      <div style="display:flex; gap:10px">
        <button class="btn btn--ghost" id="btn-cancelar-ferias" style="flex:1">Cancelar</button>
        <button class="btn btn--primary" id="btn-salvar-ferias" style="flex:2">Salvar</button>
      </div>
    </div>
  `;

  document.getElementById('btn-voltar-ferias').addEventListener('click', voltarParaListaFerias);
  document.getElementById('btn-cancelar-ferias').addEventListener('click', voltarParaListaFerias);
  document.getElementById('f-func-ferias').addEventListener('change', (ev) => (st.funcionarioId = ev.target.value));
  document.getElementById('f-inicio-ferias').addEventListener('input', (ev) => (st.dataInicio = ev.target.value));
  document.getElementById('f-fim-ferias').addEventListener('input', (ev) => (st.dataFim = ev.target.value));

  document.getElementById('btn-salvar-ferias').addEventListener('click', () => salvarFerias(view));
}

function voltarParaListaFerias() {
  FeriasView.subView = 'lista';
  FeriasView.formState = null;
  renderView('ferias');
}

async function salvarFerias(view) {
  const st = FeriasView.formState;

  if (!st.funcionarioId) {
    st.erro = 'Selecione o funcionário.';
    return renderFeriasForm(view);
  }
  if (!st.dataInicio || !st.dataFim) {
    st.erro = 'Informe a data de início e a data de fim.';
    return renderFeriasForm(view);
  }

  const inicio = Const.inputDateParaTimestamp(st.dataInicio);
  const fim = Const.inputDateParaTimestamp(st.dataFim);
  if (fim < inicio) {
    st.erro = 'A data de fim não pode ser antes da data de início.';
    return renderFeriasForm(view);
  }

  const func = st.usuarios.find((u) => u.id === st.funcionarioId);
  const registro = st.editId ? await DB.get('ferias', st.editId) : { id: dbUtil.uid(), criadoEm: Date.now() };

  registro.funcionarioId = st.funcionarioId;
  registro.funcionarioNome = func ? func.nome : '';
  registro.dataInicio = inicio;
  registro.dataFim = fim + 24 * 60 * 60 * 1000 - 1; // até o fim do último dia

  await DB.put('ferias', registro);
  voltarParaListaFerias();
}
