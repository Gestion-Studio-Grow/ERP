> **Procedencia:** recuperado del bundle `_recuperacion_inbox_20260710` (2026-07-10), documento fundacional del dueño. Incorporado a la rama fundacional sin alterar el contenido original.

---

# Addendum de Arquitectura — GSG (ERP SaaS multi-tenant)

**Documento:** Addendum decision-grade al documento fundacional de arquitectura v1
**Versión:** 1.1
**Fecha:** 10 de julio de 2026
**Ámbito:** Credenciales fiscales por tenant · Cumplimiento de datos personales (Argentina) · Dimensionamiento Neon · Disaster Recovery · Operación a escala
**Stack de referencia:** Next.js 16 · Prisma 7 · PostgreSQL en Neon · Vercel
**Modelo de tenancy:** Pool, *shared-schema* (todos los tenants en un esquema, particionados por `tenantId` con Row-Level Security)

**Convención:** los puntos marcados `[SUPUESTO]` no están confirmados por el dueño ni verificados contra una fuente primaria vigente y deben validarse antes de implementar.

---

## 0. Reformulación del principio "secreto por ámbito, no por cliente"

El documento v1 estableció el principio **"secreto por ámbito, no por cliente"**: las credenciales de infraestructura (cadena de conexión a la base, claves de API de terceros, tokens de plataforma) se emiten y rotan **por entorno** (dev / staging / prod), nunca por tenant, para no multiplicar superficie de ataque ni romper el modelo pool.

Ese principio **sigue vigente para secretos de infraestructura**. Pero la incorporación de facturación electrónica introduce una categoría nueva que el principio original no contemplaba: **el secreto fiscal por cliente**.

La reformulación explícita es la siguiente:

> **Existen dos clases de secretos con gobierno distinto.**
> **(a) Secretos de plataforma / infraestructura** → por ámbito (entorno), nunca por cliente. Sin cambios respecto de v1.
> **(b) Secretos de dato de negocio propiedad del tenant** → la credencial fiscal (CUIT + certificado X.509 + clave privada + punto de venta ARCA) es un **activo del cliente**, no un secreto de la plataforma. Es legítimamente **por cliente**, vive en el **plano de datos** (partitionado por `tenantId`, como cualquier otro dato del tenant), pero se lo protege con controles criptográficos elevados (sobre-cifrado con KMS y/o gestor de secretos dedicado).

Esta distinción **no rompe el modelo pool**: el cómputo y la base siguen siendo compartidos; lo único que se particiona por cliente es el *payload* de la credencial, exactamente igual que hoy se particiona la factura, el cliente o el asiento contable de cada tenant. El modelo pool se define por compartir *recursos* (compute, esquema, conexión), no por prohibir *datos sensibles por tenant*.

---

## 1. Credenciales fiscales por tenant

### 1.1. Qué se modela (anatomía de la credencial ARCA)

Para operar la facturación electrónica vía los web services de ARCA (ex-AFIP) —**WSAA** (autenticación) y **WSFE / WSFEv1** (comprobantes)— cada tenant necesita:

| Elemento | Naturaleza | Sensibilidad |
|---|---|---|
| CUIT del contribuyente | Identificador fiscal | Media (dato personal si es persona humana) |
| Certificado X.509 (`.crt`/`.pem`) | Público, emitido por ARCA | Baja |
| Clave privada del certificado (`.key`) | **Secreto crítico** | **Máxima** |
| Alias / Common Name del certificado | Metadato | Baja |
| Punto(s) de venta habilitado(s) | Configuración fiscal | Baja |
| Servicio(s) asociado(s) (ej. `wsfe`) | Configuración | Baja |
| Fecha de vencimiento del certificado | Metadato operativo | Baja (crítica para operación) |

El elemento que gobierna todo el diseño es la **clave privada**: quien la posee puede emitir comprobantes fiscales en nombre del contribuyente. Su compromiso es un incidente fiscal y de datos, no solo técnico.

### 1.2. Flujo de uso WSAA/WSFE (por qué importa dónde vive la clave)

