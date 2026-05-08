require("dotenv").config();

const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const { Resend } = require("resend");

const app = express();
const DB_FILE = path.join(__dirname, "database.json");

// =====================
// MIDDLEWARE
// =====================
app.use(cors());
app.use(express.json());

// =====================
// EMAIL (RESEND ONLY)
// =====================
const resend = new Resend(process.env.RESEND_API_KEY);

// =====================
// RESET CODES STORAGE
// =====================
const resetCodes = {};

// =====================
// SAFE HELPERS
// =====================
const safeEmail = (email) =>
  typeof email === "string" ? email.toLowerCase().trim() : "";

const safeFindUser = (db, email) => {
  return db.users.find(
    (u) => u?.email && typeof u.email === "string" && u.email.toLowerCase() === email
  );
};

// =====================
// DATABASE
// =====================
function readDB() {
  try {
    if (!fs.existsSync(DB_FILE)) {
      const defaultData = { users: [], cart: [] };
      fs.writeFileSync(DB_FILE, JSON.stringify(defaultData, null, 2));
      return defaultData;
    }
    return JSON.parse(fs.readFileSync(DB_FILE, "utf-8"));
  } catch {
    return { users: [], cart: [] };
  }
}

function writeDB(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

function getNextId(arr) {
  return arr.length ? Math.max(...arr.map((i) => i.id || 0)) + 1 : 1;
}

// =====================
// STATIC FILES
// =====================
app.get(["/", "/index.html"], (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.use("/src", express.static(path.join(__dirname, "src")));
app.use("/icons", express.static(path.join(__dirname, "public", "icons")));
app.use(express.static(path.join(__dirname, "public"), { index: false }));

// =====================
// AUTH
// =====================
app.post("/signup", (req, res) => {
  const { name, email, password } = req.body;
  const db = readDB();

  const cleanEmail = safeEmail(email);

  if (!cleanEmail) {
    return res.status(400).json({ message: "Invalid email" });
  }

  if (db.users.find((u) => u.email === cleanEmail)) {
    return res.status(400).json({ message: "Email already exists!" });
  }

  const newUser = {
    id: getNextId(db.users),
    name,
    email: cleanEmail,
    password,
  };

  db.users.push(newUser);
  writeDB(db);

  const { password: pw, ...safeUser } = newUser;
  res.json(safeUser);
});

app.post("/login", (req, res) => {
  const { email, password } = req.body;
  const db = readDB();

  const cleanEmail = safeEmail(email);
  const user = safeFindUser(db, cleanEmail);

  if (!user) return res.status(401).json({ message: "Invalid credentials!" });
  if (user.password !== password)
    return res.status(401).json({ message: "Incorrect Password" });

  const { password: pw, ...safeUser } = user;
  res.json(safeUser);
});

// =====================
// CART
// =====================
app.post("/add-to-cart", (req, res) => {
  const { user_id, product_name, price, quantity, image } = req.body;
  const db = readDB();

  const userId = parseInt(user_id);

  const existing = db.cart.find(
    (i) => i.user_id === userId && i.product_name === product_name
  );

  if (existing) {
    existing.quantity = Math.min((existing.quantity || 0) + (quantity || 1), 9);
  } else {
    db.cart.push({
      id: getNextId(db.cart),
      user_id: userId,
      product_name,
      price,
      quantity,
      image,
    });
  }

  writeDB(db);
  res.json({ message: "Added to cart" });
});

app.get("/cart/:id", (req, res) => {
  const db = readDB();
  res.json(db.cart.filter((i) => i.user_id == req.params.id));
});

// =====================
// FORGOT PASSWORD (SAFE VERSION)
// =====================
app.post("/forgot-password", async (req, res) => {
  const db = readDB();

  const email = safeEmail(req.body?.email);
  if (!email) {
    return res.status(400).json({ message: "Invalid email" });
  }

  const user = safeFindUser(db, email);

  // security response (always same message)
  if (!user) {
    return res.json({ message: "If account exists, code sent." });
  }

  const code = Math.floor(100000 + Math.random() * 900000).toString();

  resetCodes[email] = {
    code,
    expires: Date.now() + 10 * 60 * 1000,
  };

  try {
    await resend.emails.send({
      from: "Scentify <onboarding@resend.dev>",
      to: email,
      subject: "Password Reset Code",
      html: `<h1>${code}</h1><p>Expires in 10 minutes</p>`,
    });

    res.json({ message: "Reset code sent!" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Email failed." });
  }
});

// =====================
// RESET PASSWORD
// =====================
app.post("/reset-password", (req, res) => {
  const email = safeEmail(req.body?.email);
  const { code, newPassword } = req.body;

  const reset = resetCodes[email];

  if (!reset || reset.code !== code || Date.now() > reset.expires) {
    return res.status(400).json({ message: "Invalid/expired code" });
  }

  const db = readDB();
  const user = safeFindUser(db, email);

  if (!user) {
    return res.status(404).json({ message: "User not found" });
  }

  user.password = newPassword;
  writeDB(db);

  delete resetCodes[email];

  res.json({ message: "Password updated!" });
});

// =====================
// START SERVER
// =====================
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("🚀 Server running on port " + PORT);
});