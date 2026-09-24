/* =========================================================
   materiais.js — Cadastro de Materiais (Tecido / Tela / Couro)
   Só o Admin cadastra, edita e exclui. Quem tem a aba liberada só
   consulta. No lançamento de Corte Tecido / Corte Tela / Corte
   Couro, o material é escolhido desta lista (em vez de digitado
   livre) e a largura vem junto, só como referência — o objetivo é
   não haver dúvida de QUAL material foi usado.
   ========================================================= */

const MateriaisView = {
  subView: 'lista', // 'lista' | 'form'
  filtroTexto: '',
  filtroTipo: '',
  formState: null,
};

const Materiais = {
  TIPOS: ['Tecido', 'Tela', 'Couro'],

  async listar() {
    const todos = await DB.getAll('materiais');
    return todos.sort((a, b) => (a.nome || '').localeCompare(b.nome || '', 'pt-BR'));
  },

  // Qual tipo de material uma categoria de serviço usa (ou null se não
  // usa). Vale pras categorias de corte: "Corte Tecido", "Corte Tela",
  // "Corte Couro" — e qualquer categoria criada que siga o mesmo nome
  // (ex: "Corte Tecido Especial"). "Teste Corte Tecido" não entra.
  tipoDaCategoria(nomeCategoria) {
    const n = (nomeCategoria || '')
      .toString()
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
    if (!n.startsWith('corte')) return null;
    if (n.includes('tecido')) return 'Tecido';
    if (n.includes('tela')) return 'Tela';
    if (n.includes('couro')) return 'Couro';
    return null;
  },

  rotulo(m) {
    if (!m) return '';
    const larg = m.largura != null && m.largura !== '' ? ` — ${formatarLarguraMaterial(m.largura)}` : '';
    return `${m.nome}${larg}`;
  },
};

function formatarLarguraMaterial(v) {
  if (v == null || v === '') return '';
  const n = Number(v);
  if (isNaN(n)) return String(v);
  return `${n.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} cm`;
}

