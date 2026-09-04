/* =========================================================
   treino.js — Treinamento
   Título, descrição e anexos (PDF, imagem, vídeo) via Google Drive.
   Admin cria/edita/exclui; todo mundo com acesso à aba visualiza
   e baixa.
   ========================================================= */

const TreinoView = {
  subView: 'lista', // 'lista' | 'form'
  formState: null,
};

function formatarTamanhoArquivoTreino(bytes) {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function iconeAnexo(tipo) {
  if (tipo === 'imagem') return '🖼️';
  if (tipo === 'video') return '🎬';
  return '📄';
}

async function renderTreino(view) {
  if (TreinoView.subView === 'form' && Auth.isAdmin()) {
    return renderTreinoForm(view);
  }
  return renderTreinoLista(view);
}

async function renderTreinoLista(view) {
  const todos = await DB.getAll('treinamento');
  const ordenados = todos.sort((a, b) => (b.criadoEm || 0) - (a.criadoEm || 0));

  view.innerHTML = `
    <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:16px; flex-wrap:wrap">
      <div>
        <h2 class="section-title" style="margin-bottom:2px">Treinamento</h2>
        <p class="section-sub" style="margin:0">Padrões de desenho e tutoriais de ferramentas</p>
      </div>
      ${Auth.isAdmin() ? '<button class="btn btn--primary" id="btn-novo-treino">+ Novo Conteúdo</button>' : ''}
    </div>
    <div id="lista-treino"></div>
  `;

  if (Auth.isAdmin()) {
    document.getElementById('btn-novo-treino').addEventListener('click', () => {
      TreinoView.subView = 'form';
      TreinoView.formState = { editId: null, titulo: '', descricao: '', anexos: [], erro: '' };
      renderView('treino');
    });
  }

  const listaEl = document.getElementById('lista-treino');
  if (ordenados.length === 0) {
    listaEl.innerHTML = `
      <div class="card">
        <div class="empty">
          <div class="empty__title">Nenhum conteúdo ainda</div>
          <div class="empty__sub">${Auth.isAdmin() ? 'Toque em "+ Novo Conteúdo" para publicar o primeiro.' : 'Quando o administrador publicar algo, aparece aqui.'}</div>
        </div>
      </div>`;
    return;
  }

  listaEl.innerHTML = ordenados
    .map((t) => {
      const imagens = (t.anexos || []).filter((a) => a.tipo === 'imagem');
      const outros = (t.anexos || []).filter((a) => a.tipo !== 'imagem');
      const fotosHtml = imagens.length
        ? `<div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:10px">
            ${imagens
              .map(
                (a) =>
                  `<a href="${a.linkVisualizar}" target="_blank" rel="noopener"><img src="${a.linkImagem}" alt="${escapeHtml(a.nome)}" style="width:72px; height:72px; object-fit:cover; border-radius:8px; border:1px solid var(--line)" /></a>`
              )
              .join('')}
          </div>`
        : '';
      const anexosHtml = outros.length
        ? `<div class="row__meta" style="margin-top:8px; display:flex; flex-direction:column; gap:4px">
            ${outros
              .map(
                (a) =>
                  `<a href="${a.linkBaixar}" target="_blank" rel="noopener" style="color:var(--brand-700); font-weight:600; text-decoration:underline">${iconeAnexo(a.tipo)} ${escapeHtml(a.nome)} (${formatarTamanhoArquivoTreino(a.tamanho)})</a>`
              )
              .join('')}
          </div>`
        : '';
      return `
      <div class="card">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:10px; flex-wrap:wrap">
          <div style="flex:1 1 200px">
            <div class="row__title" style="font-size:15.5px">${escapeHtml(t.titulo)}</div>
            <div class="row__meta" style="margin-top:6px; white-space:pre-wrap">${escapeHtml(t.descricao || '')}</div>
            ${fotosHtml}
            ${anexosHtml}
          </div>
          ${
            Auth.isAdmin()
              ? `<div style="display:flex; gap:6px; flex:0 0 auto">
                  <button class="btn btn--ghost" data-editar-treino="${t.id}" style="padding:6px 12px; font-size:13px">Editar</button>
                  <button class="btn btn--danger" data-excluir-treino="${t.id}" style="padding:6px 12px; font-size:13px">Excluir</button>
                </div>`
              : ''
          }
        </div>
      </div>`;
    })
    .join('');

  if (!Auth.isAdmin()) return;

  listaEl.querySelectorAll('[data-editar-treino]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const t = await DB.get('treinamento', btn.dataset.editarTreino);
      if (!t) return;
      TreinoView.subView = 'form';
      TreinoView.formState = {
        editId: t.id,
        titulo: t.titulo || '',
        descricao: t.descricao || '',
        anexos: t.anexos ? [...t.anexos] : [],
        erro: '',
      };
      renderView('treino');
    });
  });

  listaEl.querySelectorAll('[data-excluir-treino]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('Excluir este conteúdo? Os anexos também somem do Drive.')) return;
      const t = await DB.get('treinamento', btn.dataset.excluirTreino);
      if (t?.anexos) {
        for (const a of t.anexos) await Drive.excluirArquivo(a.id);
      }
      await DB.delete('treinamento', btn.dataset.excluirTreino);
      renderTreinoLista(view);
    });
  });
}

