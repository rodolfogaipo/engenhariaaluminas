/* =========================================================
   servicos.js — módulo de Serviços
   - Lista de serviços lançados (filtrada por usuário / todos p/ admin)
   - Lançar novo serviço, com busca no catálogo pra tipos de
     "Cadastro X" (evita duplicidade — mostra "Atualizar" se já existe)
   - Aprovação pelo Admin
   ========================================================= */

const ServicosView = {
  subView: 'lista',       // 'lista' | 'form'
  filtroTexto: '',
  formState: null,        // estado do formulário em edição
};

async function renderServicos(view) {
  if (ServicosView.subView === 'form') {
    return renderServicoForm(view);
  }
  if (ServicosView.subView === 'concluir') {
    return renderConcluirServico(view);
  }
  return renderServicosLista(view);
}

/* ---------------- LISTA ---------------- */

async function renderServicosLista(view) {
  const user = Auth.current;

  view.innerHTML = `
    <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:16px; flex-wrap:wrap">
      <div>
        <h2 class="section-title" style="margin-bottom:2px">Serviços</h2>
        <p class="section-sub" style="margin:0">${user.tipo === 'admin' ? 'Todos os lançamentos da equipe' : 'Seus lançamentos'}</p>
      </div>
      <button class="btn btn--primary" id="btn-novo-servico">+ Novo Serviço</button>
    </div>

    <div class="field" style="margin-bottom:20px">
      <input id="busca-servico" placeholder="Buscar por nome, tipo ou funcionário…" value="${escapeHtml(ServicosView.filtroTexto)}" />
    </div>

    <div id="lista-servicos"></div>
  `;

  document.getElementById('btn-novo-servico').addEventListener('click', () => {
    ServicosView.subView = 'form';
    ServicosView.formState = criarEstadoFormularioVazio();
    renderView('servicos');
  });

  const buscaInput = document.getElementById('busca-servico');
  buscaInput.addEventListener('input', () => {
    ServicosView.filtroTexto = buscaInput.value;
    atualizarListaServicos(view);
  });

  await atualizarListaServicos(view);
}

