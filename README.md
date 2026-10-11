# MuiZMarket

MuiZMarket is a premium black-and-gold digital marketplace starter built with Node.js, Express, SQLite, and a responsive browser UI.

## Current features

- Dedicated `/about`, `/contact`, `/buyer`, `/seller`, and `/owner-support` pages instead of forcing all content into one page.
- A contact form that stores support tickets for the owner, with a private owner-only support inbox and optional email notifications/replies.
- AI-style support chat on the contact page. It uses the OpenAI Responses API if `OPENAI_API_KEY` is configured; without a key it provides built-in FAQ answers and directs account-specific issues to the contact form.
- Six-digit email verification codes sent to Gmail before a newly registered account can sign in. Codes expire after 10 minutes; existing accounts in an upgraded database remain verified. Authentication endpoints have starter per-IP rate limits and login regenerates the session ID.
- Visible sign-out actions on the home page and dedicated dashboard pages.

- Buyer, seller, and owner/admin roles. Public registration always creates a buyer; seller access is requested and owner-approved. Admin role assignment is only available through the one-time CLI bootstrap command.
- Seller subscriptions configured at USD $15/month, $40 every 3 months, or $120/year, with editable NGN amounts (₦15,000, ₦40,000, and ₦120,000 respectively). Newly approved sellers receive one 7-day free trial before payment is required; trial access starts on owner approval and is not reset on re-approval.
- Flutterwave recurring payment-plan checkout and webhook verification for subscription renewals.
- Seller product listings remain hidden until owner moderation approves them. Approved sellers can list during their 7-day trial; after it expires, an active paid subscription is required.
- 10% commission ledger on seller orders.
- Owner-only finance overview with paid-order totals, recorded commission, seller earnings, payout status totals, and recent buyer orders. This is an internal ledger report, not a live bank/provider balance.
- Seller bank-account verification through Flutterwave account resolution, with account numbers encrypted at rest using AES-256-GCM.
- Owner-reviewed seller payout requests. NGN payouts can be sent through the Flutterwave transfer API after seller account verification and owner approval.
- Cancellation of recurring subscriptions through the Flutterwave subscription API, preserving access until the locally recorded paid period expires.
- SQLite session store and database migrations for the starter schema.

## Local setup

Requirements: Node.js 20 or newer and npm.

```bash
npm install
cp .env.example .env
```

Set a strong `SESSION_SECRET`. Configure the Gmail settings described below before testing new-user registration. Generate a payout encryption key with:

```bash
openssl rand -hex 32
```

Put the resulting 64-character hex string in `PAYOUT_ENCRYPTION_KEY`. Keep this key secret and backed up: if it is lost, encrypted bank account numbers cannot be decrypted for transfers.

Start the app:

```bash
npm run dev
```

Open `http://localhost:3000`. Dedicated pages are available at `/about`, `/contact`, `/buyer`, `/seller`, and `/owner-support`.

## Gmail email verification and contact support setup

1. Use a Google account dedicated to the business if possible. Turn on 2-Step Verification for that account.
2. Create a Google App Password in your Google Account security settings. Use the app password, not your normal Gmail password.
3. Set `GMAIL_USER` to the sending Gmail address and `GMAIL_APP_PASSWORD` to the generated app password in Replit Secrets or your deployment environment. Never put these values in frontend files or commit them to Git.
4. Set `SUPPORT_INBOX_EMAIL` to the address where you want contact form notifications sent. Tickets are saved in the app database even if notification email fails. Owner/admin users can review them at `/owner-support` and send replies from there.
5. Optional: set `OPENAI_API_KEY` and `OPENAI_SUPPORT_MODEL` to enable AI-generated support answers. Without an API key, the contact page uses built-in FAQ answers. AI support cannot access private order records or perform account actions.
6. Test registration with an email you can access. The user must enter the six-digit code received by email before sign-in is allowed. Codes expire in 10 minutes.

## Payment provider setup

