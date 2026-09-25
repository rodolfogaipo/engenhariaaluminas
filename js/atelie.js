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
  porMovel: false, // "Ver por móvel"
  abertos: new Set(), // móveis com as peças abertas
  editandoMovel: null, // móvel com o "mudar todas" aberto
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

  /* Móvel de uma peça, pelo nome.
     1) Tem medida "número X número" (0,72 X 7,5 / 0,40X0,25X0,55)? A
        PRIMEIRA medida é a da peça; o móvel é o que vem depois dela
        (se o móvel também tiver medida, ela fica no nome dele).
     2) Não sobrou nome depois da medida, ou não tem medida? Procura a
        palavra do tipo de móvel (SOFÁ, POLTRONA, MESA…) e começa dali.
     Número sozinho (o "2,10" de SOFÁ MARROCOS 2,10) faz parte do nome,
     então tamanhos diferentes ficam separados. */
  TIPOS_MOVEL: [
    'SOFA', 'POLTRONA', 'CADEIRA', 'BANQUETA', 'BANCO', 'ESPREGUICADEIRA', 'MESA', 'PUFF', 'PUFE', 'CHAISE',
    'OMBRELONE', 'CAMA', 'DAYBED', 'NAMORADEIRA', 'BALANCO', 'APARADOR', 'RECAMIER', 'BISTRO', 'LOUNGE',
    'CABANA', 'PERGOLADO', 'GAZEBO', 'CARRINHO', 'BAU', 'CHAISE', 'RACK', 'BUFFET', 'CAMA', 'MODULO',
  ],

  // palavras que são PARTE da peça, não o móvel (e numeração I, II…)
  PALAVRAS_PECA: new Set(
    ('ASSENTO ASSENTOS ENCOSTO ENCOSTOS FAIXA FAIXAS ZIPER ZIPERES ALMOFADA ALMOFADAS BRACO BRACOS CAPA CAPAS ' +
      'FORRO TAMPO BASE ESTRUTURA VIVO VIES BOTAO BOTOES CINTA TIRA TIRAS APOIO CABECA LOMBAR PE PES PARTE PECA ' +
      'FRENTE FUNDO COSTAS LADO LATERAL LATERAIS OUTLINE MOLDE SUPERIOR INFERIOR DIREITO ESQUERDO DIREITA ESQUERDA ' +
      'MENOR MAIOR DE DA DO DAS DOS E COM P PARA I II III IV V VI VII VIII IX X XI XII').split(' ')
  ),

  SEM_MOVEL: '__SEM_MOVEL__',

  aPartirDoTipoDeMovel(texto) {
    const norm = texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
    let melhor = -1;
    this.TIPOS_MOVEL.forEach((t) => {
      const m = new RegExp(`(^|[^A-Z])${t}([^A-Z]|$)`).exec(norm);
      if (m) {
        const pos = m.index + m[1].length;
        if (melhor === -1 || pos < melhor) melhor = pos;
      }
    });
    // a normalização não muda o tamanho do texto em letras comuns com acento
    // (Á → A + acento solto, que depois é removido); refaz a busca no original
    if (melhor <= 0) return texto;
    const semAcento = texto.normalize('NFD');
    let conta = 0;
    let idx = 0;
    for (; idx < semAcento.length && conta < melhor; idx++) {
      if (!/[\u0300-\u036f]/.test(semAcento[idx])) conta++;
    }
    return semAcento.slice(idx).normalize('NFC').trim() || texto;
  },

  movelDe(nome) {
    const original = String(nome || '').trim();
    const re = /\d+(?:[.,]\d+)?\s*[xX×]\s*\d+(?:[.,]\d+)?(?:\s*[xX×]\s*\d+(?:[.,]\d+)?)*(?:\s*[a-zA-Z]{1,2}(?=[\s\-–—:,.;)]|$))?/;
    const m = re.exec(original);
    if (m) {
      const depois = original.slice(m.index + m[0].length).replace(/^[\s\-–—:,.]+/, '').trim();
      if (/[A-Za-zÀ-ÿ]{3,}/.test(depois)) return depois;
      const antes = original.slice(0, m.index).replace(/[\s\-–—:,.]+$/, '').trim();
      return this.aPartirDoTipoDeMovel(antes || original);
    }
    return this.aPartirDoTipoDeMovel(original);
  },

  // chave pra juntar: sem acento, maiúsculas, espaço único, "2.10" = "2,10"
  chaveMovel(movel) {
    return String(movel || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase()
      .replace(/(\d)\.(\d)/g, '$1,$2')
      .replace(/\s+/g, ' ')
      .trim();
  },

  // palavras de um texto, sem acento e sem a medida "N X N"
  palavras(texto) {
    return this.chaveMovel(String(texto || '').replace(/\d+(?:[.,]\d+)?\s*[xX×]\s*\d+(?:[.,]\d+)?(?:\s*[xX×]\s*\d+(?:[.,]\d+)?)*/g, ' '))
      .split(/[^A-Z0-9,%Ø]+/)
      .map((t) => t.replace(/^,+|,+$/g, ''))
      .filter(Boolean);
  },

  temTipoDeMovel(texto) {
    const ps = new Set(this.palavras(texto));
    return this.TIPOS_MOVEL.some((t) => ps.has(t));
  },

  // sobrou só nome de parte da peça (ASSENTO, ENCOSTO II…)?
  soParteDePeca(texto) {
    return this.palavras(texto).every((t) => this.PALAVRAS_PECA.has(t));
  },

  /* Decide o móvel de cada peça olhando TODAS as peças do Ateliê:
     1) campo "Móvel" preenchido no lançamento → vale ele;
     2) nome com tipo de móvel (POLTRONA CHLÔE) → móvel "certo";
     3) só nome da peça (ASSENTO, ENCOSTO II) → Sem móvel identificado;
     4) nome sem tipo (ASSENTO II CHLÔE) → procura um móvel certo que
        tenha as mesmas palavras (CHLÔE). Achou UM → junta nele; achou
        mais de um → Sem móvel identificado (não chuta); nenhum → fica
        com o nome que tem. */
  resolverMoveis(itens) {
    const brutos = itens.map((s) => {
      const manual = String(s.movel || '').trim();
      if (manual) return { s, movel: manual, forte: true };
      const bruto = this.movelDe(s.nome);
      if (!bruto || this.soParteDePeca(bruto)) return { s, movel: null, forte: false, semMovel: true };
      return { s, movel: bruto, forte: this.temTipoDeMovel(bruto) };
    });
    const fortes = new Map(); // chave → { nome, palavras }
    brutos.forEach((b) => {
      if (!b.forte || !b.movel) return;
      const k = this.chaveMovel(b.movel);
      if (!fortes.has(k)) fortes.set(k, { nome: b.movel, palavras: new Set(this.palavras(b.movel)) });
    });
    brutos.forEach((b) => {
      if (b.semMovel) {
        b.s._movel = null;
        return;
      }
      if (b.forte) {
        b.s._movel = b.movel;
        return;
      }
      const resto = this.palavras(b.s.nome).filter((t) => !this.PALAVRAS_PECA.has(t));
      if (!resto.length) {
        b.s._movel = null;
        return;
      }
      const candidatos = Array.from(fortes.values()).filter((f) => resto.every((t) => f.palavras.has(t)));
      if (candidatos.length === 1) b.s._movel = candidatos[0].nome;
      else if (candidatos.length > 1) b.s._movel = null;
      else b.s._movel = b.movel;
    });
    return itens;
  },

  // nomes de móveis conhecidos (pra sugerir no campo "Móvel" do lançamento)
  async nomesMoveis() {
    const itens = await this.itens();
    const mapa = new Map();
    itens.forEach((s) => {
      if (!s._movel || !this.temTipoDeMovel(s._movel)) return;
      const k = this.chaveMovel(s._movel);
      if (!mapa.has(k)) mapa.set(k, s._movel);
    });
    return Array.from(mapa.values()).sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true }));
  },

  agruparPorMovel(itens) {
    const mapa = new Map();
    itens.forEach((s) => {
      const nomeMovel = s._movel === undefined ? this.movelDe(s.nome) : s._movel;
      const chave = nomeMovel ? this.chaveMovel(nomeMovel) : this.SEM_MOVEL;
      if (!mapa.has(chave)) mapa.set(chave, { chave, nomes: {}, pecas: [] });
      const g = mapa.get(chave);
      g.pecas.push(s);
      const rotulo = nomeMovel || 'Sem móvel identificado';
      g.nomes[rotulo] = (g.nomes[rotulo] || 0) + 1;
    });
    return Array.from(mapa.values())
      .map((g) => {
        // mostra o jeito de escrever mais usado
        const nome = Object.entries(g.nomes).sort((a, b) => b[1] - a[1])[0][0];
        const conta = { aprovado: 0, esperando: 0, reprovado: 0 };
        g.pecas.forEach((p) => conta[p._situacao]++);
        const ultimo = Math.max(...g.pecas.map((p) => p.criadoEm || 0));
        return { chave: g.chave, nome, pecas: g.pecas, conta, pedidos: g.pecas.filter((p) => p.atelieSolicitacao).length, ultimo };
      })
      .sort((a, b) => (a.chave === this.SEM_MOVEL ? -1 : b.chave === this.SEM_MOVEL ? 1 : b.ultimo - a.ultimo));
  },

  // Serviços que aparecem no Ateliê (categoria marcada)
  async itens() {
    const [servicos, nomes, inicio] = await Promise.all([DB.getAll('servicos'), this.nomesCategorias(), this.inicio()]);
    const lista = servicos
      .filter((s) => nomes.has(s.tipo))
      .map((s) => ({ ...s, _situacao: this.situacao(s, inicio) }))
      .sort((a, b) => (b.criadoEm || 0) - (a.criadoEm || 0));
    // o móvel de cada peça é decidido olhando todas juntas
    return this.resolverMoveis(lista);
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
    <div class="chips" style="margin-bottom:12px">
      <button class="chip ${!st.porMovel ? 'chip--on' : ''}" data-atelie-modo="pecas">Ver por peça</button>
      <button class="chip ${st.porMovel ? 'chip--on' : ''}" data-atelie-modo="movel">Ver por móvel</button>
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
  view.querySelectorAll('[data-atelie-modo]').forEach((b) =>
    b.addEventListener('click', () => {
      st.porMovel = b.dataset.atelieModo === 'movel';
      st.editandoId = null;
      st.editandoMovel = null;
      renderAtelie(view);
    })
  );
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
    montar: (ids) =>
      st.porMovel ? montarPdfAtelieMoveis(itens.filter((s) => ids.includes(s.id))) : montarPdfAtelie(itens.filter((s) => ids.includes(s.id))),
    aoMudar: () => renderAtelie(view),
  });

  if (st.porMovel) desenharMoveisAtelie(view, filtrados);
  else desenharListaAtelie(view, filtrados);
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

  ligarAcoesAtelie(listaEl, view, filtrados, () => desenharListaAtelie(view, filtrados));
}

