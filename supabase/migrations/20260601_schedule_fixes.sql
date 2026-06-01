-- =============================================
-- FlowDesk – Fix: constraint upsert + cols baseline
-- Fecha: 2026-06-01
-- =============================================

-- 1. UNIQUE en assignments para que el upsert funcione
ALTER TABLE public.schedule_assignments
  ADD CONSTRAINT assignments_task_resource_unique
  UNIQUE (task_id, resource_id);

-- 2. Columnas de línea base en project_tasks
--    Permiten mostrar ghost-bar en Gantt y tabla comparativa
ALTER TABLE public.project_tasks
  ADD COLUMN IF NOT EXISTS baseline_start    date,
  ADD COLUMN IF NOT EXISTS baseline_end      date,
  ADD COLUMN IF NOT EXISTS baseline_progress integer NOT NULL DEFAULT 0
    CONSTRAINT baseline_progress_range CHECK (baseline_progress BETWEEN 0 AND 100);
