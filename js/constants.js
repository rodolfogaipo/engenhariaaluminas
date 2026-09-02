/* =========================================================
   constants.js — listas compartilhadas entre os módulos
   ========================================================= */

// Tipos de serviço, na mesma linguagem do CADASTRO DE SERVIÇOS
const TIPOS_SERVICO = [
  'CNP',
  'Plano de Corte',
  'Corte Tecido',
  'Corte Espuma',
  'Cadastro Tecido',
  'Cadastro Tela',
  'Cadastro Espuma',
  'Cadastro Chapas',
  'Cadastro Tubo',
  'Cadastro Móveis',
  'Teste Laser Alumínio',
  'Teste Corte Tecido',
  'Outros',
  'Serviço Interno',
];

// Tipos que reclassificam livremente pelo Admin quando lançados como
// "Outros" ou "Serviço Interno"
const TIPOS_RECLASSIFICAVEIS = TIPOS_SERVICO.filter(
  (t) => t !== 'Outros' && t !== 'Serviço Interno'
);

// Tipos "Cadastro X" → categoria do Catálogo (evita lançar duas vezes o
// mesmo tecido/espuma/chapa/tubo/móvel)
const TIPO_SERVICO_PARA_CATALOGO = {
  'Cadastro Tecido': 'Tecido',
  'Cadastro Tela': 'Tela',
  'Cadastro Espuma': 'Espuma',
  'Cadastro Chapas': 'Chapa',
  'Cadastro Tubo': 'Tubo',
  'Cadastro Móveis': 'Móvel',
};

const CATEGORIAS_CATALOGO = ['Tecido', 'Tela', 'Espuma', 'Chapa', 'Tubo', 'Móvel'];

// Tipos que pedem % de aproveitamento (o valor que sai do programa de corte)
const TIPOS_COM_APROVEITAMENTO = ['Corte Tecido', 'Corte Espuma'];

function ehTipoCadastro(tipo) {
  return Object.prototype.hasOwnProperty.call(TIPO_SERVICO_PARA_CATALOGO, tipo);
}

function ehTipoCorteComAproveitamento(tipo) {
  return TIPOS_COM_APROVEITAMENTO.includes(tipo);
}

function formatarData(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  return d.toLocaleDateString('pt-BR');
}

function formatarDataHora(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  return d.toLocaleDateString('pt-BR') + ' às ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

window.Const = {
  TIPOS_SERVICO,
  TIPOS_RECLASSIFICAVEIS,
  TIPO_SERVICO_PARA_CATALOGO,
  CATEGORIAS_CATALOGO,
  TIPOS_COM_APROVEITAMENTO,
  ehTipoCadastro,
  ehTipoCorteComAproveitamento,
  formatarData,
  formatarDataHora,
};
