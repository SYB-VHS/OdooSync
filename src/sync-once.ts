/**
 * Lance une seule synchronisation complète (pour tests ou cron)
 */
import "./env.js";
import { syncAll } from "./odoo/sync.js";

syncAll()
  .then((r) => {
    console.log("Sync terminée:", r);
    process.exit(0);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
