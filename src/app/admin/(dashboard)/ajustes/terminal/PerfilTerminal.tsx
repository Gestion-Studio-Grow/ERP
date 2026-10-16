"use client";

// La pantalla «Este equipo»: elegir uno de los tres perfiles de fábrica y ajustarlo. Cada cambio
// se guarda en el acto en este navegador (es una preferencia del equipo, como prender un
// interruptor): no hay «Guardar» que olvidarse. Si el navegador no deja guardar (modo privado,
// almacén lleno) se dice, no se finge.

import { useId, useState } from "react";
import Link from "next/link";
import { Badge, Bloque, Button, Field, Input, Segmented, Select, Switch, buttonClasses } from "@/components/ui";
import {
  ANCHOS_DE_TICKET,
  LARGO_MAXIMO_DEL_PREFIJO,
  esDeFabrica,
  pantallaQueSePuedeAbrir,
  perfilDeFabrica,
  problemaDelPrefijo,
  type PantallaDeInicio,
  type PerfilDeTerminal,
  type SufijoDelLector,
  type TipoDeTerminal,
} from "@/lib/terminal/perfil-core";
import { usePerfilDeTerminal } from "@/lib/terminal/usar-perfil";

export type OpcionDePantalla = { ruta: PantallaDeInicio; nombre: string };

const TIPOS: { valor: TipoDeTerminal; etiqueta: string; detalle: string }[] = [
  {
    valor: "kiosco-pc",
    etiqueta: "PC de caja",
    detalle: "Computadora fija con lector e impresora de tickets. Ideal para mucho movimiento: súper, buffet, local con códigos de barra.",
  },
  {
    valor: "tablet-recepcion",
    etiqueta: "Tablet de recepción",
    detalle: "Para dar turnos y cobrar en la recepción. El ticket sale por WhatsApp o en PDF; impresora sólo si hay una PC al lado.",
  },
  {
    valor: "celular-mostrador",
    etiqueta: "Celular de mostrador",
    detalle: "El celular con el que cobrás en el mostrador. Vibra cuando algo sale bien o mal, y el ticket va por WhatsApp.",
  },
];

const SUFIJOS: { valor: SufijoDelLector; etiqueta: string }[] = [
  { valor: "enter", etiqueta: "Enter" },
  { valor: "tab", etiqueta: "Tab" },
  { valor: "ninguno", etiqueta: "Nada" },
];

type Estado = { tono: "ok" | "error"; texto: string } | null;

/** El valor del radio que se tocó dentro de un `Segmented` (el evento sube desde el radio). */
const valorElegido = (e: React.ChangeEvent<HTMLFieldSetElement>) => (e.nativeEvent.target as HTMLInputElement | null)?.value ?? "";

