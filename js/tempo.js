/* =========================================================
   tempo.js — tempo gasto em cada serviço (só o Admin vê)

   Regras combinadas:
   - Conta só dias úteis (segunda a sexta, sem feriados), das 7:00 às
     17:00. Almoço: desconta 1 hora no dia em que o serviço ficou aberto
     o período inteiro das 11h às 14h (aí o almoço caiu no meio, seja a
     hora que for). 1 dia de trabalho = 9 horas.
   - Serviço: do "Começar" (iniciadoEm) até o "Marcar como concluído"
     (concluidoInformadoEm). Plano de Corte: do "Iniciar corte" até o
     "Finalizar corte".
   - Menos de 10 minutos entre começar e terminar = só um registro
     rápido, não conta.
   - Só mede quando os dois horários são reais (tem hora). Data sem hora
     (serviço antigo, importado, lançado já pronto) = "tempo não medido".
   - Serviços da MESMA pessoa abertos ao mesmo tempo dividem as horas.
   - O Admin pode marcar "Desconsiderar este tempo".
   - Médias usam a MEDIANA e só aparecem com 3 ou mais serviços medidos.
   ========================================================= */

const HORA = 60 * 60 * 1000;
const SEG_DIA_UTIL = 9 * 3600;
const MIN_AMOSTRAS = 3;

