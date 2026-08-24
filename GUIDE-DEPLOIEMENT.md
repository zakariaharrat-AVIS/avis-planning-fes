# Guide de déploiement — Planning Avis Fès

Ce guide vous permet de mettre l'application en ligne, accessible par un lien web, sans avoir besoin de compétences en programmation. Comptez environ 20-30 minutes.

Vous allez utiliser deux services **gratuits** :
- **Supabase** : la base de données qui stocke le planning
- **Vercel** : l'hébergement qui rend l'application accessible par un lien

---

## Étape 1 — Créer la base de données (Supabase)

1. Allez sur https://supabase.com et cliquez sur **Start your project**
2. Créez un compte (avec Google ou un email)
3. Cliquez sur **New project**
   - Nom du projet : `avis-planning-fes`
   - Mot de passe de base de données : générez-en un et **notez-le quelque part**
   - Région : choisissez la plus proche (Europe de préférence)
4. Attendez 1-2 minutes que le projet se crée
5. Dans le menu de gauche, cliquez sur **SQL Editor**
6. Cliquez sur **New query**
7. Ouvrez le fichier `supabase-schema.sql` (fourni avec ce projet), copiez tout son contenu, collez-le dans l'éditeur
8. Cliquez sur **Run** (ou Ctrl+Entrée)
   - Vous devriez voir "Success. No rows returned"
9. Dans le menu de gauche, allez dans **Project Settings** (icône engrenage) puis **API**
10. Notez ces deux valeurs, vous en aurez besoin à l'étape 3 :
    - **Project URL** (ressemble à `https://xxxxx.supabase.co`)
    - **anon public** key (une longue chaîne de caractères)

---

## Étape 2 — Créer un compte GitHub (pour héberger le code)

1. Allez sur https://github.com et créez un compte gratuit si vous n'en avez pas
2. Créez un nouveau dépôt (bouton vert **New**)
   - Nom : `avis-planning-fes`
   - Laissez le reste par défaut, cliquez sur **Create repository**
3. Sur la page du dépôt vide, cliquez sur **uploading an existing file**
4. Glissez-déposez tous les fichiers du projet fourni (dossier `avis-planning-app`)
5. Cliquez sur **Commit changes**

---

## Étape 3 — Mettre en ligne (Vercel)

1. Allez sur https://vercel.com et cliquez sur **Sign Up**
2. Connectez-vous avec votre compte **GitHub** (plus simple)
3. Cliquez sur **Add New** puis **Project**
4. Sélectionnez le dépôt `avis-planning-fes` que vous venez de créer, cliquez sur **Import**
5. Avant de cliquer sur Deploy, ouvrez la section **Environment Variables** et ajoutez :
   - `VITE_SUPABASE_URL` → collez le Project URL noté à l'étape 1
   - `VITE_SUPABASE_ANON_KEY` → collez la clé anon public notée à l'étape 1
6. Cliquez sur **Deploy**
7. Après 1-2 minutes, Vercel vous donne un lien du type `avis-planning-fes.vercel.app`

**C'est ce lien que vous partagez avec les autres chefs d'agence et vos agents.**

---

## Étape 4 — Ajouter d'autres agences (si besoin)

Si Tanger ou une autre agence doit rejoindre l'outil :
1. Retournez dans Supabase > SQL Editor
2. Exécutez :
```sql
insert into agencies (id, name) values ('tanger', 'Avis Tanger');
insert into agents (agency_id, name) values
  ('tanger', 'Agent 1'), ('tanger', 'Agent 2');
```
3. Rechargez l'application — la nouvelle agence apparaît dans le menu

---

## Ce que fait l'application

- Chaque chef d'agence ouvre le lien, choisit son agence, et modifie le planning (mode "Chef d'agence")
- Les agents ouvrent le même lien en mode "Agent" pour consulter en lecture seule
- Toutes les modifications sont visibles en temps réel par tous ceux qui ont le lien ouvert — pas besoin de rafraîchir la page
- Les dates de la semaine avancent automatiquement, pas d'action nécessaire

## Limites à connaître

- **Pas d'authentification** : n'importe qui avec le lien peut actuellement choisir "Chef d'agence" et modifier. Si c'est un problème, il faudra ajouter une connexion par mot de passe (je peux vous aider à ajouter ça si besoin)
- **Plans gratuits** : Supabase et Vercel sont gratuits jusqu'à un certain volume d'utilisation — largement suffisant pour deux agences de 14 personnes
- **Maintenance** : si l'app doit évoluer (nouvelles fonctionnalités, agences), il faudra republier le code sur GitHub — Vercel republie automatiquement après

## Besoin d'aide au déploiement ?

Si une étape bloque, montrez-moi le message d'erreur exact et je vous aiderai à le résoudre.
