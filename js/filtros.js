/* =========================================================
   filtros.js — barra comum de Funcionário / Data / Ordem
   Usada em Serviços, Corte, Ateliê, Marcenaria e Materiais.
   Cada aba tem a sua escolha guardada (enquanto o app está aberto).
   ========================================================= */

const FiltrosLista = {
  estados: {},

  estado(chave, padrao = {}) {
    if (!this.estados[chave]) this.estados[chave] = { funcionario: '', de: '', ate: '', ordem: padrao.ordem || 'recentes' };
    return this.estados[chave];
  },

  ROTULOS: {
    prazo: 'Prazo (o que fazer primeiro)',
    recentes: 'Data: mais recentes',
    antigos: 'Data: mais antigos',
    az: 'Ordem alfabética (A → Z)',
    za: 'Ordem alfabética (Z → A)',
  },

  /* opcoes: { ordens: ['prazo','recentes',...], funcionarios: [{id,nome}] | null, rotuloData } */
  html(chave, opcoes) {
    const st = this.estado(chave, { ordem: opcoes.ordens[0] });
    const ativo = st.funcionario || st.de || st.ate;
    return `
      <div class="filtros-extra">
        ${
          opcoes.funcionarios
            ? `<div class="field filtros-extra__campo">
                <label>Funcionário</label>
                <select data-fl-func="${chave}">
                  <option value="">Todos</option>
                  <option value="__sem__" ${st.funcionario === '__sem__' ? 'selected' : ''}>Sem funcionário</option>
                  ${opcoes.funcionarios
                    .map((f) => `<option value="${escapeHtml(f.id)}" ${st.funcionario === f.id ? 'selected' : ''}>${escapeHtml(f.nome)}</option>`)
                    .join('')}
                </select>
              </div>`
            : ''
        }
        <div class="field filtros-extra__campo">
          <label>${escapeHtml(opcoes.rotuloData || 'Data')} — de</label>
          <input type="date" data-fl-de="${chave}" value="${escapeHtml(st.de)}" />
        </div>
        <div class="field filtros-extra__campo">
          <label>até</label>
          <input type="date" data-fl-ate="${chave}" value="${escapeHtml(st.ate)}" />
        </div>
        <div class="field filtros-extra__campo filtros-extra__ordem">
          <label>Ordenar</label>
          <select data-fl-ordem="${chave}">
            ${opcoes.ordens.map((o) => `<option value="${o}" ${st.ordem === o ? 'selected' : ''}>${this.ROTULOS[o]}</option>`).join('')}
          </select>
        </div>
        ${ativo ? `<button class="btn btn--ghost filtros-extra__limpar" data-fl-limpar="${chave}">Limpar filtros</button>` : ''}
      </div>`;
  },

  ligar(raiz, chave, aoMudar) {
    const st = this.estado(chave);
    const q = (a) => raiz.querySelector(`[${a}="${chave}"]`);
    const func = q('data-fl-func');
    if (func) func.addEventListener('change', () => ((st.funcionario = func.value), aoMudar()));
    const ord = q('data-fl-ordem');
    if (ord) ord.addEventListener('change', () => ((st.ordem = ord.value), aoMudar()));
    // datas: só aplica ao sair do campo (digitar à mão não perde o cursor)
    [['data-fl-de', 'de'], ['data-fl-ate', 'ate']].forEach(([a, k]) => {
      const el = q(a);
      if (!el) return;
      el.addEventListener('change', () => {
        st[k] = el.value;
        if (document.activeElement !== el) aoMudar();
      });
      el.addEventListener('blur', () => {
        if (st[k] !== el.value) st[k] = el.value;
        setTimeout(() => {
          const at = document.activeElement;
          if (at && (at.matches(`[data-fl-de="${chave}"]`) || at.matches(`[data-fl-ate="${chave}"]`))) return;
          aoMudar();
        }, 0);
      });
    });
    const limpar = q('data-fl-limpar');
    if (limpar) limpar.addEventListener('click', () => ((st.funcionario = ''), (st.de = ''), (st.ate = ''), aoMudar()));
  },

  /* acessores: { func(item) → id, data(item) → timestamp, nome(item) → texto,
     prazo(item) → timestamp|null (só nos abertos), aberto(item) → bool,
     prioridade(a,b) → desempate padrão } */
  aplicar(lista, chave, ac) {
    const st = this.estado(chave);
    const ini = st.de ? Const.inputDateParaTimestamp(st.de) : null;
    const fim = st.ate ? Const.inputDateParaTimestamp(st.ate) + 24 * 60 * 60 * 1000 : null;
    let out = lista.filter((x) => {
      if (st.funcionario) {
        const f = ac.func(x) || '';
        if (st.funcionario === '__sem__' ? f : f !== st.funcionario) return false;
      }
      if (ini != null || fim != null) {
        const d = ac.data(x);
        if (!d) return false;
        if (ini != null && d < ini) return false;
        if (fim != null && d >= fim) return false;
      }
      return true;
    });
    const nome = (x) => String(ac.nome(x) || '');
    const porNome = (a, b) => nome(a).localeCompare(nome(b), 'pt-BR', { numeric: true, sensitivity: 'base' });
    const data = (x) => ac.data(x) || 0;
    if (st.ordem === 'az') out.sort((a, b) => porNome(a, b));
    else if (st.ordem === 'za') out.sort((a, b) => porNome(b, a));
    else if (st.ordem === 'antigos') out.sort((a, b) => data(a) - data(b));
    else if (st.ordem === 'recentes') out.sort((a, b) => data(b) - data(a));
    else if (st.ordem === 'prazo') {
      // abertos COM prazo no topo, do mais urgente (atrasado) pro mais
      // distante; depois o resto na ordem padrão da aba
      const prazo = (x) => (ac.aberto(x) ? ac.prazo(x) || null : null);
      out.sort((a, b) => {
        const pa = prazo(a);
        const pb = prazo(b);
        if (pa && pb) return pa - pb || porNome(a, b);
        if (pa) return -1;
        if (pb) return 1;
        return ac.prioridade ? ac.prioridade(a, b) : data(b) - data(a);
      });
    }
    return out;
  },

  // "Atrasado 3 dias" / "Vence hoje" / "Vence em 2 dias"
  seloPrazo(ts) {
    if (!ts) return '';
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const d = new Date(ts);
    d.setHours(0, 0, 0, 0);
    const dias = Math.round((d - hoje) / 86400000);
    const data = formatarDataCurta(ts).slice(0, 5);
    if (dias < 0) return `<span class="badge badge--danger">⏰ Atrasado ${-dias} dia${dias === -1 ? '' : 's'} · ${data}</span>`;
    if (dias === 0) return `<span class="badge badge--warn">⏰ Prazo hoje</span>`;
    return `<span class="badge badge--brand">⏰ Prazo ${data}${dias <= 3 ? ` · ${dias} dia${dias === 1 ? '' : 's'}` : ''}</span>`;
  },
};

window.FiltrosLista = FiltrosLista;
