/* =========================================================
   db.js — camada de banco de dados (Firestore, com cache local)

   Mantém EXATAMENTE a mesma API que o app já usa (DB.get, DB.put,
   DB.getAll, DB.putMany, DB.delete) — só troca o que tem por trás,
   do IndexedDB local para o Firestore compartilhado.

   Duas coisas importantes pra não travar o app com coleções grandes
   (ex: milhares de serviços importados da planilha):

   1. Cache local persistente "de verdade" (API moderna do Firestore)
      — depois da primeira sincronização, reabrir o app é rápido,
      porque os dados já estão salvos no próprio aparelho.

   2. As telas se atualizam sozinhas conforme os dados chegam, em vez
      de ficar tudo travado esperando a coleção inteira antes de
      mostrar qualquer coisa. Isso é o que também faz a sincronização
      em tempo real entre aparelhos funcionar.
   ========================================================= */

import {
  initializeApp,
} from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  collection,
  doc,
  setDoc,
  deleteDoc,
  updateDoc,
  onSnapshot,
  writeBatch,
  getDocsFromServer,
} from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js';

const firebaseConfig = {
  apiKey: 'AIzaSyAqgvwa8AGcuoAV5oFhUFn9IfiX56-aB84',
  authDomain: 'engenharia-aluminas.firebaseapp.com',
  projectId: 'engenharia-aluminas',
  storageBucket: 'engenharia-aluminas.firebasestorage.app',
  messagingSenderId: '686082435207',
  appId: '1:686082435207:web:409a147e1d29ae62fcb022',
};

const firebaseApp = initializeApp(firebaseConfig);

// cache local persistente (aceita várias abas abertas ao mesmo tempo,
// sem falhar silenciosamente como a API antiga fazia)
const firestore = initializeFirestore(firebaseApp, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});

const chaveDoRegistro = (record) => String(record.id ?? record.chave);

// coleções sincronizadas em memória: nome -> { mapa, pronto }
const _colecoes = {};

// o app.js registra aqui uma função pra re-renderizar a tela atual
// sempre que os dados mudarem (localmente ou vindos de outro aparelho)
window.aoDadosMudarem = () => {};

/* Cada coleção tem duas "prontidões":
   - pronto: chegou o 1º retrato (pode ser a CÓPIA GUARDADA no aparelho,
     que às vezes está velha) → bom pra MOSTRAR rápido na tela;
   - sincronizado: chegou a versão do SERVIDOR → obrigatório antes de
     GRAVAR. Sem isso, um aparelho que ficou dias sem abrir o app podia
     ler a cópia velha e gravar por cima do que os outros fizeram.
   Sem internet, libera depois de 12 s com o que tiver (como antes). */
function garantirColecao(nome) {
  if (_colecoes[nome]) return _colecoes[nome];
  const estado = { mapa: new Map(), pronto: null, sincronizado: null, doServidor: false };
  let liberarPronto;
  let liberarSinc;
  estado.pronto = new Promise((r) => (liberarPronto = r));
  estado.sincronizado = new Promise((r) => (liberarSinc = r));
  let primeiraVez = true;
  const timerSinc = setTimeout(() => liberarSinc(), 12000);
  onSnapshot(
    collection(firestore, nome),
    { includeMetadataChanges: true },
    (snapshot) => {
      const mudancas = snapshot.docChanges();
      mudancas.forEach((mudanca) => {
        if (mudanca.type === 'removed') estado.mapa.delete(mudanca.doc.id);
        else estado.mapa.set(mudanca.doc.id, mudanca.doc.data());
      });
      if (!snapshot.metadata.fromCache && !estado.doServidor) {
        estado.doServidor = true;
        clearTimeout(timerSinc);
        liberarSinc();
      }
      if (primeiraVez) {
        primeiraVez = false;
        liberarPronto();
      } else if (mudancas.length) {
        window.aoDadosMudarem();
      }
    },
    () => {
      clearTimeout(timerSinc);
      liberarPronto();
      liberarSinc();
    }
  );
  _colecoes[nome] = estado;
  return estado;
}

async function esperarServidor(nome) {
  await garantirColecao(nome).sincronizado;
}

