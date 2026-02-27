# Commandes déploiement SyncOdoo (repo OdooSync, VPS)

**Important :** Le déploiement se fait depuis le repo **OdooSync** (ex. `SYB-VHS/OdooSync`), **pas** depuis le repo Kanteen.

---

## En local : pousser vers le repo OdooSync

Tu développes dans `Kanteen/SyncOdoo/`. Pour déployer, il faut que les modifs soient dans le repo **OdooSync** puis push.

### Option A – Tu as un clone du repo OdooSync à côté

```powershell
# 1. Copier le contenu SyncOdoo (sans node_modules / .env) vers ton clone OdooSync
cd C:\Users\kaoui\Documents\DEV\Kanteen\Kanteen
Copy-Item SyncOdoo\* C:\chemin\vers\OdooSync\ -Recurse -Force
# Exclure node_modules si besoin (ne pas copier node_modules)

# 2. Dans le repo OdooSync : commit et push
cd C:\chemin\vers\OdooSync
git add .
git status
git commit -m "SyncOdoo: purge devis/lignes supprimés, doc déploiement"
git push
```

### Option B – Repo OdooSync = copie de SyncOdoo (une fois)

Si ton repo OdooSync a été créé en copiant le dossier SyncOdoo, à chaque fois que tu modifies `Kanteen/SyncOdoo/` :

1. Copie le contenu de `Kanteen/SyncOdoo/` vers ton répertoire local du repo OdooSync (sans `.env` ni `node_modules`).
2. Dans le repo OdooSync : `git add .` → `git commit -m "..."` → `git push`.

---

## Sur le VPS

Le repo est cloné dans **`/opt/OdooSync`** (voir DEPLOY-HOSTINGER.md). Après un `git push` depuis ta machine :

```bash
cd /opt/OdooSync
git pull
docker compose --env-file .env build --no-cache
docker compose --env-file .env up -d
```

Vérifier les logs :

```bash
docker compose logs -f sync-odoo
```

---

## Récap

| Où       | Action |
|----------|--------|
| **Local** | Modifs dans `Kanteen/SyncOdoo/` → copier vers clone **OdooSync** → `git add` / `commit` / **push** (vers le repo OdooSync) |
| **VPS**   | `cd /opt/OdooSync` → `git pull` → `docker compose --env-file .env build --no-cache` → `docker compose --env-file .env up -d` |
