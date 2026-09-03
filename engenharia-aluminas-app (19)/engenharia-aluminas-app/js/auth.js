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
    };
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    this.current = session;
  },

  logout() {
    localStorage.removeItem(SESSION_KEY);
    this.current = null;
  },

  isAdmin() {
    return !!this.current && this.current.tipo === 'admin';
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
