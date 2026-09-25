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
  modoSelecao: false, // "Selecionar para PDF"
  selecionados: new Set(),
  _visiveis: [],
};

const Materiais = {
  // categorias que já vêm criadas na primeira vez (o Admin pode
  // renomear ou excluir qualquer uma, e criar outras)
  CATEGORIAS_PADRAO: [
    { id: 'catmat-tecido', nome: 'Tecido' },
    { id: 'catmat-tela', nome: 'Tela' },
    { id: 'catmat-couro', nome: 'Couro' },
  ],

  // cópia em memória das categorias, pra quem precisa responder na hora
  // (ex: ao trocar o tipo de serviço no formulário)
  _cacheCategorias: null,

  async listar() {
    const todos = await DB.getAll('materiais');
    return todos.sort((a, b) => (a.nome || '').localeCompare(b.nome || '', 'pt-BR'));
  },

  async listarCategorias() {
    let cats = await DB.getAll('categorias_material');
    const semeado = await DB.get('config', 'categorias_material_semeadas');
    if (cats.length === 0 && !semeado) {
      // IDs fixos: se dois aparelhos semearem juntos, escrevem no mesmo documento
      const agora = Date.now();
      cats = this.CATEGORIAS_PADRAO.map((c) => ({ ...c, criadoEm: agora }));
      await DB.putMany('categorias_material', cats);
      await DB.put('config', { chave: 'categorias_material_semeadas', valor: agora });
    }
    cats.sort((a, b) => (a.nome || '').localeCompare(b.nome || '', 'pt-BR'));
    this._cacheCategorias = cats;
    return cats;
  },

  // Quem tem a aba Materiais pode cadastrar material e categoria.
  // O que não é do Admin entra "pendente" até o Admin aprovar — mas já
  // pode ser usado no lançamento de corte, marcado "(pendente)".
  podeCadastrar() {
    return Auth.isAdmin() || Auth.pode('materiais');
  },

  ehPendente(reg) {
    return !!reg && reg.aprovado === 'pendente';
  },

  // Admin mexe em tudo; o funcionário só no que ELE cadastrou e ainda
  // está pendente (depois de aprovado, só o Admin)
  podeMexer(reg) {
    if (Auth.isAdmin()) return true;
    return !!reg && this.ehPendente(reg) && reg.criadoPorId === Auth.current.id;
  },

  statusNovo() {
    return Auth.isAdmin()
      ? { aprovado: 'aprovado', dataAprovacao: Date.now() }
      : { aprovado: 'pendente', dataAprovacao: null };
  },

  seloPendente(reg) {
    return this.ehPendente(reg)
      ? `<span class="badge badge--warn" style="margin-left:6px">Pendente aprovação</span>${
          reg.criadoPorNome ? `<span class="row__meta" style="margin-left:6px">por ${escapeHtml(reg.criadoPorNome)}</span>` : ''
        }`
      : '';
  },

  nomesCategorias() {
    return (this._cacheCategorias || this.CATEGORIAS_PADRAO).map((c) => c.nome);
  },

  // Qual categoria de material um tipo de serviço usa (ou null se não
  // usa). Vale pros tipos que começam com "Corte": "Corte Tecido" usa
  // Tecido, "Corte Espuma" usa Espuma (se existir a categoria Espuma),
  // e assim por diante. "Teste Corte Tecido" não entra.
  tipoDaCategoria(nomeCategoria, categorias) {
    const n = normalizaBuscaMaterial(nomeCategoria);
    if (!n.startsWith('corte')) return null;
    const resto = ' ' + n.slice('corte'.length).trim() + ' ';
    const nomes = (categorias || this._cacheCategorias || this.CATEGORIAS_PADRAO).map((c) => (typeof c === 'string' ? c : c.nome));
    // o nome mais comprido primeiro (ex: "Tecido Técnico" antes de "Tecido")
    const ordenados = [...nomes].sort((a, b) => b.length - a.length);
    const achado = ordenados.find((nome) => {
      const alvo = normalizaBuscaMaterial(nome);
      return alvo && resto.includes(' ' + alvo + ' ');
    });
    return achado || null;
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
  await Materiais.listarCategorias();
  if (MateriaisView.subView === 'form' && Materiais.podeCadastrar()) {
    return renderMaterialForm(view);
  }
  if (MateriaisView.subView === 'categorias' && Materiais.podeCadastrar()) {
    return renderCategoriasMaterial(view);
  }
  return renderMateriaisLista(view);
}

async function renderMateriaisLista(view) {
  const ehAdmin = Materiais.podeCadastrar(); // mostra "Categorias" e "+ Novo Material"

  view.innerHTML = `
    <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:16px; flex-wrap:wrap">
      <div>
        <h2 class="section-title" style="margin-bottom:2px">Materiais</h2>
        <p class="section-sub" style="margin:0">${
          Auth.isAdmin()
            ? 'Materiais com a largura, pra escolher no lançamento de corte'
            : 'Materiais com a largura. O que você cadastrar fica pendente até o Admin aprovar, mas já pode ser usado no lançamento.'
        }</p>
      </div>
      ${
        ehAdmin
          ? `<div style="display:flex; gap:8px; flex-wrap:wrap">
              ${botaoSelecaoPdf(MateriaisView, 'btn-selecao-materiais')}
              <button class="btn btn--ghost" id="btn-categorias-material">Categorias</button>
              <button class="btn btn--primary" id="btn-novo-material">+ Novo Material</button>
            </div>`
          : botaoSelecaoPdf(MateriaisView, 'btn-selecao-materiais')
      }
    </div>

    <div class="field" style="margin-bottom:12px">
      <input id="busca-material" placeholder="Buscar material pelo nome…" value="${escapeHtml(MateriaisView.filtroTexto)}" />
    </div>
    <div class="chips" style="margin-bottom:18px">
      <button class="chip ${!MateriaisView.filtroTipo ? 'chip--on' : ''}" data-filtro-tipo="">Todos</button>
      ${Materiais.nomesCategorias().map(
        (t) => `<button class="chip ${MateriaisView.filtroTipo === t ? 'chip--on' : ''}" data-filtro-tipo="${escapeHtml(t)}">${escapeHtml(t)}</button>`
      ).join('')}
    </div>

    <div id="barra-materiais"></div>
    <div id="lista-materiais"></div>
    <div id="materiais-previa"></div>
  `;

  document.getElementById('btn-selecao-materiais').addEventListener('click', () => {
    MateriaisView.modoSelecao = !MateriaisView.modoSelecao;
    if (!MateriaisView.modoSelecao) MateriaisView.selecionados.clear();
    renderMateriaisLista(view);
  });

  // se o filtro era uma categoria que foi renomeada/excluída, volta pra "Todos"
  if (MateriaisView.filtroTipo && !Materiais.nomesCategorias().includes(MateriaisView.filtroTipo)) {
    MateriaisView.filtroTipo = '';
  }

  if (ehAdmin) {
    document.getElementById('btn-novo-material').addEventListener('click', () => {
      MateriaisView.subView = 'form';
      MateriaisView.formState = {
        editId: null,
        nome: '',
        tipo: MateriaisView.filtroTipo || Materiais.nomesCategorias()[0] || '',
        largura: '',
        observacao: '',
        erro: '',
        imagens: [],
      };
      renderView('materiais');
    });
    document.getElementById('btn-categorias-material').addEventListener('click', () => {
      MateriaisView.subView = 'categorias';
      MateriaisView.catForm = null;
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
  const ehAdmin = Materiais.podeCadastrar();
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

  MateriaisView._visiveis = filtrados.map((m) => m.id);
  renderBarraSelecaoPdf({
    contId: 'barra-materiais',
    previaId: 'materiais-previa',
    estado: MateriaisView,
    todosIds: todos.map((m) => m.id),
    singular: 'material',
    plural: 'materiais',
    dica: 'Marque as caixinhas (ou "Marcar todos da busca") dos materiais que vão no PDF.',
    montar: (ids) => montarPdfMateriais(todos.filter((m) => ids.includes(m.id)), usos),
    aoMudar: () => atualizarListaMateriais(view),
  });

  if (filtrados.length === 0) {
    listaEl.innerHTML = `
      <div class="card">
        <div class="empty">
          <div class="empty__title">${todos.length === 0 ? 'Nenhum material cadastrado ainda' : 'Nenhum material encontrado'}</div>
          <div class="empty__sub">${
            todos.length === 0
              ? ehAdmin
                ? 'Toque em "+ Novo Material" para cadastrar o primeiro.'
                : 'Quando os materiais forem cadastrados, aparecem aqui.'
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
          ${caixinhaPdf(MateriaisView, m.id)}
          <div class="row__main" style="flex:1 1 200px">
            <div class="row__title">${escapeHtml(m.nome)}${Materiais.seloPendente(m)}</div>
            <div class="row__meta">${escapeHtml(m.tipo || '—')} · Largura: <b>${m.largura != null && m.largura !== '' ? formatarLarguraMaterial(m.largura) : '—'}</b>${usos[m.id] ? ` · usado em ${usos[m.id]} serviço(s)` : ''}</div>
            ${m.observacao ? `<div class="row__meta" style="font-style:italic">${escapeHtml(m.observacao)}</div>` : ''}
            ${(m.imagens || []).length ? `<div style="margin-top:8px">${miniaturasMaterial(m.imagens, 56)}</div>` : ''}
          </div>
          ${
            Materiais.podeMexer(m) || (Auth.isAdmin() && Materiais.ehPendente(m))
              ? `<div style="display:flex; gap:6px; flex:0 0 auto; flex-wrap:wrap">
                  ${Auth.isAdmin() && Materiais.ehPendente(m) ? `<button class="btn btn--primary" data-aprovar-material="${m.id}" style="padding:6px 12px; font-size:13px">Aprovar</button>` : ''}
                  <button class="btn btn--ghost" data-editar-material="${m.id}" style="padding:6px 12px; font-size:13px">Editar</button>
                  <button class="btn btn--danger" data-excluir-material="${m.id}" style="padding:6px 12px; font-size:13px">${Auth.isAdmin() && Materiais.ehPendente(m) ? 'Recusar' : 'Excluir'}</button>
                </div>`
              : ''
          }
        </div>`
        )
        .join('')}
    </div>
    <div class="row__meta" style="text-align:center; margin-top:10px">${filtrados.length} material(is)</div>
  `;

  ligarCaixinhasPdf(listaEl, MateriaisView, () => atualizarListaMateriais(view));

  listaEl.querySelectorAll('[data-aprovar-material]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const m = await DB.get('materiais', btn.dataset.aprovarMaterial);
      if (!m) return;
      m.aprovado = 'aprovado';
      m.dataAprovacao = Date.now();
      await DB.put('materiais', m);
      // aprovar o material aprova também a categoria dele, se estava pendente
      const cat = (await DB.getAll('categorias_material')).find((c) => c.nome === m.tipo && c.aprovado === 'pendente');
      if (cat) {
        cat.aprovado = 'aprovado';
        cat.dataAprovacao = Date.now();
        await DB.put('categorias_material', cat);
      }
      atualizarListaMateriais(view);
      if (typeof atualizarBadgesTabbar === 'function') atualizarBadgesTabbar();
    });
  });

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
        imagens: m.imagens ? [...m.imagens] : [],
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
      const mat = await DB.get('materiais', id);
      await DB.delete('materiais', id);
      if (mat && (mat.imagens || []).length && Auth.isAdmin()) {
        for (const img of mat.imagens) {
          try {
            await Drive.excluirArquivo(img.id);
          } catch (e) {
            console.warn('Foto não apagada do Drive:', e);
          }
        }
      }
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
        <label for="f-mat-tipo">Categoria</label>
        <select id="f-mat-tipo">
          ${Materiais.nomesCategorias().map((t) => `<option value="${escapeHtml(t)}" ${st.tipo === t ? 'selected' : ''}>${escapeHtml(t)}</option>`).join('')}
          ${st.tipo && !Materiais.nomesCategorias().includes(st.tipo) ? `<option value="${escapeHtml(st.tipo)}" selected>${escapeHtml(st.tipo)} (categoria excluída)</option>` : ''}
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
      ${
        Auth.isAdmin()
          ? `<div class="field">
              <label for="f-mat-imagens">Fotos do material (opcional)</label>
              <input id="f-mat-imagens" type="file" accept="image/*" multiple />
              <div id="lista-imagens-mat" style="margin-top:10px"></div>
            </div>`
          : (st.imagens || []).length
          ? `<div class="field"><label>Fotos do material</label>${miniaturasMaterial(st.imagens, 64)}</div>`
          : ''
      }

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

  const imagensInput = document.getElementById('f-mat-imagens');
  if (imagensInput) {
    imagensInput.addEventListener('change', async (ev) => {
      const arquivos = Array.from(ev.target.files || []);
      if (arquivos.length === 0) return;
      imagensInput.disabled = true;
      document.getElementById('btn-salvar-material').disabled = true;
      const cont = document.getElementById('lista-imagens-mat');
      const { enviados, erros } = await Drive.enviarVarios(arquivos, (feitos, total) => {
        if (cont) cont.innerHTML = `<div class="row__meta">Enviando pro Google Drive: ${feitos} de ${total} pronto(s)… aguarde antes de Salvar</div>`;
      });
      st.imagens = [...(st.imagens || []), ...enviados];
      if (erros.length) st.erro = erros.map((e) => `Não consegui enviar "${e.nome}": ${e.mensagem}`).join(' ');
      renderMaterialForm(view);
    });
    renderListaImagensMaterial(view);
  }

  document.getElementById('btn-salvar-material').addEventListener('click', async () => {
    const nome = (st.nome || '').trim();
    if (!st.tipo) {
      st.erro = 'Cadastre uma categoria antes (botão "Categorias").';
      return renderMaterialForm(view);
    }
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
      st.erro = `Já existe um material com esse nome na categoria ${st.tipo}.`;
      return renderMaterialForm(view);
    }

    const btn = document.getElementById('btn-salvar-material');
    btn.disabled = true;
    btn.textContent = 'Salvando…';
    window.operacaoEmAndamento = true;
    try {
      await comTimeout(
        (async () => {
          const registro = st.editId
            ? (await DB.get('materiais', st.editId)) || { id: st.editId }
            : {
                id: dbUtil.uid(),
                criadoEm: Date.now(),
                criadoPor: Auth.current.nome,
                criadoPorId: Auth.current.id,
                criadoPorNome: Auth.current.nome,
                ...Materiais.statusNovo(),
              };
          // funcionário não consegue mexer no que já foi aprovado (a tela nem mostra o botão)
          if (st.editId && !Materiais.podeMexer(registro)) throw new Error('Esse material já foi aprovado — só o Admin pode alterar.');
          registro.nome = nome;
          registro.tipo = st.tipo;
          registro.largura = largura;
          registro.observacao = (st.observacao || '').trim();
          if (Auth.isAdmin()) registro.imagens = st.imagens || [];
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

/* ---------------- CATEGORIAS DE MATERIAL (só Admin) ---------------- */

async function renderCategoriasMaterial(view) {
  const cf = MateriaisView.catForm;
  const cats = await Materiais.listarCategorias();
  const materiais = await Materiais.listar();
  const qtdPorCat = {};
  materiais.forEach((m) => (qtdPorCat[m.tipo] = (qtdPorCat[m.tipo] || 0) + 1));

  view.innerHTML = `
    <div style="display:flex; align-items:center; gap:10px; margin-bottom:16px">
      <button class="topbar__icon-btn" id="btn-voltar-cat-mat" aria-label="Voltar" style="background:var(--paper-dim)">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="20" height="20"><path d="M15 18l-6-6 6-6"/></svg>
      </button>
      <div>
        <h2 class="section-title" style="margin:0">Categorias de material</h2>
        <p class="section-sub" style="margin:0">O lançamento "Corte X" mostra os materiais da categoria X (ex: Corte Espuma → Espuma)${
          Auth.isAdmin() ? '' : '. Categoria nova fica pendente até o Admin aprovar.'
        }</p>
      </div>
    </div>

    ${cf && cf.erro ? `<div class="auth__error show" style="text-align:left; margin-bottom:16px">${escapeHtml(cf.erro)}</div>` : ''}

    ${
      cf
        ? `<div class="card" style="margin-bottom:16px">
            <h3 class="section-title" style="font-size:16px">${cf.editId ? 'Renomear categoria' : 'Nova categoria'}</h3>
            <div class="field" style="margin-top:10px">
              <label for="f-cat-mat-nome">Nome</label>
              <input id="f-cat-mat-nome" value="${escapeHtml(cf.nome)}" placeholder="Ex: Espuma" autocomplete="off" />
            </div>
            ${cf.editId ? '<div class="row__meta" style="margin:-6px 0 14px">Os materiais e os serviços que usam essa categoria são atualizados junto.</div>' : ''}
            <div style="display:flex; gap:10px">
              <button class="btn btn--ghost" id="btn-cancelar-cat-mat" style="flex:1">Cancelar</button>
              <button class="btn btn--primary" id="btn-salvar-cat-mat" style="flex:2">${cf.editId ? 'Salvar' : 'Criar categoria'}</button>
            </div>
          </div>`
        : `<div style="display:flex; justify-content:flex-end; margin-bottom:14px">
            <button class="btn btn--primary" id="btn-nova-cat-mat">+ Nova Categoria</button>
          </div>`
    }

    <div class="card" style="padding:0">
      ${
        cats.length === 0
          ? '<div class="empty"><div class="empty__title">Nenhuma categoria</div><div class="empty__sub">Crie a primeira em "+ Nova Categoria".</div></div>'
          : cats
              .map(
                (c) => `
          <div class="row" style="padding:14px 18px; flex-wrap:wrap">
            <div class="row__main" style="flex:1 1 180px">
              <div class="row__title">${escapeHtml(c.nome)}${Materiais.seloPendente(c)}</div>
              <div class="row__meta">${qtdPorCat[c.nome] || 0} material(is)</div>
            </div>
            ${
              Materiais.podeMexer(c)
                ? `<div style="display:flex; gap:6px; flex:0 0 auto; flex-wrap:wrap">
                    ${Auth.isAdmin() && Materiais.ehPendente(c) ? `<button class="btn btn--primary" data-aprovar-cat-mat="${c.id}" style="padding:6px 12px; font-size:13px">Aprovar</button>` : ''}
                    <button class="btn btn--ghost" data-renomear-cat-mat="${c.id}" style="padding:6px 12px; font-size:13px">Editar</button>
                    <button class="btn btn--danger" data-excluir-cat-mat="${c.id}" style="padding:6px 12px; font-size:13px">${Auth.isAdmin() && Materiais.ehPendente(c) ? 'Recusar' : 'Excluir'}</button>
                  </div>`
                : ''
            }
          </div>`
              )
              .join('')
      }
    </div>
  `;

  document.getElementById('btn-voltar-cat-mat').addEventListener('click', () => {
    MateriaisView.subView = 'lista';
    MateriaisView.catForm = null;
    renderView('materiais');
  });

  const btnNova = document.getElementById('btn-nova-cat-mat');
  if (btnNova) {
    btnNova.addEventListener('click', () => {
      MateriaisView.catForm = { editId: null, nome: '', erro: '' };
      renderCategoriasMaterial(view);
    });
  }

  view.querySelectorAll('[data-aprovar-cat-mat]').forEach((btn) =>
    btn.addEventListener('click', async () => {
      const c = cats.find((x) => x.id === btn.dataset.aprovarCatMat);
      if (!c) return;
      c.aprovado = 'aprovado';
      c.dataAprovacao = Date.now();
      await DB.put('categorias_material', c);
      renderCategoriasMaterial(view);
      if (typeof atualizarBadgesTabbar === 'function') atualizarBadgesTabbar();
    })
  );

  view.querySelectorAll('[data-renomear-cat-mat]').forEach((btn) =>
    btn.addEventListener('click', () => {
      const c = cats.find((x) => x.id === btn.dataset.renomearCatMat);
      if (!c) return;
      MateriaisView.catForm = { editId: c.id, nome: c.nome, erro: '' };
      renderCategoriasMaterial(view);
    })
  );

  view.querySelectorAll('[data-excluir-cat-mat]').forEach((btn) =>
    btn.addEventListener('click', async () => {
      const c = cats.find((x) => x.id === btn.dataset.excluirCatMat);
      if (!c) return;
      const n = qtdPorCat[c.nome] || 0;
      if (n > 0) {
        alert(`A categoria ${c.nome} ainda tem ${n} material(is). Mova ou exclua esses materiais antes de apagar a categoria.`);
        return;
      }
      if (!confirm(`Excluir a categoria ${c.nome}?`)) return;
      await DB.delete('categorias_material', c.id);
      renderCategoriasMaterial(view);
    })
  );

  if (cf) {
    const input = document.getElementById('f-cat-mat-nome');
    input.addEventListener('input', () => (cf.nome = input.value));
    input.focus();
    document.getElementById('btn-cancelar-cat-mat').addEventListener('click', () => {
      MateriaisView.catForm = null;
      renderCategoriasMaterial(view);
    });
    document.getElementById('btn-salvar-cat-mat').addEventListener('click', async () => {
      const nome = (cf.nome || '').trim();
      if (!nome) {
        cf.erro = 'Digite o nome da categoria.';
        return renderCategoriasMaterial(view);
      }
      const repetida = cats.find((c) => c.id !== cf.editId && normalizaBuscaMaterial(c.nome) === normalizaBuscaMaterial(nome));
      if (repetida) {
        cf.erro = `Já existe a categoria ${repetida.nome}.`;
        return renderCategoriasMaterial(view);
      }
      const btn = document.getElementById('btn-salvar-cat-mat');
      btn.disabled = true;
      btn.textContent = 'Salvando…';
      window.operacaoEmAndamento = true;
      try {
        await comTimeout(
          (async () => {
            if (cf.editId) {
              const cat = cats.find((c) => c.id === cf.editId);
              const antigo = cat.nome;
              cat.nome = nome;
              cat.atualizadoEm = Date.now();
              await DB.put('categorias_material', cat);
              if (antigo !== nome) {
                // leva o nome novo pros materiais e pros serviços que já usam
                const mats = (await DB.getAll('materiais')).filter((m) => m.tipo === antigo);
                mats.forEach((m) => (m.tipo = nome));
                if (mats.length) await DB.putMany('materiais', mats);
                const servs = (await DB.getAll('servicos')).filter((sv) => sv.materialTipo === antigo);
                servs.forEach((sv) => (sv.materialTipo = nome));
                if (servs.length) await DB.putMany('servicos', servs);
                if (MateriaisView.filtroTipo === antigo) MateriaisView.filtroTipo = nome;
              }
            } else {
              await DB.put('categorias_material', {
                id: dbUtil.uid(),
                nome,
                criadoEm: Date.now(),
                criadoPorId: Auth.current.id,
                criadoPorNome: Auth.current.nome,
                ...Materiais.statusNovo(),
              });
            }
          })()
        );
      } catch (e) {
        cf.erro = 'Não consegui salvar: ' + (e && e.message ? e.message : 'erro desconhecido.');
        window.operacaoEmAndamento = false;
        return renderCategoriasMaterial(view);
      }
      window.operacaoEmAndamento = false;
      MateriaisView.catForm = null;
      renderCategoriasMaterial(view);
    });
  }
}

/* ---------------- PDF DOS MATERIAIS ----------------
   Tabela agrupada por categoria (A→Z), com a largura. */

async function montarPdfMateriais(materiais, usos) {
  const comFoto = materiais.some((m) => (m.imagens || []).length);
  const ordenados = [...materiais].sort(
    (a, b) => (a.tipo || '').localeCompare(b.tipo || '', 'pt-BR') || (a.nome || '').localeCompare(b.nome || '', 'pt-BR', { numeric: true })
  );
  const porCat = {};
  ordenados.forEach((m) => (porCat[m.tipo || '—'] = (porCat[m.tipo || '—'] || 0) + 1));
  const linhas = [];
  let atual = null;
  ordenados.forEach((m) => {
    const cat = m.tipo || '—';
    if (cat !== atual) {
      atual = cat;
      linhas.push(`<tr class="rp-grupo"><td colspan="${comFoto ? 5 : 4}">${escapeHtml(cat)} — ${porCat[cat]} material(is)</td></tr>`);
    }
    const foto = (m.imagens || []).find((im) => im.linkImagem);
    linhas.push(`<tr>
      ${comFoto ? `<td class="rp-mat-foto">${foto ? `<img src="${foto.linkImagem}" alt="" referrerpolicy="no-referrer" />` : ''}</td>` : ''}
      <td>${escapeHtml(m.nome)}${m.aprovado === 'pendente' ? ' <span class="rp-fraco">(pendente)</span>' : ''}</td>
      <td class="num">${m.largura != null && m.largura !== '' ? formatarLarguraMaterial(m.largura) : '—'}</td>
      <td>${escapeHtml(m.observacao || '')}</td>
      <td class="num">${usos && usos[m.id] ? usos[m.id] : 0}</td>
    </tr>`);
  });
  const blocos = [
    { tipo: 'titulo', html: `<h2 class="rp-secao">Materiais</h2><p class="rp-nota">${ordenados.length} material(is) em ${Object.keys(porCat).length} categoria(s)</p>` },
    {
      tipo: 'tabela',
      cabecalho: `<tr>${comFoto ? '<th>Foto</th>' : ''}<th>Material</th><th class="num">Largura</th><th>Observação</th><th class="num">Usado em</th></tr>`,
      linhas,
      classe: '',
    },
  ];
  return montarPdfPadrao(blocos, {
    titulo: 'Lista de Materiais',
    periodo: `${ordenados.length} material${ordenados.length === 1 ? '' : 'is'}`,
    detalhes: 'Materiais com a largura, por categoria',
  });
}

/* ---------------- FOTOS DO MATERIAL ---------------- */

// miniaturas clicáveis (abre a foto grande no Drive)
function miniaturasMaterial(imagens, tamanho) {
  const lista = (imagens || []).filter((im) => im.linkImagem);
  if (!lista.length) return '';
  return `<div class="mat-fotos">${lista
    .map(
      (im) => `<a href="${im.linkVisualizar || im.linkImagem}" target="_blank" rel="noopener" title="${escapeHtml(im.nome || '')}">
        <img src="${im.linkImagem}" alt="${escapeHtml(im.nome || '')}" referrerpolicy="no-referrer" style="width:${tamanho}px; height:${tamanho}px" />
      </a>`
    )
    .join('')}</div>`;
}

function renderListaImagensMaterial(view) {
  const st = MateriaisView.formState;
  const cont = document.getElementById('lista-imagens-mat');
  if (!cont || !st) return;
  if (!st.imagens || st.imagens.length === 0) {
    cont.innerHTML = '<div class="row__meta">Nenhuma foto ainda.</div>';
    return;
  }
  cont.innerHTML = `
    <div style="display:flex; gap:10px; flex-wrap:wrap">
      ${st.imagens
        .map(
          (img) => `
        <div style="position:relative">
          <img src="${img.linkImagem}" alt="${escapeHtml(img.nome || '')}" referrerpolicy="no-referrer" style="width:80px; height:80px; object-fit:cover; border-radius:8px; border:1px solid var(--line)" />
          <button data-remover-imagem-mat="${img.id}" aria-label="Remover foto" style="position:absolute; top:-6px; right:-6px; width:22px; height:22px; border-radius:50%; background:var(--danger-fg); color:#fff; font-size:14px; line-height:1; display:flex; align-items:center; justify-content:center">×</button>
        </div>`
        )
        .join('')}
    </div>`;
  cont.querySelectorAll('[data-remover-imagem-mat]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.removerImagemMat;
      try {
        await Drive.excluirArquivo(id);
      } catch (e) {
        console.warn('Foto não apagada do Drive:', e);
      }
      st.imagens = st.imagens.filter((img) => img.id !== id);
      renderListaImagensMaterial(view);
    });
  });
}

window.Materiais = Materiais;
