/* =========================================================
   marcenaria.js — aba Marcenaria
   Mostra os serviços das categorias marcadas "Vai para a Marcenaria"
   (Admin → Categorias). Não é cópia: é o MESMO serviço de Serviços.

   Situação na marcenaria: A fazer / Em produção / Feito, mais uma
   observação da marcenaria.
   - Tudo que já existia quando a Marcenaria foi ao ar conta como Feito.
   - Serviço novo entra como A fazer.
   - O Admin muda direto (vale na hora).
   - Quem tem a aba liberada PEDE a mudança; ela só vale depois que o
     Admin autorizar (conta nas Pendências de aprovação).
   ========================================================= */

const MarcenariaView = {
  aba: 'pecas', // 'pecas' | 'gabaritos'
  filtro: 'afazer', // 'afazer' | 'producao' | 'feito' | 'todos'
  filtroTexto: '',
  editandoId: null, // item com o editor de situação aberto
  editor: null, // { status, obs }
  modoSelecao: false,
  selecionados: new Set(),
  _visiveis: [],
  aba: 'pecas', // 'pecas' | 'gabaritos'
  porMovel: false, // "Ver por móvel"
  abertos: new Set(), // móveis com as peças abertas
  editandoMovel: null, // móvel com o "mudar todas" aberto
};

