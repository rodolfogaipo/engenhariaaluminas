/* =========================================================
   destaque.js — Quadro de Destaque (Início do Admin)
   Folha A4 em pé pra imprimir e pendurar: Funcionário Destaque da
   Semana / do Mês / do Ano, com foto grande e a % da meta, o ranking
   de todos pela % da meta, a tabela em ordem alfabética (meta de
   projetos × projetos feitos) e a meta da semana seguinte (quantos
   projetos cada um precisa fazer pra bater 100%).

   Usa EXATAMENTE o cálculo oficial (metrics.js), o mesmo do Início:
   - Semana: a % da meta daquela semana.
   - Mês / Ano: média da % das semanas que COMEÇAM no período (sem
     semanas de férias) — igual à planilha. Meta e feitos do período
     = soma dessas mesmas semanas.
   ========================================================= */

const DestaqueView = {
  tipo: 'semana', // 'semana' | 'mes' | 'ano'
  dataReferencia: null, // null = semana/mês/ano ANTERIOR ao atual (o que normalmente se premia)
  status: '',
};

const Destaque = {
  referenciaPadrao(tipo) {
    const d = new Date();
    if (tipo === 'semana') return Date.now() - 7 * 24 * 60 * 60 * 1000; // semana passada
    if (tipo === 'mes') return new Date(d.getFullYear(), d.getMonth() - 1, 15).getTime(); // mês passado
    return new Date(d.getFullYear(), 6, 1).getTime(); // ano atual
  },

  async periodo(tipo, ref) {
    const p = await Analise.periodo(tipo, ref);
    const idxIni = await Metrics.indiceSemana(p.inicio);
    const idxFim = await Metrics.indiceSemana(p.fim - 1);
    const idxAgora = await Metrics.indiceSemana(Date.now());
    const indices = [];
    for (let i = idxIni; i <= idxFim; i++) {
      const r = await Metrics.rangeDaSemanaPorIndice(i);
      if (r.inicio < p.inicio || r.inicio >= p.fim) continue; // semana que começa no período
      if (i > idxAgora) continue; // semana que ainda não começou
      indices.push(i);
    }
    // meta mostrada: sempre a da semana ATUAL — é a que está valendo quando
    // a folha vai pra parede (imprimindo na segunda o destaque da semana
    // passada, a "semana seguinte" já é a atual)
    const idxMeta = idxAgora;
    const rMeta = await Metrics.rangeDaSemanaPorIndice(idxMeta);
    let rotulo = p.rotulo;
    if (tipo === 'semana') rotulo = `${formatarDataCurta(p.inicio).slice(0, 5)} a ${formatarDataCurta(p.fim - 1)}`;
    return { ...p, rotulo, indices, idxMeta, rMeta, metaEhAtual: idxMeta === idxAgora };
  },

  async calcular(tipo, ref) {
    const per = await this.periodo(tipo, ref);
    const pesos = await Metrics.pesos();
    const usuarios = (await DB.getAll('usuarios')).filter((u) => u.tipo === 'funcionario');

    const linhas = [];
    for (const u of usuarios) {
      const eventos = await Metrics.eventosConcluidosDoFuncionario(u.id);
      const ferias = await Metrics.feriasDoFuncionario(u.id);
      let somaPct = 0;
      let somaNota = 0;
      let somaMeta = 0;
      let feitos = 0;
      let contadas = 0;
      let semanasFerias = 0;
      for (const i of per.indices) {
        const sem = await Metrics.calcularSemanaPorIndice(eventos, i, pesos, ferias);
        if (sem.emFerias) {
          semanasFerias++;
          continue;
        }
        const meta = await Metrics.calcularMetaPorIndice(eventos, i, pesos, ferias);
        somaPct += await Metrics.calcularPctMeta(sem, meta, pesos);
        somaNota += sem.nota;
        somaMeta += meta;
        feitos += sem.projetos;
        contadas++;
      }

      // meta da semana seguinte (ou atual)
      const semMeta = await Metrics.calcularSemanaPorIndice(eventos, per.idxMeta, pesos, ferias);
      const metaProx = await Metrics.calcularMetaPorIndice(eventos, per.idxMeta, pesos, ferias);

      // férias que caem dentro do período (pra justificar na folha)
      const feriasNoPeriodo = ferias
        .filter((f) => f.dataInicio < per.fim && f.dataFim >= per.inicio)
        .sort((a, b) => a.dataInicio - b.dataInicio)
        .map((f) => ({ inicio: f.dataInicio, fim: f.dataFim }));

      linhas.push({
        u,
        feriasNoPeriodo,
        semanasFerias,
        emFerias: contadas === 0 && semanasFerias > 0,
        semDados: contadas === 0 && semanasFerias === 0,
        pct: contadas ? somaPct / contadas : 0,
        nota: contadas ? somaNota / contadas : 0,
        meta: somaMeta,
        // Mês/Ano: projetos feitos contam do dia 1 ao último dia (calendário),
        // igual ao que o funcionário vê no Início. A % da meta continua pela
        // regra oficial (média das semanas que começam no período).
        feitos:
          tipo === 'semana'
            ? feitos
            : eventos.filter((e) => e.dataFinal >= per.inicio && e.dataFinal < per.fim).length,
        metaProx: semMeta.emFerias ? null : Math.ceil(metaProx - 1e-9),
        feitosNaSemanaMeta: semMeta.projetos,
        feriasProx: !!semMeta.emFerias,
      });
    }

    // ranking: % da meta → nota → projetos feitos (quem está de férias fica no fim)
    const ranking = linhas
      .filter((l) => !l.emFerias)
      .sort((a, b) => b.pct - a.pct || b.nota - a.nota || b.feitos - a.feitos);
    const destaque = ranking.length && !ranking[0].semDados && (ranking[0].feitos > 0 || ranking[0].pct > 0) ? ranking[0] : null;
    return { per, linhas, ranking, destaque };
  },
};

