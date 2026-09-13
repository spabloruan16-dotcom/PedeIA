const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const fs = require("node:fs");
const path = require("node:path");
const { Pool } = require("pg");
require("dotenv").config();

const app = express();
const port = Number(process.env.PORT || 4173);
const root = __dirname;
const dataDir = path.join(root, "server");
const stateFile = path.join(dataDir, "data.json");
const JWT_SECRET = process.env.JWT_SECRET || "pedeia-dev-secret";
const pool = process.env.DATABASE_URL ? new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
}) : null;

app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

function ensureStateFile() {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  if (!fs.existsSync(stateFile)) {
    fs.writeFileSync(stateFile, JSON.stringify({
      merchant: null,
      shop: null,
      categories: [],
      products: [],
      orders: [],
      ratings: [],
      messages: [],
      delivery: { pickup: true, delivery: true, pickupMinutes: 20, deliveryMinutes: 45 },
      printerConfig: {
        mode: "cabo",
        deviceName: "Impressora térmica padrão",
        copies: 1,
        autoPrint: true,
        includeCustomer: true,
        includePhone: true,
        includeAddress: true,
        includeItems: true,
        includeNotes: true,
        includePayment: true,
        includeFooter: true,
        footerText: "Obrigado pela preferência!"
      },
      printers: [{ id: "default", name: "Impressora térmica local", type: "cabo", status: "Conectada", default: true }]
    }, null, 2));
  }
}

function readStateFile() {
  try {
    ensureStateFile();
    const raw = fs.readFileSync(stateFile, "utf8");
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeStateFile(data) {
  ensureStateFile();
  fs.writeFileSync(stateFile, JSON.stringify(data, null, 2));
}

function slug(value) {
  return String(value || "minha-loja")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "minha-loja";
}

function makeToken(merchant) {
  return jwt.sign({ id: merchant.id, email: merchant.email, name: merchant.name }, JWT_SECRET, { expiresIn: "7d" });
}

function authMiddleware(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: "Token ausente" });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    return next();
  } catch {
    return res.status(401).json({ error: "Token inválido" });
  }
}

async function getMerchantByEmail(email) {
  if (!pool) return null;
  const result = await pool.query("SELECT * FROM merchants WHERE email = $1", [email]);
  return result.rows[0] || null;
}

async function getShopForMerchant(merchantId) {
  if (!pool) return null;
  const result = await pool.query("SELECT * FROM shops WHERE merchant_id = $1 LIMIT 1", [merchantId]);
  return result.rows[0] || null;
}

async function getTableColumns(tableName) {
  if (!pool) return [];
  const result = await pool.query(
    "SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1",
    [tableName]
  );
  return result.rows.map((row) => row.column_name);
}

async function createShopForMerchant(merchantId, shopName, description, shopType, photo) {
  if (!pool) return null;

  const columns = await getTableColumns("shops");
  const columnSet = new Set(columns);
  const publicId = `${slug(shopName)}-${merchantId}`;

  if (columnSet.has("type") && columnSet.has("is_open") && columnSet.has("photo")) {
    const result = await pool.query(
      "INSERT INTO shops (merchant_id, name, public_id, description, type, is_open, photo) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *",
      [merchantId, String(shopName).trim(), publicId, String(description || "Loja criada no PedeIA"), String(shopType || "Loja"), true, String(photo || "")]
    );
    return result.rows[0];
  }

  const result = await pool.query(
    "INSERT INTO shops (merchant_id, name, public_id, description) VALUES ($1, $2, $3, $4) RETURNING *",
    [merchantId, String(shopName).trim(), publicId, String(description || "Loja criada no PedeIA")]
  );
  return result.rows[0];
}

app.get("/api/health", async (_req, res) => {
  const state = readStateFile();
  res.json({ ok: true, service: "pedeia", database: Boolean(pool), state: !!state });
});

app.get("/api/state", (_req, res) => {
  res.set("Cache-Control", "no-store");
  res.json(readStateFile());
});

app.post("/api/save-state", (req, res) => {
  try {
    const data = req.body || {};
    writeStateFile(data);
    res.json({ ok: true });
  } catch {
    res.status(400).json({ ok: false, error: "Estado invalido" });
  }
});

