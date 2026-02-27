/**
 * Verification rapide (IDs uniquement) et sync par IDs (SyncOdoo autonome)
 */

import { pgUpsert, pgSelectOne } from "../database/odoo-helpers.js";
import { toOdooDatetime, domainSanitizeForOdoo19 } from "./utils.js";

const ODOO_URL = process.env.ODOO_URL || "";
const ODOO_DB = process.env.ODOO_DB || "";
const ODOO_USERNAME = process.env.ODOO_USERNAME || "";
const ODOO_PASSWORD = process.env.ODOO_PASSWORD || "";
const AUTH_CACHE_TTL_MS = (() => {
  const value = Number(process.env.ODOO_AUTH_CACHE_MS || "60000");
  return Number.isFinite(value) && value > 0 ? value : 60_000;
})();

let cachedUid: number | null = null;
let cachedUidExpiresAt = 0;
let authInFlight: Promise<number | null> | null = null;

async function authenticate(): Promise<number | null> {
  const now = Date.now();
  if (cachedUid && now < cachedUidExpiresAt) return cachedUid;
  if (authInFlight) return authInFlight;

  authInFlight = (async () => {
    const response = await fetch(`${ODOO_URL}/jsonrpc`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0", method: "call",
        params: { service: "common", method: "authenticate", args: [ODOO_DB, ODOO_USERNAME, ODOO_PASSWORD, {}] },
        id: Math.floor(Math.random() * 1000000),
      }),
    });
    if (!response.ok) throw new Error(`Erreur HTTP ${response.status}`);
    const contentType = response.headers.get("content-type");
    if (!contentType || !contentType.includes("application/json")) throw new Error("Reponse invalide");
    const data = await response.json();
    if (data.error) throw new Error(`Erreur auth: ${data.error.message}`);
    const uid = data.result;
    const normalizedUid = typeof uid === "number" && uid > 0 ? uid : null;
    cachedUid = normalizedUid;
    cachedUidExpiresAt = normalizedUid ? Date.now() + AUTH_CACHE_TTL_MS : 0;
    return normalizedUid;
  })();

  try {
    return await authInFlight;
  } finally {
    authInFlight = null;
  }
}

async function odooSearch(model: string, domain: any[]): Promise<number[]> {
  const uid = await authenticate();
  if (!uid) throw new Error("Echec auth");
  const sanitizedDomain = domainSanitizeForOdoo19(domain);
  const response = await fetch(`${ODOO_URL}/jsonrpc`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0", method: "call",
      params: { service: "object", method: "execute_kw", args: [ODOO_DB, uid, ODOO_PASSWORD, model, "search", [sanitizedDomain]] },
      id: Math.floor(Math.random() * 1000000),
    }),
  });
  if (!response.ok) throw new Error(`Erreur HTTP ${response.status}`);
  const data = await response.json();
  if (data.error) throw new Error(`Erreur API: ${data.error.message}`);
  return data.result || [];
}

async function odooRead(model: string, ids: number[], fields: string[]): Promise<any[]> {
  const uid = await authenticate();
  if (!uid) throw new Error("Echec auth");
  const response = await fetch(`${ODOO_URL}/jsonrpc`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0", method: "call",
      params: { service: "object", method: "execute_kw", args: [ODOO_DB, uid, ODOO_PASSWORD, model, "read", [ids], { fields }] },
      id: Math.floor(Math.random() * 1000000),
    }),
  });
  if (!response.ok) throw new Error(`Erreur HTTP ${response.status}`);
  const data = await response.json();
  if (data.error) throw new Error(data.error.message);
  return data.result || [];
}

async function getLastFastCheckDate(entityType: string): Promise<Date | null> {
  try {
    const row = await pgSelectOne("odoo_sync_status", { entity_type: `fast_check_${entityType}` }, "last_write_date");
    return row?.last_write_date ? new Date(row.last_write_date) : null;
  } catch {
    return null;
  }
}

async function updateLastFastCheckDate(entityType: string): Promise<void> {
  try {
    await pgUpsert("odoo_sync_status", [{ entity_type: `fast_check_${entityType}`, last_write_date: new Date().toISOString() }], "entity_type");
  } catch {
    // ignore
  }
}

