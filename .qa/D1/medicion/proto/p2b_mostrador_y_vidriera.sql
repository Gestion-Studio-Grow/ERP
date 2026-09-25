-- D1 · p2b_mostrador_y_vidriera: la plata de estas columnas pasa de Float a numeric(14,2), en el lugar.
-- UN SOLO bloque DO: si algo falla, no queda nada hecho y el log de Vercel muestra el motivo "D1: …"
-- (con BEGIN/COMMIT sueltos, `prisma migrate deploy` sólo muestra "current transaction is aborted").
DO $migracion$
DECLARE
  par text[]; tabla text; col text; r record; n bigint;
  pares text[][] := ARRAY[
    ['Order', 'subtotal'],
    ['Order', 'discount'],
    ['Order', 'total'],
    ['OrderItem', 'unitPrice'],
    ['OrderItem', 'lineTotal'],
    ['Coupon', 'value'],
    ['Product', 'price'],
    ['Product', 'pricePerKg']
  ];
BEGIN
  PERFORM set_config('lock_timeout', '5s', true);  -- si la tabla está tomada, se frena y se reintenta otro día
  CREATE TEMP TABLE d1_antes (tabla text, col text, negocio text, filas bigint, suma numeric, huella text) ON COMMIT DROP;

  -- 1) Lo que no entra en numeric(14,2) frena todo, antes de tocar nada.
  FOREACH par SLICE 1 IN ARRAY pares LOOP
    tabla := par[1]; col := par[2];
    EXECUTE format('SELECT count(*) FROM %I WHERE %I = ''NaN''::float8 OR %I IN (''Infinity''::float8, ''-Infinity''::float8) OR abs(%I) >= 1e12', tabla, col, col, col, col) INTO n;
    IF n > 0 THEN RAISE EXCEPTION 'D1: % filas de %.% no entran en numeric(14,2) (NaN, infinito o 1 billón o más)', n, tabla, col; END IF;
    -- foto de antes, por negocio: filas, suma al centavo y huella fila por fila
    EXECUTE format($q$INSERT INTO d1_antes SELECT %L, %L, "tenantId", count(%I), sum(round(%I::numeric, 2)),
        md5(string_agg(id || ':' || coalesce(round(%I::numeric, 2)::text, '-'), ',' ORDER BY id)) FROM %I GROUP BY "tenantId"$q$,
        tabla, col, col, col, col, tabla);
  END LOOP;

  -- 2) Respaldo aditivo (la Float tal cual) y cambio de tipo.
  ALTER TABLE "Order" ADD COLUMN "subtotal_float" double precision, ADD COLUMN "discount_float" double precision, ADD COLUMN "total_float" double precision;
  UPDATE "Order" SET "subtotal_float" = "subtotal", "discount_float" = "discount", "total_float" = "total";
  ALTER TABLE "Order" ALTER COLUMN "subtotal" TYPE numeric(14,2) USING round("subtotal"::numeric, 2), ALTER COLUMN "discount" TYPE numeric(14,2) USING round("discount"::numeric, 2), ALTER COLUMN "total" TYPE numeric(14,2) USING round("total"::numeric, 2);
  ALTER TABLE "OrderItem" ADD COLUMN "unitPrice_float" double precision, ADD COLUMN "lineTotal_float" double precision;
  UPDATE "OrderItem" SET "unitPrice_float" = "unitPrice", "lineTotal_float" = "lineTotal";
  ALTER TABLE "OrderItem" ALTER COLUMN "unitPrice" TYPE numeric(14,2) USING round("unitPrice"::numeric, 2), ALTER COLUMN "lineTotal" TYPE numeric(14,2) USING round("lineTotal"::numeric, 2);
  ALTER TABLE "Coupon" ADD COLUMN "value_float" double precision;
  UPDATE "Coupon" SET "value_float" = "value";
  ALTER TABLE "Coupon" ALTER COLUMN "value" TYPE numeric(14,2) USING round("value"::numeric, 2);
  ALTER TABLE "Product" ADD COLUMN "price_float" double precision, ADD COLUMN "pricePerKg_float" double precision;
  UPDATE "Product" SET "price_float" = "price", "pricePerKg_float" = "pricePerKg";
  ALTER TABLE "Product" ALTER COLUMN "price" TYPE numeric(14,2) USING round("price"::numeric, 2), ALTER COLUMN "pricePerKg" TYPE numeric(14,2) USING round("pricePerKg"::numeric, 2);

  -- 3) Verificación: por negocio, mismas filas, misma suma y misma huella; y cada fila igual a su respaldo.
  FOREACH par SLICE 1 IN ARRAY pares LOOP
    tabla := par[1]; col := par[2];
    FOR r IN EXECUTE format($q$SELECT a.negocio, a.filas, a.suma, a.huella, d.filas AS filas_d, d.suma AS suma_d, d.huella AS huella_d
        FROM d1_antes a LEFT JOIN (SELECT "tenantId" AS negocio, count(%I) AS filas, sum(%I) AS suma,
               md5(string_agg(id || ':' || coalesce(%I::text, '-'), ',' ORDER BY id)) AS huella FROM %I GROUP BY "tenantId") d
          ON d.negocio = a.negocio WHERE a.tabla = %L AND a.col = %L$q$, col, col, col, tabla, tabla, col) LOOP
      IF r.filas IS DISTINCT FROM r.filas_d OR r.suma IS DISTINCT FROM r.suma_d OR r.huella IS DISTINCT FROM r.huella_d THEN
        RAISE EXCEPTION 'D1: %.% no coincide en el negocio % (filas % / %, suma % / %)', tabla, col, r.negocio, r.filas, r.filas_d, r.suma, r.suma_d;
      END IF;
    END LOOP;
    EXECUTE format('SELECT count(*) FROM %I WHERE %I IS DISTINCT FROM round(%I::numeric, 2)', tabla, col, col || '_float') INTO n;
    IF n > 0 THEN RAISE EXCEPTION 'D1: %.%: % filas distintas de su respaldo', tabla, col, n; END IF;
  END LOOP;
END
$migracion$;
