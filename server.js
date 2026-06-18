const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');
const express = require('express');
const cors = require('cors');
const { z } = require('zod');

require('dotenv').config();

const app = express();
const PORT = Number(process.env.POS_PORT || 3001);
const SHOP_NAME = process.env.POS_SHOP_NAME || 'Pizza POS';
const CURRENCY = process.env.POS_CURRENCY || 'PKR';
const dataDir = process.env.POS_DATA_DIR || path.join(__dirname, 'data');
const dbPath = path.join(dataDir, process.env.POS_DB_FILE || 'pizza-pos.sqlite');

fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

app.use(cors());
app.use(express.json());

const nowIso = () => new Date().toISOString();

function getDateRange(dateString) {
  const date = dateString || new Date().toISOString().slice(0, 10);
  return {
    start: `${date}T00:00:00.000Z`,
    end: `${date}T23:59:59.999Z`,
  };
}

function ensureSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      price REAL NOT NULL,
      description TEXT DEFAULT '',
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS deals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      price REAL NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS deal_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      deal_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      quantity INTEGER NOT NULL,
      FOREIGN KEY (deal_id) REFERENCES deals(id) ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS shifts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      start_cash REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'OPEN',
      expected_cash REAL,
      actual_cash REAL,
      difference REAL,
      opened_at TEXT NOT NULL,
      closed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shift_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      amount REAL NOT NULL,
      note TEXT DEFAULT '',
      created_at TEXT NOT NULL,
      FOREIGN KEY (shift_id) REFERENCES shifts(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shift_id INTEGER NOT NULL,
      order_number INTEGER NOT NULL,
      order_type TEXT NOT NULL,
      table_number TEXT,
      customer_name TEXT,
      phone_number TEXT,
      address TEXT,
      payment_type TEXT NOT NULL,
      subtotal REAL NOT NULL,
      discount_amount REAL NOT NULL DEFAULT 0,
      delivery_charge REAL NOT NULL DEFAULT 0,
      total REAL NOT NULL,
      notes TEXT DEFAULT '',
      created_at TEXT NOT NULL,
      FOREIGN KEY (shift_id) REFERENCES shifts(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      item_type TEXT NOT NULL,
      product_id INTEGER,
      deal_id INTEGER,
      name TEXT NOT NULL,
      unit_price REAL NOT NULL,
      quantity INTEGER NOT NULL,
      total REAL NOT NULL,
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
    );
  `);

  const orderColumns = db.prepare(`PRAGMA table_info(orders)`).all();
  const hasDiscountAmount = orderColumns.some((column) => column.name === 'discount_amount');
  const hasDeliveryCharge = orderColumns.some((column) => column.name === 'delivery_charge');

  if (!hasDiscountAmount) {
    db.exec(`ALTER TABLE orders ADD COLUMN discount_amount REAL NOT NULL DEFAULT 0`);
  }

  if (!hasDeliveryCharge) {
    db.exec(`ALTER TABLE orders ADD COLUMN delivery_charge REAL NOT NULL DEFAULT 0`);
  }
}

function seedData() {
  const productCount = db.prepare('SELECT COUNT(*) AS count FROM products').get().count;
  if (productCount > 0) {
    return;
  }

  const createdAt = nowIso();
  const products = [
    ['Large Pizza', 'Pizza', 1800, 'Loaded cheese pizza', 1],
    ['Zinger Burger', 'Burger', 650, 'Crispy chicken burger', 1],
    ['Fries', 'Fries', 320, 'Regular salted fries', 1],
    ['Soft Drink', 'Drinks', 180, '300ml chilled drink', 1],
    ['Garlic Bread', 'Sides', 450, 'Oven-baked garlic bread', 1],
  ];

  const insertProduct = db.prepare(`
    INSERT INTO products (name, category, price, description, is_active, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const productIds = products.map((product) => insertProduct.run(...product, createdAt, createdAt).lastInsertRowid);

  const dealStmt = db.prepare(`
    INSERT INTO deals (name, price, is_active, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
  `);
  const dealItemStmt = db.prepare(`
    INSERT INTO deal_items (deal_id, product_id, quantity)
    VALUES (?, ?, ?)
  `);

  const dealId = dealStmt.run('Deal 1', 2100, 1, createdAt, createdAt).lastInsertRowid;
  dealItemStmt.run(dealId, productIds[0], 1);
  dealItemStmt.run(dealId, productIds[3], 2);
}

ensureSchema();
seedData();

const productSchema = z.object({
  name: z.string().min(1),
  category: z.string().min(1),
  price: z.coerce.number().nonnegative(),
  description: z.string().optional().default(''),
  isActive: z.coerce.boolean().optional().default(true),
});

const dealSchema = z.object({
  name: z.string().min(1),
  price: z.coerce.number().nonnegative(),
  isActive: z.coerce.boolean().optional().default(true),
  items: z.array(z.object({
    productId: z.coerce.number().int().positive(),
    quantity: z.coerce.number().int().positive(),
  })).min(1),
});

const startShiftSchema = z.object({
  startCash: z.coerce.number().nonnegative(),
});

const expenseSchema = z.object({
  name: z.string().min(1),
  amount: z.coerce.number().positive(),
  note: z.string().optional().default(''),
});

const orderSchema = z.object({
  orderType: z.enum(['Hall', 'Takeaway', 'Delivery']),
  tableNumber: z.string().optional().nullable(),
  customerName: z.string().optional().nullable(),
  phoneNumber: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  paymentType: z.enum(['Cash', 'Online', 'Pending']),
  discountAmount: z.coerce.number().nonnegative().optional().default(0),
  deliveryCharge: z.coerce.number().nonnegative().optional().default(0),
  notes: z.string().optional().default(''),
  items: z.array(z.object({
    itemType: z.enum(['product', 'deal']),
    id: z.coerce.number().int().positive(),
    name: z.string().min(1),
    unitPrice: z.coerce.number().nonnegative(),
    quantity: z.coerce.number().int().positive(),
    total: z.coerce.number().nonnegative(),
  })).min(1),
});

const closeShiftSchema = z.object({
  actualCash: z.coerce.number().nonnegative(),
});

const searchOrdersSchema = z.object({
  q: z.string().optional().default(''),
});

function getActiveShift() {
  return db.prepare(`
    SELECT *
    FROM shifts
    WHERE status = 'OPEN'
    ORDER BY opened_at DESC
    LIMIT 1
  `).get();
}

function getProducts() {
  return db.prepare(`
    SELECT
      id,
      name,
      category,
      price,
      description,
      is_active AS isActive,
      created_at AS createdAt,
      updated_at AS updatedAt
    FROM products
    ORDER BY category, name
  `).all();
}

function validateDealProductIds(items) {
  const knownIds = new Set(
    db.prepare('SELECT id FROM products').all().map((row) => row.id),
  );

  const missing = items
    .map((item) => item.productId)
    .filter((productId) => !knownIds.has(productId));

  return {
    valid: missing.length === 0,
    missing,
  };
}

function getDeals() {
  const deals = db.prepare(`
    SELECT
      id,
      name,
      price,
      is_active AS isActive,
      created_at AS createdAt,
      updated_at AS updatedAt
    FROM deals
    ORDER BY name
  `).all();

  const dealItems = db.prepare(`
    SELECT
      di.deal_id AS dealId,
      di.product_id AS productId,
      di.quantity,
      p.name AS productName
    FROM deal_items di
    JOIN products p ON p.id = di.product_id
    ORDER BY di.deal_id, p.name
  `).all();

  return deals.map((deal) => ({
    ...deal,
    items: dealItems
      .filter((item) => item.dealId === deal.id)
      .map((item) => ({
        productId: item.productId,
        productName: item.productName,
        quantity: item.quantity,
      })),
  }));
}

function getDashboardSummary(shiftId) {
  if (!shiftId) {
    return {
      startCash: 0,
      cashSales: 0,
      onlineSales: 0,
      pendingSales: 0,
      expenses: 0,
      expectedClosingCash: 0,
      orderCount: 0,
    };
  }

  const shift = db.prepare('SELECT * FROM shifts WHERE id = ?').get(shiftId);
  const totals = db.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN payment_type = 'Cash' THEN total END), 0) AS cashSales,
      COALESCE(SUM(CASE WHEN payment_type = 'Online' THEN total END), 0) AS onlineSales,
      COALESCE(SUM(CASE WHEN payment_type = 'Pending' THEN total END), 0) AS pendingSales,
      COUNT(*) AS orderCount
    FROM orders
    WHERE shift_id = ?
  `).get(shiftId);
  const expenseRow = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) AS expenses
    FROM expenses
    WHERE shift_id = ?
  `).get(shiftId);
  const expectedClosingCash = Number(shift.start_cash) + Number(totals.cashSales) - Number(expenseRow.expenses);

  return {
    startCash: Number(shift.start_cash),
    cashSales: Number(totals.cashSales),
    onlineSales: Number(totals.onlineSales),
    pendingSales: Number(totals.pendingSales),
    expenses: Number(expenseRow.expenses),
    expectedClosingCash,
    orderCount: totals.orderCount,
  };
}

