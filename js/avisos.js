/* =========================================================
   avisos.js — Quadro de Avisos
   Estrutura simples: texto, data, feito/não feito.
   Todos veem; só o Admin cria, edita, marca feito/não feito e exclui.
   ========================================================= */

const AvisosView = {
  subView: 'lista', // 'lista' | 'form'
  formState: null,
};

async function renderAvisos(view) {
  if (AvisosView.subView === 'form' && Auth.isAdmin()) {
    return renderAvisoForm(view);
  }
  return renderAvisosLista(view);
}

/* ---------------- LISTA ---------------- */

async function renderAvisosLista(view) {
  const user = Auth.current;
  const todos = await DB.getAll('avisos');

  const pendentes = todos.filter((a) => !a.feito).sort((a, b) => (b.data || 0) - (a.data || 0));
  const feitos = todos.filter((a) => a.feito).sort((a, b) => (b.data || 0) - (a.data || 0));
  const ordenados = [...pendentes, ...feitos];

  view.innerHTML = `
    <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:16px; flex-wrap:wrap">
      <div>
        <h2 class="section-title" style="margin-bottom:2px">Quadro de Avisos</h2>
        <p class="section-sub" style="margin:0">${user.tipo === 'admin' ? 'Gerencie os avisos da equipe' : 'Avisos e comunicados da equipe'}</p>
      </div>
      ${Auth.isAdmin() ? '<button class="btn btn--primary" id="btn-novo-aviso">+ Novo Aviso</button>' : ''}
    </div>

    <div id="lista-avisos"></div>
  `;

  if (Auth.isAdmin()) {
    document.getElementById('btn-novo-aviso').addEventListener('click', () => {
      AvisosView.subView = 'form';
      AvisosView.formState = criarEstadoAvisoVazio();
      renderView('avisos');
    });
  }

  const listaEl = document.getElementById('lista-avisos');
  if (ordenados.length === 0) {
    listaEl.innerHTML = `
      <div class="card">
        <div class="empty">
          <div class="empty__title">Nenhum aviso no momento</div>
          <div class="empty__sub">${Auth.isAdmin() ? 'Toque em "+ Novo Aviso" para publicar o primeiro.' : 'Quando o administrador publicar algo, aparece aqui.'}</div>
        </div>
      </div>`;
    return;
  }

  listaEl.innerHTML = `
    <div class="card" style="padding:0">
      ${ordenados
        .map((a) => {
          const statusBadge = a.feito
            ? '<span class="badge badge--ok">Feito</span>'
            : '<span class="badge badge--warn">Pendente</span>';

          const acoesAdmin = Auth.isAdmin()
            ? `
            <div style="display:flex; gap:6px; flex-wrap:wrap; justify-content:flex-end">
              <button class="btn btn--ghost" data-toggle="${a.id}" style="padding:6px 12px; font-size:13px">${a.feito ? 'Reabrir' : 'Marcar feito'}</button>
              <button class="btn btn--ghost" data-editar="${a.id}" style="padding:6px 12px; font-size:13px">Editar</button>
              <button class="btn btn--danger" data-excluir="${a.id}" style="padding:6px 12px; font-size:13px">Excluir</button>
            </div>`
            : '';

          return `
          <div class="row" style="padding:14px 18px; align-items:flex-start; flex-wrap:wrap; gap:10px">
            <div class="row__main" style="flex:1 1 220px">
              <div class="row__title" style="${a.feito ? 'text-decoration:line-through; color:var(--ink-faint)' : ''}">${escapeHtml(a.texto)}</div>
              <div class="row__meta">${Const.formatarData(a.data)}</div>
            </div>
            <div style="display:flex; flex-direction:column; align-items:flex-end; gap:8px; flex:0 0 auto">
              ${statusBadge}
              ${acoesAdmin}
            </div>
          </div>`;
        })
        .join('')}
    </div>
  `;

  if (!Auth.isAdmin()) return;

  listaEl.querySelectorAll('[data-toggle]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const aviso = await DB.get('avisos', btn.dataset.toggle);
      if (!aviso) return;
      aviso.feito = !aviso.feito;
      aviso.atualizadoEm = Date.now();
      await DB.put('avisos', aviso);
      renderAvisosLista(view);
    });
  });

  listaEl.querySelectorAll('[data-editar]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const aviso = await DB.get('avisos', btn.dataset.editar);
      if (!aviso) return;
      AvisosView.subView = 'form';
      AvisosView.formState = criarEstadoAvisoEdicao(aviso);
      renderView('avisos');
    });
  });

  listaEl.querySelectorAll('[data-excluir]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('Excluir este aviso?')) return;
      await DB.delete('avisos', btn.dataset.excluir);
      renderAvisosLista(view);
    });
  });
}

