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
  formValues: { nome: '', login: '', tipo: 'funcionario', permissoes: Permissoes.padraoDoTipo('funcionario') },
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
  const gruposDuplicados = await MesclarDuplicados.detectar();
  const duplicadosServicos = await RemoverDuplicados.detectar().catch(() => ({ duplicadosServicos: [], duplicadosCorte: [], extraServicos: 0, extraCorte: 0 }));
  const dataProgramadaCorteAfetados = await LimparDataProgramadaCorte.contar().catch(() => 0);
  const pendencias = await contarPendencias().catch(() => ({ total: 0, servicos: 0, conclusoes: 0, planoCorte: 0, mkt: 0 }));
  const insights = await Insights.gerar().catch(() => []);

  cont.innerHTML = `
    <div class="card">
      <h3 class="section-title" style="font-size:16px">🔔 Pendências de aprovação</h3>
      ${
        pendencias.total === 0
          ? '<p class="section-sub" style="margin:0">Nada esperando aprovação no momento.</p>'
          : `<div style="display:flex; flex-direction:column; gap:8px">
              ${
                pendencias.servicos > 0
                  ? `<div class="row__meta">📋 <b>${pendencias.servicos}</b> serviço(s) aguardando aprovação — Serviços</div>`
                  : ''
              }
              ${
                pendencias.conclusoes > 0
                  ? `<div class="row__meta">✅ <b>${pendencias.conclusoes}</b> conclusão(ões) aguardando validação — Serviços</div>`
                  : ''
              }
              ${
                pendencias.planoCorte > 0
                  ? `<div class="row__meta">✂️ <b>${pendencias.planoCorte}</b> atualização(ões) de corte aguardando aprovação — Corte</div>`
                  : ''
              }
              ${
                pendencias.marcenaria > 0
                  ? `<div class="row__meta">🪵 <b>${pendencias.marcenaria}</b> pedido(s) de mudança / gabarito(s) aguardando — Marcenaria</div>`
                  : ''
              }
              ${
                pendencias.atelie > 0
                  ? `<div class="row__meta">🧵 <b>${pendencias.atelie}</b> pedido(s) de mudança no Ateliê aguardando autorização — Ateliê</div>`
                  : ''
              }
              ${
                pendencias.materiais > 0
                  ? `<div class="row__meta">🧵 <b>${pendencias.materiais}</b> material(is) / categoria(s) aguardando aprovação — Materiais</div>`
                  : ''
              }
              ${
                pendencias.mkt > 0
                  ? `<div class="row__meta">🛋️ <b>${pendencias.mkt}</b> produto(s) MKT aguardando aprovação — MKT</div>`
                  : ''
              }
            </div>`
      }
    </div>

    <div class="card" style="margin-top:16px">
      <h3 class="section-title" style="font-size:16px">💡 Alertas e ideias sobre produtividade</h3>
      <p class="section-sub">Baseado em regras, analisando os dados da equipe — não é IA generativa, roda tudo local.</p>
      ${
        insights.length === 0
          ? '<p class="section-sub" style="margin:0">Nenhum alerta no momento.</p>'
          : `<div style="display:flex; flex-direction:column; gap:8px">
              ${insights
                .map(
                  (i) =>
                    `<div class="row__meta">${i.tipo === 'destaque' ? '⭐' : '⚠️'} ${escapeHtml(i.texto)}</div>`
                )
                .join('')}
            </div>`
      }
    </div>

    <div class="card" style="margin-top:16px">
      <h3 class="section-title" style="font-size:16px">💾 Backup dos dados</h3>
      <p class="section-sub">Baixa uma cópia de tudo (serviços, corte, usuários, avisos, etc.) num arquivo .json, pra guardar no seu computador.</p>
      <div id="backup-status" class="row__meta" style="margin-bottom:10px"></div>
      <div style="display:flex; gap:8px; flex-wrap:wrap">
        <button class="btn btn--primary" id="btn-fazer-backup">Fazer backup agora</button>
        <button class="btn btn--ghost" id="btn-restaurar-backup">Restaurar de um backup…</button>
        <input type="file" id="f-arquivo-backup" accept=".json,application/json" style="display:none" />
      </div>
      <div id="restaurar-painel"></div>
    </div>

    <div class="card" style="margin-top:16px">
      <h3 class="section-title" style="font-size:16px">📊 Exportar planilha (Excel / CSV)</h3>
      <p class="section-sub">Diferente do backup: exporta só os serviços concluídos do período, funcionário ou seleção que você escolher, numa tabela limpa pronta pro Excel.</p>
      <button class="btn btn--metal" id="btn-ir-exportar">Escolher o que exportar</button>
    </div>
    <div id="feriados-cont"></div>

    ${
      gruposDuplicados.length > 0
        ? `<div class="card" style="border-color:var(--brand-500); margin-top:16px">
            <h3 class="section-title" style="font-size:16px">Contas de usuário duplicadas</h3>
            <p class="section-sub">Encontrei ${gruposDuplicados.length} nome(s) com mais de uma conta (ex: duas contas "Administrador" — acontece se dois aparelhos abriram o app quase juntos antes de sincronizar). Isso religa o histórico à conta mais antiga e apaga as duplicatas.</p>
            <div id="mesclar-status" class="row__meta" style="margin-bottom:10px"></div>
            <button class="btn btn--primary" id="btn-mesclar-duplicados">Mesclar agora</button>
          </div>`
        : ''
    }

    ${
      duplicadosServicos.extraServicos + duplicadosServicos.extraCorte > 0
        ? `<div class="card" style="border-color:var(--danger-fg); margin-top:16px">
            <h3 class="section-title" style="font-size:16px">Serviços e Plano de Corte duplicados</h3>
            <p class="section-sub">Encontrei <b>${duplicadosServicos.extraServicos}</b> serviço(s) e <b>${duplicadosServicos.extraCorte}</b> registro(s) de Plano de Corte que são cópia exata de outro já existente (geralmente de reimportar a planilha mais de uma vez). Isso mantém o mais antigo de cada grupo e apaga só as cópias — nenhum dado diferente é tocado.</p>
            <div id="remover-dup-status" class="row__meta" style="margin-bottom:10px"></div>
            <button class="btn btn--danger" id="btn-remover-duplicados">Remover ${duplicadosServicos.extraServicos + duplicadosServicos.extraCorte} duplicado(s)</button>
          </div>`
        : ''
    }

    ${
      dataProgramadaCorteAfetados > 0
        ? `<div class="card" style="border-color:var(--warn-fg); margin-top:16px">
            <h3 class="section-title" style="font-size:16px">Data Programada errada no Plano de Corte</h3>
            <p class="section-sub">${dataProgramadaCorteAfetados} registro(s) de Corte ainda têm a Data Programada copiada do Serviço/CNP (bug já corrigido, mas esses são antigos) — isso fazia o corte contar como atrasado sem motivo. Isso só limpa a data, não mexe em mais nada.</p>
            <div id="limpar-prog-status" class="row__meta" style="margin-bottom:10px"></div>
            <button class="btn btn--ghost" id="btn-limpar-prog-corte">Limpar ${dataProgramadaCorteAfetados} registro(s)</button>
          </div>`
        : ''
    }

    ${
      precisaCorrigir
        ? `<div class="card" style="border-color:var(--brand-500); margin-top:16px">
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
  `;

  document.getElementById('btn-fazer-backup').addEventListener('click', async () => {
    const btn = document.getElementById('btn-fazer-backup');
    const statusEl = document.getElementById('backup-status');
    btn.disabled = true;
    statusEl.textContent = 'Preparando backup…';
    try {
      await fazerBackup();
      statusEl.textContent = 'Pronto! O download deve ter começado.';
    } catch (e) {
      statusEl.textContent = 'Erro ao fazer backup: ' + e.message;
    }
    btn.disabled = false;
  });

  const inputBackup = document.getElementById('f-arquivo-backup');
  document.getElementById('btn-restaurar-backup').addEventListener('click', () => inputBackup.click());
  inputBackup.addEventListener('change', async () => {
    const arquivo = inputBackup.files && inputBackup.files[0];
    inputBackup.value = '';
    if (!arquivo) return;
    const painel = document.getElementById('restaurar-painel');
    painel.innerHTML = '<div class="row__meta" style="margin-top:12px">Lendo o arquivo…</div>';
    try {
      const dados = JSON.parse(await arquivo.text());
      if (!dados || typeof dados !== 'object' || !Array.isArray(dados.servicos) || !Array.isArray(dados.usuarios)) {
        throw new Error('esse arquivo não parece um backup do Engenharia Aluminas.');
      }
      AdminView.restaurar = { dados, nomeArquivo: arquivo.name, status: '' };
      await renderPainelRestaurar(painel, dados, arquivo.name);
    } catch (e) {
      painel.innerHTML = `<div class="auth__error show" style="text-align:left; margin-top:12px">Não consegui ler: ${escapeHtml(e.message || String(e))}</div>`;
    }
  });

  // a tela pode ser redesenhada (dados novos chegando): o painel volta
  if (AdminView.restaurar) {
    renderPainelRestaurar(document.getElementById('restaurar-painel'), AdminView.restaurar.dados, AdminView.restaurar.nomeArquivo);
  }

  renderCartaoFeriados(document.getElementById('feriados-cont'));

  document.getElementById('btn-ir-exportar').addEventListener('click', () => {
    RelatorioView.aba = 'relatorio';
    activeTab = 'relatorio';
    renderTabbar();
    renderView('relatorio');
  });

  if (gruposDuplicados.length > 0) {
    document.getElementById('btn-mesclar-duplicados').addEventListener('click', async () => {
      const btn = document.getElementById('btn-mesclar-duplicados');
      const statusEl = document.getElementById('mesclar-status');
      btn.disabled = true;
      try {
        const resultado = await MesclarDuplicados.executar((msg) => (statusEl.textContent = msg));
        statusEl.textContent = `Pronto! ${resultado.mesclados} conta(s) duplicada(s) mesclada(s).`;
        setTimeout(() => renderAdmin(document.getElementById('view')), 1200);
      } catch (e) {
        statusEl.textContent = 'Erro ao mesclar: ' + e.message;
        btn.disabled = false;
      }
    });
  }

  if (duplicadosServicos.extraServicos + duplicadosServicos.extraCorte > 0) {
    document.getElementById('btn-remover-duplicados').addEventListener('click', async () => {
      const total = duplicadosServicos.extraServicos + duplicadosServicos.extraCorte;
      if (!confirm(`Remover ${total} registro(s) duplicado(s)? Essa ação não pode ser desfeita.`)) return;
      const btn = document.getElementById('btn-remover-duplicados');
      const statusEl = document.getElementById('remover-dup-status');
      btn.disabled = true;
      try {
        const resultado = await RemoverDuplicados.executar((msg) => (statusEl.textContent = msg));
        statusEl.textContent = `Pronto! ${resultado.removidos} duplicado(s) removido(s).`;
        setTimeout(() => renderAdmin(document.getElementById('view')), 1200);
      } catch (e) {
        statusEl.textContent = 'Erro ao remover duplicados: ' + e.message;
        btn.disabled = false;
      }
    });
  }

  if (dataProgramadaCorteAfetados > 0) {
    document.getElementById('btn-limpar-prog-corte').addEventListener('click', async () => {
      if (!confirm(`Limpar a Data Programada de ${dataProgramadaCorteAfetados} registro(s) de Corte?`)) return;
      const btn = document.getElementById('btn-limpar-prog-corte');
      const statusEl = document.getElementById('limpar-prog-status');
      btn.disabled = true;
      try {
        const resultado = await LimparDataProgramadaCorte.executar((msg) => (statusEl.textContent = msg));
        statusEl.textContent = `Pronto! ${resultado.corrigidos} registro(s) corrigido(s).`;
        setTimeout(() => renderAdmin(document.getElementById('view')), 1200);
      } catch (e) {
        statusEl.textContent = 'Erro ao limpar: ' + e.message;
        btn.disabled = false;
      }
    });
  }

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

  const todosServicos = await DB.getAll('servicos');
  const contagemPorUsuario = {};
  todosServicos.forEach((s) => {
    if (s.funcionarioId) contagemPorUsuario[s.funcionarioId] = (contagemPorUsuario[s.funcionarioId] || 0) + 1;
  });

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
              <div class="row__meta">@${escapeHtml(u.login)} · ${Const.rotuloTipoUsuario(u.tipo)}${u.tipo !== 'admin' && Permissoes.ehPersonalizado(u) ? ' (personalizado)' : ''}</div>
              ${u.tipo !== 'admin' ? `<div class="row__meta">Vê: ${Permissoes.doUsuario(u).abas.map((id) => (Permissoes.ABAS.find((a) => a.id === id) || {}).label).filter(Boolean).join(', ') || 'nenhuma aba'}${Permissoes.doUsuario(u).somenteLeitura ? ' · Serviços/Corte só leitura' : ''}</div>` : ''}
              <div class="row__meta">${contagemPorUsuario[u.id] || 0} serviço(s) vinculados · ID: ${escapeHtml(u.id)}</div>
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
    AdminView.formValues = { nome: '', login: '', tipo: 'funcionario', permissoes: Permissoes.padraoDoTipo('funcionario') };
    renderAdminUsuarios(cont, view);
  });

  cont.querySelectorAll('[data-editar]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const u = await DB.get('usuarios', btn.dataset.editar);
      AdminView.formAberto = true;
      AdminView.edicaoId = u.id;
      AdminView.fotoBase64 = u.foto || null;
      AdminView.erro = '';
      AdminView.formValues = { nome: u.nome, login: u.login, tipo: u.tipo, permissoes: Permissoes.doUsuario(u) };
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
          <option value="pcp" ${fv.tipo === 'pcp' ? 'selected' : ''}>PCP (só vê serviços/corte concluídos + MKT)</option>
          <option value="mkt" ${fv.tipo === 'mkt' ? 'selected' : ''}>MKT (só vê a aba MKT)</option>
        </select>
        <div class="row__meta" style="margin-top:6px">Trocar o tipo pré-marca as abas padrão dele. Depois você pode ajustar as caixinhas só pra essa pessoa.</div>
      </div>

      ${
        fv.tipo === 'admin'
          ? '<div class="row__meta" style="margin-bottom:16px">Administrador vê todas as abas, inclusive Relatório e o painel Admin.</div>'
          : `<div class="field">
              <label>Abas que essa pessoa pode ver</label>
              <div class="perm-grid">
                ${Permissoes.ABAS.map(
                  (a) => `
                  <label class="perm-item">
                    <input type="checkbox" data-perm-aba="${a.id}" ${fv.permissoes.abas.includes(a.id) ? 'checked' : ''} />
                    <span>${a.label}</span>
                  </label>`
                ).join('')}
              </div>
              <label class="perm-item" style="margin-top:10px">
                <input type="checkbox" id="f-perm-leitura" ${fv.permissoes.somenteLeitura ? 'checked' : ''} />
                <span>Serviços e Corte só leitura (vê apenas os concluídos, não lança nem edita — como o PCP)</span>
              </label>
            </div>`
      }

      <div style="display:flex; gap:10px; margin-top:6px">
        <button class="btn btn--ghost" id="btn-cancelar-usuario" style="flex:1">Cancelar</button>
        <button class="btn btn--primary" id="btn-salvar-usuario" style="flex:2">Salvar</button>
      </div>
    </div>
  `;

  document.getElementById('f-nome-u').addEventListener('input', (ev) => (fv.nome = ev.target.value));
  document.getElementById('f-login-u').addEventListener('input', (ev) => (fv.login = ev.target.value));
  document.getElementById('f-senha-u').addEventListener('input', (ev) => (fv.senha = ev.target.value));
  document.getElementById('f-tipo-u').addEventListener('change', (ev) => {
    fv.tipo = ev.target.value;
    fv.permissoes = Permissoes.padraoDoTipo(fv.tipo);
    renderFormUsuario(cont, view);
  });
  cont.querySelectorAll('[data-perm-aba]').forEach((chk) => {
    chk.addEventListener('change', () => {
      const id = chk.dataset.permAba;
      const set = new Set(fv.permissoes.abas);
      if (chk.checked) set.add(id);
      else set.delete(id);
      fv.permissoes.abas = Permissoes.ABAS.map((a) => a.id).filter((x) => set.has(x));
    });
  });
  const chkLeitura = document.getElementById('f-perm-leitura');
  if (chkLeitura) chkLeitura.addEventListener('change', () => (fv.permissoes.somenteLeitura = chkLeitura.checked));

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

  document.getElementById('btn-salvar-usuario').addEventListener('click', () => salvarUsuarioComTratamentoDeErro(cont, view));
}

