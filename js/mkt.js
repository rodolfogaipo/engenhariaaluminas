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
  modoSelecao: false, // marcar produtos pra gerar a ficha em PDF
  selecionados: new Set(),
};

function podeEditarMkt() {
  const tipo = Auth.current?.tipo;
  return tipo === 'admin' || tipo === 'funcionario';
}

function podeAprovarMkt() {
  return Auth.isAdmin();
}

function formatarTamanhoArquivoMkt(bytes) {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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
      <div style="display:flex; gap:8px; flex-wrap:wrap">
        <button class="btn ${MktView.modoSelecao ? 'btn--primary' : 'btn--ghost'}" id="btn-selecao-mkt">${MktView.modoSelecao ? 'Cancelar seleção' : 'Selecionar para PDF'}</button>
        ${editavel ? '<button class="btn btn--primary" id="btn-novo-mkt">+ Novo Produto</button>' : ''}
      </div>
    </div>

    <div class="field" style="margin-bottom:20px">
      <input id="busca-mkt" placeholder="Buscar por nome…" value="${escapeHtml(MktView.filtroTexto)}" />
    </div>

    <div id="barra-mkt"></div>
    <div id="mkt-previa"></div>
    <div id="lista-mkt"></div>
  `;

  document.getElementById('btn-selecao-mkt').addEventListener('click', () => {
    MktView.modoSelecao = !MktView.modoSelecao;
    if (!MktView.modoSelecao) MktView.selecionados.clear();
    renderMktLista(view);
  });

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
  const usuariosPorId = {};
  const usuariosPorNome = {};
  (await DB.getAll('usuarios')).forEach((u) => {
    usuariosPorId[u.id] = u;
    usuariosPorNome[u.nome] = u;
  });
  const filtro = (MktView.filtroTexto || '').trim().toLowerCase();
  const filtrados = todos
    .filter((p) => !somenteAprovados || p.aprovado === 'aprovado')
    .filter((p) => !filtro || (p.nome || '').toLowerCase().includes(filtro))
    .sort((a, b) => (b.criadoEm || 0) - (a.criadoEm || 0));

  const listaEl = document.getElementById('lista-mkt');
  if (!listaEl) return;

  MktView._visiveis = filtrados;
  renderBarraSelecaoMkt(view, todos);

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
        .map((c) => `<div>${c.label}: ${escapeHtml(String(p[c.chave]))}cm</div>`)
        .join('');
      const statusBadge =
        p.aprovado === 'aprovado' ? '' : '<span class="badge badge--warn">Pendente aprovação</span>';
      const aprovBtn =
        podeAprovar && p.aprovado !== 'aprovado'
          ? `<button class="btn btn--ghost" data-aprovar-mkt="${p.id}" style="padding:6px 12px; font-size:13px">Aprovar</button>`
          : '';
      const fotosHtml =
        p.imagens && p.imagens.length
          ? `<div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:10px">
              ${p.imagens
                .map(
                  (img) =>
                    `<a href="${img.linkVisualizar}" target="_blank" rel="noopener"><img src="${img.linkImagem}" alt="${escapeHtml(img.nome)}" style="width:72px; height:72px; object-fit:cover; border-radius:8px; border:1px solid var(--line)" /></a>`
                )
                .join('')}
            </div>`
          : '';
      const marcado = MktView.selecionados.has(p.id);
      return `
      <div class="card" ${MktView.modoSelecao && marcado ? 'style="border-color:var(--brand-500); box-shadow:0 0 0 2px var(--brand-100)"' : ''}>
        <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:10px; flex-wrap:wrap">
          <div style="display:flex; gap:12px; align-items:flex-start">
          ${
            MktView.modoSelecao
              ? `<input type="checkbox" class="chk-mkt" data-id="${p.id}" ${marcado ? 'checked' : ''} aria-label="Selecionar ${escapeHtml(p.nome)}" style="width:22px; height:22px; margin-top:2px; flex:0 0 auto; accent-color:var(--brand-700)" />`
              : ''
          }
          <div>
            <div class="row__title" style="font-size:15.5px">${escapeHtml(p.nome)}</div>
            <div class="row__meta" style="margin-top:4px">${medidas || 'Sem medidas preenchidas'}</div>
            <div class="row__meta" style="display:flex; align-items:center; gap:6px; margin-top:4px">${avatarUsuario(usuariosPorId[p.criadoPorId] || usuariosPorNome[p.criadoPorNome] || { nome: p.criadoPorNome }, 22)}${escapeHtml(p.criadoPorNome || '—')}</div>
            ${fotosHtml}
          </div>
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

  listaEl.querySelectorAll('.chk-mkt').forEach((chk) =>
    chk.addEventListener('change', () => {
      if (chk.checked) MktView.selecionados.add(chk.dataset.id);
      else MktView.selecionados.delete(chk.dataset.id);
      const card = chk.closest('.card');
      if (card) card.style.cssText = chk.checked ? 'border-color:var(--brand-500); box-shadow:0 0 0 2px var(--brand-100)' : '';
      renderBarraSelecaoMkt(view, todos);
    })
  );

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
      if (!confirm('Excluir este produto? As fotos também somem do Drive.')) return;
      const p = await DB.get('produtos_mkt', btn.dataset.excluirMkt);
      if (p?.imagens) {
        for (const img of p.imagens) await Drive.excluirArquivo(img.id);
      }
      await DB.delete('produtos_mkt', btn.dataset.excluirMkt);
      atualizarListaMkt(view);
    });
  });
}

