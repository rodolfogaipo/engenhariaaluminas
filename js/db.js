/* =========================================================
   db.js — camada de banco de dados (Firestore, com cache local)

   Mantém EXATAMENTE a mesma API que o app já usa (DB.get, DB.put,
   DB.getAll, DB.putMany, DB.delete) — só troca o que tem por trás,
   do IndexedDB local para o Firestore compartilhado. Nenhum outro
   arquivo do app precisa mudar por causa disso.

   Estratégia pra não estourar a cota gratuita do Firestore: cada
   "coleção" (usuarios, servicos, etc.) é sincronizada UMA VEZ por
   sessão via onSnapshot, e fica guardada em memória. Depois disso,
   ler os dados (getAll/get) não custa nada — só escrever (put/
   delete) fala com o Firestore, e as mudanças chegam sozinhas pra
   todo mundo em tempo real. Combinado com o cache offline do
   Firestore, o app continua funcionando sem internet também.
   ========================================================= */

import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js';
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  deleteDoc,
  onSnapshot,
  writeBatch,
  enableIndexedDbPersistence,
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
const firestore = getFirestore(firebaseApp);

// cache offline: deixa o app funcionar sem internet e evita re-baixar
// tudo de novo a cada abertura (só sincroniza o que mudou)
enableIndexedDbPersistence(firestore).catch(() => {
  // acontece se tiver mais de uma aba aberta ao mesmo tempo — sem problema,
  // o app continua funcionando, só sem persistência offline nessa aba
});

const chaveDoRegistro = (record) => String(record.id ?? record.chave);

// coleções sincronizadas em memória: nome -> { mapa, pronto, resolvePronto }
const _colecoes = {};

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
        }
      },
      () => resolve() // se der erro (ex: offline na 1ª vez), libera assim mesmo
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
    id: uid(),
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