async function atualizarListaServicos(view) {
  const user = Auth.current;
  const todos = await DB.getAll('servicos');

  const meus = user.tipo === 'admin' ? todos : todos.filter((s) => s.funcionarioId === user.id);
  const filtro = Const_normaliza(ServicosView.filtroTexto);
  const filtrados = meus
    .filter((s) => {
      if (!filtro) return true;
      return (
        Const_normaliza(s.nome).includes(filtro) ||
        Const_normaliza(s.tipo).includes(filtro) ||
        Const_normaliza(s.funcionarioNome).includes(filtro)
      );
    })
    .sort((a, b) => b.criadoEm - a.criadoEm);

  const listaEl = document.getElementById('lista-servicos');
  if (!listaEl) return;

  if (filtrados.length === 0) {
    listaEl.innerHTML = `
      <div class="card">

        <div class="empty">
          <div class="empty__title">Nenhum serviço lançado ainda</div>
          <div class="empty__sub">Toque em "+ Novo Serviço" para lançar o primeiro.</div>
        </div>
      </div>`;
    return;
  }

  listaEl.innerHTML = `
    <div class="card" style="padding:0">
      ${filtrados
        .map((s) => {
          const statusBadge =
            s.aprovado === 'aprovado'
              ? '<span class="badge badge--ok">Aprovado</span>'
              : '<span class="badge badge--warn">Pendente</span>';
          const acaoLabel = s.acao ? ` · ${s.acao}` : '';
          const aprovBtn =
            user.tipo === 'admin' && s.aprovado !== 'aprovado'
              ? `<button class="btn btn--ghost" data-aprovar="${s.id}" style="padding:6px 12px; font-size:13px">Aprovar</button>`
              : '';
          const editBtn =
            user.tipo === 'admin'
              ? `<button class="btn btn--ghost" data-editar="${s.id}" style="padding:6px 12px; font-size:13px">Editar</button>`
              : '';
          const delBtn =
            user.tipo === 'admin'
              ? `<button class="btn btn--danger" data-excluir="${s.id}" style="padding:6px 12px; font-size:13px">Excluir</button>`
              : '';
          const podeMarcarConcluido =
            user.tipo !== 'admin' && !s.dataFinal && !s.concluidoInformadoEm && s.funcionarioId === user.id;
          const marcarBtn = podeMarcarConcluido
            ? `<button class="btn btn--metal" data-marcar-concluido="${s.id}" style="padding:6px 12px; font-size:13px">Marcar como concluído</button>`
            : '';

          const podeConcluirDireto = user.tipo === 'admin' && !s.dataFinal && !s.concluidoInformadoEm;
          const concluirDiretoBtn = podeConcluirDireto
            ? `<button class="btn btn--metal" data-concluir="${s.id}" style="padding:6px 12px; font-size:13px">Concluir</button>`
            : '';

          const podeValidar = user.tipo === 'admin' && !s.dataFinal && s.concluidoInformadoEm;
          const validarBtn = podeValidar
            ? `<button class="btn btn--primary" data-concluir="${s.id}" style="padding:6px 12px; font-size:13px">Validar conclusão</button>`
            : '';

          const aguardandoBadge =
            !s.dataFinal && s.concluidoInformadoEm
              ? '<span class="badge badge--warn">Aguardando validação do Admin</span>'
              : '';
          const concluidoBadge = s.dataFinal
            ? `<span class="badge badge--brand">Concluído ${Const.formatarData(s.dataFinal)}</span>`
            : '';
          return `
          <div class="row" style="padding:14px 18px">
            <div class="row__main">
              <div class="row__title">${escapeHtml(s.nome)}</div>
              <div class="row__meta">${escapeHtml(s.tipo)}${acaoLabel} · ${escapeHtml(s.funcionarioNome || '—')} · ${Const.formatarData(s.criadoEm)}</div>
              ${
                s.percentualAproveitamento != null
                  ? `<div class="row__meta">Aproveitamento: ${s.percentualAproveitamento}% · Desperdício: ${(100 - s.percentualAproveitamento).toFixed(1)}%</div>`
                  : ''
              }
              ${s.dataFinal ? `<div class="row__meta">Erros: ${s.erros || 0} · Erros novos: ${s.errosNovos || 0}</div>` : ''}
            </div>
            <div style="display:flex; align-items:center; gap:8px; flex:0 0 auto; flex-wrap:wrap; justify-content:flex-end">
              ${statusBadge}
              ${concluidoBadge}
              ${aguardandoBadge}
              ${marcarBtn}
              ${concluirDiretoBtn}
              ${validarBtn}
              ${aprovBtn}
              ${editBtn}
              ${delBtn}
            </div>
          </div>`;
        })
        .join('')}
    </div>
  `;

  listaEl.querySelectorAll('[data-marcar-concluido]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const registro = await DB.get('servicos', btn.dataset.marcarConcluido);
      if (!registro) return;
      registro.concluidoInformadoEm = Date.now();
      await DB.put('servicos', registro);
      atualizarListaServicos(view);
    });
  });

  listaEl.querySelectorAll('[data-aprovar]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.aprovar;
      const registro = await DB.get('servicos', id);
      if (!registro) return;
      registro.aprovado = 'aprovado';
      registro.dataAprovacao = Date.now();
      await DB.put('servicos', registro);
      if (registro.tipo === 'CNP') await sincronizarPlanoCorteComCNP(registro);
      atualizarListaServicos(view);
    });
  });

  listaEl.querySelectorAll('[data-concluir]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const registro = await DB.get('servicos', btn.dataset.concluir);
      if (!registro) return;
      ServicosView.subView = 'concluir';
      ServicosView.formState = { id: registro.id, nome: registro.nome, erros: '0', errosNovos: '0', erro: '' };
      renderView('servicos');
    });
  });

  listaEl.querySelectorAll('[data-editar]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const registro = await DB.get('servicos', btn.dataset.editar);
      if (!registro) return;
      ServicosView.subView = 'form';
      ServicosView.formState = criarEstadoFormularioEdicao(registro);
      renderView('servicos');
    });
  });

  listaEl.querySelectorAll('[data-excluir]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const registro = await DB.get('servicos', btn.dataset.excluir);
      if (!registro) return;
      const avisoCorte = registro.tipo === 'CNP' ? ' O registro correspondente em Plano de Corte também será excluído.' : '';
      if (!confirm(`Excluir "${registro.nome}"?${avisoCorte} Essa ação não pode ser desfeita.`)) return;
      await DB.delete('servicos', registro.id);
      if (registro.tipo === 'CNP') await excluirPlanoCorteLigado(registro.id);
      atualizarListaServicos(view);
    });
  });
}

