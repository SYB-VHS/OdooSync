/**
 * Synchronisation Odoo → PostgreSQL (SyncOdoo autonome)
 */

import {
  pgUpsert,
  pgUpsertComposite,
  pgSelect,
  pgSelectOne,
  pgDeleteNotIn,
  pgDeleteOrphanQuoteLines,
} from "../database/odoo-helpers.js";
import { toOdooDatetime, domainSanitizeForOdoo19 } from "./utils.js";

const ODOO_URL = process.env.ODOO_URL || "";
const ODOO_DB = process.env.ODOO_DB || "";
const ODOO_USERNAME = process.env.ODOO_USERNAME || "";
const ODOO_PASSWORD = process.env.ODOO_PASSWORD || "";
const ODOO_SEARCH_READ_BATCH_SIZE = (() => {
  const n = Number(process.env.ODOO_SEARCH_READ_BATCH_SIZE || "5000");
  return Number.isFinite(n) && n > 0 ? n : 5000;
})();
const QUOTE_LINES_LOOKBACK_MS = (() => {
  const n = Number(process.env.QUOTE_LINES_LOOKBACK_MS || "900000");
  return Number.isFinite(n) && n >= 0 ? n : 900000;
})();

async function getLastWriteDate(entityType: string): Promise<Date | null> {
  try {
    const row = await pgSelectOne("odoo_sync_status", { entity_type: entityType }, "last_write_date");
    return row?.last_write_date ? new Date(row.last_write_date) : null;
  } catch (error) {
    console.error(`[Sync] Erreur getLastWriteDate pour ${entityType}:`, error);
    return null;
  }
}

async function updateSyncStatus(entityType: string, lastWriteDate: Date | null) {
  try {
    const now = new Date();
    await pgUpsert(
      "odoo_sync_status",
      [{
        entity_type: entityType,
        last_sync_date: now.toISOString(),
        last_write_date: lastWriteDate?.toISOString() || null,
        updated_at: now.toISOString(),
      }],
      "entity_type"
    );
  } catch (error) {
    console.error(`[Sync] Erreur updateSyncStatus pour ${entityType}:`, error);
  }
}

async function authenticate(): Promise<number | null> {
  const url = (ODOO_URL || "").trim();
  if (!url || !url.startsWith("http")) {
    throw new Error("ODOO_URL doit être défini dans .env (ex: https://votre-instance.odoo.com). Vérifiez que le fichier .env est dans SyncOdoo/ ou à la racine du projet.");
  }
  try {
    const response = await fetch(`${url}/jsonrpc`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "call",
        params: {
          service: "common",
          method: "authenticate",
          args: [ODOO_DB, ODOO_USERNAME, ODOO_PASSWORD, {}],
        },
        id: Math.floor(Math.random() * 1000000),
      }),
    });
    if (!response.ok) {
      const hint = response.status === 404
        ? ` Vérifiez ODOO_URL (ex: https://votre-base.odoo.com), sans slash final. 404 = URL incorrecte ou API externe non disponible sur votre offre Odoo.`
        : "";
      throw new Error(`Erreur HTTP ${response.status} lors de l'authentification Odoo (${url}/jsonrpc).${hint}`);
    }
    const contentType = response.headers.get("content-type");
    if (!contentType || !contentType.includes("application/json")) throw new Error("Réponse invalide d'Odoo");
    const data = await response.json();
    if (data.error) throw new Error(`Erreur d'authentification Odoo: ${data.error.message || JSON.stringify(data.error)}`);
    const uid = data.result;
    return typeof uid === "number" && uid > 0 ? uid : null;
  } catch (error) {
    console.error("Erreur d'authentification Odoo:", error);
    throw error;
  }
}

