/* =========================================================
   pdfselecao.js — "Selecionar para PDF" reutilizável
   Mesmo esquema da ficha do MKT, usado em Avisos, Treino e
   Materiais: um botão liga o modo seleção, aparecem caixinhas em
   cada item e uma barra com Marcar todos / Desmarcar / Visualizar /
   Gerar PDF. As páginas saem no mesmo padrão do Relatório
   (cabeçalho com a logo, rodapé e número de página) — usa o
   paginarRelatorio() e o imprimirRelatorio() de relatorio.js.
   ========================================================= */

function botaoSelecaoPdf(estado, id) {
  return `<button class="btn ${estado.modoSelecao ? 'btn--primary' : 'btn--ghost'}" id="${id}">${
    estado.modoSelecao ? 'Cancelar seleção' : 'Selecionar para PDF'
  }</button>`;
}

function caixinhaPdf(estado, id) {
  if (!estado.modoSelecao) return '';
  return `<input type="checkbox" class="sel-pdf" data-sel-pdf="${id}" ${estado.selecionados.has(id) ? 'checked' : ''} aria-label="Incluir no PDF" />`;
}

// liga as caixinhas de uma lista ao conjunto de selecionados
function ligarCaixinhasPdf(cont, estado, aoMudar) {
  if (!cont) return;
  cont.querySelectorAll('[data-sel-pdf]').forEach((chk) => {
    chk.addEventListener('click', (ev) => ev.stopPropagation());
    chk.addEventListener('change', () => {
      if (chk.checked) estado.selecionados.add(chk.dataset.selPdf);
      else estado.selecionados.delete(chk.dataset.selPdf);
      aoMudar();
    });
  });
}

/* Desenha a barra de seleção.
   cfg: {
     contId, previaId, estado (com modoSelecao, selecionados, _visiveis),
     todosIds: [ids que existem], singular, plural, dica,
     montar: async (idsSelecionados) => númeroDePáginas,
     aoMudar: () => void   (redesenha a lista)
   } */
function renderBarraSelecaoPdf(cfg) {
  const cont = document.getElementById(cfg.contId);
  if (!cont) return;
  const est = cfg.estado;
  if (!est.modoSelecao) {
    cont.innerHTML = '';
    return;
  }
  // tira da seleção o que foi excluído nesse meio tempo
  const existentes = new Set(cfg.todosIds);
  Array.from(est.selecionados).forEach((id) => {
    if (!existentes.has(id)) est.selecionados.delete(id);
  });
  const n = est.selecionados.size;
  const pre = cfg.contId;
  cont.innerHTML = `
    <div class="card" style="display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap; padding:12px 16px; margin-bottom:14px; background:var(--paper-dim)">
      <b>${n} ${n === 1 ? cfg.singular : cfg.plural} marcado${n === 1 ? '' : 's'}</b>
      <div style="display:flex; gap:8px; flex-wrap:wrap">
        <button class="btn btn--ghost" id="${pre}-todos" style="padding:8px 12px; font-size:13px; background:var(--surface)">Marcar todos da busca</button>
        <button class="btn btn--ghost" id="${pre}-limpar" style="padding:8px 12px; font-size:13px; background:var(--surface)" ${n ? '' : 'disabled'}>Desmarcar</button>
        <button class="btn btn--ghost" id="${pre}-ver" style="padding:8px 12px; font-size:13px; background:var(--surface)" ${n ? '' : 'disabled'}>Visualizar</button>
        <button class="btn btn--primary" id="${pre}-pdf" style="padding:8px 14px; font-size:13px" ${n ? '' : 'disabled'}>Gerar PDF</button>
      </div>
      <div class="row__meta" id="${pre}-status" style="flex-basis:100%">${n ? 'Na janela de impressão, escolha "Salvar como PDF".' : cfg.dica}</div>
    </div>
  `;
  const status = (msg) => {
    const el = document.getElementById(`${pre}-status`);
    if (el) el.textContent = msg;
  };
  document.getElementById(`${pre}-todos`).addEventListener('click', () => {
    (est._visiveis || []).forEach((id) => est.selecionados.add(id));
    cfg.aoMudar();
  });
  document.getElementById(`${pre}-limpar`).addEventListener('click', () => {
    est.selecionados.clear();
    const previa = document.getElementById(cfg.previaId);
    if (previa) previa.innerHTML = '';
    cfg.aoMudar();
  });
  const montar = async () => {
    status('Montando as páginas…');
    return cfg.montar(Array.from(est.selecionados));
  };
  document.getElementById(`${pre}-ver`).addEventListener('click', async () => {
    const paginas = await montar();
    mostrarPreviaRelatorio(document.getElementById(cfg.previaId));
    status(`Prévia pronta: ${paginas} página(s).`);
  });
  document.getElementById(`${pre}-pdf`).addEventListener('click', async () => {
    const paginas = await montar();
    status(`${paginas} página(s). Abrindo a impressão — escolha "Salvar como PDF".`);
    imprimirRelatorio();
  });
}

// monta as folhas A4 com o cabeçalho padrão e espera as imagens carregarem
async function montarPdfPadrao(blocos, cab) {
  const root = garantirPrintRoot();
  const n = paginarRelatorio(root, blocos, {
    geradoEm: Const.formatarDataHora(Date.now()),
    detalhes: '',
    ...cab,
  });
  await esperarImagens(root);
  return n;
}

// texto com quebras de linha → blocos de parágrafo (texto comprido
// quebra de página em vez de ser cortado)
function paragrafosPdf(texto) {
  return String(texto || '')
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => ({ tipo: 'html', html: `<p class="rp-texto">${escapeHtml(p).replace(/\n/g, '<br>')}</p>` }));
}