/* ---------------- SELEÇÃO + FICHA EM PDF ----------------
   Marca os produtos e gera um PDF com nome, medidas e fotos de cada
   um — mesmo cabeçalho (logo + Engenharia Aluminas) e rodapé do
   Relatório, com número de página quando passa de uma folha. */

function renderBarraSelecaoMkt(view, todos) {
  const cont = document.getElementById('barra-mkt');
  if (!cont) return;
  if (!MktView.modoSelecao) {
    cont.innerHTML = '';
    return;
  }
  // tira da seleção o que foi excluído nesse meio tempo
  const existentes = new Set(todos.map((p) => p.id));
  Array.from(MktView.selecionados).forEach((id) => {
    if (!existentes.has(id)) MktView.selecionados.delete(id);
  });
  const n = MktView.selecionados.size;
  cont.innerHTML = `
    <div class="card" style="display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap; padding:12px 16px; margin-bottom:14px; background:var(--paper-dim)">
      <b>${n} produto${n === 1 ? '' : 's'} marcado${n === 1 ? '' : 's'}</b>
      <div style="display:flex; gap:8px; flex-wrap:wrap">
        <button class="btn btn--ghost" id="btn-mkt-marcar-todos" style="padding:8px 12px; font-size:13px; background:var(--surface)">Marcar todos da busca</button>
        <button class="btn btn--ghost" id="btn-mkt-limpar" style="padding:8px 12px; font-size:13px; background:var(--surface)" ${n ? '' : 'disabled'}>Desmarcar</button>
        <button class="btn btn--ghost" id="btn-mkt-visualizar" style="padding:8px 12px; font-size:13px; background:var(--surface)" ${n ? '' : 'disabled'}>Visualizar</button>
        <button class="btn btn--primary" id="btn-mkt-pdf" style="padding:8px 14px; font-size:13px" ${n ? '' : 'disabled'}>Gerar PDF</button>
      </div>
      <div class="row__meta" id="mkt-pdf-status" style="flex-basis:100%">${n ? 'Na janela de impressão, escolha "Salvar como PDF".' : 'Marque as caixinhas dos produtos que vão na ficha.'}</div>
    </div>
  `;
  document.getElementById('btn-mkt-marcar-todos').addEventListener('click', () => {
    (MktView._visiveis || []).forEach((p) => MktView.selecionados.add(p.id));
    atualizarListaMkt(view);
  });
  document.getElementById('btn-mkt-limpar').addEventListener('click', () => {
    MktView.selecionados.clear();
    const previa = document.getElementById('mkt-previa');
    if (previa) previa.innerHTML = '';
    atualizarListaMkt(view);
  });
  const status = (msg) => {
    const el = document.getElementById('mkt-pdf-status');
    if (el) el.textContent = msg;
  };
  const montar = async () => {
    const produtos = todos
      .filter((p) => MktView.selecionados.has(p.id))
      .sort((a, b) => (a.nome || '').localeCompare(b.nome || '', 'pt-BR', { numeric: true }));
    status('Carregando as fotos e montando as páginas…');
    return montarFichaMkt(produtos);
  };
  document.getElementById('btn-mkt-visualizar').addEventListener('click', async () => {
    const n = await montar();
    mostrarPreviaRelatorio(document.getElementById('mkt-previa'));
    status(`Prévia pronta: ${n} página(s).`);
  });
  document.getElementById('btn-mkt-pdf').addEventListener('click', async () => {
    const n = await montar();
    status(`${n} página(s). Abrindo a impressão — escolha "Salvar como PDF".`);
    imprimirRelatorio();
  });
}

