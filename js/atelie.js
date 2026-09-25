/* =========================================================
   atelie.js — aba Ateliê
   Mostra os serviços das categorias marcadas "Vai para o Ateliê"
   (Admin → Categorias). Não é cópia: é o MESMO serviço de Serviços.

   Situação no ateliê: Aprovado / Esperando / Não aprovado, mais uma
   observação do ateliê.
   - Tudo que já existia quando o Ateliê foi ao ar conta como Aprovado.
   - Serviço novo entra como Esperando.
   - O Admin muda direto (vale na hora).
   - Quem tem a aba liberada PEDE a mudança; ela só vale depois que o
     Admin autorizar (conta nas Pendências de aprovação).
   ========================================================= */

const AtelieView = {
  filtro: 'esperando', // 'esperando' | 'aprovado' | 'reprovado' | 'todos'
  filtroTexto: '',
  editandoId: null, // item com o editor de situação aberto
  editor: null, // { status, obs }
  modoSelecao: false,
  selecionados: new Set(),
  _visiveis: [],
};

const Atelie = {
  SITUACOES: {
    aprovado: { rotulo: 'Aprovado', badge: 'badge--ok' },
    esperando: { rotulo: 'Esperando', badge: 'badge--warn' },
    reprovado: { rotulo: 'Não aprovado', badge: 'badge--danger' },
  },

  _inicio: null,

  // Momento em que o Ateliê foi ao ar. Serviço sem situação criado ANTES
  // disso conta como Aprovado; criado depois, como Esperando.
  async inicio() {
    if (this._inicio) return this._inicio;
    let cfg = await DB.get('config', 'atelie_inicio');
    if (!cfg || !cfg.valor) {
      cfg = { chave: 'atelie_inicio', valor: Date.now() };
      await DB.put('config', cfg);
    }
    this._inicio = cfg.valor;
    return this._inicio;
  },

  async nomesCategorias() {
    const cats = await Categorias.listar();
    return new Set(cats.filter((c) => c.vaiParaAtelie).map((c) => c.nome));
  },

  situacao(s, inicio) {
    if (s.atelieStatus && this.SITUACOES[s.atelieStatus]) return s.atelieStatus;
    if (!s.criadoEm || s.criadoEm < inicio) return 'aprovado';
    return 'esperando';
  },

  rotulo(status) {
    return (this.SITUACOES[status] || this.SITUACOES.esperando).rotulo;
  },

  selo(status, prefixo = '') {
    const sit = this.SITUACOES[status] || this.SITUACOES.esperando;
    return `<span class="badge ${sit.badge}">${prefixo}${sit.rotulo}</span>`;
  },

  // Serviços que aparecem no Ateliê (categoria marcada)
  async itens() {
    const [servicos, nomes, inicio] = await Promise.all([DB.getAll('servicos'), this.nomesCategorias(), this.inicio()]);
    return servicos
      .filter((s) => nomes.has(s.tipo))
      .map((s) => ({ ...s, _situacao: this.situacao(s, inicio) }))
      .sort((a, b) => (b.criadoEm || 0) - (a.criadoEm || 0));
  },
};