const Marcenaria = {
  SITUACOES: {
    afazer: { rotulo: 'A fazer', badge: 'badge--warn' },
    producao: { rotulo: 'Em produção', badge: 'badge--brand' },
    feito: { rotulo: 'Feito', badge: 'badge--ok' },
  },

  _inicio: null,

  // Momento em que a Marcenaria foi ao ar. Serviço sem situação criado ANTES
  // disso conta como Feito; criado depois, como A fazer.
  async inicio() {
    if (this._inicio) return this._inicio;
    let cfg = await DB.get('config', 'marcenaria_inicio');
    if (!cfg || !cfg.valor) {
      cfg = { chave: 'marcenaria_inicio', valor: Date.now() };
      await DB.put('config', cfg);
    }
    this._inicio = cfg.valor;
    return this._inicio;
  },

  async nomesCategorias() {
    const cats = await Categorias.listar();
    return new Set(cats.filter((c) => c.vaiParaMarcenaria).map((c) => c.nome));
  },

  situacao(s, inicio) {
    if (s.marcenariaStatus && this.SITUACOES[s.marcenariaStatus]) return s.marcenariaStatus;
    if (!s.criadoEm || s.criadoEm < inicio) return 'feito';
    return 'afazer';
  },

  rotulo(status) {
    return (this.SITUACOES[status] || this.SITUACOES.afazer).rotulo;
  },

  selo(status, prefixo = '') {
    const sit = this.SITUACOES[status] || this.SITUACOES.afazer;
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

  /* Decide o móvel de cada peça olhando TODAS as peças da Marcenaria:
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
        const conta = { feito: 0, afazer: 0, producao: 0 };
        g.pecas.forEach((p) => conta[p._situacao]++);
        const ultimo = Math.max(...g.pecas.map((p) => p.criadoEm || 0));
        return { chave: g.chave, nome, pecas: g.pecas, conta, pedidos: g.pecas.filter((p) => p.marcenariaSolicitacao).length, ultimo };
      })
      .sort((a, b) => (a.chave === this.SEM_MOVEL ? -1 : b.chave === this.SEM_MOVEL ? 1 : b.ultimo - a.ultimo));
  },

  // Serviços que aparecem na Marcenaria (categoria marcada)
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

function abasMarcenariaHtml(nGabaritos) {
  const st = MarcenariaView;
  return `<div style="display:flex; gap:8px; margin-bottom:16px; flex-wrap:wrap">
    <button class="btn ${st.aba === 'pecas' ? 'btn--primary' : 'btn--ghost'}" data-marc-aba="pecas">Peças e móveis</button>
    <button class="btn ${st.aba === 'gabaritos' ? 'btn--primary' : 'btn--ghost'}" data-marc-aba="gabaritos">Gabaritos${nGabaritos != null ? ` <small>(${nGabaritos})</small>` : ''}</button>
  </div>`;
}

function ligarAbasMarcenaria(view) {
  view.querySelectorAll('[data-marc-aba]').forEach((b) =>
    b.addEventListener('click', () => {
      MarcenariaView.aba = b.dataset.marcAba;
      renderMarcenaria(view);
    })
  );
}

async function renderMarcenaria(view) {
  if (MarcenariaView.aba === 'gabaritos') return renderGabaritos(view);
  const st = MarcenariaView;
  const ehAdmin = Auth.isAdmin();
  const [itens, nomesCats] = await Promise.all([Marcenaria.itens(), Marcenaria.nomesCategorias()]);

  const conta = { afazer: 0, feito: 0, producao: 0, todos: itens.length };
  itens.forEach((s) => conta[s._situacao]++);
  const pedidos = itens.filter((s) => s.marcenariaSolicitacao).length;

  const alvo = Analise.normaliza(st.filtroTexto);
  if (st.filtro === 'pedidos' && !ehAdmin) st.filtro = 'afazer';
  const funcsAt = (await DB.getAll('usuarios'))
    .filter((u) => u.tipo === 'funcionario' || u.tipo === 'admin')
    .sort((a, b) => (a.tipo === 'admin') - (b.tipo === 'admin') || (a.nome || '').localeCompare(b.nome || '', 'pt-BR'));
  const filtradosBase = itens.filter((s) => {
    if (st.filtro === 'pedidos') {
      if (!s.marcenariaSolicitacao) return false;
    } else if (st.filtro !== 'todos' && s._situacao !== st.filtro) return false;
    if (!alvo) return true;
    return (
      Analise.normaliza(s.nome).includes(alvo) ||
      Analise.normaliza(s.tipo).includes(alvo) ||
      Analise.normaliza(s.funcionarioNome).includes(alvo) ||
      Analise.normaliza(s.observacoes).includes(alvo) ||
      Analise.normaliza(s.marcenariaObs).includes(alvo)
    );
  });
  const filtrados = FiltrosLista.aplicar(filtradosBase, 'marcenaria', {
    func: (s) => s.funcionarioId,
    data: (s) => s.dataFinal || s.criadoEm,
    nome: (s) => s.nome,
    aberto: (s) => s._situacao !== 'feito',
    prazo: (s) => s.dataProgramada,
    prioridade: (a, b) => (b.criadoEm || 0) - (a.criadoEm || 0),
  });
  st._visiveis = filtrados.map((s) => s.id);

  const nGab = (await DB.getAll('gabaritos')).length;
  // aproveitamento da chapa (plano de corte da marcenaria) nos itens mostrados
  const comAprov = itens.filter((s) => s.percentualAproveitamento != null && !isNaN(Number(s.percentualAproveitamento)));
  const porCat = {};
  comAprov.forEach((s) => (porCat[s.tipo] = porCat[s.tipo] || []).push(Number(s.percentualAproveitamento)));
  const media = (l) => l.reduce((a, b) => a + b, 0) / l.length;
  view.innerHTML = `
    ${abasMarcenariaHtml(nGab)}
    <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:12px; margin-bottom:16px; flex-wrap:wrap">
      <div>
        <h2 class="section-title" style="margin-bottom:2px">Marcenaria</h2>
        <p class="section-sub" style="margin:0">${
          ehAdmin
            ? 'Peças das categorias marcadas "Vai para a Marcenaria" — a situação que você marca vale na hora'
            : 'Peças da marcenaria — a mudança de situação vale depois que o Admin autorizar'
        }</p>
      </div>
      ${itens.length ? botaoSelecaoPdf(MarcenariaView, 'btn-selecao-marcenaria') : ''}
    </div>

    ${
      nomesCats.size === 0
        ? `<div class="card"><div class="empty">
            <div class="empty__title">Nenhuma categoria vai para a Marcenaria ainda</div>
            <div class="empty__sub">${
              ehAdmin ? 'Em Admin → Categorias, marque "Vai para a Marcenaria" nas categorias de cadastro.' : 'O administrador ainda não escolheu as categorias.'
            }</div>
          </div></div>`
        : `
    ${
      ehAdmin && pedidos
        ? `<div class="card" style="background:var(--warn-bg, #FDF3DC); border-color:var(--warn-fg); padding:12px 16px; margin-bottom:14px">
            <b>${pedidos} pedido${pedidos === 1 ? '' : 's'} de mudança</b> aguardando sua autorização — aparecem destacados na lista.
          </div>`
        : ''
    }
    ${
      comAprov.length
        ? `<div class="card marc-aprov">
            <div class="row__title" style="margin-bottom:6px">Aproveitamento da chapa</div>
            <div class="marc-aprov__lista">
              <span class="marc-aprov__item"><b>${formatarPct(media(comAprov.map((s) => Number(s.percentualAproveitamento))))}</b> geral <small>(${comAprov.length} plano${comAprov.length === 1 ? '' : 's'})</small></span>
              ${Object.entries(porCat)
                .sort((a, b) => a[0].localeCompare(b[0], 'pt-BR'))
                .map(([c, l]) => `<span class="marc-aprov__item">${escapeHtml(c)}: <b>${formatarPct(media(l))}</b> <small>· desperdício ${formatarPct(100 - media(l))} · ${l.length}</small></span>`)
                .join('')}
            </div>
          </div>`
        : ''
    }
    <div class="chips" style="margin-bottom:12px">
      ${[
        ['afazer', 'A fazer'],
        ['producao', 'Em produção'],
        ['feito', 'Feito'],
        ['todos', 'Todos'],
      ]
        .map(([v, l]) => `<button class="chip ${st.filtro === v ? 'chip--on' : ''}" data-marcenaria-filtro="${v}">${l} <small>${conta[v]}</small></button>`)
        .join('')}
      ${ehAdmin ? `<button class="chip chip--pendente ${st.filtro === 'pedidos' ? 'chip--on' : ''}" data-marcenaria-filtro="pedidos">⚑ A autorizar <small>${pedidos}</small></button>` : ''}
    </div>
    <div class="chips" style="margin-bottom:12px">
      <button class="chip ${!st.porMovel ? 'chip--on' : ''}" data-marcenaria-modo="pecas">Ver por peça</button>
      <button class="chip ${st.porMovel ? 'chip--on' : ''}" data-marcenaria-modo="movel">Ver por móvel</button>
    </div>
    <div class="field" style="margin-bottom:14px">
      <input id="busca-marcenaria" placeholder="Buscar por nome, categoria, funcionário ou observação…" value="${escapeHtml(st.filtroTexto)}" />
      ${FiltrosLista.html('marcenaria', { ordens: ['recentes', 'antigos', 'az', 'za', 'prazo'], funcionarios: funcsAt, rotuloData: 'Data' })}
    </div>
    <div id="barra-marcenaria"></div>
    <div id="lista-marcenaria"></div>
    <div id="marcenaria-previa"></div>
    <div class="row__meta" style="margin-top:10px">Categorias na Marcenaria: ${Array.from(nomesCats).sort((a, b) => a.localeCompare(b, 'pt-BR')).map(escapeHtml).join(', ')}</div>`
    }
  `;

  ligarAbasMarcenaria(view);
  if (nomesCats.size === 0) return;
  FiltrosLista.ligar(view, 'marcenaria', () => renderMarcenaria(view));

  const btnSel = document.getElementById('btn-selecao-marcenaria');
  if (btnSel) {
    btnSel.addEventListener('click', () => {
      st.modoSelecao = !st.modoSelecao;
      if (!st.modoSelecao) st.selecionados.clear();
      renderMarcenaria(view);
    });
  }
  view.querySelectorAll('[data-marcenaria-modo]').forEach((b) =>
    b.addEventListener('click', () => {
      st.porMovel = b.dataset.marcenariaModo === 'movel';
      st.editandoId = null;
      st.editandoMovel = null;
      renderMarcenaria(view);
    })
  );
  view.querySelectorAll('[data-marcenaria-filtro]').forEach((b) =>
    b.addEventListener('click', () => {
      st.filtro = b.dataset.marcenariaFiltro;
      st.editandoId = null;
      renderMarcenaria(view);
    })
  );
  const busca = document.getElementById('busca-marcenaria');
  busca.addEventListener('input', () => {
    st.filtroTexto = busca.value;
    clearTimeout(MarcenariaView._t);
    MarcenariaView._t = setTimeout(() => {
      renderMarcenaria(view).then(() => {
        const b = document.getElementById('busca-marcenaria');
        if (b) {
          b.focus();
          b.setSelectionRange(b.value.length, b.value.length);
        }
      });
    }, 250);
  });

  renderBarraSelecaoPdf({
    contId: 'barra-marcenaria',
    previaId: 'marcenaria-previa',
    estado: MarcenariaView,
    todosIds: itens.map((s) => s.id),
    singular: 'item',
    plural: 'itens',
    dica: 'Marque as caixinhas dos cadastros que vão no PDF.',
    montar: (ids) =>
      st.porMovel ? montarPdfMarcenariaMoveis(itens.filter((s) => ids.includes(s.id))) : montarPdfMarcenaria(itens.filter((s) => ids.includes(s.id))),
    aoMudar: () => renderMarcenaria(view),
  });

  if (st.porMovel) desenharMoveisMarcenaria(view, filtrados);
  else desenharListaMarcenaria(view, filtrados);
}

function desenharListaMarcenaria(view, filtrados) {
  const st = MarcenariaView;
  const ehAdmin = Auth.isAdmin();
  const listaEl = document.getElementById('lista-marcenaria');
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
      ${mostrados.map((s) => itemMarcenariaHtml(s, ehAdmin)).join('')}
    </div>
    ${
      filtrados.length > LIMITE
        ? `<div class="row__meta" style="text-align:center; margin-top:10px">Mostrando ${LIMITE} de ${filtrados.length} — use a busca pra achar os outros.</div>`
        : `<div class="row__meta" style="text-align:center; margin-top:10px">${filtrados.length} item(ns)</div>`
    }
  `;

  ligarAcoesMarcenaria(listaEl, view, filtrados, () => desenharListaMarcenaria(view, filtrados));
}

// botões de cada peça (mudar situação, autorizar, editar, excluir…)
function ligarAcoesMarcenaria(listaEl, view, filtrados, redesenhar) {
  const st = MarcenariaView;
  ligarCaixinhasPdf(listaEl, MarcenariaView, () => renderMarcenaria(view));

  listaEl.querySelectorAll('[data-marcenaria-alterar]').forEach((b) =>
    b.addEventListener('click', () => {
      const s = filtrados.find((x) => x.id === b.dataset.marcenariaAlterar);
      if (!s) return;
      st.editandoId = s.id;
      st.editor = { status: s._situacao, obs: s.marcenariaObs || '' };
      st.editandoMovel = null;
      redesenhar();
    })
  );
  const editor = listaEl.querySelector('.marcenaria-editor--peca');
  if (editor) {
    editor.querySelectorAll('[data-marcenaria-st]').forEach((b) =>
      b.addEventListener('click', () => {
        st.editor.status = b.dataset.marcenariaSt;
        editor.querySelectorAll('[data-marcenaria-st]').forEach((x) => x.classList.toggle('chip--on', x === b));
      })
    );
    const obs = editor.querySelector('#marcenaria-obs');
    obs.addEventListener('input', () => (st.editor.obs = obs.value));
    obs.focus();
    editor.querySelector('#marcenaria-cancelar').addEventListener('click', () => {
      st.editandoId = null;
      redesenhar();
    });
    editor.querySelector('#marcenaria-salvar').addEventListener('click', async () => {
      const btn = editor.querySelector('#marcenaria-salvar');
      btn.disabled = true;
      btn.textContent = 'Salvando…';
      await salvarSituacaoMarcenaria(st.editandoId, st.editor.status, st.editor.obs);
      st.editandoId = null;
      renderMarcenaria(view);
    });
  }

  listaEl.querySelectorAll('[data-marcenaria-autorizar]').forEach((b) =>
    b.addEventListener('click', async () => {
      b.disabled = true;
      await autorizarPedidoMarcenaria(b.dataset.marcenariaAutorizar, true);
      renderMarcenaria(view);
    })
  );
  listaEl.querySelectorAll('[data-marcenaria-recusar]').forEach((b) =>
    b.addEventListener('click', async () => {
      if (!confirm('Recusar esse pedido? A situação continua como está.')) return;
      await autorizarPedidoMarcenaria(b.dataset.marcenariaRecusar, false);
      renderMarcenaria(view);
    })
  );
  listaEl.querySelectorAll('[data-marcenaria-cancelar-pedido]').forEach((b) =>
    b.addEventListener('click', async () => {
      const s = await DB.get('servicos', b.dataset.marcenariaCancelarPedido);
      if (!s) return;
      await DB.atualizarCampos('servicos', s.id, { marcenariaSolicitacao: null });
      renderMarcenaria(view);
    })
  );

  // Admin: editar e excluir usam as mesmas regras da aba Serviços
  listaEl.querySelectorAll('[data-marcenaria-editar]').forEach((b) =>
    b.addEventListener('click', async () => {
      const registro = await DB.get('servicos', b.dataset.marcenariaEditar);
      if (!registro) return;
      ServicosView.subView = 'form';
      ServicosView.formState = criarEstadoFormularioEdicao(registro);
      ServicosView.voltarPara = 'marcenaria'; // ao salvar/cancelar, volta pra Marcenaria
      activeTab = 'servicos';
      renderTabbar();
      renderView('servicos');
    })
  );
  listaEl.querySelectorAll('[data-marcenaria-excluir]').forEach((b) =>
    b.addEventListener('click', async () => {
      const registro = await DB.get('servicos', b.dataset.marcenariaExcluir);
      if (!registro) return;
      const avisoCorte = registro.tipo === 'CNP' ? ' O registro correspondente em Plano de Corte também será excluído.' : '';
      if (!confirm(`Excluir "${registro.nome}"?${avisoCorte} Ele sai de Serviços também. Essa ação não pode ser desfeita.`)) return;
      await DB.delete('servicos', registro.id);
      if (registro.tipo === 'CNP') await excluirPlanoCorteLigado(registro.id);
      renderMarcenaria(view);
    })
  );
}

/* ---------------- VER POR MÓVEL ---------------- */

function desenharMoveisMarcenaria(view, filtrados) {
  const st = MarcenariaView;
  const ehAdmin = Auth.isAdmin();
  const listaEl = document.getElementById('lista-marcenaria');
  if (!listaEl) return;
  const moveis = Marcenaria.agruparPorMovel(filtrados);

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
      c.feito ? `${c.feito} feita${c.feito === 1 ? '' : 's'}` : '',
      c.producao ? `${c.producao} em produção` : '',
      c.afazer ? `${c.afazer} a fazer` : '',
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
        <div class="card marcenaria-movel ${g.pedidos ? 'marcenaria-item--pedido' : ''} ${g.chave === Marcenaria.SEM_MOVEL ? 'marcenaria-movel--sem' : ''}">
          <div style="display:flex; align-items:flex-start; gap:10px; flex-wrap:wrap">
            ${st.modoSelecao ? `<input type="checkbox" class="sel-pdf" data-marcenaria-sel-movel="${escapeHtml(g.chave)}" ${todosMarcados ? 'checked' : ''} aria-label="Incluir este móvel no PDF" />` : ''}
            <div style="flex:1 1 240px; min-width:0">
              <div class="row__title" style="font-size:16px">${escapeHtml(g.nome || '(sem nome)')}</div>
              <div class="row__meta">${g.pecas.length} peça${g.pecas.length === 1 ? '' : 's'} · ${resumo(g.conta)}${
                g.pedidos ? ` · <b>${g.pedidos} pedido${g.pedidos === 1 ? '' : 's'} de mudança</b>` : ''
              }${(() => {
                const l = g.pecas.filter((p) => p.percentualAproveitamento != null).map((p) => Number(p.percentualAproveitamento));
                return l.length ? ` · 🪵 aproveitamento ${formatarPct(l.reduce((a, b) => a + b, 0) / l.length)}` : '';
              })()}${
                g.pecas.length ? ` · <b>${Math.round((g.conta.feito / g.pecas.length) * 100)}% feito</b>` : ''
              }</div>
              ${
                g.chave === Marcenaria.SEM_MOVEL
                  ? `<div class="row__meta" style="margin-top:4px">Peças só com o nome da parte (ASSENTO, ENCOSTO…) ou que servem pra mais de um móvel. ${
                      ehAdmin ? 'Use o Editar da peça e preencha o campo <b>Móvel</b> (ou corrija o nome).' : 'Peça ao Admin pra preencher o campo Móvel.'
                    }</div>`
                  : ''
              }
              <div style="display:flex; gap:4px; margin-top:8px; flex-wrap:wrap">
                ${g.conta.feito ? Marcenaria.selo('feito', `${g.conta.feito} · `) : ''}
                ${g.conta.afazer ? Marcenaria.selo('afazer', `${g.conta.afazer} · `) : ''}
                ${g.conta.producao ? Marcenaria.selo('producao', `${g.conta.producao} · `) : ''}
              </div>
            </div>
            <div style="display:flex; gap:6px; flex:0 0 auto; flex-wrap:wrap">
              <button class="btn btn--ghost" data-marcenaria-abrir="${escapeHtml(g.chave)}" style="padding:6px 12px; font-size:13px">${aberto ? 'Esconder peças' : 'Ver peças'}</button>
              ${editandoEste ? '' : `<button class="btn btn--primary" data-marcenaria-todas="${escapeHtml(g.chave)}" style="padding:6px 12px; font-size:13px">${ehAdmin ? 'Mudar todas' : 'Pedir mudança de todas'}</button>`}
            </div>
          </div>
          ${
            editandoEste
              ? `<div class="marcenaria-editor" id="marcenaria-editor-movel">
                  <div class="row__meta" style="margin-bottom:6px">${
                    ehAdmin
                      ? `Nova situação para as <b>${g.pecas.length}</b> peça(s) mostradas deste móvel (vale na hora):`
                      : `Pedir mudança para as <b>${g.pecas.length}</b> peça(s) mostradas deste móvel (vale depois que o Admin autorizar):`
                  }</div>
                  <div class="chips" style="margin-bottom:10px">
                    ${Object.entries(Marcenaria.SITUACOES)
                      .map(([v, o]) => `<button class="chip ${st.editor && st.editor.status === v ? 'chip--on' : ''}" data-marcenaria-st-movel="${v}">${o.rotulo}</button>`)
                      .join('')}
                  </div>
                  <div class="field" style="margin-bottom:10px">
                    <input id="marcenaria-obs-movel" value="${escapeHtml((st.editor && st.editor.obs) || '')}" placeholder="Observação da marcenaria pra todas (opcional) — deixe vazio pra manter a de cada peça" />
                  </div>
                  <div style="display:flex; gap:8px">
                    <button class="btn btn--ghost" id="marcenaria-cancelar-movel" style="padding:8px 14px; font-size:13px">Cancelar</button>
                    <button class="btn btn--primary" id="marcenaria-salvar-movel" style="padding:8px 14px; font-size:13px">${ehAdmin ? 'Aplicar em todas' : 'Enviar pedido de todas'}</button>
                  </div>
                </div>`
              : ''
          }
          ${aberto ? `<div class="marcenaria-pecas">${g.pecas.map((p) => itemMarcenariaHtml(p, ehAdmin)).join('')}</div>` : ''}
        </div>`;
      })
      .join('')}
    <div class="row__meta" style="text-align:center; margin-top:10px">${
      moveis.length > LIMITE
        ? `Mostrando ${LIMITE} de ${moveis.length} móveis — use a busca pra achar os outros.`
        : `${moveis.length} móve${moveis.length === 1 ? 'l' : 'is'} · ${filtrados.length} peça(s)`
    }</div>
  `;

  const redesenhar = () => desenharMoveisMarcenaria(view, filtrados);
  const acharMovel = (chave) => mostrados.find((g) => g.chave === chave);

  listaEl.querySelectorAll('[data-marcenaria-abrir]').forEach((b) =>
    b.addEventListener('click', () => {
      const k = b.dataset.marcenariaAbrir;
      if (st.abertos.has(k)) st.abertos.delete(k);
      else st.abertos.add(k);
      redesenhar();
    })
  );
  listaEl.querySelectorAll('[data-marcenaria-sel-movel]').forEach((chk) => {
    chk.addEventListener('change', () => {
      const g = acharMovel(chk.dataset.marcenariaSelMovel);
      if (!g) return;
      g.pecas.forEach((p) => (chk.checked ? st.selecionados.add(p.id) : st.selecionados.delete(p.id)));
      renderMarcenaria(view);
    });
  });
  listaEl.querySelectorAll('[data-marcenaria-todas]').forEach((b) =>
    b.addEventListener('click', () => {
      const g = acharMovel(b.dataset.marcenariaTodas);
      if (!g) return;
      st.editandoMovel = g.chave;
      st.editandoId = null;
      // sugere a situação que a maioria das peças já tem
      const maioria = Object.entries(g.conta).sort((a, c) => c[1] - a[1])[0][0];
      st.editor = { status: maioria, obs: '' };
      redesenhar();
    })
  );
  const ed = document.getElementById('marcenaria-editor-movel');
  if (ed) {
    ed.querySelectorAll('[data-marcenaria-st-movel]').forEach((b) =>
      b.addEventListener('click', () => {
        st.editor.status = b.dataset.marcenariaStMovel;
        ed.querySelectorAll('[data-marcenaria-st-movel]').forEach((x) => x.classList.toggle('chip--on', x === b));
      })
    );
    const obs = document.getElementById('marcenaria-obs-movel');
    obs.addEventListener('input', () => (st.editor.obs = obs.value));
    document.getElementById('marcenaria-cancelar-movel').addEventListener('click', () => {
      st.editandoMovel = null;
      redesenhar();
    });
    document.getElementById('marcenaria-salvar-movel').addEventListener('click', async () => {
      const g = acharMovel(st.editandoMovel);
      if (!g) return;
      const btn = document.getElementById('marcenaria-salvar-movel');
      btn.disabled = true;
      btn.textContent = 'Salvando…';
      await salvarSituacaoMarcenariaVarias(
        g.pecas.map((p) => p.id),
        st.editor.status,
        st.editor.obs
      );
      st.editandoMovel = null;
      renderMarcenaria(view);
    });
  }

  ligarAcoesMarcenaria(listaEl, view, filtrados, redesenhar);
}

// "Mudar todas": mesma regra de uma peça (Admin vale na hora; os outros viram pedido)
async function salvarSituacaoMarcenariaVarias(ids, status, obs) {
  const obsLimpa = (obs || '').trim();
  const agora = Date.now();
  const registros = (await Promise.all(ids.map((id) => DB.get('servicos', id)))).filter(Boolean);
  registros.forEach((s) => {
    const obsFinal = obsLimpa || s.marcenariaObs || '';
    if (Auth.isAdmin()) {
      s.marcenariaStatus = status;
      s.marcenariaObs = obsFinal;
      s.marcenariaMarcadoPorId = Auth.current.id;
      s.marcenariaMarcadoPorNome = Auth.current.nome;
      s.marcenariaMarcadoEm = agora;
      s.marcenariaSolicitacao = null;
    } else {
      s.marcenariaSolicitacao = { status, obs: obsFinal, porId: Auth.current.id, porNome: Auth.current.nome, em: agora };
    }
  });
  if (registros.length) {
    // só os campos da marcenaria — não regrava o serviço inteiro
    const CAMPOS = ['marcenariaStatus', 'marcenariaObs', 'marcenariaMarcadoPorId', 'marcenariaMarcadoPorNome', 'marcenariaMarcadoEm', 'marcenariaSolicitacao'];
    await DB.atualizarCamposEmLote(
      'servicos',
      registros.map((r) => ({ id: r.id, campos: Object.fromEntries(CAMPOS.filter((c) => r[c] !== undefined).map((c) => [c, r[c]])) }))
    );
  }
  if (typeof atualizarBadgesTabbar === 'function') atualizarBadgesTabbar();
}

function itemMarcenariaHtml(s, ehAdmin) {
  const st = MarcenariaView;
  const ped = s.marcenariaSolicitacao;
  const editando = st.editandoId === s.id;
  const souEuQuePedi = ped && ped.porId === Auth.current.id;

  return `
    <div class="row marcenaria-item ${ped ? 'marcenaria-item--pedido' : ''}" style="padding:14px 18px; flex-wrap:wrap; align-items:flex-start; gap:10px">
      ${caixinhaPdf(MarcenariaView, s.id)}
      <div class="row__main" style="flex:1 1 260px; min-width:0">
        <div class="row__title">${escapeHtml(s.nome || '(sem nome)')}</div>
        ${s.percentualAproveitamento != null ? `<div class="row__meta">🪵 Aproveitamento da chapa: <b>${formatarPct(Number(s.percentualAproveitamento))}</b> · desperdício ${formatarPct(100 - Number(s.percentualAproveitamento))}</div>` : ''}
        <div class="row__meta">${escapeHtml(s.tipo)} · ${escapeHtml(s.funcionarioNome || 'Disponível')} · ${Const.formatarData(s.criadoEm)}${
          s.dataFinal ? ` · concluído ${Const.formatarData(s.dataFinal)}` : ''
        }</div>
        ${s.observacoes ? `<div class="row__meta" style="font-style:italic">📝 ${escapeHtml(s.observacoes)}</div>` : ''}
        ${
          !MarcenariaView.porMovel
            ? `<div class="row__meta">Móvel: ${s._movel ? `<b>${escapeHtml(s._movel)}</b>${s.movel ? ' (informado no lançamento)' : ''}` : '<b style="color:var(--warn-fg)">não identificado</b>'}</div>`
            : ''
        }
        <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-top:8px">
          ${Marcenaria.selo(s._situacao, 'Marcenaria: ')}
          ${
            s.marcenariaMarcadoPorNome
              ? `<span class="row__meta">por ${escapeHtml(s.marcenariaMarcadoPorNome)} em ${Const.formatarData(s.marcenariaMarcadoEm)}</span>`
              : !s.marcenariaStatus && s._situacao === 'feito'
              ? '<span class="row__meta">cadastro anterior à Marcenaria</span>'
              : ''
          }
        </div>
        ${s.marcenariaObs ? `<div class="row__meta" style="margin-top:4px">Obs. da marcenaria: <b>${escapeHtml(s.marcenariaObs)}</b></div>` : ''}
        ${
          ped
            ? `<div class="marcenaria-pedido">
                <b>${escapeHtml(ped.porNome || 'Alguém')}</b> pediu: ${Marcenaria.selo(ped.status)}${ped.obs ? ` — "${escapeHtml(ped.obs)}"` : ''}
                <span class="row__meta"> · ${Const.formatarData(ped.em)} · aguardando autorização do Admin</span>
                <div style="display:flex; gap:6px; margin-top:8px; flex-wrap:wrap">
                  ${
                    ehAdmin
                      ? `<button class="btn btn--primary" data-marcenaria-autorizar="${s.id}" style="padding:6px 12px; font-size:13px">Autorizar</button>
                         <button class="btn btn--danger" data-marcenaria-recusar="${s.id}" style="padding:6px 12px; font-size:13px">Recusar</button>`
                      : souEuQuePedi
                      ? `<button class="btn btn--ghost" data-marcenaria-cancelar-pedido="${s.id}" style="padding:6px 12px; font-size:13px">Cancelar meu pedido</button>`
                      : ''
                  }
                </div>
              </div>`
            : ''
        }
        ${
          editando
            ? `<div class="marcenaria-editor marcenaria-editor--peca">
                <div class="row__meta" style="margin-bottom:6px">${ehAdmin ? 'Nova situação (vale na hora):' : 'Pedir mudança para (vale depois que o Admin autorizar):'}</div>
                <div class="chips" style="margin-bottom:10px">
                  ${Object.entries(Marcenaria.SITUACOES)
                    .map(([v, o]) => `<button class="chip ${st.editor.status === v ? 'chip--on' : ''}" data-marcenaria-st="${v}">${o.rotulo}</button>`)
                    .join('')}
                </div>
                <div class="field" style="margin-bottom:10px">
                  <input id="marcenaria-obs" value="${escapeHtml(st.editor.obs)}" placeholder="Observação da marcenaria (opcional) — ex: falta lixar" />
                </div>
                <div style="display:flex; gap:8px">
                  <button class="btn btn--ghost" id="marcenaria-cancelar" style="padding:8px 14px; font-size:13px">Cancelar</button>
                  <button class="btn btn--primary" id="marcenaria-salvar" style="padding:8px 14px; font-size:13px">${ehAdmin ? 'Salvar' : 'Enviar pedido'}</button>
                </div>
              </div>`
            : ''
        }
      </div>
      ${
        editando
          ? ''
          : `<div style="display:flex; gap:6px; flex:0 0 auto; flex-wrap:wrap">
              <button class="btn btn--ghost" data-marcenaria-alterar="${s.id}" style="padding:6px 12px; font-size:13px">${ehAdmin ? 'Mudar situação' : ped && souEuQuePedi ? 'Refazer pedido' : 'Pedir mudança'}</button>
              ${
                ehAdmin
                  ? `<button class="btn btn--ghost" data-marcenaria-editar="${s.id}" style="padding:6px 12px; font-size:13px">Editar</button>
                     <button class="btn btn--danger" data-marcenaria-excluir="${s.id}" style="padding:6px 12px; font-size:13px">Excluir</button>`
                  : ''
              }
            </div>`
      }
    </div>`;
}

async function salvarSituacaoMarcenaria(id, status, obs) {
  const s = await DB.get('servicos', id);
  if (!s) return;
  const agora = Date.now();
  if (Auth.isAdmin()) {
    s.marcenariaStatus = status;
    s.marcenariaObs = (obs || '').trim();
    s.marcenariaMarcadoPorId = Auth.current.id;
    s.marcenariaMarcadoPorNome = Auth.current.nome;
    s.marcenariaMarcadoEm = agora;
    s.marcenariaSolicitacao = null; // o que o Admin decide substitui pedido em aberto
  } else {
    s.marcenariaSolicitacao = {
      status,
      obs: (obs || '').trim(),
      porId: Auth.current.id,
      porNome: Auth.current.nome,
      em: agora,
    };
  }
  const CAMPOS_AT = ['marcenariaStatus', 'marcenariaObs', 'marcenariaMarcadoPorId', 'marcenariaMarcadoPorNome', 'marcenariaMarcadoEm', 'marcenariaSolicitacao', 'marcenariaAutorizadoPor', 'marcenariaAutorizadoEm'];
  await DB.atualizarCampos('servicos', s.id, Object.fromEntries(CAMPOS_AT.filter((c) => s[c] !== undefined).map((c) => [c, s[c]])));
  if (typeof atualizarBadgesTabbar === 'function') atualizarBadgesTabbar();
}

async function autorizarPedidoMarcenaria(id, autorizar) {
  const s = await DB.get('servicos', id);
  if (!s || !s.marcenariaSolicitacao) return;
  const ped = s.marcenariaSolicitacao;
  if (autorizar) {
    s.marcenariaStatus = ped.status;
    s.marcenariaObs = ped.obs || '';
    s.marcenariaMarcadoPorId = ped.porId;
    s.marcenariaMarcadoPorNome = ped.porNome;
    s.marcenariaMarcadoEm = ped.em;
    s.marcenariaAutorizadoPor = Auth.current.nome;
    s.marcenariaAutorizadoEm = Date.now();
  }
  s.marcenariaSolicitacao = null;
  const CAMPOS_AT = ['marcenariaStatus', 'marcenariaObs', 'marcenariaMarcadoPorId', 'marcenariaMarcadoPorNome', 'marcenariaMarcadoEm', 'marcenariaSolicitacao', 'marcenariaAutorizadoPor', 'marcenariaAutorizadoEm'];
  await DB.atualizarCampos('servicos', s.id, Object.fromEntries(CAMPOS_AT.filter((c) => s[c] !== undefined).map((c) => [c, s[c]])));
  if (typeof atualizarBadgesTabbar === 'function') atualizarBadgesTabbar();
}

/* ---------------- PDF DO ATELIÊ ---------------- */

async function montarPdfMarcenaria(itens) {
  const ordenados = [...itens].sort(
    (a, b) => (a.tipo || '').localeCompare(b.tipo || '', 'pt-BR') || (a.criadoEm || 0) - (b.criadoEm || 0)
  );
  const conta = { feito: 0, afazer: 0, producao: 0 };
  ordenados.forEach((s) => conta[s._situacao]++);
  const linhas = [];
  let atual = null;
  ordenados.forEach((s) => {
    if (s.tipo !== atual) {
      atual = s.tipo;
      const n = ordenados.filter((x) => x.tipo === atual).length;
      linhas.push(`<tr class="rp-grupo"><td colspan="6">${escapeHtml(atual)} — ${n} item(ns)</td></tr>`);
    }
    linhas.push(`<tr>
      <td class="nowrap">${formatarDataCurta(s.criadoEm)}</td>
      <td>${escapeHtml(s.nome || '')}${s.observacoes ? `<div class="rp-fraco">${escapeHtml(s.observacoes)}</div>` : ''}</td>
      <td class="nowrap">${escapeHtml(nomeCurtoRelatorio(s.funcionarioNome))}</td>
      <td class="nowrap">${Marcenaria.rotulo(s._situacao)}</td>
          <td class="num">${s.percentualAproveitamento != null ? formatarPct(Number(s.percentualAproveitamento)) : ''}</td>
      <td>${escapeHtml(s.marcenariaObs || '')}</td>
    </tr>`);
  });
  const blocos = [
    {
      tipo: 'titulo',
      html: `<h2 class="rp-secao">Produção da Marcenaria</h2><p class="rp-nota">${ordenados.length} item(ns) · ${conta.feito} feita(s) · ${conta.producao} em produção · ${conta.afazer} a fazer</p>`,
    },
    {
      tipo: 'tabela',
      cabecalho: '<tr><th>Data</th><th>Cadastro</th><th>Funcionário</th><th>Situação</th><th class="num">Aprov.</th><th>Obs. da marcenaria</th></tr>',
      linhas,
      classe: 'rp-tabela--lista',
    },
  ];
  return montarPdfPadrao(blocos, {
    titulo: 'Marcenaria',
    periodo: `${ordenados.length} item${ordenados.length === 1 ? '' : 'ns'}`,
    detalhes: 'Situação dos cadastros na marcenaria',
  });
}

/* PDF separado por móvel: cada móvel começa numa folha nova */
async function montarPdfMarcenariaMoveis(itens) {
  const moveis = Marcenaria.agruparPorMovel(itens).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { numeric: true }));
  const blocos = [];
  moveis.forEach((g, i) => {
    if (i > 0) blocos.push({ tipo: 'quebra' });
    const c = g.conta;
    blocos.push({
      tipo: 'titulo',
      html: `<h2 class="rp-secao">${escapeHtml(g.nome)}</h2><p class="rp-nota">${g.pecas.length} peça(s) · ${c.feito} feita(s) · ${c.producao} em produção · ${c.afazer} a fazer</p>`,
    });
    const pecas = [...g.pecas].sort((a, b) => (a.nome || '').localeCompare(b.nome || '', 'pt-BR', { numeric: true }));
    blocos.push({
      tipo: 'tabela',
      cabecalho: '<tr><th>Peça</th><th>Categoria</th><th>Data</th><th>Funcionário</th><th>Situação</th><th class="num">Aprov.</th><th>Obs. da marcenaria</th></tr>',
      linhas: pecas.map(
        (s) => `<tr>
          <td>${escapeHtml(s.nome || '')}${s.observacoes ? `<div class="rp-fraco">${escapeHtml(s.observacoes)}</div>` : ''}</td>
          <td class="nowrap">${escapeHtml(s.tipo || '')}</td>
          <td class="nowrap">${formatarDataCurta(s.criadoEm)}</td>
          <td class="nowrap">${escapeHtml(nomeCurtoRelatorio(s.funcionarioNome))}</td>
          <td class="nowrap">${Marcenaria.rotulo(s._situacao)}</td>
          <td class="num">${s.percentualAproveitamento != null ? formatarPct(Number(s.percentualAproveitamento)) : ''}</td>
          <td>${escapeHtml(s.marcenariaObs || '')}</td>
        </tr>`
      ),
      classe: 'rp-tabela--lista',
    });
  });
  return montarPdfPadrao(blocos, {
    titulo: moveis.length === 1 ? `Marcenaria — ${moveis[0].nome}` : 'Marcenaria — por móvel',
    periodo: `${moveis.length} móve${moveis.length === 1 ? 'l' : 'is'} · ${itens.length} peça${itens.length === 1 ? '' : 's'}`,
    detalhes: 'Peças de cada móvel e a situação na marcenaria',
  });
}

