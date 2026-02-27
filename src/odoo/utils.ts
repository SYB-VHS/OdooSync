/**
 * Utilitaires pour les domaines et dates Odoo (SyncOdoo)
 */

export function toOdooDatetime(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  const h = String(date.getUTCHours()).padStart(2, "0");
  const min = String(date.getUTCMinutes()).padStart(2, "0");
  const s = String(date.getUTCSeconds()).padStart(2, "0");
  return `${y}-${m}-${d} ${h}:${min}:${s}`;
}

const ISO_DATETIME_TZ = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/;
const ISO_DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export function domainSanitizeForOdoo19(domain: any[]): any[] {
  return domain.map((item) => {
    if (Array.isArray(item) && item.length >= 3 && typeof item[0] === "string" && typeof item[2] !== "object") {
      const value = item[2];
      if (typeof value === "string") {
        if (ISO_DATETIME_TZ.test(value)) {
          return [item[0], item[1], toOdooDatetime(new Date(value))];
        }
        if (ISO_DATE_ONLY.test(value)) {
          return [item[0], item[1], `${value} 00:00:00`];
        }
      }
      return item;
    }
    if (Array.isArray(item)) {
      return domainSanitizeForOdoo19(item);
    }
    return item;
  });
}