/* ---------------- CARTÃO NO INÍCIO ---------------- */

async function renderCartaoDestaque(cont) {
  const st = DestaqueView;
  if (!st.dataReferencia) st.dataReferencia = Destaque.referenciaPadrao(st.tipo);
  const per = await Destaque.periodo(st.tipo, st.dataReferencia);
  const ehAtual = await Analise.periodoEhAtual(st.tipo, st.dataReferencia);
  const nomes = { semana: 'da Semana', mes: 'do Mês', ano: 'do Ano' };

  cont.innerHTML = `
    <div class="card destaque-card">
      <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:10px; flex-wrap:wrap">
        <div>
          <h3 class="section-title" style="font-size:16px">🏆 Quadro de Destaque</h3>
          <p class="section-sub" style="margin:0">Folha pra imprimir e pendurar: destaque, ranking e a meta da semana</p>
        </div>
        <div class="chips">
          ${['semana', 'mes', 'ano']
            .map((t) => `<button class="chip ${st.tipo === t ? 'chip--on' : ''}" data-destaque-tipo="${t}">${t === 'semana' ? 'Semana' : t === 'mes' ? 'Mês' : 'Ano'}</button>`)
            .join('')}
        </div>
      </div>
      <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap; margin-top:14px">
        <div style="display:flex; align-items:center; gap:10px">
          <button class="topbar__icon-btn" id="destaque-anterior" style="background:var(--paper-dim)" aria-label="Anterior">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><path d="M15 18l-6-6 6-6"/></svg>
          </button>
          <span style="font-weight:600; font-size:14px; min-width:170px; text-align:center">Destaque ${nomes[st.tipo]}<br><span style="color:var(--brand-700)">${escapeHtml(per.rotulo)}</span></span>
          <button class="topbar__icon-btn" id="destaque-proximo" style="background:var(--paper-dim)" aria-label="Próximo" ${ehAtual ? 'disabled' : ''}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><path d="M9 18l6-6-6-6"/></svg>
          </button>
        </div>
        <div style="display:flex; gap:8px; flex-wrap:wrap">
          <button class="btn btn--ghost" id="destaque-ver" style="padding:8px 14px; font-size:13px">Visualizar</button>
          <button class="btn btn--primary" id="destaque-pdf" style="padding:8px 14px; font-size:13px">Gerar PDF</button>
        </div>
      </div>
      <div class="row__meta" style="margin-top:10px">${
        ehAtual ? `${st.tipo === 'semana' ? 'Essa semana' : st.tipo === 'mes' ? 'Esse mês' : 'Esse ano'} ainda está em andamento — o resultado pode mudar. ` : ''
      }${
        st.tipo === 'semana'
          ? `A folha traz a meta da semana atual (${formatarDataCurta(per.rMeta.inicio).slice(0, 5)} a ${formatarDataCurta(per.rMeta.fim - 1).slice(0, 5)}).`
          : 'Destaque, ranking e projetos do período.'
      }</div>
      <div class="row__meta" id="destaque-status" style="margin-top:6px">${escapeHtml(st.status)}</div>
    </div>
    <div id="destaque-previa"></div>
  `;

  cont.querySelectorAll('[data-destaque-tipo]').forEach((b) =>
    b.addEventListener('click', () => {
      st.tipo = b.dataset.destaqueTipo;
      st.dataReferencia = Destaque.referenciaPadrao(st.tipo);
      st.status = '';
      renderCartaoDestaque(cont);
    })
  );
  document.getElementById('destaque-anterior').addEventListener('click', () => {
    st.dataReferencia = Analise.navegar(st.tipo, st.dataReferencia, -1);
    st.status = '';
    renderCartaoDestaque(cont);
  });
  document.getElementById('destaque-proximo').addEventListener('click', () => {
    st.dataReferencia = Analise.navegar(st.tipo, st.dataReferencia, 1);
    st.status = '';
    renderCartaoDestaque(cont);
  });

  const setStatus = (m) => {
    st.status = m;
    const el = document.getElementById('destaque-status');
    if (el) el.textContent = m;
  };
  document.getElementById('destaque-ver').addEventListener('click', async () => {
    setStatus('Calculando…');
    const n = await montarPdfDestaque(st.tipo, st.dataReferencia);
    mostrarPreviaRelatorio(document.getElementById('destaque-previa'));
    setStatus(`Prévia pronta: ${n} página(s).`);
  });
  document.getElementById('destaque-pdf').addEventListener('click', async () => {
    setStatus('Calculando…');
    const n = await montarPdfDestaque(st.tipo, st.dataReferencia);
    setStatus(`${n} página(s). Abrindo a impressão — escolha "Salvar como PDF" ou a impressora.`);
    imprimirRelatorio();
  });
}

