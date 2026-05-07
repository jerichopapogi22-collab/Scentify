    require("dotenv").config();

    const express = require("express");
    const cors = require("cors");
    const fs = require("fs");
    const path = require("path");
    const nodemailer = require("nodemailer");

    const app = express();
    const DB_FILE = path.join(__dirname, "database.json");

    app.use(cors());
    app.use(express.json());

    /* =====================================================
    📧 GMAIL SMTP EMAIL SETUP
    ===================================================== */
    const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS
        }
    });

    transporter.verify((error) => {
        if (error) {
            console.error("❌ Gmail SMTP Error:", error);
        } else {
            console.log("✅ Gmail SMTP ready");
        }
    });

    /* =====================================================
    DATABASE FUNCTIONS
    ===================================================== */
    function readDB() {
        try {
            if (!fs.existsSync(DB_FILE)) {
                const defaultData = { users: [], cart: [] };
                fs.writeFileSync(DB_FILE, JSON.stringify(defaultData, null, 2));
                return defaultData;
            }
            const data = fs.readFileSync(DB_FILE, "utf-8");
            return JSON.parse(data);
        } catch {
            return { users: [], cart: [] };
        }
    }

    function writeDB(data) {
        fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
    }

    function getNextId(array) {
        return array.length ? Math.max(...array.map(item => item.id)) + 1 : 1;
    }

    /* =====================================================
    STATIC FILES
    ===================================================== */
    app.get(['/', '/index.html'], (req, res) => {
        res.sendFile(path.join(__dirname, 'index.html'));
    });
    app.use('/src', express.static(path.join(__dirname, 'src')));
    app.use('/icons', express.static(path.join(__dirname, 'public', 'icons')));
    app.use(express.static(path.join(__dirname, 'public'), { index: false }));

    /* =====================================================
    AUTH ROUTES
    ===================================================== */
    app.post("/signup", (req, res) => {
        const { name, email, password } = req.body;
        const db = readDB();

        if (db.users.find(u => u.email === email)) {
            return res.status(400).json({ message: "Email already exists!" });
        }

        const newUser = { id: getNextId(db.users), name, email, password };
        db.users.push(newUser);
        writeDB(db);

        const { password: pw, ...safeUser } = newUser;
        res.json(safeUser);
    });

    app.post("/login", (req, res) => {
        const { email, password } = req.body;
        const db = readDB();
        const user = db.users.find(u => u.email === email);

        if (!user) return res.status(401).json({ message: "Invalid credentials!" });
        if (user.password !== password) return res.status(401).json({ message: "Incorrect Password" });

        const { password: pw, ...safeUser } = user;
        res.json(safeUser);
    });

    /* =====================================================
    CART ROUTES
    ===================================================== */
    app.post("/add-to-cart", (req, res) => {
        const { user_id, product_name, price, quantity, image } = req.body;
        const db = readDB();
        const userId = parseInt(user_id);
        const existing = db.cart.find(i => i.user_id === userId && i.product_name === product_name);

        if (existing) {
            existing.quantity = Math.min(existing.quantity + quantity, 9);
        } else {
            db.cart.push({
                id: getNextId(db.cart),
                user_id: userId,
                product_name,
                price,
                quantity,
                image
            });
        }

        writeDB(db);
        res.json({ message: "Added to cart" });
    });

    app.get("/cart/:id", (req, res) => {
        const db = readDB();
        res.json(db.cart.filter(item => item.user_id == req.params.id));
    });

    /* =====================================================
    🔐 FORGOT PASSWORD (WORKING VERSION)
    ===================================================== */
    const resetCodes = {};

    app.post('/forgot-password', async (req, res) => {
        const email = (req.body.email || '').toLowerCase().trim();
        const db = readDB();
        const user = db.users.find(u => u.email.toLowerCase() === email);

        if (!user) return res.json({ message: "If account exists, code sent." });

        const code = Math.floor(100000 + Math.random() * 900000).toString();
        resetCodes[email] = { code, expires: Date.now() + 10 * 60 * 1000 };

        const mailOptions = {
            from: `"Scentify Support" <${process.env.EMAIL_USER}>`,
            to: email,
            subject: "Scentify Password Reset Code",
            html: `<h2>Your reset code:</h2><h1>${code}</h1><p>Expires in 10 minutes.</p>`
        };

        try {
            await transporter.sendMail(mailOptions);
            console.log("📩 Reset email sent:", email);
            res.json({ message: "Reset code sent!" });
        } catch (err) {
            console.error(err);
            res.status(500).json({ message: "Email failed." });
        }
    });

    app.post('/reset-password', (req, res) => {
        const { email, code, newPassword } = req.body;
        const reset = resetCodes[email];

        if (!reset || reset.code !== code || Date.now() > reset.expires)
            return res.status(400).json({ message: "Invalid/expired code" });

        const db = readDB();
        const user = db.users.find(u => u.email === email);
        user.password = newPassword;
        writeDB(db);
        delete resetCodes[email];

        res.json({ message: "Password updated!" });
    });

    /* ===================================================== */
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => console.log("🚀 Server running on port " + PORT));