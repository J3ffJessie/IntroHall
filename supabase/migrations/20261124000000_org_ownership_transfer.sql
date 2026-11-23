-- Organization ownership transfer: an owner hands the organization to another team member. The new
-- owner gets every owner power (delete the organization, manage owners); the previous owner stays
-- on the team as an admin. It also unblocks account deletion for someone who is the only owner.

set lock_timeout = '5s';
set statement_timeout = '60s';

create function public.transfer_org_ownership(p_org_id uuid, p_to_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid       uuid := auth.uid();
  v_org       public.organizations;
  v_my_role   text;
  v_to_role   text;
begin
  -- Lock the organization so two transfers (or a transfer and a delete) cannot interleave.
  select * into v_org from public.organizations where id = p_org_id for update;
  select role into v_my_role from public.org_members where org_id = p_org_id and user_id = v_uid for update;
  if v_org.id is null or v_org.deleted_at is not null or v_my_role is distinct from 'owner' then
    raise exception 'only owners can transfer an organization' using errcode = '42501';
  end if;
  if v_org.suspended_at is not null then
    raise exception 'organization is suspended' using errcode = '42501';
  end if;
  if p_to_user = v_uid then
    raise exception 'you already own this organization' using errcode = 'P0001';
  end if;

  select m.role into v_to_role
    from public.org_members m
    join public.accounts ac on ac.user_id = m.user_id
    join auth.users u on u.id = m.user_id
   where m.org_id = p_org_id and m.user_id = p_to_user
     and ac.deleted_at is null
     and (u.banned_until is null or u.banned_until < now())  -- not suspended by a platform admin
   for update of m;
  if v_to_role is null then
    raise exception 'pick someone on the team' using errcode = 'P0001';
  end if;
  if v_to_role = 'owner' then
    raise exception 'they already own this organization' using errcode = 'P0001';
  end if;
  -- Same cap as create_organization().
  if (select count(*) from public.org_members m join public.organizations o on o.id = m.org_id
       where m.user_id = p_to_user and m.role = 'owner' and o.deleted_at is null) >= 5 then
    raise exception 'they already own the maximum of 5 organizations' using errcode = 'P0001';
  end if;

  update public.org_members set role = 'owner' where org_id = p_org_id and user_id = p_to_user;
  update public.org_members set role = 'admin' where org_id = p_org_id and user_id = v_uid;
end;
$$;

revoke all on function public.transfer_org_ownership(uuid, uuid) from public, anon;
grant execute on function public.transfer_org_ownership(uuid, uuid) to authenticated;