1. Create and verify a Flutterwave merchant account and use test credentials first.
2. Create six recurring payment plans in Flutterwave, with the exact matching currency, amount, and interval. The 7-day trial is managed by MuiZMarket and does not automatically charge the seller at trial end; sellers must choose a plan and complete checkout after the trial:
   - Monthly USD: $15, interval monthly
   - Quarterly USD: $40, interval every 3 months
   - Yearly USD: $120, interval yearly
   - Monthly NGN: ₦15,000 by default, interval monthly
   - Quarterly NGN: ₦40,000 by default, interval every 3 months
   - Yearly NGN: ₦120,000 by default, interval yearly
3. Set all six `FLW_*_PLAN_ID_*` values in `.env`. The plan IDs must match their amount, currency, and interval.
4. Configure `FLW_SECRET_KEY` and the webhook verification secret `FLW_SECRET_HASH`.
5. For USD product checkout through Flutterwave, first ask Flutterwave to enable international card payments for your verified merchant account. Test eligible international/dollar cards in test mode, then set `FLW_ENABLE_USD_CARD_PAYMENTS=true` in `.env` only after the provider confirms the capability is enabled. Keep it `false` otherwise. USD checkout is card-only; NGN checkout can offer the configured local methods.
6. Configure Flutterwave webhooks to reach:
   - `https://YOUR_DOMAIN/api/flutterwave/webhook`
   - `https://YOUR_DOMAIN/api/flutterwave/transfer-webhook`
7. Set `APP_URL` to the public HTTPS site URL. Use an HTTPS deployment for production.
8. Verify checkout, subscription renewals, cancellations, account resolution, transfer success/failure, and refunds in the provider's test environment before accepting real payments.

The NGN prices are editable through `MONTHLY_PRICE_NGN_KOBO`, `QUARTERLY_PRICE_NGN_KOBO`, and `YEARLY_PRICE_NGN_KOBO` (stored in kobo). Changing a local price alone does not update an existing provider payment plan; update or recreate the corresponding provider plan and environment ID together.

## Create the owner/admin account

1. Register your intended owner account through the website.
2. Stop the server.
3. Run:

```bash
node server.js --create-admin owner@example.com
```

4. Restart the server and sign in with that account.

Do not expose the command or database to sellers. Never let public registration accept a role field.

## Payment and payout notes

- A subscription checkout only becomes active after a signed webhook and provider-side transaction verification succeed. The browser redirect is not treated as proof of payment.
- Flutterwave USD checkout is disabled by default. Enable `FLW_ENABLE_USD_CARD_PAYMENTS=true` only after your verified merchant account has international USD card acceptance enabled. USD checkout requests card payment only; server-side confirmation checks the order reference, exact expected amount, currency, successful status, and transaction ID. The redirect can trigger a server-side verification, and the signed webhook remains the asynchronous fallback.
- Subscription plans must be created in the provider dashboard first. No real recurring charge is possible until the provider credentials and plan IDs are configured.
- The current marketplace checkout supports one seller and one currency per order to keep commission accounting predictable.
- Seller product payments are currently collected by the platform and recorded in the commission ledger. Payout requests are allocated against available seller earnings to prevent duplicate claims. The owner finance overview is based on app records and does not reconcile actual settlement balances automatically.
- To receive your platform settlement, complete business verification in Flutterwave and configure your business settlement account or payout balance in the Flutterwave dashboard. Keep business funds in a dedicated business account and do not place provider secret keys or bank credentials in frontend code. Actual provider balance and settlement status must be checked in the provider dashboard until a verified balance/settlement API integration is added.
- Nigerian buyers can be offered NGN checkout. USD pricing is not a guarantee that a Nigerian buyer can pay in USD or that the merchant will receive USD: Flutterwave says transactions made with naira cards settle in NGN. Enable USD/international payment methods only after confirming eligibility with your provider and testing each route.
- Do not implement a buyer cash-deposit wallet or promise stored USD balances with the current starter. That is a different regulated money-handling feature and needs an appropriately licensed provider, legal/compliance review, and a ledger/reconciliation design. Flutterwave's documented payout subaccounts feature currently supports NGN wallets only.
- Flutterwave split payments can send a seller share and platform commission to configured subaccounts, but that is not wired into this starter yet. Before launch, decide whether you want provider-side split settlement (usually safer for a marketplace) or to collect funds centrally and pay sellers later; get provider approval and legal advice for the selected flow.
- Automated bank transfer is currently restricted to verified Nigerian NGN bank accounts. USD payout requests remain a manual operational workflow until a suitable approved transfer route is configured.
- A transfer submission with an uncertain network outcome is intentionally not made automatically retryable; reconcile the reference in the provider dashboard first to avoid sending money twice.
- Marketplace split settlement, chargebacks, refund reversals, tax handling, and accounting reconciliation require further integration and business/legal review before public launch.
- This is a development starter, not a certified production payment system. Perform security review, backups, monitoring, rate limiting, CSRF/origin protections, privacy/legal review, and provider compliance before production.

