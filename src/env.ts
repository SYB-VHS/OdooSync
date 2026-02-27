/**
 * Charge .env : parent puis SyncOdoo. SyncOdoo/.env est toujours appliqué en dernier (priorité max).
 */
import path from "path";
import { existsSync, readFileSync } from "fs";
import { config, parse } from "dotenv";

const cwd = process.cwd();

// 1) Charger parent puis .env.example si pas de .env
const pathsToLoad: string[] = [
  path.join(cwd, "..", ".env"),
  path.join(cwd, "..", ".env.local"),
  path.join(cwd, ".env"),
  path.join(cwd, ".env.local"),
];
if (!existsSync(path.join(cwd, ".env"))) {
  pathsToLoad.splice(2, 0, path.join(cwd, ".env.example"));
}
pathsToLoad.forEach((p) => config({ path: p, override: true }));

// 2) Si SyncOdoo/.env existe, réappliquer ses valeurs en dernier (priorité absolue)
const envPath = path.join(cwd, ".env");
if (existsSync(envPath)) {
  const raw = readFileSync(envPath, "utf-8");
  const parsed = parse(raw);
  for (const [key, value] of Object.entries(parsed)) {
    if (value !== undefined) process.env[key] = value;
  }
}

// Avertissement si ODOO_URL est encore le placeholder
const odooUrl = process.env.ODOO_URL ?? "";
if (odooUrl.includes("votre-instance.odoo.com") || !odooUrl.trim()) {
  console.warn(
    "[SyncOdoo] ODOO_URL manquant ou placeholder. Définis la vraie URL dans SyncOdoo/.env (ex: https://ma-base.odoo.com, sans slash final)."
  );
}