/* ---------------- A FOLHA ---------------- */

// "🏖️ Férias de 07/09 a 18/09" (pode ter mais de um período)
function textoFerias(l) {
  if (!l.feriasNoPeriodo || !l.feriasNoPeriodo.length) return '';
  const trechos = l.feriasNoPeriodo.map((f) => `${formatarDataCurta(f.inicio).slice(0, 5)} a ${formatarDataCurta(f.fim).slice(0, 5)}`);
  return `🏖️ Férias de ${trechos.join(' e de ')}`;
}

function seloFerias(l, completo) {
  const t = textoFerias(l);
  if (!t) return '';
  const semanas = l.semanasFerias ? ` · ${l.semanasFerias} semana${l.semanasFerias === 1 ? '' : 's'} fora da meta` : '';
  return `<span class="dq-ferias">${t}${completo ? semanas : ''}</span>`;
}

function pctTexto(v) {
  return `${Math.round((v || 0) * 100)}%`;
}

function numProjetos(v) {
  return Number(v || 0).toLocaleString('pt-BR', { maximumFractionDigits: 1 });
}

function fotoDestaque(u, mm) {
  if (u && u.foto) return `<img class="dq-foto" src="${u.foto}" alt="" style="width:${mm}mm; height:${mm}mm" />`;
  const inicial = ((u && u.nome) || '?').trim().charAt(0).toUpperCase();
  return `<div class="dq-foto dq-foto--inicial" style="width:${mm}mm; height:${mm}mm; font-size:${mm * 0.45}mm">${escapeHtml(inicial)}</div>`;
}

