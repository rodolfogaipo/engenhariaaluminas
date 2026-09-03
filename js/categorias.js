/* =========================================================
   categorias.js — Categorias de Serviço (dinâmico)
   Substitui a lista fixa de tipos de serviço. O Admin pode criar
   novas categorias e escolher, na hora de criar, se ela vai ter
   indicador de % de Aproveitamento — todas as que tiverem usam o
   mesmo indicador, pra dar pra fazer o levantamento junto.
   ========================================================= */

const Categorias = {
  // Categorias padrão do sistema — semeadas na primeira vez que o
  // app roda. categoriaCadastro liga a categoria ao Catálogo (pra
  // evitar cadastro duplicado de tecido/tela/espuma/chapa/tubo/móvel).
  PADRAO: [
    { nome: 'CNP', temPorcentagem: false, categoriaCadastro: null },
    { nome: 'Plano de Corte', temPorcentagem: false, categoriaCadastro: null },
    { nome: 'Corte Tecido', temPorcentagem: true, categoriaCadastro: null },
    { nome: 'Corte Espuma', temPorcentagem: true, categoriaCadastro: null },
    { nome: 'Corte Tela', temPorcentagem: true, categoriaCadastro: null },
    { nome: 'Corte Outline', temPorcentagem: true, categoriaCadastro: null },
    { nome: 'Corte Couro', temPorcentagem: true, categoriaCadastro: null },
    { nome: 'Cadastro Tecido', temPorcentagem: false, categoriaCadastro: 'Tecido' },
    { nome: 'Cadastro Tela', temPorcentagem: false, categoriaCadastro: 'Tela' },
    { nome: 'Cadastro Espuma', temPorcentagem: false, categoriaCadastro: 'Espuma' },
    { nome: 'Cadastro Chapas', temPorcentagem: false, categoriaCadastro: 'Chapa' },
    { nome: 'Cadastro Tubo', temPorcentagem: false, categoriaCadastro: 'Tubo' },
    { nome: 'Cadastro Móveis', temPorcentagem: false, categoriaCadastro: 'Móvel' },
    { nome: 'Teste Laser Alumínio', temPorcentagem: false, categoriaCadastro: null },
    { nome: 'Teste Corte Tecido', temPorcentagem: false, categoriaCadastro: null },
    { nome: 'Outros', temPorcentagem: false, categoriaCadastro: null },
    { nome: 'Serviço Interno', temPorcentagem: false, categoriaCadastro: null },
  ],

  async listar() {
    let itens = await DB.getAll('categorias_servico');
    if (itens.length === 0) {
      itens = await this.semear();
    }
    return itens.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  },

  async semear() {
    const registros = this.PADRAO.map((p) => ({
      id: dbUtil.uid(),
      nome: p.nome,
      temPorcentagem: p.temPorcentagem,
      categoriaCadastro: p.categoriaCadastro,
      sistema: true,
      criadoEm: Date.now(),
    }));
    await DB.putMany('categorias_servico', registros);
    return registros;
  },

  encontrar(itens, nome) {
    return itens.find((c) => c.nome === nome) || null;
  },

  temPorcentagem(itens, nome) {
    const c = this.encontrar(itens, nome);
    return c ? !!c.temPorcentagem : false;
  },

  categoriaCadastroDe(itens, nome) {
    const c = this.encontrar(itens, nome);
    return c ? c.categoriaCadastro : null;
  },

  async criar(nome, temPorcentagem) {
    nome = (nome || '').trim();
    if (!nome) throw new Error('Digite o nome da categoria.');
    const itens = await DB.getAll('categorias_servico');
    if (itens.some((c) => c.nome.toLowerCase() === nome.toLowerCase())) {
      throw new Error('Já existe uma categoria com esse nome.');
    }
    const registro = {
      id: dbUtil.uid(),
      nome,
      temPorcentagem: !!temPorcentagem,
      categoriaCadastro: null,
      sistema: false,
      criadoEm: Date.now(),
    };
    await DB.put('categorias_servico', registro);
    return registro;
  },

  async remover(id) {
    const c = await DB.get('categorias_servico', id);
    if (c && c.sistema) throw new Error('Categorias padrão do sistema não podem ser excluídas.');
    await DB.delete('categorias_servico', id);
  },
};

window.Categorias = Categorias;
