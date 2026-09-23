"use client";

// ============================================================================
// EL PEDIDO DE LA TIENDA — lo que comparten las cuatro vidrieras al enviar.
// ============================================================================
//
// Cada vidriera tiene su piel (MAGRA, Shine, la genérica, la réplica); lo que pasa al tocar
// «Enviar pedido» o «Pedir por WhatsApp» es lo mismo en todas y vive acá:
//
//   · El formulario NO se reinicia si el servidor rechaza: el envío va por `onSubmit` y la
//     acción se llama directo, no por `<form action>` (React reinicia los campos del form
//     después de una acción, también cuando volvió con un error). La bolsa es estado de React:
//     sobrevive siempre.
//   · El rechazo vuelve con su motivo (`EstadoPedidoOnline`): el general, arriba del botón, y
//     el de cada producto, al lado de su línea (`avisoDe`).
//   · «Pedir por WhatsApp» REGISTRA el pedido y después abre el chat con su número. La pestaña
//     se abre EN EL TOQUE, en blanco, y se lleva al chat cuando vuelve el servidor: un
//     `window.open` después de esperar la respuesta lo bloquea el navegador del celular.
//   · El cupón: «Aplicar» muestra cuánto descuenta (vista previa, sin gastar un uso); el
//     servidor lo vuelve a decidir, y lo consume, al tomar el pedido.

import { useState, useTransition, type FormEvent } from "react";
import { placeOnlineOrder } from "@/lib/order-actions";
import { probarCuponEnPedido } from "@/lib/coupon-actions";
import { montoDeCupon } from "@/lib/venta-reglas";
import { MENSAJE_NO_SE_PUDO, type EstadoPedidoOnline } from "./reglas-tienda";

// El redirect (a Gracias, o el de una sesión vencida) llega como excepción con digest
// NEXT_REDIRECT: se deja pasar para que Next navegue (el mismo helper que CobrarPedidoForm).
function isNextRedirect(e: unknown): boolean {
  const digest = (e as { digest?: unknown } | null)?.digest;
  return typeof digest === "string" && digest.startsWith("NEXT_REDIRECT");
}

export function usePedidoOnline(opts: {
  /** ¿El local publicó su WhatsApp? Sin número no se registra nada: se explica (WhatsAppCtaProvider). */
  hayWhatsApp: boolean;
  /** El pedido por WhatsApp quedó registrado: la vidriera vacía la bolsa y renueva la clave. */
  alRegistrar: () => void;
}) {
  // La acción se INVOCA DIRECTO y se espera su promesa, sin `useActionState`: en el libro de
  // caja ese camino dejó ~4 de cada 10 envíos colgados en "Guardando…" con la fila ya escrita
  // (caja/libro/LibroForms.tsx). En un pedido, eso es un cliente que vuelve a tocar.
  const [enviando, startTransition] = useTransition();
  const [estado, setEstado] = useState<EstadoPedidoOnline>(null);
  // Los avisos de línea que la persona ya corrigió se recuerdan atados a ESE estado: el
  // próximo envío los vuelve a mostrar desde cero.
  const [olvidados, setOlvidados] = useState<{ de: EstadoPedidoOnline; ids: readonly string[] }>({ de: null, ids: [] });

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const submitter = (e.nativeEvent as SubmitEvent).submitter;
    const fd = new FormData(e.currentTarget, submitter instanceof HTMLElement ? submitter : null);
    // En blanco y EN EL TOQUE: cuando el servidor conteste, se lleva al chat. Un `window.open`
    // después de esperar la respuesta lo bloquea el navegador del celular.
    const ventana = fd.get("via") === "whatsapp" && opts.hayWhatsApp ? window.open("about:blank", "_blank") : null;
    setEstado(null);
    startTransition(async () => {
      let r: EstadoPedidoOnline;
      try {
        r = await placeOnlineOrder(null, fd);
      } catch (err) {
        ventana?.close();
        if (isNextRedirect(err)) throw err;
        r = { ok: false, error: MENSAJE_NO_SE_PUDO };
      }
      if (r?.ok && r.whatsapp && ventana && !ventana.closed) {
        ventana.opener = null;
        ventana.location.href = r.whatsapp;
      } else {
        ventana?.close();
      }
      setEstado(r);
      if (r?.ok) opts.alRegistrar();
    });
  }

  const rechazo = !enviando && estado && !estado.ok ? estado : null;
  const ignorados = olvidados.de === estado ? olvidados.ids : [];

  return {
    onSubmit,
    enviando,
    error: rechazo ? { texto: rechazo.error, campo: rechazo.campo } : null,
    confirmado: !enviando && estado && estado.ok ? { code: estado.code, whatsapp: estado.whatsapp } : null,
    /** El aviso de una línea de la bolsa (sin stock, ya no está a la venta), o null. */
    avisoDe: (productId: string): string | null =>
      rechazo && !ignorados.includes(productId) ? (rechazo.porLinea?.[productId] ?? null) : null,
    /** Al cambiar una línea, su aviso viejo ya no dice nada cierto: se saca. */
    olvidarAviso: (productId: string) =>
      setOlvidados((o) => ({ de: estado, ids: o.de === estado ? [...o.ids, productId] : [productId] })),
  };
}

export type PedidoOnline = ReturnType<typeof usePedidoOnline>;

/**
 * El cupón (tienda y mostrador): lo que se escribió, la vista previa del descuento sobre la bolsa de
 * AHORA (se recalcula con `montoDeCupon` si la bolsa cambia) y el error, si lo hay.
 */
export function useCuponDePedido(base: number) {
  const [codigo, setCodigo] = useState("");
  const [aplicado, setAplicado] = useState<{ codigo: string; tipo: string; valor: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [probando, setProbando] = useState(false);

  async function aplicar() {
    const c = codigo.trim();
    if (!c) {
      setError("Escribí el código del cupón.");
      return;
    }
    setProbando(true);
    try {
      const r = await probarCuponEnPedido(c, base);
      if (r.ok) {
        setAplicado({ codigo: r.codigo, tipo: r.tipo, valor: r.valor });
        setCodigo(r.codigo);
        setError(null);
      } else {
        setAplicado(null);
        setError(r.error);
      }
    } catch {
      setError("No se pudo revisar el cupón ahora. Se vuelve a revisar al registrar la compra.");
    } finally {
      setProbando(false);
    }
  }

  return {
    codigo,
    cambiar: (v: string) => {
      setCodigo(v);
      if (aplicado && v.trim().toUpperCase() !== aplicado.codigo) setAplicado(null);
      setError(null);
    },
    aplicar,
    probando,
    aplicado,
    descuento: aplicado ? montoDeCupon(aplicado.tipo, aplicado.valor, base) : 0,
    error,
    limpiar: () => {
      setCodigo("");
      setAplicado(null);
      setError(null);
    },
  };
}

export type CuponDePedido = ReturnType<typeof useCuponDePedido>;