function normalizaBuscaMaterial(s) {
  return (s || '')
    .toString()
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

async function renderMateriais(view) {
  if (MateriaisView.subView === 'form' && Auth.isAdmin()) {
    return renderMaterialForm(view);
  }
  return renderMateriaisLista(view);
}

async function renderMateriaisLista(view) {
  const ehAdmin = Auth.isAdmin();
  view.innerHTML = `
    <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:16px; flex-wrap:wrap">
      <div>
        <h2 class="section-title" style="margin-bottom:2px">Materiais</h2>
        <p class="section-sub" style="margin:0">Tecidos, telas e couros com a largura, pra escolher no lançamento de corte</p>
      </div>
      ${ehAdmin ? '<button class="btn btn--primary" id="btn-novo-material">+ Novo Material</button>' : ''}
    </div>

    <div class="field" style="margin-bottom:12px">
      <input id="busca-material" placeholder="Buscar material pelo nome…" value="${escapeHtml(MateriaisView.filtroTexto)}" />
    </div>
    <div class="chips" style="margin-bottom:18px">
      <button class="chip ${!MateriaisView.filtroTipo ? 'chip--on' : ''}" data-filtro-tipo="">Todos</button>
      ${Materiais.TIPOS.map(
        (t) => `<button class="chip ${MateriaisView.filtroTipo === t ? 'chip--on' : ''}" data-filtro-tipo="${t}">${t}</button>`
      ).join('')}
    </div>

    <div id="lista-materiais"></div>
  `;

  if (ehAdmin) {
    document.getElementById('btn-novo-material').addEventListener('click', () => {
      MateriaisView.subView = 'form';
      MateriaisView.formState = { editId: null, nome: '', tipo: MateriaisView.filtroTipo || 'Tecido', largura: '', observacao: '', erro: '' };
      renderView('materiais');
    });
  }

  const busca = document.getElementById('busca-material');
  busca.addEventListener('input', () => {
    MateriaisView.filtroTexto = busca.value;
    atualizarListaMateriais(view);
  });
  view.querySelectorAll('[data-filtro-tipo]').forEach((btn) => {
    btn.addEventListener('click', () => {
      MateriaisView.filtroTipo = btn.dataset.filtroTipo;
      renderMateriaisLista(view);
    });
  });

  await atualizarListaMateriais(view);
}

async function atualizarListaMateriais(view) {
  const ehAdmin = Auth.isAdmin();
  const todos = await Materiais.listar();
  const servicos = await DB.getAll('servicos');
  const usos = {};
  servicos.forEach((s) => {
    if (s.materialId) usos[s.materialId] = (usos[s.materialId] || 0) + 1;
  });

  const filtro = normalizaBuscaMaterial(MateriaisView.filtroTexto);
  const filtrados = todos.filter((m) => {
    if (MateriaisView.filtroTipo && m.tipo !== MateriaisView.filtroTipo) return false;
    if (!filtro) return true;
    return normalizaBuscaMaterial(m.nome).includes(filtro) || normalizaBuscaMaterial(m.observacao).includes(filtro);
  });

  const listaEl = document.getElementById('lista-materiais');
  if (!listaEl) return;

  if (filtrados.length === 0) {
    listaEl.innerHTML = `
      <div class="card">
        <div class="empty">
          <div class="empty__title">${todos.length === 0 ? 'Nenhum material cadastrado ainda' : 'Nenhum material encontrado'}</div>
          <div class="empty__sub">${
            todos.length === 0
              ? ehAdmin
                ? 'Toque em "+ Novo Material" para cadastrar o primeiro tecido, tela ou couro.'
                : 'Quando o administrador cadastrar os materiais, aparecem aqui.'
              : 'Tente outro nome ou outro tipo.'
          }</div>
        </div>
      </div>`;
    return;
  }

  listaEl.innerHTML = `
    <div class="card" style="padding:0">
      ${filtrados
        .map(
          (m) => `
        <div class="row" style="padding:14px 18px; flex-wrap:wrap">
          <div class="row__main" style="flex:1 1 200px">
            <div class="row__title">${escapeHtml(m.nome)}</div>
            <div class="row__meta">${escapeHtml(m.tipo || '—')} · Largura: <b>${m.largura != null && m.largura !== '' ? formatarLarguraMaterial(m.largura) : '—'}</b>${usos[m.id] ? ` · usado em ${usos[m.id]} serviço(s)` : ''}</div>
            ${m.observacao ? `<div class="row__meta" style="font-style:italic">${escapeHtml(m.observacao)}</div>` : ''}
          </div>
          ${
            ehAdmin
              ? `<div style="display:flex; gap:6px; flex:0 0 auto">
                  <button class="btn btn--ghost" data-editar-material="${m.id}" style="padding:6px 12px; font-size:13px">Editar</button>
                  <button class="btn btn--danger" data-excluir-material="${m.id}" style="padding:6px 12px; font-size:13px">Excluir</button>
                </div>`
              : ''
          }
        </div>`
        )
        .join('')}
    </div>
    <div class="row__meta" style="text-align:center; margin-top:10px">${filtrados.length} material(is)</div>
  `;

  if (!ehAdmin) return;

  listaEl.querySelectorAll('[data-editar-material]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const m = await DB.get('materiais', btn.dataset.editarMaterial);
      if (!m) return;
      MateriaisView.subView = 'form';
      MateriaisView.formState = {
        editId: m.id,
        nome: m.nome || '',
        tipo: m.tipo || 'Tecido',
        largura: m.largura != null ? String(m.largura) : '',
        observacao: m.observacao || '',
        erro: '',
      };
      renderView('materiais');
    });
  });

  listaEl.querySelectorAll('[data-excluir-material]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.excluirMaterial;
      const n = usos[id] || 0;
      const aviso = n
        ? `Esse material está em ${n} serviço(s). Os serviços continuam guardando o nome e a largura, só o material sai da lista. Excluir mesmo assim?`
        : 'Excluir este material?';
      if (!confirm(aviso)) return;
      await DB.delete('materiais', id);
      atualizarListaMateriais(view);
    });
  });
}

