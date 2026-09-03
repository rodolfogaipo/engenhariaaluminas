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
  formValues: { nome: '', login: '', tipo: 'funcionario' },
};

async function renderAdmin(view) {
  view.innerHTML = `
    <h2 class="section-title">Painel do Administrador</h2>
    <p class="section-sub">Gestão da equipe e do sistema</p>

    <div style="display:flex; gap:8px; margin-bottom:18px; overflow-x:auto">
      <button class="btn ${AdminView.aba === 'usuarios' ? 'btn--primary' : 'btn--ghost'}" data-aba="usuarios">Usuários</button>
      <button class="btn ${AdminView.aba === 'categorias' ? 'btn--primary' : 'btn--ghost'}" data-aba="categorias">Categorias</button>
      <button class="btn ${AdminView.aba === 'anotacoes' ? 'btn--primary' : 'btn--ghost'}" data-aba="anotacoes">Anotações</button>
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
  } else if (AdminView.aba === 'categorias') {
    await renderAdminCategorias(cont, view);
  } else if (AdminView.aba === 'anotacoes') {
    await renderAdminAnotacoes(cont, view);
  } else {
    await renderAdminMais(cont);
  }
}

async function renderAdminMais(cont) {
  const jaImportado = await SeedImport.jaImportado();
  const flag = jaImportado ? await DB.get('config', 'planilha_importada_em') : null;
  const precisaCorrigir = await CorrigirFuncionarios.precisaCorrigir();

  cont.innerHTML = `
    ${
      precisaCorrigir
        ? `<div class="card" style="border-color:var(--brand-500)">
            <h3 class="section-title" style="font-size:16px">Corrigir funcionários duplicados</h3>
            <p class="section-sub">A importação criou usuários com o nome curto da planilha (Máyra, Marco Túlio, Leandrinho). Isso liga todo o histórico importado às contas reais que você já cadastrou, e remove as duplicatas.</p>
            <div id="corrigir-status" class="row__meta" style="margin-bottom:10px"></div>
            <button class="btn btn--primary" id="btn-corrigir-funcionarios">Corrigir agora</button>
          </div>`
        : ''
    }

    <div class="card" style="margin-top:16px">
      <h3 class="section-title" style="font-size:16px">Importar dados da planilha</h3>
      <p class="section-sub">Traz os serviços e o Plano de Corte reais do CONTROLE_EQUIPE.xlsx pro app, pra você testar tudo junto com dados de verdade.</p>
      ${
        jaImportado
          ? `<div class="row__meta" style="margin-bottom:14px">Já importado em ${Const.formatarDataHora(flag.valor)} — ${flag.totalServicos} serviços, ${flag.totalPlanoCorte} registros de Plano de Corte.</div>`
          : ''
      }
      <div id="import-status" class="row__meta" style="margin-bottom:10px"></div>
      <div style="display:flex; gap:10px; flex-wrap:wrap">
        <button class="btn ${jaImportado ? 'btn--ghost' : 'btn--primary'}" id="btn-importar-planilha">${jaImportado ? 'Importar de novo (duplica os dados)' : 'Importar dados da planilha'}</button>
        ${jaImportado ? '<button class="btn btn--danger" id="btn-remover-importados">Remover dados importados</button>' : ''}
      </div>
    </div>

    <div class="card" style="margin-top:16px">
      <div class="wip">
        ${ICONS.wip}
        <b>Mais ferramentas a caminho</b>
        <div class="empty__sub">Alertas automáticos, quadro de treinamento e exportação de dados continuam chegando nos próximos passos.</div>
      </div>
    </div>
  `;

  if (precisaCorrigir) {
    document.getElementById('btn-corrigir-funcionarios').addEventListener('click', async () => {
      const btn = document.getElementById('btn-corrigir-funcionarios');
      const statusEl = document.getElementById('corrigir-status');
      btn.disabled = true;
      try {
        const resultado = await CorrigirFuncionarios.executar((msg) => (statusEl.textContent = msg));
        statusEl.textContent = `Pronto! ${resultado.servicos} serviços e ${resultado.corte} registros de corte religados.`;
        setTimeout(() => renderAdmin(document.getElementById('view')), 1200);
      } catch (e) {
        statusEl.textContent = 'Erro ao corrigir: ' + e.message;
        btn.disabled = false;
      }
    });
  }

  document.getElementById('btn-importar-planilha').addEventListener('click', async () => {
    if (jaImportado && !confirm('Isso vai duplicar os dados já importados. Continuar mesmo assim?')) return;
    const btn = document.getElementById('btn-importar-planilha');
    const statusEl = document.getElementById('import-status');
    btn.disabled = true;
    try {
      const resultado = await SeedImport.importar((msg) => (statusEl.textContent = msg));
      statusEl.textContent = `Pronto! ${resultado.totalServicos} serviços e ${resultado.totalPlanoCorte} registros de Plano de Corte importados.`;
      setTimeout(() => renderAdmin(document.getElementById('view')), 1200);
    } catch (e) {
      statusEl.textContent = 'Erro ao importar: ' + e.message;
      btn.disabled = false;
    }
  });

  const btnRemover = document.getElementById('btn-remover-importados');
  if (btnRemover) {
    btnRemover.addEventListener('click', async () => {
      if (!confirm('Isso remove TODOS os serviços e registros de Plano de Corte importados da planilha. Continuar?')) return;
      const statusEl = document.getElementById('import-status');
      btnRemover.disabled = true;
      await SeedImport.remover((msg) => (statusEl.textContent = msg));
      renderAdmin(document.getElementById('view'));
    });
  }
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
    AdminView.formValues = { nome: '', login: '', tipo: 'funcionario' };
    renderAdminUsuarios(cont, view);
  });

  cont.querySelectorAll('[data-editar]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const u = await DB.get('usuarios', btn.dataset.editar);
      AdminView.formAberto = true;
      AdminView.edicaoId = u.id;
      AdminView.fotoBase64 = u.foto || null;
      AdminView.erro = '';
      AdminView.formValues = { nome: u.nome, login: u.login, tipo: u.tipo };
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
  const fv = AdminView.formValues;

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
        <input id="f-nome-u" value="${escapeHtml(fv.nome)}" />
      </div>
      <div class="field">
        <label for="f-login-u">Usuário (login)</label>
        <input id="f-login-u" value="${escapeHtml(fv.login)}" autocomplete="off" />
      </div>
      <div class="field">
        <label for="f-senha-u">${editando ? 'Nova senha (deixe em branco para manter)' : 'Senha'}</label>
        <input id="f-senha-u" type="password" autocomplete="new-password" value="${escapeHtml(fv.senha || '')}" />
      </div>
      <div class="field">
        <label for="f-tipo-u">Tipo de acesso</label>
        <select id="f-tipo-u">
          <option value="funcionario" ${fv.tipo === 'funcionario' ? 'selected' : ''}>Funcionário</option>
          <option value="admin" ${fv.tipo === 'admin' ? 'selected' : ''}>Administrador</option>
        </select>
      </div>

      <div style="display:flex; gap:10px; margin-top:6px">
        <button class="btn btn--ghost" id="btn-cancelar-usuario" style="flex:1">Cancelar</button>
        <button class="btn btn--primary" id="btn-salvar-usuario" style="flex:2">Salvar</button>
      </div>
    </div>
  `;

  document.getElementById('f-nome-u').addEventListener('input', (ev) => (fv.nome = ev.target.value));
  document.getElementById('f-login-u').addEventListener('input', (ev) => (fv.login = ev.target.value));
  document.getElementById('f-senha-u').addEventListener('input', (ev) => (fv.senha = ev.target.value));
  document.getElementById('f-tipo-u').addEventListener('change', (ev) => (fv.tipo = ev.target.value));

  document.getElementById('f-foto').addEventListener('change', async (ev) => {
    const file = ev.target.files[0];
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) {
      AdminView.erro = 'Foto muito grande — escolha uma imagem de até 20MB.';
      renderFormUsuario(cont, view);
      return;
    }
    try {
      const dataUrl = await fileToResizedDataUrl(file, 320);
      AdminView.fotoBase64 = dataUrl;
      AdminView.erro = '';
    } catch (e) {
      AdminView.erro = 'Não consegui abrir essa imagem. Tente outra foto (JPG ou PNG).';
    }
    renderFormUsuario(cont, view);
  });

  document.getElementById('btn-cancelar-usuario').addEventListener('click', () => {
    AdminView.formAberto = false;
    renderAdminUsuarios(cont, view);
  });

  document.getElementById('btn-salvar-usuario').addEventListener('click', () => salvarUsuario(cont, view));
}

