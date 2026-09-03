/* =========================================================
   seed-import.js — importa os dados reais da planilha
   (CADASTRO DE SERVIÇOS + PLANO DE CORTE) pro banco local.

   Roda uma vez, sob comando do Admin (Admin → Mais Ferramentas).
   Cria os usuários Máyra, Marco Túlio e Leandrinho se ainda não
   existirem (senha padrão "123456", pra trocar depois), reaproveita
   o Administrador já existente, e escreve tudo em lote no IndexedDB.
   ========================================================= */

const SeedImport = {
  FUNCIONARIOS_ESPERADOS: ['Máyra', 'Marco Túlio', 'Leandrinho', 'Administrador'],

  async jaImportado() {
    const flag = await DB.get('config', 'planilha_importada_em');
    return !!flag;
  },

  slug(nome) {
    return nome
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z]/g, '');
  },

  async garantirUsuarios() {
    const usuarios = await DB.getAll('usuarios');
    const porNome = {};
    usuarios.forEach((u) => (porNome[u.nome] = u));

    const novos = [];
    for (const nome of this.FUNCIONARIOS_ESPERADOS) {
      if (porNome[nome]) continue;
      const login = this.slug(nome);
      const senhaHash = await dbUtil.sha256('123456');
      const novo = {
        id: dbUtil.uid(),
        nome,
        login,
        senhaHash,
        tipo: nome === 'Administrador' ? 'admin' : 'funcionario',
        foto: null,
        criadoEm: Date.now(),
      };
      novos.push(novo);
      porNome[nome] = novo;
    }
    if (novos.length > 0) await DB.putMany('usuarios', novos);
    return porNome; // nome -> registro do usuário
  },

  async importar(onProgresso) {
    onProgresso?.('Carregando planilha…');
    const resp = await fetch('data/seed-planilha.json');
    if (!resp.ok) throw new Error('Não encontrei o arquivo de dados da planilha.');
    const dados = await resp.json();

    onProgresso?.('Conferindo usuários…');
    const usuariosPorNome = await this.garantirUsuarios();

    onProgresso?.(`Preparando ${dados.servicos.length} serviços…`);
    const numeroPedidoParaCnpId = {};
    const registrosServicos = dados.servicos.map((s) => {
      const usuario = usuariosPorNome[s.funcionarioNome];
      const id = dbUtil.uid();
      if (s.tipo === 'CNP' && s.numeroPedido) {
        numeroPedidoParaCnpId[s.numeroPedido] = id;
      }
      const temFinal = !!s.dataFinal;
      return {
        id,
        tipo: s.tipo,
        numeroPedido: s.numeroPedido || '',
        nome: s.nome,
        dataProgramada: s.dataProgramada || null,
        dataFinal: s.dataFinal || null,
        observacoes: s.observacoes || '',
        percentualAproveitamento: s.percentualAproveitamento,
        catalogoItemId: null,
        acao: null,
        funcionarioId: usuario ? usuario.id : null,
        funcionarioNome: s.funcionarioNome,
        aprovado: 'aprovado',
        dataAprovacao: s.dataAprovacao || s.dataFinal || s.criadoEm || Date.now(),
        criadoEm: s.criadoEm || Date.now(),
        concluidoInformadoEm: temFinal ? s.dataFinal : null,
        validadoPeloAdmin: temFinal,
        validadoEm: temFinal ? s.dataFinal : null,
        erros: s.erros || 0,
        errosNovos: s.errosNovos || 0,
        importadoDaPlanilha: true,
      };
    });

    onProgresso?.('Gravando serviços no banco local…');
    await DB.putMany('servicos', registrosServicos);

    onProgresso?.(`Preparando ${dados.planoCorte.length} registros de Plano de Corte…`);
    const registrosCorte = dados.planoCorte.map((p) => {
      const usuCNP = usuariosPorNome[p.funcionarioCNPNome];
      const usuCorte = usuariosPorNome[p.funcionarioCorteNome];
      return {
        id: dbUtil.uid(),
        cnpServicoId: numeroPedidoParaCnpId[p.numeroPedido] || null,
        numeroPedido: p.numeroPedido || '',
        nomeProduto: p.nomeProduto,
        dataChegada: p.dataChegada || null,
        dataProgramada: p.dataProgramada || null,
        funcionarioCNPId: usuCNP ? usuCNP.id : null,
        funcionarioCNPNome: p.funcionarioCNPNome || null,
        status: p.status,
        dataInicioCorte: p.dataInicioCorte || null,
        dataFinalCorte: p.dataFinalCorte || null,
        funcionarioCorteId: usuCorte ? usuCorte.id : null,
        funcionarioCorteNome: p.funcionarioCorteNome || null,
        aprovado: 'aprovado',
        dataAprovacao: p.dataFinalCorte || p.dataChegada || Date.now(),
        criadoEm: p.dataChegada || Date.now(),
        importadoDaPlanilha: true,
      };
    });

    onProgresso?.('Gravando Plano de Corte no banco local…');
    await DB.putMany('plano_corte', registrosCorte);

    await DB.put('config', {
      chave: 'planilha_importada_em',
      valor: Date.now(),
      totalServicos: registrosServicos.length,
      totalPlanoCorte: registrosCorte.length,
    });

    onProgresso?.('Concluído!');
    return { totalServicos: registrosServicos.length, totalPlanoCorte: registrosCorte.length };
  },
};

window.SeedImport = SeedImport;
