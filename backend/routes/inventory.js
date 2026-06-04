const express = require('express');
const Inventory = require('../models/Inventory');
const History = require('../models/History');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');

const router = express.Router();

router.get('/', authMiddleware, async (req, res) => {
    try {
        const inventory = await Inventory.find().sort({ name: 1 });
        res.json(inventory);
    } catch (error) {
        res.status(500).json({ error: 'Erro ao buscar inventário.' });
    }
});

router.get('/:id', authMiddleware, async (req, res) => {
    try {
        const item = await Inventory.findById(req.params.id);
        if (!item) {
            return res.status(404).json({ error: 'Equipamento não encontrado.' });
        }
        res.json(item);
    } catch (error) {
        res.status(500).json({ error: 'Erro ao buscar equipamento.' });
    }
});

router.post('/', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { name, category, quantity, minStock, location, notes } = req.body;

        const existingItem = await Inventory.findOne({ name });
        if (existingItem) {
            return res.status(400).json({ error: 'Equipamento já existe no inventário.' });
        }

        const item = new Inventory({
            name,
            category,
            quantity: quantity || 0,
            minStock: minStock || 5,
            location: location || '',
            notes: notes || ''
        });

        await item.save();
        res.status(201).json(item);
    } catch (error) {
        res.status(500).json({ error: 'Erro ao criar equipamento.' });
    }
});

router.put('/:id', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const { name, category, quantity, minStock, location, notes } = req.body;

        const item = await Inventory.findById(id);
        if (!item) {
            return res.status(404).json({ error: 'Equipamento não encontrado.' });
        }

        if (name) item.name = name;
        if (category) item.category = category;
        if (quantity !== undefined) item.quantity = quantity;
        if (minStock) item.minStock = minStock;
        if (location !== undefined) item.location = location;
        if (notes !== undefined) item.notes = notes;

        await item.save();
        res.json(item);
    } catch (error) {
        res.status(500).json({ error: 'Erro ao atualizar equipamento.' });
    }
});

router.post('/:id/withdraw', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const { 
            quantity, 
            company, 
            om, 
            collaboratorName, 
            collaboratorRegistration, 
            activity 
        } = req.body;

        if (!quantity || quantity <= 0) {
            return res.status(400).json({ error: 'Quantidade inválida.' });
        }
        if (!om || om.trim() === '') {
            return res.status(400).json({ error: 'OM é obrigatória.' });
        }
        if (!company || company.trim() === '') {
            return res.status(400).json({ error: 'Empresa é obrigatória.' });
        }
        if (!collaboratorName || collaboratorName.trim() === '') {
            return res.status(400).json({ error: 'Nome do colaborador é obrigatório.' });
        }
        if (!collaboratorRegistration || collaboratorRegistration.trim() === '') {
            return res.status(400).json({ error: 'Matrícula é obrigatória.' });
        }
        if (!activity || activity.trim() === '') {
            return res.status(400).json({ error: 'Atividade é obrigatória.' });
        }

        const item = await Inventory.findById(id);
        if (!item) {
            return res.status(404).json({ error: 'Equipamento não encontrado.' });
        }

        if (quantity > item.quantity) {
            return res.status(400).json({ error: `Quantidade insuficiente. Disponível: ${item.quantity}` });
        }

        const previousQty = item.quantity;
        item.quantity -= quantity;
        await item.save();

        const history = new History({
            type: 'retirada',
            om: om.trim(),
            company: company.trim(),
            itemName: item.name,
            itemId: item._id,
            quantity: quantity,
            previousQty: previousQty,
            newQty: item.quantity,
            collaboratorName: collaboratorName.trim(),
            collaboratorRegistration: collaboratorRegistration.trim(),
            activity: activity.trim(),
            performedBy: req.user.name,
            performedByRegistration: req.user.registration
        });

        await history.save();

        res.json({
            message: 'Retirada realizada com sucesso.',
            item,
            history
        });
    } catch (error) {
        res.status(500).json({ error: 'Erro ao realizar retirada.' });
    }
});

router.post('/:id/add', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const { 
            quantity, 
            company, 
            responsible, 
            observation,
            om
        } = req.body;

        if (!quantity || quantity <= 0) {
            return res.status(400).json({ error: 'Quantidade inválida.' });
        }
        if (!company || company.trim() === '') {
            return res.status(400).json({ error: 'Empresa é obrigatória.' });
        }
        if (!responsible || responsible.trim() === '') {
            return res.status(400).json({ error: 'Funcionário responsável é obrigatório.' });
        }
        if (!om || om.trim() === '') {
            return res.status(400).json({ error: 'OM ou Nota Fiscal é obrigatória.' });
        }

        const item = await Inventory.findById(id);
        if (!item) {
            return res.status(404).json({ error: 'Equipamento não encontrado.' });
        }

        const previousQty = item.quantity;
        item.quantity += quantity;
        await item.save();

        const history = new History({
            type: 'adicao',
            om: om.trim(),
            company: company.trim(),
            itemName: item.name,
            itemId: item._id,
            quantity: quantity,
            previousQty: previousQty,
            newQty: item.quantity,
            responsible: responsible.trim(),
            observation: observation || '',
            performedBy: req.user.name,
            performedByRegistration: req.user.registration
        });

        await history.save();

        res.json({
            message: 'Adição realizada com sucesso.',
            item,
            history
        });
    } catch (error) {
        res.status(500).json({ error: 'Erro ao adicionar material.' });
    }
});

router.delete('/:id', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const item = await Inventory.findByIdAndDelete(req.params.id);
        if (!item) {
            return res.status(404).json({ error: 'Equipamento não encontrado.' });
        }
        res.json({ message: 'Equipamento removido com sucesso.' });
    } catch (error) {
        res.status(500).json({ error: 'Erro ao deletar equipamento.' });
    }
});

module.exports = router;