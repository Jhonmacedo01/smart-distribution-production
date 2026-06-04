const express = require('express');
const History = require('../models/History');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');

const router = express.Router();

router.get('/', authMiddleware, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 50;
        const skip = (page - 1) * limit;

        const history = await History.find()
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        const total = await History.countDocuments();

        res.json({
            history,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        res.status(500).json({ error: 'Erro ao buscar histórico.' });
    }
});

router.get('/om/:om', authMiddleware, async (req, res) => {
    try {
        const history = await History.find({ om: req.params.om }).sort({ createdAt: -1 });
        res.json(history);
    } catch (error) {
        res.status(500).json({ error: 'Erro ao buscar histórico.' });
    }
});

router.get('/period', authMiddleware, async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        
        const query = {};
        if (startDate) query.createdAt = { $gte: new Date(startDate) };
        if (endDate) query.createdAt = { ...query.createdAt, $lte: new Date(endDate) };

        const history = await History.find(query).sort({ createdAt: -1 });
        res.json(history);
    } catch (error) {
        res.status(500).json({ error: 'Erro ao buscar histórico.' });
    }
});

router.get('/item/:itemId', authMiddleware, async (req, res) => {
    try {
        const history = await History.find({ itemId: req.params.itemId }).sort({ createdAt: -1 });
        res.json(history);
    } catch (error) {
        res.status(500).json({ error: 'Erro ao buscar histórico.' });
    }
});

router.delete('/clear', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        await History.deleteMany({});
        res.json({ message: 'Histórico limpo com sucesso.' });
    } catch (error) {
        res.status(500).json({ error: 'Erro ao limpar histórico.' });
    }
});

router.get('/export/all', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const history = await History.find().sort({ createdAt: -1 });
        
        let report = `RELATÓRIO COMPLETO DE MOVIMENTAÇÕES\n`;
        report += `GERADO EM: ${new Date().toLocaleString('pt-BR')}\n`;
        report += `${'='.repeat(80)}\n\n`;
        
        history.forEach((record, i) => {
            report += `[${i + 1}] ${new Date(record.createdAt).toLocaleString('pt-BR')}\n`;
            report += `    TIPO: ${record.type === 'retirada' ? 'RETIRADA' : 'ADIÇÃO'}\n`;
            report += `    OM: ${record.om}\n`;
            report += `    EMPRESA: ${record.company}\n`;
            report += `    EQUIPAMENTO: ${record.itemName}\n`;
            report += `    QUANTIDADE: ${record.quantity}\n`;
            report += `    REALIZADO POR: ${record.performedBy} (${record.performedByRegistration})\n`;
            
            if (record.type === 'retirada') {
                report += `    COLABORADOR: ${record.collaboratorName} (${record.collaboratorRegistration})\n`;
                report += `    ATIVIDADE: ${record.activity}\n`;
            } else {
                report += `    RESPONSÁVEL: ${record.responsible}\n`;
                if (record.observation) report += `    OBSERVAÇÃO: ${record.observation}\n`;
            }
            report += `${'-'.repeat(80)}\n`;
        });
        
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename=relatorio_estoque_${Date.now()}.txt`);
        res.send(report);
    } catch (error) {
        res.status(500).json({ error: 'Erro ao exportar relatório.' });
    }
});

module.exports = router;