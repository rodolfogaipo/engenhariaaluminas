/* =========================================================
   permissoes.js — permissão por aba, por pessoa
   O "tipo" do usuário (Funcionário / PCP / MKT / Admin) continua
   existindo, mas agora só serve de MODELO: cada tipo vem com um
   conjunto de abas pré-marcado, e o Admin pode ajustar pessoa por
   pessoa (caixinhas na criação/edição do usuário).

   Usuários antigos, que ainda não têm o campo `permissoes`, herdam
   automaticamente o padrão do tipo deles — nada muda pra eles até
   o Admin editar.

   O Admin sempre vê tudo (inclusive Relatório e o painel Admin).
   ========================================================= */

const Permissoes = {
  // abas que podem ser liberadas por caixinha (ordem = ordem no menu)
  ABAS: [
    { id: 'dashboard', label: 'Início' },
    { id: 'servicos', label: 'Serviços' },
    { id: 'corte', label: 'Corte' },
    { id: 'avisos', label: 'Avisos' },
    { id: 'ferias', label: 'Férias' },
    { id: 'mkt', label: 'MKT' },
    { id: 'treino', label: 'Treino' },
    { id: 'materiais', label: 'Materiais' },
    { id: 'raiox', label: 'Raio-X' },
  ],

  // abas exclusivas do Admin (não aparecem nas caixinhas)
  ABAS_SO_ADMIN: ['relatorio', 'admin'],

  PADRAO_POR_TIPO: {
    funcionario: {
      abas: ['dashboard', 'servicos', 'corte', 'avisos', 'ferias', 'mkt', 'treino', 'materiais', 'raiox'],
      somenteLeitura: false,
    },
    // PCP: igual era antes — Serviços e Corte só com os concluídos, sem
    // poder lançar/editar nada, e a aba MKT
    pcp: {
      abas: ['servicos', 'corte', 'mkt'],
      somenteLeitura: true,
    },
    mkt: {
      abas: ['mkt'],
      somenteLeitura: false,
    },
    admin: {
      abas: ['dashboard', 'servicos', 'corte', 'avisos', 'ferias', 'mkt', 'treino', 'materiais', 'raiox'],
      somenteLeitura: false,
    },
  },

  padraoDoTipo(tipo) {
    const p = this.PADRAO_POR_TIPO[tipo] || this.PADRAO_POR_TIPO.funcionario;
    return { abas: [...p.abas], somenteLeitura: !!p.somenteLeitura };
  },

  // permissões efetivas de um usuário (salvas ou, se não tiver, o padrão do tipo)
  doUsuario(user) {
    if (!user) return { abas: [], somenteLeitura: false };
    if (user.tipo === 'admin') {
      return { abas: [...this.ABAS.map((a) => a.id), ...this.ABAS_SO_ADMIN], somenteLeitura: false };
    }
    const p = user.permissoes;
    if (p && Array.isArray(p.abas)) {
      return {
        abas: p.abas.filter((id) => this.ABAS.some((a) => a.id === id)),
        somenteLeitura: !!p.somenteLeitura,
      };
    }
    return this.padraoDoTipo(user.tipo);
  },

  // true se as permissões salvas diferem do padrão do tipo
  ehPersonalizado(user) {
    if (!user || !user.permissoes || user.tipo === 'admin') return false;
    const atual = this.doUsuario(user);
    const padrao = this.padraoDoTipo(user.tipo);
    const mesmoConjunto =
      atual.abas.length === padrao.abas.length && atual.abas.every((a) => padrao.abas.includes(a));
    return !mesmoConjunto || atual.somenteLeitura !== padrao.somenteLeitura;
  },

  podeVer(user, abaId) {
    return this.doUsuario(user).abas.includes(abaId);
  },

  somenteLeitura(user) {
    if (!user || user.tipo === 'admin') return false;
    return this.doUsuario(user).somenteLeitura;
  },
};

window.Permissoes = Permissoes;
