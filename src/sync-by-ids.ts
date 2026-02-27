/**
 * Synchronise uniquement les enregistrements Odoo dont les IDs sont fournis.
 *
 * IDs par variables d'environnement (liste séparée par des virgules) :
 *   ODOO_SYNC_QUOTE_IDS=1,2,3
 *   ODOO_SYNC_INVOICE_IDS=4,5
 *   ODOO_SYNC_PARTNER_IDS=10,20
 *   ODOO_SYNC_PRODUCT_IDS=100,101
 *
 * Ou en arguments CLI :
 *   npx tsx src/sync-by-ids.ts --quotes=1,2,3 --invoices=4,5 --partners=10 --products=100
 */
import "./env.js";
import { syncQuotesByIds, syncInvoicesByIds, syncPartnersByIds, syncProductsByIds } from "./odoo/sync-fast.js";

function parseIds(value: string | undefined): number[] {
  if (!value || typeof value !== "string") return [];
  return value
    .split(",")
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => !Number.isNaN(n));
}

function getIdsFromEnvOrArgs(): {
  quotes: number[];
  invoices: number[];
  partners: number[];
  products: number[];
} {
  const args = process.argv.slice(2);
  const get = (envKey: string, argPrefix: string): number[] => {
    const fromEnv = parseIds(process.env[envKey]);
    if (fromEnv.length > 0) return fromEnv;
    const arg = args.find((a) => a.startsWith(argPrefix + "="));
    if (arg) return parseIds(arg.slice(argPrefix.length + 1));
    return [];
  };

  return {
    quotes: get("ODOO_SYNC_QUOTE_IDS", "--quotes"),
    invoices: get("ODOO_SYNC_INVOICE_IDS", "--invoices"),
    partners: get("ODOO_SYNC_PARTNER_IDS", "--partners"),
    products: get("ODOO_SYNC_PRODUCT_IDS", "--products"),
  };
}

async function main() {
  const { quotes, invoices, partners, products } = getIdsFromEnvOrArgs();
  const total = quotes.length + invoices.length + partners.length + products.length;

  if (total === 0) {
    console.log(`
Usage: passer les IDs Odoo à synchroniser.

Variables d'environnement (liste séparée par des virgules) :
  ODOO_SYNC_QUOTE_IDS=1,2,3     Devis (sale.order)
  ODOO_SYNC_INVOICE_IDS=4,5    Factures (account.move)
  ODOO_SYNC_PARTNER_IDS=10,20  Clients (res.partner)
  ODOO_SYNC_PRODUCT_IDS=100    Produits (product.product)

Arguments CLI :
  --quotes=1,2,3 --invoices=4,5 --partners=10 --products=100

Exemple :
  ODOO_SYNC_QUOTE_IDS=42 npm run sync:ids
  npx tsx src/sync-by-ids.ts --quotes=42,43 --invoices=100
`);
    process.exit(1);
  }

  console.log("[Sync by IDs] Devis:", quotes.length, "| Factures:", invoices.length, "| Clients:", partners.length, "| Produits:", products.length);

  await Promise.all([
    quotes.length > 0 ? syncQuotesByIds(quotes) : Promise.resolve(),
    invoices.length > 0 ? syncInvoicesByIds(invoices) : Promise.resolve(),
    partners.length > 0 ? syncPartnersByIds(partners) : Promise.resolve(),
    products.length > 0 ? syncProductsByIds(products) : Promise.resolve(),
  ]);

  console.log("[Sync by IDs] Terminé.");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