window.Marcenaria = Marcenaria;

/* =========================================================
   GABARITOS da marcenaria
   Coleção "gabaritos": nome, móveis em que é usado, quantidade, fotos.
   Admin cadastra direto; quem tem a aba Marcenaria cadastra e fica
   "pendente" até o Admin aprovar (igual Materiais).
   ========================================================= */

const GabaritosView = {
  form: null, // null = lista; objeto = cadastrando/editando
  filtroTexto: '',
  filtroMovel: '',
  ordem: 'az',
  modoSelecao: false,
  selecionados: new Set(),
};

function gabaritoPodeMexer(g) {
  if (Auth.isAdmin()) return true;
  return !!g && g.aprovado === 'pendente' && g.criadoPorId === Auth.current.id;
}

async function moveisConhecidosMarcenaria() {
  const nomes = new Map();
  const add = (m) => {
    if (!m) return;
    const k = Atelie.chaveMovel(m);
    if (!nomes.has(k)) nomes.set(k, m);
  };
  (await Marcenaria.itens()).forEach((s) => add(s._movel));
  (await Atelie.itens()).forEach((s) => add(s._movel));
  (await DB.getAll('gabaritos')).forEach((g) => (g.moveis || []).forEach(add));
  return Array.from(nomes.values()).sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true }));
}

