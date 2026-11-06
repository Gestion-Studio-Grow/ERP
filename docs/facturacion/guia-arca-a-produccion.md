# Guía para el dueño · ARCA: primero de prueba, después en serio

**Para quién:** el dueño del negocio (o quien tenga su clave fiscal). **Tiempo:** unos 40 minutos la primera vez.
**Qué necesitás:** CUIT del negocio, **clave fiscal nivel 3** y la compu con el panel del ERP abierto.

> En criollo: ARCA tiene dos «canchas». La de **homologación** es de práctica: las facturas no valen nada y
> sirven para probar. La de **producción** es la de verdad: cada factura vale y va al libro de IVA.
> Primero se juega en la de práctica; cuando todo sale bien, se pasa a la de verdad.

---

## 0. Antes de empezar: chequeo rápido

| Cosa | Dónde se ve | Si falta |
|---|---|---|
| Clave fiscal nivel 3 | ARCA → «Mis datos» | Se sube en una oficina de ARCA o con la app Mi ARCA (validación con DNI) |
| Condición frente al IVA (RI, Monotributo o Exento) | Constancia de inscripción | Sin eso el sistema no sabe si hacés A, B o C |
| Datos para la factura: razón social, domicilio fiscal, inicio de actividades, Ingresos Brutos | Constancia de inscripción y de IIBB | Sin ellos la factura sale, pero el **PDF no** |

---

## 1. Datos del negocio (en el ERP)

1. Entrá al panel → **Facturación → Conectar con ARCA** (`/admin/facturacion?vista=arca`).
2. **Paso 1 · Datos fiscales:** cargá CUIT, punto de venta y condición frente al IVA.
   - Mientras estés en prueba, el número de punto de venta puede ser cualquiera (por ejemplo, 1).
   - Para facturar en serio tiene que ser el que des de alta en el punto 4 de esta guía.
3. Completá también razón social, domicilio fiscal, inicio de actividades e Ingresos Brutos (en Factoque: **Mi cuenta**).
   Sin estos datos ARCA autoriza igual, pero el PDF no se puede armar.
4. Si sos **Responsable inscripto** y vas a hacer **Factura A**, avisanos qué régimen te asignó ARCA (A común o
   A con leyenda/M). Lo cargamos nosotros desde la consola. Hasta entonces, a un inscripto le sale la opción
   «Hacer Factura B».

## 2. El kit de prueba: certificado de homologación

El certificado es «la firma» con la que el ERP le habla a ARCA en tu nombre. El de prueba **no sirve para facturar en serio**.

1. En el ERP, **Paso 2 · Pedido de certificado** → «Generar pedido». Se baja un archivo `pedido-arca-….csr`
   (y aparece un botón «Copiar»). La clave privada no sale del sistema: queda guardada cifrada.
2. En ARCA, con tu clave fiscal, abrí **«WSASS - Autogestión Certificados Homologación»**.
   Si no lo ves: **Administrador de Relaciones de Clave Fiscal → Adherir servicio → ARCA → WSASS**.
3. **«Nuevo certificado»:** como nombre poné `gsg-erp` y pegá el pedido (lo que copiaste en el paso 1).
4. ARCA te muestra el certificado (un texto que empieza con `-----BEGIN CERTIFICATE-----`). Copialo entero.
5. En el ERP, **Paso 3 · Certificado de ARCA:** pegalo o subilo. Si es de otro CUIT o de otro pedido, el sistema te avisa.

## 3. Darle permiso al certificado para facturar (delegar wsfe)

Sin este paso ARCA contesta «no autorizado» aunque el certificado esté bien.

- **En homologación (prueba):** dentro de WSASS, **«Crear autorización a servicio»** → elegí el certificado
  `gsg-erp` → servicio **`wsfe`** (Facturación electrónica) → confirmar.
- **En producción (de verdad):** se hace distinto, en el punto 5.

## 4. Punto de venta para web service (para la etapa real)

Se puede hacer ahora, así está listo cuando pases a real.

1. En ARCA: **«Administración de puntos de venta y domicilios»** → elegí tu CUIT → **«A/B/M de Puntos de venta»** → **Agregar**.
2. Número: el que quieras que no estés usando (por ejemplo 4). Nombre de fantasía: el del negocio.
3. **Sistema:** el que dice **Web Services** — «RECE para aplicativo y web services» si sos Responsable inscripto,
   o «Factura Electrónica - Monotributo - Web Services» si sos monotributista. **No** elijas «Comprobantes en línea»: ese
   es para facturar a mano en la página de ARCA, y el ERP no puede usarlo.
