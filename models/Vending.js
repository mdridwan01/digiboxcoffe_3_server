const mongoose = require('mongoose');

const vendingSchema = new mongoose.Schema({
   "box_1": { type: String, default: "off" },
  "uiToken": { type: String, default: true },
  "order_quantity": { type: Number, default: 0 },
}, { timestamps: true });

module.exports = mongoose.model('Vending', vendingSchema);

