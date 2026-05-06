require("dotenv").config();
const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const nodemailer = require("nodemailer");

const app = express();
const PORT = 3000;
const DB_FILE = path.join(__dirname, "database.json");

app.use(cors());
app.use(express.json());

// Email transporter (configure with your SMTP settings)
// ✅ REAL GMAIL SMTP (APP PASSWORD)
const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

transporter.verify((error, success) => {
    if (error) {
        console.warn('⚠️ Mailer configuration warning:', error.message || error);
    } else {
        console.log('✅ Mailer is ready to send messages');
    }
});

// Temporary storage for reset codes (in production, use database)
const resetCodes = {};

app.get(['/', '/index.html'], (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.use('/src', express.static(path.join(__dirname, 'src')));
app.use('/icons', express.static(path.join(__dirname, 'public', 'icons')));
app.use(express.static(path.join(__dirname, 'public'), { index: false }));

function readDB() {
    try {
        if (!fs.existsSync(DB_FILE)) {
            const defaultData = { users: [], cart: [] };
            fs.writeFileSync(DB_FILE, JSON.stringify(defaultData, null, 2));
            return defaultData;
        }
        const data = fs.readFileSync(DB_FILE, "utf-8");
        return JSON.parse(data);
    } catch (error) {
        console.error("Error reading DB:", error);
        return { users: [], cart: [] };
    }
}

function writeDB(data) {
    try {
        fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
        console.log("✅ DB saved");
    } catch (error) {
        console.error("Error writing DB:", error);
    }
}

function getNextId(array) {
    return array.length ? Math.max(...array.map(item => item.id)) + 1 : 1;
}

app.post("/signup", (req, res) => {
    const { name, email, password } = req.body;
    const db = readDB();
    
    if (db.users.find(u => u.email === email)) {
        return res.status(400).json({ message: "Email already exists!" });
    }
    
    const newUser = { 
        id: getNextId(db.users), 
        name, 
        email, 
        password 
    };
    
    db.users.push(newUser);
    writeDB(db);
    const { password: pw, ...safeUser } = newUser;
    res.json(safeUser);
});

app.post("/login", (req, res) => {
    const { email, password } = req.body;
    const db = readDB();
    
    const user = db.users.find(u => u.email === email);
    if (user) {
        if (user.password === password) {
            const { password, ...safeUser } = user;
            res.json(safeUser);
        } else {
            res.status(401).json({ message: "Incorrect Password" });
        }
    } else {
        res.status(401).json({ message: "Invalid credentials!" });
    }
});

app.post("/add-to-cart", (req, res) => {
    const { user_id, product_name, price, quantity, image } = req.body;
    const db = readDB();
    
    const userId = parseInt(user_id);
    const normalizedProductName = product_name?.trim().toLowerCase();
    const duplicates = db.cart.filter(item => item.user_id === userId && item.product_name?.trim().toLowerCase() === normalizedProductName);
    let item = duplicates[0];
    const requestedQty = parseInt(quantity) || 1;

    if (item) {
        const duplicateQty = duplicates.slice(1).reduce((sum, dup) => sum + (parseInt(dup.quantity) || 1), 0);
        item.quantity = Math.min((parseInt(item.quantity) || 1) + duplicateQty + requestedQty, 9);
        item.price = Number(price);
        item.image = image || item.image || '';
        db.cart = db.cart.filter(it => !(it.user_id === userId && it.product_name?.trim().toLowerCase() === normalizedProductName && it.id !== item.id));
    } else {
        item = {
            id: getNextId(db.cart),
            user_id: userId,
            product_name: product_name.trim(),
            price: Number(price),
            quantity: requestedQty,
            image: image || ''
        };
        db.cart.push(item);
    }
    
    writeDB(db);
    res.json({ message: `${product_name} added to cart!`, item });
});

app.get("/cart/:id", (req, res) => {
    const userId = parseInt(req.params.id);
    const db = readDB();
    const userCart = db.cart.filter(item => item.user_id === userId);
    res.json(userCart);
});

app.delete("/cart/:id", (req, res) => {
    const userId = parseInt(req.params.id);
    const db = readDB();
    db.cart = db.cart.filter(item => item.user_id !== userId);
    writeDB(db);
    console.log(`🗑️ Cleared cart for user ${userId}`);
    res.json({ message: "Cart cleared!" });
});

app.delete("/cart/item/:id", (req, res) => {
    const itemId = parseInt(req.params.id);
    const db = readDB();
    const itemIndex = db.cart.findIndex(item => item.id === itemId);
    if (itemIndex === -1) {
        return res.status(404).json({ message: "Cart item not found." });
    }
    db.cart.splice(itemIndex, 1);
    writeDB(db);
    res.json({ message: "Cart item removed." });
});

app.post('/forgot-password', (req, res) => {
    const email = (req.body.email || '').trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ message: 'Please provide a valid email address.' });
    }

    const db = readDB();
    const user = db.users.find(u => u.email.toLowerCase() === email);
    if (!user) {
        console.warn(`Password reset requested for unknown email: ${email}`);
        return res.json({ message: 'If an account exists for this email, a reset code has been sent.' });
    }

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    resetCodes[email] = { code, expires: Date.now() + 10 * 60 * 1000 }; // 10 minutes

    const mailOptions = {
    from: process.env.EMAIL_FROM || `"Scentify Support" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: "🔐 Scentify Password Reset Code",
    html: `
        <div style="font-family:Arial;padding:20px">
            <h2>Password Reset Request</h2>
            <p>Hello <b>${user.name}</b>,</p>
            <p>Your reset code is:</p>
            <h1 style="color:#e91e63">${code}</h1>
            <p>This code expires in <b>10 minutes</b>.</p>
            <hr/>
            <small>If you didn't request this, ignore this email.</small>
        </div>
    `
};

    transporter.sendMail(mailOptions, (mailError, info) => {
        if (mailError) {
            console.error('Error sending reset email:', mailError);
            return res.status(500).json({ message: 'Unable to send password reset email.' });
        }

        console.log('Password reset email sent to', email);
        console.log('Email sent:', info.response);
        res.json({
            message: 'Reset code generated successfully!'
        });
    });
});

app.post('/reset-password', (req, res) => {
    const email = (req.body.email || '').trim().toLowerCase();
    const { code, newPassword } = req.body;

    if (!email || !code || !newPassword || newPassword.length < 8) {
        return res.status(400).json({ message: 'Invalid request. Please provide email, code, and a password of at least 8 characters.' });
    }

    const resetData = resetCodes[email];
    if (!resetData || resetData.code !== code || Date.now() > resetData.expires) {
        return res.status(400).json({ message: 'Invalid or expired code.' });
    }

    const db = readDB();
    const user = db.users.find(u => u.email.toLowerCase() === email);
    if (!user) {
        return res.status(404).json({ message: 'No account found for this email address.' });
    }

    user.password = newPassword;
    writeDB(db);
    delete resetCodes[email];
    res.json({ message: 'Password reset successfully.' });
});

app.get(/^\/(?!api\/).*$/, (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
    console.log(`🚀 Server: http://localhost:${PORT}`);
    console.log(`📁 DB: ${DB_FILE}`);
});