async function salvarUsuarioComTratamentoDeErro(cont, view) {
  const btn = document.getElementById('btn-salvar-usuario');
  const btnCancelar = document.getElementById('btn-cancelar-usuario');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Salvando…';
  }
  if (btnCancelar) btnCancelar.disabled = true;
  // mesma trava usada em Serviços: segura o auto-refresh em tempo real
  // enquanto salva, e nunca deixa a tela presa em "Salvando…" pra
  // sempre (limite de 12s) se o servidor não responder
  window.operacaoEmAndamento = true;
  try {
    await comTimeout(salvarUsuario(cont, view));
  } catch (e) {
    console.error('Erro ao salvar usuário:', e);
    AdminView.erro = 'Não consegui salvar: ' + (e && e.message ? e.message : 'erro desconhecido. Confira sua conexão e tente de novo.');
    window.operacaoEmAndamento = false;
    await renderFormUsuario(cont, view);
    return;
  }
  window.operacaoEmAndamento = false;
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
  const perm = AdminView.formValues.permissoes || Permissoes.padraoDoTipo(tipo);
  registro.permissoes = tipo === 'admin' ? null : { abas: [...perm.abas], somenteLeitura: !!perm.somenteLeitura };
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
    const btn = document.getElementById('btn-salvar-anotacao');
    const btnCancelar = document.getElementById('btn-cancelar-anotacao');
    if (btn) { btn.disabled = true; btn.textContent = 'Salvando…'; }
    if (btnCancelar) btnCancelar.disabled = true;
    window.operacaoEmAndamento = true;
    try {
      await comTimeout(
        (async () => {
          const registro = st.editId
            ? await DB.get('anotacoes_admin', st.editId)
            : { id: dbUtil.uid(), criadoEm: Date.now() };
          registro.texto = texto;
          registro.data = st.data ? Const.inputDateParaTimestamp(st.data) : Date.now();
          registro.feito = !!st.feito;
          await DB.put('anotacoes_admin', registro);
          AdminAnotacoesView.subView = 'lista';
          renderAdminAnotacoes(cont, view);
        })()
      );
    } catch (e) {
      console.error('Erro ao salvar anotação:', e);
      st.erro = 'Não consegui salvar: ' + (e && e.message ? e.message : 'erro desconhecido. Confira sua conexão e tente de novo.');
      window.operacaoEmAndamento = false;
      await renderAdminAnotacaoForm(cont, view);
      return;
    }
    window.operacaoEmAndamento = false;
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
  vaiParaAtelie: false,
  vaiParaMarcenaria: false,
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
            ${c.vaiParaAtelie ? '<span class="badge badge--brand">Ateliê</span>' : ''}
            ${c.vaiParaMarcenaria ? '<span class="badge badge--brand">Marcenaria</span>' : ''}
            <span class="badge ${c.temPorcentagem ? 'badge--brand' : 'badge--idle'}">${c.temPorcentagem ? 'Tem %' : 'Sem %'}</span>
            <button class="btn btn--ghost" data-editar-cat="${c.id}" style="padding:6px 12px; font-size:13px">Editar</button>
            <button class="btn btn--danger" data-excluir-cat="${c.id}" data-sistema-cat="${c.sistema ? '1' : ''}" style="padding:6px 12px; font-size:13px">Excluir</button>
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
    AdminCategoriasView.vaiParaAtelie = false;
    AdminCategoriasView.vaiParaMarcenaria = false;
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
      AdminCategoriasView.vaiParaAtelie = !!cat.vaiParaAtelie;
      AdminCategoriasView.vaiParaMarcenaria = !!cat.vaiParaMarcenaria;
      AdminCategoriasView.erro = '';
      renderAdminCategorias(cont, view);
    });
  });

  cont.querySelectorAll('[data-excluir-cat]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const ehSistema = btn.dataset.sistemaCat === '1';
      const aviso = ehSistema
        ? 'Essa é uma categoria PADRÃO do sistema. Excluir vai tirá-la da lista de opções pra novos lançamentos — serviços já lançados com ela continuam existindo normalmente. Excluir mesmo assim?'
        : 'Excluir esta categoria? Serviços já lançados com ela continuam existindo, só não vai mais aparecer pra lançar novos.';
      if (!confirm(aviso)) return;
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

      <label style="display:flex; align-items:center; gap:8px; margin-bottom:20px; font-size:14px; color:var(--ink-soft)">
        <input id="f-cat-atelie" type="checkbox" style="width:18px; height:18px" ${st.vaiParaAtelie ? 'checked' : ''} />
        Vai para o Ateliê (os serviços dessa categoria aparecem na aba Ateliê pra conferência)
      </label>

      <label style="display:flex; align-items:center; gap:8px; margin-bottom:20px; font-size:14px; color:var(--ink-soft)">
        <input id="f-cat-marcenaria" type="checkbox" style="width:18px; height:18px" ${st.vaiParaMarcenaria ? 'checked' : ''} />
        Vai para a Marcenaria (as peças dessa categoria aparecem na aba Marcenaria; com "% de Aproveitamento" marcado vira plano de corte de chapa)
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
  document.getElementById('f-cat-atelie').addEventListener('change', (ev) => (st.vaiParaAtelie = ev.target.checked));
  document.getElementById('f-cat-marcenaria').addEventListener('change', (ev) => (st.vaiParaMarcenaria = ev.target.checked));

  document.getElementById('btn-salvar-categoria').addEventListener('click', async () => {
    const btn = document.getElementById('btn-salvar-categoria');
    const btnCancelar = document.getElementById('btn-cancelar-categoria');
    if (btn) { btn.disabled = true; btn.textContent = 'Salvando…'; }
    if (btnCancelar) btnCancelar.disabled = true;
    window.operacaoEmAndamento = true;
    try {
      await comTimeout(
        (async () => {
          if (editando) {
            await Categorias.atualizar(st.editId, { nome: st.nome, temPorcentagem: st.temPorcentagem, vaiParaAtelie: st.vaiParaAtelie, vaiParaMarcenaria: st.vaiParaMarcenaria });
          } else {
            await Categorias.criar(st.nome, st.temPorcentagem, st.vaiParaAtelie, st.vaiParaMarcenaria);
          }
          st.formAberto = false;
          renderAdminCategorias(cont, view);
        })()
      );
    } catch (e) {
      console.error('Erro ao salvar categoria:', e);
      st.erro = e.message || 'Não consegui salvar. Confira sua conexão e tente de novo.';
      window.operacaoEmAndamento = false;
      await renderFormCategoria(cont, view);
      return;
    }
    window.operacaoEmAndamento = false;
  });
}

