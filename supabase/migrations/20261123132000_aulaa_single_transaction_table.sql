-- Aulaa minimal payment schema: one table, no dependency on a bookings table.
create extension if not exists pgcrypto;

create table if not exists public.aulaa_transactions (
  id uuid primary key default gen_random_uuid(),
  order_id text not null unique,
  aulaa_payment_id text unique,
  amount integer not null check (amount between 1000 and 500000000),
  fee_amount integer not null default 0,
  charged_amount integer,
  status text not null default 'pending',
  payment_method text,
  payment_number text,
  payment_link text,
  currency text not null default 'IDR',
  country_code text not null default 'ID',
  expires_at timestamptz,
  paid_at timestamptz,
  raw_response jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.aulaa_transactions
  add column if not exists aulaa_payment_id text,
  add column if not exists charged_amount integer,
  add column if not exists raw_response jsonb;

-- Keep compatibility with the existing table audited in the project.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'aulaa_transactions'
      and column_name = 'total_amount'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'aulaa_transactions'
      and column_name = 'charged_amount'
  ) then
    alter table public.aulaa_transactions rename column total_amount to charged_amount;
  elsif exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'aulaa_transactions'
      and column_name = 'total_amount'
  ) then
    update public.aulaa_transactions
    set charged_amount = coalesce(charged_amount, total_amount);
  end if;
end $$;

-- Detach the payment record from any legacy bookings foreign key.
do $$
declare
  fk record;
begin
  for fk in
    select conname
    from pg_constraint
    where conrelid = 'public.aulaa_transactions'::regclass
      and contype = 'f'
      and confrelid = to_regclass('public.bookings')
  loop
    execute format('alter table public.aulaa_transactions drop constraint %I', fk.conname);
  end loop;
end $$;

alter table public.aulaa_transactions
  alter column id set default gen_random_uuid(),
  alter column status set default 'pending';

alter table public.aulaa_transactions
  drop constraint if exists aulaa_transactions_status_check;

alter table public.aulaa_transactions
  add constraint aulaa_transactions_status_check
  check (status in ('pending', 'paid', 'expired', 'cancelled', 'failed', 'refunded'));

create unique index if not exists aulaa_transactions_aulaa_payment_id_key
  on public.aulaa_transactions (aulaa_payment_id)
  where aulaa_payment_id is not null;

alter table public.aulaa_transactions enable row level security;
revoke all on table public.aulaa_transactions from anon, authenticated;
grant all on table public.aulaa_transactions to service_role;