function getRecentOrders(limit = 10) {
  return db.prepare(`
    SELECT
      id,
      order_number AS orderNumber,
      order_type AS orderType,
      table_number AS tableNumber,
      customer_name AS customerName,
      phone_number AS phoneNumber,
      address,
      payment_type AS paymentType,
      subtotal,
      discount_amount AS discountAmount,
      delivery_charge AS deliveryCharge,
      total,
      notes,
      created_at AS createdAt
    FROM orders
    ORDER BY created_at DESC
    LIMIT ?
  `).all(limit);
}

function getOrders(search = '') {
  const query = String(search || '').trim();
  if (!query) {
    return getRecentOrders(50);
  }

  const like = `%${query}%`;
  const numeric = Number(query);

  return db.prepare(`
    SELECT
      id,
      order_number AS orderNumber,
      order_type AS orderType,
      table_number AS tableNumber,
      customer_name AS customerName,
      phone_number AS phoneNumber,
      address,
      payment_type AS paymentType,
      subtotal,
      discount_amount AS discountAmount,
      delivery_charge AS deliveryCharge,
      total,
      notes,
      created_at AS createdAt
    FROM orders
    WHERE order_number = ?
       OR customer_name LIKE ?
       OR phone_number LIKE ?
       OR table_number LIKE ?
       OR order_type LIKE ?
       OR payment_type LIKE ?
    ORDER BY created_at DESC
    LIMIT 50
  `).all(Number.isNaN(numeric) ? -1 : numeric, like, like, like, like, like);
}

