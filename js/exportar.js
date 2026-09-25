/* =========================================================
   exportar.js — planilha (.xlsx e .csv) sem biblioteca externa
   Sem identidade visual: uma linha de contexto no topo (o que foi
   filtrado + data de geração) e depois a tabela limpa, uma coluna
   por campo, pronta pra usar no Excel.

   O .xlsx é montado à mão (é um .zip com alguns XML dentro), com
   números como número e datas como data de verdade — dá pra somar,
   filtrar e ordenar direto no Excel.
   ========================================================= */

const Exportar = {
  COLUNAS: [
    { chave: 'dataFinal', titulo: 'Data de conclusão', tipo: 'data', largura: 14 },
    { chave: 'categoria', titulo: 'Categoria', tipo: 'texto', largura: 20 },
    { chave: 'nome', titulo: 'Nome do serviço / móvel', tipo: 'texto', largura: 40 },
    { chave: 'numeroPedido', titulo: 'Nº pedido', tipo: 'texto', largura: 12 },
    { chave: 'funcionarioNome', titulo: 'Funcionário', tipo: 'texto', largura: 20 },
    { chave: 'materialNome', titulo: 'Material', tipo: 'texto', largura: 26 },
    { chave: 'materialTipo', titulo: 'Tipo de material', tipo: 'texto', largura: 12 },
    { chave: 'materialLargura', titulo: 'Largura do material (cm)', tipo: 'numero', largura: 12 },
    { chave: 'dataProgramada', titulo: 'Data programada', tipo: 'data', largura: 14 },
    { chave: 'situacaoPrazo', titulo: 'Situação do prazo', tipo: 'texto', largura: 18 },
    { chave: 'erros', titulo: 'Erros', tipo: 'numero', largura: 8 },
    { chave: 'errosNovos', titulo: 'Erros novos', tipo: 'numero', largura: 10 },
    { chave: 'aproveitamento', titulo: '% Aproveitamento', tipo: 'numero', largura: 12 },
    { chave: 'desperdicio', titulo: '% Desperdício', tipo: 'numero', largura: 12 },
    { chave: 'atelie', titulo: 'Situação no ateliê', tipo: 'texto', largura: 16 },
    { chave: 'atelieObs', titulo: 'Obs. do ateliê', tipo: 'texto', largura: 28 },
    { chave: 'origem', titulo: 'Origem', tipo: 'texto', largura: 12 },
  ],

  colunas(opcoes) {
    return opcoes && opcoes.semFuncionario ? this.COLUNAS.filter((c) => c.chave !== 'funcionarioNome') : this.COLUNAS;
  },

  linhas(itens) {
    return itens.map((i) => ({
      dataFinal: i.dataFinal,
      categoria: i.categoria,
      nome: i.nome,
      numeroPedido: i.numeroPedido,
      funcionarioNome: i.funcionarioNome,
      materialNome: i.materialNome,
      materialTipo: i.materialTipo,
      materialLargura: i.materialLargura,
      dataProgramada: i.dataProgramada,
      situacaoPrazo: Analise.situacaoPrazo(i),
      erros: i.erros,
      errosNovos: i.errosNovos,
      aproveitamento: i.aproveitamento,
      desperdicio: Analise.desperdicio(i),
      atelie: i.atelie || '',
      atelieObs: i.atelieObs || '',
      origem: i.origem === 'corte' ? 'Aba Corte' : 'Serviços',
    }));
  },

  nomeArquivo(extensao) {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `engenharia-aluminas-dados-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}.${extensao}`;
  },

  baixar(blob, nome) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nome;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  },

  /* ---------- CSV (ponto e vírgula + BOM: abre direto no Excel em português) ---------- */

  gerarCSV(itens, contexto, opcoes) {
    const COLUNAS = this.colunas(opcoes);
    const esc = (v) => {
      const s = v == null ? '' : String(v);
      return /[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const valor = (col, v) => {
      if (v == null || v === '') return '';
      if (col.tipo === 'data') return formatarDataCurta(v);
      if (col.tipo === 'numero') return String(v).replace('.', ',');
      return v;
    };
    const linhas = [];
    linhas.push(esc(contexto));
    linhas.push('');
    linhas.push(COLUNAS.map((c) => esc(c.titulo)).join(';'));
    this.linhas(itens).forEach((l) => linhas.push(COLUNAS.map((c) => esc(valor(c, l[c.chave]))).join(';')));
    return new Blob(['\uFEFF' + linhas.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  },

  /* ---------- XLSX ---------- */

  gerarXLSX(itens, contexto, opcoes) {
    const COLUNAS = this.colunas(opcoes);
    const xmlEsc = (s) =>
      String(s ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        // remove caracteres de controle que o Excel não aceita em XML
        .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
    const colLetra = (n) => {
      let s = '';
      n++;
      while (n > 0) {
        const r = (n - 1) % 26;
        s = String.fromCharCode(65 + r) + s;
        n = Math.floor((n - 1) / 26);
      }
      return s;
    };
    // data do Excel = dias desde 30/12/1899 (usando o dia LOCAL, sem fuso)
    const serialData = (ts) => {
      const d = new Date(ts);
      return (Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(1899, 11, 30)) / 86400000;
    };
    const celTexto = (ref, v) => `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xmlEsc(v)}</t></is></c>`;

    const rows = [];
    rows.push(`<row r="1">${celTexto('A1', contexto)}</row>`);
    rows.push(`<row r="3">${COLUNAS.map((c, i) => celTexto(`${colLetra(i)}3`, c.titulo)).join('')}</row>`);
    this.linhas(itens).forEach((l, idx) => {
      const r = idx + 4;
      const cels = COLUNAS.map((c, i) => {
        const ref = `${colLetra(i)}${r}`;
        const v = l[c.chave];
        if (v == null || v === '') return '';
        if (c.tipo === 'data') return `<c r="${ref}" s="1"><v>${serialData(v)}</v></c>`;
        if (c.tipo === 'numero' && !isNaN(Number(v))) return `<c r="${ref}"><v>${Number(v)}</v></c>`;
        return celTexto(ref, v);
      }).join('');
      rows.push(`<row r="${r}">${cels}</row>`);
    });

    const ultimaLinha = Math.max(3, itens.length + 3);
    const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheetViews><sheetView workbookViewId="0"><pane ySplit="3" topLeftCell="A4" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
<cols>${COLUNAS.map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${c.largura}" customWidth="1"/>`).join('')}</cols>
<sheetData>${rows.join('')}</sheetData>
<autoFilter ref="A3:${colLetra(COLUNAS.length - 1)}${ultimaLinha}"/>
</worksheet>`;

    const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets><sheet name="Dados" sheetId="1" r:id="rId1"/></sheets>
<definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">Dados!$A$3:$${colLetra(COLUNAS.length - 1)}$${ultimaLinha}</definedName></definedNames>
</workbook>`;

    const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts>
<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="14" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

    const arquivos = [
      {
        nome: '[Content_Types].xml',
        conteudo: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`,
      },
      {
        nome: '_rels/.rels',
        conteudo: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`,
      },
      {
        nome: 'xl/_rels/workbook.xml.rels',
        conteudo: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`,
      },
      { nome: 'xl/workbook.xml', conteudo: workbook },
      { nome: 'xl/styles.xml', conteudo: styles },
      { nome: 'xl/worksheets/sheet1.xml', conteudo: sheet },
    ];

    const zip = montarZipSemCompressao(arquivos);
    return new Blob([zip], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  },
};

/* ---------- ZIP mínimo (método "store", sem compressão) ---------- */

const TABELA_CRC32 = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = TABELA_CRC32[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function montarZipSemCompressao(arquivos) {
  const enc = new TextEncoder();
  const partes = [];
  const central = [];
  let offset = 0;

  const agora = new Date();
  const dosTime = (agora.getHours() << 11) | (agora.getMinutes() << 5) | Math.floor(agora.getSeconds() / 2);
  const dosDate = ((agora.getFullYear() - 1980) << 9) | ((agora.getMonth() + 1) << 5) | agora.getDate();

  arquivos.forEach((arq) => {
    const nomeBytes = enc.encode(arq.nome);
    const dados = enc.encode(arq.conteudo);
    const crc = crc32(dados);

    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true); // nomes em UTF-8
    local.setUint16(8, 0, true); // sem compressão
    local.setUint16(10, dosTime, true);
    local.setUint16(12, dosDate, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, dados.length, true);
    local.setUint32(22, dados.length, true);
    local.setUint16(26, nomeBytes.length, true);
    local.setUint16(28, 0, true);
    partes.push(new Uint8Array(local.buffer), nomeBytes, dados);

    const cd = new DataView(new ArrayBuffer(46));
    cd.setUint32(0, 0x02014b50, true);
    cd.setUint16(4, 20, true);
    cd.setUint16(6, 20, true);
    cd.setUint16(8, 0x0800, true);
    cd.setUint16(10, 0, true);
    cd.setUint16(12, dosTime, true);
    cd.setUint16(14, dosDate, true);
    cd.setUint32(16, crc, true);
    cd.setUint32(20, dados.length, true);
    cd.setUint32(24, dados.length, true);
    cd.setUint16(28, nomeBytes.length, true);
    cd.setUint16(30, 0, true);
    cd.setUint16(32, 0, true);
    cd.setUint16(34, 0, true);
    cd.setUint16(36, 0, true);
    cd.setUint32(38, 0, true);
    cd.setUint32(42, offset, true);
    central.push(new Uint8Array(cd.buffer), nomeBytes);

    offset += 30 + nomeBytes.length + dados.length;
  });

  const tamanhoCentral = central.reduce((s, p) => s + p.length, 0);
  const fim = new DataView(new ArrayBuffer(22));
  fim.setUint32(0, 0x06054b50, true);
  fim.setUint16(4, 0, true);
  fim.setUint16(6, 0, true);
  fim.setUint16(8, arquivos.length, true);
  fim.setUint16(10, arquivos.length, true);
  fim.setUint32(12, tamanhoCentral, true);
  fim.setUint32(16, offset, true);
  fim.setUint16(20, 0, true);

  const todas = [...partes, ...central, new Uint8Array(fim.buffer)];
  const total = todas.reduce((s, p) => s + p.length, 0);
  const saida = new Uint8Array(total);
  let pos = 0;
  todas.forEach((p) => {
    saida.set(p, pos);
    pos += p.length;
  });
  return saida;
}

window.Exportar = Exportar;