async function renderAtelie(view) {
  const st = AtelieView;
  const ehAdmin = Auth.isAdmin();
  const [itens, nomesCats] = await Promise.all([Atelie.itens(), Atelie.nomesCategorias()]);

  const conta = { esperando: 0, aprovado: 0, reprovado: 0, todos: itens.length };
  itens.forEach((s) => conta[s._situacao]++);
  const pedidos = itens.filter((s) => s.atelieSolicitacao).length;

  const alvo = Analise.normaliza(st.filtroTexto);
  const filtrados = itens.filter((s) => {
    if (st.filtro !== 'todos' && s._situacao !== st.filtro) return false;
    if (!alvo) return true;
    return (
      Analise.normaliza(s.nome).includes(alvo) ||
      Analise.normaliza(s.tipo).includes(alvo) ||
      Analise.normaliza(s.funcionarioNome).includes(alvo) ||
      Analise.normaliza(s.observacoes).includes(alvo) ||
      Analise.normaliza(s.atelieObs).includes(alvo)
    );
  });
  st._visiveis = filtrados.map((s) => s.id);

  view.innerHTML = `
    <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:12px; margin-bottom:16px; flex-wrap:wrap">
      <div>
        <h2 class="section-title" style="margin-bottom:2px">Ateliê</h2>
        <p class="section-sub" style="margin:0">${
          ehAdmin
            ? 'Cadastros das categorias marcadas "Vai para o Ateliê" — a situação que você marca vale na hora'
            : 'Cadastros pra conferência do ateliê — a mudança de situação vale depois que o Admin autorizar'
        }</p>
      </div>
      ${itens.length ? botaoSelecaoPdf(AtelieView, 'btn-selecao-atelie') : ''}
    </div>

    ${
      nomesCats.size === 0
        ? `<div class="card"><div class="empty">
            <div class="empty__title">Nenhuma categoria vai para o Ateliê ainda</div>
            <div class="empty__sub">${
              ehAdmin ? 'Em Admin → Categorias, marque "Vai para o Ateliê" nas categorias de cadastro.' : 'O administrador ainda não escolheu as categorias.'
            }</div>
          </div></div>`
        : `
    ${
      ehAdmin && pedidos
        ? `<div class="card" style="background:var(--warn-bg, #FDF3DC); border-color:var(--warn-fg); padding:12px 16px; margin-bottom:14px">
            <b>${pedidos} pedido${pedidos === 1 ? '' : 's'} de mudança</b> esperando sua autorização — aparecem destacados na lista.
          </div>`
        : ''
    }
    <div class="chips" style="margin-bottom:12px">
      ${[
        ['esperando', 'Esperando'],
        ['aprovado', 'Aprovado'],
        ['reprovado', 'Não aprovado'],
        ['todos', 'Todos'],
      ]
        .map(([v, l]) => `<button class="chip ${st.filtro === v ? 'chip--on' : ''}" data-atelie-filtro="${v}">${l} <small>${conta[v]}</small></button>`)
        .join('')}
    </div>
    <div class="field" style="margin-bottom:14px">
      <input id="busca-atelie" placeholder="Buscar por nome, categoria, funcionário ou observação…" value="${escapeHtml(st.filtroTexto)}" />
    </div>
    <div id="barra-atelie"></div>
    <div id="lista-atelie"></div>
    <div id="atelie-previa"></div>
    <div class="row__meta" style="margin-top:10px">Categorias no Ateliê: ${Array.from(nomesCats).sort((a, b) => a.localeCompare(b, 'pt-BR')).map(escapeHtml).join(', ')}</div>`
    }
  `;

  if (nomesCats.size === 0) return;

  const btnSel = document.getElementById('btn-selecao-atelie');
  if (btnSel) {
    btnSel.addEventListener('click', () => {
      st.modoSelecao = !st.modoSelecao;
      if (!st.modoSelecao) st.selecionados.clear();
      renderAtelie(view);
    });
  }
  view.querySelectorAll('[data-atelie-filtro]').forEach((b) =>
    b.addEventListener('click', () => {
      st.filtro = b.dataset.atelieFiltro;
      st.editandoId = null;
      renderAtelie(view);
    })
  );
  const busca = document.getElementById('busca-atelie');
  busca.addEventListener('input', () => {
    st.filtroTexto = busca.value;
    clearTimeout(AtelieView._t);
    AtelieView._t = setTimeout(() => {
      renderAtelie(view).then(() => {
        const b = document.getElementById('busca-atelie');
        if (b) {
          b.focus();
          b.setSelectionRange(b.value.length, b.value.length);
        }
      });
    }, 250);
  });

  renderBarraSelecaoPdf({
    contId: 'barra-atelie',
    previaId: 'atelie-previa',
    estado: AtelieView,
    todosIds: itens.map((s) => s.id),
    singular: 'item',
    plural: 'itens',
    dica: 'Marque as caixinhas dos cadastros que vão no PDF.',
    montar: (ids) => montarPdfAtelie(itens.filter((s) => ids.includes(s.id))),
    aoMudar: () => renderAtelie(view),
  });

  desenharListaAtelie(view, filtrados);
}