function esperarImagens(root, limiteMs = 20000) {
  const imgs = Array.from(root.querySelectorAll('img'));
  return Promise.all(
    imgs.map(
      (img) =>
        new Promise((resolve) => {
          if (img.complete && img.naturalWidth > 0) return resolve();
          const fim = () => resolve();
          img.addEventListener('load', fim, { once: true });
          img.addEventListener('error', fim, { once: true });
          setTimeout(fim, limiteMs); // foto que não carrega não trava o PDF
        })
    )
  );
}

async function montarFichaMkt(produtos) {
  const FOTOS_NO_CARTAO = 6;
  const FOTOS_POR_BLOCO_EXTRA = 8;
  const fotoHtml = (img) => `<div class="rp-foto"><img src="${img.linkImagem}" alt="" referrerpolicy="no-referrer" /></div>`;
  const blocos = [];

  produtos.forEach((p) => {
    const medidas = CAMPOS_MEDIDA.filter((c) => p[c.chave] != null && p[c.chave] !== '');
    const imagens = (p.imagens || []).filter((i) => i && i.linkImagem);
    const primeiras = imagens.slice(0, FOTOS_NO_CARTAO);
    blocos.push({
      tipo: 'html',
      html: `
        <div class="rp-produto">
          <div class="rp-produto__nome">${escapeHtml(p.nome || '(sem nome)')}</div>
          <div class="rp-produto__corpo">
            <div>
              ${
                medidas.length
                  ? `<table class="rp-medidas">${medidas
                      .map((c) => `<tr><td>${escapeHtml(c.label)}</td><td class="num">${escapeHtml(formatarNumero(Number(p[c.chave]), 1))} cm</td></tr>`)
                      .join('')}</table>`
                  : '<div class="rp-fraco">Sem medidas preenchidas.</div>'
              }
              ${p.aprovado !== 'aprovado' ? '<div class="rp-fraco" style="margin-top:2mm">Cadastro ainda pendente de aprovação.</div>' : ''}
            </div>
            <div class="rp-produto__fotos">${primeiras.length ? primeiras.map(fotoHtml).join('') : '<div class="rp-fraco">Sem fotos.</div>'}</div>
          </div>
        </div>`,
    });
    // fotos que não couberam no cartão vão logo abaixo, em blocos que quebram de página
    for (let i = FOTOS_NO_CARTAO; i < imagens.length; i += FOTOS_POR_BLOCO_EXTRA) {
      blocos.push({
        tipo: 'html',
        html: `
          <div class="rp-produto rp-produto--mais">
            <div class="rp-produto__mais">${escapeHtml(p.nome || '')} — mais fotos</div>
            <div class="rp-produto__fotos rp-produto__fotos--largo">${imagens.slice(i, i + FOTOS_POR_BLOCO_EXTRA).map(fotoHtml).join('')}</div>
          </div>`,
      });
    }
  });

  const cab = {
    titulo: 'Ficha de Produtos — MKT',
    periodo: `${produtos.length} produto${produtos.length === 1 ? '' : 's'}`,
    detalhes: 'Medidas e fotos dos produtos finalizados',
    geradoEm: Const.formatarDataHora(Date.now()),
  };
  const root = garantirPrintRoot();
  // as fotos têm tamanho fixo na folha, então a divisão das páginas não
  // depende delas terem carregado — mas espera carregar antes de imprimir
  const n = paginarRelatorio(root, blocos, cab);
  await esperarImagens(root);
  return n;
}

