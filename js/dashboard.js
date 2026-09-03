/* =========================================================
   dashboard.js — Início
   Funcionário: vê o próprio desempenho (Nota, %Meta, Tendência).
   Admin: vê o comparativo da equipe (ranking, meta semanal/mensal,
   % atingido de cada funcionário) — a produção do próprio Admin
   fica numa aba separada ("Minha Produção"), fora do ranking, já
   que é ele quem avalia e premia a equipe.
   ========================================================= */

const DashboardAdminView = {
  modo: 'equipe', // 'equipe' | 'minha'
};

async function renderDashboard(view) {
  const user = Auth.current;

  if (!Auth.isAdmin()) {
    return renderDashboardIndividual(view, user.id, user.nome, 'Seu desempenho na semana atual');
  }

  view.innerHTML = `
    <h2 class="section-title">Início</h2>
    <div style="display:flex; gap:8px; margin-bottom:18px">
      <button class="btn ${DashboardAdminView.modo === 'equipe' ? 'btn--primary' : 'btn--ghost'}" id="btn-modo-equipe">Equipe</button>
      <button class="btn ${DashboardAdminView.modo === 'minha' ? 'btn--primary' : 'btn--ghost'}" id="btn-modo-minha">Minha Produção</button>
    </div>
    <div id="dash-conteudo"></div>
  `;

  document.getElementById('btn-modo-equipe').addEventListener('click', () => {
    DashboardAdminView.modo = 'equipe';
    renderDashboard(view);
  });
  document.getElementById('btn-modo-minha').addEventListener('click', () => {
    DashboardAdminView.modo = 'minha';
    renderDashboard(view);
  });

  const cont = document.getElementById('dash-conteudo');
  if (DashboardAdminView.modo === 'minha') {
    return renderDashboardIndividual(cont, user.id, user.nome, 'Sua produção pessoal — não entra no comparativo da equipe', true);
  }
  return renderDashboardEquipe(cont);
}

/* ---------------- COMPARATIVO DE EQUIPE (Admin) ---------------- */

async function renderDashboardEquipe(cont) {
  cont.innerHTML = `<div class="wip">${ICONS.wip}<b>Calculando…</b></div>`;

  const usuarios = await DB.getAll('usuarios');
  const funcionarios = usuarios.filter((u) => u.tipo !== 'admin');

  if (funcionarios.length === 0) {
    cont.innerHTML = `
      <div class="card">
        <div class="empty">
          <div class="empty__title">Nenhum funcionário cadastrado</div>
          <div class="empty__sub">Cadastre a equipe em Admin → Usuários pra ver o comparativo aqui.</div>
        </div>
      </div>`;
    return;
  }

  const linhas = await Promise.all(
    funcionarios.map(async (f) => {
      const resumo = await Metrics.resumoSemanal(f.id, 1);
      const atual = resumo.atual;
      const projetosMes = await Metrics.totalPeriodo(f.id, 30);
      const metaMes = atual.meta * 4.345; // média de semanas por mês (aproximado)
      const pctMetaMes = metaMes > 0 ? projetosMes / metaMes : 0;
      return {
        usuario: f,
        emFerias: atual.emFerias,
        projetosSemana: atual.projetos,
        metaSemana: atual.meta,
        pctMetaSemana: atual.pctMeta,
        projetosMes,
        metaMes,
        pctMetaMes,
        nota: atual.nota,
      };
    })
  );

  linhas.sort((a, b) => {
    if (a.emFerias && !b.emFerias) return 1;
    if (!a.emFerias && b.emFerias) return -1;
    return (b.pctMetaSemana || 0) - (a.pctMetaSemana || 0);
  });

  const medalhas = ['🥇', '🥈', '🥉'];
  const dadosGrafico = linhas.map((l) => ({
    label: primeiroNome(l.usuario.nome),
    value: l.emFerias ? 0 : Math.round((l.pctMetaSemana || 0) * 100),
  }));

  cont.innerHTML = `
    <div class="card">
      <h3 class="section-title" style="font-size:16px; margin-bottom:14px">% da Meta desta semana, por funcionário</h3>
      <div id="grafico-equipe"></div>
    </div>

    <div class="card" style="margin-top:16px; padding:0">
      ${linhas
        .map((l, i) => {
          const posicao = l.emFerias ? '—' : medalhas[i] || `${i + 1}º`;
          return `
          <div class="row" style="padding:14px 18px; align-items:flex-start; flex-wrap:wrap; gap:10px">
            <div class="row__main" style="flex:1 1 200px">
              <div class="row__title">${posicao} ${escapeHtml(l.usuario.nome)}</div>
              ${
                l.emFerias
                  ? '<div class="row__meta">🏖️ De férias nesta semana</div>'
                  : `<div class="row__meta">Semana: ${l.projetosSemana} / ${l.metaSemana.toFixed(1)} projetos · ${(l.pctMetaSemana * 100).toFixed(0)}% da meta</div>
                     <div class="row__meta">Mês: ${l.projetosMes} / ${l.metaMes.toFixed(0)} projetos · ${(l.pctMetaMes * 100).toFixed(0)}% da meta</div>`
              }
            </div>
            <div>${l.emFerias ? '' : `<span class="badge ${l.pctMetaSemana >= 1 ? 'badge--ok' : l.pctMetaSemana >= 0.7 ? 'badge--warn' : 'badge--danger'}">Nota ${l.nota.toFixed(0)}</span>`}</div>
          </div>`;
        })
        .join('')}
    </div>

    <div class="row__meta" style="margin-top:14px; text-align:center">Meta mensal é uma aproximação (meta semanal × 4,345 semanas).</div>
  `;

  document.getElementById('grafico-equipe').innerHTML = graficoBarrasSVG(dadosGrafico, 100, '%');
}

