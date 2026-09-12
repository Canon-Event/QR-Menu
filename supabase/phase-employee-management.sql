create table if not exists departments (
  id uuid primary key default gen_random_uuid(), restaurant_id uuid not null references restaurants(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80), created_at timestamptz not null default now(), unique (restaurant_id, name)
);
create table if not exists outlets (id uuid primary key default gen_random_uuid(),restaurant_id uuid not null references restaurants(id) on delete cascade,name text not null check(char_length(name) between 1 and 100),address text,is_active boolean not null default true,created_at timestamptz not null default now(),unique(restaurant_id,name));
create table if not exists employees (
  id uuid primary key default gen_random_uuid(), restaurant_id uuid not null references restaurants(id) on delete cascade,
  department_id uuid references departments(id) on delete set null, outlet_id uuid references outlets(id) on delete set null, employee_code text not null,
  full_name text not null check (char_length(full_name) between 2 and 120), email text, phone text, role text not null,
  shift text not null default 'Morning' check (shift in ('Morning','Evening','Night','Flexible')),
  status text not null default 'active' check (status in ('active','inactive','on_leave')),
  photo_path text,
  emergency_contact_name text, emergency_contact_phone text,
  employment_type text not null default 'full_time' check (employment_type in ('full_time','part_time','contract','intern')),
  monthly_salary numeric(12,2) not null default 0 check (monthly_salary >= 0),
  portal_token uuid not null default gen_random_uuid() unique,
  date_of_birth date, joined_on date not null default current_date, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (restaurant_id, employee_code)
);
create table if not exists attendance (
  id uuid primary key default gen_random_uuid(), restaurant_id uuid not null references restaurants(id) on delete cascade,
  employee_id uuid not null references employees(id) on delete cascade, attendance_date date not null,
  status text not null check (status in ('present','absent','late','half_day','leave')),
  check_in time, check_out time, note text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique (employee_id, attendance_date)
);
create table if not exists leave_requests (
  id uuid primary key default gen_random_uuid(), restaurant_id uuid not null references restaurants(id) on delete cascade,
  employee_id uuid not null references employees(id) on delete cascade, leave_type text not null check (leave_type in ('annual','sick','casual','unpaid')),
  starts_on date not null, ends_on date not null, reason text, status text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at timestamptz not null default now(), decided_at timestamptz, check (ends_on >= starts_on)
);
alter table employees add column if not exists photo_path text;
alter table employees add column if not exists portal_token uuid default gen_random_uuid();
alter table employees add column if not exists outlet_id uuid references outlets(id) on delete set null;
alter table employees add column if not exists emergency_contact_name text;
alter table employees add column if not exists emergency_contact_phone text;
alter table employees add column if not exists employment_type text not null default 'full_time';
alter table employees add column if not exists monthly_salary numeric(12,2) not null default 0;
update employees set portal_token=gen_random_uuid() where portal_token is null;
alter table employees alter column portal_token set not null;
create unique index if not exists employees_portal_token_idx on employees (portal_token);
alter table departments enable row level security; alter table outlets enable row level security; alter table employees enable row level security; alter table attendance enable row level security; alter table leave_requests enable row level security;
drop policy if exists "owner_outlets" on outlets; create policy "owner_outlets" on outlets for all using (restaurant_id in (select id from restaurants where owner_id = auth.uid())) with check (restaurant_id in (select id from restaurants where owner_id = auth.uid()));
drop policy if exists "owner_departments" on departments; create policy "owner_departments" on departments for all using (restaurant_id in (select id from restaurants where owner_id = auth.uid())) with check (restaurant_id in (select id from restaurants where owner_id = auth.uid()));
drop policy if exists "owner_employees" on employees; create policy "owner_employees" on employees for all using (restaurant_id in (select id from restaurants where owner_id = auth.uid())) with check (restaurant_id in (select id from restaurants where owner_id = auth.uid()) and (department_id is null or department_id in (select id from departments where restaurant_id in (select id from restaurants where owner_id = auth.uid()))));
drop policy if exists "owner_attendance" on attendance; create policy "owner_attendance" on attendance for all using (restaurant_id in (select id from restaurants where owner_id = auth.uid())) with check (restaurant_id in (select id from restaurants where owner_id = auth.uid()) and employee_id in (select id from employees where restaurant_id in (select id from restaurants where owner_id = auth.uid())));
drop policy if exists "owner_leave_requests" on leave_requests; create policy "owner_leave_requests" on leave_requests for all using (restaurant_id in (select id from restaurants where owner_id = auth.uid())) with check (restaurant_id in (select id from restaurants where owner_id = auth.uid()) and employee_id in (select id from employees where restaurant_id in (select id from restaurants where owner_id = auth.uid())));
create index if not exists employees_restaurant_status_idx on employees (restaurant_id, status); create index if not exists employees_department_idx on employees (department_id);
create index if not exists attendance_restaurant_date_idx on attendance (restaurant_id, attendance_date desc); create index if not exists attendance_employee_date_idx on attendance (employee_id, attendance_date desc);
create index if not exists leave_restaurant_status_idx on leave_requests (restaurant_id, status, starts_on);

