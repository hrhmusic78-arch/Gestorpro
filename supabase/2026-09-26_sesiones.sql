-- =====================================================================
-- GestorPro · Sesiones de usuario (2026-09-26)
-- =====================================================================
-- Cada inicio de sesión crea una fila con un código aleatorio (token). El navegador
-- guarda solo ese token; los permisos y el estado del empleado se leen siempre de la
-- base. Así, desactivar o borrar a un empleado lo saca del sistema, y editar el
-- navegador no da permisos extra.
--
-- Cómo usarlo: Supabase → SQL Editor → New query → pegar → Run.
-- Se puede ejecutar más de una vez sin problema.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.sesiones (
  token       uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  empleado_id uuid        NOT NULL REFERENCES public.empleados(id) ON DELETE CASCADE,
  creado      timestamptz NOT NULL DEFAULT now(),
  ultimo_uso  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sesiones_empleado_id_idx ON public.sesiones (empleado_id);

-- Correos en minúsculas: el login compara en minúsculas
UPDATE public.empleados SET email = lower(trim(email)) WHERE email <> lower(trim(email));

GRANT ALL ON public.sesiones TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