4. Domicilio: el del local. Confirmá.
5. Ese número va en el **Paso 1** del ERP cuando pases a real.

## 5. La factura de prueba

1. Con el certificado de prueba cargado, en el ERP aparece **«Emitir un comprobante de verificación»** (Puesta a punto).
   Arma una Factura C chiquita a consumidor final y la manda a la cancha de práctica.
2. Si sale con **CAE** (14 números) y la leyenda «de prueba»: la conexión anda.
3. Si sale un error, el mensaje dice qué tocar. Los más comunes:
   - «no autorizado» → falta el punto 3 (delegar `wsfe`).
   - «certificado de otro CUIT» → pediste el certificado con otra clave fiscal.
   - «ARCA no responde» → es de ARCA; probá en un rato.
4. **Ojo:** las facturas autorizadas en prueba quedan guardadas. Hoy el pase a real **se frena** si el negocio tiene
   comprobantes autorizados en prueba (`src/lib/operador/pase-a-real.ts:233`), para no mezclar números de práctica
   con los de verdad. Por eso la prueba se hace con **el comprobante de verificación** (no entra al libro) y no
   facturando ventas reales en modo prueba. Si ya hay, avisanos y lo resolvemos antes del pase.

## 6. El paso a producción (facturación REAL)

Cuando la prueba salió bien:

1. **Certificado de producción** (es otro, no se reusa el de prueba):
   1. En el ERP, Paso 2 → generá un **nuevo** pedido de certificado.
   2. En ARCA: **«Administración de Certificados Digitales»** → **«Agregar alias»** → alias `gsg-erp`, archivo: el `.csr` nuevo → «Agregar alias».
   3. En la lista, **«Ver»** al lado de `gsg-erp` → **«Descargar»**: ese `.crt` es tu certificado. Subilo en el Paso 3.
2. **Delegar wsfe en producción:** **«Administrador de Relaciones de Clave Fiscal» → «Nueva relación» → «Buscar» →
   ARCA → «WebServices» → «Facturación Electrónica»**. En «Representante» tocá «Buscar» y elegí el certificado
   `gsg-erp` (aparece como «computador fiscal»). Confirmá. No le das permiso a otra persona: lo asociás a tu propio certificado.
3. En el Paso 1 del ERP, poné el **punto de venta Web Services** del punto 4.
4. **Pedí el pase.** El paso 4 del asistente («Pasar a producción») se habilita cuando el certificado de producción
   está cargado y los datos están completos. El pase lo confirma nuestro equipo desde la consola, revisando seis
   condiciones: CUIT válido, punto de venta, certificado de producción del mismo CUIT, condición frente al IVA,
   ARCA de la plataforma en real y que no queden comprobantes de prueba.
5. **Primera factura real:** hacé una factura chica a vos mismo o a un cliente de confianza, y fijate en
   ARCA → «Mis comprobantes» que aparezca con el mismo número y CAE. Desde ahí, todo lo que emitas vale.

## 7. Si algo sale mal en producción

- **Rechazada por ARCA:** la factura queda marcada con el motivo en criollo, **no gasta tu cupo** y podés volver a emitir.
- **Te equivocaste en una factura:** no se borra. Se **anula con una nota de crédito** (botón «Anular»), que también va a ARCA.
- **El certificado vence** (dura 2 años): repetí el punto 6.1 y 6.2 con un pedido nuevo; la numeración sigue igual.

---

### Qué probamos nosotros (QA fiscal, 06/11/2026)

Casos B con chip, A a inscripto, A sin régimen → B, C en Factoque, tope mensual, rechazo de ARCA, nota de
crédito y CAE/PDF/WhatsApp, con el arnés `scripts/qa/homologacion-arca-e2e.mjs`. **Corrieron con ARCA simulado**:
en el entorno de QA no hay certificado de homologación cargado y la red no llega a los servidores de prueba de
ARCA (`wsaahomo.afip.gov.ar`, `wswhomo.afip.gov.ar`). La prueba real en homologación queda para cuando el
dueño cargue el kit de los puntos 2 y 3 (y para grabar las respuestas reales de ARCA, BACKLOG ENG-317).