/* ---------------- PENDÊNCIAS DE APROVAÇÃO ---------------- */

async function contarPendencias() {
  const [servicos, planoCorte, produtosMkt, materiais, categoriasMat] = await Promise.all([
    DB.getAll('servicos'),
    DB.getAll('plano_corte'),
    DB.getAll('produtos_mkt'),
    DB.getAll('materiais'),
    DB.getAll('categorias_material'),
  ]);
  const gabaritos = await DB.getAll('gabaritos');

  const pendencias = {
    servicos: servicos.filter((s) => s.aprovado === 'pendente').length,
    conclusoes: servicos.filter((s) => !s.dataFinal && s.concluidoInformadoEm).length,
    planoCorte: planoCorte.filter((p) => p.aprovado === 'pendente').length,
    mkt: produtosMkt.filter((p) => p.aprovado === 'pendente').length,
    materiais: materiais.filter((m) => m.aprovado === 'pendente').length + categoriasMat.filter((c) => c.aprovado === 'pendente').length,
    atelie: servicos.filter((s) => s.atelieSolicitacao).length,
    marcenaria: servicos.filter((s) => s.marcenariaSolicitacao).length + gabaritos.filter((g) => g.aprovado === 'pendente').length,
  };
  pendencias.total = pendencias.servicos + pendencias.conclusoes + pendencias.planoCorte + pendencias.mkt + pendencias.materiais + pendencias.atelie + pendencias.marcenaria;
  return pendencias;
}

