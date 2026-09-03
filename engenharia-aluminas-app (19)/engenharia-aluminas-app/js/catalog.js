/* =========================================================
   catalog.js — catálogo de itens já cadastrados
   (Tecido, Tela, Espuma, Chapa, Tubo, Móvel)

   Objetivo: antes de cadastrar algo, o funcionário busca aqui.
   Se já existir, o app oferece "Atualizar" em vez de deixar
   cadastrar de novo — guardando data do cadastro original e o
   histórico completo de atualizações (pode ser mais de uma).
   ========================================================= */

const Catalog = {
  normaliza(nome) {
    return (nome || '').trim().toLowerCase();
  },

  async buscar(categoria, termo) {
    const todos = await DB.getAll('catalogo_itens');
    const alvo = this.normaliza(termo);
    return todos
      .filter((it) => it.categoria === categoria)
      .filter((it) => !alvo || this.normaliza(it.nome).includes(alvo))
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  },

  async encontrarExato(categoria, nome) {
    const todos = await DB.getAll('catalogo_itens');
    const alvo = this.normaliza(nome);
    return (
      todos.find(
        (it) => it.categoria === categoria && this.normaliza(it.nome) === alvo
      ) || null
    );
  },

  async cadastrarNovo(categoria, nome, autor) {
    const existente = await this.encontrarExato(categoria, nome);
    if (existente) {
      throw new Error('DUPLICADO');
    }
    const item = {
      id: dbUtil.uid(),
      categoria,
      nome: nome.trim(),
      criadoEm: Date.now(),
      criadoPor: autor?.nome || '—',
      atualizacoes: [],
    };
    await DB.put('catalogo_itens', item);
    return item;
  },

  async registrarAtualizacao(itemId, autor, observacao) {
    const item = await DB.get('catalogo_itens', itemId);
    if (!item) throw new Error('Item não encontrado.');
    item.atualizacoes = item.atualizacoes || [];
    item.atualizacoes.push({
      data: Date.now(),
      por: autor?.nome || '—',
      observacao: observacao || '',
    });
    await DB.put('catalogo_itens', item);
    return item;
  },

  ultimaAtualizacao(item) {
    if (!item.atualizacoes || item.atualizacoes.length === 0) return null;
    return item.atualizacoes[item.atualizacoes.length - 1];
  },
};

window.Catalog = Catalog;
