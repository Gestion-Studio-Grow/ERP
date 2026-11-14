\set ON_ERROR_STOP 0
SET ROLE app_rls; SELECT set_config('app.current_tenant_id','A',false);
\echo '== A1 autofirma: usuario del negocio inserta v2 con P4 solo y topes enormes'
INSERT INTO "AgenteAutorizacion" VALUES ('v1','A',1,'AUT-AGENTES-1','h','Ale Dirección',NULL,now(),'APP_CON_SESION','[{"op":"B2","modo":"solo"}]','{}',now()-interval '1 day',now()+interval '1 year',NULL,NULL);
INSERT INTO "AgenteAutorizacion" VALUES ('v2','A',2,'AUT-AGENTES-9','cualquiera','Ale Dirección (falso)',NULL,now(),'APP_CON_SESION','[{"op":"C5","modo":"solo"}]','{"C5":{"porOperacion":999999999999}}',now(),now()+interval '50 years',NULL,NULL);
\echo '== A2 revocar la vigente (v2) y releer como 07 §3.3 paso 1'
UPDATE "AgenteAutorizacion" SET "revocadaEl"=now() WHERE id='v2' AND "revocadaEl" IS NULL;
SELECT id, version FROM "AgenteAutorizacion" WHERE "revocadaEl" IS NULL AND "vigenteDesde"<=now() AND now()<"venceEl" ORDER BY version DESC LIMIT 1;
\echo '== A3 des-revocar y editar topes de una firmada (UPDATE sigue concedido)'
UPDATE "AgenteAutorizacion" SET "revocadaEl"=NULL, "topes"='{"x":1}' WHERE id='v2';
\echo '== A4 DELETE (debe fallar)'
DELETE FROM "AgenteAutorizacion" WHERE id='v1';
\echo '== F1 solicitadoPor falsificado: pedido de u-diseno, propuesta dice u-direccion'
INSERT INTO "AgentePedido"(id,"tenantId",puesto,"userId",tipo,clave,estado,"pedidoEl","venceEl") VALUES ('p1','A','cobranzas','u-diseno','LIBRE','k1','RECIBIDO',now(),now()+interval '1 hour');
INSERT INTO "AgentePropuesta"(id,"tenantId",puesto,tarea,herramienta,entidad,"entidadId",argumentos,resumen,"venceEl",clave,"pedidoId","solicitadoPor") VALUES ('x1','A','cobranzas','t','C5','cuota','c1','{}','{}',now()+interval '1 day','C5:cuota:c1','p1','u-direccion');
SELECT id,"pedidoId","solicitadoPor" FROM "AgentePropuesta" WHERE id='x1';
\echo '== F2 rutina con origen falso: pedidoId nulo y solicitadoPor nulo pero modo REGLA, sin rastro de quien adelanto'
\echo '== I1 REVERTIDA libera la clave: la rutina la vuelve a crear (skipDuplicates = ON CONFLICT DO NOTHING)'
UPDATE "AgentePropuesta" SET estado='EJECUTADA' WHERE id='x1';
UPDATE "AgentePropuesta" SET estado='REVERTIDA' WHERE id='x1';
INSERT INTO "AgentePropuesta"(id,"tenantId",puesto,tarea,herramienta,entidad,"entidadId",argumentos,resumen,"venceEl",clave) VALUES ('x2','A','cobranzas','rutina','C5','cuota','c1','{}','{}',now()+interval '1 day','C5:cuota:c1') ON CONFLICT DO NOTHING;
SELECT id, estado FROM "AgentePropuesta" WHERE clave='C5:cuota:c1' ORDER BY id;
\echo '== I2 clave NULL: no hay NOT NULL, dos iguales sin clave pasan el unico'
UPDATE "AgentePropuesta" SET estado='EJECUTADA' WHERE id='x2';
INSERT INTO "AgentePropuesta"(id,"tenantId",puesto,tarea,herramienta,entidad,"entidadId",argumentos,resumen,"venceEl",estado) VALUES ('n1','A','b','t','B2','mov','m1','{}','{}',now(),'EJECUTADA'),('n2','A','b','t','B2','mov','m1','{}','{}',now(),'EJECUTADA');
SELECT count(*) AS ejecutadas_sin_clave FROM "AgentePropuesta" WHERE "entidadId"='m1' AND estado='EJECUTADA';
\echo '== I3 B2 dos movimientos distintos a la misma cuota: claves distintas, las dos EJECUTADA'
INSERT INTO "AgentePropuesta"(id,"tenantId",puesto,tarea,herramienta,entidad,"entidadId",argumentos,resumen,"venceEl",estado,clave) VALUES ('b1','A','b','t','B2','mov','mA','{}','{}',now(),'EJECUTADA','B2:mov:mA:cuota:c9'),('b2','A','b','t','B2','mov','mB','{}','{}',now(),'EJECUTADA','B2:mov:mB:cuota:c9');
SELECT count(*) AS b2_misma_cuota FROM "AgentePropuesta" WHERE clave LIKE 'B2:%:cuota:c9' AND estado='EJECUTADA';
\echo '== I4 contra-operacion con la misma clave que la original EJECUTADA'
INSERT INTO "AgentePropuesta"(id,"tenantId",puesto,tarea,herramienta,entidad,"entidadId",argumentos,resumen,"venceEl",clave,"revierteA") VALUES ('r1','A','b','deshacer','B2-rev','mov','mA','{}','{}',now(),'B2:mov:mA:cuota:c9','b1');
\echo '== M1 moneda: contador sin moneda, monto negativo'
INSERT INTO "AgenteContador"("tenantId",puesto,tope,sujeto,periodo,monto) VALUES ('A','cobranzas','monto','contraparte:cli1','2026-11-14',-500000000);
SELECT tope,sujeto,monto FROM "AgenteContador";
\echo '== M2 montoCentavos negativo en propuesta'
UPDATE "AgentePropuesta" SET "montoCentavos"=-100 WHERE id='x2';
\echo '== T1 aislamiento: tenant B no ve las autorizaciones de A'
SELECT set_config('app.current_tenant_id','B',false); SELECT count(*) AS visibles_desde_B FROM "AgenteAutorizacion";