/* ---------------- BACKUP ---------------- */

/* ---------------- RESTAURAR BACKUP ----------------
   Dois jeitos:
   - "Completar o que falta": só grava o que está no backup e NÃO existe
     mais no app (ex: algo apagado sem querer). Não mexe em nada que já existe.
   - "Voltar exatamente ao backup": cada registro fica igual ao do backup
     e o que foi criado depois do backup é apagado. É uma volta no tempo.
   Antes de qualquer um dos dois, baixa automaticamente um backup de como
   está agora — se arrepender, é só restaurar esse arquivo. */
const NOMES_COLECOES_BACKUP = {
  usuarios: 'Usuários',
  servicos: 'Serviços',
  plano_corte: 'Plano de Corte',
  ferias: 'Férias',
  avisos: 'Avisos',
  anotacoes_admin: 'Anotações',
  diario_admin: 'Diário do Admin',
  treinamento: 'Treino',
  config: 'Configurações',
  destaques: 'Destaques',
  catalogo_itens: 'Catálogo',
  categorias_servico: 'Categorias de serviço',
  produtos_mkt: 'MKT',
  materiais: 'Materiais',
  categorias_material: 'Categorias de material',
  feriados: 'Feriados',
  gabaritos: 'Gabaritos',
};

function chaveDeRegistroBackup(r) {
  return String(r.id ?? r.chave ?? '');
}

