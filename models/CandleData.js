const mongoose = require('mongoose');

const candleDataSchema = new mongoose.Schema({
  time: String,
  open: Number,
  high: Number,
  low: Number,
  close: Number,
  volume: Number,
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('CandleData', candleDataSchema);