// botões de cada peça (mudar situação, autorizar, editar, excluir…)
function ligarAcoesAtelie(listaEl, view, filtrados, redesenhar) {
  const st = AtelieView;
  ligarCaixinhasPdf(listaEl, AtelieView, () => renderAtelie(view));

  listaEl.querySelectorAll('[data-atelie-alterar]').forEach((b) =>
    b.addEventListener('click', () => {
      const s = filtrados.find((x) => x.id === b.dataset.atelieAlterar);
      if (!s) return;
      st.editandoId = s.id;
      st.editor = { status: s._situacao, obs: s.atelieObs || '' };
      st.editandoMovel = null;
      redesenhar();
    })
  );
  const editor = listaEl.querySelector('.atelie-editor--peca');
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
      redesenhar();
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

/* ---------------- VER POR MÓVEL ---------------- */

function desenharMoveisAtelie(view, filtrados) {
  const st = AtelieView;
  const ehAdmin = Auth.isAdmin();
  const listaEl = document.getElementById('lista-atelie');
  if (!listaEl) return;
  const moveis = Atelie.agruparPorMovel(filtrados);

  if (moveis.length === 0) {
    listaEl.innerHTML = `<div class="card"><div class="empty">
      <div class="empty__title">Nada aqui</div>
      <div class="empty__sub">${st.filtroTexto ? 'Nenhum móvel com essa busca.' : 'Nenhuma peça nessa situação.'}</div>
    </div></div>`;
    return;
  }

  const LIMITE = 80;
  const mostrados = moveis.slice(0, LIMITE);
  const resumo = (c) =>
    [
      c.aprovado ? `${c.aprovado} aprovada${c.aprovado === 1 ? '' : 's'}` : '',
      c.esperando ? `${c.esperando} esperando` : '',
      c.reprovado ? `${c.reprovado} não aprovada${c.reprovado === 1 ? '' : 's'}` : '',
    ]
      .filter(Boolean)
      .join(' · ');

  listaEl.innerHTML = `
    ${mostrados
      .map((g) => {
        const aberto = st.abertos.has(g.chave);
        const todosMarcados = st.modoSelecao && g.pecas.every((p) => st.selecionados.has(p.id));
        const editandoEste = st.editandoMovel === g.chave;
        return `
        <div class="card atelie-movel ${g.pedidos ? 'atelie-item--pedido' : ''} ${g.chave === Atelie.SEM_MOVEL ? 'atelie-movel--sem' : ''}">
          <div style="display:flex; align-items:flex-start; gap:10px; flex-wrap:wrap">
            ${st.modoSelecao ? `<input type="checkbox" class="sel-pdf" data-atelie-sel-movel="${escapeHtml(g.chave)}" ${todosMarcados ? 'checked' : ''} aria-label="Incluir este móvel no PDF" />` : ''}
            <div style="flex:1 1 240px; min-width:0">
              <div class="row__title" style="font-size:16px">${escapeHtml(g.nome || '(sem nome)')}</div>
              <div class="row__meta">${g.pecas.length} peça${g.pecas.length === 1 ? '' : 's'} · ${resumo(g.conta)}${
                g.pedidos ? ` · <b>${g.pedidos} pedido${g.pedidos === 1 ? '' : 's'} de mudança</b>` : ''
              }</div>
              ${
                g.chave === Atelie.SEM_MOVEL
                  ? `<div class="row__meta" style="margin-top:4px">Peças só com o nome da parte (ASSENTO, ENCOSTO…) ou que servem pra mais de um móvel. ${
                      ehAdmin ? 'Use o Editar da peça e preencha o campo <b>Móvel</b> (ou corrija o nome).' : 'Peça ao Admin pra preencher o campo Móvel.'
                    }</div>`
                  : ''
              }
              <div style="display:flex; gap:4px; margin-top:8px; flex-wrap:wrap">
                ${g.conta.aprovado ? Atelie.selo('aprovado', `${g.conta.aprovado} · `) : ''}
                ${g.conta.esperando ? Atelie.selo('esperando', `${g.conta.esperando} · `) : ''}
                ${g.conta.reprovado ? Atelie.selo('reprovado', `${g.conta.reprovado} · `) : ''}
              </div>
            </div>
            <div style="display:flex; gap:6px; flex:0 0 auto; flex-wrap:wrap">
              <button class="btn btn--ghost" data-atelie-abrir="${escapeHtml(g.chave)}" style="padding:6px 12px; font-size:13px">${aberto ? 'Esconder peças' : 'Ver peças'}</button>
              ${editandoEste ? '' : `<button class="btn btn--primary" data-atelie-todas="${escapeHtml(g.chave)}" style="padding:6px 12px; font-size:13px">${ehAdmin ? 'Mudar todas' : 'Pedir mudança de todas'}</button>`}
            </div>
          </div>
          ${
            editandoEste
              ? `<div class="atelie-editor" id="atelie-editor-movel">
                  <div class="row__meta" style="margin-bottom:6px">${
                    ehAdmin
                      ? `Nova situação para as <b>${g.pecas.length}</b> peça(s) mostradas deste móvel (vale na hora):`
                      : `Pedir mudança para as <b>${g.pecas.length}</b> peça(s) mostradas deste móvel (vale depois que o Admin autorizar):`
                  }</div>
                  <div class="chips" style="margin-bottom:10px">
                    ${Object.entries(Atelie.SITUACOES)
                      .map(([v, o]) => `<button class="chip ${st.editor && st.editor.status === v ? 'chip--on' : ''}" data-atelie-st-movel="${v}">${o.rotulo}</button>`)
                      .join('')}
                  </div>
                  <div class="field" style="margin-bottom:10px">
                    <input id="atelie-obs-movel" value="${escapeHtml((st.editor && st.editor.obs) || '')}" placeholder="Observação do ateliê pra todas (opcional) — deixe vazio pra manter a de cada peça" />
                  </div>
                  <div style="display:flex; gap:8px">
                    <button class="btn btn--ghost" id="atelie-cancelar-movel" style="padding:8px 14px; font-size:13px">Cancelar</button>
                    <button class="btn btn--primary" id="atelie-salvar-movel" style="padding:8px 14px; font-size:13px">${ehAdmin ? 'Aplicar em todas' : 'Enviar pedido de todas'}</button>
                  </div>
                </div>`
              : ''
          }
          ${aberto ? `<div class="atelie-pecas">${g.pecas.map((p) => itemAtelieHtml(p, ehAdmin)).join('')}</div>` : ''}
        </div>`;
      })
      .join('')}
    <div class="row__meta" style="text-align:center; margin-top:10px">${
      moveis.length > LIMITE
        ? `Mostrando ${LIMITE} de ${moveis.length} móveis — use a busca pra achar os outros.`
        : `${moveis.length} móve${moveis.length === 1 ? 'l' : 'is'} · ${filtrados.length} peça(s)`
    }</div>
  `;

  const redesenhar = () => desenharMoveisAtelie(view, filtrados);
  const acharMovel = (chave) => mostrados.find((g) => g.chave === chave);

  listaEl.querySelectorAll('[data-atelie-abrir]').forEach((b) =>
    b.addEventListener('click', () => {
      const k = b.dataset.atelieAbrir;
      if (st.abertos.has(k)) st.abertos.delete(k);
      else st.abertos.add(k);
      redesenhar();
    })
  );
  listaEl.querySelectorAll('[data-atelie-sel-movel]').forEach((chk) => {
    chk.addEventListener('change', () => {
      const g = acharMovel(chk.dataset.atelieSelMovel);
      if (!g) return;
      g.pecas.forEach((p) => (chk.checked ? st.selecionados.add(p.id) : st.selecionados.delete(p.id)));
      renderAtelie(view);
    });
  });
  listaEl.querySelectorAll('[data-atelie-todas]').forEach((b) =>
    b.addEventListener('click', () => {
      const g = acharMovel(b.dataset.atelieTodas);
      if (!g) return;
      st.editandoMovel = g.chave;
      st.editandoId = null;
      // sugere a situação que a maioria das peças já tem
      const maioria = Object.entries(g.conta).sort((a, c) => c[1] - a[1])[0][0];
      st.editor = { status: maioria, obs: '' };
      redesenhar();
    })
  );
  const ed = document.getElementById('atelie-editor-movel');
  if (ed) {
    ed.querySelectorAll('[data-atelie-st-movel]').forEach((b) =>
      b.addEventListener('click', () => {
        st.editor.status = b.dataset.atelieStMovel;
        ed.querySelectorAll('[data-atelie-st-movel]').forEach((x) => x.classList.toggle('chip--on', x === b));
      })
    );
    const obs = document.getElementById('atelie-obs-movel');
    obs.addEventListener('input', () => (st.editor.obs = obs.value));
    document.getElementById('atelie-cancelar-movel').addEventListener('click', () => {
      st.editandoMovel = null;
      redesenhar();
    });
    document.getElementById('atelie-salvar-movel').addEventListener('click', async () => {
      const g = acharMovel(st.editandoMovel);
      if (!g) return;
      const btn = document.getElementById('atelie-salvar-movel');
      btn.disabled = true;
      btn.textContent = 'Salvando…';
      await salvarSituacaoAtelieVarias(
        g.pecas.map((p) => p.id),
        st.editor.status,
        st.editor.obs
      );
      st.editandoMovel = null;
      renderAtelie(view);
    });
  }

  ligarAcoesAtelie(listaEl, view, filtrados, redesenhar);
}

// "Mudar todas": mesma regra de uma peça (Admin vale na hora; os outros viram pedido)
async function salvarSituacaoAtelieVarias(ids, status, obs) {
  const obsLimpa = (obs || '').trim();
  const agora = Date.now();
  const registros = (await Promise.all(ids.map((id) => DB.get('servicos', id)))).filter(Boolean);
  registros.forEach((s) => {
    const obsFinal = obsLimpa || s.atelieObs || '';
    if (Auth.isAdmin()) {
      s.atelieStatus = status;
      s.atelieObs = obsFinal;
      s.atelieMarcadoPorId = Auth.current.id;
      s.atelieMarcadoPorNome = Auth.current.nome;
      s.atelieMarcadoEm = agora;
      s.atelieSolicitacao = null;
    } else {
      s.atelieSolicitacao = { status, obs: obsFinal, porId: Auth.current.id, porNome: Auth.current.nome, em: agora };
    }
  });
  if (registros.length) await DB.putMany('servicos', registros);
  if (typeof atualizarBadgesTabbar === 'function') atualizarBadgesTabbar();
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
        ${
          !AtelieView.porMovel
            ? `<div class="row__meta">Móvel: ${s._movel ? `<b>${escapeHtml(s._movel)}</b>${s.movel ? ' (informado no lançamento)' : ''}` : '<b style="color:var(--warn-fg)">não identificado</b>'}</div>`
            : ''
        }
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
            ? `<div class="atelie-editor atelie-editor--peca">
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

/* PDF separado por móvel: cada móvel começa numa folha nova */
async function montarPdfAtelieMoveis(itens) {
  const moveis = Atelie.agruparPorMovel(itens).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { numeric: true }));
  const blocos = [];
  moveis.forEach((g, i) => {
    if (i > 0) blocos.push({ tipo: 'quebra' });
    const c = g.conta;
    blocos.push({
      tipo: 'titulo',
      html: `<h2 class="rp-secao">${escapeHtml(g.nome)}</h2><p class="rp-nota">${g.pecas.length} peça(s) · ${c.aprovado} aprovada(s) · ${c.esperando} esperando · ${c.reprovado} não aprovada(s)</p>`,
    });
    const pecas = [...g.pecas].sort((a, b) => (a.nome || '').localeCompare(b.nome || '', 'pt-BR', { numeric: true }));
    blocos.push({
      tipo: 'tabela',
      cabecalho: '<tr><th>Peça</th><th>Categoria</th><th>Data</th><th>Funcionário</th><th>Situação</th><th>Obs. do ateliê</th></tr>',
      linhas: pecas.map(
        (s) => `<tr>
          <td>${escapeHtml(s.nome || '')}${s.observacoes ? `<div class="rp-fraco">${escapeHtml(s.observacoes)}</div>` : ''}</td>
          <td class="nowrap">${escapeHtml(s.tipo || '')}</td>
          <td class="nowrap">${formatarDataCurta(s.criadoEm)}</td>
          <td class="nowrap">${escapeHtml(nomeCurtoRelatorio(s.funcionarioNome))}</td>
          <td class="nowrap ${s._situacao === 'reprovado' ? 'rp-ruim' : ''}">${Atelie.rotulo(s._situacao)}</td>
          <td>${escapeHtml(s.atelieObs || '')}</td>
        </tr>`
      ),
      classe: 'rp-tabela--lista',
    });
  });
  return montarPdfPadrao(blocos, {
    titulo: moveis.length === 1 ? `Ateliê — ${moveis[0].nome}` : 'Ateliê — por móvel',
    periodo: `${moveis.length} móve${moveis.length === 1 ? 'l' : 'is'} · ${itens.length} peça${itens.length === 1 ? '' : 's'}`,
    detalhes: 'Peças de cada móvel e a situação na conferência do ateliê',
  });
}

window.Atelie = Atelie;
