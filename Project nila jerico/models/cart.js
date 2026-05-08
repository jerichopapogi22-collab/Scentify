const mongoose = require("mongoose");

const cartSchema = new mongoose.Schema({
  user_id: Number,

  product_name: String,

  price: Number,

  quantity: Number,

  image: String,
});

module.exports = mongoose.model("Cart", cartSchema);