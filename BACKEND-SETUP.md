# MuiZMarket backend setup

This package adds the missing Node.js API foundation. It does not magically deploy itself: host it on Render, Railway, Fly.io, or another Node.js host. GitHub Pages only serves static files.

## Required setup
1. Create a Firebase service account in Firebase Console → Project settings → Service accounts. Store its JSON securely in your backend host as `FIREBASE_SERVICE_ACCOUNT_JSON` (the entire JSON as one environment variable). Never commit it or put it in `firebase-config.js`.
2. Set `ALLOWED_ORIGINS` to your exact deployed website origin, e.g. `https://olalekan-oloto.github.io`.
3. Deploy this folder as a Node.js service with `npm install` and `npm start`. The host supplies `PORT`. Test `/health`.
4. Update the frontend to call the deployed API URL and send `Authorization: Bearer <Firebase ID token>`. The current pages still contain demo products and are not yet wired to every API route.
5. For account roles, frontend must call `POST /api/account/role` after a user explicitly chooses buyer or seller. Do not let users set admin role; admin roles must be granted securely by the site owner.

## Current endpoints
- `GET /health` health check
- `GET /api/me` current profile
- `POST /api/account/role` choose buyer/seller
- `GET /api/products` published products
- `POST /api/products`, `PATCH /api/products/:id`, `DELETE /api/products/:id` seller listing management
- `GET /api/seller/summary` seller listings summary

## Important limitations
This is a backend foundation, not a fully completed production marketplace. It does not implement checkout, payment-provider verification, refunds, order fulfillment, payouts, image uploads, seller approval, or admin UI. Earnings are intentionally not calculated until trusted payment processing is implemented. Review Firestore indexes/rules and test with a staging Firebase project before going live.
