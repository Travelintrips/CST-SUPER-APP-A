import { Router, type Request, type Response } from "express";
import { requireAdmin } from "../lib/requireAdmin.js";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

const router = Router();

// ── Boot: Create master tables ─────────────────────────────────────────────────
(async () => {
  await db.execute(sql.raw(`
    CREATE TABLE IF NOT EXISTS freight_ports (
      id SERIAL PRIMARY KEY,
      code TEXT NOT NULL,
      name TEXT NOT NULL,
      city TEXT NOT NULL DEFAULT '',
      country TEXT NOT NULL DEFAULT '',
      country_code TEXT NOT NULL DEFAULT '',
      region TEXT NOT NULL DEFAULT '',
      port_type TEXT NOT NULL DEFAULT 'sea',
      timezone TEXT NOT NULL DEFAULT 'Asia/Jakarta',
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      sort_order INTEGER NOT NULL DEFAULT 0,
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      CONSTRAINT freight_ports_code_key UNIQUE (code)
    )
  `)).catch((e: unknown) => console.warn("freight_ports boot:", e));

  await db.execute(sql.raw(`
    CREATE TABLE IF NOT EXISTS freight_carriers (
      id SERIAL PRIMARY KEY,
      code TEXT NOT NULL,
      name TEXT NOT NULL,
      carrier_type TEXT NOT NULL DEFAULT 'shipping_line',
      country TEXT NOT NULL DEFAULT '',
      country_code TEXT NOT NULL DEFAULT '',
      logo_url TEXT,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      sort_order INTEGER NOT NULL DEFAULT 0,
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      CONSTRAINT freight_carriers_code_key UNIQUE (code)
    )
  `)).catch((e: unknown) => console.warn("freight_carriers boot:", e));

  await db.execute(sql.raw(`
    CREATE TABLE IF NOT EXISTS freight_container_types (
      id SERIAL PRIMARY KEY,
      code TEXT NOT NULL,
      name TEXT NOT NULL,
      teu NUMERIC(5,2) NOT NULL DEFAULT 1,
      max_cbm NUMERIC(10,2),
      max_payload_kg INTEGER,
      is_reefer BOOLEAN NOT NULL DEFAULT FALSE,
      is_special BOOLEAN NOT NULL DEFAULT FALSE,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      sort_order INTEGER NOT NULL DEFAULT 0,
      notes TEXT,
      CONSTRAINT freight_container_types_code_key UNIQUE (code)
    )
  `)).catch((e: unknown) => console.warn("freight_container_types boot:", e));

  await db.execute(sql.raw(`
    CREATE TABLE IF NOT EXISTS ocean_freight_route_matrix (
      id SERIAL PRIMARY KEY,
      origin_port_code TEXT NOT NULL,
      destination_port_code TEXT NOT NULL,
      carrier_code TEXT NOT NULL,
      service_name TEXT NOT NULL DEFAULT '',
      transit_days_min INTEGER,
      transit_days_max INTEGER,
      frequency TEXT NOT NULL DEFAULT 'weekly',
      direct_or_transshipment TEXT NOT NULL DEFAULT 'direct',
      pol TEXT,
      pod TEXT,
      transshipment_port TEXT,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      CONSTRAINT ofr_route_matrix_uq UNIQUE (origin_port_code, destination_port_code, carrier_code)
    )
  `)).catch((e: unknown) => console.warn("ocean_freight_route_matrix boot:", e));

  // ── Seed: Ports ──────────────────────────────────────────────────────────────
  await db.execute(sql.raw(`
    INSERT INTO freight_ports (code,name,city,country,country_code,region,port_type,timezone,sort_order)
    VALUES
      ('IDJKT','Tanjung Priok','Jakarta','Indonesia','ID','Southeast Asia','sea','Asia/Jakarta',1),
      ('IDSUV','Tanjung Perak','Surabaya','Indonesia','ID','Southeast Asia','sea','Asia/Jakarta',2),
      ('IDBDJ','Belawan','Medan','Indonesia','ID','Southeast Asia','sea','Asia/Jakarta',3),
      ('IDMKS','Soekarno Hatta','Makassar','Indonesia','ID','Southeast Asia','sea','Asia/Makassar',4),
      ('IDBPN','Kariangau','Balikpapan','Indonesia','ID','Southeast Asia','sea','Asia/Makassar',5),
      ('IDSRG','Tanjung Emas','Semarang','Indonesia','ID','Southeast Asia','sea','Asia/Jakarta',6),
      ('SGSIN','PSA Singapore','Singapore','Singapore','SG','Southeast Asia','sea','Asia/Singapore',10),
      ('MYPKG','Port Klang','Kuala Lumpur','Malaysia','MY','Southeast Asia','sea','Asia/Kuala_Lumpur',11),
      ('MYPTP','Tanjung Pelepas','Johor','Malaysia','MY','Southeast Asia','sea','Asia/Kuala_Lumpur',12),
      ('CNSHA','Shanghai','Shanghai','China','CN','Northeast Asia','sea','Asia/Shanghai',20),
      ('CNNBO','Ningbo','Ningbo','China','CN','Northeast Asia','sea','Asia/Shanghai',21),
      ('CNQIN','Qingdao','Qingdao','China','CN','Northeast Asia','sea','Asia/Shanghai',22),
      ('KRPUS','Busan','Busan','South Korea','KR','Northeast Asia','sea','Asia/Seoul',23),
      ('HKHKG','Hong Kong','Hong Kong','Hong Kong','HK','Northeast Asia','sea','Asia/Hong_Kong',24),
      ('TWKHH','Kaohsiung','Kaohsiung','Taiwan','TW','Northeast Asia','sea','Asia/Taipei',25),
      ('JPYOK','Yokohama','Yokohama','Japan','JP','Northeast Asia','sea','Asia/Tokyo',26),
      ('AUPAT','Port Adelaide','Adelaide','Australia','AU','Oceania','sea','Australia/Adelaide',30),
      ('AUSYD','Sydney','Sydney','Australia','AU','Oceania','sea','Australia/Sydney',31),
      ('NLRTM','Rotterdam','Rotterdam','Netherlands','NL','Europe','sea','Europe/Amsterdam',40),
      ('GBFXT','Felixstowe','Felixstowe','United Kingdom','GB','Europe','sea','Europe/London',41),
      ('USLAX','Los Angeles','Los Angeles','United States','US','North America','sea','America/Los_Angeles',50),
      ('USNYC','New York','New York','United States','US','North America','sea','America/New_York',51)
    ON CONFLICT (code) DO NOTHING
  `)).catch((e: unknown) => console.warn("freight_ports seed:", e));

  // ── Seed: Carriers ────────────────────────────────────────────────────────────
  await db.execute(sql.raw(`
    INSERT INTO freight_carriers (code,name,carrier_type,country,country_code,sort_order)
    VALUES
      ('SML','Samudera Indonesia','shipping_line','Indonesia','ID',1),
      ('MRS','Meratus Line','shipping_line','Indonesia','ID',2),
      ('SITC','SITC Container Lines','shipping_line','China','CN',3),
      ('CMA','CMA CGM','shipping_line','France','FR',4),
      ('EMC','Evergreen Marine','shipping_line','Taiwan','TW',5),
      ('YML','Yang Ming Marine','shipping_line','Taiwan','TW',6),
      ('WHL','Wan Hai Lines','shipping_line','Taiwan','TW',7),
      ('PIL','Pacific International Lines','shipping_line','Singapore','SG',8),
      ('RCL','Regional Container Lines','shipping_line','Thailand','TH',9),
      ('MSC','MSC Mediterranean','shipping_line','Switzerland','CH',10),
      ('MAERSK','Maersk Line','shipping_line','Denmark','DK',11),
      ('COSCO','COSCO Shipping','shipping_line','China','CN',12),
      ('HMM','HMM (Hyundai Merchant Marine)','shipping_line','South Korea','KR',13),
      ('ZIM','ZIM Integrated Shipping','shipping_line','Israel','IL',14),
      ('NVOC1','NVOCC Partner','nvocc','Indonesia','ID',20)
    ON CONFLICT (code) DO NOTHING
  `)).catch((e: unknown) => console.warn("freight_carriers seed:", e));

  // ── Seed: Container Types ─────────────────────────────────────────────────────
  await db.execute(sql.raw(`
    INSERT INTO freight_container_types (code,name,teu,max_cbm,max_payload_kg,is_reefer,is_special,sort_order)
    VALUES
      ('20ft','20ft GP (General Purpose)',1,25,21800,FALSE,FALSE,1),
      ('40ft','40ft GP (General Purpose)',2,55,26480,FALSE,FALSE,2),
      ('40HC','40ft HC (High Cube)',2,65,26480,FALSE,FALSE,3),
      ('reefer_20','20ft Reefer',1,25,20400,TRUE,FALSE,4),
      ('reefer_40','40ft Reefer',2,56,24760,TRUE,FALSE,5),
      ('open_top','20ft Open Top',1,25,21600,FALSE,TRUE,6),
      ('flat_rack','20ft Flat Rack',1,NULL,24000,FALSE,TRUE,7),
      ('45HC','45ft HC (High Cube)',2.25,72,27000,FALSE,FALSE,8),
      ('tank','Tank Container',1,NULL,26000,FALSE,TRUE,9)
    ON CONFLICT (code) DO NOTHING
  `)).catch((e: unknown) => console.warn("freight_container_types seed:", e));

  // ── Seed: Route Matrix ────────────────────────────────────────────────────────
  await db.execute(sql.raw(`
    INSERT INTO ocean_freight_route_matrix
      (origin_port_code,destination_port_code,carrier_code,service_name,transit_days_min,transit_days_max,frequency,direct_or_transshipment)
    VALUES
      ('IDJKT','SGSIN','CMA','CMA CGM JASIN',3,4,'weekly','direct'),
      ('IDJKT','SGSIN','EMC','Evergreen SEA',3,5,'weekly','direct'),
      ('IDJKT','SGSIN','SITC','SITC IDN-SG',4,5,'bi-weekly','direct'),
      ('IDJKT','MYPKG','EMC','Evergreen MYS',5,7,'weekly','direct'),
      ('IDJKT','MYPKG','YML','Yang Ming MYS',5,6,'weekly','direct'),
      ('IDJKT','CNSHA','YML','Yang Ming CES',14,16,'weekly','direct'),
      ('IDJKT','CNSHA','COSCO','COSCO INA-SHA',13,15,'weekly','direct'),
      ('IDJKT','CNNBO','YML','Yang Ming CEN',14,16,'weekly','direct'),
      ('IDJKT','CNNBO','CMA','CMA NEA',15,17,'weekly','transshipment'),
      ('IDJKT','KRPUS','EMC','Evergreen NEA',16,18,'weekly','transshipment'),
      ('IDJKT','HKHKG','SITC','SITC IDN-HKG',7,9,'weekly','direct'),
      ('IDSUV','SGSIN','SML','Samudera SGP',4,5,'weekly','direct'),
      ('IDSUV','SGSIN','WHL','Wan Hai SG',4,6,'bi-weekly','direct'),
      ('IDSUV','MYPKG','WHL','Wan Hai MYS',6,8,'weekly','direct'),
      ('IDSUV','CNSHA','SITC','SITC SUB-SHA',15,17,'weekly','transshipment'),
      ('IDSUV','CNNBO','SITC','SITC SUB-NBO',15,17,'weekly','transshipment'),
      ('IDSUV','KRPUS','RCL','RCL NEA',17,20,'weekly','transshipment'),
      ('IDBDJ','SGSIN','SML','Samudera MDN-SG',3,4,'weekly','direct'),
      ('IDBDJ','MYPKG','SML','Samudera MDN-KL',2,3,'weekly','direct'),
      ('IDBDJ','MYPKG','PIL','PIL MDN-KL',2,4,'weekly','direct'),
      ('IDMKS','SGSIN','MRS','Meratus MKS-SG',4,6,'weekly','direct'),
      ('IDMKS','IDJKT','MRS','Meratus Domestic',3,4,'weekly','direct'),
      ('IDBPN','SGSIN','MRS','Meratus BPN-SG',5,7,'bi-weekly','direct'),
      ('IDBPN','MYPKG','PIL','PIL BPN-KL',6,8,'weekly','transshipment'),
      ('IDSRG','SGSIN','EMC','Evergreen SMG-SG',4,5,'weekly','direct'),
      ('IDSRG','MYPKG','YML','Yang Ming SMG-KL',5,7,'weekly','direct')
    ON CONFLICT (origin_port_code, destination_port_code, carrier_code) DO NOTHING
  `)).catch((e: unknown) => console.warn("ocean_freight_route_matrix seed:", e));
})();