async function salvarUsuario(cont, view) {
  const nome = document.getElementById('f-nome-u').value.trim();
  const login = document.getElementById('f-login-u').value.trim();
  const senha = document.getElementById('f-senha-u').value;
  const tipo = document.getElementById('f-tipo-u').value;
  const usuarioExistente = AdminView.edicaoId ? await DB.get('usuarios', AdminView.edicaoId) : null;

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

/* ---------------- ANOTAÇÕES DO ADMIN (privada) ----------------
   Serve pra ele se programar na rotina — só ele vê e edita. */

const AdminAnotacoesView = {
  subView: 'lista', // 'lista' | 'form'
  formState: null,
};

async function renderAdminAnotacoes(cont, view) {
  if (AdminAnotacoesView.subView === 'form') {
    return renderAdminAnotacaoForm(cont, view);
  }

  const todas = await DB.getAll('anotacoes_admin');
  const pendentes = todas.filter((a) => !a.feito).sort((a, b) => (b.data || 0) - (a.data || 0));
  const feitas = todas.filter((a) => a.feito).sort((a, b) => (b.data || 0) - (a.data || 0));
  const ordenadas = [...pendentes, ...feitas];

  cont.innerHTML = `
    <div style="display:flex; justify-content:flex-end; margin-bottom:14px">
      <button class="btn btn--primary" id="btn-nova-anotacao">+ Nova Anotação</button>
    </div>
    <div id="lista-anotacoes"></div>
  `;

  document.getElementById('btn-nova-anotacao').addEventListener('click', () => {
    AdminAnotacoesView.subView = 'form';
    AdminAnotacoesView.formState = { editId: null, texto: '', data: dataParaInputDate(Date.now()), feito: false, erro: '' };
    renderAdminAnotacoes(cont, view);
  });

  const listaEl = document.getElementById('lista-anotacoes');
  if (ordenadas.length === 0) {
    listaEl.innerHTML = `
      <div class="card">
        <div class="empty">
          <div class="empty__title">Nenhuma anotação ainda</div>
          <div class="empty__sub">Use isso pra organizar sua programação de serviço. Só você vê.</div>
        </div>
      </div>`;
    return;
  }

  listaEl.innerHTML = `
    <div class="card" style="padding:0">
      ${ordenadas
        .map(
          (a) => `
        <div class="row" style="padding:14px 18px; align-items:flex-start; flex-wrap:wrap; gap:10px">
          <div class="row__main" style="flex:1 1 220px">
            <div class="row__title" style="${a.feito ? 'text-decoration:line-through; color:var(--ink-faint)' : ''}">${escapeHtml(a.texto)}</div>
            <div class="row__meta">${Const.formatarData(a.data)}</div>
          </div>
          <div style="display:flex; gap:6px; flex-wrap:wrap; justify-content:flex-end">
            <button class="btn btn--ghost" data-toggle="${a.id}" style="padding:6px 12px; font-size:13px">${a.feito ? 'Reabrir' : 'Marcar feito'}</button>
            <button class="btn btn--ghost" data-editar="${a.id}" style="padding:6px 12px; font-size:13px">Editar</button>
            <button class="btn btn--danger" data-excluir="${a.id}" style="padding:6px 12px; font-size:13px">Excluir</button>
          </div>
        </div>`
        )
        .join('')}
    </div>
  `;

  listaEl.querySelectorAll('[data-toggle]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const a = await DB.get('anotacoes_admin', btn.dataset.toggle);
      if (!a) return;
      a.feito = !a.feito;
      await DB.put('anotacoes_admin', a);
      renderAdminAnotacoes(cont, view);
    });
  });

  listaEl.querySelectorAll('[data-editar]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const a = await DB.get('anotacoes_admin', btn.dataset.editar);
      if (!a) return;
      AdminAnotacoesView.subView = 'form';
      AdminAnotacoesView.formState = {
        editId: a.id,
        texto: a.texto || '',
        data: dataParaInputDate(a.data) || dataParaInputDate(Date.now()),
        feito: !!a.feito,
        erro: '',
      };
      renderAdminAnotacoes(cont, view);
    });
  });

  listaEl.querySelectorAll('[data-excluir]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('Excluir esta anotação?')) return;
      await DB.delete('anotacoes_admin', btn.dataset.excluir);
      renderAdminAnotacoes(cont, view);
    });
  });
}

