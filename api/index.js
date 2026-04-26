export const config = { runtime: "edge" };

const TARGET_BASE = (process.env.TARGET_DOMAIN || "").replace(/\/$/, "");

if (!TARGET_BASE) {
  console.error("FATAL: TARGET_DOMAIN environment variable is not set.");
}

const STRIP_HEADERS = new Set([
  "host", "connection", "keep-alive",
  "proxy-authenticate", "proxy-authorization",
  "te", "trailer", "transfer-encoding", "upgrade",
  "forwarded", "x-forwarded-host", "x-forwarded-proto", "x-forwarded-port",
]);

function buildForwardHeaders(reqHeaders) {
  const out = new Headers();
  const clientIp = reqHeaders.get("x-real-ip") || reqHeaders.get("x-forwarded-for");

  for (const [k, v] of reqHeaders) {
    if (STRIP_HEADERS.has(k)) continue;
    if (k.startsWith("x-vercel-")) continue;
    if (k === "x-real-ip" || k === "x-forwarded-for") continue;
    out.set(k, v);
  }

  if (clientIp) out.set("x-forwarded-for", clientIp);
  return out;
}

function buildTargetUrl(reqUrl) {
  const pathStart = reqUrl.indexOf("/", 8);
  return pathStart === -1 ? TARGET_BASE + "/" : TARGET_BASE + reqUrl.slice(pathStart);
}

// ✅ تنها تغییر واقعی: خطاها رو دقیق‌تر تشخیص می‌ده
function classifyError(err) {
  const msg = err?.message || "";
  if (msg.includes("certificate") || msg.includes("SSL"))
    return [523, "TLS/Certificate error reaching upstream"];
  if (msg.includes("refused"))
    return [521, "Connection refused by upstream"];
  if (msg.includes("timeout") || msg.includes("timed out"))
    return [524, "Upstream connection timed out"];
  if (msg.includes("ENOTFOUND") || msg.includes("resolve"))
    return [520, "DNS resolution failed for TARGET_DOMAIN"];
  return [502, "Bad Gateway: Tunnel Failed"];
}

export default async function handler(req) {
  if (!TARGET_BASE) {
    return new Response("Misconfigured: TARGET_DOMAIN is not set", { status: 500 });
  }

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204 });
  }

  try {
    const hasBody = req.method !== "GET" && req.method !== "HEAD";

    return await fetch(buildTargetUrl(req.url), {
      method: req.method,
      headers: buildForwardHeaders(req.headers),
      body: hasBody ? req.body : undefined,
      duplex: "half",
      redirect: "manual",
    });

  } catch (err) {
    const [status, message] = classifyError(err);
    console.error(`relay error [${status}]:`, err?.message);
    return new Response(message, { status });
  }
}
