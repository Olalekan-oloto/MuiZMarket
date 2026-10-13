# MuiZMarket backend setup

This package adds the missing Node.js API foundation. It does not magically deploy itself: host it on Render, Railway, Fly.io, or another Node.js host. GitHub Pages only serves static files.

## Required setup
1. Create a Firebase service account in Firebase Console → Project settings → Service accounts. Store its JSON securely in your backend host as `FIREBASE_SERVICE_ACCOUNT_JSON` (the entire JSON as one environment variable). Never commit it or put it in `firebase-config.js`.
2. Set `ALLOWED_ORIGINS` to your exact deployed website origin, e.g. `https://olalekan-oloto.github.io/MuiZMarket` is a path, not an origin; use the origin only, such as `https://olalekan-oloto.github.io`.
3. Set `ADMIN_UIDS` to the Firebase Authentication UID of the site owner/admin. Multiple trusted UIDs can be comma-separated. Find a UID in Firebase Console → Authentication → Users. Never use an email or client-side flag as the admin credential.
4. Deploy this folder as a Node.js service with `npm install` and `npm start`. The host supplies `PORT`. Test `/health`. Set `FIREBASE_SERVICE_ACCOUNT_JSON`, `ALLOWED_ORIGINS`, and `ADMIN_UIDS` only in the backend host environment; never commit the service account JSON.
5. In `firebase-config.js`, set `window.MUIZMARKET_API_URL` to the deployed API base URL, for example `https://your-api-host.example.com` (no trailing slash), then redeploy the frontend.
6. Registration offers Buyer or Seller. The role is stored by the backend because the existing Firestore rules intentionally do not allow the browser to write role fields. If the API is not configured, buyer accounts can still use the Firebase-only flow, but seller role assignment and admin monitoring cannot work yet.
7. The private admin page is `support-inbox.html`. It requires a verified sign-in and a UID listed in `ADMIN_UIDS`; the server enforces this on every admin request. The admin list omits phone numbers and dates of birth.

## Current endpoints
- `GET /health` health check
- `GET /api/me` current profile
- `POST /api/account/role` assigns a buyer/seller role once; it cannot grant admin access
- `GET /api/admin/summary` admin-only marketplace counts
- `GET /api/admin/users` admin-only list of account names, usernames, emails, countries, roles, and join dates
- `GET /api/products` published products
- `POST /api/products`, `PATCH /api/products/:id`, `DELETE /api/products/:id` seller listing management
- `GET /api/seller/summary` seller listings summary

## Important limitations
This is a backend foundation, not a fully completed production marketplace. It does not implement checkout, payment-provider verification, refunds, order fulfillment, payouts, image uploads, or seller approval. The admin dashboard monitors registered accounts and basic marketplace counts; it is not a complete order/support moderation console. Earnings are intentionally not calculated until trusted payment processing is implemented. Review Firestore indexes/rules and test with a staging Firebase project before going live.
