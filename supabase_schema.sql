-- ============================================================
-- EduBranch (managementBranch) — Supabase schema
-- Chạy toàn bộ file này trong Supabase SQL Editor.
--
-- 2 vai trò:
--   admin   : đăng ký trực tiếp trên app (signUp) — tạo chi nhánh, môn học,
--             tài khoản giáo viên (qua Edge Function create-teacher),
--             chốt lương, xếp lịch.
--   teacher : tài khoản do admin cấp — xem lịch của mình, bấm Vào ca /
--             Xong ca, sửa hồ sơ cá nhân. Ca quá ngày chưa "Xong ca"
--             = hôm đó không dạy (suy ra khi đọc, không lưu DB).
--
-- LƯU Ý: tắt "Confirm email" trong Authentication > Sign In / Up —
-- app cần có session ngay sau signUp.
-- ============================================================

-- ============================================================
-- 1. PROFILES — gắn 1-1 với auth.users
-- ============================================================
create table if not exists profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  role       text not null default 'admin' check (role in ('admin','teacher')),
  full_name  text not null default '',
  phone      text,
  email      text,                -- copy từ auth.users để hiển thị
  branch_id  uuid,                -- FK thêm sau khi có branches (teacher mới có)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Vá cho DB đã tạo bảng từ bản schema cũ (chưa có cột email):
-- create table if not exists KHÔNG thêm cột mới vào bảng có sẵn.
alter table profiles add column if not exists email text;
update profiles p set email = u.email
  from auth.users u where u.id = p.id and p.email is null;

-- ============================================================
-- 2. BRANCHES — chi nhánh, admin tạo và sở hữu
-- ============================================================
create table if not exists branches (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  address        text,
  phone          text,
  owner_admin_id uuid not null references profiles(id) on delete cascade,
  created_at     timestamptz not null default now()
);

-- Vá cho DB đã tạo bảng từ bản cũ (create table if not exists không thêm cột mới)
alter table branches add column if not exists phone text;

alter table profiles drop constraint if exists profiles_branch_fk;
alter table profiles
  add constraint profiles_branch_fk
  foreign key (branch_id) references branches(id) on delete set null;

-- Một giáo viên có thể dạy tại nhiều chi nhánh. profiles.branch_id được giữ
-- làm chi nhánh chính để tương thích dữ liệu và app_metadata cũ.
create table if not exists teacher_branches (
  teacher_id uuid not null references profiles(id) on delete cascade,
  branch_id  uuid not null references branches(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (teacher_id, branch_id)
);

-- Tự chuyển dữ liệu một-chi-nhánh cũ sang bảng liên kết.
insert into teacher_branches (teacher_id, branch_id)
select id, branch_id from profiles
where role = 'teacher' and branch_id is not null
on conflict do nothing;

-- ============================================================
-- 3. SUBJECTS — môn học thuộc chi nhánh
-- ============================================================
create table if not exists subjects (
  id         uuid primary key default gen_random_uuid(),
  branch_id  uuid not null references branches(id) on delete cascade,
  name       text not null,
  fee        numeric(12,0),      -- học phí của môn (đ), null = chưa khai
  created_at timestamptz not null default now(),
  unique (branch_id, name)
);

-- Vá cho DB đã tạo bảng từ bản cũ
alter table subjects add column if not exists fee numeric(12,0);

-- ============================================================
-- 4. TEACHER_SALARIES — lịch sử chốt lương (mỗi lần chốt 1 dòng)
--    salary_type: fixed (cố định/tháng) | per_session (theo tiết)
--                 | mixed (cả hai)
-- ============================================================
create table if not exists teacher_salaries (
  id                 uuid primary key default gen_random_uuid(),
  teacher_id         uuid not null references profiles(id) on delete cascade,
  salary_type        text not null check (salary_type in ('fixed','per_session','mixed')),
  base_salary        numeric(12,0),
  per_session_amount numeric(12,0),
  effective_from     date not null,
  note               text,
  created_at         timestamptz not null default now(),
  constraint salary_amounts_check check (
    (salary_type = 'fixed'       and base_salary is not null) or
    (salary_type = 'per_session' and per_session_amount is not null) or
    (salary_type = 'mixed'       and base_salary is not null and per_session_amount is not null)
  ),
  unique (teacher_id, effective_from)
);

-- Phụ cấp/khấu trừ là dữ liệu riêng theo từng tháng, không thuộc lịch sử mức lương.
create table if not exists monthly_salary_adjustments (
  teacher_id       uuid not null references profiles(id) on delete cascade,
  adjustment_month date not null,
  allowance        numeric(12,0) not null default 0 check (allowance >= 0),
  deduction        numeric(12,0) not null default 0 check (deduction >= 0),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  primary key (teacher_id, adjustment_month),
  constraint adjustment_month_first_day check (
    adjustment_month = date_trunc('month', adjustment_month)::date
  )
);

-- Nếu đã chạy bản schema cũ có 2 cột trên teacher_salaries, chuyển dữ liệu
-- gần nhất của từng tháng sang bảng mới trước khi bỏ cột cũ.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'teacher_salaries' and column_name = 'allowance'
  ) and exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'teacher_salaries' and column_name = 'deduction'
  ) then
    insert into monthly_salary_adjustments (teacher_id, adjustment_month, allowance, deduction)
    select distinct on (teacher_id, date_trunc('month', effective_from))
           teacher_id, date_trunc('month', effective_from)::date,
           coalesce(allowance, 0), coalesce(deduction, 0)
    from teacher_salaries
    where coalesce(allowance, 0) <> 0 or coalesce(deduction, 0) <> 0
    order by teacher_id, date_trunc('month', effective_from), effective_from desc
    on conflict (teacher_id, adjustment_month) do update
      set allowance = excluded.allowance,
          deduction = excluded.deduction,
          updated_at = now();
  end if;
