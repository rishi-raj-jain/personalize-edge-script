// File: edge-script/script.ts

import * as BunnySDK from "@bunny.net/edgescript-sdk";

const MOBILE_UA_RE =
  /Mobile|Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i;

function getDevice(
  userAgent: string,
  cdnMobileDevice: string | null
): string {
  if (cdnMobileDevice === "true") return "mobile";
  if (cdnMobileDevice === "false") return "desktop";
  return MOBILE_UA_RE.test(userAgent) ? "mobile" : "desktop";
}

function setIfPresent(headers: Headers, key: string, value: string | null) {
  if (value) headers.set(key, value);
}

function isHomepage(url: string): boolean {
  const { pathname } = new URL(url);
  return pathname === "/" || pathname === "";
}

function homepageResponseStamp() {
  return {
    id: crypto.randomUUID(),
    processedAt: new Date().toISOString(),
    message:
      "Next.js shipped the page. We tagged it on the way out. (Not a React component.)",
  };
}

function buildHomepageStampHtml(stamp: {
  id: string;
  processedAt: string;
  message: string;
}): string {
  const shortId = stamp.id.slice(0, 8);
  return `<aside id="edge-homepage-stamp" data-edge-id="${stamp.id}" data-edge-processed-at="${stamp.processedAt}" aria-label="Edge script response stamp" style="position:fixed;bottom:1rem;right:1rem;z-index:50;max-width:18rem;padding:0.75rem 1rem;border-radius:0.625rem;background:#0F2348;color:#fff;font:500 11px/1.45 ui-monospace,monospace;box-shadow:0 4px 16px rgba(15,35,72,.3);border:1px solid rgba(255,112,41,.35)"><div style="font-weight:700;font-size:12px;margin-bottom:0.35rem"><span style="color:#FF7029">🐰 Edge Script</span> · onOriginResponse</div><div style="color:rgba(255,255,255,.85);margin-bottom:0.35rem">Psst — Next.js has <em style="font-style:normal;color:#FF7029">no idea</em> this aside exists. Bunny stitched it in after the origin replied.</div><div style="color:rgba(255,255,255,.55);font-size:10px">${shortId}… · ${stamp.processedAt}</div></aside>`;
}

BunnySDK.net.http
  .servePullZone({ url: "https://mc-55ujvpjm3o.bunny.run" })
  .onOriginRequest((ctx) => {
    const req = ctx.request;
    const ua = req.headers.get("user-agent") ?? "";
    const country =
      req.headers.get("cdn-requestcountrycode") ??
      req.headers.get("cf-ipcountry") ??
      "unknown";
    const state = req.headers.get("cdn-requeststatecode");
    const device = getDevice(ua, req.headers.get("cdn-mobiledevice"));
    const modifiedHeaders = new Headers(req.headers);
    modifiedHeaders.set("x-country", country);
    modifiedHeaders.set("x-device", device);
    setIfPresent(modifiedHeaders, "x-state", state);
    setIfPresent(
      modifiedHeaders,
      "x-edge-zone",
      req.headers.get("cdn-serverzone")
    );
    setIfPresent(
      modifiedHeaders,
      "x-client-ip",
      req.headers.get("x-real-ip") ?? req.headers.get("x-forwarded-for")
    );
    return Promise.resolve(
      new Request(req.url, {
        method: req.method,
        headers: modifiedHeaders,
        body: req.method !== "GET" && req.method !== "HEAD" ? req.body : null,
      })
    );
  })
  .onOriginResponse(async (ctx) => {
    const req = ctx.request;
    if (!isHomepage(req.url) || req.method !== "GET") {
      return ctx.response;
    }
    const stamp = homepageResponseStamp();
    const newHeaders = new Headers(ctx.response.headers);
    newHeaders.set("x-edge-homepage-id", stamp.id);
    newHeaders.set("x-edge-processed-at", stamp.processedAt);
    newHeaders.set("x-edge-script-message", stamp.message);
    const contentType = newHeaders.get("content-type") ?? "";
    if (!contentType.includes("text/html")) {
      return new Response(ctx.response.body, {
        status: ctx.response.status,
        statusText: ctx.response.statusText,
        headers: newHeaders,
      });
    }
    const html = await ctx.response.text();
    const stampHtml = buildHomepageStampHtml(stamp);
    const body = html.includes("</body>")
      ? html.replace("</body>", `${stampHtml}</body>`)
      : `${html}${stampHtml}`;
    return new Response(body, {
      status: ctx.response.status,
      statusText: ctx.response.statusText,
      headers: newHeaders,
    });
  });
