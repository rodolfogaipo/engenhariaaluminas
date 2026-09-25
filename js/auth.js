/* =========================================================
   auth.js — login/logout offline, sessão salva localmente
   ========================================================= */

const SESSION_KEY = 'controle_equipe_sessao';

const Auth = {
  current: null,

  loadSession() {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      this.current = raw ? JSON.parse(raw) : null;
    } catch {
      this.current = null;
    }
    return this.current;
  },

  saveSession(user) {
    const session = {
      id: user.id,
      nome: user.nome,
      login: user.login,
      tipo: user.tipo,
      foto: user.foto || null,
      permissoes: user.permissoes || null,
    };
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    this.current = session;
  },

  logout() {
    // zera seleções de PDF abertas, pra não passarem pra próxima conta
    [
      typeof AvisosView !== 'undefined' ? AvisosView : null,
      typeof TreinoView !== 'undefined' ? TreinoView : null,
      typeof MateriaisView !== 'undefined' ? MateriaisView : null,
      typeof MktView !== 'undefined' ? MktView : null,
    ].forEach((v) => {
      if (v && v.selecionados) {
        v.modoSelecao = false;
        v.selecionados.clear();
      }
    });
    localStorage.removeItem(SESSION_KEY);
    this.current = null;
  },

  isAdmin() {
    return !!this.current && this.current.tipo === 'admin';
  },

  // Recarrega nome/tipo/permissões do banco — assim, quando o Admin
  // muda as permissões de alguém, vale na hora pra essa pessoa, sem
  // precisar sair e entrar de novo. Retorna false se a conta sumiu.
  async atualizarDoBanco() {
    if (!this.current) return false;
    try {
      const user = await DB.get('usuarios', this.current.id);
      if (!user) {
        // só considera a conta excluída se a lista de usuários de fato
        // carregou (sem internet na 1ª vez ela pode vir vazia)
        const todos = await DB.getAll('usuarios');
        return todos.length === 0;
      }
      this.saveSession(user);
    } catch (e) {
      console.error('Não consegui recarregar o usuário:', e);
    }
    return true;
  },

  pode(abaId) {
    return Permissoes.podeVer(this.current, abaId);
  },

  somenteLeitura() {
    return Permissoes.somenteLeitura(this.current);
  },

  async login(login, senha) {
    const usuarios = await DB.getAll('usuarios');
    const user = usuarios.find(
      (u) => u.login.trim().toLowerCase() === login.trim().toLowerCase()
    );
    if (!user) return { ok: false, erro: 'Usuário não encontrado.' };

    const senhaHash = await dbUtil.sha256(senha);
    if (senhaHash !== user.senhaHash) {
      return { ok: false, erro: 'Senha incorreta.' };
    }

    this.saveSession(user);
    return { ok: true, user };
  },
};

window.Auth = Auth;