function Const_normaliza(s) {
  return (s || '').toString().trim().toLowerCase();
}

/* ---------------- FORMULÁRIO ---------------- */

function criarEstadoFormularioVazio() {
  return {
    editId: null,
    tipo: '',
    numeroPedido: '',
    nomeLivre: '',
    dataProgramada: '',
    observacoes: '',
    percentual: '',
    catalogoNome: '',
    catalogoMatches: [],
    catalogoSelecionado: null, // item existente escolhido pra atualizar
    erro: '',
  };
}

function dataParaInputDate(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function criarEstadoFormularioEdicao(registro) {
  return {
    editId: registro.id,
    tipo: registro.tipo,
    numeroPedido: registro.numeroPedido || '',
    nomeLivre: registro.nome || '',
    dataProgramada: dataParaInputDate(registro.dataProgramada),
    observacoes: registro.observacoes || '',
    percentual: registro.percentualAproveitamento != null ? String(registro.percentualAproveitamento) : '',
    catalogoNome: registro.nome || '',
    catalogoMatches: [],
    catalogoSelecionado: null,
    erro: '',
  };
}

let categoriasCache = [];

async function renderServicoForm(view) {
  const st = ServicosView.formState;
  const editando = !!st.editId;
  categoriasCache = await Categorias.listar();
  const ehCadastro = !editando && !!Categorias.categoriaCadastroDe(categoriasCache, st.tipo);
  const ehCorteComAproveitamento = Categorias.temPorcentagem(categoriasCache, st.tipo);

  view.innerHTML = `
    <div style="display:flex; align-items:center; gap:10px; margin-bottom:16px">
      <button class="topbar__icon-btn" id="btn-voltar-servico" aria-label="Voltar" style="background:var(--paper-dim)">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="20" height="20"><path d="M15 18l-6-6 6-6"/></svg>
      </button>
      <h2 class="section-title" style="margin:0">${editando ? 'Editar Serviço' : 'Novo Serviço'}</h2>
    </div>

    ${st.erro ? `<div class="auth__error show" style="text-align:left; margin-bottom:16px">${escapeHtml(st.erro)}</div>` : ''}

    <div class="card">
      <div class="field">
        <label for="f-tipo">Tipo de Serviço</label>
        <select id="f-tipo" ${editando ? 'disabled' : ''}>
          <option value="">Selecione…</option>
          ${categoriasCache.map((c) => `<option value="${c.nome}" ${c.nome === st.tipo ? 'selected' : ''}>${c.nome}</option>`).join('')}
        </select>
        ${editando ? '<div class="row__meta" style="margin-top:6px">O tipo não pode ser alterado depois de lançado.</div>' : ''}
      </div>

      <div class="field">
        <label for="f-pedido">Nº Pedido (opcional)</label>
        <input id="f-pedido" value="${escapeHtml(st.numeroPedido)}" />
      </div>

      <div id="bloco-nome"></div>

      ${
        ehCorteComAproveitamento
          ? `<div class="field">
              <label for="f-percentual">% Aproveitamento (informado pelo programa de corte)</label>
              <input id="f-percentual" type="number" min="0" max="100" step="0.1" value="${escapeHtml(st.percentual)}" />
            </div>`
          : ''
      }

      <div class="field">
        <label for="f-data-prog">Data Programada (opcional)</label>
        <input id="f-data-prog" type="date" value="${escapeHtml(st.dataProgramada)}" />
      </div>

      <div class="field">
        <label for="f-obs">Observações (opcional)</label>
        <textarea id="f-obs">${escapeHtml(st.observacoes)}</textarea>
      </div>

      <div style="display:flex; gap:10px; margin-top:8px">
        <button class="btn btn--ghost" id="btn-cancelar-servico" style="flex:1">Cancelar</button>
        <button class="btn btn--primary" id="btn-salvar-servico" style="flex:2">
          ${ehCadastro && st.catalogoSelecionado ? 'Registrar atualização' : editando ? 'Salvar alterações' : 'Lançar serviço'}
        </button>
      </div>
    </div>
  `;

  document.getElementById('btn-voltar-servico').addEventListener('click', voltarParaLista);
  document.getElementById('btn-cancelar-servico').addEventListener('click', voltarParaLista);

  document.getElementById('f-tipo').addEventListener('change', (ev) => {
    st.tipo = ev.target.value;
    st.catalogoSelecionado = null;
    st.catalogoMatches = [];
    renderServicoForm(view);
  });

  document.getElementById('f-pedido').addEventListener('input', (ev) => (st.numeroPedido = ev.target.value));
  document.getElementById('f-data-prog').addEventListener('input', (ev) => (st.dataProgramada = ev.target.value));
  document.getElementById('f-obs').addEventListener('input', (ev) => (st.observacoes = ev.target.value));

  if (ehCorteComAproveitamento) {
    const el = document.getElementById('f-percentual');
    if (el) el.addEventListener('input', (ev) => (st.percentual = ev.target.value));
  }

  renderBlocoNome(view, ehCadastro);

  document.getElementById('btn-salvar-servico').addEventListener('click', () => salvarServico(view));
}

function voltarParaLista() {
  ServicosView.subView = 'lista';
  ServicosView.formState = null;
  renderView('servicos');
}

let buscaCatalogoTimer = null;

function renderBlocoNome(view, ehCadastro) {
  const st = ServicosView.formState;
  const bloco = document.getElementById('bloco-nome');
  if (!bloco) return;

  if (!ehCadastro) {
    bloco.innerHTML = `
      <div class="field">
        <label for="f-nome">Nome do Serviço / Produto</label>
        <input id="f-nome" value="${escapeHtml(st.nomeLivre)}" placeholder="Ex: MESA DE JANTAR AYRON..." />
      </div>
    `;
    document.getElementById('f-nome').addEventListener('input', (ev) => (st.nomeLivre = ev.target.value));
    return;
  }

  const categoria = Categorias.categoriaCadastroDe(categoriasCache, st.tipo);

  bloco.innerHTML = `
    <div class="field">
      <label for="f-cat-nome">Buscar / nomear ${categoria.toLowerCase()}</label>
      <input id="f-cat-nome" value="${escapeHtml(st.catalogoNome)}" placeholder="Digite o nome para buscar se já existe…" autocomplete="off" />
    </div>
    <div id="catalogo-resultados"></div>
  `;

  const input = document.getElementById('f-cat-nome');
  input.addEventListener('input', () => {
    st.catalogoNome = input.value;
    st.catalogoSelecionado = null;
    clearTimeout(buscaCatalogoTimer);
    buscaCatalogoTimer = setTimeout(() => buscarNoCatalogo(view, categoria), 250);
    atualizarBotaoSalvarLabel();
  });

  renderResultadosCatalogo(view);
}

async function buscarNoCatalogo(view, categoria) {
  const st = ServicosView.formState;
  if (!st.catalogoNome || st.catalogoNome.trim().length < 2) {
    st.catalogoMatches = [];
    renderResultadosCatalogo(view);
    return;
  }
  st.catalogoMatches = await Catalog.buscar(categoria, st.catalogoNome);

  // se houver correspondência exata pelo nome digitado, já seleciona
  // automaticamente pra evitar duplicidade sem o funcionário precisar clicar
  const exata = await Catalog.encontrarExato(categoria, st.catalogoNome);
  st.catalogoSelecionado = exata || null;

  renderResultadosCatalogo(view);
  atualizarBotaoSalvarLabel();
}

function renderResultadosCatalogo(view) {
  const st = ServicosView.formState;
  const cont = document.getElementById('catalogo-resultados');
  if (!cont) return;

  if (st.catalogoSelecionado) {
    const item = st.catalogoSelecionado;
    const ultima = Catalog.ultimaAtualizacao(item);
    cont.innerHTML = `
      <div class="card" style="background:var(--brand-100); border-color:var(--brand-500); padding:14px">
        <div class="row__title" style="color:var(--brand-800)">Já cadastrado: ${escapeHtml(item.nome)}</div>
        <div class="row__meta">Cadastrado em ${Const.formatarData(item.criadoEm)} por ${escapeHtml(item.criadoPor)}</div>
        <div class="row__meta">${
          ultima
            ? `${item.atualizacoes.length} atualização(ões) — última em ${Const.formatarDataHora(ultima.data)} por ${escapeHtml(ultima.por)}`
            : 'Nenhuma atualização registrada ainda'
        }</div>
        <div class="row__meta" style="margin-top:6px; color:var(--brand-700); font-weight:600">Este lançamento vai registrar uma nova atualização, não um cadastro duplicado.</div>
      </div>
    `;
    return;
  }

  if (st.catalogoMatches.length > 0) {
    cont.innerHTML = `
      <div class="card" style="padding:8px 0">
        <div class="row__meta" style="padding:6px 18px">Itens parecidos encontrados — toque em um se for o mesmo:</div>
        ${st.catalogoMatches
          .slice(0, 6)
          .map(
            (item) => `
          <div class="row" style="padding:10px 18px">
            <div class="row__main">
              <div class="row__title">${escapeHtml(item.nome)}</div>
              <div class="row__meta">Cadastrado em ${Const.formatarData(item.criadoEm)}${item.atualizacoes.length ? ` · ${item.atualizacoes.length} atualização(ões)` : ''}</div>
            </div>
            <button class="btn btn--ghost" data-usar="${item.id}" style="padding:6px 12px; font-size:13px">É este</button>
          </div>`
          )
          .join('')}
      </div>
    `;
    cont.querySelectorAll('[data-usar]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const item = st.catalogoMatches.find((m) => m.id === btn.dataset.usar);
        st.catalogoSelecionado = item;
        st.catalogoNome = item.nome;
        document.getElementById('f-cat-nome').value = item.nome;
        renderResultadosCatalogo(view);
        atualizarBotaoSalvarLabel();
      });
    });
    return;
  }

  cont.innerHTML = '';
}

