# Production service stack cost and scaling research

## Assumptions

This recommendation targets the QR menu SaaS currently built with Next.js, Vercel, Supabase, restaurant dashboards, orders, employee records, images, and future subscriptions. Prices are public list prices checked September 2026; INR conversions use approximately ₹96 per US dollar. Taxes, region-specific pricing, usage overages, and payment processing are excluded unless stated. Infrastructure cost is separate from payment processing fees.

## Ranked bundles: cheapest to costliest

| Tier | Typical monthly infrastructure | Stack | When it fits |
|---|---:|---|---|
| Validation | ₹0–960 | Vercel Hobby, Supabase Free, Supabase Auth/Storage, Resend Free, Sentry free tier, payment provider pay-as-you-go | Demo, pilot, or a few test restaurants. Vercel describes Hobby as for personal projects, so do not treat it as the long-term commercial tier. |
| Lean production | About ₹4,320–6,720 | Vercel Pro ($20), Supabase Pro ($25), Supabase Auth and Storage, Resend Free or Pro ($20), Sentry free tier | First paying restaurants and normal launch traffic. This is the recommended starting point for FlavorBox. |
| Growth | About ₹9,600–33,600 | Vercel Pro, Supabase Pro plus larger compute, Resend Pro/Scale, Cloudflare R2 for high-volume assets, Sentry paid monitoring, a queue/cron worker | Hundreds to several thousand restaurants, high image/3D traffic, background jobs, and stronger operational visibility. |
| Large scale | About ₹48,000–4,80,000+ | Vercel Pro/Enterprise or Cloudflare Workers, Supabase larger dedicated compute or AWS RDS/Aurora, R2/S3, dedicated email, queues, observability, CDN/WAF, managed backups | Large multi-tenant traffic, strict uptime requirements, dedicated support, regional resilience, or enterprise contracts. |
| Enterprise | Custom | Enterprise hosting, database, identity, email, payment, SIEM, support SLAs, private networking and compliance controls | Only when contracts, compliance, or traffic justify the operational cost. |

## Service choices

### Hosting

1. **Vercel** — best fit for this Next.js app. Hobby is free and includes HTTPS and preview deployments; Pro is the business tier with collaboration and higher limits ([Vercel plans](https://vercel.com/docs/plans)).
2. **Cloudflare Pages/Workers** — often cheaper at high request volume and pairs well with R2, but requires more adaptation for some Next.js server features.
3. **AWS/GCP/Azure** — most control and enterprise options, but substantially more operations work and a higher minimum cost.

Keep Vercel until traffic or contractual requirements make the pricing or platform limits a real problem.

### Database, authentication, storage, and realtime

1. **Supabase** — best all-in-one fit. Its database is full PostgreSQL and underpins Auth, Storage, Realtime, and Edge Functions. Pro is currently $25/month and includes 100,000 monthly active users, 8 GB database disk, 250 GB bandwidth, and daily backups; paid compute starts with a $10/month Micro instance credit ([Supabase pricing](https://supabase.com/pricing), [Supabase platform](https://supabase.com/docs)).
2. **Neon + Clerk + object storage** — flexible alternative when separating database and identity is valuable; usually costs more in a small product because services are billed separately.
3. **AWS RDS + Cognito + S3** — strongest control and enterprise integration, but the highest operational burden.

Use Supabase Auth first. Do not add Clerk/Auth0 unless you need features Supabase Auth cannot provide, such as a specialized B2B organization model or enterprise identity integrations. Clerk's current free tier covers up to 50,000 monthly retained users, with Pro starting at $20/month, but it is an additional platform beside Supabase ([Clerk pricing](https://clerk.com/pricing)).

For dish images and 3D assets, Supabase Storage is simplest initially. Move large or frequently served assets to **Cloudflare R2** when bandwidth becomes material: R2 lists $0.015/GB-month standard storage, 10 GB-month free, and no internet egress fee ([Cloudflare R2 pricing](https://developers.cloudflare.com/r2/pricing/)).

### Transactional email

1. **Resend** — recommended for contact notifications, login emails, receipts, and order alerts. Its current free plan includes 3,000 emails/month; Pro is $20/month for 50,000, with published overage pricing ([Resend pricing](https://resend.com/docs/knowledge-base/what-is-resend-pricing)).
2. **Postmark** — excellent deliverability and support, generally more expensive at larger volumes.
3. **Amazon SES** — usually the lowest raw sending cost at scale, but requires more setup for domains, templates, monitoring, and bounce handling.

Implement email as an asynchronous step after saving the contact message. The database record should remain the source of truth if delivery fails.

### Payments

Use a payment provider rather than building payment handling. For an India-first launch, evaluate Razorpay alongside Stripe. Stripe India currently lists 2% for domestic cards and 3% for cards issued outside India, with no setup or monthly fee on standard pricing ([Stripe India pricing](https://stripe.com/in/pricing)). Confirm onboarding eligibility and recurring-payment requirements for your business before committing.

### Monitoring and operations

Start with Sentry's free tier and Vercel logs. Add paid Sentry, uptime checks, database alerts, and centralized logs when customers depend on the service. Avoid paying for enterprise observability before you have enough traffic to generate useful signal.

## Recommended path

1. Launch commercially on **Vercel Pro + Supabase Pro + Resend Free/Pro**.
2. Keep Supabase Auth, PostgreSQL, RLS, and Storage together while the team is small.
3. Add R2 only when image/3D bandwidth is a measurable cost or performance concern.
4. Add a queue for email, image processing, QR generation, and 3D processing before those jobs can delay requests.
5. Revisit database separation or enterprise hosting only after measured bottlenecks, customer SLAs, or compliance requirements justify it.

The practical starting budget is therefore roughly **₹4,320–6,720/month plus payment transaction fees**, with a path to several thousand dollars per month without rewriting the product architecture.

## Sources

- [Vercel account plans](https://vercel.com/docs/plans)
- [Supabase pricing](https://supabase.com/pricing)
- [Supabase platform documentation](https://supabase.com/docs)
- [Clerk pricing](https://clerk.com/pricing)
- [Cloudflare R2 pricing](https://developers.cloudflare.com/r2/pricing/)
- [Resend pricing](https://resend.com/docs/knowledge-base/what-is-resend-pricing)
- [Stripe India pricing](https://stripe.com/in/pricing)
