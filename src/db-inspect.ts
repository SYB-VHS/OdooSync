/**
 * Affiche en console les données synchronisées (comptages + échantillons).
 * Usage: npm run db:inspect
 */
import "./env.js";
import { db } from "./database/postgres.js";

const TABLES: { table: string; label: string; sampleCols: string }[] = [
  { table: "odoo_sync_status", label: "Statut sync", sampleCols: "entity_type, last_sync_date, last_write_date" },
  { table: "odoo_taxes", label: "Taxes", sampleCols: "odoo_id, name, amount" },
  { table: "odoo_products", label: "Produits", sampleCols: "odoo_id, name, list_price" },
  { table: "odoo_partners", label: "Partenaires", sampleCols: "odoo_id, name, email" },
  { table: "odoo_quotes", label: "Devis", sampleCols: "odoo_id, name, partner_name, amount_total" },
  { table: "odoo_quote_lines", label: "Lignes devis", sampleCols: "odoo_id, name, price_subtotal" },
  { table: "odoo_invoices", label: "Factures", sampleCols: "odoo_id, name, partner_name, amount_total" },
  { table: "odoo_invoice_lines", label: "Lignes factures", sampleCols: "odoo_id, name, quantity" },
  { table: "odoo_payments", label: "Paiements", sampleCols: "odoo_id, name, amount, date" },
  { table: "odoo_payment_invoice_links", label: "Liens paiement↔facture", sampleCols: "odoo_payment_id, odoo_invoice_id" },
];

async function main() {
  console.log("--- Données sync Odoo (PostgreSQL) ---\n");

  for (const { table, label, sampleCols } of TABLES) {
    try {
      const countRes = await db.query(`SELECT count(*)::int as n FROM ${table}`);
      const n = countRes.rows[0]?.n ?? 0;
      console.log(`${label} (${table}): ${n} ligne(s)`);

      if (n > 0) {
        const orderBy =
          table === "odoo_sync_status"
            ? "ORDER BY entity_type"
            : table === "odoo_payment_invoice_links"
              ? "ORDER BY odoo_payment_id, odoo_invoice_id"
              : "ORDER BY synced_at DESC NULLS LAST, odoo_id LIMIT 3";
        const limit = orderBy.includes("LIMIT") ? "" : " LIMIT 3";
        const sampleRes = await db.query(
          `SELECT ${sampleCols} FROM ${table} ${orderBy}${limit}`
        );
        for (const row of sampleRes.rows) {
          console.log("  ", row);
        }
      }
      console.log("");
    } catch (e: any) {
      console.log(`${label} (${table}): erreur ${e?.message ?? e}\n`);
    }
  }

  await db.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