// ─────────────────────────────────────────────────────────────────────────────
// Ports CRUD
// ─────────────────────────────────────────────────────────────────────────────

router.get("/ports", async (_req: Request, res: Response) => {
  try {
    const { rows } = await db.execute(sql`
      SELECT * FROM freight_ports ORDER BY sort_order, country_code, code
    `);
    return res.json(rows);
  } catch (e) {
    console.error("[freight-master/ports/list]", e);
    return res.status(500).json({ error: "Gagal ambil data port" });
  }
});

router.get("/ports/:id", async (req: Request, res: Response) => {
  try {
    const { rows } = await db.execute(sql`
      SELECT * FROM freight_ports WHERE id = ${Number(req.params.id)}
    `);
    if (!rows.length) return res.status(404).json({ error: "Port tidak ditemukan" });
    return res.json(rows[0]);
  } catch (e) {
    return res.status(500).json({ error: "Gagal ambil port" });
  }
});

router.post("/ports", requireAdmin, async (req: Request, res: Response) => {
  const b = req.body ?? {};
  if (!b.code || !b.name) return res.status(400).json({ error: "code dan name wajib" });
  try {
    const { rows } = await db.execute(sql`
      INSERT INTO freight_ports (code,name,city,country,country_code,region,port_type,timezone,is_active,sort_order,notes)
      VALUES (
        ${String(b.code).toUpperCase()}, ${b.name}, ${b.city ?? ""},
        ${b.country ?? ""}, ${String(b.country_code ?? "").toUpperCase()},
        ${b.region ?? ""}, ${b.port_type ?? "sea"}, ${b.timezone ?? "Asia/Jakarta"},
        ${b.is_active !== false}, ${Number(b.sort_order ?? 0)}, ${b.notes ?? null}
      ) RETURNING *
    `);
    return res.status(201).json(rows[0]);
  } catch (e: any) {
    if (e.code === "23505") return res.status(409).json({ error: "Kode port sudah ada" });
    console.error("[freight-master/ports/create]", e);
    return res.status(500).json({ error: "Gagal buat port" });
  }
});

