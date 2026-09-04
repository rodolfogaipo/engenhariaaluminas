/* =========================================================
   corte.js — módulo de Plano de Corte
   Cada CNP lançada em Serviços já nasce aqui automaticamente,
   com status "Aguardando". Aqui se registra se/quando o corte
   foi feito — e, como tudo que o funcionário faz, toda alteração
   volta a depender de aprovação do Admin (edições feitas pelo
   próprio Admin já entram aprovadas).
   ========================================================= */

const CorteView = {
  subView: 'lista', // 'lista' | 'form'
  filtroTexto: '',
  formState: null,
};

const STATUS_CORTE = ['Aguardando', 'Em andamento', 'Concluído'];

function badgeStatusCorte(status) {
  if (status === 'Concluído') return '<span class="badge badge--ok">Concluído</span>';
  if (status === 'Em andamento') return '<span class="badge badge--warn">Em andamento</span>';
  return '<span class="badge badge--idle">Aguardando</span>';
}

async function renderCorte(view) {
  if (CorteView.subView === 'form') {
    return renderCorteForm(view);
  }
  return renderCorteLista(view);
}

/* ---------------- LISTA ---------------- */

async function renderCorteLista(view) {
  view.innerHTML = `
    <div style="margin-bottom:16px">
      <h2 class="section-title" style="margin-bottom:2px">Plano de Corte</h2>
      <p class="section-sub" style="margin:0">CNPs aprovadas entram aqui automaticamente, prontas para o corte</p>
    </div>

    <div class="field" style="margin-bottom:20px">
      <input id="busca-corte" placeholder="Buscar por produto, nº pedido ou funcionário…" value="${escapeHtml(CorteView.filtroTexto)}" />
    </div>

    <div id="lista-corte"></div>
  `;

  const buscaInput = document.getElementById('busca-corte');
  buscaInput.addEventListener('input', () => {
    CorteView.filtroTexto = buscaInput.value;
    atualizarListaCorte(view);
  });

  await atualizarListaCorte(view);
}

async function atualizarListaCorte(view) {
  const user = Auth.current;
  const todos = await DB.getAll('plano_corte');
  const filtro = Const_normaliza(CorteView.filtroTexto);

  const filtrados = todos
    .filter((p) => (user.tipo === 'pcp' ? p.status === 'Concluído' : true))
    .filter((p) => {
      if (!filtro) return true;
      return (
        Const_normaliza(p.nomeProduto).includes(filtro) ||
        Const_normaliza(p.funcionarioCNPNome).includes(filtro) ||
        Const_normaliza(p.funcionarioCorteNome).includes(filtro) ||
        Const_normaliza(p.numeroPedido).includes(filtro)
      );
    })
    .sort((a, b) => b.criadoEm - a.criadoEm);

  const listaEl = document.getElementById('lista-corte');
  if (!listaEl) return;

  if (filtrados.length === 0) {
    listaEl.innerHTML = `
      <div class="card">
        <div class="empty">
          <div class="empty__title">Nenhuma CNP em Plano de Corte ainda</div>
          <div class="empty__sub">Assim que uma CNP for lançada em Serviços, ela aparece aqui automaticamente.</div>
        </div>
      </div>`;
    return;
  }

  listaEl.innerHTML = `
    <div class="card" style="padding:0">
      ${filtrados
        .map((p) => {
          const pendenteBadge = p.aprovado !== 'aprovado' ? '<span class="badge badge--warn">Pendente aprovação</span>' : '';
          const aprovBtn =
            user.tipo === 'admin' && p.aprovado !== 'aprovado'
              ? `<button class="btn btn--ghost" data-aprovar="${p.id}" style="padding:6px 12px; font-size:13px">Aprovar</button>`
              : '';
          const editBtn =
            user.tipo === 'pcp'
              ? ''
              : `<button class="btn btn--ghost" data-editar="${p.id}" style="padding:6px 12px; font-size:13px">${user.tipo === 'admin' ? 'Editar' : 'Atualizar'}</button>`;
          const delBtn =
            user.tipo === 'admin'
              ? `<button class="btn btn--danger" data-excluir="${p.id}" style="padding:6px 12px; font-size:13px">Excluir</button>`
              : '';

          const infoCorte =
            p.funcionarioCorteNome || p.dataInicioCorte || p.dataFinalCorte
              ? `<div class="row__meta">Corte: ${escapeHtml(p.funcionarioCorteNome || '—')} · Início ${Const.formatarData(p.dataInicioCorte)} · Fim ${Const.formatarData(p.dataFinalCorte)}</div>`
              : '';

          return `
          <div class="row" style="padding:14px 18px">
            <div class="row__main">
              <div class="row__title">${escapeHtml(p.nomeProduto)}</div>
              <div class="row__meta">${p.numeroPedido ? `Nº ${escapeHtml(p.numeroPedido)} · ` : ''}CNP por ${escapeHtml(p.funcionarioCNPNome || '—')} · Chegou em ${Const.formatarData(p.dataChegada)}</div>
              ${infoCorte}
            </div>
            <div style="display:flex; align-items:center; gap:8px; flex:0 0 auto; flex-wrap:wrap; justify-content:flex-end">
              ${badgeStatusCorte(p.status)}
              ${pendenteBadge}
              ${aprovBtn}
              ${editBtn}
              ${delBtn}
            </div>
          </div>`;
        })
        .join('')}
    </div>
  `;

  listaEl.querySelectorAll('[data-aprovar]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const pc = await DB.get('plano_corte', btn.dataset.aprovar);
      if (!pc) return;
      pc.aprovado = 'aprovado';
      pc.dataAprovacao = Date.now();
      await DB.put('plano_corte', pc);
      atualizarListaCorte(view);
    });
  });

  listaEl.querySelectorAll('[data-editar]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const pc = await DB.get('plano_corte', btn.dataset.editar);
      if (!pc) return;
      CorteView.subView = 'form';
      CorteView.formState = await criarEstadoFormularioCorte(pc);
      renderView('corte');
    });
  });

  listaEl.querySelectorAll('[data-excluir]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('Excluir este registro de Plano de Corte? A CNP original em Serviços não será apagada.')) return;
      await DB.delete('plano_corte', btn.dataset.excluir);
      atualizarListaCorte(view);
    });
  });
}

