/** 浏览器本地个人论文库：元数据 + PDF 二进制分库存于 IndexedDB，避免撑爆 localStorage */

export const PERSONAL_PDFS_CHANGED_EVENT = 'research_map2-personal-pdfs-changed';

const DB_NAME = 'research_map2_personal_pdf_v1';
const META_STORE = 'meta';
const BLOB_STORE = 'blobs';
const DB_VERSION = 1;

export type PersonalPdfMeta = {
  id: string;
  name: string;
  size: number;
  createdAt: number;
};

function notifyChanged() {
  try {
    window.dispatchEvent(new CustomEvent(PERSONAL_PDFS_CHANGED_EVENT));
  } catch {
    // ignore
  }
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error ?? new Error('indexedDB open failed'));
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(BLOB_STORE)) {
        db.createObjectStore(BLOB_STORE);
      }
    };
  });
}

/** 列出全部论文元数据（按时间倒序） */
export async function listPersonalPdfs(): Promise<PersonalPdfMeta[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(META_STORE, 'readonly');
    const req = tx.objectStore(META_STORE).getAll();
    req.onsuccess = () => {
      const rows = req.result as PersonalPdfMeta[];
      resolve(rows.sort((a, b) => b.createdAt - a.createdAt));
    };
    req.onerror = () => reject(req.error);
  });
}

export async function getPersonalPdfBlob(id: string): Promise<Blob | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(BLOB_STORE, 'readonly');
    const req = tx.objectStore(BLOB_STORE).get(id);
    req.onsuccess = () => {
      const buf = req.result as ArrayBuffer | undefined;
      if (!buf) {
        resolve(null);
        return;
      }
      resolve(new Blob([buf], { type: 'application/pdf' }));
    };
    req.onerror = () => reject(req.error);
  });
}

export async function addPersonalPdfs(files: File[]): Promise<number> {
  const pdfs = files.filter(
    (f) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name)
  );
  if (!pdfs.length) return 0;

  const db = await openDb();
  let added = 0;

  for (const file of pdfs) {
    const id = `pdf-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const buffer = await file.arrayBuffer();
    const meta: PersonalPdfMeta = {
      id,
      name: file.name || '未命名.pdf',
      size: file.size,
      createdAt: Date.now(),
    };

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction([META_STORE, BLOB_STORE], 'readwrite');
      tx.objectStore(META_STORE).put(meta);
      tx.objectStore(BLOB_STORE).put(buffer, id);
      tx.oncomplete = () => {
        added += 1;
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    });
  }

  notifyChanged();
  return added;
}

export async function removePersonalPdf(id: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([META_STORE, BLOB_STORE], 'readwrite');
    tx.objectStore(META_STORE).delete(id);
    tx.objectStore(BLOB_STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  notifyChanged();
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export { formatBytes };
