/* =========================================================
   mkt.js — Produtos MKT
   Ficha de medidas dos produtos finalizados, pra uso do time de
   marketing (fotos, divulgação). Admin e usuários tipo "mkt" têm
   CRUD completo; usuários tipo "pcp" só visualizam.
   ========================================================= */

const MktView = {
  subView: 'lista', // 'lista' | 'form'
  filtroTexto: '',
  formState: null,
};

function podeEditarMkt() {
  const tipo = Auth.current?.tipo;
  return tipo === 'admin' || tipo === 'funcionario';
}

function podeAprovarMkt() {
  return Auth.isAdmin();
}

const CAMPOS_MEDIDA = [
  { chave: 'altura', label: 'Altura' },
  { chave: 'largura', label: 'Largura' },
  { chave: 'profundidade', label: 'Profundidade' },
  { chave: 'profundidadeAssento', label: 'Profundidade do Assento' },
  { chave: 'alturaAssentoChao', label: 'Altura Assento ao Chão' },
  { chave: 'alturaBracoChao', label: 'Altura Braço ao Chão' },
];

async function renderMkt(view) {
  if (MktView.subView === 'form' && podeEditarMkt()) {
    return renderMktForm(view);
  }
  return renderMktLista(view);
}

/* ---------------- LISTA ---------------- */

async function renderMktLista(view) {
  const editavel = podeEditarMkt();

  view.innerHTML = `
    <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:16px; flex-wrap:wrap">
      <div>
        <h2 class="section-title" style="margin-bottom:2px">MKT — Produtos Finalizados</h2>
        <p class="section-sub" style="margin:0">Medidas dos produtos para uso do time de marketing</p>
      </div>
      ${editavel ? '<button class="btn btn--primary" id="btn-novo-mkt">+ Novo Produto</button>' : ''}
    </div>

    <div class="field" style="margin-bottom:20px">
      <input id="busca-mkt" placeholder="Buscar por nome…" value="${escapeHtml(MktView.filtroTexto)}" />
    </div>

    <div id="lista-mkt"></div>
  `;

  if (editavel) {
    document.getElementById('btn-novo-mkt').addEventListener('click', () => {
      MktView.subView = 'form';
      MktView.formState = criarEstadoMktVazio();
      renderView('mkt');
    });
  }

  const buscaInput = document.getElementById('busca-mkt');
  buscaInput.addEventListener('input', () => {
    MktView.filtroTexto = buscaInput.value;
    atualizarListaMkt(view);
  });

  await atualizarListaMkt(view);
}

async function atualizarListaMkt(view) {
  const editavel = podeEditarMkt();
  const podeAprovar = podeAprovarMkt();
  const somenteAprovados = !editavel; // PCP e MKT (visualização) só veem itens aprovados
  const todos = await DB.getAll('produtos_mkt');
  const filtro = (MktView.filtroTexto || '').trim().toLowerCase();
  const filtrados = todos
    .filter((p) => !somenteAprovados || p.aprovado === 'aprovado')
    .filter((p) => !filtro || (p.nome || '').toLowerCase().includes(filtro))
    .sort((a, b) => (b.criadoEm || 0) - (a.criadoEm || 0));

  const listaEl = document.getElementById('lista-mkt');
  if (!listaEl) return;

  if (filtrados.length === 0) {
    listaEl.innerHTML = `
      <div class="card">
        <div class="empty">
          <div class="empty__title">Nenhum produto cadastrado</div>
          <div class="empty__sub">${editavel ? 'Toque em "+ Novo Produto" para cadastrar o primeiro.' : 'Ainda não há produtos aqui.'}</div>
        </div>
      </div>`;
    return;
  }

  listaEl.innerHTML = filtrados
    .map((p) => {
      const medidas = CAMPOS_MEDIDA.filter((c) => p[c.chave] != null && p[c.chave] !== '')
        .map((c) => `${c.label}: ${escapeHtml(String(p[c.chave]))}cm`)
        .join(' · ');
      const statusBadge =
        p.aprovado === 'aprovado' ? '' : '<span class="badge badge--warn">Pendente aprovação</span>';
      const aprovBtn =
        podeAprovar && p.aprovado !== 'aprovado'
          ? `<button class="btn btn--ghost" data-aprovar-mkt="${p.id}" style="padding:6px 12px; font-size:13px">Aprovar</button>`
          : '';
      return `
      <div class="card">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:10px; flex-wrap:wrap">
          <div>
            <div class="row__title" style="font-size:15.5px">${escapeHtml(p.nome)}</div>
            <div class="row__meta" style="margin-top:4px">${medidas || 'Sem medidas preenchidas'}</div>
            <div class="row__meta">${escapeHtml(p.criadoPorNome || '—')}</div>
          </div>
          <div style="display:flex; flex-direction:column; align-items:flex-end; gap:8px">
            ${statusBadge}
            ${
              editavel
                ? `<div style="display:flex; gap:6px; flex:0 0 auto">
                    ${aprovBtn}
                    <button class="btn btn--ghost" data-editar-mkt="${p.id}" style="padding:6px 12px; font-size:13px">Editar</button>
                    ${podeAprovar ? `<button class="btn btn--danger" data-excluir-mkt="${p.id}" style="padding:6px 12px; font-size:13px">Excluir</button>` : ''}
                  </div>`
                : ''
            }
          </div>
        </div>
      </div>`;
    })
    .join('');

  if (!editavel) return;

  listaEl.querySelectorAll('[data-aprovar-mkt]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const p = await DB.get('produtos_mkt', btn.dataset.aprovarMkt);
      if (!p) return;
      p.aprovado = 'aprovado';
      p.dataAprovacao = Date.now();
      await DB.put('produtos_mkt', p);
      atualizarListaMkt(view);
    });
  });

  listaEl.querySelectorAll('[data-editar-mkt]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const p = await DB.get('produtos_mkt', btn.dataset.editarMkt);
      if (!p) return;
      MktView.subView = 'form';
      MktView.formState = criarEstadoMktEdicao(p);
      renderView('mkt');
    });
  });

  listaEl.querySelectorAll('[data-excluir-mkt]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('Excluir este produto?')) return;
      await DB.delete('produtos_mkt', btn.dataset.excluirMkt);
      atualizarListaMkt(view);
    });
  });
}

