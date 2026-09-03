/* =========================================================
   dashboard.js — desempenho individual
   Mostra Nota, %Meta, Tendência e Projetos da semana atual,
   calculados de verdade em cima dos serviços concluídos, mais
   um gráfico das últimas 6 semanas. Tudo roda local, sem precisar
   de internet.
   ========================================================= */

async function renderDashboard(view) {
  const user = Auth.current;

  view.innerHTML = `
    <h2 class="section-title">Olá, ${escapeHtml(user.nome.split(' ')[0])}</h2>
    <p class="section-sub">Seu desempenho na semana atual</p>
    <div id="dash-conteudo">
      <div class="wip">${ICONS.wip}<b>Calculando…</b></div>
    </div>
  `;

  const resumo = await Metrics.resumoSemanal(user.id, 6);
  const mensal = await Metrics.totalPeriodo(user.id, 30);
  const anual = await Metrics.totalPeriodo(user.id, 365);
  const atual = resumo.atual;
  const semTrabalhoNenhum = resumo.semanas.every((s) => s.projetos === 0) && mensal === 0 && anual === 0;

  const cont = document.getElementById('dash-conteudo');

  if (semTrabalhoNenhum) {
    cont.innerHTML = `
      <div class="card">
        <div class="empty">
          <div class="empty__title">Ainda não há serviços concluídos</div>
          <div class="empty__sub">Seus números aparecem aqui assim que você concluir o primeiro serviço em "Serviços" (botão Concluir).</div>
        </div>
      </div>
    `;
    return;
  }

  cont.innerHTML = `
    <div class="stat-grid">
      <div class="card"><div class="stat"><div class="stat__value">${atual.emFerias ? '🏖️' : atual.projetos}</div><div class="stat__label">Projetos na semana</div></div></div>
      <div class="card"><div class="stat"><div class="stat__value">${atual.emFerias ? '—' : atual.nota.toFixed(0)}</div><div class="stat__label">Nota</div></div></div>
      <div class="card"><div class="stat"><div class="stat__value">${atual.emFerias ? '—' : (atual.pctMeta * 100).toFixed(0) + '%'}</div><div class="stat__label">% da Meta</div></div></div>
      <div class="card"><div class="stat"><div class="stat__value">${resumo.tendencia.icone}</div><div class="stat__label">Tendência (${resumo.tendencia.label})</div></div></div>
    </div>

    ${atual.emFerias ? '<div class="row__meta" style="text-align:center; margin-top:10px">🏖️ Você está de férias nesta semana — não conta contra sua meta.</div>' : ''}

    <div class="card" style="margin-top:16px">
      <h3 class="section-title" style="font-size:16px; margin-bottom:14px">Nota nas últimas 6 semanas</h3>
      <div id="grafico-nota"></div>
    </div>

    <div class="stat-grid" style="margin-top:16px">
      <div class="card"><div class="stat"><div class="stat__value">${mensal}</div><div class="stat__label">Projetos concluídos no mês</div></div></div>
      <div class="card"><div class="stat"><div class="stat__value">${anual}</div><div class="stat__label">Projetos concluídos no ano</div></div></div>
    </div>

    <div class="row__meta" style="margin-top:14px; text-align:center">
      Meta desta semana: ${atual.meta.toFixed(1)} projetos ${atual.emFerias ? '' : `· Prazo: ${(atual.pctPrazo * 100).toFixed(0)}% · Atrasos: ${atual.atraso}`}
    </div>
  `;

  const dadosGrafico = resumo.semanas.map((s) => ({
    label: rotuloSemana(s.inicio),
    value: s.emFerias ? 0 : s.nota,
  }));
  document.getElementById('grafico-nota').innerHTML = graficoBarrasSVG(dadosGrafico, 100);
}

function rotuloSemana(ts) {
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
}

/* Gráfico de barras simples em SVG puro — sem biblioteca externa,
   funciona 100% offline e segue as cores do app. */
function graficoBarrasSVG(dados, valorMax) {
  const largura = 320;
  const altura = 150;
  const padTopo = 20;
  const padBase = 24;
  const alturaUtil = altura - padTopo - padBase;
  const gap = 10;
  const larguraBarra = (largura - gap * (dados.length + 1)) / dados.length;

  const barras = dados
    .map((d, i) => {
      const h = valorMax > 0 ? (Math.max(d.value, 0) / valorMax) * alturaUtil : 0;
      const x = gap + i * (larguraBarra + gap);
      const y = padTopo + (alturaUtil - h);
      return `
        <rect x="${x}" y="${y}" width="${larguraBarra}" height="${Math.max(h, 2)}" rx="4" fill="var(--brand-700)" />
        <text x="${x + larguraBarra / 2}" y="${y - 6}" text-anchor="middle" font-size="10" fill="var(--ink-soft)" font-family="var(--font-body)">${Math.round(d.value)}</text>
        <text x="${x + larguraBarra / 2}" y="${altura - 6}" text-anchor="middle" font-size="9" fill="var(--ink-faint)" font-family="var(--font-body)">${d.label}</text>
      `;
    })
    .join('');

  return `<svg viewBox="0 0 ${largura} ${altura}" style="width:100%; height:auto; display:block">${barras}</svg>`;
}
