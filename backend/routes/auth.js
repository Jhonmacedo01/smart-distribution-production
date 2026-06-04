const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ error: 'Usuário e senha são obrigatórios.' });
        }

        const user = await User.findOne({ username, active: true });
        
        if (!user) {
            return res.status(401).json({ error: 'Credenciais inválidas.' });
        }

        const isValid = await user.comparePassword(password);
        
        if (!isValid) {
            return res.status(401).json({ error: 'Credenciais inválidas.' });
        }

        user.lastLogin = new Date();
        await user.save();

        const token = jwt.sign(
            { id: user._id, username: user.username, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRE || '7d' }
        );

        res.json({
            token,
            user: {
                id: user._id,
                username: user.username,
                name: user.name,
                registration: user.registration,
                role: user.role,
                company: user.company
            }
        });
    } catch (error) {
        res.status(500).json({ error: 'Erro ao fazer login.' });
    }
});

router.get('/verify', authMiddleware, async (req, res) => {
    res.json({
        user: {
            id: req.user._id,
            username: req.user.username,
            name: req.user.name,
            registration: req.user.registration,
            role: req.user.role,
            company: req.user.company
        }
    });
});

router.post('/logout', authMiddleware, (req, res) => {
    res.json({ message: 'Logout realizado com sucesso.' });
});

module.exports = router;