async function odooSearchRead(
  model: string,
  domain: any[],
  fields: string[],
  limit: number = 10000,
  offset: number = 0,
  order?: string
): Promise<any[]> {
  const uid = await authenticate();
  if (!uid) throw new Error("Échec de l'authentification Odoo");
  const sanitizedDomain = domainSanitizeForOdoo19(domain);
  const kwargs: Record<string, unknown> = { fields, limit, offset };
  if (order != null && order !== "") kwargs.order = order;

  const response = await fetch(`${ODOO_URL}/jsonrpc`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "call",
      params: {
        service: "object",
        method: "execute_kw",
        args: [ODOO_DB, uid, ODOO_PASSWORD, model, "search_read", [sanitizedDomain], kwargs],
      },
      id: Math.floor(Math.random() * 1000000),
    }),
  });
  if (!response.ok) throw new Error(`Erreur HTTP ${response.status} pour ${model}`);
  const contentType = response.headers.get("content-type");
  if (!contentType || !contentType.includes("application/json")) throw new Error(`Réponse invalide d'Odoo pour ${model}`);
  const data = await response.json();
  if (data.error) {
    const errDetail = data.error.data?.message || data.error.data?.debug || "";
    console.error(`[Sync] Odoo error detail for ${model}:`, errDetail.substring(0, 500));
    throw new Error(`Erreur API Odoo (${model}): ${data.error.message || JSON.stringify(data.error)}`);
  }
  return data.result || [];
}

async function odooSearchReadAll(
  model: string,
  domain: any[],
  fields: string[],
  batchSize: number = ODOO_SEARCH_READ_BATCH_SIZE,
  order: string = "id asc"
): Promise<any[]> {
  const allRows: any[] = [];
  let offset = 0;

  while (true) {
    const batch = await odooSearchRead(model, domain, fields, batchSize, offset, order);
    allRows.push(...batch);
    if (batch.length < batchSize) break;
    offset += batchSize;
  }

  return allRows;
}

async function odooSearchIds(
  model: string,
  domain: any[],
  limit: number = 5000,
  offset: number = 0
): Promise<number[]> {
  const uid = await authenticate();
  if (!uid) throw new Error("Echec de l'authentification Odoo");
  const sanitizedDomain = domainSanitizeForOdoo19(domain);

  const response = await fetch(`${ODOO_URL}/jsonrpc`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "call",
      params: {
        service: "object",
        method: "execute_kw",
        args: [
          ODOO_DB,
          uid,
          ODOO_PASSWORD,
          model,
          "search",
          [sanitizedDomain],
          { limit, offset, order: "id asc" },
        ],
      },
      id: Math.floor(Math.random() * 1000000),
    }),
  });

  if (!response.ok) throw new Error(`Erreur HTTP ${response.status} pour ${model}.search`);
  const data = await response.json();
  if (data.error) {
    throw new Error(`Erreur API Odoo (${model}.search): ${data.error.message || JSON.stringify(data.error)}`);
  }
  return Array.isArray(data.result) ? data.result : [];
}

async function odooSearchAllIds(model: string, domain: any[]): Promise<number[]> {
  const ids: number[] = [];
  const batchSize = 5000;
  let offset = 0;

  while (true) {
    const batch = await odooSearchIds(model, domain, batchSize, offset);
    ids.push(...batch);
    if (batch.length < batchSize) break;
    offset += batchSize;
  }

  return ids;
}

function maxWriteDateOf(items: any[], current: Date | null): Date | null {
  return items.reduce((max: Date | null, item: any) => {
    if (!item.write_date) return max;
    const wd = new Date(item.write_date);
    return !max || wd > max ? wd : max;
  }, current);
}

function withLookback(date: Date | null, lookbackMs: number): Date | null {
  if (!date || lookbackMs <= 0) return date;
  return new Date(Math.max(0, date.getTime() - lookbackMs));
}

async function purgeDeletedQuotesAndOrphans() {
  const odooQuoteIds = await odooSearchAllIds("sale.order", []);
  const deletedQuotes = await pgDeleteNotIn("odoo_quotes", "odoo_id", odooQuoteIds);
  const deletedOrphanLines = await pgDeleteOrphanQuoteLines();

  if (deletedQuotes > 0 || deletedOrphanLines > 0) {
    console.log(
      `[Sync] Purge devis: ${deletedQuotes} devis supprimes, ${deletedOrphanLines} lignes orphelines supprimees`
    );
  }
}