function atualizarBotaoSalvarLabel() {
  const st = ServicosView.formState;
  const btn = document.getElementById('btn-salvar-servico');
  if (!btn) return;
  const editando = !!st.editId;
  const ehCadastro = !editando && !!Categorias.categoriaCadastroDe(categoriasCache, st.tipo);
  btn.textContent = ehCadastro && st.catalogoSelecionado ? 'Registrar atualização' : editando ? 'Salvar alterações' : 'Lançar serviço';
}

async function salvarServico(view) {
  const st = ServicosView.formState;
  const user = Auth.current;
  const editando = !!st.editId;
  st.erro = '';

  if (!st.tipo) {
    st.erro = 'Selecione o tipo de serviço.';
    return renderServicoForm(view);
  }

  const ehCadastro = !editando && !!Categorias.categoriaCadastroDe(categoriasCache, st.tipo);
  const ehCorte = Categorias.temPorcentagem(categoriasCache, st.tipo);

  let nomeFinal = '';
  let catalogoItemId = null;
  let acao = null;

  if (ehCadastro) {
    nomeFinal = (st.catalogoNome || '').trim();
    if (!nomeFinal) {
      st.erro = 'Digite o nome do item.';
      return renderServicoForm(view);
    }
    const categoria = Categorias.categoriaCadastroDe(categoriasCache, st.tipo);

    if (st.catalogoSelecionado) {
      await Catalog.registrarAtualizacao(st.catalogoSelecionado.id, user, st.observacoes);
      catalogoItemId = st.catalogoSelecionado.id;
      acao = 'Atualização de cadastro';
    } else {
      const existente = await Catalog.encontrarExato(categoria, nomeFinal);
      if (existente) {
        // segurança extra: alguém pode ter cadastrado entre a busca e o clique
        await Catalog.registrarAtualizacao(existente.id, user, st.observacoes);
        catalogoItemId = existente.id;
        acao = 'Atualização de cadastro';
      } else {
        const novo = await Catalog.cadastrarNovo(categoria, nomeFinal, user);
        catalogoItemId = novo.id;
        acao = 'Cadastro novo';
      }
    }
  } else {
    nomeFinal = (st.nomeLivre || '').trim();
    if (!nomeFinal) {
      st.erro = 'Digite o nome do serviço.';
      return renderServicoForm(view);
    }
  }

  let percentual = null;
  if (ehCorte) {
    const v = parseFloat(st.percentual);
    if (isNaN(v) || v < 0 || v > 100) {
      st.erro = 'Informe um % de aproveitamento válido (0 a 100).';
      return renderServicoForm(view);
    }
    percentual = v;
  }

  if (editando) {
    const registro = await DB.get('servicos', st.editId);
    if (!registro) {
      voltarParaLista();
      return;
    }
    registro.numeroPedido = st.numeroPedido || '';
    registro.nome = nomeFinal;
    registro.dataProgramada = st.dataProgramada ? Const.inputDateParaTimestamp(st.dataProgramada) : null;
    registro.observacoes = st.observacoes || '';
    if (ehCorte) registro.percentualAproveitamento = percentual;
    // qualquer edição volta a exigir aprovação, a não ser que quem edite seja o Admin
    registro.aprovado = user.tipo === 'admin' ? 'aprovado' : 'pendente';
    registro.dataAprovacao = user.tipo === 'admin' ? Date.now() : null;
    registro.atualizadoEm = Date.now();

    await DB.put('servicos', registro);
    if (registro.tipo === 'CNP') await sincronizarPlanoCorteComCNP(registro);
    voltarParaLista();
    return;
  }

  const registro = {
    id: dbUtil.uid(),
    tipo: st.tipo,
    numeroPedido: st.numeroPedido || '',
    nome: nomeFinal,
    dataProgramada: st.dataProgramada ? Const.inputDateParaTimestamp(st.dataProgramada) : null,
    dataFinal: null,
    observacoes: st.observacoes || '',
    percentualAproveitamento: percentual,
    catalogoItemId,
    acao,
    funcionarioId: user.id,
    funcionarioNome: user.nome,
    aprovado: user.tipo === 'admin' ? 'aprovado' : 'pendente',
    dataAprovacao: user.tipo === 'admin' ? Date.now() : null,
    criadoEm: Date.now(),
  };

  await DB.put('servicos', registro);
  if (registro.tipo === 'CNP') await criarPlanoCorteParaCNP(registro);
  voltarParaLista();
}

