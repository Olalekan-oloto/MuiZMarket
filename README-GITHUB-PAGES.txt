# MuiZMarket — GitHub Pages preview

This folder is prepared for GitHub Pages to show the styled marketplace UI. It includes sample products so you can test the design, search, category filters, and demo shopping bag.

## Publish on GitHub Pages (Android)
1. Download and extract this ZIP.
2. In your repository, upload the **contents** of this folder to the repository root (so `index.html` and `styles.css` are visible beside each other, not inside another folder). Replace the old files when prompted.
3. Open **Settings → Pages** and select **Deploy from a branch**, branch `main`, folder `/(root)`, then Save.
4. Wait for the Pages deployment, then refresh your `https://Olalekan-oloto.github.io/MuiZMarket/` page.

## Important limits
GitHub Pages can serve the frontend, while Firebase Authentication handles sign-in and email verification. The Node.js backend must be deployed separately for saved Buyer/Seller roles and secure admin account monitoring. Configure MUIZMARKET_API_URL in firebase-config.js after deploying the backend. The product cards in this preview are demonstration data, not real listings, and checkout is deliberately disabled.


BACKEND: See BACKEND-SETUP.md and server.js. GitHub Pages cannot execute server.js; deploy it separately. Never commit Firebase service-account credentials.

Admin setup: follow BACKEND-SETUP.md and set ADMIN_UIDS on the backend host to the trusted administrator Firebase Auth UID. The private admin dashboard is support-inbox.html. Never add admin privileges to browser-side code or public Firestore profile fields.
