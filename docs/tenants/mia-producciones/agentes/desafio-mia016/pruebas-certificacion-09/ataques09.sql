\set ON_ERROR_STOP 0
\pset tuples_only on
SET app.current_tenant_id = 'A';
SET ROLE app_rls;
INSERT INTO "AgentePedido"(id,"tenantId",puesto,"userId",tipo,clave,estado,"pedidoEl","venceEl",recorte)
  VALUES ('p1','A','cobranzas','u-diseno','LISTA','k1','RECIBIDO',now(),now()+interval '1 day','{"rol":"DISENO"}');
\echo '== D1a: REVOKE UPDATE por columna (como esquema unificado) -> app_rls cambia userId y recorte?'
UPDATE "AgentePedido" SET "userId"='u-direccion', recorte='{"rol":"DIRECCION"}' WHERE id='p1';
SELECT 'D1a resultado: userId=' || "userId" || ' recorte=' || recorte::text FROM "AgentePedido" WHERE id='p1';
RESET ROLE;
SELECT 'D1a privilegio de columna userId UPDATE: ' || has_column_privilege('app_rls','"AgentePedido"','userId','UPDATE');
\echo '== D1b: forma del 09: REVOKE de tabla + GRANT por columnas'
REVOKE UPDATE ON "AgentePedido" FROM app_rls;
GRANT UPDATE ("estado","tomadoHasta","intentos","respondidoEl","respuesta","filas","motivo","conModelo","respondidoPor") ON "AgentePedido" TO app_rls;
SET ROLE app_rls;
UPDATE "AgentePedido" SET "userId"='u-otro' WHERE id='p1';
UPDATE "AgentePedido" SET recorte='{"rol":"X"}' WHERE id='p1';
UPDATE "AgentePedido" SET estado='EN_CURSO', intentos=intentos+1 WHERE id='p1';
SELECT 'D1b despues: userId=' || "userId" || ' estado=' || estado FROM "AgentePedido" WHERE id='p1';
RESET ROLE;
\echo '== D1c: correr 0002_app_role.sql de nuevo (GRANT ... ON ALL TABLES) deshace D1b?'
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_rls;
SET ROLE app_rls;
UPDATE "AgentePedido" SET "userId"='u-tras-0002' WHERE id='p1';
SELECT 'D1c userId=' || "userId" FROM "AgentePedido" WHERE id='p1';
RESET ROLE;
-- restaurar D1b para lo que sigue
REVOKE UPDATE ON "AgentePedido" FROM app_rls;
GRANT UPDATE ("estado","tomadoHasta","intentos","respondidoEl","respuesta","filas","motivo","conModelo","respondidoPor") ON "AgentePedido" TO app_rls;
REVOKE UPDATE, DELETE ON "AgenteAutorizacion" FROM app_rls;
GRANT UPDATE ("revocadaEl","revocadaPor","motivoRevocacion","reemplazadaEl") ON "AgenteAutorizacion" TO app_rls;
REVOKE UPDATE, DELETE ON "AgenteAccion" FROM app_rls;
UPDATE "AgentePedido" SET "userId"='u-diseno' WHERE id='p1';

SET ROLE app_rls;
\echo '== A1: v1 topes amplios, firmar v2 (reemplaza v1), revocar v2, des-reemplazar v1'
INSERT INTO "AgenteAutorizacion"(id,"tenantId",version,"textoVersion","textoHash",firmante,"firmanteUserId","firmadoEl",metodo,operaciones,topes,"vigenteDesde","venceEl")
 VALUES ('a1','A',1,1,'h1','Titular','u-owner',now(),'APP_CON_SESION','[{"operacion":"C4"}]','{"C4":{"porOperacion":{"ARS":999999999}}}',now(),now()+interval '1 year');
BEGIN;
UPDATE "AgenteAutorizacion" SET "reemplazadaEl"=now() WHERE id='a1';
INSERT INTO "AgenteAutorizacion"(id,"tenantId",version,"textoVersion","textoHash",firmante,"firmanteUserId","firmadoEl",metodo,operaciones,topes,"vigenteDesde","venceEl")
 VALUES ('a2','A',2,1,'h2','Titular','u-owner',now(),'APP_CON_SESION','[{"operacion":"C4"}]','{"C4":{"porOperacion":{"ARS":100}}}',now(),now()+interval '1 year');