/* ---------------- integração CNP → Plano de Corte ----------------
   Assim que uma CNP é lançada, um registro correspondente nasce
   automaticamente em Plano de Corte (status "Aguardando"), pra quem
   for cortar já encontrar lá, sem precisar lançar de novo. Editar ou
   aprovar a CNP mantém os dois em sincronia; excluir a CNP remove o
   registro de corte junto. */

async function criarPlanoCorteParaCNP(registroCNP) {
  const pc = {
    id: dbUtil.uid(),
    cnpServicoId: registroCNP.id,
    numeroPedido: registroCNP.numeroPedido || '',
    nomeProduto: registroCNP.nome,
    dataChegada: registroCNP.criadoEm,
    dataProgramada: registroCNP.dataProgramada,
    funcionarioCNPId: registroCNP.funcionarioId,
    funcionarioCNPNome: registroCNP.funcionarioNome,
    status: 'Aguardando',
    dataInicioCorte: null,
    dataFinalCorte: null,
    funcionarioCorteId: null,
    funcionarioCorteNome: null,
    aprovado: registroCNP.aprovado,
    dataAprovacao: registroCNP.dataAprovacao,
    criadoEm: Date.now(),
  };
  await DB.put('plano_corte', pc);
  return pc;
}

async function sincronizarPlanoCorteComCNP(registroCNP) {
  const todos = await DB.getAll('plano_corte');
  const pc = todos.find((p) => p.cnpServicoId === registroCNP.id);
  if (!pc) return criarPlanoCorteParaCNP(registroCNP);
  pc.numeroPedido = registroCNP.numeroPedido || '';
  pc.nomeProduto = registroCNP.nome;
  pc.dataProgramada = registroCNP.dataProgramada;
  await DB.put('plano_corte', pc);
  return pc;
}