end $$;

alter table teacher_salaries drop constraint if exists salary_adjustments_check;
alter table teacher_salaries drop column if exists allowance;
alter table teacher_salaries drop column if exists deduction;

-- ============================================================
-- 5. SCHEDULES — lịch dạy theo NGÀY CỤ THỂ + trạng thái ca
--    scheduled -> in_progress (Vào ca) -> completed (Xong ca)
-- ============================================================
create table if not exists schedules (
  id            uuid primary key default gen_random_uuid(),
  branch_id     uuid not null references branches(id) on delete cascade,
  teacher_id    uuid not null references profiles(id) on delete cascade,
  subject_id    uuid not null references subjects(id),
  sched_date    date not null,
  start_time    time not null,
  end_time      time not null,
  note          text,
  status        text not null default 'scheduled'
                check (status in ('scheduled','in_progress','completed')),
  checked_in_at timestamptz,
  completed_at  timestamptz,
  created_at    timestamptz not null default now(),
  constraint sched_time_check check (end_time > start_time),
  unique (teacher_id, sched_date, start_time)
);

-- ============================================================
-- 5B. SCHEDULE_NOTICE_ACKNOWLEDGEMENTS — giáo viên xác nhận đã
--     đọc nhắc lịch theo ngày, đồng bộ trên mọi trình duyệt/thiết bị
-- ============================================================
create table if not exists schedule_notice_acknowledgements (
  teacher_id     uuid not null references profiles(id) on delete cascade,
  notice_date    date not null,
  acknowledged_at timestamptz not null default now(),
  primary key (teacher_id, notice_date)
);

create index if not exists schedules_teacher_date_idx on schedules (teacher_id, sched_date);
create index if not exists schedules_branch_date_idx  on schedules (branch_id, sched_date);
create index if not exists profiles_branch_idx        on profiles (branch_id);
create index if not exists teacher_branches_branch_idx on teacher_branches (branch_id, teacher_id);
create index if not exists salaries_teacher_idx       on teacher_salaries (teacher_id, effective_from desc);
create index if not exists salary_adjustments_month_idx on monthly_salary_adjustments (adjustment_month, teacher_id);

-- ============================================================
-- 6. TRIGGER: tự tạo profile khi có auth user mới
--    role/branch_id đọc từ app_metadata (chỉ service role đặt được —
--    client tự signUp KHÔNG thể tự phong teacher/gán chi nhánh),
--    full_name/phone đọc từ user_metadata (vô hại).
-- ============================================================
create or replace function handle_new_user()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_role   text := coalesce(new.raw_app_meta_data->>'role', 'admin');
  v_branch uuid := nullif(new.raw_app_meta_data->>'branch_id', '')::uuid;
begin
  if v_role not in ('admin','teacher') then
    v_role := 'admin';
  end if;
  insert into profiles (id, role, full_name, phone, email, branch_id)
  values (
    new.id,
    v_role,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    new.raw_user_meta_data->>'phone',
    new.email,
    case when v_role = 'teacher' then v_branch else null end
  );
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- Liên kết chi nhánh được Edge Function/client ghi tường minh. Trigger cũ từng tự chèn
-- chi nhánh chính trước Edge Function, khiến lần chèn danh sách ngay sau đó bị trùng khóa chính.
drop trigger if exists sync_primary_teacher_branch_trg on profiles;
drop function if exists sync_primary_teacher_branch();