async function renderGabaritos(view) {
  const gv = GabaritosView;
  if (gv.form) return renderGabaritoForm(view);
  const ehAdmin = Auth.isAdmin();
  const todos = await DB.getAll('gabaritos');
  const moveis = Array.from(new Set(todos.flatMap((g) => g.moveis || []))).sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true }));
  const alvo = Analise.normaliza(gv.filtroTexto);
  const lista = todos
    .filter((g) => !gv.filtroMovel || (g.moveis || []).some((m) => Atelie.chaveMovel(m) === Atelie.chaveMovel(gv.filtroMovel)))
    .filter(
      (g) =>
        !alvo ||
        Analise.normaliza(g.nome).includes(alvo) ||
        (g.moveis || []).some((m) => Analise.normaliza(m).includes(alvo)) ||
        Analise.normaliza(g.observacao).includes(alvo)
    )
    .sort((a, b) =>
      gv.ordem === 'recentes'
        ? (b.criadoEm || 0) - (a.criadoEm || 0)
        : gv.ordem === 'qtd'
        ? (Number(b.quantidade) || 0) - (Number(a.quantidade) || 0)
        : (a.nome || '').localeCompare(b.nome || '', 'pt-BR', { numeric: true })
    );
  const totalUnid = todos.reduce((s, g) => s + (Number(g.quantidade) || 0), 0);
  const pend = todos.filter((g) => g.aprovado === 'pendente').length;

  view.innerHTML = `
    ${abasMarcenariaHtml(todos.length)}
    <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:12px; margin-bottom:16px; flex-wrap:wrap">
      <div>
        <h2 class="section-title" style="margin-bottom:2px">Gabaritos</h2>
        <p class="section-sub" style="margin:0">${ehAdmin ? 'Moldes da marcenaria e em quais móveis são usados' : 'Moldes da marcenaria — o que você cadastrar fica pendente até o Admin aprovar'}</p>
      </div>
      <div style="display:flex; gap:8px; flex-wrap:wrap">
        ${todos.length ? botaoSelecaoPdf(GabaritosView, 'btn-selecao-gabaritos') : ''}
        <button class="btn btn--primary" id="btn-novo-gabarito">+ Novo Gabarito</button>
      </div>
    </div>

    <div class="stat-grid" style="margin-bottom:14px">
      <div class="card"><div class="stat"><div class="stat__value">${todos.length}</div><div class="stat__label">tipos de gabarito</div></div></div>
      <div class="card"><div class="stat"><div class="stat__value">${totalUnid}</div><div class="stat__label">gabaritos no total (unidades)</div></div></div>
      <div class="card"><div class="stat"><div class="stat__value">${moveis.length}</div><div class="stat__label">móveis com gabarito</div></div></div>
      ${ehAdmin && pend ? `<div class="card"><div class="stat"><div class="stat__value">${pend}</div><div class="stat__label">esperando aprovação</div></div></div>` : ''}
    </div>

    <div class="field" style="margin-bottom:10px">
      <input id="busca-gabarito" placeholder="Buscar por nome do gabarito, móvel ou observação…" value="${escapeHtml(gv.filtroTexto)}" />
    </div>
    <div class="filtros-extra" style="margin:0 0 14px">
      <div class="field filtros-extra__campo">
        <label>Móvel</label>
        <select id="filtro-movel-gabarito">
          <option value="">Todos os móveis</option>
          ${moveis.map((m) => `<option value="${escapeHtml(m)}" ${gv.filtroMovel === m ? 'selected' : ''}>${escapeHtml(m)}</option>`).join('')}
        </select>
      </div>
      <div class="field filtros-extra__campo">
        <label>Ordenar</label>
        <select id="ordem-gabarito">
          <option value="az" ${gv.ordem === 'az' ? 'selected' : ''}>Ordem alfabética (A → Z)</option>
          <option value="recentes" ${gv.ordem === 'recentes' ? 'selected' : ''}>Cadastrados por último</option>
          <option value="qtd" ${gv.ordem === 'qtd' ? 'selected' : ''}>Maior quantidade</option>
        </select>
      </div>
    </div>
    <div id="barra-gabaritos"></div>
    <div id="lista-gabaritos"></div>
    <div id="gabaritos-previa"></div>
  `;

  ligarAbasMarcenaria(view);
  document.getElementById('btn-novo-gabarito').addEventListener('click', () => {
    gv.form = { editId: null, nome: '', moveisTexto: '', quantidade: '1', observacao: '', imagens: [], erro: '' };
    renderGabaritos(view);
  });
  const btnSel = document.getElementById('btn-selecao-gabaritos');
  if (btnSel)
    btnSel.addEventListener('click', () => {
      gv.modoSelecao = !gv.modoSelecao;
      if (!gv.modoSelecao) gv.selecionados.clear();
      renderGabaritos(view);
    });
  const busca = document.getElementById('busca-gabarito');
  busca.addEventListener('input', () => {
    gv.filtroTexto = busca.value;
    clearTimeout(gv._t);
    gv._t = setTimeout(() => renderGabaritos(view).then(() => {
      const b = document.getElementById('busca-gabarito');
      if (b) { b.focus(); b.setSelectionRange(b.value.length, b.value.length); }
    }), 250);
  });
  document.getElementById('filtro-movel-gabarito').addEventListener('change', (e) => ((gv.filtroMovel = e.target.value), renderGabaritos(view)));
  document.getElementById('ordem-gabarito').addEventListener('change', (e) => ((gv.ordem = e.target.value), renderGabaritos(view)));

  gv._visiveis = lista.map((g) => g.id);
  renderBarraSelecaoPdf({
    contId: 'barra-gabaritos',
    previaId: 'gabaritos-previa',
    estado: GabaritosView,
    todosIds: lista.map((g) => g.id),
    singular: 'gabarito',
    plural: 'gabaritos',
    dica: 'Marque os gabaritos que vão no PDF.',
    montar: (ids) => montarPdfGabaritos(todos.filter((g) => ids.includes(g.id))),
    aoMudar: () => renderGabaritos(view),
  });

  const listaEl = document.getElementById('lista-gabaritos');
  if (!lista.length) {
    listaEl.innerHTML = `<div class="card"><div class="empty">
      <div class="empty__title">${todos.length ? 'Nenhum gabarito nesse filtro' : 'Nenhum gabarito cadastrado ainda'}</div>
      <div class="empty__sub">${todos.length ? 'Mude a busca ou o móvel.' : 'Toque em "+ Novo Gabarito" para cadastrar o primeiro.'}</div>
    </div></div>`;
    return;
  }
  listaEl.innerHTML = `<div class="card" style="padding:0">${lista
    .map((g) => {
      const fotos = (g.imagens || []).filter((im) => im.linkImagem);
      return `<div class="row" style="padding:14px 18px; flex-wrap:wrap; align-items:flex-start; gap:12px">
        ${caixinhaPdf(GabaritosView, g.id)}
        ${fotos.length ? `<a href="${fotos[0].linkVisualizar || fotos[0].linkImagem}" target="_blank" rel="noopener"><img class="gab-foto" src="${fotos[0].linkImagem}" alt="" referrerpolicy="no-referrer" /></a>` : '<div class="gab-foto gab-foto--vazia">📐</div>'}
        <div class="row__main" style="flex:1 1 220px; min-width:0">
          <div class="row__title">${escapeHtml(g.nome)}${g.aprovado === 'pendente' ? ' <span class="badge badge--warn">Pendente aprovação</span>' : ''}</div>
          <div class="row__meta">Quantidade: <b>${Number(g.quantidade) || 0}</b>${fotos.length > 1 ? ` · ${fotos.length} fotos` : ''}${g.criadoPorNome ? ` · por ${escapeHtml(g.criadoPorNome)}` : ''}</div>
          <div class="gab-moveis">${(g.moveis || []).map((m) => `<span class="badge badge--idle">${escapeHtml(m)}</span>`).join('') || '<span class="row__meta">Sem móvel informado</span>'}</div>
          ${g.observacao ? `<div class="row__meta" style="font-style:italic">${escapeHtml(g.observacao)}</div>` : ''}
        </div>
        <div style="display:flex; gap:6px; flex:0 0 auto; flex-wrap:wrap">
          ${ehAdmin && g.aprovado === 'pendente' ? `<button class="btn btn--primary" data-aprovar-gab="${g.id}" style="padding:6px 12px; font-size:13px">Aprovar</button>` : ''}
          ${gabaritoPodeMexer(g) ? `<button class="btn btn--ghost" data-editar-gab="${g.id}" style="padding:6px 12px; font-size:13px">Editar</button>
          <button class="btn btn--danger" data-excluir-gab="${g.id}" style="padding:6px 12px; font-size:13px">${ehAdmin && g.aprovado === 'pendente' ? 'Recusar' : 'Excluir'}</button>` : ''}
        </div>
      </div>`;
    })
    .join('')}</div>
    <div class="row__meta" style="text-align:center; margin-top:10px">${lista.length} gabarito(s)</div>`;

  ligarCaixinhasPdf(listaEl, GabaritosView, () => renderGabaritos(view));
  listaEl.querySelectorAll('[data-aprovar-gab]').forEach((b) =>
    b.addEventListener('click', async () => {
      await DB.atualizarCampos('gabaritos', b.dataset.aprovarGab, { aprovado: 'aprovado', dataAprovacao: Date.now() });
      renderGabaritos(view);
      if (typeof atualizarBadgesTabbar === 'function') atualizarBadgesTabbar();
    })
  );
  listaEl.querySelectorAll('[data-editar-gab]').forEach((b) =>
    b.addEventListener('click', async () => {
      const g = await DB.get('gabaritos', b.dataset.editarGab);
      if (!g) return;
      gv.form = {
        editId: g.id,
        nome: g.nome || '',
        moveisTexto: (g.moveis || []).join('\n'),
        quantidade: String(g.quantidade ?? 1),
        observacao: g.observacao || '',
        imagens: [...(g.imagens || [])],
        erro: '',
      };
      renderGabaritos(view);
    })
  );
  listaEl.querySelectorAll('[data-excluir-gab]').forEach((b) =>
    b.addEventListener('click', async () => {
      const g = await DB.get('gabaritos', b.dataset.excluirGab);
      if (!g || !confirm(`Excluir o gabarito "${g.nome}"?`)) return;
      await DB.delete('gabaritos', g.id);
      for (const im of g.imagens || []) {
        try { await Drive.excluirArquivo(im.id); } catch (e) { console.warn('Foto não apagada do Drive:', e); }
      }
      renderGabaritos(view);
    })
  );
}

