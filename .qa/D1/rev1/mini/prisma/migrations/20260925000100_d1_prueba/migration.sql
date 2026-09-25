-- D1 · plantilla v2 (revisada tras la refutación del 2026-09-25). Se llena con PARES y AUTORIZADAS.
DO $migracion$
DECLARE
  -- tabla, columna, decimales de la columna nueva. Es lo ÚNICO que cambia entre porciones.
  pares text[][] := ARRAY[ ['Payment','amount','2'], ['StockMovement','unitCost','6'] ];
  -- Importes con más decimales que la columna nueva que el DUEÑO autorizó a redondear,
  -- como 'Tabla.columna:id'. Vacía por defecto: si hay alguno, la migración frena (paso 1).
  autorizadas text[] := ARRAY[ 'Payment.amount:pay9' ]::text[];
  par text[]; t text; c text; e int; n bigint; lista text; adds text; sets text; tipos text;
BEGIN
  PERFORM set_config('lock_timeout', '5s', true);
  -- Si el rol que migra está sujeto a RLS (tabla con FORCE y rol sin BYPASSRLS), que FALLE en
  -- vez de chequear sólo las filas que ve y convertir la tabla entera.
  PERFORM set_config('row_security', 'off', true);

  -- 1) Chequeo previo, antes de tocar nada.
  FOREACH par SLICE 1 IN ARRAY pares LOOP
    t := par[1]; c := par[2]; e := par[3]::int;
    EXECUTE format('SELECT count(*) FROM %I WHERE %I = ''NaN''::float8 OR %I IN (''Infinity''::float8, ''-Infinity''::float8) OR abs(%I) >= 1e12', t, c, c, c, c) INTO n;
    IF n > 0 THEN RAISE EXCEPTION 'D1: % filas de %.% no entran en numeric (NaN, infinito o 1 billón o más)', n, t, c; END IF;
    EXECUTE format('SELECT string_agg(id, '', '' ORDER BY id) FROM %I WHERE %I::numeric <> round(%I::numeric, %s) AND NOT (%L || id = ANY (%L::text[]))',
                   t, c, c, e, t || '.' || c || ':', autorizadas) INTO lista;
    IF lista IS NOT NULL THEN
      RAISE EXCEPTION 'D1: %.% tiene importes con más de % decimales sin autorización del dueño (ids: %)', t, c, e, left(lista, 400);
    END IF;
  END LOOP;

  -- 2) Respaldo aditivo (la Float tal cual) y cambio de tipo: una tabla por vez, armado de la lista.
  FOR t IN SELECT DISTINCT pares[i][1] FROM generate_subscripts(pares, 1) i LOOP
    SELECT string_agg(format('ADD COLUMN %I double precision', pares[i][2] || '_float'), ', '),
           string_agg(format('%I = %I', pares[i][2] || '_float', pares[i][2]), ', '),
           string_agg(format('ALTER COLUMN %I TYPE numeric(%s,%s) USING round(%I::numeric, %s)',
                             pares[i][2], 12 + pares[i][3]::int, pares[i][3], pares[i][2], pares[i][3]), ', ')
      INTO adds, sets, tipos FROM generate_subscripts(pares, 1) i WHERE pares[i][1] = t;
    EXECUTE format('ALTER TABLE %I %s', t, adds);
    EXECUTE format('UPDATE %I SET %s', t, sets);
    EXECUTE format('ALTER TABLE %I %s', t, tipos);
  END LOOP;

  -- 3) Verificación contra el valor de ANTES (la Float leída como decimal), no contra su redondeo:
  --    cada fila vale lo mismo que antes; sólo las autorizadas difieren, y valen su redondeo.
  FOREACH par SLICE 1 IN ARRAY pares LOOP
    t := par[1]; c := par[2]; e := par[3]::int;
    EXECUTE format('SELECT count(*) FROM %I WHERE (%I IS NULL) <> (%I IS NULL) OR %I = ''NaN''::numeric
                      OR (%L || id = ANY (%L::text[]) AND %I IS DISTINCT FROM round(%I::numeric, %s))
                      OR (NOT (%L || id = ANY (%L::text[])) AND %I IS DISTINCT FROM %I::numeric)',
                   t, c, c || '_float', c,
                   t || '.' || c || ':', autorizadas, c, c || '_float', e,
                   t || '.' || c || ':', autorizadas, c, c || '_float') INTO n;
    IF n > 0 THEN RAISE EXCEPTION 'D1: %.%: % filas no valen lo mismo que antes de migrar', t, c, n; END IF;
  END LOOP;
END
$migracion$;
