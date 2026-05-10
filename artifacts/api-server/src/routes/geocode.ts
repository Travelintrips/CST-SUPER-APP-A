import { Router } from "express";

const router = Router();

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const USER_AGENT = "CSTLogistics/1.0 (cstlogistic.co.id; contact@cstlogistic.co.id)";

router.get("/geocode", async (req, res) => {
  const { q, countrycodes } = req.query as Record<string, string>;
  if (!q || typeof q !== "string" || q.trim().length < 2) {
    return res.status(400).json({ error: "q required (min 2 chars)" });
  }

  const params = new URLSearchParams({
    q: q.trim(),
    format: "json",
    limit: "6",
    addressdetails: "1",
    "accept-language": "id,en",
  });
  if (countrycodes) params.set("countrycodes", countrycodes);

  try {
    const upstream = await fetch(`${NOMINATIM_URL}?${params.toString()}`, {
      headers: {
        "User-Agent": USER_AGENT,
        "Accept-Language": "id,en",
        "Referer": "https://cstlogistic.co.id",
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!upstream.ok) {
      return res.status(502).json({ error: "Geocoding service unavailable" });
    }

    const data = await upstream.json();
    res.setHeader("Cache-Control", "public, max-age=300");
    return res.json(data);
  } catch {
    return res.status(502).json({ error: "Geocoding request failed" });
  }
});

export default router;
