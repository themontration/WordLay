export default async function handler(req, res) {
  const TARGET_BASE = (process.env.TARGET_DOMAIN || "").replace(/\/$/, "");
  
  if (!TARGET_BASE) {
    return res.status(500).send("Misconfigured: TARGET_DOMAIN is not set");
  }

  try {
    const targetUrl = TARGET_BASE + req.url;
    
    const response = await fetch(targetUrl, {
      method: req.method,
      headers: req.headers,
      body: req.method !== "GET" && req.method !== "HEAD" ? req : undefined,
      redirect: "manual",
    });

    res.status(response.status);
    response.headers.forEach((v, k) => res.setHeader(k, v));
    const body = await response.arrayBuffer();
    res.end(Buffer.from(body));
    
  } catch (err) {
    console.error("relay error:", err);
    res.status(502).send("Bad Gateway");
  }
}
