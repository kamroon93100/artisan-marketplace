export type SqlParams = readonly unknown[];

export interface SqlExecutor {
  query<T>(
    sql: string,
    params?: SqlParams,
  ): Promise<readonly T[]>;
}

export type Transaction = SqlExecutor;

export interface Database extends SqlExecutor {
  transaction<T>(
    operation: (tx: Transaction) => Promise<T>,
  ): Promise<T>;
}
