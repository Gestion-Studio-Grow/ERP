/**
 * OAuth de Mercado Pago (ADR-025 §9) — flujo *authorization code*, con stub.
 *
 * El comercio autoriza UNA vez en el sitio de MP; arca recibe access/refresh
 * token y guarda las credenciales POR TENANT (cifradas at-rest en la versión
 * real). Nunca la contraseña del comercio, nunca scraping.
 *
 * Hexagonal: `MercadoPagoOAuthPort` (habla con MP) + `CredencialesStore`
 * (persistencia por tenant) + stubs. Listo para enchufar credenciales reales.
 */

import { CredencialesPort, MercadoPagoConfig } from "./port";

/** Tokens que devuelve el intercambio OAuth. */
export interface TokensOAuth {
  accessToken: string;
  refreshToken: string;
  /** Vencimiento del access token, epoch ms. */
  expiresAt: number;
  /** Id de la cuenta MP del comerciante (collector id). */
  collectorId: string;
}

/** Parámetros para armar la URL de autorización. */
export interface ParamsAutorizacion {
  clientId: string;
  redirectUri: string;
  /** Anti-CSRF: se valida en el callback. Típicamente lleva el tenant. */
  state: string;
}

/** Port hacia el OAuth de MP. */
export interface MercadoPagoOAuthPort {
  /** URL a la que se manda al comerciante para que autorice. */
  urlAutorizacion(params: ParamsAutorizacion): string;
  /** Intercambia el `authorization code` del callback por tokens. */
  intercambiarCodigo(code: string, redirectUri: string): Promise<TokensOAuth>;
  /** Renueva el access token con el refresh token. */
  refrescar(refreshToken: string): Promise<TokensOAuth>;
}

/** Persistencia de credenciales por tenant. Real = tabla cifrada; stub = memoria. */
export interface CredencialesStore {
  guardar(tenantId: string, config: MercadoPagoConfig): Promise<void>;
  obtener(tenantId: string): Promise<MercadoPagoConfig | null>;
}

const SEIS_HORAS_MS = 6 * 60 * 60 * 1000;

/**
 * Stub del OAuth de MP: sin red, tokens determinísticos derivados del code/refresh.
 * `ahora` es inyectable para no depender del reloj en tests.
 */
export class StubMercadoPagoOAuth implements MercadoPagoOAuthPort {
  constructor(private readonly ahora: () => number = () => Date.now()) {}

  urlAutorizacion(params: ParamsAutorizacion): string {
    const qs = new URLSearchParams({
      client_id: params.clientId,
      response_type: "code",
      platform_id: "mp",
      redirect_uri: params.redirectUri,
      state: params.state,
    });
    return `https://auth.mercadopago.com.ar/authorization?${qs.toString()}`;
  }

  async intercambiarCodigo(code: string, _redirectUri: string): Promise<TokensOAuth> {
    return {
      accessToken: `APP_USR-stub-${code}`,
      refreshToken: `TG-stub-${code}`,
      expiresAt: this.ahora() + SEIS_HORAS_MS,
      collectorId: `col-${code}`,
    };
  }

  async refrescar(refreshToken: string): Promise<TokensOAuth> {
    const semilla = refreshToken.replace(/^TG-stub-/, "");
    return {
      accessToken: `APP_USR-stub-${semilla}-r`,
      refreshToken,
      expiresAt: this.ahora() + SEIS_HORAS_MS,
      collectorId: `col-${semilla}`,
    };
  }
}

/** Store de credenciales en memoria (simulador/tests). */
export class CredencialesStoreEnMemoria implements CredencialesStore {
  private porTenant = new Map<string, MercadoPagoConfig>();

  async guardar(tenantId: string, config: MercadoPagoConfig): Promise<void> {
    this.porTenant.set(tenantId, config);
  }

  async obtener(tenantId: string): Promise<MercadoPagoConfig | null> {
    return this.porTenant.get(tenantId) ?? null;
  }
}

/**
 * Onboarding: el comerciante autorizó y volvió con un `code`; se intercambia por
 * tokens y se guardan para su tenant. Es el "vincular cuenta MP" (ADR-025 §9/§10).
 */
export async function vincularCuenta(
  tenantId: string,
  code: string,
  redirectUri: string,
  oauth: MercadoPagoOAuthPort,
  store: CredencialesStore,
): Promise<void> {
  const t = await oauth.intercambiarCodigo(code, redirectUri);
  await store.guardar(tenantId, {
    accessToken: t.accessToken,
    refreshToken: t.refreshToken,
    expiresAt: t.expiresAt,
    collectorId: t.collectorId,
  });
}

/**
 * `CredencialesPort` con refresh automático: entrega las credenciales del tenant
 * y renueva el access token si está por vencer (margen configurable).
 */
export class CredencialesConRefresh implements CredencialesPort {
  constructor(
    private readonly store: CredencialesStore,
    private readonly oauth: MercadoPagoOAuthPort,
    private readonly ahora: () => number = () => Date.now(),
    private readonly margenMs = 5 * 60 * 1000,
  ) {}

  async credencialesDe(tenantId: string): Promise<MercadoPagoConfig> {
    const actual = await this.store.obtener(tenantId);
    if (!actual) {
      throw new Error(`Cuenta MP no vinculada para el tenant ${tenantId} (falta OAuth).`);
    }
    const porVencer = actual.expiresAt !== undefined && actual.expiresAt - this.ahora() < this.margenMs;
    if (porVencer && actual.refreshToken) {
      const t = await this.oauth.refrescar(actual.refreshToken);
      const renovado: MercadoPagoConfig = {
        accessToken: t.accessToken,
        refreshToken: t.refreshToken,
        expiresAt: t.expiresAt,
        collectorId: t.collectorId,
      };
      await this.store.guardar(tenantId, renovado);
      return renovado;
    }
    return actual;
  }
}