function primeiroNome(nomeCompleto) {
  return (nomeCompleto || '').split(' ')[0];
}

/* ---------------- DESEMPENHO INDIVIDUAL (Funcionário, ou Admin em "Minha Produção") ---------------- */

async function renderDashboardIndividual(view, userId, nomeExibicao, subtitulo, ehModoAdmin) {
  view.innerHTML = `
    ${!ehModoAdmin ? `<h2 class="section-title">Olá, ${escapeHtml(primeiroNome(nomeExibicao))}</h2>` : ''}
    <p class="section-sub">${subtitulo}</p>
    <div id="dash-conteudo-individual">
      <div class="wip">${ICONS.wip}<b>Calculando…</b></div>
    </div>
  `;

  const resumo = await Metrics.resumoSemanal(userId, 6);
  const mensal = await Metrics.totalPeriodo(userId, 30);
  const anual = await Metrics.totalPeriodo(userId, 365);
  const atual = resumo.atual;
  const semTrabalhoNenhum = resumo.semanas.every((s) => s.projetos === 0) && mensal === 0 && anual === 0;

  const cont = document.getElementById('dash-conteudo-individual');

  if (semTrabalhoNenhum) {
    cont.innerHTML = `
      <div class="card">
        <div class="empty">
          <div class="empty__title">Ainda não há serviços concluídos</div>
          <div class="empty__sub">Os números aparecem aqui assim que houver um serviço concluído e validado em "Serviços".</div>
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

    ${atual.emFerias ? '<div class="row__meta" style="text-align:center; margin-top:10px">🏖️ De férias nesta semana — não conta contra a meta.</div>' : ''}

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
function graficoBarrasSVG(dados, valorMax, sufixo) {
  const largura = 320;
  const altura = 150;
  const padTopo = 20;
  const padBase = 24;
  const alturaUtil = altura - padTopo - padBase;
  const gap = 10;
  const larguraBarra = (largura - gap * (dados.length + 1)) / Math.max(dados.length, 1);

  const barras = dados
    .map((d, i) => {
      const h = valorMax > 0 ? (Math.max(d.value, 0) / valorMax) * alturaUtil : 0;
      const x = gap + i * (larguraBarra + gap);
      const y = padTopo + (alturaUtil - h);
      return `
        <rect x="${x}" y="${y}" width="${larguraBarra}" height="${Math.max(h, 2)}" rx="4" fill="var(--brand-700)" />
        <text x="${x + larguraBarra / 2}" y="${y - 6}" text-anchor="middle" font-size="10" fill="var(--ink-soft)" font-family="var(--font-body)">${Math.round(d.value)}${sufixo || ''}</text>
        <text x="${x + larguraBarra / 2}" y="${altura - 6}" text-anchor="middle" font-size="9" fill="var(--ink-faint)" font-family="var(--font-body)">${d.label}</text>
      `;
    })
    .join('');

  return `<svg viewBox="0 0 ${largura} ${altura}" style="width:100%; height:auto; display:block">${barras}</svg>`;
}