export async function syncTaxes() {
  const lastWriteDate = await getLastWriteDate("taxes");
  const domain: any[] = [];
  if (lastWriteDate) domain.push(["write_date", ">", toOdooDatetime(lastWriteDate)]);
  const taxes = await odooSearchRead("account.tax", domain, ["id", "name", "amount", "amount_type", "type_tax_use", "write_date"], 10000);
  if (taxes.length === 0) return { synced: 0 };
  await pgUpsert("odoo_taxes", taxes.map((t: any) => ({
    odoo_id: t.id, name: t.name, amount: t.amount || 0, amount_type: t.amount_type || null, type_tax_use: t.type_tax_use || null,
    odoo_write_date: t.write_date ? new Date(t.write_date) : null, odoo_data: t, synced_at: new Date().toISOString(),
  })));
  await updateSyncStatus("taxes", maxWriteDateOf(taxes, lastWriteDate));
  return { synced: taxes.length };
}

export async function syncProducts() {
  const lastWriteDate = await getLastWriteDate("products");
  const domain: any[] = [];
  if (lastWriteDate) domain.push(["write_date", ">", toOdooDatetime(lastWriteDate)]);
  const products = await odooSearchRead("product.product", domain, ["id", "name", "default_code", "list_price", "categ_id", "write_date"], 10000);
  if (products.length === 0) return { synced: 0 };
  await pgUpsert("odoo_products", products.map((p: any) => ({
    odoo_id: p.id, name: p.name, default_code: p.default_code || null, list_price: p.list_price || 0,
    categ_id: Array.isArray(p.categ_id) ? p.categ_id[0] : p.categ_id || null,
    categ_name: Array.isArray(p.categ_id) ? p.categ_id[1] : null,
    odoo_write_date: p.write_date ? new Date(p.write_date) : null, odoo_data: p, synced_at: new Date().toISOString(),
  })));
  await updateSyncStatus("products", maxWriteDateOf(products, lastWriteDate));
  return { synced: products.length };
}

export async function syncPartners() {
  const lastWriteDate = await getLastWriteDate("partners");
  const domain: any[] = [["customer_rank", ">", 0]];
  if (lastWriteDate) domain.push(["write_date", ">", toOdooDatetime(lastWriteDate)]);
  const partners = await odooSearchRead("res.partner", domain, [
    "id", "name", "parent_id", "is_company", "email", "phone", "street", "street2", "city", "zip", "country_id",
    "customer_rank", "supplier_rank", "vat", "website", "comment", "write_date",
  ], 10000);
  if (partners.length === 0) return { synced: 0 };
  await pgUpsert("odoo_partners", partners.map((p: any) => ({
    odoo_id: p.id, name: p.name, parent_id: Array.isArray(p.parent_id) ? p.parent_id[0] : p.parent_id || null,
    is_company: p.is_company || false, email: p.email || null, phone: p.phone || null, mobile: null,
    street: p.street || null, street2: p.street2 || null, city: p.city || null, zip: p.zip || null,
    country_id: Array.isArray(p.country_id) ? p.country_id[0] : p.country_id || null,
    country_name: Array.isArray(p.country_id) ? p.country_id[1] : null, image_128: null,
    customer_rank: p.customer_rank || 0, supplier_rank: p.supplier_rank || 0, vat: p.vat || null, website: p.website || null, comment: p.comment || null,
    odoo_write_date: p.write_date ? new Date(p.write_date) : null, odoo_data: p, synced_at: new Date().toISOString(),
  })));
  await updateSyncStatus("partners", maxWriteDateOf(partners, lastWriteDate));
  return { synced: partners.length };
}