async function renderAdminAnotacaoForm(cont, view) {
  const st = AdminAnotacoesView.formState;
  const editando = !!st.editId;

  cont.innerHTML = `
    <div class="card">
      <h3 class="section-title" style="font-size:17px">${editando ? 'Editar Anotação' : 'Nova Anotação'}</h3>

      ${st.erro ? `<div class="auth__error show" style="text-align:left; margin-bottom:14px">${escapeHtml(st.erro)}</div>` : ''}

      <div class="field">
        <label for="f-anot-texto">Texto</label>
        <textarea id="f-anot-texto" placeholder="Ex: Confirmar prazo do fornecedor de espuma">${escapeHtml(st.texto)}</textarea>
      </div>
      <div class="field">
        <label for="f-anot-data">Data</label>
        <input id="f-anot-data" type="date" value="${escapeHtml(st.data)}" />
      </div>
      <label style="display:flex; align-items:center; gap:8px; margin-bottom:20px; font-size:14px; color:var(--ink-soft)">
        <input id="f-anot-feito" type="checkbox" style="width:18px; height:18px" ${st.feito ? 'checked' : ''} />
        Já está feito
      </label>

      <div style="display:flex; gap:10px">
        <button class="btn btn--ghost" id="btn-cancelar-anotacao" style="flex:1">Cancelar</button>
        <button class="btn btn--primary" id="btn-salvar-anotacao" style="flex:2">Salvar</button>
      </div>
    </div>
  `;

  document.getElementById('btn-cancelar-anotacao').addEventListener('click', () => {
    AdminAnotacoesView.subView = 'lista';
    renderAdminAnotacoes(cont, view);
  });
  document.getElementById('f-anot-texto').addEventListener('input', (ev) => (st.texto = ev.target.value));
  document.getElementById('f-anot-data').addEventListener('input', (ev) => (st.data = ev.target.value));
  document.getElementById('f-anot-feito').addEventListener('change', (ev) => (st.feito = ev.target.checked));

  document.getElementById('btn-salvar-anotacao').addEventListener('click', async () => {
    const texto = (st.texto || '').trim();
    if (!texto) {
      st.erro = 'Digite o texto da anotação.';
      return renderAdminAnotacaoForm(cont, view);
    }
    const registro = st.editId
      ? await DB.get('anotacoes_admin', st.editId)
      : { id: dbUtil.uid(), criadoEm: Date.now() };
    registro.texto = texto;
    registro.data = st.data ? Const.inputDateParaTimestamp(st.data) : Date.now();
    registro.feito = !!st.feito;
    await DB.put('anotacoes_admin', registro);
    AdminAnotacoesView.subView = 'lista';
    renderAdminAnotacoes(cont, view);
  });
}

