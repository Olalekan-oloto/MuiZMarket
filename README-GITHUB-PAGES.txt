# MuiZMarket — GitHub Pages preview

This folder is prepared for GitHub Pages to show the styled marketplace UI. It includes sample products so you can test the design, search, category filters, and demo shopping bag.

## Publish on GitHub Pages (Android)
1. Download and extract this ZIP.
2. In your repository, upload the **contents** of this folder to the repository root (so `index.html` and `styles.css` are visible beside each other, not inside another folder). Replace the old files when prompted.
3. Open **Settings → Pages** and select **Deploy from a branch**, branch `main`, folder `/(root)`, then Save.
4. Wait for the Pages deployment, then refresh your `https://Olalekan-oloto.github.io/MuiZMarket/` page.

## Important limits
This is a static design/testing preview. GitHub Pages cannot run the Node.js server, database, sign-in, email verification, seller administration, or payment processing. Those features need the backend deployed to a Node.js host and the frontend configured to call it. The product cards in this preview are demonstration data, not real listings, and checkout is deliberately disabled.


## Sign-in redirect fix
The account sign-in handler now redirects verified users to `buyer.html` after successful Firebase sign-in. Note: GitHub Pages is static hosting; the buyer/seller order and management panels call `/api/...` endpoints that require a separately deployed backend. Without that backend, account authentication can work but order history and seller tools will not fully load.
