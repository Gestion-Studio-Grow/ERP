-- ROLLBACK de 20260925120000_lanzamiento_base (R0-F1). Manual, como dueño de las tablas
-- (neondb_owner). Probado en src/lib/lanzamiento-base-postgres.test.ts.
--
-- Deja la base como estaba antes de la migración: saca las 13 tablas nuevas, sus tipos, las
-- columnas, índices y restricciones que agregó, y vuelve a exigir teléfono en Client. Borra
-- además el registro en _prisma_migrations, para que la base diga la verdad y un
-- `prisma migrate deploy` posterior la vuelva a aplicar.
--
-- QUÉ SE PIERDE: lo cargado DESPUÉS de la migración en lo nuevo (conexiones y credenciales de
-- integraciones, eventos, contactos y conversaciones del contador, extractos recibidos,
-- receptores fiscales, envíos de comprobantes, el ticket de ARCA en caché, la ficha fiscal de
-- los clientes, códigos y alícuotas de productos, datos fiscales del emisor, llaves por negocio).
-- Lo que existía antes de la migración no se toca.
--
-- DOS FRENOS, y si frena no cambia nada (todo corre en una transacción):
--   1. Clientes sin teléfono: volver a exigirlo obligaría a inventar uno. No tiene atajo.
--   2. Datos fiscales cargados con esta migración (notas de crédito asociadas a su comprobante,
--      facturas de proveedor, delegaciones de facturación): la reversa los borraría. Sólo con
--      autorización del dueño, antes de correrla:  SET lanzamiento.reversa_con_perdida = 'si';

BEGIN;

DO $$
DECLARE
  sin_telefono int;
  fiscales int;
BEGIN
  SELECT count(*) INTO sin_telefono FROM "Client" WHERE "phone" IS NULL;
  IF sin_telefono > 0 THEN
    RAISE EXCEPTION 'Reversa frenada: % ficha(s) de cliente sin teléfono. Volver a exigirlo obligaría a inventar uno.', sin_telefono
      USING HINT = 'Completá esas fichas o decidí qué hacer con ellas antes de revertir.';
  END IF;

  SELECT (SELECT count(*) FROM "Invoice" WHERE "comprobanteAsociadoId" IS NOT NULL)
       + (SELECT count(*) FROM "StockPurchase" WHERE "facturaNumero" IS NOT NULL OR "facturaCuit" IS NOT NULL)
       + (SELECT count(*) FROM "DelegacionFiscal")
    INTO fiscales;
  IF fiscales > 0 AND coalesce(current_setting('lanzamiento.reversa_con_perdida', true), '') <> 'si' THEN
    RAISE EXCEPTION 'Reversa frenada: hay % dato(s) fiscal(es) cargado(s) con esta migración y la reversa los borraría.', fiscales
      USING HINT = 'Sólo con autorización del dueño: SET lanzamiento.reversa_con_perdida = ''si''; y volver a correrla.';
  END IF;
END
$$;

-- La llave de una tabla vieja (OutboxEvent) hacia una nueva sale antes de borrar la nueva.
ALTER TABLE "OutboxEvent" DROP CONSTRAINT IF EXISTS "OutboxEvent_tenantId_conexionId_fkey";

-- Tablas nuevas: primero las que cuelgan de otras. Sin CASCADE: si algo inesperado depende de
-- ellas, la reversa falla en vez de llevárselo puesto.
DROP TABLE IF EXISTS "IntegracionCredencial";
DROP TABLE IF EXISTS "EventoIntegracion";
DROP TABLE IF EXISTS "IntegracionUso";
DROP TABLE IF EXISTS "IntegracionEstadoOAuth";
DROP TABLE IF EXISTS "IntegracionConexion";
DROP TABLE IF EXISTS "ExtractoRecibido";
DROP TABLE IF EXISTS "MensajeWhatsapp";
DROP TABLE IF EXISTS "ConversacionWhatsapp";
DROP TABLE IF EXISTS "ContactoCartera";
DROP TABLE IF EXISTS "DelegacionFiscal";
DROP TABLE IF EXISTS "ReceptorFiscal";
DROP TABLE IF EXISTS "EnvioComprobante";
DROP TABLE IF EXISTS "ArcaAuthTicket";

DROP TYPE IF EXISTS "EstadoConexion";
DROP TYPE IF EXISTS "DireccionEvento";
DROP TYPE IF EXISTS "EstadoEvento";
DROP TYPE IF EXISTS "EstadoExtractoRecibido";
DROP TYPE IF EXISTS "EstadoDelegacionFiscal";
DROP TYPE IF EXISTS "OrigenReceptorFiscal";
DROP TYPE IF EXISTS "CanalEnvio";
DROP TYPE IF EXISTS "EstadoEnvioComprobante";

