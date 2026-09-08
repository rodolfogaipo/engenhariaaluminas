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

  // Nome como aparece na planilha → nome real já cadastrado no app.
  // Evita recriar os apelidos como usuários separados numa nova importação.
  NOME_REAL: {
    'Máyra': 'Máyra Fernada Amaral de Souza',
    'Marco Túlio': 'Marco Túlio Nascimento da Costa',
    'Leandrinho': 'Kauan Gustavo de Jesus Silva',
  },

  nomeReal(nomeDaPlanilha) {
    return this.NOME_REAL[nomeDaPlanilha] || nomeDaPlanilha;
  },

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
    for (const apelido of this.FUNCIONARIOS_ESPERADOS) {
      const nome = this.nomeReal(apelido);
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
    return porNome; // nome real -> registro do usuário
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
      const usuario = usuariosPorNome[this.nomeReal(s.funcionarioNome)];
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
        funcionarioNome: this.nomeReal(s.funcionarioNome),
        aprovado: 'aprovado',
        dataAprovacao: s.dataAprovacao || s.dataFinal || s.criadoEm || null,
        criadoEm: s.criadoEm || s.dataProgramada || s.dataFinal || null,
        semDataOriginal: !s.criadoEm,
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
      const usuCNP = usuariosPorNome[this.nomeReal(p.funcionarioCNPNome)];
      const usuCorte = usuariosPorNome[this.nomeReal(p.funcionarioCorteNome)];
      return {
        id: dbUtil.uid(),
        cnpServicoId: numeroPedidoParaCnpId[p.numeroPedido] || null,
        numeroPedido: p.numeroPedido || '',
        nomeProduto: p.nomeProduto,
        dataChegada: p.dataChegada || null,
        dataProgramada: p.dataProgramada || null,
        funcionarioCNPId: usuCNP ? usuCNP.id : null,
        funcionarioCNPNome: p.funcionarioCNPNome ? this.nomeReal(p.funcionarioCNPNome) : null,
        status: p.status,
        dataInicioCorte: p.dataInicioCorte || null,
        dataFinalCorte: p.dataFinalCorte || null,
        funcionarioCorteId: usuCorte ? usuCorte.id : null,
        funcionarioCorteNome: p.funcionarioCorteNome ? this.nomeReal(p.funcionarioCorteNome) : null,
        aprovado: 'aprovado',
        dataAprovacao: p.dataFinalCorte || p.dataChegada || null,
        criadoEm: p.dataChegada || null,
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

  async remover(onProgresso) {
    onProgresso?.('Removendo serviços importados…');
    const servicos = await DB.getAll('servicos');
    const idsServicos = servicos.filter((s) => s.importadoDaPlanilha).map((s) => s.id);
    if (idsServicos.length > 0) await DB.deleteMany('servicos', idsServicos);

    onProgresso?.('Removendo Plano de Corte importado…');
    const planoCorte = await DB.getAll('plano_corte');
    const idsPlanoCorte = planoCorte.filter((p) => p.importadoDaPlanilha).map((p) => p.id);
    if (idsPlanoCorte.length > 0) await DB.deleteMany('plano_corte', idsPlanoCorte);

    await DB.delete('config', 'planilha_importada_em');
    onProgresso?.('Removido.');
  },
};

window.SeedImport = SeedImport;

/* =========================================================
   Correção pontual: a importação da planilha criou usuários com
   nome curto (Máyra, Marco Túlio, Leandrinho) porque era assim que
   apareciam nas abas da planilha. Rodolfo já tinha cadastrado esses
   funcionários no app com o nome completo. Esta função re-liga todo
   o histórico importado para as contas reais e apaga as duplicatas.
   ========================================================= */

const CorrigirFuncionarios = {
  MAPEAMENTO: [
    { apelido: 'Máyra', nomeReal: 'Máyra Fernada Amaral de Souza' },
    { apelido: 'Marco Túlio', nomeReal: 'Marco Túlio Nascimento da Costa' },
    { apelido: 'Leandrinho', nomeReal: 'Kauan Gustavo de Jesus Silva' },
  ],

  async precisaCorrigir() {
    const usuarios = await DB.getAll('usuarios');
    const nomes = new Set(usuarios.map((u) => u.nome));
    return this.MAPEAMENTO.some((m) => nomes.has(m.apelido) && nomes.has(m.nomeReal));
  },

  async executar(onProgresso) {
    const usuarios = await DB.getAll('usuarios');
    const porNome = Object.fromEntries(usuarios.map((u) => [u.nome, u]));

    const pares = this.MAPEAMENTO.filter((m) => porNome[m.apelido] && porNome[m.nomeReal]);
    if (pares.length === 0) {
      onProgresso?.('Nada para corrigir.');
      return { corrigidos: 0 };
    }

    const [servicos, planoCorte, ferias, avisos] = await Promise.all([
      DB.getAll('servicos'),
      DB.getAll('plano_corte'),
      DB.getAll('ferias'),
      DB.getAll('avisos'),
    ]);

    const servicosParaAtualizar = [];
    const corteParaAtualizar = [];
    const feriasParaAtualizar = [];
    const avisosParaAtualizar = [];

    for (const par of pares) {
      onProgresso?.(`Corrigindo ${par.apelido} → ${par.nomeReal}…`);
      const de = porNome[par.apelido];
      const para = porNome[par.nomeReal];

      servicos.forEach((s) => {
        if (s.funcionarioId === de.id) {
          s.funcionarioId = para.id;
          s.funcionarioNome = para.nome;
          servicosParaAtualizar.push(s);
        }
      });

      planoCorte.forEach((p) => {
        let mudou = false;
        if (p.funcionarioCNPId === de.id) {
          p.funcionarioCNPId = para.id;
          p.funcionarioCNPNome = para.nome;
          mudou = true;
        }
        if (p.funcionarioCorteId === de.id) {
          p.funcionarioCorteId = para.id;
          p.funcionarioCorteNome = para.nome;
          mudou = true;
        }
        if (mudou) corteParaAtualizar.push(p);
      });

      ferias.forEach((f) => {
        if (f.funcionarioId === de.id) {
          f.funcionarioId = para.id;
          f.funcionarioNome = para.nome;
          feriasParaAtualizar.push(f);
        }
      });

      avisos.forEach((a) => {
        if (!a.vistoPor) return;
        let mudou = false;
        a.vistoPor.forEach((v) => {
          if (v.userId === de.id) {
            v.userId = para.id;
            v.nome = para.nome;
            mudou = true;
          }
        });
        if (mudou) avisosParaAtualizar.push(a);
      });
    }

    onProgresso?.('Gravando correções…');
    if (servicosParaAtualizar.length) await DB.putMany('servicos', servicosParaAtualizar);
    if (corteParaAtualizar.length) await DB.putMany('plano_corte', corteParaAtualizar);
    if (feriasParaAtualizar.length) await DB.putMany('ferias', feriasParaAtualizar);
    if (avisosParaAtualizar.length) await DB.putMany('avisos', avisosParaAtualizar);

    for (const par of pares) {
      await DB.delete('usuarios', porNome[par.apelido].id);
    }

    onProgresso?.('Concluído!');
    return {
      corrigidos: pares.length,
      servicos: servicosParaAtualizar.length,
      corte: corteParaAtualizar.length,
    };
  },
};

window.CorrigirFuncionarios = CorrigirFuncionarios;

/* =========================================================
   Mesclagem genérica de usuários duplicados — cobre qualquer nome
   que apareça repetido em "usuarios" (ex: duas contas "Administrador"
   criadas quase ao mesmo tempo em dois aparelhos diferentes antes da
   sincronização acontecer). A conta mais antiga (criadoEm menor) é a
   que fica; o histórico das outras é religado a ela, e as duplicatas
   são apagadas.
   ========================================================= */

const MesclarDuplicados = {
  async detectar() {
    const usuarios = await DB.getAll('usuarios');
    const porNome = {};
    usuarios.forEach((u) => {
      (porNome[u.nome] = porNome[u.nome] || []).push(u);
    });
    return Object.values(porNome).filter((grupo) => grupo.length > 1);
  },

  async executar(onProgresso) {
    const grupos = await this.detectar();
    if (grupos.length === 0) {
      onProgresso?.('Nenhuma duplicata encontrada.');
      return { mesclados: 0 };
    }

    const [servicos, planoCorte, ferias, avisos] = await Promise.all([
      DB.getAll('servicos'),
      DB.getAll('plano_corte'),
      DB.getAll('ferias'),
      DB.getAll('avisos'),
    ]);

    const servicosParaAtualizar = [];
    const corteParaAtualizar = [];
    const feriasParaAtualizar = [];
    const avisosParaAtualizar = [];
    const idsParaExcluir = [];

    for (const grupo of grupos) {
      grupo.sort((a, b) => (a.criadoEm || 0) - (b.criadoEm || 0));
      const principal = grupo[0];
      const duplicatas = grupo.slice(1);
      onProgresso?.(`Mesclando ${duplicatas.length} conta(s) duplicada(s) de "${principal.nome}"…`);

      for (const dup of duplicatas) {
        servicos.forEach((s) => {
          if (s.funcionarioId === dup.id) {
            s.funcionarioId = principal.id;
            s.funcionarioNome = principal.nome;
            servicosParaAtualizar.push(s);
          }
        });
        planoCorte.forEach((p) => {
          let mudou = false;
          if (p.funcionarioCNPId === dup.id) {
            p.funcionarioCNPId = principal.id;
            p.funcionarioCNPNome = principal.nome;
            mudou = true;
          }
          if (p.funcionarioCorteId === dup.id) {
            p.funcionarioCorteId = principal.id;
            p.funcionarioCorteNome = principal.nome;
            mudou = true;
          }
          if (mudou) corteParaAtualizar.push(p);
        });
        ferias.forEach((f) => {
          if (f.funcionarioId === dup.id) {
            f.funcionarioId = principal.id;
            f.funcionarioNome = principal.nome;
            feriasParaAtualizar.push(f);
          }
        });
        avisos.forEach((a) => {
          if (!a.vistoPor) return;
          let mudou = false;
          a.vistoPor.forEach((v) => {
            if (v.userId === dup.id) {
              v.userId = principal.id;
              v.nome = principal.nome;
              mudou = true;
            }
          });
          if (mudou) avisosParaAtualizar.push(a);
        });
        idsParaExcluir.push(dup.id);
      }
    }

    onProgresso?.('Gravando correções…');
    if (servicosParaAtualizar.length) await DB.putMany('servicos', servicosParaAtualizar);
    if (corteParaAtualizar.length) await DB.putMany('plano_corte', corteParaAtualizar);
    if (feriasParaAtualizar.length) await DB.putMany('ferias', feriasParaAtualizar);
    if (avisosParaAtualizar.length) await DB.putMany('avisos', avisosParaAtualizar);
    for (const id of idsParaExcluir) {
      await DB.delete('usuarios', id);
    }

    onProgresso?.('Concluído!');
    return { mesclados: idsParaExcluir.length };
  },
};

const RemoverDuplicados = {
  // chave de "conteúdo idêntico" — ignora o id (aleatório) e usa tudo
  // mais. Reimportações da mesma planilha geram cópias com todos os
  // campos idênticos, então isso pega exatamente esses casos, sem
  // risco de apagar dois serviços diferentes que só coincidem no nome
  // (ex: vários cortes "C1" no mesmo dia pra mesma pessoa são peças
  // diferentes de verdade, não duplicatas — por isso a chave é rígida).
  chaveServico(s) {
    return [
      s.tipo, s.numeroPedido, s.nome, s.dataProgramada, s.dataFinal,
      s.funcionarioNome, s.observacoes, s.percentualAproveitamento,
      s.criadoEm, s.erros, s.errosNovos,
    ].join('|');
  },
  chavePlanoCorte(p) {
    return [
      p.numeroPedido, p.nomeProduto, p.dataChegada, p.dataProgramada,
      p.funcionarioCNPNome, p.status, p.dataInicioCorte, p.dataFinalCorte,
      p.funcionarioCorteNome,
    ].join('|');
  },

  async detectar() {
    // busca direto do servidor, ignorando qualquer cache local — pra
    // sempre refletir o que está realmente salvo, não o que esse
    // aparelho específico guardou
    const [servicos, planoCorte] = await Promise.all([
      DB.getAllFromServer('servicos'),
      DB.getAllFromServer('plano_corte'),
    ]);

    const gruposServicos = {};
    servicos.forEach((s) => {
      const chave = this.chaveServico(s);
      (gruposServicos[chave] = gruposServicos[chave] || []).push(s);
    });
    const gruposCorte = {};
    planoCorte.forEach((p) => {
      const chave = this.chavePlanoCorte(p);
      (gruposCorte[chave] = gruposCorte[chave] || []).push(p);
    });

    const duplicadosServicos = Object.values(gruposServicos).filter((g) => g.length > 1);
    const duplicadosCorte = Object.values(gruposCorte).filter((g) => g.length > 1);
    const extraServicos = duplicadosServicos.reduce((acc, g) => acc + (g.length - 1), 0);
    const extraCorte = duplicadosCorte.reduce((acc, g) => acc + (g.length - 1), 0);

    return { duplicadosServicos, duplicadosCorte, extraServicos, extraCorte };
  },

  async executar(onProgresso) {
    const { duplicadosServicos, duplicadosCorte } = await this.detectar();

    const idsServicos = [];
    for (const grupo of duplicadosServicos) {
      grupo.sort((a, b) => (a.criadoEm || 0) - (b.criadoEm || 0));
      grupo.slice(1).forEach((dup) => idsServicos.push(dup.id)); // mantém o primeiro, marca o resto
    }
    const idsCorte = [];
    for (const grupo of duplicadosCorte) {
      grupo.sort((a, b) => (a.criadoEm || 0) - (b.criadoEm || 0));
      grupo.slice(1).forEach((dup) => idsCorte.push(dup.id));
    }

    if (idsServicos.length > 0) {
      onProgresso?.(`Removendo ${idsServicos.length} serviço(s) duplicado(s) em lote…`);
      await DB.deleteMany('servicos', idsServicos);
    }
    if (idsCorte.length > 0) {
      onProgresso?.(`Removendo ${idsCorte.length} registro(s) de Plano de Corte duplicado(s) em lote…`);
      await DB.deleteMany('plano_corte', idsCorte);
    }

    onProgresso?.('Concluído!');
    return { removidos: idsServicos.length + idsCorte.length };
  },
};

window.RemoverDuplicados = RemoverDuplicados;
