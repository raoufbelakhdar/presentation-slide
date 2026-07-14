import { Asset, FavoriteComponent, Project, SavedComponent, SceneTemplate } from './types';

const DB_NAME = 'visual-learning-scenes';
const DB_VERSION = 1;
const STORE_NAME = 'app-state';
const RECORD_KEY = 'library';
const FALLBACK_STORAGE_KEY = 'visual-learning-library-v2';

export interface PersistedLibraryRecord {
  activeProjectId: string | null;
  projects: Project[];
  sharedAssetsVersion?: number;
  sharedAssets: Asset[];
  sharedSavedComponents?: SavedComponent[];
  favorites: FavoriteComponent[];
  templates: Array<Omit<SceneTemplate, 'thumbnailDataUrl'> & { thumbnailDataUrl?: string }>;
}

function supportsIndexedDb() {
  return typeof window !== 'undefined' && 'indexedDB' in window;
}

function loadFallbackRecord(): PersistedLibraryRecord | null {
  try {
    const rawRecord = window.localStorage.getItem(FALLBACK_STORAGE_KEY);
    return rawRecord ? JSON.parse(rawRecord) as PersistedLibraryRecord : null;
  } catch {
    return null;
  }
}

function saveFallbackRecord(record: PersistedLibraryRecord) {
  window.localStorage.setItem(FALLBACK_STORAGE_KEY, JSON.stringify(record));
}

function compactProject(project: Project): Project {
  return {
    ...project,
    templates: [],
  };
}

function compactTemplate(template: PersistedLibraryRecord['templates'][number]): PersistedLibraryRecord['templates'][number] {
  const { thumbnailDataUrl: _thumbnailDataUrl, ...persistedTemplate } = template;
  return persistedTemplate;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Failed to open IndexedDB'));
  });
}

export async function loadPersistedLibrary(): Promise<PersistedLibraryRecord | null> {
  if (!supportsIndexedDb()) {
    return loadFallbackRecord();
  }

  let database: IDBDatabase | null = null;

  try {
    database = await openDatabase();
    return await new Promise<PersistedLibraryRecord | null>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(RECORD_KEY);

      request.onsuccess = () => {
        resolve((request.result as PersistedLibraryRecord | undefined) ?? null);
      };
      request.onerror = () => reject(request.error || new Error('Failed to read persisted library'));
      transaction.onerror = () => reject(transaction.error || new Error('Failed to read persisted library'));
    });
  } catch {
    return loadFallbackRecord();
  } finally {
    database?.close();
  }
}

export async function savePersistedLibrary(record: PersistedLibraryRecord): Promise<void> {
  const payload: PersistedLibraryRecord = {
    activeProjectId: record.activeProjectId,
    projects: record.projects.map((project) => compactProject(project)),
    sharedAssetsVersion: record.sharedAssetsVersion,
    sharedAssets: record.sharedAssets.map((asset) => ({ ...asset })),
    sharedSavedComponents: record.sharedSavedComponents?.map((component) => ({ ...component })),
    favorites: record.favorites.map((favorite) => ({ ...favorite })),
    templates: record.templates.map((template) => compactTemplate(template)),
  };

  if (!supportsIndexedDb()) {
    saveFallbackRecord(payload);
    return;
  }

  let database: IDBDatabase | null = null;

  try {
    database = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);

      store.put(payload, RECORD_KEY);

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error('Failed to save persisted library'));
      transaction.onabort = () => reject(transaction.error || new Error('Failed to save persisted library'));
    });
    window.localStorage.removeItem(FALLBACK_STORAGE_KEY);
  } catch {
    saveFallbackRecord(payload);
  } finally {
    database?.close();
  }
}
