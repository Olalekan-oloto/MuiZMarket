# MuiZMarket — GitHub Pages preview

This folder is prepared for GitHub Pages to show the styled marketplace UI. It includes sample products so you can test the design, search, category filters, and demo shopping bag.

## Publish on GitHub Pages (Android)
1. Download and extract this ZIP.
2. In your repository, upload the **contents** of this folder to the repository root (so `index.html` and `styles.css` are visible beside each other, not inside another folder). Replace the old files when prompted.
3. Open **Settings → Pages** and select **Deploy from a branch**, branch `main`, folder `/(root)`, then Save.
4. Wait for the Pages deployment, then refresh your `https://Olalekan-oloto.github.io/MuiZMarket/` page.

## Important limits
This is a static design/testing preview. GitHub Pages cannot run the Node.js server, database, sign-in, email verification, seller administration, or payment processing. Those features need the backend deployed to a Node.js host and the frontend configured to call it. The product cards in this preview are demonstration data, not real listings, and checkout is deliberately disabled.


BACKEND: See BACKEND-SETUP.md and server.js. GitHub Pages cannot execute server.js; deploy it separately. Never commit Firebase service-account credentials.