-- Quyền để trigger chạy được khi service Auth (supabase_auth_admin) insert
-- user mới — thiếu 2 grant này sẽ gặp "Database error saving new user" (500).
grant usage on schema public to supabase_auth_admin;
grant execute on function handle_new_user() to supabase_auth_admin;
grant all on table profiles to supabase_auth_admin;

-- ============================================================
-- 7. HELPERS cho RLS (security definer để tránh RLS đệ quy)
-- ============================================================
create or replace function my_role() returns text
language sql stable security definer set search_path = public as
$$ select role from profiles where id = auth.uid() $$;

create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as
$$ select coalesce((select role from profiles where id = auth.uid()) = 'admin', false) $$;

create or replace function my_branch() returns uuid
language sql stable security definer set search_path = public as
$$ select branch_id from profiles where id = auth.uid() $$;

-- Giáo viên hiện tại có được phân công tại chi nhánh này không?
create or replace function teacher_has_branch(b uuid) returns boolean
language sql stable security definer set search_path = public as
$$ select exists(
     select 1 from teacher_branches tb
     where tb.teacher_id = auth.uid() and tb.branch_id = b
   ) $$;

-- Admin có sở hữu chi nhánh này không?
create or replace function owns_branch(b uuid) returns boolean
language sql stable security definer set search_path = public as
$$ select exists(select 1 from branches where id = b and owner_admin_id = auth.uid()) $$;

-- Admin có quản lý giáo viên này không (GV thuộc chi nhánh mình sở hữu)?
create or replace function owns_teacher(t uuid) returns boolean
language sql stable security definer set search_path = public as
$$ select exists(
     select 1 from profiles p
     join teacher_branches tb on tb.teacher_id = p.id
     join branches b on b.id = tb.branch_id
     where p.id = t and p.role = 'teacher' and b.owner_admin_id = auth.uid()
   ) $$;

-- ============================================================
-- 8. TRIGGER bảo vệ profiles: không ai đổi được role/email qua API;
--    giáo viên không tự đổi được chi nhánh của mình.
--    (service role bỏ qua RLS nhưng trigger vẫn chạy — auth.uid() null
--     được coi là service role, cho phép giữ nguyên giá trị mới)
-- ============================================================
create or replace function protect_profile_fields()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null then
    new.role  := old.role;
    new.email := old.email;
    if not is_admin() then
      new.branch_id := old.branch_id;   -- GV không tự chuyển chi nhánh
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists protect_profile_fields_trg on profiles;
create trigger protect_profile_fields_trg
  before update on profiles
  for each row execute function protect_profile_fields();

-- ============================================================
-- 9. TRIGGER kiểm tra dữ liệu lịch: GV và môn học phải thuộc
--    đúng chi nhánh của ca dạy
-- ============================================================
create or replace function validate_schedule()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1 from profiles p
    join teacher_branches tb on tb.teacher_id = p.id
    where p.id = new.teacher_id and p.role = 'teacher' and tb.branch_id = new.branch_id
  ) then
    raise exception 'Giáo viên không thuộc chi nhánh này';
  end if;
  if not exists (
    select 1 from subjects s
    where s.id = new.subject_id and s.branch_id = new.branch_id
  ) then
    raise exception 'Môn học không thuộc chi nhánh này';
  end if;
  return new;
end $$;

drop trigger if exists validate_schedule_trg on schedules;
create trigger validate_schedule_trg
  before insert or update of teacher_id, subject_id, branch_id on schedules
  for each row execute function validate_schedule();

-- ============================================================
-- 10. RLS
-- ============================================================
alter table profiles         enable row level security;
alter table branches         enable row level security;
alter table subjects         enable row level security;
alter table teacher_salaries enable row level security;
alter table monthly_salary_adjustments enable row level security;
alter table schedules        enable row level security;
alter table teacher_branches enable row level security;
alter table schedule_notice_acknowledgements enable row level security;

-- PROFILES ---------------------------------------------------
drop policy if exists "profiles read"  on profiles;
drop policy if exists "profiles update self" on profiles;
drop policy if exists "profiles admin update" on profiles;

-- đọc: chính mình + admin đọc GV thuộc chi nhánh mình
create policy "profiles read" on profiles for select
  using (id = auth.uid() or owns_teacher(id));

-- tự sửa hồ sơ (trigger protect_profile_fields chặn đổi role/branch)
create policy "profiles update self" on profiles for update
  using (id = auth.uid()) with check (id = auth.uid());