export async function syncQuotes() {
  const lastWriteDate = await getLastWriteDate("quotes");
  const domain: any[] = [];
  if (lastWriteDate) domain.push(["write_date", ">", toOdooDatetime(lastWriteDate)]);
  const quotes = await odooSearchRead("sale.order", domain, [
    "id", "name", "partner_id", "date_order", "commitment_date", "amount_total", "amount_untaxed", "state", "user_id", "write_date",
  ], 10000);
  if (quotes.length === 0) return { synced: 0 };
  await pgUpsert("odoo_quotes", quotes.map((q: any) => ({
    odoo_id: q.id, name: q.name, odoo_partner_id: Array.isArray(q.partner_id) ? q.partner_id[0] : q.partner_id,
    partner_name: Array.isArray(q.partner_id) ? q.partner_id[1] : null, date_order: q.date_order ? new Date(q.date_order) : null,
    commitment_date: q.commitment_date ? new Date(q.commitment_date) : null, amount_total: q.amount_total || 0, amount_untaxed: q.amount_untaxed || 0,
    state: q.state || null, odoo_user_id: Array.isArray(q.user_id) ? q.user_id[0] : null, user_name: Array.isArray(q.user_id) ? q.user_id[1] : null,
    odoo_write_date: q.write_date ? new Date(q.write_date) : null, odoo_data: q, synced_at: new Date().toISOString(),
  })));
  await updateSyncStatus("quotes", maxWriteDateOf(quotes, lastWriteDate));
  return { synced: quotes.length };
}

export async function syncQuoteLines() {
  const lastWriteDate = await getLastWriteDate("quote_lines");
  const effectiveLastWriteDate = withLookback(lastWriteDate, QUOTE_LINES_LOOKBACK_MS);
  const domain: any[] = [];
  if (effectiveLastWriteDate) domain.push(["write_date", ">", toOdooDatetime(effectiveLastWriteDate)]);
  const lines = await odooSearchReadAll("sale.order.line", domain, [
    "id", "order_id", "product_id", "name", "product_uom_qty", "price_unit", "price_subtotal", "discount", "display_type", "tax_ids", "product_uom_id", "write_date",
  ]);
  if (lines.length === 0) return { synced: 0 };
  const taxIds = new Set<number>();
  lines.forEach((line: any) => {
    if (line.tax_ids && Array.isArray(line.tax_ids)) {
      line.tax_ids.forEach((t: any) => {
        const id = Array.isArray(t) ? t[0] : t;
        if (typeof id === "number") taxIds.add(id);
      });
    }
  });
  let taxesMap = new Map();
  if (taxIds.size > 0) {
    const taxes = await pgSelect("odoo_taxes", { whereIn: { column: "odoo_id", values: Array.from(taxIds) } });
    taxesMap = new Map(taxes.map((t: any) => [t.odoo_id, t]));
  }
  await pgUpsert("odoo_quote_lines", lines.map((line: any) => {
    const taxesDetail: any[] = [];
    if (line.tax_ids && Array.isArray(line.tax_ids)) {
      line.tax_ids.forEach((t: any) => {
        const id = Array.isArray(t) ? t[0] : t;
        if (typeof id === "number" && taxesMap.has(id)) {
          const tax = taxesMap.get(id);
          taxesDetail.push({ id: tax.odoo_id, name: tax.name, amount: tax.amount, amount_type: tax.amount_type });
        }
      });
    }
    return {
      odoo_id: line.id, odoo_quote_id: Array.isArray(line.order_id) ? line.order_id[0] : line.order_id,
      odoo_product_id: Array.isArray(line.product_id) ? line.product_id[0] : line.product_id || null,
      product_name: Array.isArray(line.product_id) ? line.product_id[1] : null, name: line.name,
      product_uom_qty: line.product_uom_qty || 0, price_unit: line.price_unit || 0, price_subtotal: line.price_subtotal || 0, price_tax: 0, discount: line.discount || 0,
      display_type: line.display_type || null, product_uom: Array.isArray(line.product_uom_id) ? line.product_uom_id[1] : line.product_uom_id || null,
      taxes_detail: taxesDetail, odoo_write_date: line.write_date ? new Date(line.write_date) : null, odoo_data: line, synced_at: new Date().toISOString(),
    };
  }));
  await updateSyncStatus("quote_lines", maxWriteDateOf(lines, lastWriteDate));
  return { synced: lines.length };
}

