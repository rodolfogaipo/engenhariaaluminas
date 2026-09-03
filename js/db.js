/* =========================================================
   db.js — camada de banco de dados local (IndexedDB)
   Este é o "banco de verdade" do app no dia a dia: tudo funciona
   offline lendo/escrevendo aqui. A sincronização com o Google
   Sheets (etapa futura) só troca dados com este banco, nunca
   substitui ele.
   ========================================================= */

const DB_NAME = 'controle_equipe_db';
const DB_VERSION = 3;

const STORES = [
  { name: 'usuarios', keyPath: 'id' },
  { name: 'servicos', keyPath: 'id' },          // CADASTRO DE SERVIÇOS
  { name: 'plano_corte', keyPath: 'id' },
  { name: 'ferias', keyPath: 'id' },
  { name: 'avisos', keyPath: 'id' },
  { name: 'anotacoes_admin', keyPath: 'id' },   // privado do admin
  { name: 'diario_admin', keyPath: 'id' },      // privado do admin
  { name: 'treinamento', keyPath: 'id' },
  { name: 'config', keyPath: 'chave' },         // pesos da fórmula, metas, etc.
  { name: 'destaques', keyPath: 'id' },         // melhor da semana/mês/ano
  { name: 'catalogo_itens', keyPath: 'id' },    // tecidos, telas, espumas, chapas, tubos, móveis já cadastrados
  { name: 'categorias_servico', keyPath: 'id' }, // tipos de serviço (dinâmico, gerenciável pelo Admin)
];

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (ev) => {
      const db = ev.target.result;
      for (const store of STORES) {
        if (!db.objectStoreNames.contains(store.name)) {
          db.createObjectStore(store.name, { keyPath: store.keyPath });
        }
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

let _dbPromise = null;
function getDb() {
  if (!_dbPromise) _dbPromise = openDb();
  return _dbPromise;
}

async function tx(storeName, mode, fn) {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction(storeName, mode);
    const store = t.objectStore(storeName);
    const result = fn(store);
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
  });
}

const DB = {
  async put(storeName, record) {
    return tx(storeName, 'readwrite', (store) => store.put(record));
  },

  async putMany(storeName, records) {
    const db = await getDb();
    return new Promise((resolve, reject) => {
      const t = db.transaction(storeName, 'readwrite');
      const store = t.objectStore(storeName);
      records.forEach((r) => store.put(r));
      t.oncomplete = () => resolve(records.length);
      t.onerror = () => reject(t.error);
    });
  },

  async get(storeName, key) {
    const db = await getDb();
    return new Promise((resolve, reject) => {
      const t = db.transaction(storeName, 'readonly');
      const req = t.objectStore(storeName).get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  },

  async getAll(storeName) {
    const db = await getDb();
    return new Promise((resolve, reject) => {
      const t = db.transaction(storeName, 'readonly');
      const req = t.objectStore(storeName).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  },

  async delete(storeName, key) {
    return tx(storeName, 'readwrite', (store) => store.delete(key));
  },

  async clear(storeName) {
    return tx(storeName, 'readwrite', (store) => store.clear());
  },
};

/* ---- utilitários ---- */

function uid() {
  return (
    Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 9)
  );
}

async function sha256(text) {
  const enc = new TextEncoder().encode(text);
  const hashBuf = await crypto.subtle.digest('SHA-256', enc);
  return Array.from(new Uint8Array(hashBuf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/* ---- seed inicial: cria o primeiro usuário admin se o banco
   estiver vazio, para você conseguir entrar no app no primeiro teste ---- */
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
    peso_erro: 0.10,
    peso_erro_novo: 0.05,
    crescimento_min: 0.05,
    meta_minima: 4,
  });
}

window.DB = DB;
window.dbUtil = { uid, sha256, seedIfEmpty };
