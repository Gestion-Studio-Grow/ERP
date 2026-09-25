-- ENG-022 · Un comprobante autorizado no se puede editar ni borrar en la base.
--
-- Por qué: `app_rls` tiene UPDATE y DELETE sobre todas las tablas (prisma/rls/0002_app_role.sql)
-- y hasta hoy la única protección de una factura con CAE estaba en el código (`invoice-core.ts`
-- sólo escribe filas PENDING, o REJECTED sin CAE al reabrir). Un comprobante emitido se anula con
-- una nota de crédito: jamás se edita ni se borra (estándar de ingeniería §1 y §11).
--
-- Qué hace: un trigger BEFORE UPDATE OR DELETE sobre "Invoice", sólo para filas que YA tienen CAE
-- (status AUTHORIZED o cae no nulo; el WHEN hace que las demás ni llamen a la función):
--   · DELETE → error.
--   · UPDATE de una columna fiscal (identidad, receptor, fecha, montos, desglose, estado, CAE,
--     número, fechas de alta y autorización, clave del pago de Mercado Pago) → error.
--   · `orderId` / `appointmentId` (el enlace a la venta, que es la clave de idempotencia de
--     `createInvoice`) no se cambian ni se vacían a mano: desligar una factura con CAE deja facturar
--     la misma venta otra vez (segundo CAE) y esconde la factura del freno de anulación (ENG-023).
--     Única excepción: la FK (ON DELETE SET NULL, 20260708230200_add_invoice_origin) al borrar el
--     origen. Se reconoce por las DOS cosas a la vez: el UPDATE viene anidado en otro trigger
--     (pg_trigger_depth() > 1; la acción de la FK corre en 2, un UPDATE directo en 1) y el pedido o
--     turno ya no existe (buscado en el esquema de la tabla, no en el search_path: una tabla
--     temporal "Order" no lo engaña). Anidar el UPDATE en un trigger propio con el origen vivo → error.
--   · `rechazoMotivo` y `updatedAt` quedan libres (no son fiscales).
--   · El mensaje no nombra columnas (estándar §4); las cambiadas van en el DETAIL, para quien opera
--     la base.
-- Lo que NO cambia: crear facturas, pasar de PENDING a AUTHORIZED (la fila vieja no tiene CAE),
-- rechazar, reabrir una rechazada sin CAE, y borrar o editar cualquier factura sin CAE.
-- Rige para todos los roles, también el dueño de las tablas: sólo un superusuario con
-- session_replication_role = replica, o un ALTER TABLE … DISABLE TRIGGER (DDL, dueño), lo evita.
-- TRUNCATE no dispara triggers de fila; `app_rls` no tiene TRUNCATE (0002_app_role.sql).
--
-- Aditiva: sólo agrega una función y un trigger; no toca columnas ni datos. Reversa: rollback.sql.

CREATE OR REPLACE FUNCTION "comprobante_autorizado_inmutable"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  protegidas CONSTANT text[] := ARRAY[
    'id', 'tenantId', 'puntoVenta', 'tipoComprobante', 'concepto', 'docTipo', 'docNro', 'fecha',
    'neto', 'iva', 'total', 'ivaDesglose', 'status', 'cae', 'caeVencimiento', 'numero',
    'createdAt', 'authorizedAt', 'mpPaymentId'
  ];
  antes jsonb;
  despues jsonb;
  cambiadas text;
  origen_vivo boolean;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Un comprobante con CAE no se puede borrar: se anula con una nota de crédito.'
      USING ERRCODE = 'restrict_violation';
  END IF;

  antes := to_jsonb(OLD);
  despues := to_jsonb(NEW);
  SELECT string_agg(c, ', ' ORDER BY c) INTO cambiadas
    FROM unnest(protegidas) AS c
   WHERE antes -> c IS DISTINCT FROM despues -> c;
  -- El enlace a la venta: sólo la acción ON DELETE SET NULL de la FK puede vaciarlo.
  IF NEW."orderId" IS DISTINCT FROM OLD."orderId" THEN
    IF NEW."orderId" IS NOT NULL OR pg_trigger_depth() < 2 THEN
      origen_vivo := true;
    ELSE
      EXECUTE format('SELECT EXISTS (SELECT 1 FROM %I."Order" WHERE id = $1)', TG_TABLE_SCHEMA)
        INTO origen_vivo USING OLD."orderId";
    END IF;
    IF origen_vivo THEN
      cambiadas := concat_ws(', ', cambiadas, 'orderId');
    END IF;
  END IF;
  IF NEW."appointmentId" IS DISTINCT FROM OLD."appointmentId" THEN
    IF NEW."appointmentId" IS NOT NULL OR pg_trigger_depth() < 2 THEN
      origen_vivo := true;
    ELSE
      EXECUTE format('SELECT EXISTS (SELECT 1 FROM %I."Appointment" WHERE id = $1)', TG_TABLE_SCHEMA)
        INTO origen_vivo USING OLD."appointmentId";
    END IF;
    IF origen_vivo THEN
      cambiadas := concat_ws(', ', cambiadas, 'appointmentId');
    END IF;
  END IF;

  IF cambiadas IS NOT NULL THEN
    RAISE EXCEPTION 'Un comprobante con CAE no se puede editar: se anula con una nota de crédito.'
      USING ERRCODE = 'restrict_violation', DETAIL = 'Campos: ' || cambiadas;
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS "Invoice_comprobante_autorizado_inmutable" ON "Invoice";
CREATE TRIGGER "Invoice_comprobante_autorizado_inmutable"
  BEFORE UPDATE OR DELETE ON "Invoice"
  FOR EACH ROW
  WHEN (OLD."status" = 'AUTHORIZED' OR OLD."cae" IS NOT NULL)
  EXECUTE FUNCTION "comprobante_autorizado_inmutable"();
