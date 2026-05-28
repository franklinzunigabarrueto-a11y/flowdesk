-- =============================================
-- FlowDesk - Schema de base de datos Supabase
-- =============================================

-- Tabla de perfiles de usuario
create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  name text,
  avatar_url text,
  whatsapp_number text unique,
  onboarding_completed boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Tabla de tareas
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  title text not null,
  description text,
  status text not null default 'pending' check (status in ('pending', 'in_progress', 'completed')),
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high')),
  due_date date,
  completed_at timestamptz,
  whatsapp_message_id text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Tabla de entradas del diario
create table if not exists public.diary_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  content text not null,
  audio_url text,
  entry_date date not null default current_date,
  task_references uuid[],
  whatsapp_message_id text,
  created_at timestamptz default now()
);

-- Tabla de eventos de calendario
create table if not exists public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  title text not null,
  description text,
  start_time timestamptz not null,
  end_time timestamptz,
  color text default '#7c5cfc',
  google_event_id text,
  whatsapp_message_id text,
  created_at timestamptz default now()
);

-- Row Level Security (RLS)
alter table public.users enable row level security;
alter table public.tasks enable row level security;
alter table public.diary_entries enable row level security;
alter table public.calendar_events enable row level security;

-- Políticas RLS: cada usuario solo accede a sus datos
create policy "Users can view own profile" on public.users
  for select using (auth.uid() = id);

create policy "Users can update own profile" on public.users
  for update using (auth.uid() = id);

create policy "Users can insert own profile" on public.users
  for insert with check (auth.uid() = id);

create policy "Tasks: full access own data" on public.tasks
  for all using (auth.uid() = user_id);

create policy "Diary: full access own data" on public.diary_entries
  for all using (auth.uid() = user_id);

create policy "Events: full access own data" on public.calendar_events
  for all using (auth.uid() = user_id);

-- Service role bypass para el webhook de WhatsApp
create policy "Service role can insert diary" on public.diary_entries
  for insert with check (true);

create policy "Service role can insert tasks" on public.tasks
  for insert with check (true);

create policy "Service role can insert events" on public.calendar_events
  for insert with check (true);

-- Resúmenes diarios pre-generados por el cron de las 18:00 h
create table if not exists public.diary_summaries (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.users(id) on delete cascade,
  summary_date date not null,
  summary      text,
  suggestions  jsonb default '[]',
  generated_at timestamptz default now(),
  unique(user_id, summary_date)
);

alter table public.diary_summaries enable row level security;

create policy "Summaries: full access own data" on public.diary_summaries
  for all using (auth.uid() = user_id);

create policy "Service role can write summaries" on public.diary_summaries
  for all with check (true);

-- Índices para rendimiento
create index if not exists idx_tasks_user_id on public.tasks(user_id);
create index if not exists idx_tasks_status on public.tasks(user_id, status);
create index if not exists idx_diary_user_date on public.diary_entries(user_id, entry_date);
create index if not exists idx_events_user_time on public.calendar_events(user_id, start_time);
create index if not exists idx_users_whatsapp on public.users(whatsapp_number);