router.put("/ports/:id", requireAdmin, async (req: Request, res: Response) => {
  const b = req.body ?? {};
  try {
    const { rows } = await db.execute(sql`
      UPDATE freight_ports SET
        name = COALESCE(${b.name ?? null}, name),
        city = COALESCE(${b.city ?? null}, city),
        country = COALESCE(${b.country ?? null}, country),
        country_code = COALESCE(${b.country_code ? String(b.country_code).toUpperCase() : null}, country_code),
        region = COALESCE(${b.region ?? null}, region),
        port_type = COALESCE(${b.port_type ?? null}, port_type),
        timezone = COALESCE(${b.timezone ?? null}, timezone),
        is_active = COALESCE(${b.is_active ?? null}, is_active),
        sort_order = COALESCE(${b.sort_order !== undefined ? Number(b.sort_order) : null}, sort_order),
        notes = COALESCE(${b.notes ?? null}, notes),
        updated_at = NOW()
      WHERE id = ${Number(req.params.id)}
      RETURNING *
    `);
    if (!rows.length) return res.status(404).json({ error: "Port tidak ditemukan" });
    return res.json(rows[0]);
  } catch (e) {
    return res.status(500).json({ error: "Gagal update port" });
  }
});

router.delete("/ports/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    await db.execute(sql`DELETE FROM freight_ports WHERE id = ${Number(req.params.id)}`);
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: "Gagal hapus port" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Carriers CRUD
// ─────────────────────────────────────────────────────────────────────────────

router.get("/carriers", async (_req: Request, res: Response) => {
  try {
    const { rows } = await db.execute(sql`
      SELECT * FROM freight_carriers ORDER BY sort_order, carrier_type, code
    `);
    return res.json(rows);
  } catch (e) {
    return res.status(500).json({ error: "Gagal ambil data carrier" });
  }
});

router.post("/carriers", requireAdmin, async (req: Request, res: Response) => {
  const b = req.body ?? {};
  if (!b.code || !b.name) return res.status(400).json({ error: "code dan name wajib" });
  try {
    const { rows } = await db.execute(sql`
      INSERT INTO freight_carriers (code,name,carrier_type,country,country_code,logo_url,is_active,sort_order,notes)
      VALUES (
        ${String(b.code).toUpperCase()}, ${b.name},
        ${b.carrier_type ?? "shipping_line"}, ${b.country ?? ""},
        ${String(b.country_code ?? "").toUpperCase()},
        ${b.logo_url ?? null}, ${b.is_active !== false},
        ${Number(b.sort_order ?? 0)}, ${b.notes ?? null}
      ) RETURNING *
    `);
    return res.status(201).json(rows[0]);
  } catch (e: any) {
    if (e.code === "23505") return res.status(409).json({ error: "Kode carrier sudah ada" });
    return res.status(500).json({ error: "Gagal buat carrier" });
  }
});

router.put("/carriers/:id", requireAdmin, async (req: Request, res: Response) => {
  const b = req.body ?? {};
  try {
    const { rows } = await db.execute(sql`
      UPDATE freight_carriers SET
        name = COALESCE(${b.name ?? null}, name),
        carrier_type = COALESCE(${b.carrier_type ?? null}, carrier_type),
        country = COALESCE(${b.country ?? null}, country),
        logo_url = COALESCE(${b.logo_url ?? null}, logo_url),
        is_active = COALESCE(${b.is_active ?? null}, is_active),
        sort_order = COALESCE(${b.sort_order !== undefined ? Number(b.sort_order) : null}, sort_order),
        updated_at = NOW()
      WHERE id = ${Number(req.params.id)}
      RETURNING *
    `);
    if (!rows.length) return res.status(404).json({ error: "Carrier tidak ditemukan" });
    return res.json(rows[0]);
  } catch (e) {
    return res.status(500).json({ error: "Gagal update carrier" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Container Types CRUD
// ─────────────────────────────────────────────────────────────────────────────

router.get("/container-types", async (_req: Request, res: Response) => {
  try {
    const { rows } = await db.execute(sql`
      SELECT * FROM freight_container_types ORDER BY sort_order, code
    `);
    return res.json(rows);
  } catch (e) {
    return res.status(500).json({ error: "Gagal ambil container types" });
  }
});

router.post("/container-types", requireAdmin, async (req: Request, res: Response) => {
  const b = req.body ?? {};
  if (!b.code || !b.name) return res.status(400).json({ error: "code dan name wajib" });
  try {
    const { rows } = await db.execute(sql`
      INSERT INTO freight_container_types (code,name,teu,max_cbm,max_payload_kg,is_reefer,is_special,is_active,sort_order,notes)
      VALUES (
        ${b.code}, ${b.name}, ${Number(b.teu ?? 1)},
        ${b.max_cbm ? Number(b.max_cbm) : null},
        ${b.max_payload_kg ? Number(b.max_payload_kg) : null},
        ${b.is_reefer === true}, ${b.is_special === true},
        ${b.is_active !== false}, ${Number(b.sort_order ?? 0)}, ${b.notes ?? null}
      ) RETURNING *
    `);
    return res.status(201).json(rows[0]);
  } catch (e: any) {
    if (e.code === "23505") return res.status(409).json({ error: "Kode container type sudah ada" });
    return res.status(500).json({ error: "Gagal buat container type" });
  }
});

router.put("/container-types/:id", requireAdmin, async (req: Request, res: Response) => {
  const b = req.body ?? {};
  try {
    const { rows } = await db.execute(sql`
      UPDATE freight_container_types SET
        name = COALESCE(${b.name ?? null}, name),
        teu = COALESCE(${b.teu !== undefined ? Number(b.teu) : null}, teu),
        max_cbm = COALESCE(${b.max_cbm !== undefined ? Number(b.max_cbm) : null}, max_cbm),
        max_payload_kg = COALESCE(${b.max_payload_kg !== undefined ? Number(b.max_payload_kg) : null}, max_payload_kg),
        is_reefer = COALESCE(${b.is_reefer ?? null}, is_reefer),
        is_special = COALESCE(${b.is_special ?? null}, is_special),
        is_active = COALESCE(${b.is_active ?? null}, is_active),
        sort_order = COALESCE(${b.sort_order !== undefined ? Number(b.sort_order) : null}, sort_order)
      WHERE id = ${Number(req.params.id)}
      RETURNING *
    `);
    if (!rows.length) return res.status(404).json({ error: "Container type tidak ditemukan" });
    return res.json(rows[0]);
  } catch (e) {
    return res.status(500).json({ error: "Gagal update container type" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Route Matrix CRUD
// ─────────────────────────────────────────────────────────────────────────────

router.get("/route-matrix", async (req: Request, res: Response) => {
  try {
    const origin = req.query.origin ? String(req.query.origin).toUpperCase() : null;
    const dest   = req.query.destination ? String(req.query.destination).toUpperCase() : null;
    const { rows } = await db.execute(sql`
      SELECT rm.*,
        op.name AS origin_port_name, op.city AS origin_city, op.country AS origin_country,
        dp.name AS destination_port_name, dp.city AS destination_city, dp.country AS destination_country,
        fc.name AS carrier_name
      FROM ocean_freight_route_matrix rm
      LEFT JOIN freight_ports op ON op.code = rm.origin_port_code
      LEFT JOIN freight_ports dp ON dp.code = rm.destination_port_code
      LEFT JOIN freight_carriers fc ON fc.code = rm.carrier_code
      WHERE rm.is_active = TRUE
        AND (${origin}::text IS NULL OR rm.origin_port_code = ${origin})
        AND (${dest}::text IS NULL OR rm.destination_port_code = ${dest})
      ORDER BY rm.origin_port_code, rm.destination_port_code, rm.carrier_code
    `);
    return res.json(rows);
  } catch (e) {
    console.error("[freight-master/route-matrix/list]", e);
    return res.status(500).json({ error: "Gagal ambil route matrix" });
  }
});

router.post("/route-matrix", requireAdmin, async (req: Request, res: Response) => {
  const b = req.body ?? {};
  if (!b.origin_port_code || !b.destination_port_code || !b.carrier_code)
    return res.status(400).json({ error: "origin_port_code, destination_port_code, carrier_code wajib" });
  try {
    const { rows } = await db.execute(sql`
      INSERT INTO ocean_freight_route_matrix
        (origin_port_code,destination_port_code,carrier_code,service_name,
         transit_days_min,transit_days_max,frequency,direct_or_transshipment,
         pol,pod,transshipment_port,is_active,notes)
      VALUES (
        ${String(b.origin_port_code).toUpperCase()},
        ${String(b.destination_port_code).toUpperCase()},
        ${String(b.carrier_code).toUpperCase()},
        ${b.service_name ?? ""},
        ${b.transit_days_min ? Number(b.transit_days_min) : null},
        ${b.transit_days_max ? Number(b.transit_days_max) : null},
        ${b.frequency ?? "weekly"},
        ${b.direct_or_transshipment ?? "direct"},
        ${b.pol ?? null}, ${b.pod ?? null}, ${b.transshipment_port ?? null},
        ${b.is_active !== false}, ${b.notes ?? null}
      ) RETURNING *
    `);
    return res.status(201).json(rows[0]);
  } catch (e: any) {
    if (e.code === "23505") return res.status(409).json({ error: "Rute + carrier sudah ada" });
    return res.status(500).json({ error: "Gagal buat route matrix" });
  }
});

router.put("/route-matrix/:id", requireAdmin, async (req: Request, res: Response) => {
  const b = req.body ?? {};
  try {
    const { rows } = await db.execute(sql`
      UPDATE ocean_freight_route_matrix SET
        service_name = COALESCE(${b.service_name ?? null}, service_name),
        transit_days_min = COALESCE(${b.transit_days_min !== undefined ? Number(b.transit_days_min) : null}, transit_days_min),
        transit_days_max = COALESCE(${b.transit_days_max !== undefined ? Number(b.transit_days_max) : null}, transit_days_max),
        frequency = COALESCE(${b.frequency ?? null}, frequency),
        direct_or_transshipment = COALESCE(${b.direct_or_transshipment ?? null}, direct_or_transshipment),
        transshipment_port = COALESCE(${b.transshipment_port ?? null}, transshipment_port),
        is_active = COALESCE(${b.is_active ?? null}, is_active),
        notes = COALESCE(${b.notes ?? null}, notes),
        updated_at = NOW()
      WHERE id = ${Number(req.params.id)}
      RETURNING *
    `);
    if (!rows.length) return res.status(404).json({ error: "Route matrix tidak ditemukan" });
    return res.json(rows[0]);
  } catch (e) {
    return res.status(500).json({ error: "Gagal update route matrix" });
  }
});

router.delete("/route-matrix/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    await db.execute(sql`DELETE FROM ocean_freight_route_matrix WHERE id = ${Number(req.params.id)}`);
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: "Gagal hapus route matrix" });
  }
});

export default router;