/* ---------------- FORMULÁRIO ---------------- */

async function criarEstadoFormularioCorte(pc) {
  const usuarios = await DB.getAll('usuarios');
  return {
    id: pc.id,
    nomeProduto: pc.nomeProduto,
    status: pc.status,
    dataInicioCorte: dataParaInputDate(pc.dataInicioCorte),
    dataFinalCorte: dataParaInputDate(pc.dataFinalCorte),
    funcionarioCorteId: pc.funcionarioCorteId || '',
    usuarios,
    erro: '',
  };
}

async function renderCorteForm(view) {
  const st = CorteView.formState;

  view.innerHTML = `
    <div style="display:flex; align-items:center; gap:10px; margin-bottom:16px">
      <button class="topbar__icon-btn" id="btn-voltar-corte" aria-label="Voltar" style="background:var(--paper-dim)">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="20" height="20"><path d="M15 18l-6-6 6-6"/></svg>
      </button>
      <h2 class="section-title" style="margin:0">${escapeHtml(st.nomeProduto)}</h2>
    </div>

    ${st.erro ? `<div class="auth__error show" style="text-align:left; margin-bottom:16px">${escapeHtml(st.erro)}</div>` : ''}

    <div class="card">
      <div class="field">
        <label for="f-status-corte">Status do Corte</label>
        <select id="f-status-corte">
          ${STATUS_CORTE.map((s) => `<option value="${s}" ${s === st.status ? 'selected' : ''}>${s}</option>`).join('')}
        </select>
      </div>

      <div class="field">
        <label for="f-func-corte">Funcionário responsável pelo corte</label>
        <select id="f-func-corte">
          <option value="">Não definido</option>
          ${st.usuarios.map((u) => `<option value="${u.id}" ${u.id === st.funcionarioCorteId ? 'selected' : ''}>${escapeHtml(u.nome)}</option>`).join('')}
        </select>
      </div>

      <div class="field">
        <label for="f-inicio-corte">Data Início do Corte (opcional)</label>
        <input id="f-inicio-corte" type="date" value="${escapeHtml(st.dataInicioCorte)}" />
      </div>

      <div class="field">
        <label for="f-fim-corte">Data Final do Corte (opcional)</label>
        <input id="f-fim-corte" type="date" value="${escapeHtml(st.dataFinalCorte)}" />
      </div>

      <div class="row__meta" style="margin-bottom:14px">
        ${Auth.isAdmin() ? 'Como você é Admin, essa atualização já entra aprovada.' : 'Essa atualização fica pendente até o Admin aprovar.'}
      </div>

      <div style="display:flex; gap:10px">
        <button class="btn btn--ghost" id="btn-cancelar-corte" style="flex:1">Cancelar</button>
        <button class="btn btn--primary" id="btn-salvar-corte" style="flex:2">Salvar</button>
      </div>
    </div>
  `;

  document.getElementById('btn-voltar-corte').addEventListener('click', voltarParaListaCorte);
  document.getElementById('btn-cancelar-corte').addEventListener('click', voltarParaListaCorte);
  document.getElementById('f-status-corte').addEventListener('change', (ev) => (st.status = ev.target.value));
  document.getElementById('f-func-corte').addEventListener('change', (ev) => (st.funcionarioCorteId = ev.target.value));
  document.getElementById('f-inicio-corte').addEventListener('input', (ev) => (st.dataInicioCorte = ev.target.value));
  document.getElementById('f-fim-corte').addEventListener('input', (ev) => (st.dataFinalCorte = ev.target.value));

  document.getElementById('btn-salvar-corte').addEventListener('click', () => salvarCorte(view));
}

function voltarParaListaCorte() {
  CorteView.subView = 'lista';
  CorteView.formState = null;
  renderView('corte');
}

async function salvarCorte(view) {
  const st = CorteView.formState;
  const user = Auth.current;

  const pc = await DB.get('plano_corte', st.id);
  if (!pc) {
    voltarParaListaCorte();
    return;
  }

  pc.status = st.status;
  pc.dataInicioCorte = st.dataInicioCorte ? Const.inputDateParaTimestamp(st.dataInicioCorte) : null;
  pc.dataFinalCorte = st.dataFinalCorte ? Const.inputDateParaTimestamp(st.dataFinalCorte) : null;

  if (st.funcionarioCorteId) {
    const func = st.usuarios.find((u) => u.id === st.funcionarioCorteId);
    pc.funcionarioCorteId = st.funcionarioCorteId;
    pc.funcionarioCorteNome = func ? func.nome : '';
  } else {
    pc.funcionarioCorteId = null;
    pc.funcionarioCorteNome = null;
  }

  pc.aprovado = user.tipo === 'admin' ? 'aprovado' : 'pendente';
  pc.dataAprovacao = user.tipo === 'admin' ? Date.now() : null;
  pc.atualizadoEm = Date.now();

  await DB.put('plano_corte', pc);
  voltarParaListaCorte();
}