/* ---------------- FORMULÁRIO (Admin) ---------------- */

function criarEstadoAvisoVazio() {
  return {
    editId: null,
    texto: '',
    data: dataParaInputDate(Date.now()),
    feito: false,
    erro: '',
  };
}

function criarEstadoAvisoEdicao(aviso) {
  return {
    editId: aviso.id,
    texto: aviso.texto || '',
    data: dataParaInputDate(aviso.data) || dataParaInputDate(Date.now()),
    feito: !!aviso.feito,
    erro: '',
  };
}

async function renderAvisoForm(view) {
  const st = AvisosView.formState;
  const editando = !!st.editId;

  view.innerHTML = `
    <div style="display:flex; align-items:center; gap:10px; margin-bottom:16px">
      <button class="topbar__icon-btn" id="btn-voltar-aviso" aria-label="Voltar" style="background:var(--paper-dim)">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="20" height="20"><path d="M15 18l-6-6 6-6"/></svg>
      </button>
      <h2 class="section-title" style="margin:0">${editando ? 'Editar Aviso' : 'Novo Aviso'}</h2>
    </div>

    ${st.erro ? `<div class="auth__error show" style="text-align:left; margin-bottom:16px">${escapeHtml(st.erro)}</div>` : ''}

    <div class="card">
      <div class="field">
        <label for="f-aviso-texto">Texto do aviso</label>
        <textarea id="f-aviso-texto" placeholder="Ex: Reunião de equipe sexta às 8h">${escapeHtml(st.texto)}</textarea>
      </div>

      <div class="field">
        <label for="f-aviso-data">Data</label>
        <input id="f-aviso-data" type="date" value="${escapeHtml(st.data)}" />
      </div>

      <label style="display:flex; align-items:center; gap:8px; margin-bottom:20px; font-size:14px; color:var(--ink-soft)">
        <input id="f-aviso-feito" type="checkbox" style="width:18px; height:18px" ${st.feito ? 'checked' : ''} />
        Já está feito
      </label>

      <div style="display:flex; gap:10px">
        <button class="btn btn--ghost" id="btn-cancelar-aviso" style="flex:1">Cancelar</button>
        <button class="btn btn--primary" id="btn-salvar-aviso" style="flex:2">Salvar</button>
      </div>
    </div>
  `;

  document.getElementById('btn-voltar-aviso').addEventListener('click', voltarParaListaAvisos);
  document.getElementById('btn-cancelar-aviso').addEventListener('click', voltarParaListaAvisos);
  document.getElementById('f-aviso-texto').addEventListener('input', (ev) => (st.texto = ev.target.value));
  document.getElementById('f-aviso-data').addEventListener('input', (ev) => (st.data = ev.target.value));
  document.getElementById('f-aviso-feito').addEventListener('change', (ev) => (st.feito = ev.target.checked));

  document.getElementById('btn-salvar-aviso').addEventListener('click', () => salvarAviso(view));
}

function voltarParaListaAvisos() {
  AvisosView.subView = 'lista';
  AvisosView.formState = null;
  renderView('avisos');
}

async function salvarAviso(view) {
  const st = AvisosView.formState;

  const texto = (st.texto || '').trim();
  if (!texto) {
    st.erro = 'Digite o texto do aviso.';
    return renderAvisoForm(view);
  }

  const registro = st.editId
    ? await DB.get('avisos', st.editId)
    : { id: dbUtil.uid(), criadoEm: Date.now() };

  registro.texto = texto;
  registro.data = st.data ? new Date(st.data).getTime() : Date.now();
  registro.feito = !!st.feito;
  registro.atualizadoEm = Date.now();

  await DB.put('avisos', registro);
  voltarParaListaAvisos();
}