function getKot(orderId) {
  const order = db.prepare(`
    SELECT
      id,
      order_number AS orderNumber,
      order_type AS orderType,
      table_number AS tableNumber,
      customer_name AS customerName,
      phone_number AS phoneNumber,
      address,
      notes,
      created_at AS createdAt
    FROM orders
    WHERE id = ?
  `).get(orderId);

  const items = db.prepare(`
    SELECT
      name,
      quantity,
      item_type AS itemType
    FROM order_items
    WHERE order_id = ?
    ORDER BY id
  `).all(orderId);

  return order ? { ...order, items } : null;
}

function getLatestKot() {
  const latestOrder = db.prepare(`
    SELECT id
    FROM orders
    ORDER BY created_at DESC
    LIMIT 1
  `).get();

  if (!latestOrder) {
    return null;
  }

  return getKot(latestOrder.id);
}

function getReceipt(orderId) {
  const order = db.prepare(`
    SELECT
      id,
      order_number AS orderNumber,
      order_type AS orderType,
      table_number AS tableNumber,
      customer_name AS customerName,
      phone_number AS phoneNumber,
      address,
      payment_type AS paymentType,
      subtotal,
      discount_amount AS discountAmount,
      delivery_charge AS deliveryCharge,
      total,
      notes,
      created_at AS createdAt
    FROM orders
    WHERE id = ?
  `).get(orderId);

  if (!order) {
    return null;
  }

  const items = db.prepare(`
    SELECT
      name,
      quantity,
      unit_price AS unitPrice,
      total,
      item_type AS itemType
    FROM order_items
    WHERE order_id = ?
    ORDER BY id
  `).all(orderId);

  return {
    ...order,
    items,
    shop: {
      name: SHOP_NAME,
      currency: CURRENCY,
    },
  };
}

