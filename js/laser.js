/* =========================================================
   laser.js — aba Laser
   Mostra os serviços das categorias marcadas "Vai para o Laser"
   (Admin → Categorias), separados em CHAPAS e TUBOS — cada categoria
   diz em qual parte entra. Não é cópia: é o MESMO serviço de Serviços.
   Cada peça guarda o material usado (aba Materiais: Chapa / Tubo).

   Situação no laser: A cortar / Em corte / Cortado, mais uma
   observação da laser.
   - Tudo que já existia quando o Laser foi ao ar conta como Cortado.
   - Serviço novo entra como A cortar.
   - O Admin muda direto (vale na hora).
   - Quem tem a aba liberada PEDE a mudança; ela só vale depois que o
     Admin autorizar (conta nas Pendências de aprovação).
   ========================================================= */

const LaserView = {
  aba: 'chapa', // 'chapa' | 'tubo' — controle separado da máquina
  filtroMaterial: '', // id/nome do material ('' = todos)
  materialPecaId: null, // peça com o "Material" aberto
  filtro: 'acortar', // 'acortar' | 'cortando' | 'cortado' | 'todos'
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

const Laser = {
  SITUACOES: {
    acortar: { rotulo: 'A cortar', badge: 'badge--warn' },
    cortando: { rotulo: 'Em corte', badge: 'badge--brand' },
    cortado: { rotulo: 'Cortado', badge: 'badge--ok' },
  },

  _inicio: null,

  // Momento em que o Laser foi ao ar. Serviço sem situação criado ANTES
  // disso conta como Cortado; criado depois, como A cortar.
  async inicio() {
    if (this._inicio) return this._inicio;
    let cfg = await DB.get('config', 'laser_inicio');
    if (!cfg || !cfg.valor) {
      cfg = { chave: 'laser_inicio', valor: Date.now() };
      await DB.put('config', cfg);
    }
    this._inicio = cfg.valor;
    return this._inicio;
  },

  // categoria de material da parte, se a categoria de serviço não disser
  materialReserva(parte) {
    return parte === 'tubo' ? 'Tubo' : 'Chapa';
  },

  chaveMaterial(s) {
    return s.materialNome ? String(s.materialId || s.materialNome) : '__sem__';
  },

  PARTES: {
    chapa: { rotulo: 'Chapas', singular: 'chapa' },
    tubo: { rotulo: 'Tubos', singular: 'tubo' },
  },

  // nome da categoria → 'chapa' | 'tubo'
  async partesPorCategoria() {
    const cats = await Categorias.listar();
    const mapa = new Map();
    cats.forEach((c) => {
      const p = Categorias.laserParteDe(c);
      if (p) mapa.set(c.nome, p);
    });
    return mapa;
  },

  // categorias de uma parte (ou de todas, sem parte)
  async nomesCategorias(parte) {
    const mapa = await this.partesPorCategoria();
    return new Set(Array.from(mapa.entries()).filter(([, p]) => !parte || p === parte).map(([n]) => n));
  },

  situacao(s, inicio) {
    if (s.laserStatus && this.SITUACOES[s.laserStatus]) return s.laserStatus;
    if (!s.criadoEm || s.criadoEm < inicio) return 'cortado';
    return 'acortar';
  },

  rotulo(status) {
    return (this.SITUACOES[status] || this.SITUACOES.acortar).rotulo;
  },

  selo(status, prefixo = '') {
    const sit = this.SITUACOES[status] || this.SITUACOES.acortar;
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

  /* Decide o móvel de cada peça olhando TODAS as peças da Laser:
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
    const itens = await this.itens(null);
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
        const conta = { cortado: 0, acortar: 0, cortando: 0 };
        g.pecas.forEach((p) => conta[p._situacao]++);
        const ultimo = Math.max(...g.pecas.map((p) => p.criadoEm || 0));
        return { chave: g.chave, nome, pecas: g.pecas, conta, pedidos: g.pecas.filter((p) => p.laserSolicitacao).length, ultimo };
      })
      .sort((a, b) => (a.chave === this.SEM_MOVEL ? -1 : b.chave === this.SEM_MOVEL ? 1 : b.ultimo - a.ultimo));
  },

  // Serviços que aparecem no Laser (categoria marcada), da parte pedida
  async itens(parte) {
    const [servicos, nomes, inicio] = await Promise.all([DB.getAll('servicos'), this.nomesCategorias(parte), this.inicio()]);
    const lista = servicos
      .filter((s) => nomes.has(s.tipo))
      .map((s) => ({ ...s, _situacao: this.situacao(s, inicio) }))
      .sort((a, b) => (b.criadoEm || 0) - (a.criadoEm || 0));
    // o móvel de cada peça é decidido olhando todas juntas
    return this.resolverMoveis(lista);
  },
};

function abasLaserHtml(contas) {
  const st = LaserView;
  return `<div style="display:flex; gap:8px; margin-bottom:16px; flex-wrap:wrap">
    ${Object.entries(Laser.PARTES)
      .map(
        ([v, o]) =>
          `<button class="btn ${st.aba === v ? 'btn--primary' : 'btn--ghost'}" data-laser-aba="${v}">${o.rotulo}${
            contas && contas[v] != null ? ` <small>(${contas[v].feitas}/${contas[v].total} cortad${v === 'chapa' ? 'as' : 'os'})</small>` : ''
          }</button>`
      )
      .join('')}
  </div>`;
}

function ligarAbasLaser(view) {
  view.querySelectorAll('[data-laser-aba]').forEach((b) =>
    b.addEventListener('click', () => {
      LaserView.aba = b.dataset.laserAba;
      LaserView.editandoId = null;
      LaserView.editandoMovel = null;
      LaserView.materialPecaId = null;
      LaserView.filtroMaterial = '';
      LaserView.selecionados.clear();
      renderLaser(view);
    })
  );
}

async function renderLaser(view) {
  const st = LaserView;
  if (!Laser.PARTES[st.aba]) st.aba = 'chapa';
  const parte = st.aba;
  const P = Laser.PARTES[parte];
  const ehAdmin = Auth.isAdmin();
  const [todosLaser, nomesCats] = await Promise.all([Laser.itens(null), Laser.nomesCategorias(parte)]);
  const partes = await Laser.partesPorCategoria();
  const itens = todosLaser.filter((s) => partes.get(s.tipo) === parte);
  const contasPartes = {};
  Object.keys(Laser.PARTES).forEach((k) => {
    const l = todosLaser.filter((s) => partes.get(s.tipo) === k);
    contasPartes[k] = { total: l.length, feitas: l.filter((s) => s._situacao === 'cortado').length };
  });
  // materiais cadastrados (aba Materiais), pra escolher em cada peça
  st._materiais = await Materiais.listar();
  // resumo do material usado nesta parte
  const porMaterial = new Map();
  itens.forEach((s) => {
    const k = Laser.chaveMaterial(s);
    if (!porMaterial.has(k)) porMaterial.set(k, { chave: k, nome: s.materialNome || 'Sem material informado', total: 0, cortadas: 0 });
    const r = porMaterial.get(k);
    r.total++;
    if (s._situacao === 'cortado') r.cortadas++;
  });
  if (st.filtroMaterial && !porMaterial.has(st.filtroMaterial)) st.filtroMaterial = '';

  const conta = { acortar: 0, cortado: 0, cortando: 0, todos: itens.length };
  itens.forEach((s) => conta[s._situacao]++);
  const pedidos = itens.filter((s) => s.laserSolicitacao).length;

  const alvo = Analise.normaliza(st.filtroTexto);
  if (st.filtro === 'pedidos' && !ehAdmin) st.filtro = 'acortar';
  const funcsAt = (await DB.getAll('usuarios'))
    .filter((u) => u.tipo === 'funcionario' || u.tipo === 'admin')
    .sort((a, b) => (a.tipo === 'admin') - (b.tipo === 'admin') || (a.nome || '').localeCompare(b.nome || '', 'pt-BR'));
  const filtradosBase = itens.filter((s) => {
    if (st.filtro === 'pedidos') {
      if (!s.laserSolicitacao) return false;
    } else if (st.filtro !== 'todos' && s._situacao !== st.filtro) return false;
    if (st.filtroMaterial && Laser.chaveMaterial(s) !== st.filtroMaterial) return false;
    if (!alvo) return true;
    return (
      Analise.normaliza(s.materialNome).includes(alvo) ||
      Analise.normaliza(s.nome).includes(alvo) ||
      Analise.normaliza(s.tipo).includes(alvo) ||
      Analise.normaliza(s.funcionarioNome).includes(alvo) ||
      Analise.normaliza(s.observacoes).includes(alvo) ||
      Analise.normaliza(s.laserObs).includes(alvo)
    );
  });
  const filtrados = FiltrosLista.aplicar(filtradosBase, 'laser', {
    func: (s) => s.funcionarioId,
    data: (s) => s.dataFinal || s.criadoEm,
    nome: (s) => s.nome,
    aberto: (s) => s._situacao !== 'cortado',
    prazo: (s) => s.dataProgramada,
    prioridade: (a, b) => (b.criadoEm || 0) - (a.criadoEm || 0),
  });
  st._visiveis = filtrados.map((s) => s.id);

  // aproveitamento da chapa (plano de corte da laser) nos itens mostrados
  const comAprov = itens.filter((s) => s.percentualAproveitamento != null && !isNaN(Number(s.percentualAproveitamento)));
  const porCat = {};
  comAprov.forEach((s) => (porCat[s.tipo] = porCat[s.tipo] || []).push(Number(s.percentualAproveitamento)));
  const media = (l) => l.reduce((a, b) => a + b, 0) / l.length;
  view.innerHTML = `
    ${abasLaserHtml(contasPartes)}
    <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:12px; margin-bottom:16px; flex-wrap:wrap">
      <div>
        <h2 class="section-title" style="margin-bottom:2px">Laser — ${P.rotulo}</h2>
        <p class="section-sub" style="margin:0">${
          ehAdmin
            ? `${P.rotulo} de cada móvel cortad${parte === 'chapa' ? 'as' : 'os'} na máquina — a situação que você marca vale na hora`
            : `${P.rotulo} de cada móvel cortad${parte === 'chapa' ? 'as' : 'os'} na máquina — a mudança de situação vale depois que o Admin autorizar`
        }</p>
      </div>
      ${itens.length ? botaoSelecaoPdf(LaserView, 'btn-selecao-laser') : ''}
    </div>

    ${
      nomesCats.size === 0
        ? `<div class="card"><div class="empty">
            <div class="empty__title">Nenhuma categoria vai para ${P.rotulo} do Laser ainda</div>
            <div class="empty__sub">${
              ehAdmin
                ? `Em Admin → Categorias, edite a categoria e escolha "Vai para o Laser? → Sim — parte de ${P.rotulo.toUpperCase()}".`
                : 'O administrador ainda não escolheu as categorias.'
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
    ${
      itens.length
        ? `<div class="card marc-aprov">
            <div class="row__title" style="margin-bottom:6px">Material usado — ${P.rotulo.toLowerCase()}</div>
            <div class="marc-aprov__lista">
              ${Array.from(porMaterial.values())
                .sort((a, b) => (a.chave === '__sem__') - (b.chave === '__sem__') || b.total - a.total)
                .map(
                  (r) =>
                    `<button class="marc-aprov__item laser-mat ${st.filtroMaterial === r.chave ? 'laser-mat--on' : ''} ${r.chave === '__sem__' ? 'laser-mat--sem' : ''}" data-laser-filtro-mat="${escapeHtml(r.chave)}">${escapeHtml(r.nome)}: <b>${r.cortadas}/${r.total}</b> <small>cortad${parte === 'chapa' ? 'as' : 'os'}</small></button>`
                )
                .join('')}
              ${st.filtroMaterial ? '<button class="marc-aprov__item laser-mat" data-laser-filtro-mat="__todos__">✕ Mostrar todos os materiais</button>' : ''}
            </div>
            <div class="row__meta" style="margin-top:6px">Toque num material pra ver só as peças dele.</div>
          </div>`
        : ''
    }
    <div class="chips" style="margin-bottom:12px">
      ${[
        ['acortar', 'A cortar'],
        ['cortando', 'Em corte'],
        ['cortado', 'Cortado'],
        ['todos', 'Todos'],
      ]
        .map(([v, l]) => `<button class="chip ${st.filtro === v ? 'chip--on' : ''}" data-laser-filtro="${v}">${l} <small>${conta[v]}</small></button>`)
        .join('')}
      ${ehAdmin ? `<button class="chip chip--pendente ${st.filtro === 'pedidos' ? 'chip--on' : ''}" data-laser-filtro="pedidos">⚑ A autorizar <small>${pedidos}</small></button>` : ''}
    </div>
    <div class="chips" style="margin-bottom:12px">
      <button class="chip ${!st.porMovel ? 'chip--on' : ''}" data-laser-modo="pecas">Ver por peça</button>
      <button class="chip ${st.porMovel ? 'chip--on' : ''}" data-laser-modo="movel">Ver por móvel</button>
    </div>
    <div class="field" style="margin-bottom:14px">
      <input id="busca-laser" placeholder="Buscar por nome, categoria, funcionário ou observação…" value="${escapeHtml(st.filtroTexto)}" />
      ${FiltrosLista.html('laser', { ordens: ['recentes', 'antigos', 'az', 'za', 'prazo'], funcionarios: funcsAt, rotuloData: 'Data' })}
    </div>
    <div id="barra-laser"></div>
    <div id="lista-laser"></div>
    <div id="laser-previa"></div>
    <div class="row__meta" style="margin-top:10px">Categorias no Laser: ${Array.from(nomesCats).sort((a, b) => a.localeCompare(b, 'pt-BR')).map(escapeHtml).join(', ')}</div>`
    }
  `;

  ligarAbasLaser(view);
  if (nomesCats.size === 0) return;
  view.querySelectorAll('[data-laser-filtro-mat]').forEach((b) =>
    b.addEventListener('click', () => {
      const v = b.dataset.laserFiltroMat;
      st.filtroMaterial = v === '__todos__' || st.filtroMaterial === v ? '' : v;
      renderLaser(view);
    })
  );
  FiltrosLista.ligar(view, 'laser', () => renderLaser(view));

  const btnSel = document.getElementById('btn-selecao-laser');
  if (btnSel) {
    btnSel.addEventListener('click', () => {
      st.modoSelecao = !st.modoSelecao;
      if (!st.modoSelecao) st.selecionados.clear();
      renderLaser(view);
    });
  }
  view.querySelectorAll('[data-laser-modo]').forEach((b) =>
    b.addEventListener('click', () => {
      st.porMovel = b.dataset.laserModo === 'movel';
      st.editandoId = null;
      st.editandoMovel = null;
      renderLaser(view);
    })
  );
  view.querySelectorAll('[data-laser-filtro]').forEach((b) =>
    b.addEventListener('click', () => {
      st.filtro = b.dataset.laserFiltro;
      st.editandoId = null;
      renderLaser(view);
    })
  );
  const busca = document.getElementById('busca-laser');
  busca.addEventListener('input', () => {
    st.filtroTexto = busca.value;
    clearTimeout(LaserView._t);
    LaserView._t = setTimeout(() => {
      renderLaser(view).then(() => {
        const b = document.getElementById('busca-laser');
        if (b) {
          b.focus();
          b.setSelectionRange(b.value.length, b.value.length);
        }
      });
    }, 250);
  });

  renderBarraSelecaoPdf({
    contId: 'barra-laser',
    previaId: 'laser-previa',
    estado: LaserView,
    todosIds: itens.map((s) => s.id),
    singular: 'item',
    plural: 'itens',
    dica: 'Marque as caixinhas dos cadastros que vão no PDF.',
    montar: (ids) =>
      st.porMovel ? montarPdfLaserMoveis(itens.filter((s) => ids.includes(s.id))) : montarPdfLaser(itens.filter((s) => ids.includes(s.id))),
    aoMudar: () => renderLaser(view),
  });

  if (st.porMovel) desenharMoveisLaser(view, filtrados);
  else desenharListaLaser(view, filtrados);
}

function desenharListaLaser(view, filtrados) {
  const st = LaserView;
  const ehAdmin = Auth.isAdmin();
  const listaEl = document.getElementById('lista-laser');
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
      ${mostrados.map((s) => itemLaserHtml(s, ehAdmin)).join('')}
    </div>
    ${
      filtrados.length > LIMITE
        ? `<div class="row__meta" style="text-align:center; margin-top:10px">Mostrando ${LIMITE} de ${filtrados.length} — use a busca pra achar os outros.</div>`
        : `<div class="row__meta" style="text-align:center; margin-top:10px">${filtrados.length} item(ns)</div>`
    }
  `;

  ligarAcoesLaser(listaEl, view, filtrados, () => desenharListaLaser(view, filtrados));
}

// botões de cada peça (mudar situação, autorizar, editar, excluir…)
function ligarAcoesLaser(listaEl, view, filtrados, redesenhar) {
  const st = LaserView;
  ligarCaixinhasPdf(listaEl, LaserView, () => renderLaser(view));

  listaEl.querySelectorAll('[data-laser-material]').forEach((b) =>
    b.addEventListener('click', () => {
      st.materialPecaId = b.dataset.laserMaterial;
      st.editandoId = null;
      st.editandoMovel = null;
      redesenhar();
    })
  );
  const edMat = listaEl.querySelector('.laser-editor--mat');
  if (edMat) {
    edMat.querySelector('#laser-mat-cancelar').addEventListener('click', () => {
      st.materialPecaId = null;
      redesenhar();
    });
    const btnMat = edMat.querySelector('#laser-mat-salvar');
    if (btnMat)
      btnMat.addEventListener('click', async () => {
        const s = filtrados.find((x) => x.id === st.materialPecaId);
        if (!s) return;
        const { lista } = materiaisParaServico(s.tipo, st._materiais, Laser.materialReserva(st.aba));
        btnMat.disabled = true;
        btnMat.textContent = 'Salvando…';
        await salvarMaterialServicos([s.id], materialDoSeletor(edMat.querySelector('#laser-mat-sel').value, lista));
        st.materialPecaId = null;
        renderLaser(view);
      });
  }
  listaEl.querySelectorAll('[data-laser-alterar]').forEach((b) =>
    b.addEventListener('click', () => {
      const s = filtrados.find((x) => x.id === b.dataset.laserAlterar);
      if (!s) return;
      st.editandoId = s.id;
      st.materialPecaId = null;
      st.editor = { status: s._situacao, obs: s.laserObs || '' };
      st.editandoMovel = null;
      redesenhar();
    })
  );
  const editor = listaEl.querySelector('.laser-editor--peca');
  if (editor) {
    editor.querySelectorAll('[data-laser-st]').forEach((b) =>
      b.addEventListener('click', () => {
        st.editor.status = b.dataset.laserSt;
        editor.querySelectorAll('[data-laser-st]').forEach((x) => x.classList.toggle('chip--on', x === b));
      })
    );
    const obs = editor.querySelector('#laser-obs');
    obs.addEventListener('input', () => (st.editor.obs = obs.value));
    obs.focus();
    editor.querySelector('#laser-cancelar').addEventListener('click', () => {
      st.editandoId = null;
      redesenhar();
    });
    editor.querySelector('#laser-salvar').addEventListener('click', async () => {
      const btn = editor.querySelector('#laser-salvar');
      btn.disabled = true;
      btn.textContent = 'Salvando…';
      await salvarSituacaoLaser(st.editandoId, st.editor.status, st.editor.obs);
      st.editandoId = null;
      renderLaser(view);
    });
  }

  listaEl.querySelectorAll('[data-laser-autorizar]').forEach((b) =>
    b.addEventListener('click', async () => {
      b.disabled = true;
      await autorizarPedidoLaser(b.dataset.laserAutorizar, true);
      renderLaser(view);
    })
  );
  listaEl.querySelectorAll('[data-laser-recusar]').forEach((b) =>
    b.addEventListener('click', async () => {
      if (!confirm('Recusar esse pedido? A situação continua como está.')) return;
      await autorizarPedidoLaser(b.dataset.laserRecusar, false);
      renderLaser(view);
    })
  );
  listaEl.querySelectorAll('[data-laser-cancelar-pedido]').forEach((b) =>
    b.addEventListener('click', async () => {
      const s = await DB.get('servicos', b.dataset.laserCancelarPedido);
      if (!s) return;
      await DB.atualizarCampos('servicos', s.id, { laserSolicitacao: null });
      renderLaser(view);
    })
  );

  // Admin: editar e excluir usam as mesmas regras da aba Serviços
  listaEl.querySelectorAll('[data-laser-editar]').forEach((b) =>
    b.addEventListener('click', async () => {
      const registro = await DB.get('servicos', b.dataset.laserEditar);
      if (!registro) return;
      ServicosView.subView = 'form';
      ServicosView.formState = criarEstadoFormularioEdicao(registro);
      ServicosView.voltarPara = 'laser'; // ao salvar/cancelar, volta pra Laser
      activeTab = 'servicos';
      renderTabbar();
      renderView('servicos');
    })
  );
  listaEl.querySelectorAll('[data-laser-excluir]').forEach((b) =>
    b.addEventListener('click', async () => {
      const registro = await DB.get('servicos', b.dataset.laserExcluir);
      if (!registro) return;
      const avisoCorte = registro.tipo === 'CNP' ? ' O registro correspondente em Plano de Corte também será excluído.' : '';
      if (!confirm(`Excluir "${registro.nome}"?${avisoCorte} Ele sai de Serviços também. Essa ação não pode ser desfeita.`)) return;
      await DB.delete('servicos', registro.id);
      if (registro.tipo === 'CNP') await excluirPlanoCorteLigado(registro.id);
      renderLaser(view);
    })
  );
}

/* ---------------- VER POR MÓVEL ---------------- */

function desenharMoveisLaser(view, filtrados) {
  const st = LaserView;
  const ehAdmin = Auth.isAdmin();
  const listaEl = document.getElementById('lista-laser');
  if (!listaEl) return;
  const moveis = Laser.agruparPorMovel(filtrados);

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
      c.cortado ? `${c.cortado} cortada${c.cortado === 1 ? '' : 's'}` : '',
      c.cortando ? `${c.cortando} em corte` : '',
      c.acortar ? `${c.acortar} a cortar` : '',
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
        <div class="card laser-movel ${g.pedidos ? 'laser-item--pedido' : ''} ${g.chave === Laser.SEM_MOVEL ? 'laser-movel--sem' : ''}">
          <div style="display:flex; align-items:flex-start; gap:10px; flex-wrap:wrap">
            ${st.modoSelecao ? `<input type="checkbox" class="sel-pdf" data-laser-sel-movel="${escapeHtml(g.chave)}" ${todosMarcados ? 'checked' : ''} aria-label="Incluir este móvel no PDF" />` : ''}
            <div style="flex:1 1 240px; min-width:0">
              <div class="row__title" style="font-size:16px">${escapeHtml(g.nome || '(sem nome)')}</div>
              <div class="row__meta">${g.pecas.length} peça${g.pecas.length === 1 ? '' : 's'} · ${resumo(g.conta)}${
                g.pedidos ? ` · <b>${g.pedidos} pedido${g.pedidos === 1 ? '' : 's'} de mudança</b>` : ''
              }${(() => {
                const l = g.pecas.filter((p) => p.percentualAproveitamento != null).map((p) => Number(p.percentualAproveitamento));
                return l.length ? ` · 🪵 aproveitamento ${formatarPct(l.reduce((a, b) => a + b, 0) / l.length)}` : '';
              })()}${
                g.pecas.length ? ` · <b>${Math.round((g.conta.cortado / g.pecas.length) * 100)}% cortado</b>` : ''
              }</div>
              ${(() => {
                const mats = {};
                g.pecas.forEach((p) => (mats[p.materialNome || ''] = (mats[p.materialNome || ''] || 0) + 1));
                const lista = Object.entries(mats).sort((a, b) => b[1] - a[1]);
                return `<div class="row__meta">🔩 ${lista
                  .map(([n, q]) => (n ? `<b>${escapeHtml(n)}</b>` : '<span style="color:var(--warn-fg)">sem material</span>') + (lista.length > 1 ? ` (${q})` : ''))
                  .join(' · ')}</div>`;
              })()}
              ${
                g.chave === Laser.SEM_MOVEL
                  ? `<div class="row__meta" style="margin-top:4px">Peças só com o nome da parte (ASSENTO, ENCOSTO…) ou que servem pra mais de um móvel. ${
                      ehAdmin ? 'Use o Editar da peça e preencha o campo <b>Móvel</b> (ou corrija o nome).' : 'Peça ao Admin pra preencher o campo Móvel.'
                    }</div>`
                  : ''
              }
              <div style="display:flex; gap:4px; margin-top:8px; flex-wrap:wrap">
                ${g.conta.cortado ? Laser.selo('cortado', `${g.conta.cortado} · `) : ''}
                ${g.conta.acortar ? Laser.selo('acortar', `${g.conta.acortar} · `) : ''}
                ${g.conta.cortando ? Laser.selo('cortando', `${g.conta.cortando} · `) : ''}
              </div>
            </div>
            <div style="display:flex; gap:6px; flex:0 0 auto; flex-wrap:wrap">
              <button class="btn btn--ghost" data-laser-abrir="${escapeHtml(g.chave)}" style="padding:6px 12px; font-size:13px">${aberto ? 'Esconder peças' : 'Ver peças'}</button>
              ${editandoEste ? '' : `<button class="btn btn--primary" data-laser-todas="${escapeHtml(g.chave)}" style="padding:6px 12px; font-size:13px">${ehAdmin ? 'Mudar todas' : 'Pedir mudança de todas'}</button>`}
            </div>
          </div>
          ${
            editandoEste
              ? `<div class="laser-editor" id="laser-editor-movel">
                  <div class="row__meta" style="margin-bottom:6px">${
                    ehAdmin
                      ? `Nova situação para as <b>${g.pecas.length}</b> peça(s) mostradas deste móvel (vale na hora):`
                      : `Pedir mudança para as <b>${g.pecas.length}</b> peça(s) mostradas deste móvel (vale depois que o Admin autorizar):`
                  }</div>
                  <div class="chips" style="margin-bottom:10px">
                    <button class="chip ${st.editor && st.editor.status === '__manter__' ? 'chip--on' : ''}" data-laser-st-movel="__manter__">Manter a de cada peça</button>
                    ${Object.entries(Laser.SITUACOES)
                      .map(([v, o]) => `<button class="chip ${st.editor && st.editor.status === v ? 'chip--on' : ''}" data-laser-st-movel="${v}">${o.rotulo}</button>`)
                      .join('')}
                  </div>
                  ${(() => {
                    const { tipoMat, lista } = materiaisParaServico(g.pecas[0].tipo, st._materiais, Laser.materialReserva(st.aba));
                    return lista.length
                      ? `<div class="field" style="margin-bottom:10px">
                          <label>Material — ${escapeHtml(tipoMat)}: aplicar em todas as peças (vale na hora)</label>
                          ${seletorMaterialHtml('id="laser-mat-movel"', lista, null, null, 'Manter o material de cada peça')}
                        </div>`
                      : '';
                  })()}
                  <div class="field" style="margin-bottom:10px">
                    <input id="laser-obs-movel" value="${escapeHtml((st.editor && st.editor.obs) || '')}" placeholder="Observação do laser pra todas (opcional) — deixe vazio pra manter a de cada peça" />
                  </div>
                  <div style="display:flex; gap:8px">
                    <button class="btn btn--ghost" id="laser-cancelar-movel" style="padding:8px 14px; font-size:13px">Cancelar</button>
                    <button class="btn btn--primary" id="laser-salvar-movel" style="padding:8px 14px; font-size:13px">${ehAdmin ? 'Aplicar em todas' : 'Enviar pedido de todas'}</button>
                  </div>
                </div>`
              : ''
          }
          ${aberto ? `<div class="laser-pecas">${g.pecas.map((p) => itemLaserHtml(p, ehAdmin)).join('')}</div>` : ''}
        </div>`;
      })
      .join('')}
    <div class="row__meta" style="text-align:center; margin-top:10px">${
      moveis.length > LIMITE
        ? `Mostrando ${LIMITE} de ${moveis.length} móveis — use a busca pra achar os outros.`
        : `${moveis.length} móve${moveis.length === 1 ? 'l' : 'is'} · ${filtrados.length} peça(s)`
    }</div>
  `;

  const redesenhar = () => desenharMoveisLaser(view, filtrados);
  const acharMovel = (chave) => mostrados.find((g) => g.chave === chave);

  listaEl.querySelectorAll('[data-laser-abrir]').forEach((b) =>
    b.addEventListener('click', () => {
      const k = b.dataset.laserAbrir;
      if (st.abertos.has(k)) st.abertos.delete(k);
      else st.abertos.add(k);
      redesenhar();
    })
  );
  listaEl.querySelectorAll('[data-laser-sel-movel]').forEach((chk) => {
    chk.addEventListener('change', () => {
      const g = acharMovel(chk.dataset.laserSelMovel);
      if (!g) return;
      g.pecas.forEach((p) => (chk.checked ? st.selecionados.add(p.id) : st.selecionados.delete(p.id)));
      renderLaser(view);
    });
  });
  listaEl.querySelectorAll('[data-laser-todas]').forEach((b) =>
    b.addEventListener('click', () => {
      const g = acharMovel(b.dataset.laserTodas);
      if (!g) return;
      st.editandoMovel = g.chave;
      st.editandoId = null;
      // sugere a situação que a maioria das peças já tem
      st.editor = { status: '__manter__', obs: '' };
      st.materialPecaId = null;
      redesenhar();
    })
  );
  const ed = document.getElementById('laser-editor-movel');
  if (ed) {
    ed.querySelectorAll('[data-laser-st-movel]').forEach((b) =>
      b.addEventListener('click', () => {
        st.editor.status = b.dataset.laserStMovel;
        ed.querySelectorAll('[data-laser-st-movel]').forEach((x) => x.classList.toggle('chip--on', x === b));
      })
    );
    const obs = document.getElementById('laser-obs-movel');
    obs.addEventListener('input', () => (st.editor.obs = obs.value));
    document.getElementById('laser-cancelar-movel').addEventListener('click', () => {
      st.editandoMovel = null;
      redesenhar();
    });
    document.getElementById('laser-salvar-movel').addEventListener('click', async () => {
      const g = acharMovel(st.editandoMovel);
      if (!g) return;
      const btn = document.getElementById('laser-salvar-movel');
      btn.disabled = true;
      btn.textContent = 'Salvando…';
      const ids = g.pecas.map((p) => p.id);
      const selMat = document.getElementById('laser-mat-movel');
      if (selMat) {
        const { lista } = materiaisParaServico(g.pecas[0].tipo, st._materiais, Laser.materialReserva(st.aba));
        await salvarMaterialServicos(ids, materialDoSeletor(selMat.value, lista));
      }
      if (st.editor.status !== '__manter__' || (st.editor.obs || '').trim()) {
        await salvarSituacaoLaserVarias(ids, st.editor.status, st.editor.obs);
      }
      st.editandoMovel = null;
      renderLaser(view);
    });
  }

  ligarAcoesLaser(listaEl, view, filtrados, redesenhar);
}

// "Mudar todas": mesma regra de uma peça (Admin vale na hora; os outros viram pedido)
async function salvarSituacaoLaserVarias(ids, statusPedido, obs) {
  const obsLimpa = (obs || '').trim();
  const agora = Date.now();
  const registros = (await Promise.all(ids.map((id) => DB.get('servicos', id)))).filter(Boolean);
  const inicio = await Laser.inicio();
  registros.forEach((s) => {
    const obsFinal = obsLimpa || s.laserObs || '';
    // "Manter a de cada peça" (só muda a observação)
    const status = statusPedido === '__manter__' ? Laser.situacao(s, inicio) : statusPedido;
    if (Auth.isAdmin()) {
      s.laserStatus = status;
      s.laserObs = obsFinal;
      s.laserMarcadoPorId = Auth.current.id;
      s.laserMarcadoPorNome = Auth.current.nome;
      s.laserMarcadoEm = agora;
      s.laserSolicitacao = null;
    } else {
      s.laserSolicitacao = { status, obs: obsFinal, porId: Auth.current.id, porNome: Auth.current.nome, em: agora };
    }
  });
  if (registros.length) {
    // só os campos do laser — não regrava o serviço inteiro
    const CAMPOS = ['laserStatus', 'laserObs', 'laserMarcadoPorId', 'laserMarcadoPorNome', 'laserMarcadoEm', 'laserSolicitacao'];
    await DB.atualizarCamposEmLote(
      'servicos',
      registros.map((r) => ({ id: r.id, campos: Object.fromEntries(CAMPOS.filter((c) => r[c] !== undefined).map((c) => [c, r[c]])) }))
    );
  }
  if (typeof atualizarBadgesTabbar === 'function') atualizarBadgesTabbar();
}

function itemLaserHtml(s, ehAdmin) {
  const st = LaserView;
  const ped = s.laserSolicitacao;
  const editando = st.editandoId === s.id;
  const souEuQuePedi = ped && ped.porId === Auth.current.id;
  const { tipoMat, lista: listaMat } = materiaisParaServico(s.tipo, st._materiais, Laser.materialReserva(st.aba));
  const editandoMat = st.materialPecaId === s.id;

  return `
    <div class="row laser-item ${ped ? 'laser-item--pedido' : ''}" style="padding:14px 18px; flex-wrap:wrap; align-items:flex-start; gap:10px">
      ${caixinhaPdf(LaserView, s.id)}
      <div class="row__main" style="flex:1 1 260px; min-width:0">
        <div class="row__title">${escapeHtml(s.nome || '(sem nome)')}</div>
        ${linhaMaterialPeca(s, tipoMat)}
        ${
          editandoMat
            ? `<div class="laser-editor laser-editor--mat">
                <div class="row__meta" style="margin-bottom:6px">Material desta peça — ${escapeHtml(tipoMat || '')} (vale na hora):</div>
                ${
                  listaMat.length
                    ? seletorMaterialHtml('id="laser-mat-sel"', listaMat, s.materialId, s.materialNome)
                    : `<div class="row__meta">Nenhum material "${escapeHtml(tipoMat || '')}" cadastrado — cadastre na aba Materiais.</div>`
                }
                <div style="display:flex; gap:8px; margin-top:10px">
                  <button class="btn btn--ghost" id="laser-mat-cancelar" style="padding:8px 14px; font-size:13px">Cancelar</button>
                  ${listaMat.length ? '<button class="btn btn--primary" id="laser-mat-salvar" style="padding:8px 14px; font-size:13px">Salvar material</button>' : ''}
                </div>
              </div>`
            : ''
        }
        ${s.percentualAproveitamento != null ? `<div class="row__meta">🪵 Aproveitamento da chapa: <b>${formatarPct(Number(s.percentualAproveitamento))}</b> · desperdício ${formatarPct(100 - Number(s.percentualAproveitamento))}</div>` : ''}
        <div class="row__meta">${escapeHtml(s.tipo)} · ${escapeHtml(s.funcionarioNome || 'Disponível')} · ${Const.formatarData(s.criadoEm)}${
          s.dataFinal ? ` · concluído ${Const.formatarData(s.dataFinal)}` : ''
        }</div>
        ${s.observacoes ? `<div class="row__meta" style="font-style:italic">📝 ${escapeHtml(s.observacoes)}</div>` : ''}
        ${
          !LaserView.porMovel
            ? `<div class="row__meta">Móvel: ${s._movel ? `<b>${escapeHtml(s._movel)}</b>${s.movel ? ' (informado no lançamento)' : ''}` : '<b style="color:var(--warn-fg)">não identificado</b>'}</div>`
            : ''
        }
        <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-top:8px">
          ${Laser.selo(s._situacao, 'Laser: ')}
          ${
            s.laserMarcadoPorNome
              ? `<span class="row__meta">por ${escapeHtml(s.laserMarcadoPorNome)} em ${Const.formatarData(s.laserMarcadoEm)}</span>`
              : !s.laserStatus && s._situacao === 'cortado'
              ? '<span class="row__meta">cadastro anterior ao Laser</span>'
              : ''
          }
        </div>
        ${s.laserObs ? `<div class="row__meta" style="margin-top:4px">Obs. do laser: <b>${escapeHtml(s.laserObs)}</b></div>` : ''}
        ${
          ped
            ? `<div class="laser-pedido">
                <b>${escapeHtml(ped.porNome || 'Alguém')}</b> pediu: ${Laser.selo(ped.status)}${ped.obs ? ` — "${escapeHtml(ped.obs)}"` : ''}
                <span class="row__meta"> · ${Const.formatarData(ped.em)} · aguardando autorização do Admin</span>
                <div style="display:flex; gap:6px; margin-top:8px; flex-wrap:wrap">
                  ${
                    ehAdmin
                      ? `<button class="btn btn--primary" data-laser-autorizar="${s.id}" style="padding:6px 12px; font-size:13px">Autorizar</button>
                         <button class="btn btn--danger" data-laser-recusar="${s.id}" style="padding:6px 12px; font-size:13px">Recusar</button>`
                      : souEuQuePedi
                      ? `<button class="btn btn--ghost" data-laser-cancelar-pedido="${s.id}" style="padding:6px 12px; font-size:13px">Cancelar meu pedido</button>`
                      : ''
                  }
                </div>
              </div>`
            : ''
        }
        ${
          editando
            ? `<div class="laser-editor laser-editor--peca">
                <div class="row__meta" style="margin-bottom:6px">${ehAdmin ? 'Nova situação (vale na hora):' : 'Pedir mudança para (vale depois que o Admin autorizar):'}</div>
                <div class="chips" style="margin-bottom:10px">
                  ${Object.entries(Laser.SITUACOES)
                    .map(([v, o]) => `<button class="chip ${st.editor.status === v ? 'chip--on' : ''}" data-laser-st="${v}">${o.rotulo}</button>`)
                    .join('')}
                </div>
                <div class="field" style="margin-bottom:10px">
                  <input id="laser-obs" value="${escapeHtml(st.editor.obs)}" placeholder="Observação do laser (opcional) — ex: rebarba, cortar de novo" />
                </div>
                <div style="display:flex; gap:8px">
                  <button class="btn btn--ghost" id="laser-cancelar" style="padding:8px 14px; font-size:13px">Cancelar</button>
                  <button class="btn btn--primary" id="laser-salvar" style="padding:8px 14px; font-size:13px">${ehAdmin ? 'Salvar' : 'Enviar pedido'}</button>
                </div>
              </div>`
            : ''
        }
      </div>
      ${
        editando
          ? ''
          : `<div style="display:flex; gap:6px; flex:0 0 auto; flex-wrap:wrap">
              <button class="btn btn--ghost" data-laser-alterar="${s.id}" style="padding:6px 12px; font-size:13px">${ehAdmin ? 'Mudar situação' : ped && souEuQuePedi ? 'Refazer pedido' : 'Pedir mudança'}</button>
              ${editandoMat ? '' : `<button class="btn btn--ghost" data-laser-material="${s.id}" style="padding:6px 12px; font-size:13px">Material</button>`}
              ${
                ehAdmin
                  ? `<button class="btn btn--ghost" data-laser-editar="${s.id}" style="padding:6px 12px; font-size:13px">Editar</button>
                     <button class="btn btn--danger" data-laser-excluir="${s.id}" style="padding:6px 12px; font-size:13px">Excluir</button>`
                  : ''
              }
            </div>`
      }
    </div>`;
}

async function salvarSituacaoLaser(id, status, obs) {
  const s = await DB.get('servicos', id);
  if (!s) return;
  const agora = Date.now();
  if (Auth.isAdmin()) {
    s.laserStatus = status;
    s.laserObs = (obs || '').trim();
    s.laserMarcadoPorId = Auth.current.id;
    s.laserMarcadoPorNome = Auth.current.nome;
    s.laserMarcadoEm = agora;
    s.laserSolicitacao = null; // o que o Admin decide substitui pedido em aberto
  } else {
    s.laserSolicitacao = {
      status,
      obs: (obs || '').trim(),
      porId: Auth.current.id,
      porNome: Auth.current.nome,
      em: agora,
    };
  }
  const CAMPOS_AT = ['laserStatus', 'laserObs', 'laserMarcadoPorId', 'laserMarcadoPorNome', 'laserMarcadoEm', 'laserSolicitacao', 'laserAutorizadoPor', 'laserAutorizadoEm'];
  await DB.atualizarCampos('servicos', s.id, Object.fromEntries(CAMPOS_AT.filter((c) => s[c] !== undefined).map((c) => [c, s[c]])));
  if (typeof atualizarBadgesTabbar === 'function') atualizarBadgesTabbar();
}

async function autorizarPedidoLaser(id, autorizar) {
  const s = await DB.get('servicos', id);
  if (!s || !s.laserSolicitacao) return;
  const ped = s.laserSolicitacao;
  if (autorizar) {
    s.laserStatus = ped.status;
    s.laserObs = ped.obs || '';
    s.laserMarcadoPorId = ped.porId;
    s.laserMarcadoPorNome = ped.porNome;
    s.laserMarcadoEm = ped.em;
    s.laserAutorizadoPor = Auth.current.nome;
    s.laserAutorizadoEm = Date.now();
  }
  s.laserSolicitacao = null;
  const CAMPOS_AT = ['laserStatus', 'laserObs', 'laserMarcadoPorId', 'laserMarcadoPorNome', 'laserMarcadoEm', 'laserSolicitacao', 'laserAutorizadoPor', 'laserAutorizadoEm'];
  await DB.atualizarCampos('servicos', s.id, Object.fromEntries(CAMPOS_AT.filter((c) => s[c] !== undefined).map((c) => [c, s[c]])));
  if (typeof atualizarBadgesTabbar === 'function') atualizarBadgesTabbar();
}

/* ---------------- PDF DO LASER ---------------- */

async function montarPdfLaser(itens) {
  const ordenados = [...itens].sort(
    (a, b) => (a.tipo || '').localeCompare(b.tipo || '', 'pt-BR') || (a.criadoEm || 0) - (b.criadoEm || 0)
  );
  const conta = { cortado: 0, acortar: 0, cortando: 0 };
  ordenados.forEach((s) => conta[s._situacao]++);
  const linhas = [];
  let atual = null;
  ordenados.forEach((s) => {
    if (s.tipo !== atual) {
      atual = s.tipo;
      const n = ordenados.filter((x) => x.tipo === atual).length;
      linhas.push(`<tr class="rp-grupo"><td colspan="7">${escapeHtml(atual)} — ${n} item(ns)</td></tr>`);
    }
    linhas.push(`<tr>
      <td class="nowrap">${formatarDataCurta(s.criadoEm)}</td>
      <td>${escapeHtml(s.nome || '')}${s.observacoes ? `<div class="rp-fraco">${escapeHtml(s.observacoes)}</div>` : ''}</td>
      <td>${s._movel ? escapeHtml(s._movel) : '<span class="rp-fraco">—</span>'}</td>
      <td class="nowrap">${escapeHtml(nomeCurtoRelatorio(s.funcionarioNome))}</td>
      <td class="nowrap">${Laser.rotulo(s._situacao)}</td>
      <td>${escapeHtml(s.materialNome || '')}</td>
      <td>${escapeHtml(s.laserObs || '')}</td>
    </tr>`);
  });
  const blocos = [
    {
      tipo: 'titulo',
      html: `<h2 class="rp-secao">Corte a Laser — ${Laser.PARTES[LaserView.aba].rotulo}</h2><p class="rp-nota">${ordenados.length} item(ns) · ${conta.cortado} cortada(s) · ${conta.cortando} em corte · ${conta.acortar} a cortar</p>`,
    },
    {
      tipo: 'tabela',
      cabecalho: '<tr><th>Data</th><th>Cadastro</th><th>Móvel</th><th>Funcionário</th><th>Situação</th><th>Material</th><th>Obs. do laser</th></tr>',
      linhas,
      classe: 'rp-tabela--lista',
    },
  ];
  return montarPdfPadrao(blocos, {
    titulo: `Laser — ${Laser.PARTES[LaserView.aba].rotulo}`,
    periodo: `${ordenados.length} ${ordenados.length === 1 ? 'item' : 'itens'}`,
    detalhes: 'Situação das peças no laser',
  });
}

/* PDF separado por móvel: cada móvel começa numa folha nova */
async function montarPdfLaserMoveis(itens) {
  const moveis = Laser.agruparPorMovel(itens).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { numeric: true }));
  const blocos = [];
  moveis.forEach((g, i) => {
    if (i > 0) blocos.push({ tipo: 'quebra' });
    const c = g.conta;
    blocos.push({
      tipo: 'titulo',
      html: `<h2 class="rp-secao">${escapeHtml(g.nome)}</h2><p class="rp-nota">${g.pecas.length} peça(s) · ${c.cortado} cortada(s) · ${c.cortando} em corte · ${c.acortar} a cortar</p>`,
    });
    const pecas = [...g.pecas].sort((a, b) => (a.nome || '').localeCompare(b.nome || '', 'pt-BR', { numeric: true }));
    blocos.push({
      tipo: 'tabela',
      cabecalho: '<tr><th>Peça</th><th>Categoria</th><th>Data</th><th>Funcionário</th><th>Situação</th><th>Material</th><th>Obs. do laser</th></tr>',
      linhas: pecas.map(
        (s) => `<tr>
          <td>${escapeHtml(s.nome || '')}${s.observacoes ? `<div class="rp-fraco">${escapeHtml(s.observacoes)}</div>` : ''}</td>
          <td class="nowrap">${escapeHtml(s.tipo || '')}</td>
          <td class="nowrap">${formatarDataCurta(s.criadoEm)}</td>
          <td class="nowrap">${escapeHtml(nomeCurtoRelatorio(s.funcionarioNome))}</td>
          <td class="nowrap">${Laser.rotulo(s._situacao)}</td>
          <td>${escapeHtml(s.materialNome || '')}</td>
          <td>${escapeHtml(s.laserObs || '')}</td>
        </tr>`
      ),
      classe: 'rp-tabela--lista',
    });
  });
  return montarPdfPadrao(blocos, {
    titulo: moveis.length === 1 ? `Laser ${Laser.PARTES[LaserView.aba].rotulo} — ${moveis[0].nome}` : `Laser ${Laser.PARTES[LaserView.aba].rotulo} — por móvel`,
    periodo: `${moveis.length} móve${moveis.length === 1 ? 'l' : 'is'} · ${itens.length} peça${itens.length === 1 ? '' : 's'}`,
    detalhes: 'Peças de cada móvel e a situação no laser',
  });
}

window.Laser = Laser;
