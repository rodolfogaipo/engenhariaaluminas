/* =========================================================
   admin.js — painel do Administrador
   Nesta etapa: gestão de usuários (com foto). As demais seções
   (comparativo, alertas, férias, avisos, treinamento, exportação)
   entram nos próximos passos, e por enquanto aparecem como
   "em construção" dentro do próprio painel.
   ========================================================= */

const AdminView = {
  aba: 'usuarios', // 'usuarios' | 'mais'
  formAberto: false,
  edicaoId: null,
  fotoBase64: null,
  erro: '',
};

async function renderAdmin(view) {
  view.innerHTML = `
    <h2 class="section-title">Painel do Administrador</h2>
    <p class="section-sub">Gestão da equipe e do sistema</p>

    <div style="display:flex; gap:8px; margin-bottom:18px; overflow-x:auto">
      <button class="btn ${AdminView.aba === 'usuarios' ? 'btn--primary' : 'btn--ghost'}" data-aba="usuarios">Usuários</button>
      <button class="btn ${AdminView.aba === 'mais' ? 'btn--primary' : 'btn--ghost'}" data-aba="mais">Mais Ferramentas</button>
    </div>

    <div id="admin-conteudo"></div>
  `;

  view.querySelectorAll('[data-aba]').forEach((btn) => {
    btn.addEventListener('click', () => {
      AdminView.aba = btn.dataset.aba;
      AdminView.formAberto = false;
      renderAdmin(view);
    });
  });

  const cont = document.getElementById('admin-conteudo');
  if (AdminView.aba === 'usuarios') {
    await renderAdminUsuarios(cont, view);
  } else {
    renderAdminMais(cont);
  }
}

function renderAdminMais(cont) {
  cont.innerHTML = `
    <div class="card">
      <div class="wip">
        ${ICONS.wip}
        <b>Mais ferramentas a caminho</b>
        <div class="empty__sub">Comparativo de equipe com gráficos, alertas automáticos, férias, quadro de avisos, anotações privadas, diário, treinamento e exportação de dados chegam nos próximos passos — um de cada vez, como combinamos.</div>
      </div>
    </div>
  `;
}

/* ---------------- USUÁRIOS ---------------- */

async function renderAdminUsuarios(cont, view) {
  const usuarios = await DB.getAll('usuarios');
  usuarios.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

  if (AdminView.formAberto) {
    return renderFormUsuario(cont, view);
  }

  cont.innerHTML = `
    <div style="display:flex; justify-content:flex-end; margin-bottom:14px">
      <button class="btn btn--primary" id="btn-novo-usuario">+ Novo Usuário</button>
    </div>
    <div class="card" style="padding:0">
      ${usuarios
        .map(
          (u) => `
        <div class="row" style="padding:14px 18px">
          <div style="display:flex; align-items:center; gap:12px; min-width:0">
            <div style="width:40px; height:40px; border-radius:50%; overflow:hidden; flex:0 0 auto; background:var(--paper-dim); display:flex; align-items:center; justify-content:center; font-weight:700; color:var(--brand-700)">
              ${u.foto ? `<img src="${u.foto}" style="width:100%; height:100%; object-fit:cover">` : escapeHtml((u.nome || '?')[0])}
            </div>
            <div class="row__main">
              <div class="row__title">${escapeHtml(u.nome)}</div>
              <div class="row__meta">@${escapeHtml(u.login)} · ${u.tipo === 'admin' ? 'Administrador' : 'Funcionário'}</div>
            </div>
          </div>
          <div style="display:flex; gap:6px; flex:0 0 auto">
            <button class="btn btn--ghost" data-editar="${u.id}" style="padding:6px 12px; font-size:13px">Editar</button>
            ${u.id !== Auth.current.id ? `<button class="btn btn--danger" data-excluir="${u.id}" style="padding:6px 12px; font-size:13px">Excluir</button>` : ''}
          </div>
        </div>`
        )
        .join('')}
    </div>
  `;

  document.getElementById('btn-novo-usuario').addEventListener('click', () => {
    AdminView.formAberto = true;
    AdminView.edicaoId = null;
    AdminView.fotoBase64 = null;
    AdminView.erro = '';
    renderAdminUsuarios(cont, view);
  });

  cont.querySelectorAll('[data-editar]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const u = await DB.get('usuarios', btn.dataset.editar);
      AdminView.formAberto = true;
      AdminView.edicaoId = u.id;
      AdminView.fotoBase64 = u.foto || null;
      AdminView.erro = '';
      renderAdminUsuarios(cont, view);
    });
  });

  cont.querySelectorAll('[data-excluir]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('Excluir este usuário? Essa ação não pode ser desfeita.')) return;
      await DB.delete('usuarios', btn.dataset.excluir);
      renderAdminUsuarios(cont, view);
    });
  });
}

