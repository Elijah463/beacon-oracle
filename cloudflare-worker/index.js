/**
 * BEACON Oracle -- Cloudflare Worker P2P Relay
 * =============================================
 * Deploys to: https://beacon-ngn-relay.YOUR_NAME.workers.dev
 *
 * Purpose: relay requests from the BEACON reporter (running on Fly.io in London)
 * to Nigerian P2P exchange endpoints. Cloudflare routes this Worker through its
 * nearest edge node -- Lagos, Nigeria for West African P2P endpoints -- so the
 * request appears to originate from Nigeria rather than a London datacenter.
 *
 * Usage (reporter calls this):
 *   POST https://beacon-ngn-relay.YOUR_NAME.workers.dev
 *   Body: { "url": "https://p2p.binance.com/...", "body": {...}, "method": "POST" }
 *
 * Security:
 *   - Only whitelisted domains are allowed as relay targets
 *   - No credentials or secrets pass through this Worker
 *   - The Worker itself has no API keys -- it is a pure relay
 *
 * Deploy steps:
 *   1. Go to workers.cloudflare.com and create a free account
 *   2. Click "Create Worker"
 *   3. Paste this entire file into the editor
 *   4. Click "Deploy"
 *   5. Copy the Worker URL (e.g. https://beacon-ngn-relay.yourname.workers.dev)
 *   6. Set CF_WORKER_URL=<your worker url> in Fly.io secrets
 */

// Only these domains can be relayed -- prevents abuse if the Worker URL leaks
const ALLOWED_DOMAINS = [
  'p2p.binance.com',
  'api2.bybit.com',
  'api.bybit.com',
  'www.quidax.com',
  'quidax.com',
  'api.bitget.com',
]

export default {
  async fetch(request, _env, _ctx) {
    // Only accept POST requests
    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'POST required' }), {
        status: 405,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    let payload
    try {
      payload = await request.json()
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const { url, method = 'GET', body, headers: extraHeaders = {} } = payload

    if (!url || typeof url !== 'string') {
      return new Response(JSON.stringify({ error: 'Missing url field' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Validate target domain against whitelist
    let targetUrl
    try {
      targetUrl = new URL(url)
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid url' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    if (!ALLOWED_DOMAINS.includes(targetUrl.hostname)) {
      return new Response(JSON.stringify({ error: `Domain not allowed: ${targetUrl.hostname}` }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Build upstream request headers -- look like a real browser to P2P endpoints
    const upstreamHeaders = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache',
      ...extraHeaders,
    }

    if (body) {
      upstreamHeaders['Content-Type'] = 'application/json'
    }

    // Forward the request to the target
    let upstreamResponse
    try {
      upstreamResponse = await fetch(url, {
        method: method,
        headers: upstreamHeaders,
        body: body ? JSON.stringify(body) : undefined,
      })
    } catch (e) {
      return new Response(JSON.stringify({ error: `Upstream fetch failed: ${e.message}` }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Return the upstream response with CORS headers so the reporter can read it
    const responseBody = await upstreamResponse.text()
    return new Response(responseBody, {
      status: upstreamResponse.status,
      headers: {
        'Content-Type': upstreamResponse.headers.get('Content-Type') ?? 'application/json',
        'X-Upstream-Status': String(upstreamResponse.status),
        'Access-Control-Allow-Origin': '*',
      },
    })
  },
}