export default function PerfilTerminal({
  tenantSlug,
  userId,
  pantallas,
}: {
  tenantSlug: string;
  userId: string;
  pantallas: OpcionDePantalla[];
}) {
  const { perfil, listo, guardar } = usePerfilDeTerminal({ tenantSlug, userId });
  const [estado, setEstado] = useState<Estado>(null);
  // El prefijo se edita como texto libre: mientras no cierra, se muestra el problema y no se guarda.
  const [prefijo, setPrefijo] = useState<string | null>(null);
  const id = useId();

  if (!listo) {
    return (
      <p role="status" className="text-sm text-muted">
        Leyendo cómo está configurado este equipo…
      </p>
    );
  }

  const permitidas = pantallas.map((p) => p.ruta);
  const inicio = pantallaQueSePuedeAbrir(perfil, permitidas);
  const tipo = TIPOS.find((t) => t.valor === perfil.tipo) ?? TIPOS[0];
  const prefijoEnPantalla = prefijo ?? perfil.lector.prefijo;
  const problemaPrefijo = problemaDelPrefijo(prefijoEnPantalla);

  function cambiar(nuevo: PerfilDeTerminal, texto = "Listo, quedó guardado en este equipo.") {
    const ok = guardar(nuevo);
    setEstado(
      ok
        ? { tono: "ok", texto }
        : { tono: "error", texto: "No pudimos guardarlo en este navegador (¿está en modo privado?). Probá en una ventana normal." },
    );
  }

  function elegirTipo(t: TipoDeTerminal) {
    setPrefijo(null);
    cambiar(perfilDeFabrica(t), `Listo: este equipo es ${TIPOS.find((x) => x.valor === t)?.etiqueta.toLowerCase()}.`);
  }

  return (
    <div className="space-y-8">
      <Bloque titulo="Este equipo es…" nota={esDeFabrica(perfil) ? undefined : <Badge tone="accent">Ajustado</Badge>}>
        <div className="space-y-3 pt-3">
          <Segmented
            name={`${id}-tipo`}
            leyenda="Qué tipo de equipo es este"
            opciones={TIPOS.map((t) => ({ valor: t.valor, etiqueta: t.etiqueta }))}
            value={perfil.tipo}
            onChange={(e) => {
              const t = TIPOS.find((x) => x.valor === valorElegido(e));
              if (t) elegirTipo(t.valor);
            }}
            lleno
          />
          <p className="text-sm text-body">{tipo.detalle}</p>
          {!esDeFabrica(perfil) && (
            <Button variant="outline" size="sm" onClick={() => elegirTipo(perfil.tipo)}>
              Volver a como viene de fábrica
            </Button>
          )}
        </div>
      </Bloque>

      <Bloque titulo="Ticket">
        <div className="space-y-4 pt-3">
          <Segmented
            name={`${id}-ancho`}
            leyenda="Ancho del papel de la impresora"
            leyendaVisible
            opciones={[
              { valor: "58", etiqueta: "58 mm (chica)" },
              { valor: "80", etiqueta: "80 mm (grande)" },
            ]}
            value={String(perfil.anchoTicket)}
            onChange={(e) => {
              const ancho = ANCHOS_DE_TICKET.find((a) => String(a) === valorElegido(e));
              if (ancho) cambiar({ ...perfil, anchoTicket: ancho });
            }}
          />
          <Switch
            etiqueta="Imprimir solo al cobrar"
            detalle="Sin la ventanita de imprimir. Necesita la PC preparada como kiosco; en tablet o celular no anda."
            checked={perfil.impresionDirecta}
            onChange={(e) => cambiar({ ...perfil, impresionDirecta: e.target.checked })}
          />
        </div>
      </Bloque>

      <Bloque titulo="Avisos">
        <div className="space-y-1 pt-3">
          <Switch
            etiqueta="Sonido"
            detalle="Un pip cuando el producto entra y otro distinto cuando algo falla."
            checked={perfil.sonido}
            onChange={(e) => cambiar({ ...perfil, sonido: e.target.checked })}
          />
          <Switch
            etiqueta="Vibración"
            detalle="Para el celular: vibra en vez de (o además de) sonar."
            checked={perfil.vibracion}
            onChange={(e) => cambiar({ ...perfil, vibracion: e.target.checked })}
          />
        </div>
      </Bloque>

      <Bloque titulo="Lector de código de barras">
        <div className="space-y-4 pt-3">
          <Field
            label="Qué manda antes del código"
            htmlFor={`${id}-prefijo`}
            hint="Algunos lectores mandan un signo antes (por ejemplo *). Si no sabés, dejalo vacío."
            error={problemaPrefijo ?? undefined}
          >
            <Input
              id={`${id}-prefijo`}
              value={prefijoEnPantalla}
              maxLength={LARGO_MAXIMO_DEL_PREFIJO}
              autoComplete="off"
              spellCheck={false}
              aria-invalid={problemaPrefijo ? true : undefined}
              onChange={(e) => {
                const v = e.target.value;
                setPrefijo(v);
                if (problemaDelPrefijo(v) === null) cambiar({ ...perfil, lector: { ...perfil.lector, prefijo: v } });
              }}
              className="max-w-40 font-mono"
            />
          </Field>
          <Segmented
            name={`${id}-sufijo`}
            leyenda="Qué manda al final"
            leyendaVisible
            opciones={SUFIJOS}
            value={perfil.lector.sufijo}
            onChange={(e) => {
              const sufijo = SUFIJOS.find((x) => x.valor === valorElegido(e));
              if (sufijo) cambiar({ ...perfil, lector: { ...perfil.lector, sufijo: sufijo.valor } });
            }}
          />
        </div>
      </Bloque>

      <Bloque titulo="Atajo a tu pantalla">
        <div className="space-y-3 pt-3">
          <Field
            label="Con qué pantalla trabajás en este equipo"
            htmlFor={`${id}-inicio`}
            hint="Es un atajo: el botón de abajo te lleva directo. El panel igual abre en el Inicio, como siempre."
          >
            <Select
              id={`${id}-inicio`}
              value={inicio}
              onChange={(e) => {
                const p = pantallas.find((x) => x.ruta === e.target.value);
                if (p) cambiar({ ...perfil, pantallaInicio: p.ruta });
              }}
              className="max-w-xs"
            >
              {pantallas.map((p) => (
                <option key={p.ruta} value={p.ruta}>
                  {p.nombre}
                </option>
              ))}
            </Select>
          </Field>
          <Link href={inicio} className={buttonClasses("solid", "md")}>
            Ir a {pantallas.find((p) => p.ruta === inicio)?.nombre ?? "Inicio"}
          </Link>
        </div>
      </Bloque>

      {estado?.tono === "error" ? (
        <p role="alert" className="text-sm text-danger">
          {estado.texto}
        </p>
      ) : (
        <p role="status" aria-live="polite" className="text-sm text-muted">
          {estado?.texto ?? "Los cambios se guardan solos en este equipo. Si entra otra persona, ve su propia configuración."}
        </p>
      )}
    </div>
  );
}
