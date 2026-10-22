# Runbooks de la suite de facturación

Para el que está de guardia (dueño o célula de Plataforma) y para soporte de primer nivel.
Todo lo que se ve acá se puede mirar **sin tocar Neon a mano** y **sin secretos**.

| Si pasa esto… | Andá a |
|---|---|
| El semáforo de `/api/ready` dice `critico` o `atencion` | [incidentes.md](incidentes.md) (cada código de alerta tiene su sección) |
| ARCA no responde / está caído | [incidentes.md §ARCA caído](incidentes.md#arca-caído) |
| Una factura quedó «en duda» (no se sabe si salió el CAE) | [incidentes.md §CAE en duda](incidentes.md#cae-en-duda) |
| Muchas facturas rechazadas de golpe | [incidentes.md §Rechazos masivos](incidentes.md#rechazos-masivos) |
| Venció el certificado de un negocio | [incidentes.md §Certificado vencido](incidentes.md#certificado-vencido) |
| El cron de las 3 de la mañana no corrió | [incidentes.md §Cron sin correr](incidentes.md#cron-sin-correr) |
| Un usuario pregunta algo («no me salió la factura») | [soporte.md](soporte.md) |
| Un deploy rompió algo y hay que volver atrás | [rollback.md](rollback.md) |
| Cómo ver errores, qué alertas configurar | [monitoreo.md](monitoreo.md) |
| Prender o apagar facturación automática por negocio | [flags.md](flags.md) |

**Reglas que no se negocian** (CLAUDE.md «Autorización y gates»):

- Un push a `main` **es** un deploy de producción en Vercel. Cambiar una variable de entorno en Vercel
  necesita un redeploy para tomar efecto: también es un deploy. Los dos los decide el dueño («deployá»).
- `prisma migrate deploy` y cualquier cambio de estructura en Neon son **Gate 2**: backup antes y OK del dueño.
- Los secretos (certificados, `CRON_SECRET`, cadenas de Neon) los pega **sólo el dueño**. Nunca van al chat
  ni al repo. Si uno se expuso, **se rota** (SEC-1).
- Una factura autorizada **no se borra**: se anula con nota de crédito. Ante la duda, no reemitas.

— Elaborado por GSG (Plataforma, publicación y mantenimiento)