## Useful scripts

```bash
npm run dev
npm start
node server.js --create-admin owner@example.com
```

## Replit setup from an Android phone

1. Upload/import `MuiZMarket-starter-updated.zip` into Replit. If Replit has already imported an older version, keep it until you have a backup, then import this ZIP as a separate project or replace the old files carefully.
2. In the Replit project, open **Secrets** (usually the lock icon under Tools) and add environment variables there. Never put secrets in `public/` files or send them in chat.
3. Add `SESSION_SECRET` as a long random value (at least 32 characters). Add `GMAIL_USER`, `GMAIL_APP_PASSWORD`, and `SUPPORT_INBOX_EMAIL` for email verification and support notifications. Google App Passwords require Google 2-Step Verification; use an app password, not your normal Gmail password.
4. Optional: add `OPENAI_API_KEY` to enable AI-generated support answers. Without it, the support chat uses built-in FAQ replies.
5. Add Flutterwave test credentials and all six plan IDs before testing subscriptions. Leave live payments disabled until the site has been fully tested. Do not share payment keys with anyone.
6. Run the project using Replit's **Run** button. Check the public home page, `/about`, `/contact`, `/buyer`, and `/seller`.
7. To create the owner account: register through the website and verify the email first. In the Replit Shell, run `node server.js --create-admin your-owner-email@example.com` with the exact email you registered. Then sign in again. Keep owner access private.

### Important configuration limit

The source code and pages are included in this ZIP, but email delivery, AI-generated answers, and payment-provider transactions cannot work until you add your own credentials in Replit Secrets and test the service connections. Do not paste credentials into ChatGPT or into browser-visible JavaScript. Use test-mode payment credentials first.


## Social profiles and real checkout

Set `MUIZMARKET_FACEBOOK_URL`, `MUIZMARKET_INSTAGRAM_URL`, `MUIZMARKET_TWITTER_URL`, and `MUIZMARKET_TIKTOK_URL` to the exact public profile URLs. Empty values are hidden; no guessed account links are shown. The public demo dashboard route has been removed. Checkout now fails closed with a clear setup message if no supported payment provider is configured; it does not create fake unpaid demo orders. Configure and test live payment credentials, webhook verification, and settlement handling before launch.


## Digital-first marketplace scope

MuiZMarket is currently focused on digital goods and digital services. The seller listing form includes categories for Instagram content kits, Facebook marketing assets, X (Twitter) resources, Pinterest templates, social media marketing tools, graphic design assets, website templates, software/plugins, e-books/learning, business templates and digital services. These categories are for legitimate digital products (for example, editable templates, creative assets, content calendars and marketing resources), not social-media account transfers, passwords, followers or access credentials.

The platform shortcuts on the homepage are category filters; they do not create products automatically. A category will show items only when approved listings exist. The additional features discussed (wishlist, reviews, coupons, messaging, delivery/download entitlements, dispute management and expanded notifications) still require separate implementation and testing before they should be advertised as working features.
