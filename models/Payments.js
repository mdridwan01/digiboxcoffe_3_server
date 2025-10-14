const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
     product_id: { type: String, required: true },
    paymentID: { type: String, required: false },
    order_quantity: { type: Number, required: false },
    transactionID: { type: String, required: false },
    date: { type: String, required: false },
    amount: { type: Number, required: false },
    currency: { type: String, default: 'BDT' },
    status: {
        type: String,
    },
}, {timestamps: true});
module.exports = mongoose.model('Payments', paymentSchema);