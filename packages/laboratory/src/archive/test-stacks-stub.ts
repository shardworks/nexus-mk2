/**
 * Tiny in-memory StacksApi stub for tests that exercise the
 * archive-presence safety check (`assertArchiveRowExists`).
 *
 * Just enough to satisfy the surface the teardown engines and
 * extractors hit (`readBook(...).count` / `find` / `get`,
 * `book(...).put`). Production code does not depend on this — it
 * lives next to the archive code so engine tests don't reach across
 * package internals to wire it up.
 */

import type {
  Book,
  BookEntry,
  BookQuery,
  ChangeHandler,
  ListOptions,
  ReadOnlyBook,
  StacksApi,
  TransactionContext,
  WatchOptions,
  WhereClause,
} from '@shardworks/stacks-apparatus';

interface BookKey {
  ownerId: string;
  bookName: string;
}

function keyOf(ownerId: string, bookName: string): string {
  return `${ownerId}/${bookName}`;
}

/** Simple WhereClause matcher — supports `=` and `!=`; enough for our tests. */
function matchesWhere(entry: BookEntry, where: WhereClause | { or: WhereClause[] } | undefined): boolean {
  if (!where) return true;
  if ('or' in where) {
    return where.or.some((sub) => matchesWhere(entry, sub));
  }
  for (const cond of where) {
    const [field, op, ...rest] = cond;
    const val = (entry as Record<string, unknown>)[field];
    switch (op) {
      case '=':
        if (val !== rest[0]) return false;
        break;
      case '!=':
        if (val === rest[0]) return false;
        break;
      case 'IS NULL':
        if (val !== null && val !== undefined) return false;
        break;
      case 'IS NOT NULL':
        if (val === null || val === undefined) return false;
        break;
      default:
        // Other ops aren't needed for these tests; treat as match-all.
        break;
    }
  }
  return true;
}

export class StacksTestStub {
  private readonly storage = new Map<string, Map<string, BookEntry>>();

  reset(): void {
    this.storage.clear();
  }

  /** Pre-seed a row directly (test setup). */
  seed(key: BookKey, entry: BookEntry): void {
    const k = keyOf(key.ownerId, key.bookName);
    const book = this.storage.get(k) ?? new Map<string, BookEntry>();
    book.set(entry.id, entry);
    this.storage.set(k, book);
  }

  /** Snapshot all rows for a book (test inspection). */
  rows(ownerId: string, bookName: string): BookEntry[] {
    return [...(this.storage.get(keyOf(ownerId, bookName))?.values() ?? [])];
  }

  asApi(): StacksApi {
    return {
      book: <T extends BookEntry>(ownerId: string, bookName: string): Book<T> => {
        return this.makeBook<T>(ownerId, bookName);
      },
      readBook: <T extends BookEntry>(ownerId: string, bookName: string): ReadOnlyBook<T> => {
        return this.makeBook<T>(ownerId, bookName);
      },
      watch: <T extends BookEntry>(
        _ownerId: string,
        _bookName: string,
        _handler: ChangeHandler<T>,
        _options?: WatchOptions,
      ) => {
        // No-op — tests don't exercise CDC.
      },
      transaction: async <R>(_fn: (tx: TransactionContext) => Promise<R>): Promise<R> => {
        throw new Error('StacksTestStub.transaction is not implemented');
      },
      dropBook: async (_ownerId: string, _bookName: string) => {
        // No-op for tests.
      },
    };
  }

  private makeBook<T extends BookEntry>(ownerId: string, bookName: string): Book<T> {
    const k = keyOf(ownerId, bookName);
    const ensure = (): Map<string, BookEntry> => {
      const existing = this.storage.get(k);
      if (existing) return existing;
      const fresh = new Map<string, BookEntry>();
      this.storage.set(k, fresh);
      return fresh;
    };

    return {
      get: async (id: string): Promise<T | null> => {
        return ((ensure().get(id) as T | undefined) ?? null);
      },
      find: async (query: BookQuery): Promise<T[]> => {
        const all = [...ensure().values()];
        const filtered = all.filter((e) => matchesWhere(e, query.where));
        return filtered as T[];
      },
      list: async (_options?: ListOptions): Promise<T[]> => {
        return [...ensure().values()] as T[];
      },
      count: async (where?: WhereClause | { or: WhereClause[] }): Promise<number> => {
        const all = [...ensure().values()];
        return all.filter((e) => matchesWhere(e, where)).length;
      },
      put: async (entry: T): Promise<void> => {
        ensure().set(entry.id, entry);
      },
      patch: async (id: string, fields: Partial<Omit<T, 'id'>>): Promise<T> => {
        const book = ensure();
        const existing = book.get(id);
        if (!existing) throw new Error(`StacksTestStub: missing row "${id}" in ${k}`);
        const merged = { ...existing, ...fields } as T;
        book.set(id, merged);
        return merged;
      },
      delete: async (id: string): Promise<void> => {
        ensure().delete(id);
      },
    };
  }
}