/* ---------------- CATEGORIAS DE SERVIÇO ----------------
   Lista as categorias (padrão + criadas pelo Admin) e permite criar
   novas, escolhendo se elas terão o indicador de % Aproveitamento. */

const AdminCategoriasView = {
  formAberto: false,
  editId: null,
  ehSistema: false,
  nome: '',
  temPorcentagem: false,
  erro: '',
};

async function renderAdminCategorias(cont, view) {
  if (AdminCategoriasView.formAberto) {
    return renderFormCategoria(cont, view);
  }

  const categorias = await Categorias.listar();

  cont.innerHTML = `
    <div style="display:flex; justify-content:flex-end; margin-bottom:14px">
      <button class="btn btn--primary" id="btn-nova-categoria">+ Nova Categoria</button>
    </div>
    <div class="card" style="padding:0">
      ${categorias
        .map(
          (c) => `
        <div class="row" style="padding:14px 18px; flex-wrap:wrap; gap:8px">
          <div class="row__main">
            <div class="row__title">${escapeHtml(c.nome)}</div>
            <div class="row__meta">${c.sistema ? 'Categoria padrão' : 'Criada por você'}</div>
          </div>
          <div style="display:flex; align-items:center; gap:8px; flex:0 0 auto">
            <span class="badge ${c.temPorcentagem ? 'badge--brand' : 'badge--idle'}">${c.temPorcentagem ? 'Tem %' : 'Sem %'}</span>
            <button class="btn btn--ghost" data-editar-cat="${c.id}" style="padding:6px 12px; font-size:13px">Editar</button>
            ${!c.sistema ? `<button class="btn btn--danger" data-excluir-cat="${c.id}" style="padding:6px 12px; font-size:13px">Excluir</button>` : ''}
          </div>
        </div>`
        )
        .join('')}
    </div>
  `;

  document.getElementById('btn-nova-categoria').addEventListener('click', () => {
    AdminCategoriasView.formAberto = true;
    AdminCategoriasView.editId = null;
    AdminCategoriasView.ehSistema = false;
    AdminCategoriasView.nome = '';
    AdminCategoriasView.temPorcentagem = false;
    AdminCategoriasView.erro = '';
    renderAdminCategorias(cont, view);
  });

  cont.querySelectorAll('[data-editar-cat]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const cat = categorias.find((c) => c.id === btn.dataset.editarCat);
      if (!cat) return;
      AdminCategoriasView.formAberto = true;
      AdminCategoriasView.editId = cat.id;
      AdminCategoriasView.ehSistema = !!cat.sistema;
      AdminCategoriasView.nome = cat.nome;
      AdminCategoriasView.temPorcentagem = !!cat.temPorcentagem;
      AdminCategoriasView.erro = '';
      renderAdminCategorias(cont, view);
    });
  });

  cont.querySelectorAll('[data-excluir-cat]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('Excluir esta categoria? Serviços já lançados com ela continuam existindo, só não vai mais aparecer pra lançar novos.')) return;
      try {
        await Categorias.remover(btn.dataset.excluirCat);
        renderAdminCategorias(cont, view);
      } catch (e) {
        alert(e.message);
      }
    });
  });
}