async function renderGabaritoForm(view) {
  const gv = GabaritosView;
  const f = gv.form;
  const moveis = await moveisConhecidosMarcenaria();
  view.innerHTML = `
    <div style="display:flex; align-items:center; gap:10px; margin-bottom:16px">
      <button class="topbar__icon-btn" id="btn-voltar-gab" aria-label="Voltar" style="background:var(--paper-dim)">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="20" height="20"><path d="M15 18l-6-6 6-6"/></svg>
      </button>
      <h2 class="section-title" style="margin:0">${f.editId ? 'Editar Gabarito' : 'Novo Gabarito'}</h2>
    </div>
    ${f.erro ? `<div class="auth__error show" style="text-align:left; margin-bottom:16px">${escapeHtml(f.erro)}</div>` : ''}
    <div class="card">
      <div class="field"><label for="f-gab-nome">Nome do gabarito</label>
        <input id="f-gab-nome" value="${escapeHtml(f.nome)}" placeholder="Ex: GABARITO ENCOSTO CURVO" autocomplete="off" /></div>
      <div class="field"><label for="f-gab-moveis">Móveis em que é usado (um por linha)</label>
        <textarea id="f-gab-moveis" rows="3" placeholder="POLTRONA CHLÔE&#10;NAMORADEIRA CHLOE 1,80">${escapeHtml(f.moveisTexto)}</textarea>
        <div style="display:flex; gap:6px; margin-top:6px">
          <input id="f-gab-add-movel" list="lista-moveis-gab" placeholder="Buscar móvel que já existe e adicionar…" autocomplete="off" style="flex:1" />
          <button class="btn btn--ghost" id="btn-gab-add-movel" type="button">Adicionar</button>
        </div>
        <datalist id="lista-moveis-gab">${moveis.map((m) => `<option value="${escapeHtml(m)}"></option>`).join('')}</datalist>
      </div>
      <div class="field"><label for="f-gab-qtd">Quantidade</label>
        <input id="f-gab-qtd" type="number" min="0" step="1" inputmode="numeric" value="${escapeHtml(f.quantidade)}" /></div>
      <div class="field"><label for="f-gab-obs">Observação (opcional)</label>
        <input id="f-gab-obs" value="${escapeHtml(f.observacao)}" placeholder="Ex: MDF 15mm, guardado na prateleira 2" /></div>
      <div class="field"><label for="f-gab-imagens">Fotos (opcional)</label>
        <input id="f-gab-imagens" type="file" accept="image/*" multiple />
        <div id="lista-imagens-gab" style="margin-top:10px"></div></div>
      ${Auth.isAdmin() ? '' : '<div class="row__meta" style="margin-bottom:12px">Fica pendente até o Admin aprovar.</div>'}
      <div style="display:flex; gap:10px">
        <button class="btn btn--ghost" id="btn-cancelar-gab" style="flex:1">Cancelar</button>
        <button class="btn btn--primary" id="btn-salvar-gab" style="flex:2">${f.editId ? 'Salvar alterações' : 'Cadastrar gabarito'}</button>
      </div>
    </div>`;

  const voltar = () => ((gv.form = null), renderGabaritos(view));
  document.getElementById('btn-voltar-gab').addEventListener('click', voltar);
  document.getElementById('btn-cancelar-gab').addEventListener('click', voltar);
  const bind = (id, k) => document.getElementById(id).addEventListener('input', (e) => (f[k] = e.target.value));
  bind('f-gab-nome', 'nome');
  bind('f-gab-moveis', 'moveisTexto');
  bind('f-gab-qtd', 'quantidade');
  bind('f-gab-obs', 'observacao');
  document.getElementById('btn-gab-add-movel').addEventListener('click', () => {
    const inp = document.getElementById('f-gab-add-movel');
    const m = inp.value.trim();
    if (!m) return;
    const atuais = f.moveisTexto.split('\n').map((x) => x.trim()).filter(Boolean);
    if (!atuais.some((x) => Atelie.chaveMovel(x) === Atelie.chaveMovel(m))) atuais.push(m);
    f.moveisTexto = atuais.join('\n');
    document.getElementById('f-gab-moveis').value = f.moveisTexto;
    inp.value = '';
  });

  const desenharFotos = () => {
    const cont = document.getElementById('lista-imagens-gab');
    if (!cont) return;
    cont.innerHTML = f.imagens.length
      ? `<div style="display:flex; gap:10px; flex-wrap:wrap">${f.imagens
          .map((img) => `<div style="position:relative"><img src="${img.linkImagem}" alt="" referrerpolicy="no-referrer" style="width:80px; height:80px; object-fit:cover; border-radius:8px; border:1px solid var(--line)" />
            <button data-rem-img-gab="${img.id}" aria-label="Remover foto" style="position:absolute; top:-6px; right:-6px; width:22px; height:22px; border-radius:50%; background:var(--danger-fg); color:#fff; font-size:14px; line-height:1">×</button></div>`)
          .join('')}</div>`
      : '<div class="row__meta">Nenhuma foto ainda.</div>';
    cont.querySelectorAll('[data-rem-img-gab]').forEach((b) =>
      b.addEventListener('click', async () => {
        const id = b.dataset.remImgGab;
        try { await Drive.excluirArquivo(id); } catch (e) { console.warn(e); }
        f.imagens = f.imagens.filter((im) => im.id !== id);
        desenharFotos();
      })
    );
  };
  desenharFotos();
  const inpFotos = document.getElementById('f-gab-imagens');
  inpFotos.addEventListener('change', async (ev) => {
    const arquivos = Array.from(ev.target.files || []);
    if (!arquivos.length) return;
    inpFotos.disabled = true;
    document.getElementById('btn-salvar-gab').disabled = true;
    const cont = document.getElementById('lista-imagens-gab');
    const { enviados, erros } = await Drive.enviarVarios(arquivos, (feitos, total) => {
      if (cont) cont.innerHTML = `<div class="row__meta">Enviando pro Google Drive: ${feitos} de ${total}… aguarde antes de salvar</div>`;
    });
    f.imagens = [...f.imagens, ...enviados];
    if (erros.length) f.erro = erros.map((e) => `Não consegui enviar "${e.nome}": ${e.mensagem}`).join(' ');
    renderGabaritoForm(view);
  });

  document.getElementById('btn-salvar-gab').addEventListener('click', async () => {
    const nome = f.nome.trim();
    if (!nome) {
      f.erro = 'Digite o nome do gabarito.';
      return renderGabaritoForm(view);
    }
    const qtd = parseInt(f.quantidade, 10);
    const moveisLista = Array.from(new Map(f.moveisTexto.split('\n').map((x) => x.trim()).filter(Boolean).map((m) => [Atelie.chaveMovel(m), m])).values());
    const btn = document.getElementById('btn-salvar-gab');
    btn.disabled = true;
    btn.textContent = 'Salvando…';
    try {
      if (f.editId) {
        await DB.atualizarCampos('gabaritos', f.editId, {
          nome,
          moveis: moveisLista,
          quantidade: isNaN(qtd) || qtd < 0 ? 0 : qtd,
          observacao: f.observacao.trim(),
          imagens: f.imagens,
          atualizadoEm: Date.now(),
        });
      } else {
        await DB.put('gabaritos', {
          id: dbUtil.uid(),
          nome,
          moveis: moveisLista,
          quantidade: isNaN(qtd) || qtd < 0 ? 0 : qtd,
          observacao: f.observacao.trim(),
          imagens: f.imagens,
          criadoEm: Date.now(),
          criadoPorId: Auth.current.id,
          criadoPorNome: Auth.current.nome,
          aprovado: Auth.isAdmin() ? 'aprovado' : 'pendente',
          dataAprovacao: Auth.isAdmin() ? Date.now() : null,
        });
      }
    } catch (e) {
      f.erro = 'Não consegui salvar: ' + (e && e.message ? e.message : 'erro desconhecido.');
      return renderGabaritoForm(view);
    }
    voltar();
  });
}

