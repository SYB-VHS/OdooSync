/**
 * Démon SyncOdoo : fast check 10 s, sync complète 5 min
 */

import "./env.js";
import { syncAll } from "./odoo/sync.js";
import { fastCheck } from "./odoo/sync-fast.js";

let isFastCheckRunning = false;
let isFullSyncRunning = false;
let fastCheckInterval: ReturnType<typeof setInterval> | null = null;
let fullSyncInterval: ReturnType<typeof setInterval> | null = null;

async function performFastCheck() {
  if (isFastCheckRunning) return;
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
    console.log("[Full Sync] Déjà en cours, ignorée");
    return;
  }
  isFullSyncRunning = true;
  try {
    console.log(`[Full Sync] Démarrage à ${new Date().toISOString()}`);
    const result = await syncAll();
    console.log(`[Full Sync] Terminée en ${result.duration}ms`);
  } catch (error) {
    console.error("[Full Sync] Erreur:", error);
  } finally {
    isFullSyncRunning = false;
  }
}

function startDaemon() {
  if (!process.env.ODOO_URL || !process.env.POSTGRES_HOST) {
    console.error("[SyncOdoo] ODOO_URL et POSTGRES_* doivent être définis.");
    process.exit(1);
  }
  console.log("[SyncOdoo] Démarrage");
  console.log("[SyncOdoo] - Fast check: toutes les 10 s");
  console.log("[SyncOdoo] - Sync complète: toutes les 5 min");
  console.log("[SyncOdoo] Ctrl+C pour arrêter");

  performFullSync();
  setTimeout(() => performFastCheck(), 2000);
  fastCheckInterval = setInterval(performFastCheck, 10_000);
  fullSyncInterval = setInterval(performFullSync, 5 * 60 * 1000);

  process.on("SIGINT", () => {
    console.log("\n[SyncOdoo] Arrêt...");
    if (fastCheckInterval) clearInterval(fastCheckInterval);
    if (fullSyncInterval) clearInterval(fullSyncInterval);
    process.exit(0);
  });
  process.on("SIGTERM", () => {
    console.log("\n[SyncOdoo] Arrêt...");
    if (fastCheckInterval) clearInterval(fastCheckInterval);
    if (fullSyncInterval) clearInterval(fullSyncInterval);
    process.exit(0);
  });
}

startDaemon();
