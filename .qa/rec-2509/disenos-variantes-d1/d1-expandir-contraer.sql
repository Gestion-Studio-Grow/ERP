-- Prototipo de la plantilla de D1 por expandir y contraer (D1-PLAN.md §5, rev. 2). Postgres local efímero.
-- Tabla mínima con la forma de "Order": dos importes Float NOT NULL DEFAULT 0 (el caso que rompió el prototipo descartado).
\set ON_ERROR_STOP 0
CREATE TABLE "Order" (id TEXT PRIMARY KEY, "tenantId" TEXT NOT NULL, subtotal float8 NOT NULL DEFAULT 0, total float8 NOT NULL DEFAULT 0, nota TEXT);
INSERT INTO "Order"(id,"tenantId",subtotal,total) VALUES ('a','beauty-spa',10.5,10.5), ('b','beauty-spa',0.1::float8+0.2::float8,0.1::float8+0.2::float8), ('c','magra',1851.8505,1851.8505), ('d','magra',12345.67,12345.67);
CREATE TEMP TABLE huella AS SELECT md5(string_agg(float8send(subtotal)::text||float8send(total)::text, ',' ORDER BY id)) h FROM "Order";

-- La función espejo: una sola, compartida por todas las porciones. Args: (float, numeric, escala) repetidos.
CREATE FUNCTION d1_espejo() RETURNS trigger LANGUAGE plpgsql AS $f$
DECLARE n jsonb := to_jsonb(NEW); o jsonb; i int; cf text; cn text; esc int; vf float8; vn numeric;
BEGIN
  IF current_setting('d1.relleno', true) = 'on' THEN RETURN NEW; END IF;  -- el relleno escribe sólo la nueva
  IF TG_OP = 'UPDATE' THEN o := to_jsonb(OLD); END IF;
  FOR i IN 0 .. (TG_NARGS / 3 - 1) LOOP
    cf := TG_ARGV[i*3]; cn := TG_ARGV[i*3+1]; esc := TG_ARGV[i*3+2]::int;
    vf := (n ->> cf)::float8; vn := (n ->> cn)::numeric;
    IF TG_OP = 'INSERT' THEN
      IF vn IS NOT NULL THEN vf := vn::float8;            -- código nuevo: manda la nueva
      ELSIF vf IS NOT NULL THEN vn := round(vf::numeric, esc); END IF;  -- código viejo (la nueva no tiene DEFAULT)
    ELSIF (n -> cn) IS DISTINCT FROM (o -> cn) THEN vf := vn::float8;
    ELSIF (n -> cf) IS DISTINCT FROM (o -> cf) THEN vn := round(vf::numeric, esc);
    ELSE CONTINUE; END IF;
    IF vf IS NOT NULL AND (vf = 'NaN'::float8 OR vf IN ('Infinity'::float8, '-Infinity'::float8)) THEN
      RAISE EXCEPTION 'D1: %.% no es un importe (%)', TG_TABLE_NAME, cf, vf;
    END IF;
    n := jsonb_set(n, ARRAY[cf], COALESCE(to_jsonb(vf), 'null'::jsonb));
    n := jsonb_set(n, ARRAY[cn], COALESCE(to_jsonb(vn), 'null'::jsonb));
  END LOOP;
  NEW := jsonb_populate_record(NEW, n);
  RETURN NEW;
END $f$;

\echo '=== E1: expansión SIN autorizar la fila c (1851,8505): tiene que frenar y dejar la base igual'
CREATE TEMP TABLE d1_autorizadas(tabla text, columna text, id text, valor numeric);
\i d1-expandir-bloque.sql
SELECT count(*) AS columnas_nuevas FROM information_schema.columns WHERE table_name='Order' AND column_name LIKE '%\_num';
\echo '=== E2: expansión con la fila c autorizada por el dueño en 1851,85'
INSERT INTO d1_autorizadas VALUES ('Order','subtotal','c',1851.85),('Order','total','c',1851.85);
\i d1-expandir-bloque.sql
SELECT (SELECT h FROM huella) = md5(string_agg(float8send(subtotal)::text||float8send(total)::text, ',' ORDER BY id)) AS float_intacta_bit_a_bit FROM "Order";
SELECT id, total, total_num FROM "Order" ORDER BY id;

