-- Move billing state behind provider-neutral columns for Paddle Billing.
-- The legacy Stripe columns remain so this migration is non-destructive for
-- existing databases, but access checks only grant Pro to Paddle records.

alter table public.subscriptions
  add column if not exists billing_provider text,
  add column if not exists billing_customer_id text,
  add column if not exists billing_subscription_id text,
  add column if not exists billing_price_id text;

update public.subscriptions
set
  billing_provider = case
    when stripe_customer_id is not null or stripe_subscription_id is not null
      then 'stripe'
    else 'paddle'
  end,
  billing_customer_id = coalesce(billing_customer_id, stripe_customer_id),
  billing_subscription_id = coalesce(billing_subscription_id, stripe_subscription_id),
  billing_price_id = coalesce(billing_price_id, stripe_price_id)
where billing_provider is null;

alter table public.subscriptions
  alter column billing_provider set default 'paddle',
  alter column billing_provider set not null;

alter table public.subscriptions
  add constraint subscriptions_billing_provider_check
  check (billing_provider in ('stripe', 'paddle'));

create unique index if not exists subscriptions_billing_customer_id_idx
  on public.subscriptions (billing_customer_id)
  where billing_customer_id is not null;

create unique index if not exists subscriptions_billing_subscription_id_idx
  on public.subscriptions (billing_subscription_id)
  where billing_subscription_id is not null;