function desenharListaAtelie(view, filtrados) {
  const st = AtelieView;
  const ehAdmin = Auth.isAdmin();
  const listaEl = document.getElementById('lista-atelie');
  if (!listaEl) return;

  if (filtrados.length === 0) {
    listaEl.innerHTML = `<div class="card"><div class="empty">
      <div class="empty__title">Nada aqui</div>
      <div class="empty__sub">${st.filtroTexto ? 'Nenhum cadastro com essa busca.' : 'Nenhum cadastro nessa situação.'}</div>
    </div></div>`;
    return;
  }

  // lista grande: mostra os 150 primeiros (a busca acha o resto)
  const LIMITE = 150;
  const mostrados = filtrados.slice(0, LIMITE);

  listaEl.innerHTML = `
    <div class="card" style="padding:0">
      ${mostrados.map((s) => itemAtelieHtml(s, ehAdmin)).join('')}
    </div>
    ${
      filtrados.length > LIMITE
        ? `<div class="row__meta" style="text-align:center; margin-top:10px">Mostrando ${LIMITE} de ${filtrados.length} — use a busca pra achar os outros.</div>`
        : `<div class="row__meta" style="text-align:center; margin-top:10px">${filtrados.length} item(ns)</div>`
    }
  `;

  ligarCaixinhasPdf(listaEl, AtelieView, () => renderAtelie(view));

  listaEl.querySelectorAll('[data-atelie-alterar]').forEach((b) =>
    b.addEventListener('click', () => {
      const s = filtrados.find((x) => x.id === b.dataset.atelieAlterar);
      if (!s) return;
      st.editandoId = s.id;
      st.editor = { status: s._situacao, obs: s.atelieObs || '' };
      desenharListaAtelie(view, filtrados);
    })
  );
  const editor = listaEl.querySelector('.atelie-editor');
  if (editor) {
    editor.querySelectorAll('[data-atelie-st]').forEach((b) =>
      b.addEventListener('click', () => {
        st.editor.status = b.dataset.atelieSt;
        editor.querySelectorAll('[data-atelie-st]').forEach((x) => x.classList.toggle('chip--on', x === b));
      })
    );
    const obs = editor.querySelector('#atelie-obs');
    obs.addEventListener('input', () => (st.editor.obs = obs.value));
    obs.focus();
    editor.querySelector('#atelie-cancelar').addEventListener('click', () => {
      st.editandoId = null;
      desenharListaAtelie(view, filtrados);
    });
    editor.querySelector('#atelie-salvar').addEventListener('click', async () => {
      const btn = editor.querySelector('#atelie-salvar');
      btn.disabled = true;
      btn.textContent = 'Salvando…';
      await salvarSituacaoAtelie(st.editandoId, st.editor.status, st.editor.obs);
      st.editandoId = null;
      renderAtelie(view);
    });
  }

  listaEl.querySelectorAll('[data-atelie-autorizar]').forEach((b) =>
    b.addEventListener('click', async () => {
      b.disabled = true;
      await autorizarPedidoAtelie(b.dataset.atelieAutorizar, true);
      renderAtelie(view);
    })
  );
  listaEl.querySelectorAll('[data-atelie-recusar]').forEach((b) =>
    b.addEventListener('click', async () => {
      if (!confirm('Recusar esse pedido? A situação continua como está.')) return;
      await autorizarPedidoAtelie(b.dataset.atelieRecusar, false);
      renderAtelie(view);
    })
  );
  listaEl.querySelectorAll('[data-atelie-cancelar-pedido]').forEach((b) =>
    b.addEventListener('click', async () => {
      const s = await DB.get('servicos', b.dataset.atelieCancelarPedido);
      if (!s) return;
      s.atelieSolicitacao = null;
      await DB.put('servicos', s);
      renderAtelie(view);
    })
  );

  // Admin: editar e excluir usam as mesmas regras da aba Serviços
  listaEl.querySelectorAll('[data-atelie-editar]').forEach((b) =>
    b.addEventListener('click', async () => {
      const registro = await DB.get('servicos', b.dataset.atelieEditar);
      if (!registro) return;
      ServicosView.subView = 'form';
      ServicosView.formState = criarEstadoFormularioEdicao(registro);
      activeTab = 'servicos';
      renderTabbar();
      renderView('servicos');
    })
  );
  listaEl.querySelectorAll('[data-atelie-excluir]').forEach((b) =>
    b.addEventListener('click', async () => {
      const registro = await DB.get('servicos', b.dataset.atelieExcluir);
      if (!registro) return;
      const avisoCorte = registro.tipo === 'CNP' ? ' O registro correspondente em Plano de Corte também será excluído.' : '';
      if (!confirm(`Excluir "${registro.nome}"?${avisoCorte} Ele sai de Serviços também. Essa ação não pode ser desfeita.`)) return;
      await DB.delete('servicos', registro.id);
      if (registro.tipo === 'CNP') await excluirPlanoCorteLigado(registro.id);
      renderAtelie(view);
    })
  );
}