app.post("/api/register", async (req, res) => {
  const { name, email, password, shopName, shopType } = req.body || {};
  if (!name || !email || !password || !shopName) {
    return res.status(400).json({ error: "Preencha nome, e-mail, senha e nome da loja" });
  }

  if (password.length < 6) {
    return res.status(400).json({ error: "A senha precisa ter pelo menos 6 caracteres" });
  }

  try {
    if (pool) {
      const existing = await pool.query("SELECT id FROM merchants WHERE email = $1", [String(email).trim().toLowerCase()]);
      if (existing.rowCount > 0) {
        return res.status(409).json({ error: "Este e-mail já está cadastrado" });
      }

      const passwordHash = await bcrypt.hash(String(password), 10);
      const merchantResult = await pool.query(
        "INSERT INTO merchants (name, email, password_hash) VALUES ($1, $2, $3) RETURNING id, name, email",
        [String(name).trim(), String(email).trim().toLowerCase(), passwordHash]
      );

      const merchant = merchantResult.rows[0];
      const shop = await createShopForMerchant(merchant.id, shopName, "Loja criada no PedeIA", shopType, "");

      const token = makeToken(merchant);
      return res.json({
        token,
        merchant: { id: merchant.id, name: merchant.name, email: merchant.email },
        shop
      });
    }

    const nextState = readStateFile();
    nextState.merchant = {
      id: Date.now(),
      name: String(name).trim(),
      email: String(email).trim().toLowerCase(),
      password: String(password)
    };
    nextState.shop = {
      id: Date.now() + 1,
      merchant_id: nextState.merchant.id,
      name: String(shopName).trim(),
      publicId: `${slug(shopName)}-${Date.now()}`,
      type: String(shopType || "Loja"),
      description: "Loja criada no PedeIA",
      isOpen: true,
      schedule: {
        Segunda: { enabled: true, open: "11:00", close: "22:00" },
        Terça: { enabled: true, open: "11:00", close: "22:00" },
        Quarta: { enabled: true, open: "11:00", close: "22:00" },
        Quinta: { enabled: true, open: "11:00", close: "22:00" },
        Sexta: { enabled: true, open: "11:00", close: "23:00" },
        Sábado: { enabled: true, open: "10:00", close: "23:00" },
        Domingo: { enabled: false, open: "12:00", close: "20:00" }
      }
    };
    writeStateFile(nextState);
    const token = makeToken(nextState.merchant);
    return res.json({ token, merchant: nextState.merchant, shop: nextState.shop });
  } catch (error) {
    console.error("register error:", error);
    return res.status(500).json({ error: "Erro ao cadastrar conta" });
  }
});

app.post("/api/login", async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: "Informe e-mail e senha" });
  }

  try {
    if (pool) {
      const merchant = await getMerchantByEmail(String(email).trim().toLowerCase());
      if (!merchant) {
        return res.status(401).json({ error: "E-mail ou senha inválidos" });
      }

      const valid = await bcrypt.compare(String(password), merchant.password_hash);
      if (!valid) {
        return res.status(401).json({ error: "E-mail ou senha inválidos" });
      }

      const shop = await getShopForMerchant(merchant.id);
      const token = makeToken(merchant);
      return res.json({
        token,
        merchant: { id: merchant.id, name: merchant.name, email: merchant.email },
        shop
      });
    }

    const state = readStateFile();
    const merchant = state.merchant;
    if (!merchant || merchant.email !== String(email).trim().toLowerCase() || merchant.password !== String(password)) {
      return res.status(401).json({ error: "E-mail ou senha inválidos" });
    }

    const token = makeToken(merchant);
    return res.json({ token, merchant, shop: state.shop || null });
  } catch (error) {
    console.error("login error:", error);
    return res.status(500).json({ error: "Erro ao fazer login" });
  }
});

app.get("/api/me", authMiddleware, async (req, res) => {
  try {
    if (pool) {
      const merchantResult = await pool.query("SELECT id, name, email FROM merchants WHERE id = $1", [req.user.id]);
      if (merchantResult.rowCount === 0) {
        return res.status(404).json({ error: "Mercante não encontrado" });
      }
      const merchant = merchantResult.rows[0];
      const shop = await getShopForMerchant(merchant.id);
      return res.json({ merchant, shop });
    }

    const state = readStateFile();
    return res.json({ merchant: state.merchant || null, shop: state.shop || null });
  } catch (error) {
    console.error("me error:", error);
    return res.status(500).json({ error: "Erro ao buscar dados do comerciante" });
  }
});

app.get("/api/shop", authMiddleware, async (req, res) => {
  try {
    if (pool) {
      const shop = await getShopForMerchant(req.user.id);
      return res.json({ shop });
    }

    const state = readStateFile();
    return res.json({ shop: state.shop || null });
  } catch (error) {
    console.error("shop error:", error);
    return res.status(500).json({ error: "Erro ao buscar loja" });
  }
});

