const express = require('express');
const User = require('../models/User');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');

const router = express.Router();

router.get('/', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const users = await User.find().select('-password').sort({ createdAt: -1 });
        res.json(users);
    } catch (error) {
        res.status(500).json({ error: 'Erro ao listar usuários.' });
    }
});

router.post('/', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { username, password, name, registration, role, company } = req.body;

        const existingUser = await User.findOne({ $or: [{ username }, { registration }] });
        if (existingUser) {
            return res.status(400).json({ error: 'Usuário ou matrícula já existe.' });
        }

        const userCount = await User.countDocuments();
        if (userCount >= 41) {
            return res.status(400).json({ error: 'Limite máximo de 41 usuários atingido.' });
        }

        const user = new User({
            username,
            password,
            name,
            registration,
            role: role || 'user',
            company: company || 'KANBAN AUTOMAÇÃO'
        });

        await user.save();

        res.status(201).json({
            message: 'Usuário criado com sucesso.',
            user: {
                id: user._id,
                username: user.username,
                name: user.name,
                registration: user.registration,
                role: user.role
            }
        });
    } catch (error) {
        res.status(500).json({ error: 'Erro ao criar usuário.' });
    }
});

router.put('/:id', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const { name, registration, role, company, active } = req.body;

        const user = await User.findById(id);
        if (!user) {
            return res.status(404).json({ error: 'Usuário não encontrado.' });
        }

        if (name) user.name = name;
        if (registration) user.registration = registration;
        if (role) user.role = role;
        if (company) user.company = company;
        if (active !== undefined) user.active = active;

        await user.save();

        res.json({
            message: 'Usuário atualizado com sucesso.',
            user: {
                id: user._id,
                username: user.username,
                name: user.name,
                registration: user.registration,
                role: user.role,
                active: user.active
            }
        });
    } catch (error) {
        res.status(500).json({ error: 'Erro ao atualizar usuário.' });
    }
});

router.post('/:id/reset-password', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const { newPassword } = req.body;

        if (!newPassword || newPassword.length < 6) {
            return res.status(400).json({ error: 'Senha deve ter no mínimo 6 caracteres.' });
        }

        const user = await User.findById(id);
        if (!user) {
            return res.status(404).json({ error: 'Usuário não encontrado.' });
        }

        user.password = newPassword;
        await user.save();

        res.json({ message: 'Senha redefinida com sucesso.' });
    } catch (error) {
        res.status(500).json({ error: 'Erro ao redefinir senha.' });
    }
});

router.delete('/:id', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { id } = req.params;

        if (req.user._id.toString() === id) {
            return res.status(400).json({ error: 'Não é possível deletar seu próprio usuário.' });
        }

        const user = await User.findByIdAndDelete(id);
        if (!user) {
            return res.status(404).json({ error: 'Usuário não encontrado.' });
        }

        res.json({ message: 'Usuário removido com sucesso.' });
    } catch (error) {
        res.status(500).json({ error: 'Erro ao deletar usuário.' });
    }
});

module.exports = router;