const Tempo = {
  _feriados: null,
  _cache: null,
  _cacheEm: 0,

  /* ---------------- FERIADOS ---------------- */

  pascoa(ano) {
    // algoritmo de Meeus/Jones/Butcher
    const a = ano % 19;
    const b = Math.floor(ano / 100);
    const c = ano % 100;
    const d = Math.floor(b / 4);
    const e = b % 4;
    const f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4);
    const k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const mes = Math.floor((h + l - 7 * m + 114) / 31);
    const dia = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(ano, mes - 1, dia);
  },

  chaveDia(d) {
    const x = new Date(d);
    return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
  },

  feriadosNacionais(ano) {
    const fixos = [
      ['01-01', 'Confraternização Universal'],
      ['04-21', 'Tiradentes'],
      ['05-01', 'Dia do Trabalho'],
      ['09-07', 'Independência do Brasil'],
      ['10-12', 'Nossa Senhora Aparecida'],
      ['11-02', 'Finados'],
      ['11-15', 'Proclamação da República'],
      ['11-20', 'Dia da Consciência Negra'],
      ['12-25', 'Natal'],
    ].map(([md, nome]) => ({ data: `${ano}-${md}`, nome }));
    const p = this.pascoa(ano);
    const soma = (dias) => this.chaveDia(new Date(p.getFullYear(), p.getMonth(), p.getDate() + dias));
    return [
      ...fixos,
      { data: soma(-48), nome: 'Carnaval (segunda)' },
      { data: soma(-47), nome: 'Carnaval (terça)' },
      { data: soma(-2), nome: 'Sexta-feira Santa' },
      { data: soma(60), nome: 'Corpus Christi' },
    ];
  },

  async feriados() {
    let lista = await DB.getAll('feriados');
    const semeado = await DB.get('config', 'feriados_semeados');
    if (!semeado) {
      const novos = [2026, 2027].flatMap((a) => this.feriadosNacionais(a)).map((f) => ({ id: f.data, ...f, nacional: true }));
      const existentes = new Set(lista.map((f) => f.data));
      const faltam = novos.filter((f) => !existentes.has(f.data));
      if (faltam.length) await DB.putMany('feriados', faltam);
      await DB.put('config', { chave: 'feriados_semeados', valor: Date.now() });
      lista = await DB.getAll('feriados');
    }
    this._feriados = new Set(lista.map((f) => f.data));
    return lista.sort((a, b) => a.data.localeCompare(b.data));
  },

  async conjuntoFeriados() {
    if (!this._feriados) await this.feriados();
    return this._feriados;
  },

  ehDiaUtil(d, feriados) {
    const x = new Date(d);
    const dow = x.getDay();
    if (dow === 0 || dow === 6) return false;
    return !feriados.has(this.chaveDia(x));
  },

  /* ---------------- HORÁRIO ÚTIL ---------------- */

  // tem hora de verdade? (data sem hora fica gravada à meia-noite)
  temHora(ts) {
    if (!ts) return false;
    const d = new Date(ts);
    return !(d.getHours() === 0 && d.getMinutes() === 0 && d.getSeconds() === 0 && d.getMilliseconds() === 0);
  },

  // segundos de trabalho entre dois instantes (7h–17h, dias úteis, almoço)
  segundosUteis(ini, fim, feriados, comAlmoco = true) {
    if (!(fim > ini)) return 0;
    let total = 0;
    const d = new Date(ini);
    d.setHours(0, 0, 0, 0);
    for (let guarda = 0; d.getTime() < fim && guarda < 800; guarda++) {
      const dia = d.getTime();
      if (this.ehDiaUtil(dia, feriados)) {
        const a = Math.max(ini, dia + 7 * HORA);
        const b = Math.min(fim, dia + 17 * HORA);
        if (b > a) {
          let ms = b - a;
          if (comAlmoco && ini <= dia + 11 * HORA && fim >= dia + 14 * HORA) ms -= HORA;
          total += Math.max(0, ms);
        }
      }
      d.setDate(d.getDate() + 1);
    }
    return total / 1000;
  },

  /* ---------------- TIPO DE MÓVEL ---------------- */

  TIPOS: ['Mesa', 'Cadeira', 'Poltrona Jantar', 'Poltrona Sala', 'Módulo', 'Sofá', 'Espreguiçadeira', 'Banqueta', 'Puff', 'Namoradeira', 'Ombrelone', 'Chaise', 'Outros'],

  tipoMovel(nome, movel) {
    const ps = new Set(
      String(`${movel || ''} ${nome || ''}`)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toUpperCase()
        .split(/[^A-Z]+/)
        .filter(Boolean)
    );
    if (ps.has('POLTRONA')) return ps.has('JANTAR') ? 'Poltrona Jantar' : 'Poltrona Sala';
    if (ps.has('MODULO') || ps.has('MODULOS')) return 'Módulo';
    if (ps.has('SOFA') || ps.has('SOFAS')) return 'Sofá';
    if (ps.has('ESPREGUICADEIRA')) return 'Espreguiçadeira';
    if (ps.has('NAMORADEIRA')) return 'Namoradeira';
    if (ps.has('CADEIRA') || ps.has('CADEIRAS')) return 'Cadeira';
    if (ps.has('BANQUETA') || ps.has('BANQUETAS')) return 'Banqueta';
    if (ps.has('MESA') || ps.has('MESAS')) return 'Mesa';
    if (ps.has('PUFF') || ps.has('PUFE') || ps.has('PUFES')) return 'Puff';
    if (ps.has('OMBRELONE')) return 'Ombrelone';
    if (ps.has('CHAISE')) return 'Chaise';
    return 'Outros';
  },

  /* ---------------- CÁLCULO DE TODOS ---------------- */

  intervalos(servicos, cortes) {
    const lista = [];
    servicos.forEach((s) => {
      const fim = this.temHora(s.concluidoInformadoEm) ? s.concluidoInformadoEm : this.temHora(s.dataFinal) ? s.dataFinal : null;
      lista.push({
        id: s.id,
        origem: 'servico',
        func: s.funcionarioId || null,
        funcNome: s.funcionarioNome || '',
        ini: s.iniciadoEm || null,
        fim,
        concluido: !!(s.dataFinal || s.concluidoInformadoEm),
        dataFinal: s.dataFinal || s.concluidoInformadoEm || null,
        categoria: s.tipo,
        nome: s.nome,
        tipoMovel: this.tipoMovel(s.nome, s.movel),
        desconsiderado: !!s.tempoDesconsiderado,
        aprovado: s.aprovado === 'aprovado',
      });
    });
    cortes.forEach((p) => {
      lista.push({
        id: p.id,
        origem: 'corte',
        func: p.funcionarioCorteId || null,
        funcNome: p.funcionarioCorteNome || '',
        ini: p.dataInicioCorte || null,
        fim: this.temHora(p.dataFinalCorte) ? p.dataFinalCorte : null,
        concluido: !!p.dataFinalCorte,
        dataFinal: p.dataFinalCorte || null,
        categoria: CATEGORIA_ABA_CORTE,
        nome: p.nomeProduto,
        tipoMovel: this.tipoMovel(p.nomeProduto),
        desconsiderado: !!p.tempoDesconsiderado,
        aprovado: p.aprovado === 'aprovado',
      });
    });
    return lista;
  },

  /* Resultado por id:
     { status: 'medido'|'andamento'|'sem-hora'|'rapido'|'desconsiderado'|'invalido',
       seg (dividido entre simultâneos), segBruto, simultaneos } */
  async calcular(forcar = false) {
    if (!forcar && this._cache && Date.now() - this._cacheEm < 4000) return this._cache;
    const [servicos, cortes, feriados] = await Promise.all([DB.getAll('servicos'), DB.getAll('plano_corte'), this.conjuntoFeriados()]);
    const agora = Date.now();
    const lista = this.intervalos(servicos, cortes);
    const res = new Map();

    lista.forEach((it) => {
      let status;
      if (!it.concluido) status = it.ini ? 'andamento' : 'nao-iniciado';
      else if (it.desconsiderado) status = 'desconsiderado';
      else if (!this.temHora(it.ini) || !it.fim) status = 'sem-hora';
      else if (it.fim < it.ini) status = 'invalido';
      else if (it.fim - it.ini < 10 * 60 * 1000) status = 'rapido';
      else status = 'medido';
      it.status = status;
      res.set(it.id, { ...it, status, seg: null, segBruto: null, simultaneos: 0 });
    });

    // divisão entre serviços simultâneos, pessoa por pessoa. Entram os
    // medidos e os em andamento (até agora), porque os dois ocupam a pessoa.
    const porFunc = new Map();
    lista.forEach((it) => {
      if (!it.func) return;
      if (it.status !== 'medido' && !(it.status === 'andamento' && this.temHora(it.ini))) return;
      const fim = it.status === 'andamento' ? agora : it.fim;
      if (!porFunc.has(it.func)) porFunc.set(it.func, []);
      porFunc.get(it.func).push({ id: it.id, ini: it.ini, fim, medido: it.status === 'medido' });
    });

    porFunc.forEach((ints) => {
      const pontos = Array.from(new Set(ints.flatMap((x) => [x.ini, x.fim]))).sort((a, b) => a - b);
      const cheio = new Map(); // id → segundos úteis dos trechos (sem almoço)
      const dividido = new Map();
      const maxSimult = new Map();
      for (let i = 0; i < pontos.length - 1; i++) {
        const a = pontos[i];
        const b = pontos[i + 1];
        const ativos = ints.filter((x) => x.ini <= a && x.fim >= b);
        if (!ativos.length) continue;
        const u = this.segundosUteis(a, b, feriados, false);
        if (!u) continue;
        ativos.forEach((x) => {
          cheio.set(x.id, (cheio.get(x.id) || 0) + u);
          dividido.set(x.id, (dividido.get(x.id) || 0) + u / ativos.length);
          maxSimult.set(x.id, Math.max(maxSimult.get(x.id) || 0, ativos.length));
        });
      }
      ints.forEach((x) => {
        if (!x.medido) return;
        const r = res.get(x.id);
        const bruto = this.segundosUteis(x.ini, x.fim, feriados, true);
        const fator = cheio.get(x.id) ? dividido.get(x.id) / cheio.get(x.id) : 1;
        r.segBruto = bruto;
        r.seg = bruto * fator;
        r.simultaneos = Math.max(0, (maxSimult.get(x.id) || 1) - 1);
      });
    });

    // medido sem funcionário (raro) — sem divisão
    res.forEach((r) => {
      if (r.status === 'medido' && r.seg == null) {
        r.segBruto = this.segundosUteis(r.ini, r.fim, feriados, true);
        r.seg = r.segBruto;
      }
    });

    this._cache = res;
    this._cacheEm = Date.now();
    return res;
  },

  limparCache() {
    this._cache = null;
  },

  /* ---------------- ESTATÍSTICAS ---------------- */

  mediana(arr) {
    if (!arr.length) return null;
    const s = [...arr].sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  },

  // { [func]: { tipos: {tipo: [seg]}, cruz: {"tipo|cat": [seg]}, cats: {cat:[seg]} } }
  async amostras(inicio, fim) {
    const res = await this.calcular();
    const out = {};
    res.forEach((r) => {
      if (r.status !== 'medido' || !r.func) return;
      if (inicio != null && r.dataFinal < inicio) return;
      if (fim != null && r.dataFinal >= fim) return;
      const f = (out[r.func] = out[r.func] || { tipos: {}, cruz: {}, cats: {}, todos: [] });
      (f.tipos[r.tipoMovel] = f.tipos[r.tipoMovel] || []).push(r.seg);
      const k = `${r.tipoMovel}|${r.categoria}`;
      (f.cruz[k] = f.cruz[k] || []).push(r.seg);
      (f.cats[r.categoria] = f.cats[r.categoria] || []).push(r.seg);
      f.todos.push(r.seg);
    });
    return out;
  },

  // serviços em andamento agora, por pessoa
  async cargaAtual() {
    const res = await this.calcular();
    const carga = {};
    res.forEach((r) => {
      if (r.status === 'andamento' && r.func) carga[r.func] = (carga[r.func] || 0) + 1;
    });
    return carga;
  },

  // projetos concluídos por dia útil (sem fim de semana, feriado e férias)
  async projetosPorDia(funcionarioId, inicio, fim, itensDoFunc) {
    const feriados = await this.conjuntoFeriados();
    const ferias = await Metrics.feriasDoFuncionario(funcionarioId);
    const limite = Math.min(fim, Date.now());
    let dias = 0;
    const d = new Date(inicio);
    d.setHours(0, 0, 0, 0);
    for (let g = 0; d.getTime() < limite && g < 800; g++) {
      const t = d.getTime();
      const deFerias = ferias.some((f) => f.dataInicio <= t + 12 * HORA && f.dataFim >= t);
      if (this.ehDiaUtil(t, feriados) && !deFerias) dias++;
      d.setDate(d.getDate() + 1);
    }
    const projetos = itensDoFunc.filter((i) => i.dataFinal >= inicio && i.dataFinal < fim).length;
    return { projetos, dias, porDia: dias ? projetos / dias : null };
  },

  /* ---------------- TEXTO ---------------- */

  hms(seg) {
    if (seg == null) return '—';
    const s = Math.round(seg);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const r = s % 60;
    return `${h}h ${String(m).padStart(2, '0')}min ${String(r).padStart(2, '0')}s`;
  },

  dias(seg) {
    if (seg == null) return '—';
    const d = seg / SEG_DIA_UTIL;
    return `${d.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} dia${d >= 1.95 ? 's' : ''}`;
  },

  curto(seg) {
    if (seg == null) return '—';
    const s = Math.round(seg);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return h ? `${h}h${String(m).padStart(2, '0')}` : `${m}min`;
  },

  MOTIVOS: {
    'sem-hora': 'tempo não medido — sem hora de início ou de fim (lançado já pronto, antigo ou com data sem hora)',
    rapido: 'tempo não medido — menos de 10 min entre começar e terminar (registro rápido)',
    desconsiderado: 'tempo desconsiderado pelo Admin',
    invalido: 'tempo não medido — o fim ficou antes do início',
  },

  // linha pra mostrar nas listas de Serviços e Corte (só Admin)
  linhaLista(r) {
    if (!r) return '';
    if (r.status === 'medido') {
      return `<div class="row__meta tempo-linha">⏱ Tempo: <b>${this.hms(r.seg)}</b> · ${this.dias(r.seg)}${
        r.simultaneos ? ` <span class="tempo-dividido">(dividido: tinha mais ${r.simultaneos} serviço(s) aberto(s) junto · sem dividir ${this.curto(r.segBruto)})</span>` : ''
      }</div>`;
    }
    if (r.status === 'andamento' && this.temHora(r.ini)) {
      return `<div class="row__meta tempo-linha">⏱ Começou ${Const.formatarDataHora(r.ini)}</div>`;
    }
    if (this.MOTIVOS[r.status]) return `<div class="row__meta tempo-linha tempo-linha--nao">⏱ ${this.MOTIVOS[r.status]}</div>`;
    return '';
  },

  /* ---------------- DATA + HORA NOS FORMULÁRIOS ---------------- */

  paraInputs(ts) {
    if (!ts) return { data: '', hora: '' };
    const d = new Date(ts);
    const data = this.chaveDia(d);
    const hora = this.temHora(ts) ? `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` : '';
    return { data, hora };
  },

  // monta o instante a partir de data + hora; se nada mudou, devolve o
  // original (mantém os segundos exatos do clique no botão)
  deInputs(data, hora, original) {
    if (!data) return null;
    const antes = this.paraInputs(original);
    if (original && antes.data === data && antes.hora === (hora || '')) return original;
    const [a, m, d] = data.split('-').map(Number);
    const [h, mi] = (hora || '00:00').split(':').map(Number);
    return new Date(a, m - 1, d, h || 0, mi || 0, 0, 0).getTime();
  },
};

