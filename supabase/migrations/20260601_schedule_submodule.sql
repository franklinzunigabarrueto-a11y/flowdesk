-- =============================================
-- FlowDesk – Migración: Submódulo Cronograma
-- Fecha: 2026-06-01
-- Extiende project_tasks y agrega entidades de
-- dependencias, recursos, asignaciones, baseline
-- y log de aprobación.
-- =============================================


-- ─────────────────────────────────────────────
-- 1. EXTENDER project_tasks
--    Agrega los campos del cronograma tipo MS Project
--    sin romper los datos existentes.
-- ─────────────────────────────────────────────

ALTER TABLE public.project_tasks
  ADD COLUMN IF NOT EXISTS duracion             integer,          -- días laborales
  ADD COLUMN IF NOT EXISTS pct_avance_propuesto integer NOT NULL DEFAULT 0
    CONSTRAINT pct_propuesto_range CHECK (pct_avance_propuesto BETWEEN 0 AND 100),
  ADD COLUMN IF NOT EXISTS pct_avance_aprobado  integer NOT NULL DEFAULT 0
    CONSTRAINT pct_aprobado_range  CHECK (pct_avance_aprobado  BETWEEN 0 AND 100),
  ADD COLUMN IF NOT EXISTS es_hito              boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS en_ruta_critica      boolean NOT NULL DEFAULT false;

-- Ampliar el CHECK de status para incluir flujo de aprobación
ALTER TABLE public.project_tasks
  DROP CONSTRAINT IF EXISTS project_tasks_status_check;

ALTER TABLE public.project_tasks
  ADD CONSTRAINT project_tasks_status_check
  CHECK (status IN (
    'pending',      -- Pendiente
    'in_progress',  -- En progreso
    'completed',    -- Completada (legado)
    'in_review',    -- En revisión
    'approved',     -- Aprobada
    'rejected'      -- Rechazada
  ));


-- ─────────────────────────────────────────────
-- 2. DEPENDENCIAS entre tareas
--    Soporta FS / SS / FF / SF con lag en días.
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.schedule_dependencies (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  predecesora_id  uuid        NOT NULL REFERENCES public.project_tasks(id) ON DELETE CASCADE,
  sucesora_id     uuid        NOT NULL REFERENCES public.project_tasks(id) ON DELETE CASCADE,
  tipo            text        NOT NULL DEFAULT 'FS'
    CHECK (tipo IN ('FS', 'SS', 'FF', 'SF')),
  lag             integer     NOT NULL DEFAULT 0,  -- positivo = adelanto, negativo = retraso
  created_at      timestamptz DEFAULT now(),

  CONSTRAINT dep_no_self    CHECK (predecesora_id <> sucesora_id),
  CONSTRAINT dep_unique     UNIQUE (predecesora_id, sucesora_id)
);


-- ─────────────────────────────────────────────
-- 3. RECURSOS
--    Personas, equipos o materiales asignables.
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.schedule_resources (
  id              uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      uuid           NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  nombre          text           NOT NULL,
  tipo            text           NOT NULL
    CHECK (tipo IN ('persona', 'equipo', 'material')),
  costo_unitario  numeric(14,2)  NOT NULL DEFAULT 0,
  created_at      timestamptz    DEFAULT now(),
  updated_at      timestamptz    DEFAULT now()
);


-- ─────────────────────────────────────────────
-- 4. ASIGNACIONES
--    Vincula una tarea con un recurso o usuario.
--    Al menos uno de los dos debe estar presente.
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.schedule_assignments (
  id           uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id      uuid           NOT NULL REFERENCES public.project_tasks(id) ON DELETE CASCADE,
  resource_id  uuid           REFERENCES public.schedule_resources(id) ON DELETE SET NULL,
  user_id      uuid           REFERENCES public.users(id)              ON DELETE SET NULL,
  unidades     numeric(8,2)   NOT NULL DEFAULT 1,   -- horas, días, unidades según tipo
  costo        numeric(14,2),                        -- calculado: unidades × costo_unitario
  created_at   timestamptz    DEFAULT now(),

  CONSTRAINT assignment_has_assignee CHECK (
    resource_id IS NOT NULL OR user_id IS NOT NULL
  )
);


-- ─────────────────────────────────────────────
-- 5. BASELINES (líneas base)
--    Snapshot JSON del cronograma en un momento dado.
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.schedule_baselines (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id       uuid        NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  nombre           text        NOT NULL DEFAULT 'Línea base',
  snapshot         jsonb       NOT NULL DEFAULT '{}',
  -- snapshot contiene: { tasks: [...], dependencies: [...], created_by: uuid }
  fecha_creacion   timestamptz DEFAULT now()
);