export async function syncInvoices() {
  const lastWriteDate = await getLastWriteDate("invoices");
  const domain: any[] = [["move_type", "in", ["out_invoice", "out_refund"]], ["state", "in", ["posted", "draft"]]];
  if (lastWriteDate) domain.push(["write_date", ">", toOdooDatetime(lastWriteDate)]);
  const invoices = await odooSearchRead("account.move", domain, [
    "id", "name", "partner_id", "invoice_date", "invoice_date_due", "amount_total", "amount_untaxed", "amount_residual", "state", "payment_state", "move_type", "invoice_origin", "write_date",
  ], 10000);
  if (invoices.length === 0) return { synced: 0 };
  await pgUpsert("odoo_invoices", invoices.map((inv: any) => ({
    odoo_id: inv.id, name: inv.name, odoo_partner_id: Array.isArray(inv.partner_id) ? inv.partner_id[0] : inv.partner_id,
    partner_name: Array.isArray(inv.partner_id) ? inv.partner_id[1] : null, invoice_date: inv.invoice_date || null, invoice_date_due: inv.invoice_date_due || null,
    amount_total: inv.amount_total || 0, amount_untaxed: inv.amount_untaxed || 0, amount_residual: inv.amount_residual || 0,
    state: inv.state || null, payment_state: inv.payment_state || null, move_type: inv.move_type || null, invoice_origin: inv.invoice_origin || null,
    odoo_write_date: inv.write_date ? new Date(inv.write_date) : null, odoo_data: inv, synced_at: new Date().toISOString(),
  })));
  await updateSyncStatus("invoices", maxWriteDateOf(invoices, lastWriteDate));
  return { synced: invoices.length };
}

export async function syncInvoiceLines() {
  const lastWriteDate = await getLastWriteDate("invoice_lines");
  const syncedInvoices = await pgSelect("odoo_invoices", { columns: "odoo_id" });
  if (syncedInvoices.length === 0) return { synced: 0 };
  const invoiceIds = syncedInvoices.map((inv: any) => inv.odoo_id);
  const domain: any[] = [["move_id", "in", invoiceIds]];
  if (lastWriteDate) domain.push(["write_date", ">", toOdooDatetime(lastWriteDate)]);
  const lines = await odooSearchRead("account.move.line", domain, [
    "id", "move_id", "product_id", "name", "quantity", "price_unit", "price_subtotal", "discount", "display_type", "tax_ids", "account_id", "write_date",
  ], 10000);
  if (lines.length === 0) return { synced: 0 };
  const taxIds = new Set<number>();
  lines.forEach((line: any) => {
    if (line.tax_ids && Array.isArray(line.tax_ids)) {
      line.tax_ids.forEach((t: any) => {
        const id = Array.isArray(t) ? t[0] : t;
        if (typeof id === "number") taxIds.add(id);
      });
    }
  });
  let taxesMap = new Map();
  if (taxIds.size > 0) {
    const taxes = await pgSelect("odoo_taxes", { whereIn: { column: "odoo_id", values: Array.from(taxIds) } });
    taxesMap = new Map(taxes.map((t: any) => [t.odoo_id, t]));
  }
  await pgUpsert("odoo_invoice_lines", lines.map((line: any) => {
    const taxesDetail: any[] = [];
    if (line.tax_ids && Array.isArray(line.tax_ids)) {
      line.tax_ids.forEach((t: any) => {
        const id = Array.isArray(t) ? t[0] : t;
        if (typeof id === "number" && taxesMap.has(id)) {
          const tax = taxesMap.get(id);
          taxesDetail.push({ id: tax.odoo_id, name: tax.name, amount: tax.amount, amount_type: tax.amount_type });
        }
      });
    }
    let calculatedPriceTax = 0;
    if (line.price_subtotal && taxesDetail.length > 0) {
      const avgRate = taxesDetail.reduce((s: number, t: any) => s + (t.amount || 0), 0) / taxesDetail.length;
      calculatedPriceTax = (line.price_subtotal * avgRate) / 100;
    }
    return {
      odoo_id: line.id, odoo_invoice_id: Array.isArray(line.move_id) ? line.move_id[0] : line.move_id,
      odoo_product_id: Array.isArray(line.product_id) ? line.product_id[0] : line.product_id || null,
      product_name: Array.isArray(line.product_id) ? line.product_id[1] : null, name: line.name, quantity: line.quantity || 0, price_unit: line.price_unit || 0,
      price_subtotal: line.price_subtotal || 0, price_tax: calculatedPriceTax, discount: line.discount || 0, display_type: line.display_type || null,
      account_id: Array.isArray(line.account_id) ? line.account_id[0] : line.account_id || null,
      account_name: Array.isArray(line.account_id) ? line.account_id[1] : null, analytic_account_id: null, exclude_from_invoice_tab: false,
      taxes_detail: taxesDetail, odoo_write_date: line.write_date ? new Date(line.write_date) : null, odoo_data: line, synced_at: new Date().toISOString(),
    };
  }));
  await updateSyncStatus("invoice_lines", maxWriteDateOf(lines, lastWriteDate));
  return { synced: lines.length };
}