1. El módulo de facturación arma un **Ticket de Requerimiento de Acceso (TRA)** y lo **firma con el certificado + la clave privada del tenant** (CMS/PKCS#7).
2. Envía el TRA firmado a **WSAA** y recibe un **Ticket de Acceso (TA)** = `token` + `sign`, válido típicamente ~12 horas.
3. Cachea el TA por tenant (en memoria o store cifrado) y con él llama a **WSFE** pasando el CUIT y el punto de venta, para autorizar comprobantes (CAE).

Consecuencia de diseño: **la clave privada solo se necesita en el paso 1**, una vez cada ~12 h por tenant. No se necesita en el *hot path* de cada factura. Esto permite **minimizar la exposición**: descifrar la clave solo dentro del worker de firma, en memoria efímera, y descartarla; nunca cargarla en el edge/serverless request path expuesto al cliente.

### 1.3. Dónde viven — decisión

Se descartan dos extremos: (i) clave privada en texto plano en la base, y (ii) clave privada en variable de entorno / secreto de plataforma (rompería "secreto por ámbito" y no escala a N tenants).

**Decisión recomendada: cifrado en base con sobre-cifrado (envelope encryption) respaldado por KMS, con opción de externalizar el material a un gestor de secretos dedicado en el escalón alto.**

Patrón de *envelope encryption*:

- Una **clave maestra (CMK/KEK)** vive en un **KMS** (por ejemplo AWS KMS, GCP KMS, o HashiCorp Vault Transit). Nunca sale del KMS.
- Por tenant se genera una **Data Encryption Key (DEK)**. La clave privada del certificado se cifra con la DEK (AES-256-GCM). La DEK se cifra ("wrap") con la CMK del KMS.
- En la base se guarda un registro por tenant con: `ciphertext` de la clave privada, `wrappedDEK`, IV/nonce, tag de autenticación, `keyVersion`. **Nunca** material en claro.
- Para firmar el TRA: el worker pide al KMS que "desenvuelva" la DEK, descifra la clave privada en memoria, firma, y descarta. Latencia: una llamada KMS cada ~12 h por tenant, despreciable.

[SUPUESTO] Elección concreta del KMS/gestor: dado que Neon corre sobre AWS y Vercel se integra bien con proveedores gestionados, la opción de menor fricción operativa es **AWS KMS + tabla cifrada en Neon** (evita otra pieza de infraestructura). Alternativas válidas: **Infisical / Doppler / HashiCorp Vault** si se prefiere un gestor de secretos externo con auditoría propia. La decisión final depende de qué nube de control ya use el dueño; debe confirmarse.

Tabla dedicada, aislada del resto:

```
TenantFiscalCredential
  tenantId        (FK, RLS obligatorio)
  cuit
  certPem                 -- público, puede ir en claro
  privateKeyCiphertext    -- AES-256-GCM
  wrappedDEK              -- DEK envuelta por CMK/KMS
  iv, authTag, keyVersion
  puntoVenta[]
  certNotAfter            -- vencimiento, para alertas
  status                  -- pending | validated | active | expiring | revoked
```

### 1.4. Aislamiento entre tenants (no filtrar credenciales)

- **Row-Level Security (RLS) obligatorio** sobre `TenantFiscalCredential`: toda consulta filtra por `tenantId` de sesión; una consulta sin contexto de tenant no devuelve filas. Esto complementa —no reemplaza— el filtrado por `tenantId` en la capa de aplicación (defensa en profundidad, dado que el pool comparte esquema).
- El worker de firma **resuelve la credencial por `tenantId`** derivado del contexto de la petición (no de un parámetro que el cliente pueda manipular).
- **Descifrado de vida corta**: la clave privada existe en claro solo en el stack del worker durante la firma; nunca se persiste descifrada, nunca se loguea, nunca se serializa a una respuesta.
- La CMK del KMS puede tener **política de acceso restringida al rol del worker de facturación**, de modo que ni siquiera un compromiso del request path web pueda desenvolver DEKs.

### 1.5. Rotación / renovación (los certificados caducan)

Los certificados de ARCA tienen vigencia limitada (habitualmente hasta ~2 años [SUPUESTO: verificar el plazo vigente en el trámite ARCA al momento de emitir]). Un certificado vencido detiene la facturación del tenant.

Gobierno del ciclo de vida:

- **Monitoreo de vencimiento**: job diario que evalúa `certNotAfter` y dispara alertas a **60 / 30 / 7 días** al operador y al cliente.
- **Estado `expiring`** que se refleja en el panel del tenant con un llamado a la acción para renovar.
- **Renovación**: el trámite en ARCA es manual (generar CSR, subir a ARCA, asociar el certificado al servicio `wsfe`). La plataforma **soporta dos certificados activos simultáneos** por tenant durante la ventana de rotación (solapamiento), para evitar cortes.
- **Revocación**: `status = revoked` invalida el uso inmediatamente y borra/rota la DEK.
- **Rotación de la CMK** del KMS: independiente y periódica; con versionado de claves (`keyVersion`) se re-envuelven las DEKs sin re-cifrar cada clave privada.

### 1.6. Auditoría de uso

- **Log de auditoría append-only** (tabla separada o store WORM) que registra, por cada firma TRA y cada emisión de comprobante: `tenantId`, `actor` (usuario/servicio), timestamp, punto de venta, tipo/número de comprobante, resultado, `keyVersion` usada. **Sin material secreto en el log.**
- **Registro de acceso a la credencial**: cada desenvolvimiento de DEK queda en el trail del KMS (CloudTrail/equivalente), lo que da una segunda fuente independiente de la aplicación.
- Retención acorde a la exigencia fiscal y a los plazos de conservación de datos personales.

### 1.7. Alta de credenciales en la fábrica de tenants (paso posterior, no en el provisioning)

**Decisión: la credencial fiscal NO se carga en el provisioning inicial del tenant.** El provisioning crea el registro del tenant, lo asigna al pool y habilita el ERP. La credencial fiscal se carga en un **paso posterior explícito**, ejecutado por el **cliente o el operador**, porque (a) el cliente frecuentemente aún no tiene el certificado emitido al momento del alta, y (b) desacopla el manejo de material criptográfico del flujo de aprovisionamiento automático.

Flujo recomendado:

1. **Alta / provisioning** (automático): crea `Tenant`, asigna al pool, deja `TenantFiscalCredential.status = pending`. Facturación electrónica **deshabilitada**.
2. **Carga de credencial** (paso manual, por cliente/operador, en pantalla dedicada): sube certificado + clave privada, ingresa CUIT y punto(s) de venta. La clave privada se cifra en el navegador o se transmite por canal TLS y se sobre-cifra en el servidor de inmediato.
3. **Validación** (`homologación`): la plataforma ejecuta una **llamada de prueba WSAA/WSFE contra el ambiente de homologación de ARCA** para confirmar que el certificado, la clave y el punto de venta funcionan. Solo si pasa → `status = validated`.
4. **Activación**: `status = active` habilita la emisión de comprobantes en producción.

Esto mantiene el provisioning determinista y sin secretos, y confina el manejo de la clave privada a un flujo auditado, validado y reversible.

---

## 2. Cumplimiento de datos personales (Argentina)

### 2.1. Estado normativo vigente (julio 2026)

A la fecha de este addendum, **la Ley 25.326 de Protección de Datos Personales sigue plenamente vigente** en Argentina, con anclaje constitucional en el art. 43 CN (acción de *habeas data*). No ha sido reemplazada.

Hay un **proceso de reforma activo pero no sancionado**: existen varios proyectos en el Congreso —entre ellos el proyecto **1751-D-2026 (dip. Martín Yeza)**, que propone reemplazar íntegramente la 25.326 (72 artículos, 13 títulos), y proyectos de los legisladores **Pablo Carro** y **Martín Doñate**, inspirados en el anteproyecto de la AAIP— que buscan alinear la norma con el **RGPD europeo** y la **LGPD brasileña**. Incorporan responsabilidad proactiva y demostrada, privacidad por diseño y por defecto, nuevos derechos (portabilidad, oposición a decisiones automatizadas) y bases de licitud ampliadas. [SUPUESTO] Ninguno es ley todavía; su estado debe reverificarse antes de tomar decisiones que dependan de la reforma.

**Recomendación estructural:** diseñar hacia el estándar RGPD/reforma (consentimiento granular, derechos ARCO+, registro de tratamientos, notificación de brechas), de modo que GSG quede *forward-compatible* con la reforma sin retrabajos, aun cumpliendo hoy con la 25.326 vigente.

### 2.2. Roles: quién es responsable y quién encargado

En el modelo SaaS, cada tenant (micro-empresa) es el **responsable del tratamiento** (controller) de los datos de sus clientes/empleados; **GSG es el encargado del tratamiento** (processor) que trata datos por cuenta del tenant. Esto obliga a GSG a:

- Ofrecer un **Acuerdo de Tratamiento de Datos (DPA)** como parte del contrato con cada tenant.
- No usar los datos del tenant para fines propios más allá de la prestación del servicio.
- Trasladar contractualmente al tenant las obligaciones de transferencia internacional (ver 2.3).

### 2.3. Residencia de datos y transferencia internacional (elección de región Neon)

**Hecho técnico:** Neon **no tiene región en Argentina**. Las regiones AWS relevantes son **São Paulo (`aws-sa-east-1`)** —la de menor latencia desde Argentina, datos alojados en Brasil— y opciones más lejanas como **Fráncfort (UE)** o **N. Virginia (EE. UU.)**.

**Hecho legal:** Argentina evalúa la transferencia internacional por **adecuación**. Los países/regiones considerados de protección adecuada por la AAIP incluyen la **UE/EEE, Suiza, Reino Unido, Uruguay, Canadá (sector privado), Nueva Zelanda, Israel, Andorra**, entre otros. **Brasil y EE. UU. NO están en esa lista.** Además, la propia Argentina goza de **decisión de adecuación de la Comisión Europea** (ratificada), lo que facilita el flujo con la UE.

Esto produce una tensión latencia vs. simplicidad legal:

| Opción de región | Latencia desde AR | Situación legal de la transferencia |
|---|---|---|
| **São Paulo (`sa-east-1`)** | La mejor (~30–50 ms) [SUPUESTO] | Brasil **no** es país adecuado → requiere mecanismo de transferencia (cláusulas contractuales modelo) |
| **Fráncfort (UE)** | Alta (~200–250 ms) [SUPUESTO] | UE **es** adecuada → transferencia sin barrera adicional |
| N. Virginia (EE. UU.) | Media-alta | EE. UU. **no** adecuado → requiere cláusulas contractuales |

**Recomendación concreta para GSG: São Paulo (`aws-sa-east-1`) + mecanismo de transferencia por cláusulas contractuales modelo.** Justificación: para un ERP transaccional de micro-empresas, la latencia es determinante de la experiencia; São Paulo la minimiza. La transferencia a Brasil se legitima adoptando las **cláusulas contractuales modelo aprobadas por la AAIP (Resolución 198/2023, que incorpora las cláusulas de la Red Iberoamericana de Protección de Datos)**, incluyendo la divulgación de la transferencia internacional y el consentimiento correspondiente en la política de privacidad y en el DPA con cada tenant.

Si el dueño prioriza **cero fricción legal** sobre latencia, la alternativa es **Fráncfort** (transferencia a país adecuado, sin cláusulas), asumiendo mayor latencia. Es una decisión de negocio que el addendum deja explícita para el dueño.

### 2.4. Derechos del titular

La 25.326 garantiza **acceso, rectificación, actualización y supresión** (*habeas data*). Los proyectos de reforma añaden **portabilidad** y **oposición a decisiones automatizadas**. Diseño:

- **Exportación self-service** de los datos de un titular (formato estructurado, JSON/CSV) → satisface acceso y adelanta portabilidad.
- **Rectificación** vía las pantallas de edición del ERP.
- **Supresión**: procedimiento de borrado que respete tanto al **tenant** (borrar sus datos al terminar el contrato) como al **titular individual** (borrar a un cliente/empleado del tenant), teniendo en cuenta que ciertos datos con **obligación legal de conservación fiscal** no pueden suprimirse hasta cumplir el plazo (base legal "obligación legal" prevalece temporalmente).

### 2.5. Deber de notificación de brechas

La 25.326 en su texto original no fija un plazo estricto de notificación de brechas, pero las **cláusulas modelo de la AAIP y los proyectos de reforma imponen notificar a la autoridad y a los titulares afectados** ante un incidente de seguridad. **Recomendación:** adoptar desde ya un **objetivo interno de notificación a 72 h** (estándar RGPD), con un runbook de respuesta a incidentes que incluya evaluación de impacto, notificación a la AAIP, notificación a los tenants afectados (como responsables) y registro del incidente.

### 2.6. Base legal para el tratamiento

Combinación aplicable:

- **Consentimiento** del titular (donde corresponda).
- **Ejecución contractual**: prestación del servicio ERP contratado por el tenant.
- **Obligación legal**: conservación de comprobantes y registros fiscales (ARCA), que además limita la supresión anticipada.

Los proyectos de reforma amplían a seis bases (sumando interés vital, interés público e **interés legítimo**), lo que dará más margen futuro; diseñar el registro de tratamientos para poder invocar la base correcta por finalidad.

### 2.7. Recomendación resumida (compliance)

Alojar en **São Paulo** con **cláusulas contractuales modelo AAIP (Res. 198/2023)**; ofrecer **DPA** a cada tenant; construir **export + borrado self-service**; adoptar **notificación de brechas a 72 h**; documentar **base legal por finalidad**; y **diseñar al estándar de la reforma** para no rehacer al sancionarse.

---

## 3. Plan de Neon — dimensionamiento

### 3.1. Plan recomendado: **Scale**

Para el modelo pool *shared-schema* en producción con clientes pagos, se recomienda el plan **Scale**. Las razones que lo separan de **Launch** son directamente los requisitos planteados:

| Requisito | Launch | **Scale** |
|---|---|---|
| Sin auto-suspend agresivo | Scale-to-zero tras 5 min (puede desactivarse) | **Scale-to-zero configurable de 1 min a "always-on"** → apropiado para clientes pagos |
| Autoscaling de compute | Hasta 16 CU | Hasta 16 CU (o tamaños fijos hasta 56 CU) |
| PITR / historial | Hasta 7 días | **Hasta 30 días** |
| Export de métricas/logs | No | **Sí** (observabilidad tenant-aware) |
| IP Allow / Private Networking | No | **Sí** |
| Límites de gasto (spending limits) | Sí | Sí |
| SOC 2 / HIPAA | No | **Disponible** (SOC 2; HIPAA con BAA) |
| Uptime SLA | No | **Sí** |
| Proyectos | 100 | 1.000 (ampliable) |

El diferencial decisivo: **PITR de 30 días, export de métricas/logs, IP Allow, SLA y opción SOC 2**, todos necesarios para un ERP con datos fiscales y personales. **Launch queda como opción solo para las primeras pruebas.**

### 3.2. Arquitectura pool sobre Neon (una base, no un proyecto por tenant)

- **Un proyecto / una base primaria / un esquema**; los tenants son filas particionadas por `tenantId` con RLS. No project-per-tenant (eso multiplicaría costos fijos y rompería el pool).
- **Conexiones:** con Vercel serverless + Prisma, usar **connection pooling de Neon (PgBouncer, hasta 10.000 conexiones agrupadas)**. Cadena de conexión *pooled*; Prisma configurado para PgBouncer (transaction mode, `pgbouncer=true`). Para operaciones que requieran conexión directa (migraciones), usar el endpoint no-pooled. Esto resuelve el problema clásico de agotamiento de conexiones en serverless.
- **PITR / DR:** el *history window* de 30 días habilita el restore a cualquier punto (ver §4).

### 3.3. Estimación de costo por rangos de tenants

Modelo de precios Scale (verificado en neon.com/pricing, julio 2026): compute **$0.222/CU-hora**, almacenamiento **$0.35/GB-mes**, *instant restore*/historial **$0.20/GB-mes**, egress 500 GB incluidos y luego $0.10/GB. Sin mínimo mensual.

Clave del modelo pool: **el costo lo maneja la carga agregada, no es lineal por tenant**. Un solo compute sirve a todos; el autoscaling sube con la demanda total.

Estimaciones **[SUPUESTO — órdenes de magnitud, no cotización]**, para tenants "chicos" (baja concurrencia, actividad en horario laboral):

| Escalón | Compute (supuesto de carga) | Storage | Historial | **Total mensual aprox.** | Features Neon del escalón |
|---|---|---|---|---|---|
| **10 tenants** | ~0.25 CU promedio; scale-to-zero *activable* fuera de hora → ~180–250 CU-h → **~$40–55** | ~2 GB → ~$0.70 | ~$1–2 | **~$45–70** | Scale; scale-to-zero corto; spending limit |
| **100 tenants** | picos 1–2 CU, promedio ~0.75 CU → ~540 CU-h → **~$120** | ~15 GB → ~$5 | ~$3–5 | **~$150–250** | Scale; IP Allow; export de métricas; autoscaling activo |
| **1000 tenants** | picos 4–8 CU, promedio ~2–3 CU → ~1.800 CU-h → **~$400**; sumar **read replica(s)** para reportes → +CU-h | ~120 GB → ~$42 | ~$20–30 | **~$600–1.200+** | Scale + **read replicas**; posible **sharding en varios proyectos**; evaluar **Enterprise**; considerar Private Networking |

Notas de escala: hacia los ~1000 tenants conviene (a) **separar la carga de lectura pesada (reportes) en read replicas**, (b) evaluar **particionado/sharding en más de un proyecto** por límite de conexiones o de blast radius, y (c) fijar **spending limits** con alertas al 80/100 % para evitar sorpresas por autoscaling. Todos los números dependen del patrón real de uso y deben recalibrarse con telemetría (§5).

---

## 4. Disaster Recovery real

### 4.1. Objetivos RPO / RTO

Para el segmento (micro-empresas, ERP con datos fiscales, criticidad alta del dato pero no de milisegundos):

- **RPO objetivo: ≤ 5 minutos.** El *history window* de Neon (PITR) permite restaurar a un punto prácticamente continuo dentro de la ventana; la pérdida máxima esperada es muy inferior a 5 min. [SUPUESTO] validar granularidad efectiva de PITR en el plan Scale.
- **RTO objetivo: ≤ 1–4 horas** para restauración total; el *instant restore* de Neon (branch desde timestamp, copy-on-write) es de minutos, por lo que el RTO lo domina la validación y el *cutover*, no la restauración física.

### 4.2. Recuperación total con PITR

Ante corrupción/pérdida global: crear un **branch en el timestamp objetivo** (instantáneo por copy-on-write), validar en él, y promover / redirigir la aplicación a ese branch (o restaurar la rama principal a ese punto). Con 30 días de historial hay margen amplio para detectar y revertir.

### 4.3. Restore selectivo por tenant (el caso difícil del pool)

**Problema:** en pool *shared-schema*, el PITR restaura **toda la base**. Si un solo tenant sufre corrupción o un borrado erróneo, no se puede hacer PITR global sin pisar los datos legítimos de los demás tenants generados después del punto malo.

**Procedimiento ensayado (export lógico filtrado por `tenantId`):**

1. **Snapshot de seguridad** de la base principal actual (branch de respaldo) antes de tocar nada.
2. **Branch histórico:** crear un branch en el timestamp anterior al incidente (instantáneo, sin afectar producción).
3. **Export filtrado del tenant** desde el branch histórico: como `pg_dump` no filtra por fila, extraer con `COPY (SELECT ... WHERE tenant_id = :X) TO ...` por cada tabla, **respetando el orden de las claves foráneas** (padres antes que hijos).
4. **Validación** del export (conteos, integridad referencial, unicidad) en staging.
5. **Reimportación transaccional** en la base principal: en una **única transacción**, borrar/reconciliar las filas de ese `tenantId` y reinsertar las del export; corregir secuencias; verificar constraints. Idempotente y reversible.
6. **Verificación post-restore** y cierre del incidente en el log de auditoría.

**Riesgos a gobernar explícitamente:**

- **Orden de FKs y secuencias:** un orden equivocado rompe la integridad; las secuencias mal reseteadas colisionan.
- **Ventana de pérdida del propio tenant:** cambios legítimos del tenant *posteriores* al punto malo se pierden si no se reconcilian; hay que acotar el punto con precisión.
- **Colisiones de unicidad** al reinsertar.
- **Contención/locks** sobre tablas compartidas durante la reimportación → ejecutar en ventana de mantenimiento y por lotes.
- **Escritura parcial:** por eso todo va en una transacción con rollback.
- Los **demás tenants no se tocan**, pero la operación compite por recursos del pool.

**Ensayo obligatorio:** *game-day* trimestral que ejecute el procedimiento completo en staging con datos sintéticos, cronometrando RTO real y validando el runbook. Un procedimiento de restore selectivo no ensayado **no cuenta como DR**.

---

## 5. Operación a escala

### 5.1. Observabilidad tenant-aware

- **`tenantId` en todo:** cada línea de log, cada span de traza y (con cuidado, ver abajo) cada métrica lleva `tenantId`. Propagarlo por el request con **AsyncLocalStorage** (Node/Next) para no pasarlo manualmente por cada capa.
- **Logging PII-safe:** logs estructurados (JSON); **nunca** loguear clave privada, certificado, token/sign de WSAA, ni datos personales innecesarios; **redacción/enmascarado** de CUIT y campos sensibles; hashing donde se necesite correlación sin exponer el valor.
- **Cardinalidad de métricas:** **no** usar `tenantId` como *label* de métricas de alta cardinalidad (Prometheus se degrada con miles de valores). Para métricas agregadas (latencia, error rate) mantener labels acotados; para el detalle por tenant usar **logs y trazas** (donde la alta cardinalidad es aceptable) o *exemplars*.
- **Export de Neon:** aprovechar el **export de métricas/logs del plan Scale** hacia Datadog/Grafana/OTel para unificar la observabilidad de base + aplicación.

### 5.2. Rate limiting y cuotas por tenant (el vecino ruidoso)

Como el pool comparte la base, un tenant abusivo puede degradar a todos **antes** de que la base misma reaccione. Defensa en la capa de aplicación:

- **Rate limiting por `tenantId`** con *token bucket* en un store rápido (Upstash Redis / Vercel KV), por endpoint y global por tenant.
- **Límites diferenciados** para operaciones pesadas (lotes de facturación, reportes, exports) frente a operaciones livianas.
- Respuesta **HTTP 429** con `Retry-After` y métricas de *throttling* por tenant.
- Complementar con los **spending limits de Neon** como red de contención de costo, no de latencia.

### 5.3. Billing / metering / entitlements por edición y plan

Dado que se promete **self-service con pago**:

- **Metering:** registrar eventos de uso por tenant (comprobantes emitidos, llamadas de API, almacenamiento, usuarios activos) en una **tabla de medición** y/o enviándolos a un proveedor de billing.
- **Entitlements:** mapa **plan → límites y features** (máximo de usuarios, comprobantes/mes, módulos habilitados). Cachear el entitlement por tenant.
- **Enforcement en la aplicación:** verificar el entitlement **antes** de ejecutar la acción (p. ej. bloquear el usuario N+1 o el comprobante que excede el plan), con mensajes claros de upgrade.
- **Self-service:** integrar checkout y webhooks (p. ej. Stripe, con planes/*metered billing*) que, ante pago o cambio de plan, **actualicen el entitlement** del tenant. [SUPUESTO] la elección del proveedor de pagos (Stripe u otro con soporte para Argentina/ARCA) debe confirmarse; puede requerir facturación local además del cobro internacional.

---

## Resumen para el dueño — decisiones que estos temas imponen

1. **Credencial fiscal = secreto por cliente, gobernado aparte.** Hay que costear e implementar sobre-cifrado con KMS (envelope encryption) y una tabla aislada con RLS; la clave privada nunca vive en claro ni en el request path web.
2. **La carga del certificado es un paso posterior al alta**, hecho por el cliente/operador y **validado contra homologación de ARCA** antes de facturar en producción; hay que construir esa pantalla y ese flujo.
3. **Región Neon = decisión legal, no solo técnica.** Recomendado **São Paulo + cláusulas contractuales modelo de la AAIP (Res. 198/2023)** por latencia; la alternativa "cero fricción" es Fráncfort (UE, país adecuado) resignando latencia. El dueño debe elegir.
4. **Compliance activo desde el día uno:** ofrecer DPA a cada tenant, export/borrado self-service, notificación de brechas a 72 h, y diseñar al estándar de la reforma (aún no sancionada) para no rehacer.
5. **Plan Neon = Scale** (no Launch): scale-to-zero configurable, PITR 30 días, export de métricas, IP Allow, SLA y SOC 2. Costo estimado ~$45–70/mes (10 tenants), ~$150–250 (100), ~$600–1.200+ (1000), a recalibrar con telemetría real.
6. **DR real exige ensayo:** definir RPO ≤ 5 min / RTO ≤ 1–4 h, y **ensayar trimestralmente** el restore selectivo por tenant (export filtrado por `tenantId`), que es delicado por FKs, secuencias y ventana de pérdida.
7. **Operar a escala requiere piezas nuevas:** observabilidad con `tenantId` y logging PII-safe, rate limiting por tenant contra el "vecino ruidoso", y un sistema de metering + entitlements + checkout para sostener el self-service con pago.

---

## Fuentes

- Ley 25.326 y reforma 2026: [Diario Judicial — ¿Sigue siendo suficiente la Ley 25.326 en 2026?](https://www.diariojudicial.com/news-103126-proteccion-de-datos-personales-sigue-siendo-suficiente-la-ley-25326-en-2026), [IAPP — Novedades legislativas Argentina (datos personales e IA)](https://iapp.org/news/a/novedades-legislativas-en-argentina-sobre-protecci-n-de-datos-personales-e-inteligencia-artificial), [IAPP — Nuevo proyecto de reforma del régimen de protección de datos](https://iapp.org/news/a/se-impulsa-un-nuevo-proyecto-de-reforma-del-r-gimen-de-protecci-n-de-datos-en-argentina), [Texto actualizado Ley 25.326 (HCDN)](https://www3.hcdn.gob.ar/dependencias/secparl/dgral_info_parlamentaria/dip/archivos/Ley_25326.pdf)
- Transferencias internacionales y cláusulas modelo: [Argentina.gob.ar — Transferencias internacionales](https://www.argentina.gob.ar/transferencias-internacionales), [AAIP Resolución 198/2023 (Boletín Oficial)](https://www.boletinoficial.gob.ar/detalleAviso/primera/296189/20231018), [IAPP — Nuevas cláusulas contractuales modelo](https://iapp.org/news/a/argentina-implementa-nuevas-clausulas-contractuales-modelo-para-la-transferencia-internacional-de-datos), [IAPP — La Comisión Europea ratifica la adecuación de Argentina](https://iapp.org/news/a/la-comision-europea-ratifica-que-la-argentina-cuenta-con-legislacion-adecuada-para-la-transferencia-internacional-de-datos-personales), [Argentina.gob.ar — Obligaciones de responsables](https://www.argentina.gob.ar/aaip/datospersonales/responsables/obligaciones)
- Neon planes, precios y regiones: [Neon — Pricing](https://neon.com/pricing), [Neon Docs — Plans](https://neon.com/docs/introduction/plans), [Neon Docs — Regions](https://neon.com/docs/introduction/regions)
