/**
 * Demon SyncOdoo: fast check + full sync.
 */

import "./env.js";
import { syncAll } from "./odoo/sync.js";
import { fastCheck } from "./odoo/sync-fast.js";

let isFastCheckRunning = false;
let isFullSyncRunning = false;
let fastCheckInterval: ReturnType<typeof setInterval> | null = null;
let fullSyncInterval: ReturnType<typeof setInterval> | null = null;

function getEnvMs(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

const FAST_CHECK_INTERVAL_MS = getEnvMs("FAST_CHECK_INTERVAL_MS", 10_000);
const FULL_SYNC_INTERVAL_MS = getEnvMs("FULL_SYNC_INTERVAL_MS", 5 * 60 * 1000);
const FAST_CHECK_START_DELAY_MS = getEnvMs("FAST_CHECK_START_DELAY_MS", 30_000);

async function performFastCheck() {
  if (isFastCheckRunning || isFullSyncRunning) return;
  isFastCheckRunning = true;
  try {
    const result = await fastCheck();
    if (result.quotesToSync > 0 || result.invoicesToSync > 0 || result.partnersToSync > 0 || result.productsToSync > 0) {
      console.log(
        `[Fast Check] ${result.quotesToSync} devis, ${result.invoicesToSync} factures, ${result.partnersToSync} clients, ${result.productsToSync} produits`
      );
    }
  } catch (error) {
    console.error("[Fast Check] Erreur:", error);
  } finally {
    isFastCheckRunning = false;
  }
}

async function performFullSync() {
  if (isFullSyncRunning) {
    console.log("[Full Sync] Deja en cours, ignoree");
    return;
  }
  isFullSyncRunning = true;
  try {
    console.log(`[Full Sync] Demarrage a ${new Date().toISOString()}`);
    const result = await syncAll();
    console.log(`[Full Sync] Terminee en ${result.duration}ms`);
  } catch (error) {
    console.error("[Full Sync] Erreur:", error);
  } finally {
    isFullSyncRunning = false;
  }
}

function startDaemon() {
  if (!process.env.ODOO_URL || !process.env.POSTGRES_HOST) {
    console.error("[SyncOdoo] ODOO_URL et POSTGRES_* doivent etre definis.");
    process.exit(1);
  }

  console.log("[SyncOdoo] Demarrage");
  console.log(`[SyncOdoo] - Fast check: toutes les ${Math.round(FAST_CHECK_INTERVAL_MS / 1000)} s`);
  console.log(`[SyncOdoo] - Sync complete: toutes les ${Math.round(FULL_SYNC_INTERVAL_MS / 60000)} min`);
  console.log(`[SyncOdoo] - Delai fast check au demarrage: ${Math.round(FAST_CHECK_START_DELAY_MS / 1000)} s`);
  console.log("[SyncOdoo] Ctrl+C pour arreter");

  performFullSync();
  setTimeout(() => performFastCheck(), FAST_CHECK_START_DELAY_MS);
  fastCheckInterval = setInterval(performFastCheck, FAST_CHECK_INTERVAL_MS);
  fullSyncInterval = setInterval(performFullSync, FULL_SYNC_INTERVAL_MS);

  process.on("SIGINT", () => {
    console.log("\n[SyncOdoo] Arret...");
    if (fastCheckInterval) clearInterval(fastCheckInterval);
    if (fullSyncInterval) clearInterval(fullSyncInterval);
    process.exit(0);
  });

  process.on("SIGTERM", () => {
    console.log("\n[SyncOdoo] Arret...");
    if (fastCheckInterval) clearInterval(fastCheckInterval);
    if (fullSyncInterval) clearInterval(fullSyncInterval);
    process.exit(0);
  });
}

startDaemon();