export async function syncPayments() {
  const lastWriteDate = await getLastWriteDate("payments");
  const syncedInvoices = await pgSelect("odoo_invoices", { columns: "odoo_id" });
  if (syncedInvoices.length === 0) return { synced: 0 };
  const invoiceIds = syncedInvoices.map((inv: any) => inv.odoo_id);
  const domain: any[] = [["state", "=", "posted"], ["invoice_ids", "in", invoiceIds]];
  if (lastWriteDate) domain.push(["write_date", ">", toOdooDatetime(lastWriteDate)]);
  const payments = await odooSearchRead("account.payment", domain, [
    "id", "name", "date", "amount", "payment_type", "state", "journal_id", "invoice_ids", "write_date",
  ], 10000);
  if (payments.length === 0) return { synced: 0 };
  await pgUpsert("odoo_payments", payments.map((p: any) => ({
    odoo_id: p.id, name: p.name, date: p.date || null, amount: p.amount || 0, payment_type: p.payment_type || null, state: p.state || null,
    journal_id: Array.isArray(p.journal_id) ? p.journal_id[0] : p.journal_id || null, journal_name: Array.isArray(p.journal_id) ? p.journal_id[1] : null,
    odoo_write_date: p.write_date ? new Date(p.write_date) : null, odoo_data: p, synced_at: new Date().toISOString(),
  })));
  const linksToInsert: any[] = [];
  const invoiceIdSet = new Set(invoiceIds);
  payments.forEach((p: any) => {
    if (p.invoice_ids && Array.isArray(p.invoice_ids)) {
      p.invoice_ids.forEach((invId: number) => {
        if (invoiceIdSet.has(invId)) linksToInsert.push({ odoo_payment_id: p.id, odoo_invoice_id: invId });
      });
    }
  });
  if (linksToInsert.length > 0) {
    await pgUpsertComposite("odoo_payment_invoice_links", linksToInsert, ["odoo_payment_id", "odoo_invoice_id"]);
  }
  await updateSyncStatus("payments", maxWriteDateOf(payments, lastWriteDate));
  return { synced: payments.length };
}

export async function syncAll() {
  const startTime = Date.now();
  try {
    await syncTaxes();
    await syncProducts();
    await syncPartners();
    await syncQuotes();
    await purgeDeletedQuotesAndOrphans();
    await syncQuoteLines();
    await syncInvoices();
    await syncInvoiceLines();
    await syncPayments();
    const duration = Date.now() - startTime;
    return { success: true, duration };
  } catch (error) {
    console.error("[Sync] Erreur lors de la synchronisation complète:", error);
    throw error;
  }
}
