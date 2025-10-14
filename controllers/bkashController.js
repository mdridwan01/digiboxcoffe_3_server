const axios = require('axios');
const globals = require('node-global-storage');
const { v4: uuidv4 } = require('uuid');
const tokenStore = require('../middleware/utils/tokenStore');
const Payment = require('../models/Payments');
const dotenv = require('dotenv');
dotenv.config();

const APPLICATION_URL = process.env.APPLICATION_URL;
const SERVER_URL = process.env.SERVER_URL;

class bkashController {
  /** 🔹 Create Payment Session */
  async createPayment(req, res) {
    try {
      const { amount, product_Id, order_quantity } = req.body;

      // Save tokens temporarily
      tokenStore.setToken('Product_Id', product_Id);
      tokenStore.setToken('Order_Quantity', order_quantity);
      console.log('🛒 Order Quantity:', order_quantity);

      const { data } = await axios.post(
        'https://tokenized.pay.bka.sh/v1.2.0-beta/tokenized/checkout/create',
        {
          mode: '0011',
          payerReference: 'Digibox',
          callbackURL: `${SERVER_URL}/api/bkash/payment/callback`,
          amount,
          currency: 'BDT',
          intent: 'sale',
          merchantInvoiceNumber: 'Inv' + uuidv4().substring(0, 5),
        },
        {
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            Authorization: tokenStore.getToken('id_token'),
            'X-APP-Key': process.env.bkash_api_key,
          },
        }
      );

      return res.status(200).json({ bkashURL: data.bkashURL });
    } catch (error) {
      console.error('❌ Error creating payment:', error.message);
      return res.status(500).json({ error: error.message });
    }
  }

  /** 🔹 Handle Callback (After Payment) */
  async call_back(req, res) {
    const { paymentID, status } = req.query;
    console.log('🔁 Payment status:', status);

    // ❌ Cancel / Failure
    if (status === 'cancel' || status === 'failure') {
      return res.redirect(`${APPLICATION_URL}/error?message=${status}`);
    }

    // ✅ Success Flow
    if (status === 'success') {
      try {
        // Step 1️⃣ Execute Payment with bKash API
        const { data } = await axios.post(
          process.env.bkash_execute_payment_url,
          { paymentID },
          {
            headers: {
              'Content-Type': 'application/json',
              Accept: 'application/json',
              Authorization: tokenStore.getToken('id_token'),
              'X-APP-Key': process.env.bkash_api_key,
            },
          }
        );

        // Step 2️⃣ Validate Payment Response
        if (!data || data.statusCode !== '0000') {
          const msg = data?.statusMessage || 'Invalid payment response';
          console.warn('⚠️ Payment execution error:', msg);
          return res.redirect(`${APPLICATION_URL}/error?messageOne=${encodeURIComponent(msg)}`);
        }

        // Step 3️⃣ Save Payment to DB
        const ProductID = tokenStore.getToken('Product_Id');
        const orderQuantity = tokenStore.getToken('Order_Quantity');

        try {
          await Payment.create({
            product_id: ProductID,
            paymentID,
            order_quantity: orderQuantity,
            transactionID: data.trxID,
            date: data.paymentExecuteTime,
            amount: data.amount,
            currency: data.currency,
            status: data.transactionStatus,
          });
          console.log('✅ Payment record saved successfully.');
        } catch (dbError) {
          console.error('❌ Database insert failed:', dbError.message);
          return res.redirect(`${APPLICATION_URL}/error?messageDB=${encodeURIComponent(dbError.message)}`);
        }

        // Step 4️⃣ Trigger Vending Machine
        try {
          const cleanServerURL = SERVER_URL.replace(/\/$/, '');
          const response = await axios.patch(
            `${cleanServerURL}/api/vending/68e4d654c420911efee3b836`,
            {
              box_1: 'on',
              uiToken: false,
              order_quantity: orderQuantity,
            },
            { headers: { 'Content-Type': 'application/json' } }
          );

          console.log('✅ Vending machine updated:', response.data);
          return res.redirect(`${APPLICATION_URL}/success`);
        } catch (patchError) {
          console.error('❌ Error updating vending machine:', patchError.message);
          return res.redirect(`${APPLICATION_URL}/error?messageThree=${encodeURIComponent(patchError.message)}`);
        }
      } catch (executeError) {
        console.error('❌ Error executing payment:', executeError.message);
        return res.redirect(`${APPLICATION_URL}/error?messageTwo=${encodeURIComponent(executeError.message)}`);
      }
    }

    // Default fallback
    return res.redirect(`${APPLICATION_URL}/error?message=unknown_status`);
  }
}

module.exports = new bkashController();