export async function checkQuotesFast(): Promise<number[]> {
  try {
    const lastCheckDate = await getLastFastCheckDate("quotes");
    const checkDate = lastCheckDate || new Date(Date.now() - 10 * 60 * 1000);

    // Sequential requests to reduce bursts and avoid Odoo rate-limit.
    const modifiedIds = await odooSearch("sale.order", [["write_date", ">", toOdooDatetime(checkDate)]]);
    const unconfirmedIds = await odooSearch("sale.order", [["state", "in", ["draft", "sent"]]]);

    const allIds = Array.from(new Set([...modifiedIds, ...unconfirmedIds]));
    await updateLastFastCheckDate("quotes");
    if (allIds.length > 0) console.log(`[Fast Check] ${allIds.length} devis a synchroniser`);
    return allIds;
  } catch (error) {
    console.error("[Fast Check] Erreur devis:", error);
    return [];
  }
}

export async function checkInvoicesFast(): Promise<number[]> {
  try {
    const lastCheckDate = await getLastFastCheckDate("invoices");
    const checkDate = lastCheckDate || new Date(Date.now() - 10 * 60 * 1000);
    const ids = await odooSearch("account.move", [
      ["move_type", "in", ["out_invoice", "out_refund"]], ["state", "in", ["posted", "draft"]],
      ["write_date", ">", toOdooDatetime(checkDate)],
    ]);
    await updateLastFastCheckDate("invoices");
    if (ids.length > 0) console.log(`[Fast Check] ${ids.length} factures a synchroniser`);
    return ids;
  } catch (error) {
    console.error("[Fast Check] Erreur factures:", error);
    return [];
  }
}

export async function checkPartnersFast(): Promise<number[]> {
  try {
    const lastCheckDate = await getLastFastCheckDate("partners");
    const checkDate = lastCheckDate || new Date(Date.now() - 10 * 60 * 1000);
    const ids = await odooSearch("res.partner", [["customer_rank", ">", 0], ["write_date", ">", toOdooDatetime(checkDate)]]);
    await updateLastFastCheckDate("partners");
    if (ids.length > 0) console.log(`[Fast Check] ${ids.length} clients a synchroniser`);
    return ids;
  } catch (error) {
    console.error("[Fast Check] Erreur clients:", error);
    return [];
  }
}

export async function checkProductsFast(): Promise<number[]> {
  try {
    const lastCheckDate = await getLastFastCheckDate("products");
    const checkDate = lastCheckDate || new Date(Date.now() - 10 * 60 * 1000);
    const ids = await odooSearch("product.product", [["write_date", ">", toOdooDatetime(checkDate)]]);
    await updateLastFastCheckDate("products");
    if (ids.length > 0) console.log(`[Fast Check] ${ids.length} produits a synchroniser`);
    return ids;
  } catch (error) {
    console.error("[Fast Check] Erreur produits:", error);
    return [];
  }
}

export async function syncQuotesByIds(ids: number[]): Promise<void> {
  if (ids.length === 0) return;
  try {
    const quotes = await odooRead("sale.order", ids, ["id", "name", "partner_id", "date_order", "commitment_date", "amount_total", "amount_untaxed", "state", "user_id", "write_date"]);
    if (quotes.length === 0) return;
    await pgUpsert("odoo_quotes", quotes.map((q: any) => ({
      odoo_id: q.id,
      name: q.name,
      odoo_partner_id: Array.isArray(q.partner_id) ? q.partner_id[0] : q.partner_id,
      partner_name: Array.isArray(q.partner_id) ? q.partner_id[1] : null,
      date_order: q.date_order ? new Date(q.date_order) : null,
      commitment_date: q.commitment_date ? new Date(q.commitment_date) : null,
      amount_total: q.amount_total || 0,
      amount_untaxed: q.amount_untaxed || 0,
      state: q.state || null,
      odoo_user_id: Array.isArray(q.user_id) ? q.user_id[0] : null,
      user_name: Array.isArray(q.user_id) ? q.user_id[1] : null,
      odoo_write_date: q.write_date ? new Date(q.write_date) : null,
      odoo_data: q,
      synced_at: new Date().toISOString(),
    })));
    console.log(`[Fast Sync] ${quotes.length} devis synchronises`);
  } catch (error) {
    console.error("[Fast Sync] Erreur sync devis:", error);
  }
}