/* ---------------- FORMULÁRIO ---------------- */

function criarEstadoMktVazio() {
  const st = { editId: null, nome: '', erro: '' };
  CAMPOS_MEDIDA.forEach((c) => (st[c.chave] = ''));
  return st;
}

function criarEstadoMktEdicao(p) {
  const st = { editId: p.id, nome: p.nome || '', erro: '' };
  CAMPOS_MEDIDA.forEach((c) => (st[c.chave] = p[c.chave] != null ? String(p[c.chave]) : ''));
  return st;
}

async function renderMktForm(view) {
  const st = MktView.formState;
  const editando = !!st.editId;

  view.innerHTML = `
    <div style="display:flex; align-items:center; gap:10px; margin-bottom:16px">
      <button class="topbar__icon-btn" id="btn-voltar-mkt" aria-label="Voltar" style="background:var(--paper-dim)">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="20" height="20"><path d="M15 18l-6-6 6-6"/></svg>
      </button>
      <h2 class="section-title" style="margin:0">${editando ? 'Editar Produto' : 'Novo Produto'}</h2>
    </div>

    ${st.erro ? `<div class="auth__error show" style="text-align:left; margin-bottom:16px">${escapeHtml(st.erro)}</div>` : ''}

    <div class="card">
      <div class="field">
        <label for="f-mkt-nome">Nome do Produto</label>
        <input id="f-mkt-nome" value="${escapeHtml(st.nome)}" placeholder="Ex: SOFÁ MILANO 2,20M" />
      </div>

      ${CAMPOS_MEDIDA.map(
        (c) => `
        <div class="field">
          <label for="f-mkt-${c.chave}">${c.label} (cm)</label>
          <input id="f-mkt-${c.chave}" type="number" step="0.1" min="0" value="${escapeHtml(st[c.chave])}" />
        </div>`
      ).join('')}

      <div style="display:flex; gap:10px; margin-top:8px">
        <button class="btn btn--ghost" id="btn-cancelar-mkt" style="flex:1">Cancelar</button>
        <button class="btn btn--primary" id="btn-salvar-mkt" style="flex:2">Salvar</button>
      </div>
    </div>
  `;

  document.getElementById('btn-voltar-mkt').addEventListener('click', voltarParaListaMkt);
  document.getElementById('btn-cancelar-mkt').addEventListener('click', voltarParaListaMkt);
  document.getElementById('f-mkt-nome').addEventListener('input', (ev) => (st.nome = ev.target.value));
  CAMPOS_MEDIDA.forEach((c) => {
    document.getElementById(`f-mkt-${c.chave}`).addEventListener('input', (ev) => (st[c.chave] = ev.target.value));
  });

  document.getElementById('btn-salvar-mkt').addEventListener('click', () => salvarMkt(view));
}

function voltarParaListaMkt() {
  MktView.subView = 'lista';
  MktView.formState = null;
  renderView('mkt');
}

async function salvarMkt(view) {
  const st = MktView.formState;
  const user = Auth.current;
  const nome = (st.nome || '').trim();
  if (!nome) {
    st.erro = 'Digite o nome do produto.';
    return renderMktForm(view);
  }

  const novo = !st.editId;
  const registro = st.editId
    ? await DB.get('produtos_mkt', st.editId)
    : { id: dbUtil.uid(), criadoEm: Date.now(), criadoPorId: user.id, criadoPorNome: user.nome };

  registro.nome = nome;
  CAMPOS_MEDIDA.forEach((c) => {
    const v = parseFloat(st[c.chave]);
    registro[c.chave] = isNaN(v) ? null : v;
  });
  registro.atualizadoEm = Date.now();

  // Admin sempre aprova na hora; funcionário fica pendente até o Admin
  // aprovar — vale tanto pra criar quanto pra editar de novo.
  if (user.tipo === 'admin') {
    registro.aprovado = 'aprovado';
    registro.dataAprovacao = Date.now();
  } else {
    registro.aprovado = 'pendente';
  }

  await DB.put('produtos_mkt', registro);
  voltarParaListaMkt();
}