function renderMaterialForm(view) {
  const st = MateriaisView.formState;
  const editando = !!st.editId;

  view.innerHTML = `
    <div style="display:flex; align-items:center; gap:10px; margin-bottom:16px">
      <button class="topbar__icon-btn" id="btn-voltar-material" aria-label="Voltar" style="background:var(--paper-dim)">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="20" height="20"><path d="M15 18l-6-6 6-6"/></svg>
      </button>
      <h2 class="section-title" style="margin:0">${editando ? 'Editar Material' : 'Novo Material'}</h2>
    </div>

    ${st.erro ? `<div class="auth__error show" style="text-align:left; margin-bottom:16px">${escapeHtml(st.erro)}</div>` : ''}

    <div class="card">
      <div class="field">
        <label for="f-mat-tipo">Tipo</label>
        <select id="f-mat-tipo">
          ${Materiais.TIPOS.map((t) => `<option value="${t}" ${st.tipo === t ? 'selected' : ''}>${t}</option>`).join('')}
        </select>
      </div>
      <div class="field">
        <label for="f-mat-nome">Nome do material</label>
        <input id="f-mat-nome" value="${escapeHtml(st.nome)}" placeholder="Ex: LINHO BEGE 2045" autocomplete="off" />
      </div>
      <div class="field">
        <label for="f-mat-largura">Largura (cm)</label>
        <input id="f-mat-largura" type="number" min="0" step="0.1" inputmode="decimal" value="${escapeHtml(st.largura)}" placeholder="Ex: 140" />
      </div>
      <div class="field">
        <label for="f-mat-obs">Observação (opcional)</label>
        <input id="f-mat-obs" value="${escapeHtml(st.observacao)}" placeholder="Ex: fornecedor, código, cor…" />
      </div>

      <div style="display:flex; gap:10px; margin-top:8px">
        <button class="btn btn--ghost" id="btn-cancelar-material" style="flex:1">Cancelar</button>
        <button class="btn btn--primary" id="btn-salvar-material" style="flex:2">${editando ? 'Salvar alterações' : 'Cadastrar material'}</button>
      </div>
    </div>
  `;

  const voltar = () => {
    MateriaisView.subView = 'lista';
    MateriaisView.formState = null;
    renderView('materiais');
  };
  document.getElementById('btn-voltar-material').addEventListener('click', voltar);
  document.getElementById('btn-cancelar-material').addEventListener('click', voltar);
  document.getElementById('f-mat-tipo').addEventListener('change', (ev) => (st.tipo = ev.target.value));
  document.getElementById('f-mat-nome').addEventListener('input', (ev) => (st.nome = ev.target.value));
  document.getElementById('f-mat-largura').addEventListener('input', (ev) => (st.largura = ev.target.value));
  document.getElementById('f-mat-obs').addEventListener('input', (ev) => (st.observacao = ev.target.value));

  document.getElementById('btn-salvar-material').addEventListener('click', async () => {
    const nome = (st.nome || '').trim();
    if (!nome) {
      st.erro = 'Digite o nome do material.';
      return renderMaterialForm(view);
    }
    let largura = null;
    if (String(st.largura).trim() !== '') {
      largura = parseFloat(String(st.largura).replace(',', '.'));
      if (isNaN(largura) || largura <= 0) {
        st.erro = 'Informe uma largura válida em cm (ou deixe em branco).';
        return renderMaterialForm(view);
      }
    }

    const todos = await Materiais.listar();
    const duplicado = todos.find(
      (m) => m.id !== st.editId && m.tipo === st.tipo && normalizaBuscaMaterial(m.nome) === normalizaBuscaMaterial(nome)
    );
    if (duplicado) {
      st.erro = `Já existe um ${st.tipo.toLowerCase()} com esse nome.`;
      return renderMaterialForm(view);
    }

    const btn = document.getElementById('btn-salvar-material');
    btn.disabled = true;
    btn.textContent = 'Salvando…';
    window.operacaoEmAndamento = true;
    try {
      await comTimeout(
        (async () => {
          const registro = st.editId ? (await DB.get('materiais', st.editId)) || { id: st.editId } : { id: dbUtil.uid(), criadoEm: Date.now(), criadoPor: Auth.current.nome };
          registro.nome = nome;
          registro.tipo = st.tipo;
          registro.largura = largura;
          registro.observacao = (st.observacao || '').trim();
          registro.atualizadoEm = Date.now();
          await DB.put('materiais', registro);

          // correção de nome/largura vale também pros serviços que já
          // usam esse material (eles guardam uma cópia pra relatórios)
          if (st.editId) {
            const servicos = await DB.getAll('servicos');
            const afetados = servicos.filter(
              (s) =>
                s.materialId === registro.id &&
                (s.materialNome !== registro.nome || s.materialLargura !== registro.largura || s.materialTipo !== registro.tipo)
            );
            afetados.forEach((s) => {
              s.materialNome = registro.nome;
              s.materialLargura = registro.largura;
              s.materialTipo = registro.tipo;
            });
            if (afetados.length) await DB.putMany('servicos', afetados);
          }
        })()
      );
    } catch (e) {
      st.erro = 'Não consegui salvar: ' + (e && e.message ? e.message : 'erro desconhecido.');
      window.operacaoEmAndamento = false;
      return renderMaterialForm(view);
    }
    window.operacaoEmAndamento = false;
    voltar();
  });
}

window.Materiais = Materiais;
