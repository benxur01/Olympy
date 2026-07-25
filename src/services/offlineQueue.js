// Oflayn rejim uchun submit "outbox" — internet uzilganda yuborilmagan
// javob payloadlari IndexedDB'da navbatga qo'yiladi va aloqa tiklangach
// avtomatik qayta yuboriladi. Faqat OXIRGI submit qadamini himoyalaydi;
// imtihon davomidagi javoblar allaqachon localStorage'da saqlanadi
// (pages/OlympiadTest.jsx). Backend `/api/attempts/` idempotent
// (unique (user, olympiad)) — shu sababli qayta yuborish xavfsiz: server
// ikkinchi marta ballamaydi, mavjud yoki "allaqachon qatnashgansiz"
// javobini qaytaradi.
const DB_NAME = 'olympy-offline';
const DB_VERSION = 1;
const STORE = 'submitOutbox';

let _dbPromise = null;

function openDb() {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('indexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('indexedDB open failed'));
  });
  return _dbPromise;
}

function tx(mode, fn) {
  return openDb().then((db) => new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE, mode);
    const store = transaction.objectStore(STORE);
    let result;
    Promise.resolve(fn(store)).then((r) => { result = r; }).catch(reject);
    transaction.oncomplete = () => resolve(result);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  }));
}

// Kutilayotgan submit'ni navbatga qo'shadi. `payload` — `/api/attempts/` ga
// yuboriladigan xom body (olympiad, answers, time_spent, code_answers?).
export async function enqueueSubmit({ olympiadId, payload }) {
  return tx('readwrite', (store) => new Promise((resolve, reject) => {
    const record = { olympiadId, payload, timestamp: Date.now() };
    const req = store.add(record);
    req.onsuccess = () => resolve(req.result); // yangi id
    req.onerror = () => reject(req.error);
  }));
}

export async function listPending() {
  return tx('readonly', (store) => new Promise((resolve, reject) => {
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  }));
}

export async function removeItem(id) {
  return tx('readwrite', (store) => new Promise((resolve, reject) => {
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  }));
}

export async function hasPending(olympiadId) {
  try {
    const items = await listPending();
    if (olympiadId == null) return items.length > 0;
    return items.some((i) => String(i.olympiadId) === String(olympiadId));
  } catch {
    return false;
  }
}

// Bir vaqtda faqat bitta drain ishlashi uchun modul-darajali qulf. Bir nechta
// tinglovchi (OlympiadTest + app-daraja, 'online' + mount) bir vaqtda
// chaqirsa ham ikki marta yuborilmaydi.
let _draining = false;

// Navbatni bo'shatadi: har bir kutilayotgan itemni `/api/attempts/` ga
// yuborishga urinadi. Natijaga qarab callback chaqiradi:
//   onSubmitted(item, resp)        — 200 muvaffaqiyat (yangi yoki dublikat
//                                    attempt — ikkalasi ham to'liq data qaytaradi)
//   onAlreadySubmitted(item, err)  — server allaqachon topshirilgan deydi (data yo'q)
//   onExpired(item, err)           — grace oynasidan keyin: vaqt tugagan
//   onError(item, err)             — boshqa qat'iy server xatosi (qayta urinish foydasiz)
// Tarmoq xatosi (status 0) yoki auth muddati (401) — item saqlanadi va drain
// to'xtaydi; keyingi 'online'/mount urinishida qayta sinaladi.
export async function drainOutbox(handlers = {}) {
  const { onSubmitted, onAlreadySubmitted, onExpired, onError } = handlers;
  if (_draining) return;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
  const api = globalThis.OlympyApi;
  if (!api || typeof api.submitAttempt !== 'function') return;

  _draining = true;
  try {
    const items = await listPending();
    for (const item of items) {
      try {
        // Token'ni ataylab uzatmaymiz — api.js aktiv store/cookie'dan oladi.
        // Tokenni IndexedDB'da saqlash xavfsizlik xatari bo'lardi.
        const resp = await api.submitAttempt(item.payload);
        await removeItem(item.id);
        try { onSubmitted && onSubmitted(item, resp); } catch {}
      } catch (err) {
        const status = err?.status;
        const detail = String(err?.data?.detail || err?.message || '');
        // Haqiqiy tarmoq xatosi — hali oflayn. Saqlab, drain'ni to'xtatamiz.
        if (status === 0) break;
        // Auth muddati tugagan — qayta login kerak. Saqlab, to'xtatamiz.
        if (status === 401) break;
        // Server ichki xatosi (5xx) — vaqtinchalik bo'lishi mumkin. Saqlab,
        // keyingi urinishga qoldiramiz.
        if (status >= 500) break;
        // Bu nuqtadan keyin — qat'iy 4xx javoblar: qayta yuborish foyda
        // bermaydi, shuning uchun itemni o'chiramiz.
        await removeItem(item.id);
        if (/allaqachon|already/i.test(detail)) {
          try { onAlreadySubmitted && onAlreadySubmitted(item, err); } catch {}
        } else if (/tugagan|expired|vaqti/i.test(detail)) {
          try { onExpired && onExpired(item, err); } catch {}
        } else {
          try { onError && onError(item, err); } catch {}
        }
      }
    }
  } finally {
    _draining = false;
  }
}

export const OlympyOfflineQueue = {
  enqueueSubmit,
  listPending,
  removeItem,
  hasPending,
  drainOutbox,
};

export default OlympyOfflineQueue;
