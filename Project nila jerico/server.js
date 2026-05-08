require("dotenv").config();

const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const { Resend } = require("resend");
const bcrypt = require("bcrypt");
const path = require("path");

// =====================
// INIT
// =====================
const app = express();

const User = require("./models/User");
const Cart = require("./models/Cart");

// =====================
// ENV CHECK
// =====================
if (!process.env.MONGO_URI) {
  console.error("❌ MONGO_URI missing");
  process.exit(1);
}

if (!process.env.RESEND_API_KEY) {
  console.error("❌ RESEND_API_KEY missing");
  process.exit(1);
}

// =====================
// MIDDLEWARE
// =====================
app.use(cors({ origin: "*" }));
app.use(express.json());

// =====================
// MONGODB CONNECTION
// =====================
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB connected"))
  .catch((err) => {
    console.error("❌ MongoDB error:", err.message);
    process.exit(1);
  });

// =====================
// EMAIL (RESEND)
// =====================
const resend = new Resend(process.env.RESEND_API_KEY);

// =====================
// RESET CODES (MEMORY)
// ⚠️ note: mawawala pag restart (ok for dev)
// =====================
const resetCodes = {};

// =====================
// HELPERS
// =====================
const safeEmail = (email) =>
  typeof email === "string" ? email.toLowerCase().trim() : "";

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
// SIGNUP
// =====================
app.post("/signup", async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "Missing fields" });
    }

    const cleanEmail = safeEmail(email);

    const existing = await User.findOne({ email: cleanEmail });

    if (existing) {
      return res.status(400).json({ message: "Email already exists!" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await User.create({
      name,
      email: cleanEmail,
      password: hashedPassword,
    });

    const { password: _, ...safeUser } = user.toObject();

    res.json(safeUser);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// =====================
// LOGIN
// =====================
app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const cleanEmail = safeEmail(email);

    const user = await User.findOne({ email: cleanEmail });

    if (!user) {
      return res.status(401).json({ message: "Invalid credentials!" });
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(401).json({ message: "Incorrect password" });
    }

    const { password: _, ...safeUser } = user.toObject();

    res.json(safeUser);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// =====================
// ADD TO CART
// =====================
app.post("/add-to-cart", async (req, res) => {
  try {
    const { user_id, product_name, price, quantity, image } = req.body;

    if (!user_id || !product_name) {
      return res.status(400).json({ message: "Missing data" });
    }

    const qtyToAdd = Math.max(1, Number(quantity) || 1);

    const existing = await Cart.findOne({
      user_id,
      product_name,
    });

    if (existing) {
      existing.quantity = Math.min((existing.quantity || 0) + qtyToAdd, 9);
      await existing.save();
    } else {
      await Cart.create({
        user_id,
        product_name,
        price,
        quantity: qtyToAdd,
        image,
      });
    }

    res.json({ message: "Added to cart" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// =====================
// GET CART
// =====================
app.get("/cart/:id", async (req, res) => {
  try {
    const items = await Cart.find({ user_id: req.params.id });
    res.json(items);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// =====================
// FORGOT PASSWORD
// =====================
app.post("/forgot-password", async (req, res) => {
  try {
    const email = safeEmail(req.body?.email);

    if (!email) {
      return res.status(400).json({ message: "Invalid email" });
    }

    const user = await User.findOne({ email });

    if (!user) {
      return res.json({ message: "If account exists, code sent." });
    }

    const code = String(Math.floor(100000 + Math.random() * 900000));

    resetCodes[email] = {
      code,
      expires: Date.now() + 10 * 60 * 1000,
    };

    await resend.emails.send({
      from: "Scentify <onboarding@resend.dev>",
      to: email,
      subject: "Password Reset Code",
      html: `
        <div style="font-family:Arial;text-align:center;">
          <h2>Your Reset Code</h2>
          <h1 style="letter-spacing:5px;">${code}</h1>
          <p>Valid for 10 minutes</p>
        </div>
      `,
    });

    res.json({ message: "Reset code sent!" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// =====================
// RESET PASSWORD
// =====================
app.post("/reset-password", async (req, res) => {
  try {
    const email = safeEmail(req.body?.email);
    const { code, newPassword } = req.body;

    const reset = resetCodes[email];

    if (
      !reset ||
      reset.code !== String(code) ||
      Date.now() > reset.expires
    ) {
      return res.status(400).json({ message: "Invalid/expired code" });
    }

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();

    delete resetCodes[email];

    res.json({ message: "Password updated!" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// =====================
// START SERVER
// =====================
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("🚀 Server running on port " + PORT);
});