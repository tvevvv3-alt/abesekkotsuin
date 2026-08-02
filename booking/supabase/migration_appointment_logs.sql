-- 予約の変更履歴（作成・日時/担当の変更・キャンセル）を自動記録。
-- ドラッグ等での取り違えを後から確認できるようにする。
-- Supabase の SQL Editor で1回だけ実行（再実行しても安全）。

create table if not exists public.appointment_logs (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid,
  action text not null,            -- created / moved / cancelled
  patient_name text,
  detail text,
  created_at timestamptz not null default now()
);
create index if not exists appointment_logs_created_idx on public.appointment_logs (created_at desc);

alter table public.appointment_logs enable row level security;
drop policy if exists appointment_logs_read on public.appointment_logs;
create policy appointment_logs_read on public.appointment_logs
  for select to authenticated using (true);

-- 分→"HH:MM"
create or replace function public.fmt_min(m int) returns text language sql immutable as $$
  select lpad((m/60)::int::text, 2, '0') || ':' || lpad((m%60)::text, 2, '0');
$$;

create or replace function public.log_appointment_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare d text := '';
begin
  if TG_OP = 'INSERT' then
    insert into appointment_logs(appointment_id, action, patient_name, detail)
      values (NEW.id, 'created', NEW.patient_name,
              to_char(NEW.date, 'MM/DD') || ' ' || fmt_min(NEW.start_min)
              || coalesce(' / ' || (select name from staff where id = NEW.staff_id), ''));
    return NEW;
  end if;

  if TG_OP = 'UPDATE' then
    if NEW.status = 'cancelled' and OLD.status <> 'cancelled' then
      insert into appointment_logs(appointment_id, action, patient_name, detail)
        values (NEW.id, 'cancelled', NEW.patient_name,
                to_char(OLD.date, 'MM/DD') || ' ' || fmt_min(OLD.start_min));
      return NEW;
    end if;

    if NEW.date <> OLD.date or NEW.start_min <> OLD.start_min then
      d := to_char(OLD.date, 'MM/DD') || ' ' || fmt_min(OLD.start_min)
           || ' → ' || to_char(NEW.date, 'MM/DD') || ' ' || fmt_min(NEW.start_min);
    end if;
    if coalesce(NEW.staff_id::text, '') <> coalesce(OLD.staff_id::text, '') then
      d := d || case when d <> '' then ' / ' else '' end
           || '担当 ' || coalesce((select name from staff where id = OLD.staff_id), '-')
           || '→' || coalesce((select name from staff where id = NEW.staff_id), '-');
    end if;
    if d <> '' then
      insert into appointment_logs(appointment_id, action, patient_name, detail)
        values (NEW.id, 'moved', NEW.patient_name, d);
    end if;
  end if;
  return NEW;
end; $$;

drop trigger if exists trg_appointment_log on public.appointments;
create trigger trg_appointment_log
  after insert or update on public.appointments
  for each row execute function public.log_appointment_change();
