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

import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  collection,
  doc,
  setDoc,
  deleteDoc,
  onSnapshot,
  writeBatch,
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

function garantirColecao(nome) {
  if (_colecoes[nome]) return _colecoes[nome];

  const estado = { mapa: new Map(), pronto: null };
  estado.pronto = new Promise((resolve) => {
    let primeiraVez = true;
    onSnapshot(
      collection(firestore, nome),
      (snapshot) => {
        snapshot.docChanges().forEach((mudanca) => {
          if (mudanca.type === 'removed') {
            estado.mapa.delete(mudanca.doc.id);
          } else {
            estado.mapa.set(mudanca.doc.id, mudanca.doc.data());
          }
        });
        if (primeiraVez) {
          primeiraVez = false;
          resolve();
        } else {
          // atualização depois da primeira carga: atualiza a tela sozinho
          window.aoDadosMudarem();
        }
      },
      () => resolve() // se der erro (ex: sem internet na 1ª vez), libera assim mesmo
    );
  });

  _colecoes[nome] = estado;
  return estado;
}

const DB = {
  async put(storeName, record) {
    const chave = chaveDoRegistro(record);
    await setDoc(doc(firestore, storeName, chave), record);
    return record;
  },

  async putMany(storeName, records) {
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

  async delete(storeName, key) {
    await deleteDoc(doc(firestore, storeName, String(key)));
  },

  async clear(storeName) {
    const c = garantirColecao(storeName);
    await c.pronto;
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
