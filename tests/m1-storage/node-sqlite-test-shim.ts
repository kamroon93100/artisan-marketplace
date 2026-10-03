import { DatabaseSync } from "node:sqlite";

type TestTransaction = TestDatabase;

export type SQLiteDatabase = TestDatabase;

export class TestDatabase {
  private readonly db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
  }

  async execAsync(sql: string): Promise<void> {
    this.db.exec(sql);
  }

  async runAsync(sql: string, ...params: any[]): Promise<{ changes: number }> {
    const result = this.db.prepare(sql).run(...params);
    return { changes: Number(result.changes) };
  }

  async getFirstAsync<T extends Record<string, unknown>>(
    sql: string,
    ...params: any[]
  ): Promise<T | null> {
    const row = this.db.prepare(sql).get(...params);
    return (row ?? null) as T | null;
  }

  async getAllAsync<T extends Record<string, unknown>>(
    sql: string,
    ...params: any[]
  ): Promise<T[]> {
    return this.db.prepare(sql).all(...params) as T[];
  }

  async withExclusiveTransactionAsync(
    callback: (txn: TestTransaction) => Promise<void>,
  ): Promise<void> {
    this.db.exec("BEGIN EXCLUSIVE");

    try {
      await callback(this);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
}

export async function openDatabaseAsync(
  _name: string,
): Promise<TestDatabase> {
  return new TestDatabase(new DatabaseSync(":memory:"));
}