async function montarPdfDestaque(tipo, ref) {
  const { per, linhas, ranking, destaque } = await Destaque.calcular(tipo, ref);
  const nomes = { semana: 'da Semana', mes: 'do Mês', ano: 'do Ano' };
  const blocos = [];

  // 1) destaque em grande
  blocos.push({
    tipo: 'html',
    html: destaque
      ? `<div class="dq-hero">
          <div class="dq-hero__faixa">Funcionário Destaque ${nomes[tipo]}</div>
          <div class="dq-hero__periodo">${escapeHtml(per.rotulo)}</div>
          ${fotoDestaque(destaque.u, 46)}
          <div class="dq-hero__nome">${escapeHtml(destaque.u.nome)}</div>
          <div class="dq-hero__pct">${pctTexto(destaque.pct)} <span>da meta</span></div>
          <div class="dq-hero__sub">${numProjetos(destaque.feitos)} projeto(s) feito(s) · meta de ${numProjetos(destaque.meta)}</div>
          ${textoFerias(destaque) ? `<div class="dq-hero__sub">${seloFerias(destaque, true)}</div>` : ''}
        </div>`
      : `<div class="dq-hero"><div class="dq-hero__faixa">Funcionário Destaque ${nomes[tipo]}</div><div class="dq-hero__periodo">${escapeHtml(per.rotulo)}</div><div class="dq-hero__sub" style="margin-top:8mm">Sem entregas nesse período.</div></div>`,
  });

  // 2) ranking pela % da meta
  const medalha = ['🥇', '🥈', '🥉'];
  const deFerias = linhas.filter((l) => l.emFerias);
  blocos.push({ tipo: 'titulo', html: '<h2 class="rp-secao">Ranking — % da meta</h2>' });
  blocos.push({
    tipo: 'html',
    html: `<div class="dq-rank">
      ${ranking
        .map(
          (l, i) => `<div class="dq-rank__linha ${i === 0 && destaque ? 'dq-rank__linha--1' : ''}">
            <span class="dq-rank__pos">${medalha[i] || `${i + 1}º`}</span>
            ${fotoDestaque(l.u, 9)}
            <span class="dq-rank__nome">${escapeHtml(l.u.nome)}${seloFerias(l, false)}</span>
            <span class="dq-rank__barra"><i style="width:${Math.min(100, Math.round(l.pct * 100 / Math.max(1, ranking[0].pct)))}%"></i></span>
            <span class="dq-rank__pct">${pctTexto(l.pct)}</span>
          </div>`
        )
        .join('')}
      ${deFerias.map((l) => `<div class="dq-rank__linha dq-rank__linha--ferias"><span class="dq-rank__pos">—</span>${fotoDestaque(l.u, 9)}<span class="dq-rank__nome">${escapeHtml(l.u.nome)}${seloFerias(l, false)}</span><span class="dq-rank__barra dq-rank__barra--vazia"></span><span class="dq-rank__pct">Férias</span></div>`).join('')}
    </div>`,
  });

  // 3) tabela alfabética: meta × feitos
  const alfabetica = [...linhas].sort((a, b) => a.u.nome.localeCompare(b.u.nome, 'pt-BR'));
  blocos.push({
    tipo: 'titulo',
    html: `<h2 class="rp-secao">Projetos ${nomes[tipo]}</h2>${
      tipo === 'semana'
        ? ''
        : `<p class="rp-nota">Projetos feitos: do dia 1 ao último dia ${tipo === 'mes' ? 'do mês' : 'do ano'} (igual ao que cada um vê no Início). Meta e % da meta: pelas semanas que começam no período (cálculo oficial, média semanal).</p>`
    }`,
  });
  blocos.push({
    tipo: 'tabela',
    cabecalho: '<tr><th>Funcionário</th><th class="num">Meta de projetos</th><th class="num">Projetos feitos</th><th class="num">% da meta</th></tr>',
    linhas: alfabetica.map((l) =>
      l.emFerias
        ? `<tr><td>${escapeHtml(l.u.nome)}<div>${seloFerias(l, false)}</div></td><td class="num" colspan="3">Férias o período todo</td></tr>`
        : `<tr><td>${escapeHtml(l.u.nome)}${textoFerias(l) ? `<div>${seloFerias(l, true)}</div>` : ''}</td><td class="num">${numProjetos(l.meta)}</td><td class="num"><b>${numProjetos(l.feitos)}</b></td><td class="num">${pctTexto(l.pct)}</td></tr>`
    ),
    classe: 'dq-tabela',
  });

  if (linhas.some((l) => textoFerias(l))) {
    blocos.push({
      tipo: 'html',
      html: '<p class="rp-nota">🏖️ Semanas de férias não entram na % da meta nem na meta de projetos — a média considera só as semanas trabalhadas.</p>',
    });
  }

  // 4) meta da semana atual — só no Destaque da Semana
  if (tipo === 'semana') {
  const rotSemMeta = `${formatarDataCurta(per.rMeta.inicio).slice(0, 5)} a ${formatarDataCurta(per.rMeta.fim - 1).slice(0, 5)}`;
  blocos.push({
    tipo: 'titulo',
    html: `<h2 class="rp-secao">Meta da semana atual — ${rotSemMeta}</h2><p class="rp-nota">Projetos que cada um precisa entregar pra atingir 100% da meta (no prazo e sem erros).</p>`,
  });
  blocos.push({
    tipo: 'html',
    html: `<div class="dq-metas">${alfabetica
      .map(
        (l) => `<div class="dq-meta">
          ${fotoDestaque(l.u, 12)}
          <div class="dq-meta__nome">${escapeHtml(primeiroNome(l.u.nome))}</div>
          ${
            l.feriasProx || l.metaProx == null
              ? '<div class="dq-meta__num dq-meta__num--ferias">Férias</div>'
              : `<div class="dq-meta__num">${l.metaProx}</div><div class="dq-meta__rot">projeto${l.metaProx === 1 ? '' : 's'}${
                  per.metaEhAtual && l.feitosNaSemanaMeta ? ` · já fez ${l.feitosNaSemanaMeta}, faltam ${Math.max(0, l.metaProx - l.feitosNaSemanaMeta)}` : ''
                }</div>`
          }
        </div>`
      )
      .join('')}</div>`,
  });
  }

  return montarPdfPadrao(blocos, {
    titulo: `Destaque ${nomes[tipo]}`,
    periodo: per.rotulo,
    detalhes: 'Engenharia — reconhecimento da equipe',
  });
}
