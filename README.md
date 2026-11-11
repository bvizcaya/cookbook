# Cookbook

Your recipe book. It looks and works like your Household Ledger and Fitness Log, and runs on GitHub Pages + Firebase.

- **Recipes**: photo cards, search (by name, tag or ingredient), category filters, Favorites, and sort by newest, A to Z, most cooked or recently cooked.
- **Recipe page**: change the servings and every amount scales. Tap ingredients and steps to check them off while you cook. Notes, source link, "I Made This Today" log, keep-screen-on, share/copy as text.
- **Add**: type a recipe, or paste a whole one from a website or note and it gets split into title, ingredients and steps for you. Add a photo from your camera or library.
- **Grocery**: send a recipe's ingredients to a shopping list (anything you've already checked off is skipped) and add your own items.
- **Settings**: Light/Dark/Automatic, backup download/restore, password.

## Setup (about 10 minutes)

This app uses the **same Firebase project as Household Ledger and Fitness Log**, so `firebase-config.js` is already filled in and you sign in with the same email and password. Recipes live in their own private section.

### 1. Add the privacy rule in Firebase
1. Open the Firebase console → your **household-ledger** project → **Firestore Database** → **Rules**.
2. Paste the contents of `firestore-rules-addition.txt` on a new line **just above** the final block that starts with `// Everything else is closed.` (keep the Fitness Log rule that's already there).
3. Click **Publish**.

### 2. Put it on GitHub
1. On GitHub, create a new repository, for example `cookbook`.
2. **Add file → Upload files**, drag in every file from this folder (including `icon.png`), and commit.
3. Repo **Settings → Pages** → Source: **Deploy from a branch** → Branch **main**, folder **/ (root)** → Save.
4. After a minute it's live at `https://YOUR-USERNAME.github.io/cookbook/`.

Your `YOUR-USERNAME.github.io` domain is already on Firebase's authorized domains list, so sign-in works right away.

### 3. Put it on your home screen
Open the link in Safari → Share → **Add to Home Screen**.

## Tips
- Put the amount first in each ingredient ("1 1/2 cups flour", "2-3 cloves garlic") so it scales. Lines without an amount ("salt to taste") stay as they are.
- A line ending in ":" (like "Frosting:") becomes a heading, in ingredients or instructions.
- Photos are shrunk on your phone before saving, so they upload quickly.
- Recipes you've opened before still load in the kitchen with bad signal; changes sync when you're back online.
- Anyone else you add as a user in Firebase gets their own private cookbook.
