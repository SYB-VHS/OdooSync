/**
 * Client PostgreSQL pour SyncOdoo
 */

import { Pool, PoolClient, QueryResult } from "pg";

const pool = new Pool({
  host: process.env.POSTGRES_HOST,
  port: parseInt(process.env.POSTGRES_PORT || "5432"),
  database: process.env.POSTGRES_DB || "kanteen",
  user: process.env.POSTGRES_USER,
  password: typeof process.env.POSTGRES_PASSWORD === "string" ? process.env.POSTGRES_PASSWORD : "",
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

export const db = {
  query: async (text: string, params?: any[]): Promise<QueryResult> => {
    const client = await pool.connect();
    try {
      return await client.query(text, params);
    } catch (err: any) {
      if (err?.code === "28P01") {
        err.message = `PostgreSQL: authentification refusée pour l'utilisateur "${process.env.POSTGRES_USER || "?"}". Vérifiez POSTGRES_USER et POSTGRES_PASSWORD dans .env.example (ou .env).`;
      }
      throw err;
    } finally {
      client.release();
    }
  },
  getClient: (): Promise<PoolClient> => pool.connect(),
  end: (): Promise<void> => pool.end(),
};

export type { PoolClient, QueryResult };