-- admin sửa GV trong chi nhánh mình (kể cả chuyển sang chi nhánh khác của mình)
create policy "profiles admin update" on profiles for update
  using (owns_teacher(id)) with check (role = 'teacher' and owns_branch(branch_id));

-- insert/delete profiles: chỉ Edge Function (service role) + trigger — không có policy

-- BRANCHES ---------------------------------------------------
drop policy if exists "branches insert" on branches;
drop policy if exists "branches read"   on branches;
drop policy if exists "branches update" on branches;
drop policy if exists "branches delete" on branches;

create policy "branches insert" on branches for insert
  with check (is_admin() and owner_admin_id = auth.uid());
create policy "branches read" on branches for select
  using (owner_admin_id = auth.uid() or teacher_has_branch(id));
create policy "branches update" on branches for update
  using (owner_admin_id = auth.uid());
create policy "branches delete" on branches for delete
  using (owner_admin_id = auth.uid());

-- SUBJECTS ---------------------------------------------------
drop policy if exists "subjects read"  on subjects;
drop policy if exists "subjects write" on subjects;

create policy "subjects read" on subjects for select
  using (owns_branch(branch_id) or teacher_has_branch(branch_id));
create policy "subjects write" on subjects for all
  using (owns_branch(branch_id)) with check (owns_branch(branch_id));

-- TEACHER_SALARIES -------------------------------------------
drop policy if exists "salaries teacher read" on teacher_salaries;
drop policy if exists "salaries admin all"    on teacher_salaries;

create policy "salaries teacher read" on teacher_salaries for select
  using (teacher_id = auth.uid());
create policy "salaries admin all" on teacher_salaries for all
  using (owns_teacher(teacher_id)) with check (owns_teacher(teacher_id));

-- MONTHLY_SALARY_ADJUSTMENTS ---------------------------------
drop policy if exists "adjustments teacher read" on monthly_salary_adjustments;
drop policy if exists "adjustments admin all" on monthly_salary_adjustments;

create policy "adjustments teacher read" on monthly_salary_adjustments for select
  using (teacher_id = auth.uid());
create policy "adjustments admin all" on monthly_salary_adjustments for all
  using (owns_teacher(teacher_id)) with check (owns_teacher(teacher_id));

-- SCHEDULES --------------------------------------------------
-- Giáo viên chỉ ĐỌC lịch của mình; đổi trạng thái qua RPC bên dưới
-- (không có policy update cho GV → không sửa được giờ/ngày/lịch người khác).
drop policy if exists "schedules teacher read" on schedules;
drop policy if exists "schedules admin all"    on schedules;

create policy "schedules teacher read" on schedules for select
  using (teacher_id = auth.uid());
create policy "schedules admin all" on schedules for all
  using (owns_branch(branch_id)) with check (owns_branch(branch_id));

-- TEACHER_BRANCHES -------------------------------------------
drop policy if exists "teacher branches read" on teacher_branches;
drop policy if exists "teacher branches admin insert" on teacher_branches;
drop policy if exists "teacher branches admin delete" on teacher_branches;

create policy "teacher branches read" on teacher_branches for select
  using (teacher_id = auth.uid() or owns_branch(branch_id));
create policy "teacher branches admin insert" on teacher_branches for insert
  with check (owns_branch(branch_id) and owns_teacher(teacher_id));
create policy "teacher branches admin delete" on teacher_branches for delete
  using (owns_branch(branch_id));

-- SCHEDULE NOTICE ACKNOWLEDGEMENTS ---------------------------
-- Giáo viên chỉ đọc và tạo xác nhận của chính mình. Admin không cần
-- truy cập bảng này vì đây là trạng thái UI cá nhân của giáo viên.
drop policy if exists "schedule notice teacher read" on schedule_notice_acknowledgements;
drop policy if exists "schedule notice teacher insert" on schedule_notice_acknowledgements;

create policy "schedule notice teacher read" on schedule_notice_acknowledgements for select
  using (teacher_id = auth.uid());
create policy "schedule notice teacher insert" on schedule_notice_acknowledgements for insert
  with check (teacher_id = auth.uid());

