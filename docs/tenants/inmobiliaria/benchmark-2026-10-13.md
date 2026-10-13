# Benchmark: Mapaprop y competidores (13/10/2026)

Para qué sirve: saber qué tiene hoy una inmobiliaria que usa Mapaprop, qué le duele, y qué tiene que
traer nuestro módulo para no ser un paso atrás. Cada dato lleva su nivel de confianza:
**[VERIFICADO]** (leído en la fuente ese día) o **[A VALIDAR]** (falta confirmarlo).

## 1. Mapaprop

- **No administra alquileres permanentes.** Sólo maneja reservas de alquiler temporario.
  [VERIFICADO, mapaprop.com/funciones]
- **Planes:** desde gratis hasta ARS 533.000 por mes. Para tener red entre inmobiliarias, chat con
  inteligencia artificial y APIs hace falta el plan Business, de ARS 93.900 por mes.
  [VERIFICADO, mapaprop.com/planes]
- **Publica en** Zonaprop, Argenprop, MercadoLibre, Cabaprop, Proppit y otros. El abono de cada
  portal se paga aparte. [VERIFICADO, mapaprop.com/publicacion]

### Lo que duele (documentado en su propio centro de ayuda)

- **Zonaprop:** en el modo XML los cambios pueden tardar hasta 12 horas. Si se vence el abono de
  Mapaprop, se despublica todo de Zonaprop.
- **Argenprop:** marcar una propiedad como vendida o alquilada no la saca de Argenprop.
- **MercadoLibre:** no hay publicación programada, y el título, la zona y la categoría no se
  sincronizan.
- **APIs:** sólo para proyectos aprobados.

No se encontraron reseñas independientes de usuarios de Mapaprop.

## 2. Otros sistemas

| Sistema | Qué se vio | Confianza |
|---|---|---|
| Tokko Broker | No tiene administración de alquileres propia (integra AsiProp). Los planes topean en 300 propiedades. Su app tiene 2,8 sobre 5 con 22 calificaciones en el App Store. | [VERIFICADO] |
| Xintel | Sí tiene contratos, actualizaciones automáticas, caja y factura de ARCA. | [VERIFICADO, xintel.com.ar] |
| AsiProp | Administración de alquileres. ARS 39.950 a 153.000. | [VERIFICADO, sitio del proveedor] |
| FORUX | Administración de alquileres. ARS 34.900 / 89.900 / 149.900. | [VERIFICADO, sitio del proveedor] |
| Inmosoft | Administración de alquileres. | [VERIFICADO, sitio del proveedor] |

Lo que ofrecen los sistemas de administración de alquileres (AsiProp, FORUX, Inmosoft): índices
ICL, IPC, UVA y Casa Propia; intereses por mora; liquidación con varios propietarios; portal del
inquilino y del propietario. [VERIFICADO en los sitios de cada proveedor]

## 3. Portales

- **Zonaprop (Navent):** tiene documentación de API en open-docs.navent.com/arg. Cómo se da de alta
  un integrador no es público. [A VALIDAR]
- **Argenprop:** no tiene documentación pública. Usa credenciales de integración que le manda a la
  inmobiliaria. [VERIFICADO, vía la ayuda de Mapaprop]
- **MercadoLibre:** API pública y documentada (OAuth, `POST /items`, categoría `MLA1459`).
  [VERIFICADO, vía extracto de búsqueda]

## 4. Normativa

- **Alquileres:** el DNU 70/2023, art. 249, derogó la Ley 27.551. Moneda e índice son libres.
  Diputados tiene sesión especial el 15/10/2026 para rechazar el DNU; el resultado todavía no se
  conoce. [VERIFICADO, prensa]
- **ICL:** sale de la API del Banco Central, `api.bcra.gob.ar/estadisticas/v4.0/Monetarias/40`
  (36,81 el 13/10/2026). Probada en vivo. [VERIFICADO]
- **IPC:** sale de `apis.datos.gob.ar`, serie `148.3_INIVELNAL_DICI_M_26`. Probada en vivo.
  [VERIFICADO]
- **RELI** (registro de contratos de alquiler): ya no es obligatorio en general, por la
  RG 5545/2024. [VERIFICADO]
- **Honorarios en la provincia de Buenos Aires** (Ley 10.973, art. 54): venta 1,5 % a 3 % cada
  parte; locación 1 % a 2 % cada parte; administración de alquileres 3 % a 10 %, a cargo del
  propietario. [VERIFICADO, normas.gba.gob.ar]

## 5. Conclusiones

### Imprescindible para no ser un paso atrás

- Publicar en los portales y que las consultas vuelvan al sistema.
- Migrar la cartera que la inmobiliaria ya tiene cargada.
- Bandeja de consultas (CRM: el seguimiento de cada interesado).
- Sitio web sincronizado con la cartera, con SEO (que lo encuentren los buscadores) y dominio propio.
- Reporte para el propietario.
- Usuarios y permisos.
- Averiguar si la inmobiliaria usa la red de Mapaprop (compartir propiedades con colegas).

### Diferenciales

- Administración de alquileres integrada, con descarga automática de los índices.
- Reglas según la fecha de cada contrato.
- Factura de ARCA.
- Portal del inquilino y del propietario.
- Recordatorios y recibos por WhatsApp.
- Despublicación automática cuando la propiedad se vende o se alquila.
- Tasación con comparables.
- App de celular estable.

— Elaborado por GSG