async function renderTreinoForm(view) {
  const st = TreinoView.formState;
  const editando = !!st.editId;

  view.innerHTML = `
    <div style="display:flex; align-items:center; gap:10px; margin-bottom:16px">
      <button class="topbar__icon-btn" id="btn-voltar-treino" aria-label="Voltar" style="background:var(--paper-dim)">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="20" height="20"><path d="M15 18l-6-6 6-6"/></svg>
      </button>
      <h2 class="section-title" style="margin:0">${editando ? 'Editar Conteúdo' : 'Novo Conteúdo'}</h2>
    </div>

    ${st.erro ? `<div class="auth__error show" style="text-align:left; margin-bottom:16px">${escapeHtml(st.erro)}</div>` : ''}

    <div class="card">
      <div class="field">
        <label for="f-treino-titulo">Título</label>
        <input id="f-treino-titulo" value="${escapeHtml(st.titulo)}" placeholder="Ex: Como programar a máquina de corte a laser" />
      </div>
      <div class="field">
        <label for="f-treino-desc">Descrição / passo a passo</label>
        <textarea id="f-treino-desc" style="min-height:140px">${escapeHtml(st.descricao)}</textarea>
      </div>

      <div class="field">
        <label for="f-treino-anexos">Anexos — PDF, imagem ou vídeo (opcional, até 200MB cada)</label>
        <input id="f-treino-anexos" type="file" accept="application/pdf,image/*,video/*" multiple />
        <div id="lista-anexos-treino" style="margin-top:10px"></div>
      </div>

      <div style="display:flex; gap:10px">
        <button class="btn btn--ghost" id="btn-cancelar-treino" style="flex:1">Cancelar</button>
        <button class="btn btn--primary" id="btn-salvar-treino" style="flex:2">Salvar</button>
      </div>
    </div>
  `;

  document.getElementById('btn-voltar-treino').addEventListener('click', voltarParaListaTreino);
  document.getElementById('btn-cancelar-treino').addEventListener('click', voltarParaListaTreino);
  document.getElementById('f-treino-titulo').addEventListener('input', (ev) => (st.titulo = ev.target.value));
  document.getElementById('f-treino-desc').addEventListener('input', (ev) => (st.descricao = ev.target.value));

  const anexosInput = document.getElementById('f-treino-anexos');
  anexosInput.addEventListener('change', async (ev) => {
    const arquivos = Array.from(ev.target.files || []);
    if (arquivos.length === 0) return;
    anexosInput.disabled = true;
    document.getElementById('btn-salvar-treino').disabled = true;
    const cont = document.getElementById('lista-anexos-treino');
    for (const arquivo of arquivos) {
      cont.innerHTML = `<div class="row__meta">Enviando "${escapeHtml(arquivo.name)}" pro Google Drive… (pode levar um tempo, dependendo do tamanho) — aguarde antes de Salvar</div>`;
      try {
        const anexo = await Drive.enviarArquivo(arquivo);
        st.anexos.push(anexo);
      } catch (e) {
        st.erro = `Não consegui enviar "${arquivo.name}": ${e.message}`;
      }
    }
    anexosInput.value = '';
    anexosInput.disabled = false;
    renderTreinoForm(view);
  });

  renderListaAnexosTreino(view);

  document.getElementById('btn-salvar-treino').addEventListener('click', async () => {
    const titulo = (st.titulo || '').trim();
    if (!titulo) {
      st.erro = 'Digite um título.';
      return renderTreinoForm(view);
    }
    const registro = st.editId ? await DB.get('treinamento', st.editId) : { id: dbUtil.uid(), criadoEm: Date.now() };
    registro.titulo = titulo;
    registro.descricao = st.descricao || '';
    registro.anexos = st.anexos;
    registro.atualizadoEm = Date.now();
    await DB.put('treinamento', registro);
    voltarParaListaTreino();
  });
}

function renderListaAnexosTreino(view) {
  const st = TreinoView.formState;
  const cont = document.getElementById('lista-anexos-treino');
  if (!cont) return;

  if (!st.anexos || st.anexos.length === 0) {
    cont.innerHTML = '<div class="row__meta">Nenhum anexo ainda.</div>';
    return;
  }

  cont.innerHTML = st.anexos
    .map(
      (a) => `
      <div class="row" style="padding:8px 0">
        <div class="row__main" style="display:flex; align-items:center; gap:10px">
          ${a.tipo === 'imagem' ? `<img src="${a.linkImagem}" alt="" style="width:36px; height:36px; object-fit:cover; border-radius:6px; flex:0 0 auto" />` : ''}
          <div>
            <div class="row__title" style="font-size:13.5px">${iconeAnexo(a.tipo)} ${escapeHtml(a.nome)}</div>
            <div class="row__meta">${formatarTamanhoArquivoTreino(a.tamanho)}</div>
          </div>
        </div>
        <button class="btn btn--danger" data-remover-anexo-treino="${a.id}" style="padding:5px 10px; font-size:12px">Remover</button>
      </div>`
    )
    .join('');

  cont.querySelectorAll('[data-remover-anexo-treino]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.removerAnexoTreino;
      await Drive.excluirArquivo(id);
      st.anexos = st.anexos.filter((a) => a.id !== id);
      renderListaAnexosTreino(view);
    });
  });
}

function voltarParaListaTreino() {
  TreinoView.subView = 'lista';
  TreinoView.formState = null;
  renderView('treino');
}