-- Columnas nuevas de tablas que ya existían (sus índices y restricciones se van con ellas; se
-- nombran igual para que la reversa se lea sola).
ALTER TABLE "Invoice" DROP CONSTRAINT IF EXISTS "Invoice_tenantId_comprobanteAsociadoId_fkey";
DROP INDEX IF EXISTS "Invoice_tenantId_comprobanteAsociadoId_idx";
DROP INDEX IF EXISTS "Invoice_tenantId_id_key";
ALTER TABLE "Invoice" DROP COLUMN IF EXISTS "comprobanteAsociadoId";

ALTER TABLE "Client" ALTER COLUMN "phone" SET NOT NULL;
DROP INDEX IF EXISTS "Client_tenantId_docNro_idx";
ALTER TABLE "Client"
  DROP COLUMN IF EXISTS "docTipo",
  DROP COLUMN IF EXISTS "docNro",
  DROP COLUMN IF EXISTS "razonSocial",
  DROP COLUMN IF EXISTS "condicionIva",
  DROP COLUMN IF EXISTS "domicilio";

ALTER TABLE "MovimientoImportado" DROP CONSTRAINT IF EXISTS "MovimientoImportado_concepto_check";
ALTER TABLE "MovimientoImportado"
  DROP COLUMN IF EXISTS "receptorCondicionIva",
  DROP COLUMN IF EXISTS "tipoComprobantePropuesto",
  DROP COLUMN IF EXISTS "concepto",
  DROP COLUMN IF EXISTS "fceObligatoria",
  DROP COLUMN IF EXISTS "aprobadoPor",
  DROP COLUMN IF EXISTS "aprobadoEn",
  DROP COLUMN IF EXISTS "rechazoMotivo";

DROP INDEX IF EXISTS "OutboxEvent_tenantId_id_key";
DROP INDEX IF EXISTS "OutboxEvent_processedAt_proximoIntentoEn_idx";
ALTER TABLE "OutboxEvent"
  DROP COLUMN IF EXISTS "conexionId",
  DROP COLUMN IF EXISTS "proximoIntentoEn",
  DROP COLUMN IF EXISTS "bloqueadoHasta",
  DROP COLUMN IF EXISTS "muertoEn";

ALTER TABLE "Product" DROP CONSTRAINT IF EXISTS "Product_alicuotaIva_check";
ALTER TABLE "Product" DROP CONSTRAINT IF EXISTS "Product_codigo_check";
DROP INDEX IF EXISTS "Product_tenantId_codigo_key";
ALTER TABLE "Product"
  DROP COLUMN IF EXISTS "codigo",
  DROP COLUMN IF EXISTS "alicuotaIva";

DROP INDEX IF EXISTS "StockPurchase_factura_proveedor_key";
ALTER TABLE "StockPurchase"
  DROP COLUMN IF EXISTS "facturaTipo",
  DROP COLUMN IF EXISTS "facturaPuntoVenta",
  DROP COLUMN IF EXISTS "facturaNumero",
  DROP COLUMN IF EXISTS "facturaFecha",
  DROP COLUMN IF EXISTS "facturaCuit",
  DROP COLUMN IF EXISTS "facturaNeto",
  DROP COLUMN IF EXISTS "facturaIva",
  DROP COLUMN IF EXISTS "facturaIvaDesglose",
  DROP COLUMN IF EXISTS "facturaNoGravado",
  DROP COLUMN IF EXISTS "facturaExento",
  DROP COLUMN IF EXISTS "facturaPercepcionIva",
  DROP COLUMN IF EXISTS "facturaPercepcionIibb",
  DROP COLUMN IF EXISTS "facturaOtrosTributos",
  DROP COLUMN IF EXISTS "facturaTotal";

ALTER TABLE "Tenant" DROP CONSTRAINT IF EXISTS "Tenant_arcaConceptoDefault_check";
ALTER TABLE "Tenant"
  DROP COLUMN IF EXISTS "arcaCondicionIva",
  DROP COLUMN IF EXISTS "arcaRazonSocial",
  DROP COLUMN IF EXISTS "arcaDomicilioFiscal",
  DROP COLUMN IF EXISTS "arcaInicioActividades",
  DROP COLUMN IF EXISTS "arcaIibb",
  DROP COLUMN IF EXISTS "arcaConceptoDefault",
  DROP COLUMN IF EXISTS "fceMiPyme",
  DROP COLUMN IF EXISTS "cuentasCorrientes",
  DROP COLUMN IF EXISTS "perfiles";

DELETE FROM "_prisma_migrations" WHERE migration_name = '20260925120000_lanzamiento_base';

COMMIT;