function getReport(date) {
  const { start, end } = getDateRange(date);
  const orders = db.prepare(`
    SELECT
      COUNT(*) AS totalOrders,
      COALESCE(SUM(CASE WHEN payment_type = 'Cash' THEN total END), 0) AS cashSales,
      COALESCE(SUM(CASE WHEN payment_type = 'Online' THEN total END), 0) AS onlineSales,
      COALESCE(SUM(CASE WHEN payment_type = 'Pending' THEN total END), 0) AS pendingSales
    FROM orders
    WHERE created_at BETWEEN ? AND ?
  `).get(start, end);

  const expenses = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) AS totalExpenses
    FROM expenses
    WHERE created_at BETWEEN ? AND ?
  `).get(start, end);

  const closing = db.prepare(`
    SELECT
      COALESCE(SUM(expected_cash), 0) AS expectedClosingCash,
      COALESCE(SUM(actual_cash), 0) AS actualClosingCash,
      COALESCE(SUM(difference), 0) AS difference
    FROM shifts
    WHERE COALESCE(closed_at, opened_at) BETWEEN ? AND ?
  `).get(start, end);

  return {
    date: start.slice(0, 10),
    totalOrders: orders.totalOrders,
    cashSales: Number(orders.cashSales),
    onlineSales: Number(orders.onlineSales),
    pendingSales: Number(orders.pendingSales),
    totalExpenses: Number(expenses.totalExpenses),
    expectedClosingCash: Number(closing.expectedClosingCash),
    actualClosingCash: Number(closing.actualClosingCash),
    difference: Number(closing.difference),
  };
}

function getBootstrap(date) {
  const products = getProducts();
  const activeShift = getActiveShift();
  return {
    products,
    deals: getDeals(),
    activeShift,
    dashboard: getDashboardSummary(activeShift?.id),
    recentOrders: getRecentOrders(),
    report: getReport(date),
    latestKot: getLatestKot(),
    categories: [...new Set(products.map((product) => product.category))],
  };
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.get('/api/bootstrap', (req, res) => {
  res.json(getBootstrap(req.query.date));
});

app.get('/api/reports', (req, res) => {
  res.json(getReport(req.query.date));
});

app.get('/api/orders', (req, res) => {
  const parsed = searchOrdersSchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  res.json(getOrders(parsed.data.q));
});

app.get('/api/orders/:id/receipt', (req, res) => {
  const receipt = getReceipt(Number(req.params.id));
  if (!receipt) {
    return res.status(404).json({ error: 'Order not found.' });
  }

  res.json(receipt);
});

app.post('/api/products', (req, res) => {
  const parsed = productSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const { name, category, price, description, isActive } = parsed.data;
  const stamp = nowIso();
  const result = db.prepare(`
    INSERT INTO products (name, category, price, description, is_active, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(name, category, price, description, isActive ? 1 : 0, stamp, stamp);

  res.status(201).json({
    id: result.lastInsertRowid,
    name,
    category,
    price,
    description,
    isActive,
    createdAt: stamp,
    updatedAt: stamp,
  });
});