/* ---------------- FORMULÁRIO ---------------- */

function criarEstadoMktVazio() {
  const st = { editId: null, nome: '', imagens: [], erro: '' };
  CAMPOS_MEDIDA.forEach((c) => (st[c.chave] = ''));
  return st;
}

function criarEstadoMktEdicao(p) {
  const st = { editId: p.id, nome: p.nome || '', imagens: p.imagens ? [...p.imagens] : [], erro: '' };
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

      ${
        Auth.isAdmin()
          ? `<div class="field">
              <label for="f-mkt-imagens">Fotos do produto (opcional, até 200MB cada)</label>
              <input id="f-mkt-imagens" type="file" accept="image/*" multiple />
              <div id="lista-imagens-mkt" style="margin-top:10px"></div>
            </div>`
          : ''
      }

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

  const imagensInput = document.getElementById('f-mkt-imagens');
  if (imagensInput) {
    imagensInput.addEventListener('change', async (ev) => {
      const arquivos = Array.from(ev.target.files || []);
      if (arquivos.length === 0) return;
      imagensInput.disabled = true;
      document.getElementById('btn-salvar-mkt').disabled = true;
      const cont = document.getElementById('lista-imagens-mkt');
      const { enviados, erros } = await Drive.enviarVarios(arquivos, (feitos, total) => {
        if (cont) cont.innerHTML = `<div class="row__meta">Enviando pro Google Drive: ${feitos} de ${total} pronto(s)… aguarde antes de Salvar</div>`;
      });
      st.imagens.push(...enviados);
      if (erros.length) st.erro = erros.map((e) => `Não consegui enviar "${e.nome}": ${e.mensagem}`).join(' ');
      imagensInput.value = '';
      imagensInput.disabled = false;
      renderMktForm(view);
    });
  }

  renderListaImagensMkt(view);

  document.getElementById('btn-salvar-mkt').addEventListener('click', () => salvarMktComTratamentoDeErro(view));
}

async function salvarMktComTratamentoDeErro(view) {
  const st = MktView.formState;
  const btn = document.getElementById('btn-salvar-mkt');
  const btnCancelar = document.getElementById('btn-cancelar-mkt');
  if (btn) { btn.disabled = true; btn.textContent = 'Salvando…'; }
  if (btnCancelar) btnCancelar.disabled = true;
  window.operacaoEmAndamento = true;
  try {
    await comTimeout(salvarMkt(view));
  } catch (e) {
    console.error('Erro ao salvar produto MKT:', e);
    st.erro = 'Não consegui salvar: ' + (e && e.message ? e.message : 'erro desconhecido. Confira sua conexão e tente de novo.');
    window.operacaoEmAndamento = false;
    await renderMktForm(view);
    return;
  }
  window.operacaoEmAndamento = false;
}

function renderListaImagensMkt(view) {
  const st = MktView.formState;
  const cont = document.getElementById('lista-imagens-mkt');
  if (!cont) return;

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
          <img src="${img.linkImagem}" alt="${escapeHtml(img.nome)}" style="width:80px; height:80px; object-fit:cover; border-radius:8px; border:1px solid var(--line)" />
          <button data-remover-imagem-mkt="${img.id}" style="position:absolute; top:-6px; right:-6px; width:22px; height:22px; border-radius:50%; background:var(--danger-fg); color:#fff; font-size:14px; line-height:1; display:flex; align-items:center; justify-content:center">×</button>
        </div>`
        )
        .join('')}
    </div>
  `;

  cont.querySelectorAll('[data-remover-imagem-mkt]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.removerImagemMkt;
      await Drive.excluirArquivo(id);
      st.imagens = st.imagens.filter((img) => img.id !== id);
      renderListaImagensMkt(view);
    });
  });
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
  registro.imagens = st.imagens;
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

  try {
    await DB.put('produtos_mkt', registro);
    voltarParaListaMkt();
  } catch (e) {
    st.erro = 'Não consegui salvar: ' + e.message;
    renderMktForm(view);
  }
}
