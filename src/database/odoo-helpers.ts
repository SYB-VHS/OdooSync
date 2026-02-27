/**
 * Helpers PostgreSQL pour les opérations Odoo (SyncOdoo)
 */

import { db } from "./postgres.js";

export async function pgUpsert(
  table: string,
  rows: Record<string, any>[],
  conflictColumn: string = "odoo_id"
): Promise<void> {
  if (rows.length === 0) return;
  const columns = Object.keys(rows[0]);
  const colList = columns.join(", ");
  const updateSet = columns
    .filter((c) => c !== conflictColumn)
    .map((c) => `${c} = EXCLUDED.${c}`)
    .join(", ");

  for (let i = 0; i < rows.length; i += 500) {
    const batch = rows.slice(i, i + 500);
    const values: any[] = [];
    const valuePlaceholders: string[] = [];
    batch.forEach((row, rowIdx) => {
      const rowPlaceholders: string[] = [];
      columns.forEach((col, colIdx) => {
        const paramIdx = rowIdx * columns.length + colIdx + 1;
        rowPlaceholders.push(`$${paramIdx}`);
        const val = row[col];
        values.push(
          val !== null && typeof val === "object" && !(val instanceof Date)
            ? JSON.stringify(val)
            : val
        );
      });
      valuePlaceholders.push(`(${rowPlaceholders.join(", ")})`);
    });
    const sql = `
      INSERT INTO ${table} (${colList})
      VALUES ${valuePlaceholders.join(", ")}
      ON CONFLICT (${conflictColumn}) DO UPDATE SET ${updateSet}
    `;
    await db.query(sql, values);
  }
}

export async function pgUpsertComposite(
  table: string,
  rows: Record<string, any>[],
  conflictColumns: string[]
): Promise<void> {
  if (rows.length === 0) return;
  const columns = Object.keys(rows[0]);
  const colList = columns.join(", ");
  const conflictKey = conflictColumns.join(", ");
  const updateSet = columns
    .filter((c) => !conflictColumns.includes(c))
    .map((c) => `${c} = EXCLUDED.${c}`)
    .join(", ");

  for (let i = 0; i < rows.length; i += 500) {
    const batch = rows.slice(i, i + 500);
    const values: any[] = [];
    const valuePlaceholders: string[] = [];
    batch.forEach((row, rowIdx) => {
      const rowPlaceholders: string[] = [];
      columns.forEach((col, colIdx) => {
        const paramIdx = rowIdx * columns.length + colIdx + 1;
        rowPlaceholders.push(`$${paramIdx}`);
        const val = row[col];
        values.push(
          val !== null && typeof val === "object" && !(val instanceof Date)
            ? JSON.stringify(val)
            : val
        );
      });
      valuePlaceholders.push(`(${rowPlaceholders.join(", ")})`);
    });
    const sql = `
      INSERT INTO ${table} (${colList})
      VALUES ${valuePlaceholders.join(", ")}
      ON CONFLICT (${conflictKey}) DO UPDATE SET ${updateSet}
    `;
    await db.query(sql, values);
  }
}

export async function pgSelect<T = any>(
  table: string,
  options?: {
    columns?: string;
    where?: Record<string, any>;
    whereIn?: { column: string; values: any[] };
    whereGt?: { column: string; value: any };
    order?: { column: string; ascending?: boolean };
    limit?: number;
  }
): Promise<T[]> {
  const cols = options?.columns || "*";
  const conditions: string[] = [];
  const params: any[] = [];
  let paramIdx = 1;

  if (options?.where) {
    for (const [key, value] of Object.entries(options.where)) {
      conditions.push(`${key} = $${paramIdx++}`);
      params.push(value);
    }
  }
  if (options?.whereIn) {
    const placeholders = options.whereIn.values.map(() => `$${paramIdx++}`).join(", ");
    conditions.push(`${options.whereIn.column} IN (${placeholders})`);
    params.push(...options.whereIn.values);
  }
  if (options?.whereGt) {
    conditions.push(`${options.whereGt.column} > $${paramIdx++}`);
    params.push(options.whereGt.value);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const orderClause = options?.order
    ? `ORDER BY ${options.order.column} ${options.order.ascending ? "ASC" : "DESC"}`
    : "";
  const limitClause = options?.limit ? `LIMIT ${options.limit}` : "";
  const sql = `SELECT ${cols} FROM ${table} ${whereClause} ${orderClause} ${limitClause}`;
  const { rows } = await db.query(sql, params);
  return rows as T[];
}

export async function pgUpdate(
  table: string,
  data: Record<string, any>,
  where: Record<string, any>
): Promise<any[]> {
  const columns = Object.keys(data);
  const params: any[] = [];
  let paramIdx = 1;
  const setClause = columns
    .map((col) => {
      params.push(data[col]);
      return `${col} = $${paramIdx++}`;
    })
    .join(", ");
  const conditions = Object.entries(where)
    .map(([key, value]) => {
      params.push(value);
      return `${key} = $${paramIdx++}`;
    })
    .join(" AND ");
  const sql = `UPDATE ${table} SET ${setClause} WHERE ${conditions} RETURNING *`;
  const { rows } = await db.query(sql, params);
  return rows;
}

export async function pgSelectOne<T = any>(
  table: string,
  where: Record<string, any>,
  columns: string = "*"
): Promise<T | null> {
  const rows = await pgSelect<T>(table, { columns, where, limit: 1 });
  return rows.length > 0 ? rows[0] : null;
}

export async function pgDeleteNotIn(
  table: string,
  column: string,
  values: number[]
): Promise<number> {
  if (values.length === 0) {
    const result = await db.query(`DELETE FROM ${table}`);
    return result.rowCount ?? 0;
  }
  const result = await db.query(
    `DELETE FROM ${table} WHERE NOT (${column} = ANY($1::int[]))`,
    [values]
  );
  return result.rowCount ?? 0;
}

export async function pgDeleteOrphanQuoteLines(): Promise<number> {
  const result = await db.query(`
    DELETE FROM odoo_quote_lines l
    WHERE NOT EXISTS (
      SELECT 1
      FROM odoo_quotes q
      WHERE q.odoo_id = l.odoo_quote_id
    )
  `);
  return result.rowCount ?? 0;
}