-- Workforce operations extensions.
alter table attendance add column if not exists overtime_minutes integer not null default 0 check (overtime_minutes >= 0);
alter table attendance add column if not exists correction_note text;
alter table attendance add column if not exists corrected_at timestamptz;
alter table leave_requests add column if not exists manager_note text;
alter table leave_requests add column if not exists decided_by uuid references auth.users(id);
create table if not exists leave_balances (
  id uuid primary key default gen_random_uuid(), restaurant_id uuid not null references restaurants(id) on delete cascade,
  employee_id uuid not null references employees(id) on delete cascade, leave_type text not null check (leave_type in ('annual','sick','casual','unpaid')),
  entitlement numeric(6,2) not null default 0 check (entitlement >= 0), used_days numeric(6,2) not null default 0 check (used_days >= 0),
  year integer not null check (year between 2020 and 2100), unique(employee_id, leave_type, year)
);
create table if not exists performance_reviews (
  id uuid primary key default gen_random_uuid(), restaurant_id uuid not null references restaurants(id) on delete cascade,
  employee_id uuid not null references employees(id) on delete cascade, review_date date not null default current_date,
  punctuality smallint not null check (punctuality between 1 and 5), task_completion smallint not null check (task_completion between 1 and 5),
  guest_feedback smallint not null check (guest_feedback between 1 and 5), manager_rating smallint not null check (manager_rating between 1 and 5),
  notes text, created_by uuid references auth.users(id), created_at timestamptz not null default now()
);
alter table leave_balances enable row level security; alter table performance_reviews enable row level security;
drop policy if exists "owner_leave_balances" on leave_balances;
create policy "owner_leave_balances" on leave_balances for all using (restaurant_id in (select id from restaurants where owner_id=auth.uid())) with check (restaurant_id in (select id from restaurants where owner_id=auth.uid()));
drop policy if exists "owner_performance_reviews" on performance_reviews;
create policy "owner_performance_reviews" on performance_reviews for all using (restaurant_id in (select id from restaurants where owner_id=auth.uid())) with check (restaurant_id in (select id from restaurants where owner_id=auth.uid()) and employee_id in (select id from employees where restaurant_id in (select id from restaurants where owner_id=auth.uid())));
create index if not exists performance_reviews_employee_date_idx on performance_reviews(employee_id, review_date desc);

