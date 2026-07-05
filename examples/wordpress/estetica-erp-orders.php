<?php
/**
 * Plugin Name: Estética ERP — Ingesta de pedidos (backoffice-only)
 * Description: Reenvía cada pedido de este sitio (WooCommerce o formulario propio)
 *              a la API de pedidos del backoffice Estética ERP. El sitio del
 *              cliente sigue siendo el suyo; solo suma esta llamada cuando entra
 *              un pedido. Superficie II de ADR-020.
 * Version:     0.1.0 (stub / provisional a confirmar)
 *
 * ------------------------------------------------------------------------------
 * STUB de referencia — NO es un plugin de producción. Muestra el contrato mínimo
 * para llamar `POST /api/public/v1/orders`. Adaptá el mapeo de items a tu
 * catálogo real. Contrato completo: docs/integrations/api-pedidos-externos.md
 * ------------------------------------------------------------------------------
 *
 * Configuración (wp-config.php o donde manejes secretos — NO hardcodear la clave):
 *   define('ESTETICA_ERP_BASE_URL', 'https://TU-BACKOFFICE.example');
 *   define('ESTETICA_ERP_API_KEY',  'la-api-key-secreta-del-tenant');
 *   define('ESTETICA_ERP_TENANT',   'magra');
 */

if (!defined('ABSPATH')) {
    // Permite `php estetica-erp-orders.php` como demo fuera de WordPress.
    define('ABSPATH', __DIR__);
}

/**
 * Envía un pedido al backoffice Estética ERP.
 *
 * @param array $order {
 *   @type array  customer     ['name' => ..., 'phone' => ..., 'address' => ?, 'email' => ?]
 *   @type string fulfillment  'PICKUP' | 'DELIVERY'
 *   @type array  items        lista de ['productId'|'sku'|'name' => ..., 'quantity' => float]
 *   @type array  payment      ['paid' => bool, 'method' => 'MERCADOPAGO'|'EFECTIVO'|'TRANSFERENCIA']
 *   @type string external_ref id del pedido en este sitio (idempotencia/traza)
 *   @type string notes        opcional
 * }
 * @return array ['ok' => bool, 'status' => int, 'body' => array]
 */
function estetica_erp_send_order(array $order): array
{
    $base   = defined('ESTETICA_ERP_BASE_URL') ? ESTETICA_ERP_BASE_URL : '';
    $key    = defined('ESTETICA_ERP_API_KEY') ? ESTETICA_ERP_API_KEY : '';
    $tenant = defined('ESTETICA_ERP_TENANT') ? ESTETICA_ERP_TENANT : '';

    if ($base === '' || $key === '' || $tenant === '') {
        return ['ok' => false, 'status' => 0, 'body' => ['error' => 'Config incompleta (BASE_URL / API_KEY / TENANT).']];
    }

    $payload = [
        'tenant'      => $tenant,
        'customer'    => $order['customer'],
        'fulfillment' => $order['fulfillment'] ?? 'PICKUP',
        'items'       => $order['items'],
        'payment'     => $order['payment'] ?? ['paid' => false],
        'notes'       => $order['notes'] ?? null,
        'externalRef' => $order['external_ref'] ?? null,
        'invoice'     => true,
    ];

    $url  = rtrim($base, '/') . '/api/public/v1/orders';
    $args = [
        'timeout' => 15,
        'headers' => [
            'Authorization' => 'Bearer ' . $key,
            'X-Tenant-Slug' => $tenant,
            'Content-Type'  => 'application/json',
        ],
        'body'    => wp_json_encode($payload),
    ];

    // En WordPress real usá wp_remote_post; el fallback cURL es solo para la demo.
    if (function_exists('wp_remote_post')) {
        $res = wp_remote_post($url, $args);
        if (is_wp_error($res)) {
            return ['ok' => false, 'status' => 0, 'body' => ['error' => $res->get_error_message()]];
        }
        $status = (int) wp_remote_retrieve_response_code($res);
        $body   = json_decode(wp_remote_retrieve_body($res), true);
        return ['ok' => $status >= 200 && $status < 300, 'status' => $status, 'body' => $body];
    }

    return estetica_erp_curl_post($url, $args['headers'], $args['body']);
}

/** Fallback cURL (solo para correr el ejemplo fuera de WordPress). */
function estetica_erp_curl_post(string $url, array $headers, string $body): array
{
    $flat = [];
    foreach ($headers as $k => $v) {
        $flat[] = "$k: $v";
    }
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_POST           => true,
        CURLOPT_HTTPHEADER     => $flat,
        CURLOPT_POSTFIELDS     => $body,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 15,
    ]);
    $raw    = curl_exec($ch);
    $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    return ['ok' => $status >= 200 && $status < 300, 'status' => $status, 'body' => json_decode((string) $raw, true)];
}

/**
 * Hook de WooCommerce: cuando un pedido pasa a "processing" (pagado), lo reenvía.
 * Se registra solo si WooCommerce está presente.
 */
if (function_exists('add_action')) {
    add_action('woocommerce_order_status_processing', function ($order_id) {
        if (!function_exists('wc_get_order')) {
            return;
        }
        $wc = wc_get_order($order_id);
        if (!$wc) {
            return;
        }

        // Mapeo WooCommerce → contrato Estética ERP. El match de producto usa el
        // NOMBRE del producto (provisional); si mapeás por productId interno,
        // guardá ese id en un meta del producto Woo y usalo acá.
        $items = [];
        foreach ($wc->get_items() as $item) {
            $items[] = [
                'name'     => $item->get_name(),
                'quantity' => (float) $item->get_quantity(),
            ];
        }

        $result = estetica_erp_send_order([
            'customer' => [
                'name'    => trim($wc->get_billing_first_name() . ' ' . $wc->get_billing_last_name()),
                'phone'   => $wc->get_billing_phone(),
                'address' => $wc->get_shipping_address_1() ?: $wc->get_billing_address_1(),
                'email'   => $wc->get_billing_email(),
            ],
            'fulfillment' => $wc->has_shipping_address() ? 'DELIVERY' : 'PICKUP',
            'items'       => $items,
            'payment'     => ['paid' => true, 'method' => 'MERCADOPAGO'],
            'external_ref' => 'woo-' . $order_id,
            'notes'       => $wc->get_customer_note(),
        ]);

        if (!$result['ok']) {
            // Logueá para reintentar a mano; no rompas el checkout del cliente.
            error_log('[estetica-erp] pedido ' . $order_id . ' no se pudo reenviar: ' . wp_json_encode($result));
        }
    }, 10, 1);
}

// --- Demo directa: `php estetica-erp-orders.php` (usa el fallback cURL) ---
if (PHP_SAPI === 'cli' && realpath($argv[0] ?? '') === realpath(__FILE__)) {
    $demo = estetica_erp_send_order([
        'customer'    => ['name' => 'Cliente de prueba', 'phone' => '1130000000'],
        'fulfillment' => 'PICKUP',
        'items'       => [['name' => 'Bondiola al vacío', 'quantity' => 1]],
        'payment'     => ['paid' => false],
        'external_ref' => 'demo-1',
    ]);
    echo json_encode($demo, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE), PHP_EOL;
}
