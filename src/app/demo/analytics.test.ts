import { test } from "node:test";
import assert from "node:assert/strict";

import { trackDemoEvent, demoRubroFromUrl } from "./analytics";

function withWindow<T>(w: Record<string, unknown> | undefined, fn: () => T): T {
  const original = (globalThis as { window?: unknown }).window;
  (globalThis as { window?: unknown }).window = w;
  try {
    return fn();
  } finally {
    (globalThis as { window?: unknown }).window = original;
  }
}

test("trackDemoEvent no hace nada sin window (SSR/build)", () => {
  withWindow(undefined, () => {
    assert.doesNotThrow(() => trackDemoEvent("demo_start"));
  });
});

test("trackDemoEvent no hace nada si no hay dataLayer ni fbq (sin GTM/Pixel cargado)", () => {
  withWindow({}, () => {
    assert.doesNotThrow(() => trackDemoEvent("demo_start", { rubro: "estetica" }));
  });
});

test("trackDemoEvent empuja a window.dataLayer si existe", () => {
  const dataLayer: unknown[] = [];
  withWindow({ dataLayer }, () => {
    trackDemoEvent("demo_step_completado", { escena: "agenda", paso: 1 });
  });
  assert.deepEqual(dataLayer, [{ event: "demo_step_completado", escena: "agenda", paso: 1 }]);
});

test("trackDemoEvent llama a window.fbq si existe", () => {
  const calls: unknown[] = [];
  withWindow({ fbq: (...args: unknown[]) => calls.push(args) }, () => {
    trackDemoEvent("cta_whatsapp_click", { rubro: "retail" });
  });
  assert.deepEqual(calls, [["trackCustom", "cta_whatsapp_click", { rubro: "retail" }]]);
});

test("demoRubroFromUrl lee utm_content", () => {
  withWindow(
    { location: { search: "?utm_source=ig&utm_content=carniceria" } },
    () => {
      assert.equal(demoRubroFromUrl(), "carniceria");
    },
  );
});

test("demoRubroFromUrl cae al fallback genérico sin utm_content", () => {
  withWindow({ location: { search: "" } }, () => {
    assert.equal(demoRubroFromUrl(), "generico");
  });
});