-- ============================================================
-- 11. RPC: Vào ca / Xong ca (security definer — bỏ qua việc GV
--     không có quyền update, nhưng tự kiểm tra chặt trong thân hàm)
-- ============================================================
create or replace function check_in_schedule(p_schedule_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  update schedules
     set status = 'in_progress', checked_in_at = now()
   where id = p_schedule_id
     and teacher_id = auth.uid()
     and status = 'scheduled'
     -- current_date của server là UTC — phải so theo giờ Việt Nam,
     -- không thì sau 17h VN (0h UTC hôm sau) / trước 7h VN sẽ lệch ngày
     and sched_date = (now() at time zone 'Asia/Ho_Chi_Minh')::date;
  if not found then
    raise exception 'Không thể vào ca: chỉ vào được ca của bạn, đúng ngày hôm nay và chưa vào ca.';
  end if;
end $$;

create or replace function complete_schedule(p_schedule_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  update schedules
     set status = 'completed', completed_at = now()
   where id = p_schedule_id
     and teacher_id = auth.uid()
     and status = 'in_progress';
  if not found then
    raise exception 'Không thể kết thúc ca: phải bấm Vào ca trước.';
  end if;
end $$;

-- ============================================================
-- 12. RPC tính lương tháng (tham khảo — client cũng tự tính từ cache):
--     fixed/mixed chia lương tháng theo ca xếp × ca completed;
--     per_session/mixed cộng đơn giá × ca completed; cuối cùng cộng
--     phụ cấp và trừ khấu trừ. Mức lương lấy lần chốt gần nhất.
-- ============================================================
drop function if exists calc_teacher_salary(uuid, int, int);
create function calc_teacher_salary(p_teacher_id uuid, p_month int, p_year int)
returns table (salary_type text, base_salary numeric, per_session_amount numeric,
               sessions_assigned bigint, sessions_completed bigint,
               base_earned numeric, session_earned numeric,
               allowance numeric, deduction numeric, total numeric)
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is distinct from p_teacher_id and not owns_teacher(p_teacher_id) then
    raise exception 'Bạn không có quyền xem lương của giáo viên này';
  end if;
  return query
  with rate as (
    select ts.salary_type, ts.base_salary, ts.per_session_amount
    from teacher_salaries ts
    where ts.teacher_id = p_teacher_id
      and ts.effective_from <= (make_date(p_year, p_month, 1) + interval '1 month - 1 day')::date
    order by ts.effective_from desc limit 1
  ),
  stats as (
    select count(*) as assigned,
           count(*) filter (where s.status = 'completed') as completed
    from schedules s
    where s.teacher_id = p_teacher_id
      and extract(month from s.sched_date) = p_month
      and extract(year  from s.sched_date) = p_year
  ),
  adjustments as (
    select msa.allowance, msa.deduction
    from monthly_salary_adjustments msa
    where msa.teacher_id = p_teacher_id
      and msa.adjustment_month = make_date(p_year, p_month, 1)
  )
  select r.salary_type, r.base_salary, r.per_session_amount,
         s.assigned, s.completed,
         coalesce(case when r.salary_type in ('fixed','mixed') and s.assigned > 0
                       then r.base_salary * s.completed / s.assigned end, 0) as base_earned,
         coalesce(case when r.salary_type in ('per_session','mixed')
                       then r.per_session_amount * s.completed end, 0) as session_earned,
         coalesce(a.allowance, 0), coalesce(a.deduction, 0),
         coalesce(case when r.salary_type in ('fixed','mixed') and s.assigned > 0
                       then r.base_salary * s.completed / s.assigned end, 0)
       + coalesce(case when r.salary_type in ('per_session','mixed')
                       then r.per_session_amount * s.completed end, 0)
       + coalesce(a.allowance, 0) - coalesce(a.deduction, 0)
  from rate r cross join stats s left join adjustments a on true;
end $$;

-- ============================================================
-- ROLLBACK (bỏ comment để xóa toàn bộ schema — CẨN THẬN: mất dữ liệu)
-- ============================================================
-- drop function if exists calc_teacher_salary(uuid, int, int);
-- drop function if exists complete_schedule(uuid);
-- drop function if exists check_in_schedule(uuid);
-- drop trigger if exists validate_schedule_trg on schedules;
-- drop function if exists validate_schedule();
-- drop trigger if exists protect_profile_fields_trg on profiles;
-- drop function if exists protect_profile_fields();
-- drop function if exists owns_teacher(uuid);
-- drop function if exists owns_branch(uuid);
-- drop function if exists my_branch();
-- drop function if exists teacher_has_branch(uuid);
-- drop function if exists is_admin();
-- drop function if exists my_role();
-- drop trigger if exists on_auth_user_created on auth.users;
-- drop function if exists handle_new_user();
-- drop table if exists schedule_notice_acknowledgements;
-- drop table if exists schedules;
-- drop table if exists monthly_salary_adjustments;
-- drop table if exists teacher_salaries;
-- drop table if exists subjects;
-- drop table if exists teacher_branches;
-- drop table if exists branches;
-- drop table if exists profiles;