app.post("/api/shop", authMiddleware, async (req, res) => {
  const payload = req.body || {};
  try {
    if (pool) {
      const existing = await getShopForMerchant(req.user.id);
      if (existing) {
        const result = await pool.query(
          "UPDATE shops SET name = $1, description = $2, type = $3, is_open = $4, photo = $5 WHERE merchant_id = $6 RETURNING *",
          [payload.name || existing.name, payload.description || existing.description || "", payload.type || existing.type || "Loja", Boolean(payload.isOpen ?? existing.is_open), payload.photo || existing.photo || "", req.user.id]
        );
        return res.json({ shop: result.rows[0] });
      }

      const publicId = `${slug(payload.name || "minha-loja")}-${req.user.id}`;
      const result = await pool.query(
        "INSERT INTO shops (merchant_id, name, public_id, description, type, is_open, photo) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *",
        [req.user.id, payload.name || "Minha loja", publicId, payload.description || "", payload.type || "Loja", Boolean(payload.isOpen ?? true), payload.photo || ""]
      );
      return res.json({ shop: result.rows[0] });
    }

    const state = readStateFile();
    state.shop = { ...(state.shop || {}), ...payload };
    writeStateFile(state);
    return res.json({ shop: state.shop });
  } catch (error) {
    console.error("save shop error:", error);
    return res.status(500).json({ error: "Erro ao salvar loja" });
  }
});

app.get("/api/categories", authMiddleware, async (req, res) => {
  try {
    if (pool) {
      const shop = await getShopForMerchant(req.user.id);
      if (!shop) return res.json({ categories: [] });
      const result = await pool.query("SELECT * FROM categories WHERE shop_id = $1 ORDER BY id ASC", [shop.id]);
      return res.json({ categories: result.rows });
    }

    const state = readStateFile();
    return res.json({ categories: state.categories || [] });
  } catch {
    return res.status(500).json({ error: "Erro ao buscar categorias" });
  }
});

app.post("/api/categories", authMiddleware, async (req, res) => {
  const { name } = req.body || {};
  if (!name) return res.status(400).json({ error: "Nome da categoria obrigatório" });

  try {
    if (pool) {
      const shop = await getShopForMerchant(req.user.id);
      if (!shop) return res.status(404).json({ error: "Loja não encontrada" });
      const result = await pool.query("INSERT INTO categories (shop_id, name) VALUES ($1, $2) RETURNING *", [shop.id, String(name)]);
      return res.status(201).json({ category: result.rows[0] });
    }

    const state = readStateFile();
    state.categories = [...(state.categories || []), String(name)];
    writeStateFile(state);
    return res.status(201).json({ category: String(name) });
  } catch {
    return res.status(500).json({ error: "Erro ao salvar categoria" });
  }
});

app.get("/api/products", authMiddleware, async (req, res) => {
  try {
    if (pool) {
      const shop = await getShopForMerchant(req.user.id);
      if (!shop) return res.json({ products: [] });
      const result = await pool.query("SELECT * FROM products WHERE shop_id = $1 ORDER BY id DESC", [shop.id]);
      return res.json({ products: result.rows });
    }

    const state = readStateFile();
    return res.json({ products: state.products || [] });
  } catch {
    return res.status(500).json({ error: "Erro ao buscar produtos" });
  }
});

app.post("/api/products", authMiddleware, async (req, res) => {
  const { name, description, price, category, available, photo } = req.body || {};
  if (!name || !category || price === undefined) {
    return res.status(400).json({ error: "Nome, categoria e preço são obrigatórios" });
  }

  try {
    if (pool) {
      const shop = await getShopForMerchant(req.user.id);
      if (!shop) return res.status(404).json({ error: "Loja não encontrada" });
      const result = await pool.query(
        "INSERT INTO products (shop_id, category, name, description, price, available, photo) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *",
        [shop.id, String(category), String(name), String(description || ""), Number(price), Boolean(available !== false), String(photo || "")]
      );
      return res.status(201).json({ product: result.rows[0] });
    }

    const state = readStateFile();
    state.products = [...(state.products || []), {
      id: Date.now(),
      name: String(name),
      category: String(category),
      description: String(description || ""),
      price: Number(price),
      available: available !== false,
      photo: String(photo || "")
    }];
    writeStateFile(state);
    return res.status(201).json({ product: state.products[state.products.length - 1] });
  } catch {
    return res.status(500).json({ error: "Erro ao salvar produto" });
  }
});

app.use(express.static(root));
app.get(/^(?!\/api\/).*/, (req, res) => {
  res.sendFile(path.join(root, "index.html"));
});

app.listen(port, "0.0.0.0", () => {
  ensureStateFile();
  console.log(`PedeIA backend em http://localhost:${port}`);
});

module.exports = app;
