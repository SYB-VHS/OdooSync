# Déployer SyncOdoo sur un VPS Hostinger

Guide pour mettre le conteneur Docker en boucle sur un VPS Hostinger (Ubuntu).

---

## Partie 1 : Créer le repo GitHub et pousser le code

### 1.1 Créer un nouveau repo sur GitHub

1. Va sur [github.com/new](https://github.com/new).
2. Nom du repo : par ex. **SyncOdoo** ou **kanteen-sync-odoo**.
3. Visibilité : **Private** si tu ne veux pas exposer le code.
4. Ne coche pas "Add a README" (le code existe déjà).
5. Clique sur **Create repository**.

### 1.2 Pousser le dossier SyncOdoo comme racine du repo

**Option A – Repo dédié (uniquement SyncOdoo)**  
Depuis ta machine, à la racine du repo Kanteen :

```bash
cd C:\Users\kaoui\Documents\DEV\Kanteen\Kanteen

# Créer un repo temporaire avec uniquement le contenu de SyncOdoo
git clone --no-local --single-branch . SyncOdoo-repo
cd SyncOdoo-repo
git filter-branch --subdirectory-filter SyncOdoo -- --all
# Ou avec Git 2.23+ : git sparse-checkout + copie (voir Option B si plus simple)
```

Méthode plus simple : **copier le contenu** de `SyncOdoo` dans un nouveau dossier, initialiser un git et pousser :

```bash
# Sur ta machine (PowerShell)
cd C:\Users\kaoui\Documents\DEV\Kanteen\Kanteen
mkdir SyncOdoo-repo
Copy-Item SyncOdoo\* SyncOdoo-repo\ -Recurse -Exclude node_modules,.git
cd SyncOdoo-repo
git init
git add .
git commit -m "Initial SyncOdoo"
git remote add origin https://github.com/TON_USER/SyncOdoo.git
git branch -M main
git push -u origin main
```

Remplace `TON_USER/SyncOdoo` par l’URL de ton repo (ex. `handelice/sync-odoo`).

**Option B – Repo Kanteen entier**  
Si tu préfères garder tout le repo Kanteen sur GitHub :

```bash
cd C:\Users\kaoui\Documents\DEV\Kanteen\Kanteen
git remote add origin https://github.com/TON_USER/Kanteen.git
git push -u origin main
```

Sur le VPS tu cloneras tout puis tu feras `cd Kanteen/SyncOdoo` (voir partie 2).

---

## Partie 2 : Sur le VPS Hostinger

### 2.1 Connexion SSH

1. Dans le panel Hostinger (hPanel) : **VPS** → ton serveur → **SSH Access**.
2. Note l’IP, le user (souvent `root`) et le mot de passe (ou utilise une clé SSH).
3. Connexion :

```bash
ssh root@TON_IP_VPS
```

### 2.2 Installer Docker (si pas déjà fait)

```bash
apt update && apt install -y ca-certificates curl
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null
apt update && apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

Vérifier :

```bash
docker --version
docker compose version
```

### 2.3 Cloner le repo

**Si repo dédié SyncOdoo (racine = SyncOdoo) :**

```bash
cd /opt
git clone https://github.com/TON_USER/SyncOdoo.git
cd SyncOdoo
```

**Si repo Kanteen entier :**

```bash
cd /opt
git clone https://github.com/TON_USER/Kanteen.git
cd Kanteen/SyncOdoo
```

(Utilise l’URL HTTPS de ton repo ; pour un repo privé, configure un token ou une clé SSH sur le VPS.)

### 2.4 Créer le fichier .env

```bash
cp .env.example .env
nano .env
```

Renseigne les **vraies** valeurs :

- `ODOO_URL` : ex. `https://la-cantine-de-josephine.odoo.com` (sans slash final)
- `ODOO_DB`, `ODOO_USERNAME`, `ODOO_PASSWORD`
- `POSTGRES_HOST` : IP ou hostname de ta base (ex. IP du serveur Supabase ou du VPS si Postgres est dessus)
- `POSTGRES_PORT`, `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`

Sauvegarde : `Ctrl+O`, `Entrée`, `Ctrl+X`.

### 2.5 Lancer le conteneur en boucle

```bash
docker compose --env-file .env up -d --build
```

Vérifier les logs :

```bash
docker compose logs -f sync-odoo
```

Tu dois voir le démon démarrer (fast check 10 s, sync complète 5 min). Arrêter les logs : `Ctrl+C`.

### 2.6 Commandes utiles

| Action        | Commande |
|---------------|----------|
| Voir les logs | `docker compose logs -f sync-odoo` |
| Redémarrer    | `docker compose restart` |
| Arrêter       | `docker compose down` |
| Mettre à jour | `git pull && docker compose build --no-cache && docker compose up -d` |

---

## Résumé

1. **GitHub** : créer le repo, pousser le code (SyncOdoo seul ou Kanteen entier).
2. **VPS** : SSH → installer Docker → cloner → `.env` → `docker compose --env-file .env up -d --build`.
3. Le conteneur tourne en boucle et redémarre tout seul (`restart: unless-stopped`).
