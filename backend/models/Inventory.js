const mongoose = require('mongoose');

const InventorySchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true,
        unique: true
    },
    category: {
        type: String,
        enum: ['switch', 'gnss', 'radio', 'plc', 'fonte', 'cftv', 'fibra', 'outros'],
        required: true
    },
    quantity: {
        type: Number,
        required: true,
        min: 0,
        default: 0
    },
    minStock: {
        type: Number,
        required: true,
        min: 1,
        default: 5
    },
    location: {
        type: String,
        trim: true,
        default: ''
    },
    notes: {
        type: String,
        default: ''
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

InventorySchema.pre('save', function(next) {
    this.updatedAt = Date.now();
    next();
});

module.exports = mongoose.model('Inventory', InventorySchema);