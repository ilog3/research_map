const FAVORITES_KEY = 'research_map2_favorites_v2';
const LEGACY_KEY = 'research_map2_chat_favorites_v1';

export type FavoriteEntry =
  | {
      id: string;
      kind: 'message';
      threadId: string;
      messageId: string;
      content: string;
      preview: string;
      createdAt: number;
    }
  | {
      id: string;
      kind: 'thread';
      threadId: string;
      title: string;
      createdAt: number;
    };

function notifyFavoritesChanged() {
  try {
    window.dispatchEvent(new CustomEvent('research_map2-favorites-changed'));
  } catch {
    // ignore
  }
}

function migrateLegacy(): FavoriteEntry[] {
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw) as Array<{ id: string; content: string; createdAt: number }>;
    if (!Array.isArray(list)) return [];
    return list.map((x) => ({
      id: x.id || `mig-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      kind: 'message' as const,
      threadId: 'legacy',
      messageId: x.id || 'legacy',
      content: x.content || '',
      preview: (x.content || '').slice(0, 120).replace(/\s+/g, ' '),
      createdAt: typeof x.createdAt === 'number' ? x.createdAt : Date.now(),
    }));
  } catch {
    return [];
  }
}

export function loadFavorites(): FavoriteEntry[] {
  try {
    const raw = localStorage.getItem(FAVORITES_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as FavoriteEntry[];
      return Array.isArray(parsed) ? parsed : [];
    }
    const migrated = migrateLegacy();
    if (migrated.length) {
      localStorage.setItem(FAVORITES_KEY, JSON.stringify(migrated));
    }
    return migrated;
  } catch {
    return [];
  }
}

function saveAll(entries: FavoriteEntry[]) {
  localStorage.setItem(FAVORITES_KEY, JSON.stringify(entries.slice(0, 300)));
  notifyFavoritesChanged();
}

export function addMessageFavorite(input: {
  threadId: string;
  messageId: string;
  content: string;
}): FavoriteEntry | null {
  const text = input.content.trim();
  if (!text) return null;
  const id = `fav-msg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const entry: FavoriteEntry = {
    id,
    kind: 'message',
    threadId: input.threadId,
    messageId: input.messageId,
    content: text,
    preview: text.slice(0, 160).replace(/\s+/g, ' ').trim() + (text.length > 160 ? '…' : ''),
    createdAt: Date.now(),
  };
  const all = loadFavorites().filter(
    (e) =>
      !(e.kind === 'message' && e.threadId === input.threadId && e.messageId === input.messageId)
  );
  all.unshift(entry);
  saveAll(all);
  return entry;
}

export function addThreadFavorite(input: { threadId: string; title: string }): FavoriteEntry | null {
  if (!input.threadId.trim()) return null;
  const id = `fav-th-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const entry: FavoriteEntry = {
    id,
    kind: 'thread',
    threadId: input.threadId,
    title: input.title.trim() || '未命名会话',
    createdAt: Date.now(),
  };
  const all = loadFavorites().filter((e) => !(e.kind === 'thread' && e.threadId === input.threadId));
  all.unshift(entry);
  saveAll(all);
  return entry;
}

export function removeFavorite(id: string) {
  const all = loadFavorites().filter((e) => e.id !== id);
  saveAll(all);
}
