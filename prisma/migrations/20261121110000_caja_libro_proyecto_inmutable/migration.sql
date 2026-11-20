-- GSG-MIA-208 · El libro de caja de un proyecto no se borra ni se edita en la base.
--
-- Por qué: la segunda corrida de Aurora (P1-v2, paso 9) midió que `app_rls` borra la venta de un cobro de proyecto,
-- borra su contraasiento y le cambia el importe (`DELETE 1`, `DELETE 1`, `UPDATE 1`). La única barrera era la acción
-- `deleteLibroEntry` (A-06); `app_rls` tiene UPDATE y DELETE sobre todas las tablas (prisma/rls/0002_app_role.sql).
-- Un cobro (o el pago de una orden) se corrige anulándolo, que asienta la vuelta: la fila nunca se toca.
--
-- Qué hace: un disparador BEFORE UPDATE OR DELETE sobre "CashMovement", sólo para filas con `proyectoPagoId` u
-- `proyectoOrdenPagoId` (el WHEN hace que las demás ni llamen a la función):
--   · DELETE → error.
--   · UPDATE de importe, tipo, medio, fecha contable, vínculos (turno, pedido, cobros, gastos, liquidación, anticipo,
--     orden), negocio, id, autor o alta → error. `reason` queda libre (no es plata).
--   · La acción ON DELETE SET NULL de una FK (borrar el cobro) es un UPDATE del vínculo: también falla, así que el cobro
--     con libro no se borra.
--   · El mensaje no nombra columnas (estándar §4); las cambiadas van en el DETAIL.
-- A quién NO frena: al dueño de las tablas (o un superusuario) cuando es él el que se conecta Y el que ejecuta
-- (session_user y current_user): la consola del operador, el reseteo de go-live (scripts/reset-golive.ts) y la limpieza
-- de las pruebas siguen como antes. La app se conecta como `app_rls` (session_user = app_rls), así que la acción de una
-- FK disparada por la app —que Postgres corre como el dueño— igual queda frenada.
-- Lo que NO cambia en la app: ninguna acción hace UPDATE de una fila del libro y las que borran (`deleteLibroEntry`,
-- ajustes de `cierre-mes`) sólo tocan asientos sin proyecto. Grep del 20/11: src/lib/libro-caja-actions.ts:562,
-- src/lib/cierre-mes/acciones.ts:278, src/lib/reset-golive-db.ts:175 (dueño), scripts/corte-inicial.ts:213 y
-- scripts/import-caja-historica.ts:287 (sin proyecto), prisma/seed-mia-producciones.ts:69 (semilla, dueño).
-- TRUNCATE no dispara disparadores de fila; `app_rls` no tiene TRUNCATE (0002_app_role.sql).
--
-- Aditiva: sólo agrega una función y un disparador; no toca columnas ni datos. Reversa: rollback.sql.
-- Probada en src/lib/proyectos/mia208-libro-protegido-postgres.test.ts.

CREATE OR REPLACE FUNCTION "caja_libro_proyecto_inmutable"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  protegidas CONSTANT text[] := ARRAY[
    'id', 'tenantId', 'sessionId', 'type', 'amount', 'method', 'occurredAt', 'orderId', 'paymentId', 'collectionId',
    'tallerPagoId', 'proyectoPagoId', 'proyectoGastoId', 'proyectoLiquidacionId', 'proyectoAnticipoId',
    'proyectoOrdenPagoId', 'createdBy', 'createdAt'
  ];
  duenio oid;
  cambiadas text;
BEGIN
  SELECT relowner INTO duenio FROM pg_class WHERE oid = TG_RELID;
  IF pg_has_role(session_user, duenio, 'MEMBER') AND pg_has_role(current_user, duenio, 'MEMBER') THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Un movimiento del libro que asentó un proyecto no se borra: se corrige anulando el cobro o la orden, que asienta la vuelta.'
      USING ERRCODE = 'restrict_violation';
  END IF;

  SELECT string_agg(c, ', ' ORDER BY c) INTO cambiadas
    FROM unnest(protegidas) AS c
   WHERE to_jsonb(OLD) -> c IS DISTINCT FROM to_jsonb(NEW) -> c;
  IF cambiadas IS NOT NULL THEN
    RAISE EXCEPTION 'Un movimiento del libro que asentó un proyecto no se edita: se corrige anulando el cobro o la orden, que asienta la vuelta.'
      USING ERRCODE = 'restrict_violation', DETAIL = 'Campos: ' || cambiadas;
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS "CashMovement_proyecto_inmutable" ON "CashMovement";
CREATE TRIGGER "CashMovement_proyecto_inmutable"
  BEFORE UPDATE OR DELETE ON "CashMovement"
  FOR EACH ROW
  WHEN (OLD."proyectoPagoId" IS NOT NULL OR OLD."proyectoOrdenPagoId" IS NOT NULL)
  EXECUTE FUNCTION "caja_libro_proyecto_inmutable"();
