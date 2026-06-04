const mongoose = require('mongoose');

const HistorySchema = new mongoose.Schema({
    type: {
        type: String,
        enum: ['retirada', 'adicao'],
        required: true
    },
    om: {
        type: String,
        required: true
    },
    company: {
        type: String,
        required: true
    },
    itemName: {
        type: String,
        required: true
    },
    itemId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Inventory',
        required: true
    },
    quantity: {
        type: Number,
        required: true,
        min: 1
    },
    previousQty: {
        type: Number,
        required: true
    },
    newQty: {
        type: Number,
        required: true
    },
    collaboratorName: {
        type: String,
        default: ''
    },
    collaboratorRegistration: {
        type: String,
        default: ''
    },
    activity: {
        type: String,
        default: ''
    },
    responsible: {
        type: String,
        default: ''
    },
    observation: {
        type: String,
        default: ''
    },
    notaFiscal: {
        type: String,
        default: ''
    },
    performedBy: {
        type: String,
        required: true
    },
    performedByRegistration: {
        type: String,
        required: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

HistorySchema.index({ createdAt: -1 });
HistorySchema.index({ om: 1 });
HistorySchema.index({ itemId: 1 });

module.exports = mongoose.model('History', HistorySchema);