export async function syncInvoicesByIds(ids: number[]): Promise<void> {
  if (ids.length === 0) return;
  try {
    const invoices = await odooRead("account.move", ids, ["id", "name", "partner_id", "invoice_date", "invoice_date_due", "amount_total", "amount_untaxed", "amount_residual", "state", "payment_state", "move_type", "invoice_origin", "write_date"]);
    if (invoices.length === 0) return;
    await pgUpsert("odoo_invoices", invoices.map((inv: any) => ({
      odoo_id: inv.id,
      name: inv.name,
      odoo_partner_id: Array.isArray(inv.partner_id) ? inv.partner_id[0] : inv.partner_id,
      partner_name: Array.isArray(inv.partner_id) ? inv.partner_id[1] : null,
      invoice_date: inv.invoice_date || null,
      invoice_date_due: inv.invoice_date_due || null,
      amount_total: inv.amount_total || 0,
      amount_untaxed: inv.amount_untaxed || 0,
      amount_residual: inv.amount_residual || 0,
      state: inv.state || null,
      payment_state: inv.payment_state || null,
      move_type: inv.move_type || null,
      invoice_origin: inv.invoice_origin || null,
      odoo_write_date: inv.write_date ? new Date(inv.write_date) : null,
      odoo_data: inv,
      synced_at: new Date().toISOString(),
    })));
    console.log(`[Fast Sync] ${invoices.length} factures synchronisees`);
  } catch (error) {
    console.error("[Fast Sync] Erreur sync factures:", error);
  }
}

export async function syncPartnersByIds(ids: number[]): Promise<void> {
  if (ids.length === 0) return;
  try {
    const partners = await odooRead("res.partner", ids, ["id", "name", "parent_id", "is_company", "email", "phone", "street", "street2", "city", "zip", "country_id", "customer_rank", "supplier_rank", "vat", "website", "comment", "write_date"]);
    if (partners.length === 0) return;
    await pgUpsert("odoo_partners", partners.map((p: any) => ({
      odoo_id: p.id,
      name: p.name,
      parent_id: Array.isArray(p.parent_id) ? p.parent_id[0] : p.parent_id || null,
      is_company: p.is_company || false,
      email: p.email || null,
      phone: p.phone || null,
      mobile: null,
      street: p.street || null,
      street2: p.street2 || null,
      city: p.city || null,
      zip: p.zip || null,
      country_id: Array.isArray(p.country_id) ? p.country_id[0] : p.country_id || null,
      country_name: Array.isArray(p.country_id) ? p.country_id[1] : null,
      image_128: null,
      customer_rank: p.customer_rank || 0,
      supplier_rank: p.supplier_rank || 0,
      vat: p.vat || null,
      website: p.website || null,
      comment: p.comment || null,
      odoo_write_date: p.write_date ? new Date(p.write_date) : null,
      odoo_data: p,
      synced_at: new Date().toISOString(),
    })));
    console.log(`[Fast Sync] ${partners.length} clients synchronises`);
  } catch (error) {
    console.error("[Fast Sync] Erreur sync clients:", error);
  }
}

export async function syncProductsByIds(ids: number[]): Promise<void> {
  if (ids.length === 0) return;
  try {
    const products = await odooRead("product.product", ids, ["id", "name", "default_code", "list_price", "categ_id", "write_date"]);
    if (products.length === 0) return;
    await pgUpsert("odoo_products", products.map((p: any) => ({
      odoo_id: p.id,
      name: p.name,
      default_code: p.default_code || null,
      list_price: p.list_price || 0,
      categ_id: Array.isArray(p.categ_id) ? p.categ_id[0] : p.categ_id || null,
      categ_name: Array.isArray(p.categ_id) ? p.categ_id[1] : null,
      odoo_write_date: p.write_date ? new Date(p.write_date) : null,
      odoo_data: p,
      synced_at: new Date().toISOString(),
    })));
    console.log(`[Fast Sync] ${products.length} produits synchronises`);
  } catch (error) {
    console.error("[Fast Sync] Erreur sync produits:", error);
  }
}

export async function fastCheck(): Promise<{ quotesToSync: number; invoicesToSync: number; partnersToSync: number; productsToSync: number }> {
  try {
    const quoteIds = await checkQuotesFast();
    const invoiceIds = await checkInvoicesFast();
    const partnerIds = await checkPartnersFast();
    const productIds = await checkProductsFast();

    if (quoteIds.length > 0) await syncQuotesByIds(quoteIds);
    if (invoiceIds.length > 0) await syncInvoicesByIds(invoiceIds);
    if (partnerIds.length > 0) await syncPartnersByIds(partnerIds);
    if (productIds.length > 0) await syncProductsByIds(productIds);

    return {
      quotesToSync: quoteIds.length,
      invoicesToSync: invoiceIds.length,
      partnersToSync: partnerIds.length,
      productsToSync: productIds.length,
    };
  } catch (error) {
    console.error("[Fast Check] Erreur:", error);
    return { quotesToSync: 0, invoicesToSync: 0, partnersToSync: 0, productsToSync: 0 };
  }
}