async function montarPdfGabaritos(lista) {
  const ord = [...lista].sort((a, b) => (a.nome || '').localeCompare(b.nome || '', 'pt-BR', { numeric: true }));
  const total = ord.reduce((s, g) => s + (Number(g.quantidade) || 0), 0);
  const blocos = [
    { tipo: 'titulo', html: `<h2 class="rp-secao">Gabaritos</h2><p class="rp-nota">${ord.length} tipo(s) · ${total} unidade(s)</p>` },
    {
      tipo: 'tabela',
      cabecalho: '<tr><th>Foto</th><th>Gabarito</th><th>Móveis</th><th class="num">Qtd.</th><th>Observação</th></tr>',
      linhas: ord.map((g) => {
        const foto = (g.imagens || []).find((im) => im.linkImagem);
        return `<tr>
          <td class="rp-mat-foto">${foto ? `<img src="${foto.linkImagem}" alt="" referrerpolicy="no-referrer" />` : ''}</td>
          <td><b>${escapeHtml(g.nome)}</b></td>
          <td>${(g.moveis || []).map(escapeHtml).join('<br>')}</td>
          <td class="num">${Number(g.quantidade) || 0}</td>
          <td>${escapeHtml(g.observacao || '')}</td>
        </tr>`;
      }),
    },
  ];
  return montarPdfPadrao(blocos, { titulo: 'Gabaritos da Marcenaria', periodo: `${ord.length} gabarito(s)`, detalhes: 'Moldes e os móveis em que são usados' });
}