/* ---------------- ADMIN: FERIADOS ---------------- */

async function renderCartaoFeriados(cont) {
  const lista = await Tempo.feriados();
  const ano = new Date().getFullYear();
  const doAno = lista.filter((f) => f.data.startsWith(String(ano)) || f.data.startsWith(String(ano + 1)));
  cont.innerHTML = `
    <div class="card" style="margin-top:16px">
      <h3 class="section-title" style="font-size:16px">📅 Feriados</h3>
      <p class="section-sub">Dias que não contam no tempo gasto nem nos projetos por dia. Os nacionais já vêm cadastrados; acrescente os de Cláudio e de Minas.</p>
      <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:flex-end; margin-bottom:12px">
        <div class="field" style="margin:0"><label for="f-feriado-data">Data</label><input id="f-feriado-data" type="date" /></div>
        <div class="field" style="margin:0; flex:1; min-width:180px"><label for="f-feriado-nome">Nome</label><input id="f-feriado-nome" placeholder="Ex: Aniversário de Cláudio" /></div>
        <button class="btn btn--primary" id="btn-add-feriado">Adicionar</button>
      </div>
      <div class="feriados-lista">
        ${doAno
          .map(
            (f) => `<div class="feriado-item">
              <span><b>${f.data.split('-').reverse().join('/')}</b> · ${escapeHtml(f.nome || '')}${f.nacional ? '' : ' <span class="badge badge--brand">local</span>'}</span>
              <button class="btn btn--danger" data-del-feriado="${f.id}" style="padding:4px 10px; font-size:12px">Remover</button>
            </div>`
          )
          .join('')}
      </div>
      <div class="row__meta" style="margin-top:8px">Mostrando ${ano} e ${ano + 1}.</div>
    </div>`;
  document.getElementById('btn-add-feriado').addEventListener('click', async () => {
    const data = document.getElementById('f-feriado-data').value;
    const nome = document.getElementById('f-feriado-nome').value.trim();
    if (!data) return alert('Escolha a data do feriado.');
    await DB.put('feriados', { id: data, data, nome: nome || 'Feriado', nacional: false });
    Tempo._feriados = null;
    Tempo.limparCache();
    renderCartaoFeriados(cont);
  });
  cont.querySelectorAll('[data-del-feriado]').forEach((b) =>
    b.addEventListener('click', async () => {
      if (!confirm('Remover esse feriado? Esse dia volta a contar como dia de trabalho.')) return;
      await DB.delete('feriados', b.dataset.delFeriado);
      Tempo._feriados = null;
      Tempo.limparCache();
      renderCartaoFeriados(cont);
    })
  );
}

