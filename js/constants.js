/* =========================================================
   constants.js — utilitários compartilhados entre os módulos
   (a lista de tipos de serviço agora é dinâmica — ver categorias.js)
   ========================================================= */

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

// Converte o valor de um <input type="date"> (ex: "2026-09-02") em timestamp
// usando o horário LOCAL do dispositivo, em vez de UTC. Sem isso, o
// JavaScript interpreta a string como meia-noite em UTC, e em fusos
// atrás de UTC (como o Brasil) a data exibida "volta" um dia.
function inputDateParaTimestamp(dateStr) {
  if (!dateStr) return null;
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d).getTime();
}

function rotuloTipoUsuario(tipo) {
  if (tipo === 'admin') return 'Administrador';
  if (tipo === 'pcp') return 'PCP';
  if (tipo === 'mkt') return 'MKT';
  return 'Funcionário';
}

window.Const = {
  formatarData,
  formatarDataHora,
  inputDateParaTimestamp,
  rotuloTipoUsuario,
};
