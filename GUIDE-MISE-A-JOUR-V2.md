# Mise à jour v2 — Logo, agents manuels, horaires libres, connexion

## Ce qui change
- Logo Avis dans la sidebar et sur l'écran de connexion
- Thème allégé (moins de couleurs, plus sobre)
- Horaires libres : vous choisissez l'heure de début et de fin pour chaque shift
- Connexion obligatoire avec 3 comptes :
  - **Vous (chef)** : accès complet, modification sur les deux agences
  - **apt.fes@avis.ma** : lecture seule, agence FEZ Aéroport
  - **fes@avis.ma** : lecture seule, agence FZ2 Centre-Ville
- Les anciens agents "Agent 1", "Agent 2"... sont supprimés — vous ajoutez vos vrais agents manuellement une fois connecté

---

## Étape 1 — Mettre à jour la base de données

1. Allez sur https://supabase.com/dashboard, ouvrez votre projet
2. **SQL Editor** → **New query**
3. Ouvrez le fichier `supabase-update-v2.sql` (fourni), copiez tout, collez, cliquez **Run**

---

## Étape 2 — Activer l'authentification par email/mot de passe

1. Dans Supabase, allez dans **Authentication** (icône cadenas dans la sidebar)
2. Cliquez sur **Providers**
3. Vérifiez que **Email** est activé (généralement activé par défaut)
4. Allez dans **Authentication** → **Settings** (ou "URL Configuration")
5. Désactivez "Confirm email" si l'option existe (pour éviter d'avoir à confirmer chaque compte par email) — sinon, vous devrez cliquer sur un lien de confirmation reçu par email pour chaque compte créé

---

## Étape 3 — Créer les 3 comptes

Toujours dans Supabase, allez dans **Authentication** → **Users** :

1. Cliquez sur **Add user** → **Create new user**
2. Créez le premier compte :
   - Email : **votre email personnel/professionnel** (celui que vous utiliserez pour vous connecter en tant que chef)
   - Password : le mot de passe que vous avez choisi
   - Cochez "Auto Confirm User" si l'option apparaît
3. Cliquez sur **Create user**
4. Répétez pour créer :
   - `apt.fes@avis.ma` avec son mot de passe
   - `fes@avis.ma` avec son mot de passe

**Notez le fait que chaque utilisateur créé a un identifiant (UUID)** — visible dans la liste des utilisateurs. On en aura besoin à l'étape suivante.

---

## Étape 4 — Assigner les rôles (chef / lecture)

1. Toujours dans Supabase, allez dans **SQL Editor** → **New query**
2. Pour chaque compte créé, exécutez une requête comme celle-ci (une par compte) :

**Pour vous (chef, accès complet) :**
```sql
insert into profiles (id, role, agency_id)
select id, 'chef', null from auth.users where email = 'VOTRE_EMAIL_ICI';
```

**Pour le compte aéroport (lecture seule, FEZ) :**
```sql
insert into profiles (id, role, agency_id)
select id, 'lecture', 'fez' from auth.users where email = 'apt.fes@avis.ma';
```

**Pour le compte centre-ville (lecture seule, FZ2) :**
```sql
insert into profiles (id, role, agency_id)
select id, 'lecture', 'fz2' from auth.users where email = 'fes@avis.ma';
```

Remplacez `VOTRE_EMAIL_ICI` par l'email que vous avez utilisé à l'étape 3, puis exécutez les trois requêtes (Run) une par une.

---

## Étape 5 — Mettre à jour le code sur GitHub

Les fichiers suivants ont changé ou sont nouveaux, à téléverser sur GitHub (même méthode que la dernière fois — "Add file" → "Upload files") :

- `src/App.jsx` (remplace l'ancien)
- `src/Login.jsx` (nouveau)
- `public/avis-logo.jpg` (nouveau — le logo)
- `supabase-update-v2.sql` (nouveau, pour référence)

**Important pour le logo** : sur GitHub, quand vous téléversez `avis-logo.jpg`, assurez-vous qu'il atterrit dans un dossier `public/` (comme pour `src/` précédemment — renommez-le en `public/avis-logo.jpg` si besoin après upload, avec la même méthode "Edit" → renommer).

Une fois tout téléversé, Vercel redéploiera automatiquement (comme la dernière fois). Attendez 1-2 minutes puis rechargez votre lien `avis-planning-fes.vercel.app`.

---

## Étape 6 — Premiers pas après la mise à jour

1. Connectez-vous avec votre compte chef
2. Sélectionnez chaque agence et ajoutez vos vrais agents un par un (bouton "+ Ajouter un agent")
3. Testez la connexion avec `apt.fes@avis.ma` (dans une fenêtre de navigation privée) pour vérifier que c'est bien en lecture seule et limité à FEZ Aéroport

## Si quelque chose bloque
Montrez-moi le message d'erreur exact ou une capture d'écran, à n'importe quelle étape.