/* ---------------- RAIO-X (só Admin) ---------------- */

function refMesAno(periodo) {
  const ref = periodo.fim != null ? Math.min(periodo.fim - 1, Date.now()) : Date.now();
  const d = new Date(ref);
  return {
    mesIni: new Date(d.getFullYear(), d.getMonth(), 1).getTime(),
    mesFim: new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime(),
    anoIni: new Date(d.getFullYear(), 0, 1).getTime(),
    anoFim: new Date(d.getFullYear() + 1, 0, 1).getTime(),
    rotMes: `${MESES_PT[d.getMonth()]} de ${d.getFullYear()}`,
    rotAno: String(d.getFullYear()),
  };
}

function celulaMediana(lista) {
  if (!lista || !lista.length) return '<span class="tempo-vazio">—</span>';
  if (lista.length < MIN_AMOSTRAS) return `<span class="tempo-vazio">poucos dados (${lista.length})</span>`;
  const m = Tempo.mediana(lista);
  return `<b>${Tempo.hms(m)}</b><div class="tempo-sub">${Tempo.dias(m)} · ${lista.length} serviço(s)</div>`;
}

async function renderRaioXTempo(el, funcionarioId, periodo, itensTodos) {
  el.innerHTML = `<div class="card" style="margin-top:16px"><div class="wip">${ICONS.wip}<b>Calculando tempos…</b></div></div>`;
  const r = refMesAno(periodo);
  const itensFunc = itensTodos.filter((i) => i.funcionarioId === funcionarioId);
  const [mes, ano, amostras, carga] = await Promise.all([
    Tempo.projetosPorDia(funcionarioId, r.mesIni, r.mesFim, itensFunc),
    Tempo.projetosPorDia(funcionarioId, r.anoIni, r.anoFim, itensFunc),
    Tempo.amostras(periodo.inicio, periodo.fim),
    Tempo.cargaAtual(),
  ]);
  const a = amostras[funcionarioId] || { tipos: {}, cruz: {}, cats: {}, todos: [] };
  const tipos = Tempo.TIPOS.filter((t) => a.tipos[t]);
  const combos = Object.keys(a.cruz).sort((x, y) => x.localeCompare(y, 'pt-BR'));
  const porDia = (x) => (x.porDia == null ? '—' : x.porDia.toLocaleString('pt-BR', { maximumFractionDigits: 1 }));

  el.innerHTML = `
    <div class="card" style="margin-top:16px">
      <h3 class="section-title" style="font-size:16px">Produtividade e tempo gasto <span class="badge badge--brand">só Admin</span></h3>
      <p class="section-sub">Projetos por dia útil (sem fim de semana, feriado e férias) e quanto tempo leva cada tipo de móvel</p>
      <div class="stat-grid">
        <div class="card"><div class="stat"><div class="stat__value">${porDia(mes)}</div><div class="stat__label">projetos/dia · ${escapeHtml(r.rotMes)}<br><small>${mes.projetos} em ${mes.dias} dia(s) úteis</small></div></div></div>
        <div class="card"><div class="stat"><div class="stat__value">${porDia(ano)}</div><div class="stat__label">projetos/dia · ${escapeHtml(r.rotAno)}<br><small>${ano.projetos} em ${ano.dias} dia(s) úteis</small></div></div></div>
        <div class="card"><div class="stat"><div class="stat__value">${carga[funcionarioId] || 0}</div><div class="stat__label">serviço(s) em andamento agora</div></div></div>
        <div class="card"><div class="stat"><div class="stat__value">${a.todos.length ? Tempo.curto(Tempo.mediana(a.todos)) : '—'}</div><div class="stat__label">tempo típico por serviço<br><small>${a.todos.length} medido(s) no período</small></div></div></div>
      </div>

      <h4 class="rx-subtitulo">Tempo por tipo de móvel · ${escapeHtml(periodo.rotulo)}</h4>
      ${
        tipos.length
          ? `<div class="tabela-wrap"><table class="tabela">
              <thead><tr><th>Tipo de móvel</th><th>Tempo típico (mediana)</th></tr></thead>
              <tbody>${tipos.map((t) => `<tr><td>${escapeHtml(t)}</td><td>${celulaMediana(a.tipos[t])}</td></tr>`).join('')}</tbody>
            </table></div>`
          : '<div class="row__meta">Nenhum serviço com tempo medido nesse período ainda.</div>'
      }

      ${
        combos.length
          ? `<h4 class="rx-subtitulo">Tipo de móvel × categoria</h4>
            <div class="tabela-wrap"><table class="tabela">
              <thead><tr><th>Tipo de móvel</th><th>Categoria</th><th>Tempo típico (mediana)</th></tr></thead>
              <tbody>${combos
                .map((k) => {
                  const [t, c] = k.split('|');
                  return `<tr><td>${escapeHtml(t)}</td><td>${escapeHtml(c)}</td><td>${celulaMediana(a.cruz[k])}</td></tr>`;
                })
                .join('')}</tbody>
            </table></div>`
          : ''
      }
      <div class="row__meta" style="margin-top:10px">⏱ Medido do "Começar" ao "Concluir" (ou "Iniciar/Finalizar corte"), das 7h às 17h em dias úteis, sem almoço. Usa a mediana (o valor do meio, que não é puxado por esquecimentos) e só mostra com ${MIN_AMOSTRAS} ou mais serviços. Serviços abertos ao mesmo tempo dividem as horas. 1 dia = 9 h.</div>
    </div>`;
}

