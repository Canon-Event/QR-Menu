# Stamp cards — the simple guide

This is the first working version of WIIT's loyalty feature. It adds a branded card, phone verification, manual purchase stamps, expiry, rewards, redemption and an activity record.

## What you can open

- **Restaurant:** `/dashboard/loyalty` (also linked in the dashboard navigation).
- **Customer:** open the restaurant's normal menu and choose **My rewards**. The button appears after the program is activated for the first time.
- **Preview:** the owner screen lets you try Minimal, Paper and Bold without creating fake customers or stamps. Preview stamps are clearly labelled as examples.

## Understand the three pieces

Think of a paper coffee card:

1. **The screen is the card.** It shows the logo, stamps, progress and reward. React draws this screen.
2. **The API is the person checking the request.** It checks whether the user is signed in and whether the request makes sense. An API is simply a URL the screen talks to.
3. **The database is the stamp register.** Supabase stores the purchases and rewards. Its rules make sure a purchase is counted once, even if someone double-clicks or changes the browser code.

Changing the number displayed in the browser cannot add a real stamp. The database is the authority.

## Setup before real customers can join

### 1. Add the new database tables

Open your existing Supabase project → **SQL Editor** → **New query**. Copy the contents of [`supabase/phase-loyalty.sql`](../supabase/phase-loyalty.sql), then run it.

This file is a **migration**: instructions that add the storage needed for a new feature. Run it after the project's base restaurant schema already exists. It does not erase your restaurant, menu or orders. It can be run again safely.

The local tests ran this SQL in an isolated PostgreSQL database. It has **not been applied automatically to your hosted Supabase project**.

### 2. Connect phone verification

In Supabase, enable **Phone** under **Authentication → Sign In / Providers**, and configure an SMS provider. Supabase sends and verifies the six-digit code; WIIT never invents or accepts a pretend code.

