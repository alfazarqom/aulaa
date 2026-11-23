# Aulaa payment integration

Minimal baseline: **2 Edge Functions + 1 table**.

## Structure

- `functions/aulaa-create-payment/index.ts` — creates an Aulaa invoice and stores it in `public.aulaa_transactions`.
- `functions/aulaa-webhook/index.ts` — webhook receiver scaffold. It intentionally fails closed until Aulaa's exact signature header, signing algorithm, and payload contract are verified from official documentation.
- `migrations/20261123132000_aulaa_single_transaction_table.sql` — creates/adjusts the single transaction table and removes any legacy foreign key from `aulaa_transactions` to `bookings`.

## Required Edge Function secrets

- `AULAA_API_KEY`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Do not commit secret values.

## Important before deployment

1. Confirm Aulaa's official webhook signature and payload contract, then implement verification in `aulaa-webhook`. The current scaffold rejects requests with HTTP 501; it does not mark transactions as paid.
2. Ensure the amount passed to `aulaa-create-payment` is calculated or validated by a trusted server-side order flow. Never trust a client-editable amount.
3. Review the migration against the target database before applying it. This repository change does not apply SQL to the hosted Supabase project or deploy functions.