COMMIT;
UPDATE "AgenteAutorizacion" SET "revocadaEl"=now(), "revocadaPor"='u-owner' WHERE id='a2';
UPDATE "AgenteAutorizacion" SET "reemplazadaEl"=NULL WHERE id='a1';
SELECT 'A1 vivas: ' || string_agg(id || ' topes=' || topes::text, ', ') FROM "AgenteAutorizacion" WHERE "revocadaEl" IS NULL AND "reemplazadaEl" IS NULL;
\echo '== A2: firmante_check se esquiva con otro metodo y sin firmanteUserId'
UPDATE "AgenteAutorizacion" SET "revocadaEl"=now() WHERE id='a1';
INSERT INTO "AgenteAutorizacion"(id,"tenantId",version,"textoVersion","textoHash",firmante,"firmanteUserId","firmadoEl",metodo,operaciones,topes,"vigenteDesde","venceEl")
 VALUES ('a3','A',3,1,'h3','cualquiera',NULL,now(),'OPS','[{"operacion":"C4"}]','{"C4":{"porOperacion":{"ARS":999999999}}}',now(),now()+interval '1 year');
SELECT 'A2 aceptada: ' || id || ' metodo=' || metodo || ' firmanteUserId=' || coalesce("firmanteUserId",'NULL') FROM "AgenteAutorizacion" WHERE id='a3';
\echo '== A3: candado nulo sobre nulo (llaves paso 2) con permiso de columna y disparador'
UPDATE "AgenteAutorizacion" SET "revocadaEl"=NULL WHERE id='a3' AND "tenantId"='A' AND "revocadaEl" IS NULL AND "reemplazadaEl" IS NULL;
\echo '== A4: revocadaEl en el futuro (revocacion programada) — sigue usable?'
\echo '== F1: propuesta PEDIDO con pedidoId y solicitadoPor NULL (FK MATCH SIMPLE)'
INSERT INTO "AgentePropuesta"(id,"tenantId",puesto,tarea,herramienta,entidad,"entidadId",argumentos,resumen,"venceEl",clave,origen,modo,"pedidoId","solicitadoPor")
 VALUES ('f1','A','cobranzas','t','C4','cuota','q1','{}','{}',now()+interval '1 day','C4:cuota:q1','PEDIDO','PERSONA','p1',NULL);
SELECT 'F1 aceptada: pedidoId=' || "pedidoId" || ' solicitadoPor=' || coalesce("solicitadoPor",'NULL') FROM "AgentePropuesta" WHERE id='f1';
\echo '== F2: propuesta con pedido p1 y solicitadoPor falso (debe fallar)'
INSERT INTO "AgentePropuesta"(id,"tenantId",puesto,tarea,herramienta,entidad,"entidadId",argumentos,resumen,"venceEl",clave,origen,modo,"pedidoId","solicitadoPor")
 VALUES ('f2','A','cobranzas','t','C4','cuota','q2','{}','{}',now()+interval '1 day','C4:cuota:q2','PEDIDO','PERSONA','p1','u-direccion');
\echo '== F3: pedido derivado (K5) con userId de otra persona: la base no ata el derivado al original'
INSERT INTO "AgentePedido"(id,"tenantId",puesto,"userId",tipo,clave,estado,"pedidoEl","venceEl",recorte)
  VALUES ('p2','A','bancos','u-direccion','LISTA','k2','RECIBIDO',now(),now()+interval '1 day','{"rol":"DIRECCION"}');
SELECT 'F3 aceptado: ' || id || ' userId=' || "userId" FROM "AgentePedido" WHERE id='p2';
\echo '== I1: RECHAZADA por una persona libera la clave: la rutina la vuelve a crear'
UPDATE "AgentePropuesta" SET estado='RECHAZADA', "decididaPor"='u-admin' WHERE id='f1';
INSERT INTO "AgentePropuesta"(id,"tenantId",puesto,tarea,herramienta,entidad,"entidadId",argumentos,resumen,"venceEl",clave,origen,modo,"autorizacionId")
 VALUES ('i1','A','cobranzas','t','C4','cuota','q1','{}','{}',now()+interval '1 day','C4:cuota:q1','RUTINA','REGLA','a3') ON CONFLICT DO NOTHING;
