-- VizinhoMarket — chaves de operação do admin (13/11/2026)
--  * admin_set_setting passa a validar as chaves conhecidas (tipo e faixa), para um erro de digitação não derrubar a operação.
--  * admin_set_store_online_payment: habilita a loja para receber online e registra a conta de recebedor (split) no gateway.

create or replace function public.admin_set_setting(p_key text, p_value jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare v numeric; v_max numeric;
begin
  perform public._require_admin();
  if p_key !~ '^[a-z][a-z0-9_]{2,60}$' then raise exception 'Chave de configuração inválida'; end if;
  if p_key in ('online_payments_enabled', 'platform_delivery_enabled') and jsonb_typeof(p_value) <> 'boolean' then
    raise exception 'Use verdadeiro ou falso';
  end if;
  if p_key = 'payment_provider' and (jsonb_typeof(p_value) <> 'string' or p_value #>> '{}' not in ('sandbox', 'mercadopago', 'asaas')) then
    raise exception 'Provedor de pagamento inválido';
  end if;
  if p_key in ('default_commission_rate', 'courier_fee_share') then
    if jsonb_typeof(p_value) <> 'number' then raise exception 'Use um número'; end if;
    v := (p_value #>> '{}')::numeric;
    v_max := case when p_key = 'courier_fee_share' then 1 else 0.5 end;
    if v < 0 or v > v_max then raise exception 'Valor fora da faixa permitida'; end if;
  end if;
  if p_key in ('order_accept_timeout_min', 'online_payment_timeout_min', 'refund_window_days', 'courier_max_active', 'location_retention_days') then
    if jsonb_typeof(p_value) <> 'number' or (p_value #>> '{}')::numeric not between 1 and 365 then raise exception 'Valor fora da faixa permitida'; end if;
  end if;
  insert into public.platform_settings (key, value) values (p_key, p_value)
  on conflict (key) do update set value = excluded.value, updated_at = now();
  perform public._audit('set_setting', 'platform_settings', p_key, case when p_key like '%secret%' then '"***"'::jsonb else p_value end);
end $$;

create function public.admin_set_store_online_payment(p_store_id uuid, p_enabled boolean, p_provider text default null, p_recipient_id text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public._require_admin();
  if p_provider is not null and p_provider not in ('sandbox', 'mercadopago', 'asaas') then raise exception 'Provedor inválido'; end if;
  update public.stores set accepts_online_payment = p_enabled where id = p_store_id;
  if not found then raise exception 'Loja não encontrada'; end if;
  if p_provider is not null then
    update public.store_private set gateway_provider = p_provider, gateway_recipient_id = nullif(trim(p_recipient_id), '') where store_id = p_store_id;
  end if;
  perform public._audit('set_store_online_payment', 'stores', p_store_id::text,
    jsonb_build_object('enabled', p_enabled, 'provider', p_provider, 'recipient_set', p_recipient_id is not null));
end $$;

revoke execute on function public.admin_set_setting(text, jsonb), public.admin_set_store_online_payment(uuid, boolean, text, text) from public, anon, authenticated;
grant execute on function public.admin_set_setting(text, jsonb), public.admin_set_store_online_payment(uuid, boolean, text, text) to authenticated;