function itemAtelieHtml(s, ehAdmin) {
  const st = AtelieView;
  const ped = s.atelieSolicitacao;
  const editando = st.editandoId === s.id;
  const souEuQuePedi = ped && ped.porId === Auth.current.id;

  return `
    <div class="row atelie-item ${ped ? 'atelie-item--pedido' : ''}" style="padding:14px 18px; flex-wrap:wrap; align-items:flex-start; gap:10px">
      ${caixinhaPdf(AtelieView, s.id)}
      <div class="row__main" style="flex:1 1 260px; min-width:0">
        <div class="row__title">${escapeHtml(s.nome || '(sem nome)')}</div>
        <div class="row__meta">${escapeHtml(s.tipo)} · ${escapeHtml(s.funcionarioNome || 'Disponível')} · ${Const.formatarData(s.criadoEm)}${
          s.dataFinal ? ` · concluído ${Const.formatarData(s.dataFinal)}` : ''
        }</div>
        ${s.observacoes ? `<div class="row__meta" style="font-style:italic">📝 ${escapeHtml(s.observacoes)}</div>` : ''}
        <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-top:8px">
          ${Atelie.selo(s._situacao, 'Ateliê: ')}
          ${
            s.atelieMarcadoPorNome
              ? `<span class="row__meta">por ${escapeHtml(s.atelieMarcadoPorNome)} em ${Const.formatarData(s.atelieMarcadoEm)}</span>`
              : !s.atelieStatus && s._situacao === 'aprovado'
              ? '<span class="row__meta">cadastro anterior ao Ateliê</span>'
              : ''
          }
        </div>
        ${s.atelieObs ? `<div class="row__meta" style="margin-top:4px">Obs. do ateliê: <b>${escapeHtml(s.atelieObs)}</b></div>` : ''}
        ${
          ped
            ? `<div class="atelie-pedido">
                <b>${escapeHtml(ped.porNome || 'Alguém')}</b> pediu: ${Atelie.selo(ped.status)}${ped.obs ? ` — "${escapeHtml(ped.obs)}"` : ''}
                <span class="row__meta"> · ${Const.formatarData(ped.em)} · aguardando autorização do Admin</span>
                <div style="display:flex; gap:6px; margin-top:8px; flex-wrap:wrap">
                  ${
                    ehAdmin
                      ? `<button class="btn btn--primary" data-atelie-autorizar="${s.id}" style="padding:6px 12px; font-size:13px">Autorizar</button>
                         <button class="btn btn--danger" data-atelie-recusar="${s.id}" style="padding:6px 12px; font-size:13px">Recusar</button>`
                      : souEuQuePedi
                      ? `<button class="btn btn--ghost" data-atelie-cancelar-pedido="${s.id}" style="padding:6px 12px; font-size:13px">Cancelar meu pedido</button>`
                      : ''
                  }
                </div>
              </div>`
            : ''
        }
        ${
          editando
            ? `<div class="atelie-editor">
                <div class="row__meta" style="margin-bottom:6px">${ehAdmin ? 'Nova situação (vale na hora):' : 'Pedir mudança para (vale depois que o Admin autorizar):'}</div>
                <div class="chips" style="margin-bottom:10px">
                  ${Object.entries(Atelie.SITUACOES)
                    .map(([v, o]) => `<button class="chip ${st.editor.status === v ? 'chip--on' : ''}" data-atelie-st="${v}">${o.rotulo}</button>`)
                    .join('')}
                </div>
                <div class="field" style="margin-bottom:10px">
                  <input id="atelie-obs" value="${escapeHtml(st.editor.obs)}" placeholder="Observação do ateliê (opcional) — ex: cor diferente da amostra" />
                </div>
                <div style="display:flex; gap:8px">
                  <button class="btn btn--ghost" id="atelie-cancelar" style="padding:8px 14px; font-size:13px">Cancelar</button>
                  <button class="btn btn--primary" id="atelie-salvar" style="padding:8px 14px; font-size:13px">${ehAdmin ? 'Salvar' : 'Enviar pedido'}</button>
                </div>
              </div>`
            : ''
        }
      </div>
      ${
        editando
          ? ''
          : `<div style="display:flex; gap:6px; flex:0 0 auto; flex-wrap:wrap">
              <button class="btn btn--ghost" data-atelie-alterar="${s.id}" style="padding:6px 12px; font-size:13px">${ehAdmin ? 'Mudar situação' : ped && souEuQuePedi ? 'Refazer pedido' : 'Pedir mudança'}</button>
              ${
                ehAdmin
                  ? `<button class="btn btn--ghost" data-atelie-editar="${s.id}" style="padding:6px 12px; font-size:13px">Editar</button>
                     <button class="btn btn--danger" data-atelie-excluir="${s.id}" style="padding:6px 12px; font-size:13px">Excluir</button>`
                  : ''
              }
            </div>`
      }
    </div>`;
}