app.put('/api/products/:id', (req, res) => {
  const parsed = productSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const { name, category, price, description, isActive } = parsed.data;
  const stamp = nowIso();
  db.prepare(`
    UPDATE products
    SET name = ?, category = ?, price = ?, description = ?, is_active = ?, updated_at = ?
    WHERE id = ?
  `).run(name, category, price, description, isActive ? 1 : 0, stamp, Number(req.params.id));

  res.json({ ok: true });
});

app.delete('/api/products/:id', (req, res) => {
  db.prepare('DELETE FROM products WHERE id = ?').run(Number(req.params.id));
  res.json({ ok: true });
});

app.post('/api/deals', (req, res) => {
  const parsed = dealSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const validation = validateDealProductIds(parsed.data.items);
  if (!validation.valid) {
    return res.status(400).json({
      error: `Deal contains invalid product IDs: ${validation.missing.join(', ')}`,
    });
  }

  const stamp = nowIso();
  const createDeal = db.transaction((payload) => {
    const dealId = db.prepare(`
      INSERT INTO deals (name, price, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(payload.name, payload.price, payload.isActive ? 1 : 0, stamp, stamp).lastInsertRowid;

    const insertItem = db.prepare(`
      INSERT INTO deal_items (deal_id, product_id, quantity)
      VALUES (?, ?, ?)
    `);

    payload.items.forEach((item) => {
      insertItem.run(dealId, item.productId, item.quantity);
    });

    return dealId;
  });

  const dealId = createDeal(parsed.data);
  res.status(201).json(getDeals().find((deal) => deal.id === dealId));
});

app.put('/api/deals/:id', (req, res) => {
  const parsed = dealSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const validation = validateDealProductIds(parsed.data.items);
  if (!validation.valid) {
    return res.status(400).json({
      error: `Deal contains invalid product IDs: ${validation.missing.join(', ')}`,
    });
  }

  const dealId = Number(req.params.id);
  const stamp = nowIso();

  const updateDeal = db.transaction((payload) => {
    db.prepare(`
      UPDATE deals
      SET name = ?, price = ?, is_active = ?, updated_at = ?
      WHERE id = ?
    `).run(payload.name, payload.price, payload.isActive ? 1 : 0, stamp, dealId);

    db.prepare('DELETE FROM deal_items WHERE deal_id = ?').run(dealId);

    const insertItem = db.prepare(`
      INSERT INTO deal_items (deal_id, product_id, quantity)
      VALUES (?, ?, ?)
    `);

    payload.items.forEach((item) => {
      insertItem.run(dealId, item.productId, item.quantity);
    });
  });

  updateDeal(parsed.data);
  res.json(getDeals().find((deal) => deal.id === dealId));
});

app.delete('/api/deals/:id', (req, res) => {
  db.prepare('DELETE FROM deals WHERE id = ?').run(Number(req.params.id));
  res.json({ ok: true });
});

app.post('/api/shifts/start', (req, res) => {
  const parsed = startShiftSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const existingShift = getActiveShift();
  if (existingShift) {
    return res.status(400).json({ error: 'An active shift is already open.' });
  }

  const openedAt = nowIso();
  const result = db.prepare(`
    INSERT INTO shifts (start_cash, status, opened_at)
    VALUES (?, 'OPEN', ?)
  `).run(parsed.data.startCash, openedAt);

  res.status(201).json({
    id: result.lastInsertRowid,
    startCash: parsed.data.startCash,
    status: 'OPEN',
    openedAt,
  });
});

app.post('/api/expenses', (req, res) => {
  const parsed = expenseSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const activeShift = getActiveShift();
  if (!activeShift) {
    return res.status(400).json({ error: 'Start a shift before adding expenses.' });
  }

  const stamp = nowIso();
  const result = db.prepare(`
    INSERT INTO expenses (shift_id, name, amount, note, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(activeShift.id, parsed.data.name, parsed.data.amount, parsed.data.note, stamp);

  res.status(201).json({
    id: result.lastInsertRowid,
    shiftId: activeShift.id,
    createdAt: stamp,
    ...parsed.data,
  });
});

app.post('/api/orders', (req, res) => {
  const parsed = orderSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const activeShift = getActiveShift();
  if (!activeShift) {
    return res.status(400).json({ error: 'Start a shift before placing orders.' });
  }

  if (parsed.data.orderType === 'Hall' && !parsed.data.tableNumber) {
    return res.status(400).json({ error: 'Table number is required for hall orders.' });
  }

  if (
    parsed.data.orderType === 'Delivery' &&
    (!parsed.data.customerName || !parsed.data.phoneNumber || !parsed.data.address)
  ) {
    return res.status(400).json({
      error: 'Delivery orders require customer name, phone number, and address.',
    });
  }

  const subtotal = parsed.data.items.reduce((sum, item) => sum + item.total, 0);
  const discountAmount = Math.min(Number(parsed.data.discountAmount || 0), subtotal);
  const deliveryCharge = Number(parsed.data.deliveryCharge || 0);
  const total = Math.max(0, subtotal - discountAmount + deliveryCharge);
  const createdAt = nowIso();
  const orderNumberRow = db.prepare(`
    SELECT COALESCE(MAX(order_number), 100) + 1 AS nextOrderNumber
    FROM orders
  `).get();

  const createOrder = db.transaction((payload) => {
    const orderId = db.prepare(`
      INSERT INTO orders (
        shift_id, order_number, order_type, table_number, customer_name, phone_number,
        address, payment_type, subtotal, discount_amount, delivery_charge, total, notes, created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      activeShift.id,
      orderNumberRow.nextOrderNumber,
      payload.orderType,
      payload.tableNumber || null,
      payload.customerName || null,
      payload.phoneNumber || null,
      payload.address || null,
      payload.paymentType,
      subtotal,
      discountAmount,
      deliveryCharge,
      total,
      payload.notes || '',
      createdAt,
    ).lastInsertRowid;

    const insertItem = db.prepare(`
      INSERT INTO order_items (
        order_id, item_type, product_id, deal_id, name, unit_price, quantity, total
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    payload.items.forEach((item) => {
      insertItem.run(
        orderId,
        item.itemType,
        item.itemType === 'product' ? item.id : null,
        item.itemType === 'deal' ? item.id : null,
        item.name,
        item.unitPrice,
        item.quantity,
        item.total,
      );
    });

    return orderId;
  });

  const orderId = createOrder(parsed.data);
  res.status(201).json({
    orderId,
    orderNumber: orderNumberRow.nextOrderNumber,
    kot: getKot(orderId),
  });
});

app.post('/api/shifts/close', (req, res) => {
  const parsed = closeShiftSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const activeShift = getActiveShift();
  if (!activeShift) {
    return res.status(400).json({ error: 'No active shift found.' });
  }

  const dashboard = getDashboardSummary(activeShift.id);
  const difference = parsed.data.actualCash - dashboard.expectedClosingCash;
  const closedAt = nowIso();

  db.prepare(`
    UPDATE shifts
    SET status = 'CLOSED',
        expected_cash = ?,
        actual_cash = ?,
        difference = ?,
        closed_at = ?
    WHERE id = ?
  `).run(
    dashboard.expectedClosingCash,
    parsed.data.actualCash,
    difference,
    closedAt,
    activeShift.id,
  );

  let status = 'Balanced';
  if (difference > 0) {
    status = 'Extra Cash';
  } else if (difference < 0) {
    status = 'Missing Cash';
  }

  res.json({
    expectedCash: dashboard.expectedClosingCash,
    actualCash: parsed.data.actualCash,
    difference,
    status,
  });
});

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`Pizza POS backend running on http://localhost:${PORT}`);
});
