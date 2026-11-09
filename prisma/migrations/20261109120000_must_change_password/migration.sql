-- Cambio obligatorio de contraseña en el próximo ingreso (GSG-SEG-008, 09/11/2026). Antes vivía en
-- prisma/pending-gate2/MustChangePassword.sql, sin aplicar: el reset del OWNER y el alta de una persona desde la
-- consola entregaban una contraseña provisoria que quedaba válida para siempre. Regla del dueño: si el cambio
-- obligatorio no está activo en la base, primero se activa.
--
-- ADITIVA: una columna con default en "User"; no toca datos (todas las filas quedan en false). Idempotente
-- (`IF NOT EXISTS`) por si alguien corrió a mano el SQL de pending-gate2. RLS: viaja en la fila de "User", que ya
-- tiene su policy; no suma superficie.
--
-- Sin aplicar (Gate 2), el código no emite contraseñas provisorias: el reset y el alta se niegan (fallan cerrado).
-- El build de producción frena si la base está atrás del schema (scripts/vercel-build.mjs).
--
-- Vuelta atrás: ALTER TABLE "User" DROP COLUMN IF EXISTS "mustChangePassword";

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;