\echo '=== T1 código viejo: alta de $100 (el caso que el prototipo descartado dejaba en $0)'
INSERT INTO "Order"(id,"tenantId",subtotal,total) VALUES ('t1','beauty-spa',100,100);
\echo '=== T2 código viejo: alta sin importe (usa el DEFAULT 0 de la Float)'
INSERT INTO "Order"(id,"tenantId") VALUES ('t2','beauty-spa');
\echo '=== T3 código nuevo: alta con sólo la columna nueva (0,30)'
INSERT INTO "Order"(id,"tenantId",subtotal_num,total_num) VALUES ('t3','beauty-spa',0.30,0.30);
\echo '=== T4 código viejo: increment de la Float (+0,1 sobre 0,30000000000000004)'
UPDATE "Order" SET total = total + 0.1 WHERE id='b';
\echo '=== T5 código nuevo: seña de $3.000 que se cobra entera ($12.000): increment de la nueva'
INSERT INTO "Order"(id,"tenantId",subtotal_num,total_num) VALUES ('t5','beauty-spa',3000,3000);
UPDATE "Order" SET total_num = total_num + 9000 WHERE id='t5';
\echo '=== T6 update que no toca plata'
UPDATE "Order" SET nota='x' WHERE id='a';
SELECT id, subtotal, subtotal_num, total, total_num FROM "Order" WHERE id IN ('a','b','t1','t2','t3','t5') ORDER BY id;
\echo '=== T3b código nuevo: alta con sólo la nueva en una tabla cuya Float es NOT NULL SIN default (el NOT NULL se controla después del trigger BEFORE)'
ALTER TABLE "Order" ALTER COLUMN subtotal DROP DEFAULT;
INSERT INTO "Order"(id,"tenantId",subtotal_num,total_num) VALUES ('t3b','beauty-spa',7.25,7.25);
SELECT id, subtotal, subtotal_num FROM "Order" WHERE id='t3b';
\echo '=== T7 código viejo: NaN (tiene que fallar)'
INSERT INTO "Order"(id,"tenantId",subtotal,total) VALUES ('t7','beauty-spa','NaN','NaN');
\echo '=== T8 código viejo: fracción de centavo en vivo (queda la Float con fracción; el informe la lista)'
INSERT INTO "Order"(id,"tenantId",subtotal,total) VALUES ('t8','magra',10.005,10.005);
\echo '=== Informe antes de leer desde la nueva: filas donde la nueva no es el redondeo de la Float, o la Float tiene fracción'
SELECT id, total, total_num, (total_num <> round(total::numeric,2)) AS espejo_roto, (total::numeric <> round(total::numeric,2)) AS con_fraccion FROM "Order" WHERE total_num <> round(total::numeric,2) OR total::numeric <> round(total::numeric,2) ORDER BY id;
\echo '=== T9 bajo RLS con un rol sin BYPASSRLS: el espejo anda (no lee tablas)'
ALTER TABLE "Order" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Order" USING ("tenantId" = current_setting('app.current_tenant_id', true)) WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));
CREATE ROLE d1_rls_prueba NOLOGIN NOBYPASSRLS; GRANT SELECT, INSERT, UPDATE ON "Order" TO d1_rls_prueba;
BEGIN; SET LOCAL ROLE d1_rls_prueba; SELECT set_config('app.current_tenant_id','beauty-spa',true) \g /dev/null
INSERT INTO "Order"(id,"tenantId",subtotal,total) VALUES ('t9','beauty-spa',250.5,250.5);
SELECT id, total, total_num FROM "Order" WHERE id='t9';
COMMIT;
\echo '=== REVERSA de la expansión (migración nueva): se borra el espejo y la nueva; la Float tiene todo lo escrito en el medio'
DROP TRIGGER d1_espejo ON "Order"; ALTER TABLE "Order" DROP COLUMN subtotal_num, DROP COLUMN total_num;
SELECT id, total FROM "Order" ORDER BY id;
\echo '=== Barrido: todo x,xx5 de $0 a $10.000 (1.000.000 de valores) redondea hacia arriba con round(float::numeric,2)'
SELECT count(*) AS hacia_abajo FROM generate_series(0, 999999) k WHERE round(((k::numeric/100) + 0.005)::float8::numeric, 2) <> (k + 1)::numeric/100;
