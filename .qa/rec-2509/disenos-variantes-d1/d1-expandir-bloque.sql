-- M-D1-n-E (plantilla): un solo bloque DO. Frena con "D1: …" y no deja nada hecho.
DO $b$
DECLARE r record; malas text;
BEGIN
  SET LOCAL row_security = off;  SET LOCAL lock_timeout = '5s';
  -- d1_autorizadas: en la migración real es una lista literal (tabla, columna, id, valor) que decide el dueño.
  ALTER TABLE "Order" ADD COLUMN subtotal_num numeric(14,2), ADD COLUMN total_num numeric(14,2);  -- nulas, SIN default
  CREATE TRIGGER d1_espejo BEFORE INSERT OR UPDATE ON "Order" FOR EACH ROW EXECUTE FUNCTION d1_espejo('subtotal','subtotal_num','2','total','total_num','2');
  FOR r IN SELECT * FROM (VALUES ('subtotal'),('total')) v(col) LOOP
    EXECUTE format($q$SELECT string_agg(id, ', ') FROM "Order" o WHERE (%1$I = 'NaN'::float8 OR abs(%1$I) >= 1e12
          OR %1$I::numeric <> round(%1$I::numeric, 2))
          AND NOT EXISTS (SELECT 1 FROM d1_autorizadas a WHERE a.tabla='Order' AND a.columna=%2$L AND a.id=o.id)$q$, r.col, r.col) INTO malas;
    IF malas IS NOT NULL THEN RAISE EXCEPTION 'D1: Order.% tiene importes que no entran sin autorización del dueño (ids: %)', r.col, malas; END IF;
  END LOOP;
  PERFORM set_config('d1.relleno', 'on', true);
  UPDATE "Order" o SET subtotal_num = COALESCE((SELECT valor FROM d1_autorizadas a WHERE a.columna='subtotal' AND a.id=o.id), round(subtotal::numeric, 2)),
                       total_num    = COALESCE((SELECT valor FROM d1_autorizadas a WHERE a.columna='total' AND a.id=o.id), round(total::numeric, 2));
  PERFORM set_config('d1.relleno', 'off', true);
  -- verificación fila por fila contra el valor de antes (la Float leída como decimal) o el autorizado
  SELECT string_agg(id, ', ') INTO malas FROM "Order" o WHERE subtotal_num IS NULL OR total_num IS NULL
     OR (total_num <> total::numeric AND NOT EXISTS (SELECT 1 FROM d1_autorizadas a WHERE a.columna='total' AND a.id=o.id AND a.valor=o.total_num))
     OR (subtotal_num <> subtotal::numeric AND NOT EXISTS (SELECT 1 FROM d1_autorizadas a WHERE a.columna='subtotal' AND a.id=o.id AND a.valor=o.subtotal_num));
  IF malas IS NOT NULL THEN RAISE EXCEPTION 'D1: verificación fallida en Order (ids: %)', malas; END IF;
  ALTER TABLE "Order" ALTER COLUMN subtotal_num SET NOT NULL, ALTER COLUMN total_num SET NOT NULL;
  RAISE NOTICE 'D1: Order expandida y verificada';
END $b$;
