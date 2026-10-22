-- VizinhoMarket — atendentes da loja.
-- O dono convida pelo e-mail alguém que já tem conta no app. O atendente usa o Painel do Comerciante para
-- pedidos, entregas e cardápio, mas não mexe em dados da loja (nome, taxas, Pix), faturas nem na equipe.
-- (store_members com o papel 'staff' já existia desde 14/10; aqui entram o convite e os limites.)

create function public.store_list_members(p_store_id uuid)
returns table (user_id uuid, email text, full_name text, role text, created_at timestamptz)
language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not (public.is_store_owner(p_store_id) or public.is_admin()) then
    raise exception 'Só o dono da loja vê a equipe' using errcode = '42501';
  end if;
  return query
  select m.user_id, u.email::text, p.full_name, m.role::text, m.added_at
  from public.store_members m
  join auth.users u on u.id = m.user_id
  left join public.profiles p on p.id = m.user_id
  where m.store_id = p_store_id
  order by (m.role = 'owner') desc, m.added_at;
end $$;

create function public.store_add_staff(p_store_id uuid, p_email text) returns uuid
language plpgsql security definer set search_path = public, auth as $$
declare v_user uuid;
begin
  if not (public.is_store_owner(p_store_id) or public.is_admin()) then
    raise exception 'Só o dono da loja convida atendentes' using errcode = '42501';
  end if;
  select id into v_user from auth.users where lower(email) = lower(trim(p_email));
  if v_user is null then
    raise exception 'Não existe conta com este e-mail. Peça para a pessoa criar a conta no app e tente de novo.';
  end if;
  if exists (select 1 from public.store_members where store_id = p_store_id and user_id = v_user) then
    raise exception 'Esta pessoa já faz parte da equipe da loja';
  end if;
  if (select count(*) from public.store_members where store_id = p_store_id and role = 'staff') >= 10 then
    raise exception 'Limite de 10 atendentes por loja';
  end if;
  insert into public.store_members (store_id, user_id, role) values (p_store_id, v_user, 'staff');
  perform public._audit('add_staff', 'stores', p_store_id::text, jsonb_build_object('user_id', v_user));
  return v_user;
end $$;

create function public.store_remove_staff(p_store_id uuid, p_user_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not (public.is_store_owner(p_store_id) or public.is_admin() or p_user_id = auth.uid()) then
    raise exception 'Só o dono da loja remove atendentes' using errcode = '42501';
  end if;
  delete from public.store_members where store_id = p_store_id and user_id = p_user_id and role = 'staff';
  if not found then raise exception 'Atendente não encontrado (o dono não pode ser removido)'; end if;
  perform public._audit('remove_staff', 'stores', p_store_id::text, jsonb_build_object('user_id', p_user_id));
end $$;

revoke execute on function public.store_list_members(uuid), public.store_add_staff(uuid, text), public.store_remove_staff(uuid, uuid) from public, anon;
grant execute on function public.store_list_members(uuid), public.store_add_staff(uuid, text), public.store_remove_staff(uuid, uuid) to authenticated;

-- Atendente só pode abrir/pausar a loja; o resto dos dados da loja é do dono.
create function public._stores_staff_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.is_store_member(new.id) and not public.is_store_owner(new.id) and not public.is_admin()
     and (to_jsonb(new) - 'is_paused' - 'updated_at') is distinct from (to_jsonb(old) - 'is_paused' - 'updated_at') then
    raise exception 'Só o dono da loja pode alterar esses dados (o atendente pode abrir e pausar a loja)' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger stores_staff_guard before update on public.stores for each row execute function public._stores_staff_guard();

-- Taxas por bairro: só o dono.
drop policy zones_write on public.delivery_zones;
create policy zones_write on public.delivery_zones for all to authenticated
  using (public.is_store_owner(store_id) or public.is_admin()) with check (public.is_store_owner(store_id) or public.is_admin());
