-- =============================================
-- FlowDesk – Migración: Miembros de proyecto y roles
-- Fecha: 2026-06-01
-- =============================================

-- 1. Tabla de miembros del proyecto con roles
CREATE TABLE IF NOT EXISTS public.schedule_project_members (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid        NOT NULL REFERENCES public.projects(id)  ON DELETE CASCADE,
  user_id    uuid        NOT NULL REFERENCES public.users(id)     ON DELETE CASCADE,
  role       text        NOT NULL DEFAULT 'professional'
    CONSTRAINT member_role_check CHECK (role IN ('admin', 'professional')),
  created_at timestamptz DEFAULT now(),
  CONSTRAINT member_unique UNIQUE (project_id, user_id)
);

ALTER TABLE public.schedule_project_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "members_project_owner" ON public.schedule_project_members;
CREATE POLICY "members_project_owner" ON public.schedule_project_members
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.projects WHERE id = project_id AND user_id = auth.uid())
  );

DROP POLICY IF EXISTS "members_self_read" ON public.schedule_project_members;
CREATE POLICY "members_self_read" ON public.schedule_project_members
  FOR SELECT USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_members_project ON public.schedule_project_members(project_id);
CREATE INDEX IF NOT EXISTS idx_members_user    ON public.schedule_project_members(user_id);

-- 2. Ampliar el CHECK de accion en approval_logs para incluir todas las acciones
--    del flujo de estados (inicia, completa, reabre además de los existentes)
ALTER TABLE public.schedule_approval_logs
  DROP CONSTRAINT IF EXISTS schedule_approval_logs_accion_check;

ALTER TABLE public.schedule_approval_logs
  ADD CONSTRAINT schedule_approval_logs_accion_check
  CHECK (accion IN (
    'inicia',    -- pending → in_progress
    'reporta',   -- in_progress → in_review (propone avance)
    'aprueba',   -- in_review → approved
    'rechaza',   -- in_review → rejected
    'completa',  -- approved → completed
    'reabre'     -- rejected → in_progress
  ));
