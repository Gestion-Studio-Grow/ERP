// Declaraciones ambientales mínimas del runner de tests de Node (node:test + node:assert),
// para que `tsc` valide los .test.ts sin instalar @types/node. En CI con Node instalado,
// `node --test` los ejecuta con stripping de tipos nativo.
declare module "node:test" {
  export function test(name: string, fn: () => void | Promise<void>): void;
}
declare module "node:assert/strict" {
  interface Assert {
    (value: unknown, message?: string): void;
    ok(value: unknown, message?: string): void;
    equal(actual: unknown, expected: unknown, message?: string): void;
    deepEqual(actual: unknown, expected: unknown, message?: string): void;
  }
  const assert: Assert;
  export default assert;
}
