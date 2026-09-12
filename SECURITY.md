# Security maintenance

Next.js is upgraded to 15.5.25 and PostCSS is pinned to 8.5.26 to address dependency audit findings. The obsolete direct Windows compiler dependency was removed. Keep the PostCSS override until the framework uses a patched version itself.

JSON parsing caps actual bytes at 32,000. Multipart parsing caps uploads at 4 MiB plus 64 KiB overhead, with individual route file limits applied afterward. Public forms enforce request-origin checks and bounded local throttling. Payroll PIN hashing uses asynchronous scrypt and restaurant-scoped attempt limits.

Checks: npm run test:security, npx tsc --noEmit, npm run build, npm audit.

Remaining deployment scope:

- Use shared edge throttling for multiple replicas; local limits reset on restart. The trusted proxy must overwrite X-Forwarded-For.
- Deployed Supabase policies and storage permissions were not verified or changed.
- Payroll PINs provide UI privacy, not a separate authorization boundary: owners already have database access to salaries.
- The public employee leave portal still uses employee details; stronger identity verification needs login or one-time codes.
- The CSP restricts framing, objects and base URLs; it is not a full script-source policy.
- Live authenticated workflows and database writes still need deployment smoke tests.
