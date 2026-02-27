# SyncOdoo – App autonome Odoo → PostgreSQL

Application **autonome** (son propre `package.json`, pas de dépendance au repo Kanteen) qui synchronise Odoo vers PostgreSQL (tables `odoo_*`). Kanteen lit ces données en lecture seule.

## Développement local

```bash
cd SyncOdoo
cp .env.example .env
# Éditer .env (ODOO_*, POSTGRES_*)
npm install
npm start
```

- **`npm start`** : démon en continu (fast check 10 s, sync complète 5 min).
- **`npm run sync:once`** : une seule sync complète puis sortie.
- **`npm run sync:ids`** : synchronise uniquement les IDs Odoo fournis (voir ci-dessous).

## Docker (build autonome)

Build **depuis le dossier SyncOdoo** (contexte = SyncOdoo uniquement) :

```bash
cd SyncOdoo
docker build -t sync-odoo .
docker run --rm -d --name sync-odoo --env-file .env sync-odoo
```

Ou avec docker compose (depuis `SyncOdoo/`) :

```bash
cd SyncOdoo
docker compose --env-file .env up -d
```

Depuis la racine du repo Kanteen :

```bash
docker build -t sync-odoo -f SyncOdoo/Dockerfile SyncOdoo
docker run --rm -d --name sync-odoo --env-file SyncOdoo/.env sync-odoo
```

---

## Déploiement sur un VPS (boucle en continu)

Sur le VPS, le conteneur tourne en boucle (fast check 10 s, sync complète 5 min) avec redémarrage automatique (`restart: unless-stopped`).

### 1. Récupérer le code sur le VPS

```bash
# Option A : clone git (si le repo est sur GitHub/GitLab)
git clone <url-du-repo-kanteen> kanteen
cd kanteen/SyncOdoo

# Option B : copie depuis ta machine (rsync / scp du dossier SyncOdoo)
```

### 2. Créer le fichier .env sur le VPS

Créer `SyncOdoo/.env` **sur le VPS** avec les vraies valeurs (le fichier n’est pas dans l’image Docker) :

```bash
cd SyncOdoo
cp .env.example .env
nano .env   # ou vim
```

Renseigner au minimum :

- `ODOO_URL` – ex. `https://ma-base.odoo.com` (sans slash final)
- `ODOO_DB`, `ODOO_USERNAME`, `ODOO_PASSWORD`
- `POSTGRES_HOST`, `POSTGRES_PORT`, `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`

**Important** : depuis le conteneur, `POSTGRES_HOST` doit être l’adresse du serveur PostgreSQL **telle que vue par le conteneur**. Si Postgres est sur le même VPS : soit tu ajoutes un service `postgres` dans ce `docker-compose` et tu mets `POSTGRES_HOST=postgres`, soit tu utilises l’IP du host (sous Linux, `--add-host=host.docker.internal:host-gateway` au `docker run` ou `extra_hosts` dans compose).

### 3. Lancer en arrière-plan

```bash
cd SyncOdoo
docker compose --env-file .env up -d
```

Vérifier les logs :

```bash
docker compose logs -f sync-odoo
```

### 4. Mettre à jour après un push

```bash
cd /chemin/vers/kanteen/SyncOdoo
git pull
docker compose build --no-cache
docker compose up -d
```

### Résumé

| Action        | Commande |
|---------------|----------|
| Démarrer      | `docker compose --env-file .env up -d` |
| Voir les logs | `docker compose logs -f sync-odoo` |
| Arrêter       | `docker compose down` |
| Rebuild       | `docker compose build && docker compose up -d` |

## Donner des IDs Odoo au script

Pour synchroniser **uniquement** certains enregistrements (devis, factures, clients, produits), utilisez `npm run sync:ids` avec des IDs fournis par **variables d'environnement** ou **arguments CLI**.

**Variables d'environnement** (listes séparées par des virgules) :

- `ODOO_SYNC_QUOTE_IDS` – IDs des devis (sale.order)
- `ODOO_SYNC_INVOICE_IDS` – IDs des factures (account.move)
- `ODOO_SYNC_PARTNER_IDS` – IDs des clients (res.partner)
- `ODOO_SYNC_PRODUCT_IDS` – IDs des produits (product.product)

Exemples :

```bash
# Un seul devis (ID 42)
ODOO_SYNC_QUOTE_IDS=42 npm run sync:ids

# Plusieurs factures et clients
ODOO_SYNC_INVOICE_IDS=100,101,102 ODOO_SYNC_PARTNER_IDS=10,20 npm run sync:ids

# En une ligne avec .env ou export
export ODOO_SYNC_QUOTE_IDS=1,2,3
npm run sync:ids
```

**Arguments CLI** :

```bash
npx tsx src/sync-by-ids.ts --quotes=42,43 --invoices=100,101 --partners=10 --products=5
```

Les arguments CLI sont utilisés seulement si la variable d'environnement correspondante n'est pas définie.

## Variables d'environnement

- **Odoo** : `ODOO_URL`, `ODOO_DB`, `ODOO_USERNAME`, `ODOO_PASSWORD`
- **PostgreSQL** : `POSTGRES_HOST`, `POSTGRES_PORT`, `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`

Voir [.env.example](./.env.example).

## Comportement

- **Fast check** : toutes les 10 s (détection des changements, sync ciblée).
- **Sync complète** : toutes les 5 min + au démarrage.

## Schéma de la base

Voir [SCHEMA.md](./SCHEMA.md). SyncOdoo écrit uniquement dans ces tables ; Kanteen les lit.
