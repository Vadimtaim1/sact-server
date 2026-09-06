const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

const db = new sqlite3.Database('./database.db');

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT,
        producer TEXT,
        farm_info TEXT,
        shelf_life TEXT,
        price REAL,
        unit TEXT,
        emoji TEXT DEFAULT '📦',
        quality_badges TEXT
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        product_id INTEGER,
        product_name TEXT,
        quantity INTEGER,
        total_price REAL,
        client_name TEXT,
        agent_name TEXT,
        shift TEXT,
        status TEXT DEFAULT 'Новый',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE,
        password TEXT,
        role TEXT,
        full_name TEXT,
        shift TEXT
    )`);

    db.get(`SELECT COUNT(*) as count FROM products`, (err, row) => {
        if (row.count === 0) {
            db.run(`INSERT INTO products (name, description, producer, farm_info, shelf_life, price, unit, emoji, quality_badges) VALUES
                ('Молоко Деревенское', 'Натуральное молоко высшего сорта. Без добавок. Жирность 3.5%.', 'ТОО АгроМолоко', 'Коровы пасутся на экологически чистых пастбищах.', '2025-01-15', 450, 'литр', '🥛', 'Халяль, Эко, ГОСТ'),
                ('Говядина Мраморная', 'Отборная мраморная говядина. Выдержка 21 день.', 'ТОО КостанайМясо', 'Коровы пасутся на горных пастбищах.', '2025-02-01', 3200, 'кг', '🥩', 'Халяль, Мраморность 4+'),
                ('Яйца Деревенские', 'Куриные яйца отборные. Свежие, с ярким желтком.', 'ТОО Птицефабрика', 'Куры свободного выгула. Корм — натуральное зерно.', '2025-01-25', 650, 'десяток', '🥚', 'Эко, Отборные')
            `);
        }
    });

    db.get(`SELECT COUNT(*) as count FROM users`, (err, row) => {
        if (row.count === 0) {
            db.run(`INSERT INTO users (username, password, role, full_name, shift) VALUES
                ('trade1', '123456', 'trade', 'Иванов Иван', '1'),
                ('purchaser1', '123456', 'purchaser', 'Петров Петр', '1'),
                ('director1', '123456', 'director', 'Сидоров Сергей', '1')
            `);
        }
    });
});

app.get('/api/products', (req, res) => {
    db.all(`SELECT * FROM products ORDER BY id DESC`, (err, rows) => {
        if (err) { res.status(500).json({ error: err.message }); return; }
        res.json(rows);
    });
});

app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body;
    db.get(
        `SELECT id, username, role, full_name, shift FROM users WHERE username = ? AND password = ?`,
        [username, password],
        (err, row) => {
            if (err) { res.status(500).json({ error: err.message }); return; }
            if (!row) { res.status(401).json({ error: 'Неверный логин или пароль' }); return; }
            res.json({ success: true, user: row });
        }
    );
});

app.post('/api/trade/order', (req, res) => {
    const { product_id, product_name, quantity, total_price, client_name, agent_name, shift } = req.body;
    db.run(
        `INSERT INTO orders (product_id, product_name, quantity, total_price, client_name, agent_name, shift) 
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [product_id, product_name, quantity, total_price, client_name, agent_name, shift],
        function(err) {
            if (err) { res.status(500).json({ error: err.message }); return; }
            res.json({ id: this.lastID, status: 'Новый' });
        }
    );
});

app.post('/api/purchaser/product', (req, res) => {
    const { name, description, producer, farm_info, shelf_life, price, unit, emoji, quality_badges } = req.body;
    db.run(
        `INSERT INTO products (name, description, producer, farm_info, shelf_life, price, unit, emoji, quality_badges) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [name, description, producer, farm_info, shelf_life, price, unit, emoji, quality_badges],
        function(err) {
            if (err) { res.status(500).json({ error: err.message }); return; }
            res.json({ id: this.lastID, name });
        }
    );
});

app.get('/api/purchaser/orders', (req, res) => {
    db.all(`SELECT * FROM orders WHERE status = 'Новый' ORDER BY created_at ASC`, (err, rows) => {
        if (err) { res.status(500).json({ error: err.message }); return; }
        res.json(rows);
    });
});

app.put('/api/purchaser/order/:id/deliver', (req, res) => {
    db.run(
        `UPDATE orders SET status = 'Доставлен', delivered_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [req.params.id],
        function(err) {
            if (err) { res.status(500).json({ error: err.message }); return; }
            res.json({ id: req.params.id, status: 'Доставлен' });
        }
    );
});

app.get('/api/director/stats', (req, res) => {
    db.get(`
        SELECT 
            (SELECT COUNT(*) FROM orders) as total_orders,
            (SELECT COUNT(*) FROM orders WHERE status = 'Доставлен') as delivered_orders,
            (SELECT COUNT(*) FROM orders WHERE status = 'Новый') as pending_orders,
            (SELECT SUM(total_price) FROM orders WHERE status = 'Доставлен') as total_revenue,
            (SELECT COUNT(*) FROM products) as total_products,
            (SELECT agent_name FROM orders GROUP BY agent_name ORDER BY COUNT(*) DESC LIMIT 1) as top_agent
    `, (err, row) => {
        if (err) { res.status(500).json({ error: err.message }); return; }
        res.json(row);
    });
});

app.get('/api/director/top-products', (req, res) => {
    db.all(`
        SELECT product_name, COUNT(*) as count, SUM(quantity) as total_quantity
        FROM orders
        WHERE status = 'Доставлен'
        GROUP BY product_name
        ORDER BY count DESC
        LIMIT 5
    `, (err, rows) => {
        if (err) { res.status(500).json({ error: err.message }); return; }
        res.json(rows);
    });
});

const PORT = 5000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`====================================`);
    console.log(`🚀 САЦТ СЕРВЕР ЗАПУЩЕН!`);
    console.log(`📡 Порт: ${PORT}`);
    console.log(`====================================`);
});