-- ─────────────────────────────────────────────
-- 6. LOG DE APROBACIÓN
--    Trazabilidad de quién reportó / aprobó / rechazó
--    y con qué comentario.
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.schedule_approval_logs (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id     uuid        NOT NULL REFERENCES public.project_tasks(id) ON DELETE CASCADE,
  user_id     uuid        NOT NULL REFERENCES public.users(id)         ON DELETE CASCADE,
  accion      text        NOT NULL
    CHECK (accion IN ('reporta', 'aprueba', 'rechaza')),
  comentario  text,
  created_at  timestamptz DEFAULT now()
);


-- ─────────────────────────────────────────────
-- RLS
-- ─────────────────────────────────────────────

ALTER TABLE public.schedule_dependencies  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedule_resources     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedule_assignments   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedule_baselines     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedule_approval_logs ENABLE ROW LEVEL SECURITY;

-- Dependencias: acceso vía tarea → proyecto → owner
CREATE POLICY "schedule_deps_owner" ON public.schedule_dependencies
  FOR ALL USING (
    EXISTS (
      SELECT 1
      FROM   public.project_tasks pt
      JOIN   public.projects      p  ON p.id = pt.project_id
      WHERE  pt.id = predecesora_id
      AND    p.user_id = auth.uid()
    )
  );

-- Recursos: acceso directo vía proyecto → owner
CREATE POLICY "schedule_resources_owner" ON public.schedule_resources
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.projects
      WHERE id = project_id AND user_id = auth.uid()
    )
  );

-- Asignaciones: acceso vía tarea → proyecto → owner
CREATE POLICY "schedule_assignments_owner" ON public.schedule_assignments
  FOR ALL USING (
    EXISTS (
      SELECT 1
      FROM   public.project_tasks pt
      JOIN   public.projects      p  ON p.id = pt.project_id
      WHERE  pt.id = task_id
      AND    p.user_id = auth.uid()
    )
  );

-- Baselines: acceso directo vía proyecto → owner
CREATE POLICY "schedule_baselines_owner" ON public.schedule_baselines
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.projects
      WHERE id = project_id AND user_id = auth.uid()
    )
  );

-- ApprovalLog: el owner del proyecto ve todo; el ejecutor ve sus propias acciones
CREATE POLICY "schedule_approval_owner" ON public.schedule_approval_logs
  FOR ALL USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM   public.project_tasks pt
      JOIN   public.projects      p  ON p.id = pt.project_id
      WHERE  pt.id = task_id
      AND    p.user_id = auth.uid()
    )
  );


-- ─────────────────────────────────────────────
-- ÍNDICES
-- ─────────────────────────────────────────────

-- project_tasks: búsquedas frecuentes en cronograma
CREATE INDEX IF NOT EXISTS idx_pt_project_order
  ON public.project_tasks(project_id, sort_order);

CREATE INDEX IF NOT EXISTS idx_pt_parent
  ON public.project_tasks(parent_id);

CREATE INDEX IF NOT EXISTS idx_pt_status
  ON public.project_tasks(project_id, status);

CREATE INDEX IF NOT EXISTS idx_pt_ruta_critica
  ON public.project_tasks(project_id, en_ruta_critica)
  WHERE en_ruta_critica = true;

CREATE INDEX IF NOT EXISTS idx_pt_hito
  ON public.project_tasks(project_id, es_hito)
  WHERE es_hito = true;

-- Dependencias: navegación en ambos sentidos
CREATE INDEX IF NOT EXISTS idx_dep_predecesora
  ON public.schedule_dependencies(predecesora_id);

CREATE INDEX IF NOT EXISTS idx_dep_sucesora
  ON public.schedule_dependencies(sucesora_id);

-- Recursos por proyecto
CREATE INDEX IF NOT EXISTS idx_resources_project
  ON public.schedule_resources(project_id);

-- Asignaciones: por tarea y por recurso/usuario
CREATE INDEX IF NOT EXISTS idx_assign_task
  ON public.schedule_assignments(task_id);

CREATE INDEX IF NOT EXISTS idx_assign_resource
  ON public.schedule_assignments(resource_id);

CREATE INDEX IF NOT EXISTS idx_assign_user
  ON public.schedule_assignments(user_id);

-- Baselines por proyecto
CREATE INDEX IF NOT EXISTS idx_baselines_project
  ON public.schedule_baselines(project_id, fecha_creacion DESC);

-- ApprovalLog: historial de una tarea y del usuario
CREATE INDEX IF NOT EXISTS idx_approval_task
  ON public.schedule_approval_logs(task_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_approval_user
  ON public.schedule_approval_logs(user_id);
