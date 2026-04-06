-- Trigger: auto-insert a free subscription row when a new auth user is created.

create or replace function public.handle_new_user_subscription()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.subscriptions (
    user_id,
    plan,
    status,
    grandfathered,
    stripe_customer_id,
    stripe_subscription_id,
    current_period_end,
    trial_ends_at
  ) values (
    new.id,
    'free',
    'free',
    false,
    null,
    null,
    null,
    null
  )
  on conflict (user_id) do nothing;

  return new;
end;
$$;

create or replace trigger on_auth_user_created_subscription
  after insert on auth.users
  for each row
  execute procedure public.handle_new_user_subscription();
