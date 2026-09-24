/* =========================================================
   graficos.js — gráficos em SVG puro (sem biblioteca externa),
   nas cores do app. Funcionam offline e também saem na impressão
   do Relatório em PDF.
   ========================================================= */

// Paleta tirada dos tokens do app (vinho, metal, âmbar, verde…)
const PALETA_SERIES = ['#7A1F2B', '#565A5E', '#9A6B08', '#1F7A4D', '#B8404A', '#9CA0A4'];

// passo "redondo" pra grade do gráfico (1, 2, 5, 10, 20, 50, 100…)
function passoRedondo(maior, divisoes = 5) {
  if (maior <= 5) return 1;
  const bruto = maior / divisoes;
  const pot = Math.pow(10, Math.floor(Math.log10(bruto)));
  const r = bruto / pot;
  const base = r <= 1 ? 1 : r <= 2 ? 2 : r <= 5 ? 5 : 10;
  return base * pot;
}

function corDaSerie(i) {
  return PALETA_SERIES[i % PALETA_SERIES.length];
}

function escSvg(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function cortarTexto(str, max) {
  const s = String(str ?? '');
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

/* Legenda em HTML (quebra linha sozinha em tela pequena) */
function legendaHTML(series) {
  return `<div class="legenda">${series
    .map((s, i) => `<span class="legenda__item"><i style="background:${s.cor || corDaSerie(i)}"></i>${escSvg(s.nome)}</span>`)
    .join('')}</div>`;
}

/* Barra horizontal única, pra usar em linhas de lista
   (ex: quantidade por categoria no Raio-X) */
function barraHorizontalSVG(valor, maximo, cor) {
  // sem viewBox: larguras em % mantêm as pontas arredondadas sem distorcer
  const pct = maximo > 0 ? Math.min(100, (valor / maximo) * 100) : 0;
  const pctFinal = valor > 0 ? Math.max(pct, 1.5) : 0;
  return `<svg width="100%" height="12" style="display:block">
    <rect x="0" y="0" width="100%" height="12" rx="6" fill="var(--paper-dim)" />
    ${pctFinal > 0 ? `<rect x="0" y="0" width="${pctFinal.toFixed(2)}%" height="12" rx="6" fill="${cor || 'var(--brand-700)'}" />` : ''}
  </svg>`;
}

/* Barras horizontais com rótulo à esquerda e valor à direita */
function barrasHorizontaisSVG(linhas, opts = {}) {
  if (!linhas.length) return '';
  const largura = opts.largura || 520;
  const alturaLinha = 24;
  const colRotulo = opts.colRotulo || 170;
  const colValor = 64;
  const areaBarra = largura - colRotulo - colValor - 8;
  const altura = linhas.length * alturaLinha + 4;
  const max = opts.maximo != null ? opts.maximo : Math.max(0, ...linhas.map((l) => l.valor));
  const sufixo = opts.sufixo || '';
  const casas = opts.casas ?? 0;

  const corpo = linhas
    .map((l, i) => {
      const y = i * alturaLinha + 4;
      const w = max > 0 ? Math.max((l.valor / max) * areaBarra, l.valor > 0 ? 2 : 0) : 0;
      const textoValor = l.textoValor != null ? l.textoValor : `${formatarNumero(l.valor, casas)}${sufixo}`;
      return `
        <text x="${colRotulo - 8}" y="${y + 13}" text-anchor="end" font-size="11" fill="var(--ink-soft)" font-family="var(--font-body)">${escSvg(cortarTexto(l.rotulo, 26))}</text>
        <rect x="${colRotulo}" y="${y + 3}" width="${areaBarra}" height="13" rx="4" fill="var(--paper-dim)" />
        <rect x="${colRotulo}" y="${y + 3}" width="${w.toFixed(1)}" height="13" rx="4" fill="${l.cor || opts.cor || 'var(--brand-700)'}" />
        <text x="${colRotulo + areaBarra + 8}" y="${y + 13}" font-size="11" font-weight="600" fill="var(--ink)" font-family="var(--font-body)">${escSvg(textoValor)}</text>`;
    })
    .join('');

  return `<svg viewBox="0 0 ${largura} ${altura}" style="width:100%; max-width:${opts.maxLargura || 640}px; height:auto; display:block; margin:0 auto">${corpo}</svg>`;
}

/* Gráfico de linha com várias séries. rotulos = eixo X. */
function graficoLinhaSVG(rotulos, series, opts = {}) {
  const largura = opts.largura || 520;
  const altura = opts.altura || 190;
  const padEsq = 34;
  const padDir = 22; // folga pro último rótulo do eixo X não cortar
  const padTopo = 16;
  const padBase = 26;
  const areaW = largura - padEsq - padDir;
  const areaH = altura - padTopo - padBase;
  const n = rotulos.length;
  const todosValores = series.flatMap((s) => s.valores.filter((v) => v != null));
  const maiorValor = Math.max(opts.minMaximo ?? 1, ...todosValores, 0);
  const passo = passoRedondo(maiorValor);
  const maximo = Math.ceil(maiorValor / passo) * passo || 1;
  const xDe = (i) => padEsq + (n <= 1 ? areaW / 2 : (i / (n - 1)) * areaW);
  const yDe = (v) => padTopo + areaH - (v / maximo) * areaH;

  let grade = '';
  for (let v = 0; v <= maximo; v += passo) {
    const y = yDe(v);
    grade += `<line x1="${padEsq}" y1="${y}" x2="${largura - padDir}" y2="${y}" stroke="var(--line)" stroke-width="1" />
      <text x="${padEsq - 6}" y="${y + 3.5}" text-anchor="end" font-size="9.5" fill="var(--ink-faint)" font-family="var(--font-body)">${v}${opts.sufixo || ''}</text>`;
  }

  // rótulos do eixo X — pula alguns se forem muitos
  const pular = Math.ceil(n / 12);
  const eixoX = rotulos
    .map((r, i) =>
      i % pular === 0 || i === n - 1
        ? `<text x="${xDe(i)}" y="${altura - 8}" text-anchor="middle" font-size="9.5" fill="var(--ink-faint)" font-family="var(--font-body)">${escSvg(r)}</text>`
        : ''
    )
    .join('');

  const linhas = series
    .map((s, si) => {
      const cor = s.cor || corDaSerie(si);
      const pontos = s.valores.map((v, i) => (v == null ? null : [xDe(i), yDe(v)]));
      let d = '';
      let novo = true;
      pontos.forEach((p) => {
        if (!p) {
          novo = true;
          return;
        }
        d += `${novo ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)} `;
        novo = false;
      });
      const bolinhas = pontos
        .map((p, i) =>
          p
            ? `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="3" fill="${cor}" stroke="#fff" stroke-width="1.2"><title>${escSvg(s.nome)} · ${escSvg(rotulos[i])}: ${formatarNumero(s.valores[i], 1)}</title></circle>`
            : ''
        )
        .join('');
      return `<path d="${d}" fill="none" stroke="${cor}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round" ${s.tracejado ? 'stroke-dasharray="5 4"' : ''}/>${bolinhas}`;
    })
    .join('');

  return `<svg viewBox="0 0 ${largura} ${altura}" style="width:100%; max-width:${opts.maxLargura || 640}px; height:auto; display:block; margin:0 auto">${grade}${eixoX}${linhas}</svg>
    ${opts.semLegenda ? '' : legendaHTML(series.map((s, i) => ({ nome: s.nome, cor: s.cor || corDaSerie(i) })))}`;
}

/* Barras agrupadas: grupos no eixo X, uma barra por série em cada grupo */
function barrasAgrupadasSVG(grupos, series, opts = {}) {
  const nGrupos = grupos.length;
  const nSeries = series.length;
  if (!nGrupos || !nSeries) return '';
  const largura = opts.largura || Math.max(520, nGrupos * (nSeries * 16 + 22) + 40);
  const altura = opts.altura || 210;
  const padEsq = 30;
  const padDir = 8;
  const padTopo = 16;
  const padBase = opts.rotulosInclinados ? 58 : 28;
  const areaW = largura - padEsq - padDir;
  const areaH = altura - padTopo - padBase;
  const todos = series.flatMap((s) => s.valores);
  const maiorValor = Math.max(1, ...todos);
  const passo = passoRedondo(maiorValor);
  const maximo = Math.ceil(maiorValor / passo) * passo;
  const larguraGrupo = areaW / nGrupos;
  const gapGrupo = Math.min(18, larguraGrupo * 0.25);
  const larguraBarra = Math.max(3, (larguraGrupo - gapGrupo) / nSeries);
  const yDe = (v) => padTopo + areaH - (v / maximo) * areaH;

  let grade = '';
  for (let v = 0; v <= maximo; v += passo) {
    const y = yDe(v);
    grade += `<line x1="${padEsq}" y1="${y}" x2="${largura - padDir}" y2="${y}" stroke="var(--line)" stroke-width="1" />
      <text x="${padEsq - 6}" y="${y + 3.5}" text-anchor="end" font-size="9.5" fill="var(--ink-faint)" font-family="var(--font-body)">${v}</text>`;
  }

  let barras = '';
  grupos.forEach((g, gi) => {
    const x0 = padEsq + gi * larguraGrupo + gapGrupo / 2;
    series.forEach((s, si) => {
      const v = s.valores[gi] || 0;
      const h = (v / maximo) * areaH;
      const x = x0 + si * larguraBarra;
      const cor = s.cor || corDaSerie(si);
      barras += `<rect x="${x.toFixed(1)}" y="${(padTopo + areaH - h).toFixed(1)}" width="${Math.max(larguraBarra - 2, 2).toFixed(1)}" height="${Math.max(h, v > 0 ? 1.5 : 0).toFixed(1)}" rx="2" fill="${cor}"><title>${escSvg(s.nome)} · ${escSvg(g)}: ${v}</title></rect>`;
      if (v > 0 && larguraBarra >= 12) {
        barras += `<text x="${(x + (larguraBarra - 2) / 2).toFixed(1)}" y="${(padTopo + areaH - h - 3).toFixed(1)}" text-anchor="middle" font-size="8.5" fill="var(--ink-soft)" font-family="var(--font-body)">${v}</text>`;
      }
    });
    const cx = padEsq + gi * larguraGrupo + larguraGrupo / 2;
    const rotulo = escSvg(cortarTexto(g, opts.rotulosInclinados ? 18 : 12));
    barras += opts.rotulosInclinados
      ? `<text x="${cx}" y="${altura - padBase + 12}" text-anchor="end" transform="rotate(-35 ${cx} ${altura - padBase + 12})" font-size="9.5" fill="var(--ink-soft)" font-family="var(--font-body)">${rotulo}</text>`
      : `<text x="${cx}" y="${altura - 9}" text-anchor="middle" font-size="9.5" fill="var(--ink-soft)" font-family="var(--font-body)">${rotulo}</text>`;
  });

  return `<div style="overflow-x:auto"><svg viewBox="0 0 ${largura} ${altura}" style="width:100%; min-width:${Math.min(largura, 520)}px; max-width:${Math.max(largura, 640)}px; height:auto; display:block; margin:0 auto">${grade}${barras}</svg></div>
    ${opts.semLegenda || nSeries === 1 ? '' : legendaHTML(series.map((s, i) => ({ nome: s.nome, cor: s.cor || corDaSerie(i) })))}`;
}

/* Barras verticais simples (1 série) */
function barrasVerticaisSVG(rotulos, valores, opts = {}) {
  return barrasAgrupadasSVG(rotulos, [{ nome: opts.nome || '', valores, cor: opts.cor || 'var(--brand-700)' }], { ...opts, semLegenda: true });
}
