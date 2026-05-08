    require("dotenv").config();

    const { Resend } = require("resend");
    const resend = new Resend(process.env.RESEND_API_KEY);
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
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
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

    // security response (same behavior)
    if (!user) {
        return res.json({ message: "If account exists, code sent." });
    }

    // generate code
    const code = Math.floor(100000 + Math.random() * 900000).toString();

    resetCodes[email] = {
        code,
        expires: Date.now() + 10 * 60 * 1000
    };

    try {
        // SEND EMAIL USING RESEND
        await resend.emails.send({
            from: "Scentify <onboarding@resend.dev>",
            to: email,
            subject: "Scentify Password Reset Code",
            html: `
                <div style="font-family:Arial;padding:20px">
                    <h2>Password Reset Code</h2>
                    <p>Hello <b>${user.name}</b>,</p>
                    <h1 style="color:#e91e63">${code}</h1>
                    <p>This code expires in 10 minutes.</p>
                    <hr/>
                    <small>If you didn't request this, ignore this email.</small>
                </div>
            `
        });

        console.log("📩 Reset email sent via Resend:", email);
        res.json({ message: "Reset code sent!" });

    } catch (err) {
        console.error("Resend error:", err);
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