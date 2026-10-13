-- Belajar is admin-only until the course is opened to sellers.
-- Learner RPCs refuse everyone else. Admin editor RPCs were already gated.

do $$
declare
  def text;
  old text := $old$if v_me is null then
    return jsonb_build_object('ok', false, 'error', 'login_required');
  end if;$old$;
  neu text := $neu$if v_me is null then
    return jsonb_build_object('ok', false, 'error', 'login_required');
  end if;
  if not public.is_platform_admin() then
    return jsonb_build_object('ok', false, 'error', 'admin_only');
  end if;$neu$;
  sig text;
begin
  foreach sig in array array[
    'public.belajar_course()',
    'public.belajar_mark_lesson(uuid,text,jsonb)',
    'public.belajar_set_state(text,text[])'
  ]
  loop
    select pg_get_functiondef(sig::regprocedure) into def;
    if position('error'', ''admin_only''' in def) > 0 then
      continue;
    end if;
    if position(old in def) = 0 then
      raise exception 'belajar admin gate: login check not found in %', sig;
    end if;
    execute replace(def, old, neu);
  end loop;
end $$;

notify pgrst, 'reload schema';