Official setup: [Supabase phone sign-in](https://supabase.com/docs/guides/auth/phone-login). SMS delivery requires that provider connection. Configure the provider's sending limits and Supabase Auth rate limits before opening public enrollment. The app also limits repeated requests, but its local limiter alone is not a shared limit across multiple servers.

Then add this to your local `.env.local` and to your hosting environment when deploying:

```dotenv
LOYALTY_PHONE_AUTH_ENABLED=true
```

Restart `npm run dev` after changing the environment file. Keep actual secret keys out of Git and out of screenshots.

The customer has a separate login cookie from the restaurant owner. This lets you test the customer journey in the same browser without losing dashboard access.

### 3. Create the program

1. Open **Dashboard → Loyalty & rewards**.
2. Choose a style, colours, font, icon and title. Your existing restaurant logo is reused.
3. Under **Program rules**, choose the reward, target, minimum bill and expiry.
4. Save a draft, then activate when phone verification is ready.
5. Open the public menu and verify your phone to try it as a customer.

Use your SMS provider's supported test setup for development. Do not build a public OTP bypass.

## The working purchase flow

**Scan menu → verify phone → join rewards → make a purchase → show membership code → owner records the paid bill → stamp appears.**

For counter purchases, the owner opens **At the counter**, enters the customer's 12-character card code, the paid amount and a unique bill reference, and selects **Give 1 stamp**. Scanning the customer's QR with the phone camera opens that same screen. If sign-in is needed, the owner returns to the card afterward.

Use a reference such as `2026-10-25/1042` if your bill numbers restart each day. A bill reference can earn one stamp across the whole restaurant, including across different customers. Reversing a stamp does not free that bill reference for reuse.

This version authorizes the **restaurant owner account**. Existing employee directory records are not login accounts. Separate cashier accounts and permissions are a future addition; do not share the owner's password or login code.

## Expiry, explained with an example

The default program needs **5 stamps**, with **180 days of inactivity** before unfinished progress expires and **30 days** to use an unlocked reward.

- Customer earns three stamps: the card shows `3 / 5`.
- A new qualifying purchase before expiry restarts the 180-day countdown.
- Purchase five creates a reward and starts the next card at zero.
- The reward gets its own expiry date. Further purchases do not extend it.
- If unfinished progress expires, the next purchase starts at `1 / 5`.

No daily background task is required for correctness: the screen checks the expiry timestamp, and the database checks it again before every award or redemption. An expired reward cannot be used just because an old screen still shows it.

Program rules are locked after the first customer joins. Branding can still change. This protects the promise already made to customers. A later version can support new rules for new enrollments while keeping old terms.

Pausing stops new enrollment and stamps. Already-earned rewards stay usable until expiry, so the Rewards button stays available after a program has launched.

## Using and reversing rewards

Customers choose **Show at counter**. The owner finds their card, hands over the reward, and confirms redemption. It can be redeemed once. Customers cannot mark rewards as redeemed themselves.

For a mistaken award or refund, use **Reverse** beside its purchase and enter a reason. If it helped unlock an unused reward, that reward is revoked and its other eligible stamps return to the card. The register keeps the original purchase and the reason; it does not silently erase history.

If the reward was already redeemed, reversal is blocked for review. Recovering the value of an already-consumed reward needs a separate refund/adjustment policy; it is not automated in this version.

## What is not connected yet

Your existing checkout records orders but does not collect customer payments. Therefore:

- Scanning, joining, placing an order or marking an order completed **does not automatically award a stamp**.
- The automatic-payment option is clearly shown as **Not connected**.
- Redeeming at in-app checkout, payment refunds, and POS integrations are not implemented yet.

The next payment step needs a **webhook**: a signed message from the payment provider saying money was received. We will verify that message on the server, connect it to the signed-in customer and order, then award a stamp exactly once. Subscription payments from restaurant owners must never be treated as customer food purchases.

Until that connection exists, manual counter purchases are the supported live flow. A customer cannot claim that payment succeeded by sending `paid: true` from their browser.

## Where the code lives

| File / folder | In plain language |
| --- | --- |
| `components/loyalty/StampCard.tsx` | The reusable card design |
| `components/loyalty/LoyaltyDashboard.tsx` | Owner editor and counter screen |
| `components/loyalty/CustomerRewards.tsx` | Customer login, card and reward sheet |
| `app/api/loyalty/` | Requests for settings, phone login and membership |
| `lib/loyalty.ts` | Shared types, validation and display rules |
| `lib/loyalty-server.ts` | Customer session and database reading helpers |
| `supabase/phase-loyalty.sql` | Tables, permissions and atomic stamp operations |
| `app/loyalty.css` | Colours, spacing, layouts and mobile styling |

**Atomic** means a change happens as one complete action: either the stamp and reward records both save, or neither saves. This prevents half-finished rewards.

## Checking the work

```powershell
npm run test:loyalty
npx tsc --noEmit
npm run build
```

The isolated database tests need `@electric-sql/pglite` installed in a development tools folder. Set `PGLITE_MODULE` to its absolute package path, then run `npm run test:loyalty:db`. If already installed in the project, no environment variable is needed.

The browser checks use Playwright and an installed Chromium browser. Set `PLAYWRIGHT_MODULE` to an existing installation if it is outside this project, then run `node tests/loyalty-browser-qa.cjs`. Optional `CHROMIUM_PATH` selects a browser executable. Screenshots and the report are saved under `artifacts/loyalty-qa/`.

Database tests run the actual SQL. Browser tests run the actual components with fixture HTTP responses. Neither proves that your real SMS provider or hosted database has been configured. After setup, do one real enrollment, paid-bill award and redemption with your own account before inviting customers.

## Explaining this in an interview

An honest explanation you can practice:

> “I built a restaurant loyalty feature with AI assistance. I worked through the customer journey, manual purchase flow, branding and expiry rules. The screen calls a server API, and PostgreSQL enforces who can award stamps and prevents duplicate bills. I tested permissions, expiry and one-time redemption. Payment-based automation is the next integration.”

Start by understanding **one purchase** end to end: the button in `LoyaltyDashboard.tsx`, the `award` branch in the manage API, and the `loyalty_award` function in the SQL file. Being able to explain that small path clearly is more useful than memorizing every file.