async function salvarSituacaoAtelie(id, status, obs) {
  const s = await DB.get('servicos', id);
  if (!s) return;
  const agora = Date.now();
  if (Auth.isAdmin()) {
    s.atelieStatus = status;
    s.atelieObs = (obs || '').trim();
    s.atelieMarcadoPorId = Auth.current.id;
    s.atelieMarcadoPorNome = Auth.current.nome;
    s.atelieMarcadoEm = agora;
    s.atelieSolicitacao = null; // o que o Admin decide substitui pedido em aberto
  } else {
    s.atelieSolicitacao = {
      status,
      obs: (obs || '').trim(),
      porId: Auth.current.id,
      porNome: Auth.current.nome,
      em: agora,
    };
  }
  await DB.put('servicos', s);
  if (typeof atualizarBadgesTabbar === 'function') atualizarBadgesTabbar();
}

async function autorizarPedidoAtelie(id, autorizar) {
  const s = await DB.get('servicos', id);
  if (!s || !s.atelieSolicitacao) return;
  const ped = s.atelieSolicitacao;
  if (autorizar) {
    s.atelieStatus = ped.status;
    s.atelieObs = ped.obs || '';
    s.atelieMarcadoPorId = ped.porId;
    s.atelieMarcadoPorNome = ped.porNome;
    s.atelieMarcadoEm = ped.em;
    s.atelieAutorizadoPor = Auth.current.nome;
    s.atelieAutorizadoEm = Date.now();
  }
  s.atelieSolicitacao = null;
  await DB.put('servicos', s);
  if (typeof atualizarBadgesTabbar === 'function') atualizarBadgesTabbar();
}

/* ---------------- PDF DO ATELIÊ ---------------- */

async function montarPdfAtelie(itens) {
  const ordenados = [...itens].sort(
    (a, b) => (a.tipo || '').localeCompare(b.tipo || '', 'pt-BR') || (a.criadoEm || 0) - (b.criadoEm || 0)
  );
  const conta = { aprovado: 0, esperando: 0, reprovado: 0 };
  ordenados.forEach((s) => conta[s._situacao]++);
  const linhas = [];
  let atual = null;
  ordenados.forEach((s) => {
    if (s.tipo !== atual) {
      atual = s.tipo;
      const n = ordenados.filter((x) => x.tipo === atual).length;
      linhas.push(`<tr class="rp-grupo"><td colspan="5">${escapeHtml(atual)} — ${n} item(ns)</td></tr>`);
    }
    linhas.push(`<tr>
      <td class="nowrap">${formatarDataCurta(s.criadoEm)}</td>
      <td>${escapeHtml(s.nome || '')}${s.observacoes ? `<div class="rp-fraco">${escapeHtml(s.observacoes)}</div>` : ''}</td>
      <td class="nowrap">${escapeHtml(nomeCurtoRelatorio(s.funcionarioNome))}</td>
      <td class="nowrap ${s._situacao === 'reprovado' ? 'rp-ruim' : ''}">${Atelie.rotulo(s._situacao)}</td>
      <td>${escapeHtml(s.atelieObs || '')}</td>
    </tr>`);
  });
  const blocos = [
    {
      tipo: 'titulo',
      html: `<h2 class="rp-secao">Conferência do Ateliê</h2><p class="rp-nota">${ordenados.length} item(ns) · ${conta.aprovado} aprovado(s) · ${conta.esperando} esperando · ${conta.reprovado} não aprovado(s)</p>`,
    },
    {
      tipo: 'tabela',
      cabecalho: '<tr><th>Data</th><th>Cadastro</th><th>Funcionário</th><th>Situação</th><th>Obs. do ateliê</th></tr>',
      linhas,
      classe: 'rp-tabela--lista',
    },
  ];
  return montarPdfPadrao(blocos, {
    titulo: 'Ateliê',
    periodo: `${ordenados.length} item${ordenados.length === 1 ? '' : 'ns'}`,
    detalhes: 'Situação dos cadastros na conferência do ateliê',
  });
}

window.Atelie = Atelie;