SELECT 'I1 filas con la clave C4:cuota:q1: ' || string_agg(id||'='||estado, ', ') FROM "AgentePropuesta" WHERE clave='C4:cuota:q1';
\echo '== I2: REVERTIDA sigue ocupando la clave (H8, debe no insertar)'
UPDATE "AgentePropuesta" SET estado='REVERTIDA' WHERE id='i1';
INSERT INTO "AgentePropuesta"(id,"tenantId",puesto,tarea,herramienta,entidad,"entidadId",argumentos,resumen,"venceEl",clave,origen,modo,"autorizacionId")
 VALUES ('i2','A','cobranzas','t','C4','cuota','q1','{}','{}',now()+interval '1 day','C4:cuota:q1','RUTINA','REGLA','a3') ON CONFLICT DO NOTHING;
SELECT 'I2 filas: ' || count(*) FROM "AgentePropuesta" WHERE clave='C4:cuota:q1';
\echo '== I3: unico parcial viejo de 1A (herramienta,entidad,entidadId PENDIENTE) choca con la clave por cuota de B2'
INSERT INTO "AgentePropuesta"(id,"tenantId",puesto,tarea,herramienta,entidad,"entidadId",argumentos,resumen,"venceEl",clave,origen,modo)
 VALUES ('i3','A','bancos','t','B2','cuota','q9','{}','{}',now()+interval '1 day','B2:cuota:q9','RUTINA','PERSONA');
\echo '== D3: fuenteId vacio pasa el CHECK'
INSERT INTO "AgentePropuesta"(id,"tenantId",puesto,tarea,herramienta,entidad,"entidadId",argumentos,resumen,"venceEl",clave,origen,modo,"autorizacionId","montoCentavos",moneda,"fuenteId")
 VALUES ('d3','A','cobranzas','t','C4','cuota','q5','{}','{}',now()+interval '1 day','C4:cuota:q5','RUTINA','REGLA','a3',100,'ARS','');
SELECT 'D3 aceptada con fuenteId vacio: ' || id FROM "AgentePropuesta" WHERE id='d3';
\echo '== D4: modo con cualquier valor (sin CHECK de dominio)'
INSERT INTO "AgentePropuesta"(id,"tenantId",puesto,tarea,herramienta,entidad,"entidadId",argumentos,resumen,"venceEl",clave,origen,modo,"montoCentavos",moneda)
 VALUES ('d4','A','cobranzas','t','C4','cuota','q6','{}','{}',now()+interval '1 day','C4:cuota:q6','RUTINA','regla',100,'ARS');
SELECT 'D4 aceptada: modo=' || coalesce(modo,'NULL') || ' sin autorizacion ni fuente' FROM "AgentePropuesta" WHERE id='d4';
\echo '== D4b: autorizacionVersion no atada a la version de la autorizacion'
INSERT INTO "AgentePropuesta"(id,"tenantId",puesto,tarea,herramienta,entidad,"entidadId",argumentos,resumen,"venceEl",clave,origen,modo,"autorizacionId","autorizacionVersion")
 VALUES ('d4b','A','cobranzas','t','K4','x','x1','{}','{}',now()+interval '1 day','K4:x','RUTINA','REGLA','a3',99);
SELECT 'D4b aceptada: autorizacionVersion=' || "autorizacionVersion" || ' (a3 es v3)' FROM "AgentePropuesta" WHERE id='d4b';
\echo '== P1: decididaPor = solicitadoPor (quien pidio aprueba lo propio)'
INSERT INTO "AgentePropuesta"(id,"tenantId",puesto,tarea,herramienta,entidad,"entidadId",argumentos,resumen,"venceEl",clave,origen,modo,"pedidoId","solicitadoPor",estado,"decididaPor")
 VALUES ('p1x','A','cobranzas','t','C4','cuota','q7','{}','{}',now()+interval '1 day','C4:cuota:q7','PEDIDO','PERSONA','p1','u-diseno','EJECUTADA','u-diseno');
SELECT 'P1 aceptada: ' || id FROM "AgentePropuesta" WHERE id='p1x';
RESET ROLE;
