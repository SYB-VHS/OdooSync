# Schéma des tables Odoo (PostgreSQL)

SyncOdoo écrit **uniquement** dans ces tables. Kanteen les lit en lecture seule.

Référence : migrations `supabase/migrations/007_create_odoo_cache_tables.sql` et `050_add_code_compta_to_odoo_partners.sql`.

---

## odoo_sync_status

Statut de synchronisation par type d'entité.

| Colonne          | Type      | Description |
|------------------|-----------|-------------|
| id               | UUID      | PK, gen_random_uuid() |
| entity_type      | TEXT      | UNIQUE. Ex: 'taxes', 'products', 'partners', 'quotes', 'quote_lines', 'invoices', 'invoice_lines', 'payments' |
| last_sync_date   | TIMESTAMPTZ | |
| last_write_date  | TIMESTAMPTZ | Dernière write_date vue depuis Odoo |
| created_at, updated_at | TIMESTAMPTZ | |

---

## odoo_taxes (account.tax)

| Colonne        | Type      |
|----------------|-----------|
| id             | UUID PK  |
| odoo_id        | INTEGER UNIQUE NOT NULL |
| name           | TEXT NOT NULL |
| amount         | NUMERIC(10,4) |
| amount_type    | TEXT |
| type_tax_use   | TEXT |
| odoo_write_date| TIMESTAMPTZ |
| odoo_data      | JSONB |
| synced_at, created_at, updated_at | TIMESTAMPTZ |

---

## odoo_products (product.product)

| Colonne        | Type      |
|----------------|-----------|
| id             | UUID PK  |
| odoo_id        | INTEGER UNIQUE NOT NULL |
| name           | TEXT NOT NULL |
| default_code   | TEXT |
| list_price     | NUMERIC(10,2) |
| categ_id       | INTEGER |
| categ_name     | TEXT |
| odoo_write_date| TIMESTAMPTZ |
| odoo_data      | JSONB |
| synced_at, created_at, updated_at | TIMESTAMPTZ |

---

## odoo_partners (res.partner)

| Colonne        | Type      |
|----------------|-----------|
| id             | UUID PK  |
| odoo_id        | INTEGER UNIQUE NOT NULL |
| name           | TEXT NOT NULL |
| parent_id      | INTEGER (odoo_id du parent) |
| is_company     | BOOLEAN DEFAULT false |
| email, phone, mobile | TEXT |
| street, street2, city, zip | TEXT |
| country_id     | INTEGER |
| country_name   | TEXT |
| image_128      | TEXT |
| customer_rank, supplier_rank | INTEGER |
| vat, website, comment | TEXT |
| odoo_write_date| TIMESTAMPTZ |
| odoo_data      | JSONB |
| **code_compta** | TEXT NOT NULL DEFAULT 'traiteur' (migration 050, champ local, ne pas écraser par la sync) |
| synced_at, created_at, updated_at | TIMESTAMPTZ |

---

## odoo_quotes (sale.order)

| Colonne          | Type      |
|------------------|-----------|
| id               | UUID PK  |
| odoo_id          | INTEGER UNIQUE NOT NULL |
| name             | TEXT NOT NULL (numéro devis) |
| odoo_partner_id  | INTEGER NOT NULL (→ odoo_partners.odoo_id) |
| partner_name     | TEXT |
| date_order       | TIMESTAMPTZ |
| commitment_date  | TIMESTAMPTZ |
| amount_total, amount_untaxed | NUMERIC(10,2) |
| state            | TEXT (draft, sent, sale, done, cancel) |
| odoo_user_id     | INTEGER |
| user_name        | TEXT |
| odoo_write_date  | TIMESTAMPTZ |
| odoo_data        | JSONB |
| synced_at, created_at, updated_at | TIMESTAMPTZ |

---

## odoo_quote_lines (sale.order.line)