async function renderRaioXTempoEquipe(el, funcionarios, periodo, itensTodos) {
  el.innerHTML = `<div class="card" style="margin-top:16px"><div class="wip">${ICONS.wip}<b>Calculando tempos…</b></div></div>`;
  const r = refMesAno(periodo);
  const [amostras, carga] = await Promise.all([Tempo.amostras(periodo.inicio, periodo.fim), Tempo.cargaAtual()]);
  const linhas = [];
  for (const f of funcionarios) {
    const itensFunc = itensTodos.filter((i) => i.funcionarioId === f.id);
    const mes = await Tempo.projetosPorDia(f.id, r.mesIni, r.mesFim, itensFunc);
    const ano = await Tempo.projetosPorDia(f.id, r.anoIni, r.anoFim, itensFunc);
    linhas.push({ f, mes, ano, a: amostras[f.id] || { tipos: {}, cruz: {}, cats: {}, todos: [] } });
  }
  const tipos = Tempo.TIPOS.filter((t) => linhas.some((l) => l.a.tipos[t]));
  const cats = Array.from(new Set(linhas.flatMap((l) => Object.keys(l.a.cats)))).sort((x, y) => x.localeCompare(y, 'pt-BR'));
  const porDia = (x) => (x.porDia == null ? '—' : x.porDia.toLocaleString('pt-BR', { maximumFractionDigits: 1 }));
  const cel = (lista) => {
    if (!lista || !lista.length) return '<span class="tempo-vazio">—</span>';
    if (lista.length < MIN_AMOSTRAS) return `<span class="tempo-vazio">poucos (${lista.length})</span>`;
    return `<b>${Tempo.curto(Tempo.mediana(lista))}</b> <small class="tempo-sub">(${lista.length})</small>`;
  };

  el.innerHTML = `
    <div class="card" style="margin-top:16px">
      <h3 class="section-title" style="font-size:16px">Produtividade e tempo gasto — equipe</h3>
      <p class="section-sub">Pra decidir qual serviço passar pra cada um</p>
      <div class="tabela-wrap"><table class="tabela">
        <thead><tr><th>Funcionário</th><th class="num">Projetos/dia · ${escapeHtml(r.rotMes)}</th><th class="num">Projetos/dia · ${escapeHtml(r.rotAno)}</th><th class="num">Em andamento agora</th><th class="num">Tempo típico</th></tr></thead>
        <tbody>${linhas
          .map(
            (l) => `<tr><td>${escapeHtml(l.f.nome)}</td><td class="num">${porDia(l.mes)}</td><td class="num">${porDia(l.ano)}</td><td class="num">${carga[l.f.id] || 0}</td><td class="num">${cel(l.a.todos)}</td></tr>`
          )
          .join('')}</tbody>
      </table></div>

      <h4 class="rx-subtitulo">Tempo típico por tipo de móvel · ${escapeHtml(periodo.rotulo)}</h4>
      ${
        tipos.length
          ? `<div class="tabela-wrap"><table class="tabela">
              <thead><tr><th>Tipo de móvel</th>${linhas.map((l) => `<th class="num">${escapeHtml(primeiroNome(l.f.nome))}</th>`).join('')}</tr></thead>
              <tbody>${tipos.map((t) => `<tr><td>${escapeHtml(t)}</td>${linhas.map((l) => `<td class="num">${cel(l.a.tipos[t])}</td>`).join('')}</tr>`).join('')}</tbody>
            </table></div>`
          : '<div class="row__meta">Nenhum serviço com tempo medido nesse período ainda.</div>'
      }

      ${
        cats.length
          ? `<h4 class="rx-subtitulo">Tempo típico por categoria</h4>
            <div class="tabela-wrap"><table class="tabela">
              <thead><tr><th>Categoria</th>${linhas.map((l) => `<th class="num">${escapeHtml(primeiroNome(l.f.nome))}</th>`).join('')}</tr></thead>
              <tbody>${cats.map((c) => `<tr><td>${escapeHtml(c)}</td>${linhas.map((l) => `<td class="num">${cel(l.a.cats[c])}</td>`).join('')}</tr>`).join('')}</tbody>
            </table></div>`
          : ''
      }
      <div class="row__meta" style="margin-top:10px">⏱ Mediana do tempo em horário útil (7h–17h, dias úteis, sem almoço); o número entre parênteses é quantos serviços foram medidos. Mostra a partir de ${MIN_AMOSTRAS}.</div>
    </div>`;
}

window.Tempo = Tempo;