-- Payroll, documents and governance.
create table if not exists payroll_runs (id uuid primary key default gen_random_uuid(), restaurant_id uuid not null references restaurants(id) on delete cascade, period_start date not null, period_end date not null, status text not null default 'draft' check(status in ('draft','finalized','paid')), total_amount numeric(12,2) not null default 0, created_by uuid references auth.users(id), created_at timestamptz not null default now(), unique(restaurant_id,period_start,period_end));
create table if not exists payroll_entries (id uuid primary key default gen_random_uuid(), payroll_run_id uuid not null references payroll_runs(id) on delete cascade, employee_id uuid not null references employees(id) on delete cascade, base_salary numeric(12,2) not null default 0, overtime_amount numeric(12,2) not null default 0, deductions numeric(12,2) not null default 0, net_amount numeric(12,2) not null default 0, unique(payroll_run_id,employee_id));
create table if not exists employee_documents (id uuid primary key default gen_random_uuid(), restaurant_id uuid not null references restaurants(id) on delete cascade, employee_id uuid not null references employees(id) on delete cascade, document_type text not null check(char_length(document_type) between 2 and 80), file_path text not null, expires_on date, created_at timestamptz not null default now());
create table if not exists employee_announcements (id uuid primary key default gen_random_uuid(), restaurant_id uuid not null references restaurants(id) on delete cascade, title text not null check(char_length(title) between 2 and 160), message text not null check(char_length(message) between 2 and 2000), published_at timestamptz not null default now(), created_by uuid references auth.users(id));
create table if not exists employee_audit_logs (id bigint generated always as identity primary key, restaurant_id uuid not null references restaurants(id) on delete cascade, actor_id uuid references auth.users(id), action text not null, entity_type text not null, entity_id uuid, metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now());
alter table payroll_runs enable row level security; alter table payroll_entries enable row level security; alter table employee_documents enable row level security; alter table employee_announcements enable row level security; alter table employee_audit_logs enable row level security;
drop policy if exists "owner_payroll_runs" on payroll_runs;
drop policy if exists "owner_payroll_entries" on payroll_entries;
drop policy if exists "owner_employee_documents" on employee_documents;
drop policy if exists "owner_employee_announcements" on employee_announcements;
drop policy if exists "owner_employee_audit_logs" on employee_audit_logs;
create policy "owner_payroll_runs" on payroll_runs for all using(restaurant_id in(select id from restaurants where owner_id=auth.uid())) with check(restaurant_id in(select id from restaurants where owner_id=auth.uid()));
create policy "owner_payroll_entries" on payroll_entries for all using(payroll_run_id in(select id from payroll_runs where restaurant_id in(select id from restaurants where owner_id=auth.uid()))) with check(payroll_run_id in(select id from payroll_runs where restaurant_id in(select id from restaurants where owner_id=auth.uid())));
create policy "owner_employee_documents" on employee_documents for all using(restaurant_id in(select id from restaurants where owner_id=auth.uid())) with check(restaurant_id in(select id from restaurants where owner_id=auth.uid()));
create policy "owner_employee_announcements" on employee_announcements for all using(restaurant_id in(select id from restaurants where owner_id=auth.uid())) with check(restaurant_id in(select id from restaurants where owner_id=auth.uid()));
create policy "owner_employee_audit_logs" on employee_audit_logs for select using(restaurant_id in(select id from restaurants where owner_id=auth.uid()));
create index if not exists employee_audit_logs_restaurant_created_idx on employee_audit_logs(restaurant_id,created_at desc);

-- Customer feedback pool: private feedback first, with optional review link for happy guests.
create table if not exists customer_feedback (
  id uuid primary key default gen_random_uuid(), restaurant_id uuid not null references restaurants(id) on delete cascade,
  rating smallint not null check(rating between 1 and 5), category text not null check(category in ('food','service','ambience','value','other')),
  message text not null check(char_length(message) between 3 and 1500), customer_name text, contact text,
  status text not null default 'new' check(status in ('new','in_progress','resolved','closed')),
  owner_note text, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
alter table customer_feedback enable row level security;
drop policy if exists "owner_customer_feedback" on customer_feedback;
create policy "owner_customer_feedback" on customer_feedback for all using(restaurant_id in(select id from restaurants where owner_id=auth.uid())) with check(restaurant_id in(select id from restaurants where owner_id=auth.uid()));
create index if not exists customer_feedback_restaurant_status_idx on customer_feedback(restaurant_id,status,created_at desc);

-- Payroll PINs are stored as a salted, one-way hash. Never store the PIN itself.
create table if not exists payroll_security (
  restaurant_id uuid primary key references restaurants(id) on delete cascade,
  pin_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table payroll_security enable row level security;
drop policy if exists "owner_payroll_security" on payroll_security;
create policy "owner_payroll_security" on payroll_security for all
using (restaurant_id in (select id from restaurants where owner_id = auth.uid()))
with check (restaurant_id in (select id from restaurants where owner_id = auth.uid()));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('employee-photos', 'employee-photos', false, 3145728, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public=false, file_size_limit=3145728, allowed_mime_types=array['image/jpeg','image/png','image/webp'];

drop policy if exists "owners_read_employee_photos" on storage.objects;
create policy "owners_read_employee_photos" on storage.objects for select to authenticated using (
  bucket_id = 'employee-photos' and (storage.foldername(name))[1] in (select id::text from restaurants where owner_id = auth.uid())
);
