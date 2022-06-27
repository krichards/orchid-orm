import { Pool, PoolConfig, QueryResultRow } from 'pg';
import { SqlAdapter } from '../sql/sql.types';

export const Pg = (config: PoolConfig): SqlAdapter => {
  const pool = new Pool(config);

  return {
    async query<T extends QueryResultRow = any>(
      query: string
    ): Promise<{ rows: T[] }> {
      const client = await pool.connect();
      try {
        return await client.query<T>(query);
      } finally {
        client.release();
      }
    },
    async arrays<R extends any[] = any[]>(
      query: string
    ): Promise<{ rows: R[] }> {
      const client = await pool.connect();
      try {
        return await client.query<R>({
          text: query,
          rowMode: 'array',
        });
      } finally {
        client.release();
      }
    },
    destroy() {
      return pool.end();
    },
  };
};