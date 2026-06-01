-- =============================================
-- FlowDesk – Fix: columna unit en resources + pct_avance en logs + constraint accion correcto
-- Fecha: 2026-06-02
-- =============================================

-- 1. Columna unit en schedule_resources
--    El frontend la usa para mostrar la unidad de medida del recurso (hr, día, m², etc.)
ALTER TABLE public.schedule_resources
  ADD COLUMN IF NOT EXISTS unit text NOT NULL DEFAULT 'hr';

-- 2. Columna pct_avance en schedule_approval_logs
--    Guarda el porcentaje propuesto cuando accion = 'reporta'
ALTER TABLE public.schedule_approval_logs
  ADD COLUMN IF NOT EXISTS pct_avance integer
    CONSTRAINT pct_avance_range CHECK (pct_avance IS NULL OR pct_avance BETWEEN 0 AND 100);

-- 2. Asegurar que el CHECK de accion incluya todas las transiciones del flujo.
--    Necesario porque 20260601_schedule_submodule.sql crea la tabla con solo
--    3 acciones, y 20260601_schedule_members.sql (que amplía el constraint)
--    puede correr antes que submodule en orden alfabético.
ALTER TABLE public.schedule_approval_logs
  DROP CONSTRAINT IF EXISTS schedule_approval_logs_accion_check;

ALTER TABLE public.schedule_approval_logs
  ADD CONSTRAINT schedule_approval_logs_accion_check
  CHECK (accion IN (
    'inicia',    -- pending → in_progress
    'reporta',   -- in_progress → in_review
    'aprueba',   -- in_review → approved
    'rechaza',   -- in_review → rejected
    'completa',  -- approved → completed
    'reabre'     -- rejected → in_progress
  ));