function renderFormCategoria(cont, view) {
  const st = AdminCategoriasView;
  const editando = !!st.editId;

  cont.innerHTML = `
    <div class="card">
      <h3 class="section-title" style="font-size:17px">${editando ? 'Editar Categoria' : 'Nova Categoria'}</h3>

      ${st.erro ? `<div class="auth__error show" style="text-align:left; margin-bottom:14px">${escapeHtml(st.erro)}</div>` : ''}

      <div class="field">
        <label for="f-cat-nome-adm">Nome da categoria</label>
        <input id="f-cat-nome-adm" value="${escapeHtml(st.nome)}" placeholder="Ex: Corte Alumínio" ${st.ehSistema ? 'disabled' : ''} />
        ${st.ehSistema ? '<div class="row__meta" style="margin-top:6px">O nome de categorias padrão não pode ser alterado — várias partes do app dependem dele.</div>' : ''}
      </div>

      <label style="display:flex; align-items:center; gap:8px; margin-bottom:20px; font-size:14px; color:var(--ink-soft)">
        <input id="f-cat-porcentagem" type="checkbox" style="width:18px; height:18px" ${st.temPorcentagem ? 'checked' : ''} />
        Essa categoria tem % de Aproveitamento (aparece o campo ao lançar, e entra no levantamento de aproveitamento)
      </label>

      <div style="display:flex; gap:10px">
        <button class="btn btn--ghost" id="btn-cancelar-categoria" style="flex:1">Cancelar</button>
        <button class="btn btn--primary" id="btn-salvar-categoria" style="flex:2">Salvar</button>
      </div>
    </div>
  `;

  document.getElementById('btn-cancelar-categoria').addEventListener('click', () => {
    st.formAberto = false;
    renderAdminCategorias(cont, view);
  });
  document.getElementById('f-cat-nome-adm').addEventListener('input', (ev) => (st.nome = ev.target.value));
  document.getElementById('f-cat-porcentagem').addEventListener('change', (ev) => (st.temPorcentagem = ev.target.checked));

  document.getElementById('btn-salvar-categoria').addEventListener('click', async () => {
    try {
      if (editando) {
        await Categorias.atualizar(st.editId, { nome: st.nome, temPorcentagem: st.temPorcentagem });
      } else {
        await Categorias.criar(st.nome, st.temPorcentagem);
      }
      st.formAberto = false;
      renderAdminCategorias(cont, view);
    } catch (e) {
      st.erro = e.message;
      renderFormCategoria(cont, view);
    }
  });
}
