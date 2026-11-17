-- CONSOLA DE LA CUADRILLA · correcciones de GSG-MIA-072 (PR #188). ADITIVA: dos columnas nulables y dos índices.
-- Se prueba sólo en local (Postgres efímero con `app_rls`); a Neon va con Gate 2, junto con 20261117120000.
--
-- · "MensajeCuadrilla"."pedidoId": a qué pedido contesta (o qué pedido abre) cada mensaje del hilo. Sin FK a
--   propósito: el pedido se lee con tenantId y bajo RLS, y un mensaje viejo sin pedido sigue valiendo (NULL).
-- · "AgenteCuadrilla"."comoUserId": la persona del puesto cuyos accesos tiene el usuario del agente («mismos
--   accesos que una persona», orden del dueño 17/11 07:38Z). Sin FK a "User" por la misma razón: el código lo
--   busca dentro del negocio, y si la persona se borra, la consola avisa que no hay con quién comparar.

ALTER TABLE "MensajeCuadrilla" ADD COLUMN IF NOT EXISTS "pedidoId" TEXT;
CREATE INDEX IF NOT EXISTS "MensajeCuadrilla_tenantId_pedidoId_idx" ON "MensajeCuadrilla"("tenantId", "pedidoId");

ALTER TABLE "AgenteCuadrilla" ADD COLUMN IF NOT EXISTS "comoUserId" TEXT;
CREATE INDEX IF NOT EXISTS "AgenteCuadrilla_tenantId_comoUserId_idx" ON "AgenteCuadrilla"("tenantId", "comoUserId");
