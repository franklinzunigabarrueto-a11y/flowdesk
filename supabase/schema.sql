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
  color text default null,
  google_event_id text,
  whatsapp_message_id text,
  reminder_minutes integer default 60,
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

-- Tabla de proyectos
create table if not exists public.projects (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users(id) on delete cascade,
  name        text not null,
  description text,
  start_date  date,
  end_date    date,
  status      text not null default 'active' check (status in ('active','completed','paused')),
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- Tabla de partidas/sub-partidas del proyecto
create table if not exists public.project_tasks (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.projects(id) on delete cascade,
  parent_id     uuid references public.project_tasks(id) on delete cascade,
  name          text not null,
  wbs           text,
  outline_level integer not null default 1,
  start_date    date,
  end_date      date,
  progress      integer not null default 0 check (progress >= 0 and progress <= 100),
  status        text not null default 'pending' check (status in ('pending','in_progress','completed')),
  is_summary    boolean not null default false,
  sort_order    integer not null default 0,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

alter table public.projects      enable row level security;
alter table public.project_tasks enable row level security;

create policy "Projects: full access own data" on public.projects
  for all using (auth.uid() = user_id);

create policy "Project tasks: full access via project" on public.project_tasks
  for all using (
    exists (select 1 from public.projects where id = project_id and user_id = auth.uid())
  );

-- Tabla para evitar recordatorios duplicados
create table if not exists public.reminder_logs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users(id) on delete cascade,
  entity_type text not null check (entity_type in ('event', 'task')),
  entity_id   uuid not null,
  sent_at     timestamptz not null default now(),
  constraint reminder_logs_unique unique (entity_type, entity_id)
);

alter table public.reminder_logs enable row level security;

create policy "Users can view own reminder logs" on public.reminder_logs
  for select using (auth.uid() = user_id);

-- Índices para rendimiento
create index if not exists idx_tasks_user_id on public.tasks(user_id);
create index if not exists idx_tasks_status on public.tasks(user_id, status);
create index if not exists idx_diary_user_date on public.diary_entries(user_id, entry_date);
create index if not exists idx_events_user_time on public.calendar_events(user_id, start_time);
create index if not exists idx_users_whatsapp on public.users(whatsapp_number);
create index if not exists idx_reminder_logs_entity on public.reminder_logs(entity_type, entity_id);


-- =============================================
-- SUBMÓDULO CRONOGRAMA (migración 2026-06-01)
-- =============================================

-- Extensión de project_tasks para cronograma tipo MS Project
alter table public.project_tasks
  add column if not exists duracion             integer,
  add column if not exists pct_avance_propuesto integer not null default 0
    constraint pct_propuesto_range check (pct_avance_propuesto between 0 and 100),
  add column if not exists pct_avance_aprobado  integer not null default 0
    constraint pct_aprobado_range  check (pct_avance_aprobado  between 0 and 100),
  add column if not exists es_hito              boolean not null default false,
  add column if not exists en_ruta_critica      boolean not null default false;

alter table public.project_tasks drop constraint if exists project_tasks_status_check;
alter table public.project_tasks add constraint project_tasks_status_check
  check (status in ('pending','in_progress','completed','in_review','approved','rejected'));

-- Dependencias (FS/SS/FF/SF)
create table if not exists public.schedule_dependencies (
  id             uuid        primary key default gen_random_uuid(),
  predecesora_id uuid        not null references public.project_tasks(id) on delete cascade,
  sucesora_id    uuid        not null references public.project_tasks(id) on delete cascade,
  tipo           text        not null default 'FS' check (tipo in ('FS','SS','FF','SF')),
  lag            integer     not null default 0,
  created_at     timestamptz default now(),
  constraint dep_no_self check (predecesora_id <> sucesora_id),
  constraint dep_unique   unique (predecesora_id, sucesora_id)
);

-- Recursos (persona/equipo/material)
create table if not exists public.schedule_resources (
  id             uuid           primary key default gen_random_uuid(),
  project_id     uuid           not null references public.projects(id) on delete cascade,
  nombre         text           not null,
  tipo           text           not null check (tipo in ('persona','equipo','material')),
  costo_unitario numeric(14,2)  not null default 0,
  created_at     timestamptz    default now(),
  updated_at     timestamptz    default now()
);

-- Asignaciones tarea ↔ recurso o usuario
create table if not exists public.schedule_assignments (
  id          uuid          primary key default gen_random_uuid(),
  task_id     uuid          not null references public.project_tasks(id) on delete cascade,
  resource_id uuid          references public.schedule_resources(id) on delete set null,
  user_id     uuid          references public.users(id)              on delete set null,
  unidades    numeric(8,2)  not null default 1,
  costo       numeric(14,2),
  created_at  timestamptz   default now(),
  constraint assignment_has_assignee check (resource_id is not null or user_id is not null)
);

-- Baselines (snapshots JSON del cronograma)
create table if not exists public.schedule_baselines (
  id             uuid        primary key default gen_random_uuid(),
  project_id     uuid        not null references public.projects(id) on delete cascade,
  nombre         text        not null default 'Línea base',
  snapshot       jsonb       not null default '{}',
  fecha_creacion timestamptz default now()
);

-- Log de aprobación
create table if not exists public.schedule_approval_logs (
  id         uuid        primary key default gen_random_uuid(),
  task_id    uuid        not null references public.project_tasks(id) on delete cascade,
  user_id    uuid        not null references public.users(id)         on delete cascade,
  accion     text        not null check (accion in ('reporta','aprueba','rechaza')),
  comentario text,
  created_at timestamptz default now()
);

-- RLS
alter table public.schedule_dependencies  enable row level security;
alter table public.schedule_resources     enable row level security;
alter table public.schedule_assignments   enable row level security;
alter table public.schedule_baselines     enable row level security;
alter table public.schedule_approval_logs enable row level security;

create policy "schedule_deps_owner" on public.schedule_dependencies for all using (
  exists (select 1 from public.project_tasks pt join public.projects p on p.id = pt.project_id
          where pt.id = predecesora_id and p.user_id = auth.uid())
);
create policy "schedule_resources_owner" on public.schedule_resources for all using (
  exists (select 1 from public.projects where id = project_id and user_id = auth.uid())
);
create policy "schedule_assignments_owner" on public.schedule_assignments for all using (
  exists (select 1 from public.project_tasks pt join public.projects p on p.id = pt.project_id
          where pt.id = task_id and p.user_id = auth.uid())
);
create policy "schedule_baselines_owner" on public.schedule_baselines for all using (
  exists (select 1 from public.projects where id = project_id and user_id = auth.uid())
);
create policy "schedule_approval_owner" on public.schedule_approval_logs for all using (
  user_id = auth.uid()
  or exists (select 1 from public.project_tasks pt join public.projects p on p.id = pt.project_id
             where pt.id = task_id and p.user_id = auth.uid())
);

-- Índices cronograma
create index if not exists idx_pt_project_order   on public.project_tasks(project_id, sort_order);
create index if not exists idx_pt_parent          on public.project_tasks(parent_id);
create index if not exists idx_pt_status          on public.project_tasks(project_id, status);
create index if not exists idx_pt_ruta_critica    on public.project_tasks(project_id, en_ruta_critica) where en_ruta_critica = true;
create index if not exists idx_pt_hito            on public.project_tasks(project_id, es_hito) where es_hito = true;
create index if not exists idx_dep_predecesora    on public.schedule_dependencies(predecesora_id);
create index if not exists idx_dep_sucesora       on public.schedule_dependencies(sucesora_id);
create index if not exists idx_resources_project  on public.schedule_resources(project_id);
create index if not exists idx_assign_task        on public.schedule_assignments(task_id);
create index if not exists idx_assign_resource    on public.schedule_assignments(resource_id);
create index if not exists idx_assign_user        on public.schedule_assignments(user_id);
create index if not exists idx_baselines_project  on public.schedule_baselines(project_id, fecha_creacion desc);
create index if not exists idx_approval_task      on public.schedule_approval_logs(task_id, created_at desc);
create index if not exists idx_approval_user      on public.schedule_approval_logs(user_id);