const DB = {
  async put(storeName, record) {
    await esperarServidor(storeName);
    const chave = chaveDoRegistro(record);
    await setDoc(doc(firestore, storeName, chave), record);
    return record;
  },

  async putMany(storeName, records) {
    await esperarServidor(storeName);
    // Firestore só aceita até 500 operações por lote
    const TAMANHO_LOTE = 450;
    for (let i = 0; i < records.length; i += TAMANHO_LOTE) {
      const pedaco = records.slice(i, i + TAMANHO_LOTE);
      const lote = writeBatch(firestore);
      pedaco.forEach((r) => lote.set(doc(firestore, storeName, chaveDoRegistro(r)), r));
      await lote.commit();
    }
    return records.length;
  },

  async get(storeName, key) {
    const c = garantirColecao(storeName);
    await c.pronto;
    return c.mapa.get(String(key)) || null;
  },

  async getAll(storeName) {
    const c = garantirColecao(storeName);
    await c.pronto;
    return Array.from(c.mapa.values());
  },

  // Ignora QUALQUER cache local (do navegador ou do app instalado) e
  // busca direto do servidor. Mais lento, mas é a única forma de ter
  // certeza absoluta do que realmente existe salvo — usado nas
  // ferramentas de diagnóstico do Admin, pra nunca mais depender do
  // que um aparelho específico guardou localmente.
  // lista já com a versão do servidor (pra quem vai gravar em cima)
  async getAllAtualizado(storeName) {
    const c = garantirColecao(storeName);
    await c.sincronizado;
    return Array.from(c.mapa.values());
  },

  /* Grava SÓ os campos informados, sem mexer no resto do registro.
     Se outra pessoa mudou outro campo ao mesmo tempo, nada se perde. */
  async atualizarCampos(storeName, key, campos) {
    await esperarServidor(storeName);
    await updateDoc(doc(firestore, storeName, String(key)), campos);
  },

  async atualizarCamposEmLote(storeName, itens) {
    await esperarServidor(storeName);
    const TAMANHO_LOTE = 450;
    for (let i = 0; i < itens.length; i += TAMANHO_LOTE) {
      const lote = writeBatch(firestore);
      itens.slice(i, i + TAMANHO_LOTE).forEach(({ id, campos }) => lote.update(doc(firestore, storeName, String(id)), campos));
      await lote.commit();
    }
  },

  async getAllFromServer(storeName) {
    const snapshot = await getDocsFromServer(collection(firestore, storeName));
    return snapshot.docs.map((d) => d.data());
  },

  async delete(storeName, key) {
    await esperarServidor(storeName);
    await deleteDoc(doc(firestore, storeName, String(key)));
  },

  async deleteMany(storeName, keys) {
    await esperarServidor(storeName);
    // Firestore só aceita até 500 operações por lote — em vez de
    // apagar um por um (lento, com ida e volta ao servidor a cada
    // item), manda tudo em blocos de até 450 numa única operação
    const TAMANHO_LOTE = 450;
    for (let i = 0; i < keys.length; i += TAMANHO_LOTE) {
      const pedaco = keys.slice(i, i + TAMANHO_LOTE);
      const lote = writeBatch(firestore);
      pedaco.forEach((k) => lote.delete(doc(firestore, storeName, String(k))));
      await lote.commit();
    }
  },

  async clear(storeName) {
    const c = garantirColecao(storeName);
    await c.sincronizado;
    const chaves = Array.from(c.mapa.keys());
    const TAMANHO_LOTE = 450;
    for (let i = 0; i < chaves.length; i += TAMANHO_LOTE) {
      const pedaco = chaves.slice(i, i + TAMANHO_LOTE);
      const lote = writeBatch(firestore);
      pedaco.forEach((k) => lote.delete(doc(firestore, storeName, k)));
      await lote.commit();
    }
  },
};

/* ---- utilitários (iguais a antes, não dependem de onde os dados ficam) ---- */

function uid() {
  return Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 9);
}

async function sha256(text) {
  const enc = new TextEncoder().encode(text);
  const hashBuf = await crypto.subtle.digest('SHA-256', enc);
  return Array.from(new Uint8Array(hashBuf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function seedIfEmpty() {
  const usuarios = await DB.getAll('usuarios');
  if (usuarios.length > 0) return;

  const senhaHash = await sha256('admin123');
  await DB.put('usuarios', {
    id: 'seed-admin-principal', // fixo de propósito: evita duas contas Admin
    // se dois aparelhos "semearem" ao mesmo tempo, os dois escrevem
    // no MESMO documento em vez de criar dois diferentes
    nome: 'Administrador',
    login: 'admin',
    senhaHash,
    tipo: 'admin',
    foto: null,
    criadoEm: Date.now(),
  });

  await DB.put('config', {
    chave: 'pesos_formula',
    peso_produtividade: 0.45,
    peso_prazo: 0.25,
    peso_atraso: 0.15,
    peso_erro: 0.1,
    peso_erro_novo: 0.05,
    crescimento_min: 0.05,
    meta_minima: 4,
  });
}

window.DB = DB;
window.dbUtil = { uid, sha256, seedIfEmpty };