async function excluirPlanoCorteLigado(cnpServicoId) {
  const todos = await DB.getAll('plano_corte');
  const pc = todos.find((p) => p.cnpServicoId === cnpServicoId);
  if (pc) await DB.delete('plano_corte', pc.id);
}

/* ---------------- CONCLUIR SERVIÇO ----------------
   Marca a Data Final do serviço e registra Erros / Erros Novos —
   são esses dois números, junto com o prazo, que alimentam o
   cálculo de Nota e %Meta no Dashboard. */

async function renderConcluirServico(view) {
  const st = ServicosView.formState;
  const registro = await DB.get('servicos', st.id);
  const validando = !!(registro && registro.concluidoInformadoEm);

  view.innerHTML = `
    <div style="display:flex; align-items:center; gap:10px; margin-bottom:16px">
      <button class="topbar__icon-btn" id="btn-voltar-concluir" aria-label="Voltar" style="background:var(--paper-dim)">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="20" height="20"><path d="M15 18l-6-6 6-6"/></svg>
      </button>
      <h2 class="section-title" style="margin:0">${validando ? 'Validar Conclusão' : 'Concluir Serviço'}</h2>
    </div>

    <div class="card">
      <p class="section-sub" style="margin-top:0">${escapeHtml(st.nome)}</p>
      ${
        validando
          ? `<div class="row__meta" style="margin-bottom:14px">Marcado como concluído pelo funcionário em ${Const.formatarDataHora(registro.concluidoInformadoEm)}. Confirme os erros para validar.</div>`
          : ''
      }

      ${st.erro ? `<div class="auth__error show" style="text-align:left; margin-bottom:14px">${escapeHtml(st.erro)}</div>` : ''}

      <div class="field">
        <label for="f-erros">Erros</label>
        <input id="f-erros" type="number" min="0" step="1" value="${escapeHtml(st.erros)}" />
      </div>
      <div class="field">
        <label for="f-erros-novos">Erros Novos</label>
        <input id="f-erros-novos" type="number" min="0" step="1" value="${escapeHtml(st.errosNovos)}" />
      </div>

      <div class="row__meta" style="margin-bottom:14px">Só o Admin registra Erros e Erros Novos.</div>

      <div style="display:flex; gap:10px">
        <button class="btn btn--ghost" id="btn-cancelar-concluir" style="flex:1">Cancelar</button>
        <button class="btn btn--primary" id="btn-confirmar-concluir" style="flex:2">${validando ? 'Validar' : 'Confirmar conclusão'}</button>
      </div>
    </div>
  `;

  document.getElementById('btn-voltar-concluir').addEventListener('click', voltarParaLista);
  document.getElementById('btn-cancelar-concluir').addEventListener('click', voltarParaLista);
  document.getElementById('f-erros').addEventListener('input', (ev) => (st.erros = ev.target.value));
  document.getElementById('f-erros-novos').addEventListener('input', (ev) => (st.errosNovos = ev.target.value));

  document.getElementById('btn-confirmar-concluir').addEventListener('click', async () => {
    const erros = parseInt(st.erros, 10);
    const errosNovos = parseInt(st.errosNovos, 10);
    if (isNaN(erros) || erros < 0 || isNaN(errosNovos) || errosNovos < 0) {
      st.erro = 'Erros e Erros Novos devem ser números 0 ou maiores.';
      return renderConcluirServico(view);
    }
    const reg = await DB.get('servicos', st.id);
    if (!reg) return voltarParaLista();
    reg.dataFinal = reg.concluidoInformadoEm || Date.now();
    if (!reg.concluidoInformadoEm) reg.concluidoInformadoEm = reg.dataFinal;
    reg.erros = erros;
    reg.errosNovos = errosNovos;
    reg.validadoPeloAdmin = true;
    reg.validadoEm = Date.now();
    await DB.put('servicos', reg);
    voltarParaLista();
  });
}

