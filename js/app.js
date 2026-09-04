/* =========================================================
   app.js — casca do aplicativo: login, navegação por abas,
   troca de telas. Os módulos completos (Serviços, Plano de
   Corte, Avisos, Treinamento, Admin) entram nos próximos passos;
   por enquanto cada um mostra uma tela "em construção" para você
   já sentir a navegação funcionando no celular e no computador.
   ========================================================= */

const ICONS = {
  dashboard: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></svg>',
  servicos: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 3h6l1 3H8l1-3Z"/><path d="M6 6h12l-1 15H7L6 6Z"/><path d="M10 11h4"/></svg>',
  corte: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M8.5 8 19 19M19 5 12 12M8.5 16l2-2"/></svg>',
  avisos: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg>',
  treino: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z"/></svg>',
  ferias: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 22h20"/><path d="M12 22V12"/><path d="M12 12c0-5 3-9 8-9 0 5-3 9-8 9Z"/><path d="M12 15c0-3.5-2.5-6.5-6-7 0 3.5 2.5 6.5 6 7Z"/></svg>',
  mkt: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="7" width="18" height="10" rx="1"/><path d="M7 7V5M7 19v-2M12 7V5M12 19v-2M17 7V5M17 19v-2"/></svg>',
  admin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9c.14.36.4.66.73.85.3.18.66.27 1.02.24H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"/></svg>',
  logout: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/></svg>',
  wip: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76Z"/></svg>',
};

const TABS_BASE = [
  { id: 'dashboard', label: 'Início', icon: ICONS.dashboard },
  { id: 'servicos', label: 'Serviços', icon: ICONS.servicos },
  { id: 'corte', label: 'Corte', icon: ICONS.corte },
  { id: 'avisos', label: 'Avisos', icon: ICONS.avisos },
  { id: 'ferias', label: 'Férias', icon: ICONS.ferias },
  { id: 'mkt', label: 'MKT', icon: ICONS.mkt },
  { id: 'treino', label: 'Treino', icon: ICONS.treino },
];

const TABS_PCP = [
  { id: 'servicos', label: 'Serviços', icon: ICONS.servicos },
  { id: 'corte', label: 'Corte', icon: ICONS.corte },
  { id: 'mkt', label: 'MKT', icon: ICONS.mkt },
];

const TABS_MKT = [{ id: 'mkt', label: 'MKT', icon: ICONS.mkt }];

function currentTabs() {
  const tipo = Auth.current?.tipo;
  if (tipo === 'pcp') return TABS_PCP;
  if (tipo === 'mkt') return TABS_MKT;

  const tabs = [...TABS_BASE];
  if (Auth.isAdmin()) {
    tabs.push({ id: 'admin', label: 'Admin', icon: ICONS.admin });
  }
  return tabs;
}

let activeTab = 'dashboard';

/* ---------- LOGIN ---------- */

function renderLogin(root, errorMsg) {
  root.innerHTML = `
    <div class="auth">
      <div class="auth__blueprint"></div>
      <div class="auth__card">
        <div class="auth__mark"><img src="icons/icon-192.png" alt="Ícone do app"></div>
        <h1 class="auth__title">Engenharia Aluminas</h1>
        <p class="auth__sub">Entre com seu usuário e senha</p>
        <div class="auth__error ${errorMsg ? 'show' : ''}">${errorMsg || ''}</div>
        <form id="login-form">
          <div class="field" style="text-align:left">
            <label for="f-login">Usuário</label>
            <input id="f-login" name="login" autocomplete="username" required />
          </div>
          <div class="field" style="text-align:left">
            <label for="f-senha">Senha</label>
            <input id="f-senha" name="senha" type="password" autocomplete="current-password" required />
          </div>
          <button class="btn btn--primary btn--block" type="submit">Entrar</button>
        </form>
        <p class="auth__offline-note">Funciona sem internet depois do primeiro acesso.</p>
      </div>
    </div>
  `;

  document.getElementById('login-form').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const login = document.getElementById('f-login').value;
    const senha = document.getElementById('f-senha').value;
    const btn = ev.target.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.textContent = 'Entrando…';

    const result = await Auth.login(login, senha);
    if (result.ok) {
      renderShell(root);
    } else {
      renderLogin(root, result.erro);
    }
  });
}

/* ---------- SHELL PRINCIPAL ---------- */

function renderShell(root) {
  const user = Auth.current;
  if (user.tipo === 'pcp' && activeTab === 'dashboard') activeTab = 'servicos';
  if (user.tipo === 'mkt') activeTab = 'mkt';
  root.innerHTML = `
    <div id="app-shell">
      <header class="topbar">
        <div class="topbar__mark"><img src="icons/icon-192.png" alt=""></div>
        <div class="topbar__title">Engenharia Aluminas</div>
        <div class="topbar__user">
          <b>${escapeHtml(user.nome)}</b>
          ${Const.rotuloTipoUsuario(user.tipo)}
        </div>
        <button class="topbar__icon-btn" id="btn-logout" title="Sair" aria-label="Sair">${ICONS.logout}</button>
      </header>

      <main id="view"></main>

      <nav class="tabbar" id="tabbar"></nav>
    </div>
  `;

  document.getElementById('btn-logout').addEventListener('click', () => {
    window.aoDadosMudarem = () => {};
    Auth.logout();
    renderLogin(root);
  });

  renderTabbar();
  renderView(activeTab);

  let debounceTimer = null;
  window.aoDadosMudarem = () => {
    if (!Auth.current) return;
    const el = document.activeElement;
    const emCampoDeForm = el && ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName);
    if (emCampoDeForm) return; // não atualiza enquanto a pessoa está preenchendo algo
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => renderView(activeTab), 250);
  };
}

function renderTabbar() {
  const tabbar = document.getElementById('tabbar');
  const tabs = currentTabs();
  tabbar.innerHTML = tabs
    .map(
      (t) => `
      <button class="tabbar__item ${t.id === activeTab ? 'active' : ''}" data-tab="${t.id}">
        ${t.icon}
        <span>${t.label}</span>
      </button>`
    )
    .join('');

  tabbar.querySelectorAll('.tabbar__item').forEach((btn) => {
    btn.addEventListener('click', () => {
      activeTab = btn.dataset.tab;
      renderTabbar();
      renderView(activeTab);
    });
  });
}

/* ---------- TELAS ---------- */

async function renderView(tab) {
  const view = document.getElementById('view');
  if (!view) return;

  if (tab === 'dashboard') return renderDashboard(view);
  if (tab === 'admin' && Auth.isAdmin()) return renderAdmin(view);
  if (tab === 'servicos') return renderServicos(view);
  if (tab === 'corte') return renderCorte(view);
  if (tab === 'avisos') return renderAvisos(view);
  if (tab === 'ferias') return renderFerias(view);
  if (tab === 'mkt') return renderMkt(view);
  if (tab === 'treino') return renderTreino(view);
}

function renderWip(view, title, sub) {
  view.innerHTML = `
    <div class="wip">
      ${ICONS.wip}
      <b>${escapeHtml(title)}</b>
      <div class="empty__sub">${escapeHtml(sub)}</div>
    </div>
  `;
}

/* renderDashboard agora vive em dashboard.js */

/* ---------- utilitários ---------- */

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

/* ---------- boot ---------- */

async function boot() {
  const root = document.getElementById('root');
  await dbUtil.seedIfEmpty();
  Auth.loadSession();

  if (Auth.current) {
    renderShell(root);
  } else {
    renderLogin(root);
  }
}

window.addEventListener('DOMContentLoaded', boot);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('service-worker.js').catch(() => {});
  });
}
