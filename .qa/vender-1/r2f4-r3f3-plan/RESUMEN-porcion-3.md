# r2f4-r3f3-plan — porción 3 (2026-09-25): correcciones del refutador

## 1. Tope de facturas automáticas: el negocio ya no se lo sube solo
- src/plugins/bancos/domain/reglas.ts `capFacturasMesEfectivo`: con plan del catálogo vale el MENOR entre la columna del negocio y el tope del plan (o la excepción de GSG). Sin plan / CH: igual que siempre (columna o 159).
- Falla antes / pasa después: p3-reglas-ANTES-regla-vieja.txt (20 tests, 2 fallan: «un Micro que carga 100.000…», «para dar más hace falta la excepción de GSG») → p3-reglas-DESPUES.txt 20/20.
- Postgres (RLS): src/lib/uso-del-plan-postgres.test.ts 3/3 (p3-test-uso-del-plan-postgres.txt): Micro con columna 100000 ⇒ 159; fila forjada con canal admin no sube; excepción de consola 500 sube; columna 300 la baja; CH con columna 300 sigue en 300.
- OJO: el tope todavía no está enchufado en la emisión (bancos-glue.ts:265, :608, :658 y mercadopago-auto.ts:267 leen la columna ?? 159). Helper listo: `capFacturasMesDelNegocioEnTx` (src/lib/uso-del-plan.ts). Pedido afuera.

## 2. La prueba de concurrencia ahora distingue con candado de sin candado
- src/lib/usuarios-del-plan-postgres.test.ts: cruce forzado (T0 sin confirmar con el mismo email frena al alta A dentro de su transacción; B arranca y tiene que quedar esperando el candado).
- Con candado: 3/3 corridas verdes (p3-usuarios-postgres-con-candado-{1,2,3}.txt).
- Sin `pg_advisory_xact_lock` (mutación): 3/3 corridas ROJAS «B no esperó a A» (p3-usuarios-postgres-SIN-candado-*.txt). Archivo restaurado, md5 igual (p3-mutacion-md5-antes/despues.txt).

## 3. Sin 404: pantalla «Tu plan»
- Decisión (simple y reversible): vive en /admin/usuarios/plan, bajo la guardia de la app Usuarios (requireApp("usuarios"), sólo el dueño). /admin/tu-plan pediría registrar una app nueva en src/apps/catalogo/administracion.ts (ajeno) y rompía guardia-paginas y tsc. CH: redirige a /admin/usuarios (nada nuevo visible).
- Archivos: usuarios/plan/{page.tsx, tu-plan.ts, tu-plan.test.ts}, src/lib/uso-del-plan.ts; DESTINO_SIN_LUGAR_USUARIOS = RUTA_TU_PLAN + ?no-se-pudo=usuarios.
- Falla antes / pasa después: p3-test-tu-plan-ANTES-destino-viejo.txt (1 falla: «llega a una página que existe») → p3-test-tu-plan.txt 8/8.
- Muestra plan, precio «provisional a confirmar», uso medido (personas activas, comprobantes del mes) y lo demás sólo como «Hasta N» (no inventa uso). «Quiero más» abre WhatsApp: con WHATSAPP_GSG va a GSG; sin número, WhatsApp pide elegir contacto.

## 4. Laboratorio erp_lab (Postgres local), no base sintética
- scripts/qa/r2f4-plan-magra-lab.ts (se niega a correr fuera del Postgres local; deja el negocio como estaba).
- magra (datos reales del lab: 56 tablas, 4716 filas, 3 locales vinculados): Micro y Comerciante RECHAZADOS con el motivo «Tiene 3 locales vinculados a su red y el plan … no lo trae»; ninguna fila cambió (p3-lab-erp_lab-magra-micro-pyme.txt, p3-lab-erp_lab-magra-comerciante-pyme.txt). El criterio «magra pasa de Micro a PyME y vuelve» no se puede cumplir con magra tal como está: sólo PyME trae «Mis locales».
- qa-magra-adrogue (carnicería del lab, sin red): Micro → PyME → Micro OK, 56 tablas con los mismos conteos, mismas 34 pantallas y 8 módulos, vista previa = base, restaurado (p3-lab-erp_lab-qa-magra-adrogue-micro-pyme.txt).

## Verificación
- npx tsc --noEmit: 0 errores. eslint --max-warnings=0 en los 12 archivos tocados: 0 (p3-eslint.txt).
- Vecinos (p3-tests-vecinos.txt): 496 tests, 489 ok. Rojos: 2 guardia-negocio.test.ts (ajeno: registrar plan-actions.ts), 1 trinquete plan-formulario (arreglado después: 6/6, p3-test-plan-formulario.txt), 4 xlsx del plugin bancos (stub local de xlsx: CDN bloqueado, ajeno a este frente).
- guardia-paginas + paridad-menu: 13/13 (p3-test-guardia-y-paridad.txt).