| Colonne          | Type      |
|------------------|-----------|
| id               | UUID PK  |
| odoo_id          | INTEGER UNIQUE NOT NULL |
| odoo_quote_id    | INTEGER NOT NULL (→ odoo_quotes.odoo_id) |
| odoo_product_id  | INTEGER (→ odoo_products.odoo_id, nullable) |
| product_name     | TEXT |
| name             | TEXT NOT NULL |
| product_uom_qty  | NUMERIC(10,3) |
| price_unit       | NUMERIC(10,2) |
| price_subtotal   | NUMERIC(10,2) |
| price_tax        | NUMERIC(10,2) |
| discount         | NUMERIC(5,2) |
| display_type     | TEXT (line_section, line_note, ou NULL) |
| product_uom      | TEXT |
| taxes_detail     | JSONB |
| odoo_write_date  | TIMESTAMPTZ |
| odoo_data        | JSONB |
| synced_at, created_at, updated_at | TIMESTAMPTZ |

---

## odoo_invoices (account.move)

| Colonne          | Type      |
|------------------|-----------|
| id               | UUID PK  |
| odoo_id          | INTEGER UNIQUE NOT NULL |
| name             | TEXT NOT NULL (numéro facture) |
| odoo_partner_id  | INTEGER NOT NULL (→ odoo_partners.odoo_id) |
| partner_name     | TEXT |
| invoice_date     | DATE |
| invoice_date_due | DATE |
| amount_total, amount_untaxed, amount_residual | NUMERIC(10,2) |
| state            | TEXT (draft, posted, cancel) |
| payment_state    | TEXT |
| move_type        | TEXT (out_invoice, out_refund) |
| invoice_origin   | TEXT |
| odoo_write_date  | TIMESTAMPTZ |
| odoo_data        | JSONB |
| synced_at, created_at, updated_at | TIMESTAMPTZ |

---

## odoo_invoice_lines (account.move.line)

| Colonne          | Type      |
|------------------|-----------|
| id               | UUID PK  |
| odoo_id          | INTEGER UNIQUE NOT NULL |
| odoo_invoice_id  | INTEGER NOT NULL (→ odoo_invoices.odoo_id) |
| odoo_product_id  | INTEGER (nullable) |
| product_name     | TEXT |
| name             | TEXT NOT NULL |
| quantity         | NUMERIC(10,3) |
| price_unit       | NUMERIC(10,2) |
| price_subtotal   | NUMERIC(10,2) |
| price_tax        | NUMERIC(10,2) |
| discount         | NUMERIC(5,2) |
| display_type     | TEXT |
| account_id       | INTEGER |
| account_name     | TEXT |
| analytic_account_id | INTEGER |
| exclude_from_invoice_tab | BOOLEAN DEFAULT false |
| taxes_detail     | JSONB |
| odoo_write_date  | TIMESTAMPTZ |
| odoo_data        | JSONB |
| synced_at, created_at, updated_at | TIMESTAMPTZ |

---

## odoo_payments (account.payment)

| Colonne        | Type      |
|----------------|-----------|
| id             | UUID PK  |
| odoo_id        | INTEGER UNIQUE NOT NULL |
| name           | TEXT NOT NULL |
| date           | DATE |
| amount         | NUMERIC(10,2) |
| payment_type   | TEXT (inbound, outbound) |
| state          | TEXT |
| journal_id     | INTEGER |
| journal_name   | TEXT |
| odoo_write_date| TIMESTAMPTZ |
| odoo_data      | JSONB |
| synced_at, created_at, updated_at | TIMESTAMPTZ |

---

## odoo_payment_invoice_links

Liaison many-to-many paiements ↔ factures.

| Colonne           | Type      |
|-------------------|-----------|
| id                | UUID PK  |
| odoo_payment_id   | INTEGER NOT NULL (→ odoo_payments.odoo_id) |
| odoo_invoice_id   | INTEGER NOT NULL (→ odoo_invoices.odoo_id) |
| created_at        | TIMESTAMPTZ |
| UNIQUE(odoo_payment_id, odoo_invoice_id) | |

---

## Contraintes et index

- Chaque table `odoo_*` (sauf sync_status et payment_invoice_links) a une contrainte **UNIQUE sur odoo_id**.
- Les clés étrangères logiques utilisent les colonnes `odoo_*_id` et référencent l’`odoo_id` des autres tables (pas l’UUID interne).
- Index sur `odoo_id` et `odoo_write_date` pour les tables principales (voir migration 007).