async function renderPainelRestaurar(painel, dados, nomeArquivo) {
  const colecoes = Object.keys(NOMES_COLECOES_BACKUP).filter((c) => Array.isArray(dados[c]));
  const linhas = [];
  for (const c of colecoes) {
    const atuais = await DB.getAllAtualizado(c);
    const idsAtuais = new Set(atuais.map(chaveDeRegistroBackup));
    const idsBackup = new Set(dados[c].map(chaveDeRegistroBackup));
    const faltando = dados[c].filter((r) => !idsAtuais.has(chaveDeRegistroBackup(r))).length;
    const novos = atuais.filter((r) => !idsBackup.has(chaveDeRegistroBackup(r))).length;
    linhas.push({ c, noBackup: dados[c].length, agora: atuais.length, faltando, novos });
  }
  const quando = dados.exportadoEm ? Const.formatarDataHora(dados.exportadoEm) : 'data desconhecida';

  painel.innerHTML = `
    <div class="restaurar-box">
      <div class="row__title" style="margin-bottom:4px">Backup de ${escapeHtml(quando)}</div>
      <div class="row__meta" style="margin-bottom:10px">${escapeHtml(nomeArquivo)}</div>
      <div class="tabela-wrap">
        <table class="tabela">
          <thead><tr><th></th><th>O quê</th><th class="num">No backup</th><th class="num">No app agora</th><th class="num">Só no backup</th><th class="num">Criados depois</th></tr></thead>
          <tbody>${linhas
            .map(
              (l) => `<tr>
                <td><input type="checkbox" data-rest-col="${l.c}" ${l.c === 'config' ? '' : 'checked'} /></td>
                <td>${NOMES_COLECOES_BACKUP[l.c]}</td>
                <td class="num">${l.noBackup}</td>
                <td class="num">${l.agora}</td>
                <td class="num">${l.faltando ? `<b>${l.faltando}</b>` : 0}</td>
                <td class="num">${l.novos}</td>
              </tr>`
            )
            .join('')}</tbody>
        </table>
      </div>
      <div class="row__meta" style="margin:6px 0 12px">"Só no backup" = existe no arquivo mas não existe mais no app (foi apagado). "Criados depois" = existe no app mas não existia quando o backup foi feito.</div>

      <label class="perm-item" style="margin-bottom:8px"><input type="radio" name="modo-rest" value="completar" checked />
        <span><b>Completar o que falta</b> — só traz de volta o que foi apagado. Não mexe em nada que já existe no app.</span></label>
      <label class="perm-item"><input type="radio" name="modo-rest" value="exato" />
        <span><b>Voltar exatamente ao backup</b> — tudo fica igual estava em ${escapeHtml(quando)}. O que foi feito ou criado depois disso <b>se perde</b>.</span></label>

      <div class="row__meta" style="margin:12px 0">🛟 Antes de restaurar, o app baixa sozinho um backup de como está agora — se arrepender, é só restaurar esse arquivo.</div>
      <div style="display:flex; gap:8px; flex-wrap:wrap">
        <button class="btn btn--ghost" id="btn-rest-cancelar">Cancelar</button>
        <button class="btn btn--primary" id="btn-rest-executar">Restaurar</button>
      </div>
      <div class="row__meta" id="rest-status" style="margin-top:10px"></div>
    </div>`;

  const st = document.getElementById('rest-status');
  if (AdminView.restaurar && AdminView.restaurar.status) st.innerHTML = AdminView.restaurar.status;
  const guardarStatus = (html) => {
    const el = document.getElementById('rest-status');
    if (el) el.innerHTML = html;
    if (AdminView.restaurar) AdminView.restaurar.status = html;
  };
  document.getElementById('btn-rest-cancelar').addEventListener('click', () => {
    AdminView.restaurar = null;
    painel.innerHTML = '';
  });
  document.getElementById('btn-rest-executar').addEventListener('click', async () => {
    const escolhidas = Array.from(painel.querySelectorAll('[data-rest-col]:checked')).map((x) => x.dataset.restCol);
    const modo = painel.querySelector('[name="modo-rest"]:checked').value;
    if (!escolhidas.length) return alert('Marque pelo menos uma parte pra restaurar.');
    if (modo === 'exato') {
      const conf = prompt(`Isso volta ${escolhidas.length} parte(s) do app pra como estava em ${quando}. O que foi feito depois se perde.\n\nPra confirmar, digite RESTAURAR:`);
      if ((conf || '').trim().toUpperCase() !== 'RESTAURAR') return;
    } else if (!confirm('Trazer de volta o que existe no backup e foi apagado do app?')) return;

    const btn = document.getElementById('btn-rest-executar');
    btn.disabled = true;
    window.operacaoEmAndamento = true;
    try {
      guardarStatus('Baixando um backup de segurança de como está agora…');
      await fazerBackup('backup-ANTES-DE-RESTAURAR');
      let gravados = 0;
      let apagados = 0;
      for (const c of escolhidas) {
        guardarStatus(`Restaurando ${NOMES_COLECOES_BACKUP[c]}…`);
        const atuais = await DB.getAllAtualizado(c);
        const idsAtuais = new Set(atuais.map(chaveDeRegistroBackup));
        const doBackup = dados[c].filter((r) => chaveDeRegistroBackup(r));
        if (modo === 'completar') {
          const faltando = doBackup.filter((r) => !idsAtuais.has(chaveDeRegistroBackup(r)));
          if (faltando.length) await DB.putMany(c, faltando);
          gravados += faltando.length;
        } else {
          if (doBackup.length) await DB.putMany(c, doBackup);
          gravados += doBackup.length;
          const idsBackup = new Set(doBackup.map(chaveDeRegistroBackup));
          const sobrando = atuais.map(chaveDeRegistroBackup).filter((k) => k && !idsBackup.has(k));
          if (sobrando.length) await DB.deleteMany(c, sobrando);
          apagados += sobrando.length;
        }
      }
      window.operacaoEmAndamento = false;
      if (typeof Tempo !== 'undefined') Tempo.limparCache();
      guardarStatus(`<b>Pronto!</b> ${gravados} registro(s) gravado(s)${modo === 'exato' ? ` e ${apagados} apagado(s)` : ''}. O backup de segurança foi baixado como "backup-ANTES-DE-RESTAURAR…".`);
      mostrarAvisoRapido('Backup restaurado ✓');
    } catch (e) {
      window.operacaoEmAndamento = false;
      guardarStatus(`<span style="color:var(--danger-fg)">Parou no meio: ${escapeHtml(e.message || String(e))}. O backup de segurança já foi baixado — dá pra tentar de novo.</span>`);
    }
    const b2 = document.getElementById('btn-rest-executar');
    if (b2) b2.disabled = false;
  });
}

async function fazerBackup(prefixo = 'backup-engenharia-aluminas') {
  const colecoes = [
    'usuarios',
    'servicos',
    'plano_corte',
    'ferias',
    'avisos',
    'anotacoes_admin',
    'diario_admin',
    'treinamento',
    'config',
    'destaques',
    'catalogo_itens',
    'categorias_servico',
    'produtos_mkt',
    'materiais',
    'categorias_material',
    'feriados',
    'gabaritos',
  ];

  const dados = { exportadoEm: Date.now() };
  for (const nome of colecoes) {
    dados[nome] = await DB.getAllAtualizado(nome); // versão do servidor, nunca a cópia velha do aparelho
  }

  const blob = new Blob([JSON.stringify(dados, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const agora = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const dataStr = `${agora.getFullYear()}-${pad(agora.getMonth() + 1)}-${pad(agora.getDate())}_${pad(agora.getHours())}h${pad(agora.getMinutes())}`;
  const a = document.createElement('a');
  a.href = url;
  a.download = `${prefixo}-${dataStr}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