async function renderFormUsuario(cont, view) {
  const editando = !!AdminView.edicaoId;
  const usuario = editando ? await DB.get('usuarios', AdminView.edicaoId) : null;

  cont.innerHTML = `
    <div class="card">
      <h3 class="section-title" style="font-size:17px">${editando ? 'Editar Usuário' : 'Novo Usuário'}</h3>

      ${AdminView.erro ? `<div class="auth__error show" style="text-align:left; margin-bottom:14px">${escapeHtml(AdminView.erro)}</div>` : ''}

      <div class="field" style="display:flex; align-items:center; gap:14px">
        <div id="preview-foto" style="width:64px; height:64px; border-radius:50%; overflow:hidden; background:var(--paper-dim); display:flex; align-items:center; justify-content:center; flex:0 0 auto">
          ${AdminView.fotoBase64 ? `<img src="${AdminView.fotoBase64}" style="width:100%; height:100%; object-fit:cover">` : '<span style="color:var(--ink-faint); font-size:11px">sem foto</span>'}
        </div>
        <div>
          <label for="f-foto" style="margin-bottom:6px">Foto do funcionário</label>
          <input id="f-foto" type="file" accept="image/*" />
        </div>
      </div>

      <div class="field">
        <label for="f-nome-u">Nome</label>
        <input id="f-nome-u" value="${escapeHtml(usuario?.nome || '')}" />
      </div>
      <div class="field">
        <label for="f-login-u">Usuário (login)</label>
        <input id="f-login-u" value="${escapeHtml(usuario?.login || '')}" autocomplete="off" />
      </div>
      <div class="field">
        <label for="f-senha-u">${editando ? 'Nova senha (deixe em branco para manter)' : 'Senha'}</label>
        <input id="f-senha-u" type="password" autocomplete="new-password" />
      </div>
      <div class="field">
        <label for="f-tipo-u">Tipo de acesso</label>
        <select id="f-tipo-u">
          <option value="funcionario" ${usuario?.tipo === 'funcionario' ? 'selected' : ''}>Funcionário</option>
          <option value="admin" ${usuario?.tipo === 'admin' ? 'selected' : ''}>Administrador</option>
        </select>
      </div>

      <div style="display:flex; gap:10px; margin-top:6px">
        <button class="btn btn--ghost" id="btn-cancelar-usuario" style="flex:1">Cancelar</button>
        <button class="btn btn--primary" id="btn-salvar-usuario" style="flex:2">Salvar</button>
      </div>
    </div>
  `;

  document.getElementById('f-foto').addEventListener('change', async (ev) => {
    const file = ev.target.files[0];
    if (!file) return;
    if (file.size > 3 * 1024 * 1024) {
      AdminView.erro = 'Foto muito grande — escolha uma imagem de até 3MB.';
      renderFormUsuario(cont, view);
      return;
    }
    const dataUrl = await fileToResizedDataUrl(file, 320);
    AdminView.fotoBase64 = dataUrl;
    renderFormUsuario(cont, view);
  });

  document.getElementById('btn-cancelar-usuario').addEventListener('click', () => {
    AdminView.formAberto = false;
    renderAdminUsuarios(cont, view);
  });

  document.getElementById('btn-salvar-usuario').addEventListener('click', () => salvarUsuario(cont, view, usuario));
}

async function salvarUsuario(cont, view, usuarioExistente) {
  const nome = document.getElementById('f-nome-u').value.trim();
  const login = document.getElementById('f-login-u').value.trim();
  const senha = document.getElementById('f-senha-u').value;
  const tipo = document.getElementById('f-tipo-u').value;

  if (!nome || !login) {
    AdminView.erro = 'Preencha nome e usuário.';
    return renderFormUsuario(cont, view);
  }
  if (!usuarioExistente && !senha) {
    AdminView.erro = 'Defina uma senha para o novo usuário.';
    return renderFormUsuario(cont, view);
  }

  const todos = await DB.getAll('usuarios');
  const conflito = todos.find(
    (u) => u.login.toLowerCase() === login.toLowerCase() && u.id !== (usuarioExistente?.id || null)
  );
  if (conflito) {
    AdminView.erro = 'Já existe um usuário com esse login.';
    return renderFormUsuario(cont, view);
  }

  const registro = usuarioExistente || {
    id: dbUtil.uid(),
    criadoEm: Date.now(),
  };
  registro.nome = nome;
  registro.login = login;
  registro.tipo = tipo;
  registro.foto = AdminView.fotoBase64 || null;
  if (senha) {
    registro.senhaHash = await dbUtil.sha256(senha);
  }

  await DB.put('usuarios', registro);
  AdminView.formAberto = false;
  AdminView.erro = '';
  renderAdminUsuarios(cont, view);
}

/* Reduz a imagem antes de guardar em base64 no IndexedDB, pra não
   pesar o app (fotos de celular podem vir com vários MB) */
function fileToResizedDataUrl(file, maxSize) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > height && width > maxSize) {
          height = Math.round((height * maxSize) / width);
          width = maxSize;
        } else if (height > maxSize) {
          width = Math.round((width * maxSize) / height);
          height = maxSize;
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.onerror = reject;
      img.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
