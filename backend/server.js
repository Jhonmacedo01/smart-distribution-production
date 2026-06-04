require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');

const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const inventoryRoutes = require('./routes/inventory');
const historyRoutes = require('./routes/history');
const User = require('./models/User');
const Inventory = require('./models/Inventory');

const app = express();

// ==================== VALIDAÇÃO DAS VARIÁVEIS DE AMBIENTE ====================
const requiredEnvVars = ['MONGODB_URI', 'JWT_SECRET'];
const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);

if (missingEnvVars.length > 0) {
    console.error('❌ Erro: Variáveis de ambiente obrigatórias não definidas:');
    missingEnvVars.forEach(envVar => console.error(`   - ${envVar}`));
    console.error('\n⚠️  Certifique-se de configurar o arquivo .env corretamente');
    process.exit(1);
}

console.log('✅ Variáveis de ambiente validadas');

// ==================== MIDDLEWARES ====================
// Configuração CORS CORRIGIDA - permite todas as origens em produção
app.use(cors({
    origin: function(origin, callback) {
        // Permitir requisições sem origin (Postman, apps nativas)
        if (!origin) return callback(null, true);
        
        // EM PRODUÇÃO - permitir todas as origens (resolvendo o problema do CORS)
        if (process.env.NODE_ENV === 'production') {
            return callback(null, true);
        }
        
        // Em desenvolvimento, permitir localhost
        const isLocalhost = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
        if (isLocalhost) {
            return callback(null, true);
        }
        
        // Qualquer outra origem em desenvolvimento é bloqueada
        console.warn(`⚠️ Origem bloqueada pelo CORS: ${origin}`);
        callback(new Error('Bloqueado pelo CORS'), false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'X-Requested-With']
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Servir arquivos estáticos da pasta frontend
const frontendPath = path.join(__dirname, '../frontend');
console.log(`📁 Servindo arquivos estáticos de: ${frontendPath}`);

// Verificar se a pasta frontend existe
if (!fs.existsSync(frontendPath)) {
    console.error(`❌ Pasta frontend não encontrada em: ${frontendPath}`);
    console.error('   Certifique-se de que os arquivos index.html, app.js e styles.css estão na pasta "frontend"');
    if (process.env.NODE_ENV !== 'production') {
        process.exit(1);
    }
}

// Servir arquivos estáticos com headers corretos
app.use(express.static(frontendPath, {
    setHeaders: (res, filePath) => {
        if (filePath.endsWith('.js') || filePath.endsWith('.css')) {
            res.setHeader('Cache-Control', 'public, max-age=31536000');
        }
        
        if (filePath.endsWith('.js')) {
            res.setHeader('Content-Type', 'application/javascript');
        }
        if (filePath.endsWith('.css')) {
            res.setHeader('Content-Type', 'text/css');
        }
        
        // CSP mais permissiva para produção
        res.setHeader('Content-Security-Policy', "default-src * 'unsafe-inline' 'unsafe-eval' data: blob:; script-src * 'unsafe-inline' 'unsafe-eval' data: blob:; style-src * 'unsafe-inline'; font-src * data:; img-src * data: blob:; connect-src * ws: wss:;");
    }
}));

// Rate limiting
const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: { error: 'Muitas requisições, tente novamente mais tarde.' },
    standardHeaders: true,
    legacyHeaders: false,
});

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { error: 'Muitas tentativas de login, tente novamente em 15 minutos.' },
    skipSuccessfulRequests: true,
});

app.use('/api/', generalLimiter);
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);

// ==================== ROTAS ====================
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/history', historyRoutes);

// Rota de health check
app.get('/health', (req, res) => {
    res.status(200).json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
        environment: process.env.NODE_ENV || 'development'
    });
});

// Rota para servir o frontend (catch-all)
app.get('*', (req, res) => {
    const indexPath = path.join(frontendPath, 'index.html');
    if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
    } else {
        res.status(404).send('Arquivo index.html não encontrado. Verifique a estrutura de pastas.');
    }
});

// ==================== FUNÇÃO PARA INICIALIZAR DADOS PADRÃO ====================
async function initializeDefaultData() {
    try {
        const adminExists = await User.findOne({ role: 'admin' });
        if (!adminExists) {
            const admin = new User({
                username: process.env.ADMIN_USERNAME || 'admin',
                password: process.env.ADMIN_PASSWORD || 'Admin@123456',
                name: 'Administrador do Sistema',
                registration: 'ADMIN001',
                role: 'admin',
                company: 'KANBAN AUTOMAÇÃO'
            });
            await admin.save();
            console.log('✅ Usuário admin criado');
        } else {
            console.log('ℹ️  Usuário admin já existe');
        }

        const inventoryCount = await Inventory.countDocuments();
        if (inventoryCount === 0) {
            const defaultInventory = [
                { name: 'Cisco IE 1000', category: 'switch', quantity: 52, minStock: 5, location: 'Depósito Central - Rack A1', notes: 'Switches industriais Ethernet' },
                { name: 'Cisco IE 3200', category: 'switch', quantity: 22, minStock: 5, location: 'Sala de Redes - Rack B2', notes: '' },
                { name: 'Cisco IE 4000', category: 'switch', quantity: 19, minStock: 5, location: 'Data Center - Rack C3', notes: '' },
                { name: 'Cisco IE 3300', category: 'switch', quantity: 1, minStock: 2, location: 'Campo - Subestação', notes: 'CRÍTICO - Reposição urgente' },
                { name: 'Hirschmann RSP20', category: 'switch', quantity: 6, minStock: 2, location: 'Painel Automação', notes: '' },
                { name: 'Hirschmann RS20', category: 'switch', quantity: 2, minStock: 2, location: 'Depósito', notes: '' },
                { name: 'Hirschmann RS30', category: 'switch', quantity: 4, minStock: 2, location: 'Sala de Controle', notes: '' },
                { name: 'Hirschmann RS40', category: 'switch', quantity: 4, minStock: 2, location: 'Subestação', notes: '' },
                { name: 'Ruggedcom RS900GNC', category: 'switch', quantity: 1, minStock: 1, location: 'Campo - Área Externa', notes: 'ESTOQUE CRÍTICO' },
                { name: 'Phoenix Contact FL SWITCH 4808E-16FX', category: 'switch', quantity: 1, minStock: 1, location: 'Depósito', notes: 'Comunicação óptica' },
                { name: 'Módulos GNSS Septentrio', category: 'gnss', quantity: 7, minStock: 3, location: 'Sala de Rádios', notes: 'Alta precisão' },
                { name: 'Antenas GNSS Septentrio', category: 'gnss', quantity: 3, minStock: 2, location: 'Telhado', notes: '' },
                { name: 'Módulos GPS Rajant', category: 'gnss', quantity: 12, minStock: 5, location: 'Estoque', notes: 'Sincronismo' },
                { name: 'Câmeras Pelco', category: 'cftv', quantity: 2, minStock: 2, location: 'Depósito', notes: 'Monitoramento' },
                { name: 'Fonte Rajant 24VDC', category: 'fonte', quantity: 23, minStock: 10, location: 'Estoque Geral', notes: '' },
                { name: 'Fonte Rajant 48VDC', category: 'fonte', quantity: 17, minStock: 5, location: 'Estoque', notes: '' },
                { name: 'Fonte Cisco IE65W', category: 'fonte', quantity: 15, minStock: 5, location: 'Depósito', notes: '' },
                { name: 'Fonte Cisco IE240W', category: 'fonte', quantity: 14, minStock: 4, location: 'Data Center', notes: '' },
                { name: 'Fonte MURR Eco Rail', category: 'fonte', quantity: 1, minStock: 1, location: 'Depósito', notes: '' },
                { name: 'Fonte MCE', category: 'fonte', quantity: 2, minStock: 1, location: 'Estoque', notes: '' },
                { name: 'Siemens Power Supply 6EP1336-3BA00', category: 'fonte', quantity: 1, minStock: 1, location: 'Painel Siemens', notes: '' },
                { name: 'OZD Hirschmann G12-1300 PRO', category: 'fibra', quantity: 4, minStock: 2, location: 'Racks', notes: 'Conversor óptico' },
                { name: 'OZD Hirschmann G11', category: 'fibra', quantity: 1, minStock: 1, location: 'Campo', notes: 'CRÍTICO' },
                { name: 'Mini DIO 12 fibras', category: 'fibra', quantity: 23, minStock: 10, location: 'Depósito', notes: 'Distribuidor óptico' },
                { name: 'Módulos Rádio Rajant', category: 'radio', quantity: 4, minStock: 2, location: 'Sala de Rádios', notes: 'Mesh industrial' },
                { name: 'ABB DI810', category: 'plc', quantity: 9, minStock: 3, location: 'Painel ABB', notes: 'Digital Input' },
                { name: 'ABB DI820', category: 'plc', quantity: 24, minStock: 8, location: 'Estoque', notes: 'Digital Input' },
                { name: 'ABB DO810', category: 'plc', quantity: 13, minStock: 5, location: 'Painel ABB', notes: 'Digital Output' },
                { name: 'ABB DO820', category: 'plc', quantity: 16, minStock: 5, location: 'Estoque', notes: 'Digital Output' },
                { name: 'ABB DI524', category: 'plc', quantity: 2, minStock: 1, location: 'Depósito', notes: '' },
                { name: 'ABB CI854', category: 'plc', quantity: 5, minStock: 2, location: 'Estoque', notes: 'Comunicação' },
                { name: 'ABB CI868', category: 'plc', quantity: 2, minStock: 1, location: 'Sala de Controle', notes: '' },
                { name: 'ABB CI801', category: 'plc', quantity: 8, minStock: 3, location: 'Estoque', notes: '' },
                { name: 'ABB PM866', category: 'plc', quantity: 2, minStock: 1, location: 'Sala de Controle', notes: 'Controlador' },
                { name: 'ABB PM861A', category: 'plc', quantity: 2, minStock: 1, location: 'Estoque', notes: '' },
                { name: 'ABB SB822', category: 'plc', quantity: 4, minStock: 2, location: 'Estoque', notes: 'Bateria backup' },
                { name: 'ABB PP865A', category: 'plc', quantity: 1, minStock: 1, location: 'Painel ABB', notes: 'IHM' },
                { name: 'ABB PP887H', category: 'plc', quantity: 1, minStock: 1, location: 'Sala de Controle', notes: 'IHM' },
                { name: 'ABB PP886', category: 'plc', quantity: 2, minStock: 1, location: 'Estoque', notes: 'IHM' },
                { name: 'ABB PP865S', category: 'plc', quantity: 1, minStock: 1, location: 'Depósito', notes: 'IHM' },
                { name: 'ABB CP604', category: 'plc', quantity: 1, minStock: 1, location: 'Estoque', notes: 'IHM' },
                { name: 'ABB TU811', category: 'plc', quantity: 14, minStock: 5, location: 'Estoque', notes: 'Base montagem' },
                { name: 'ABB TU810', category: 'plc', quantity: 16, minStock: 5, location: 'Estoque', notes: 'Base montagem' },
                { name: 'ABB TP867', category: 'plc', quantity: 2, minStock: 1, location: 'Depósito', notes: '' },
                { name: 'ABB TP854', category: 'plc', quantity: 9, minStock: 3, location: 'Estoque', notes: '' },
                { name: 'ABB TP830', category: 'plc', quantity: 2, minStock: 1, location: 'Depósito', notes: '' },
                { name: 'Siemens KTP-600', category: 'plc', quantity: 2, minStock: 1, location: 'Painel Siemens', notes: 'IHM' },
                { name: 'Siemens S7-1200 CPU 1214C', category: 'plc', quantity: 2, minStock: 1, location: 'Estoque', notes: 'PLC' },
                { name: 'Siemens S7-1200 SM1231', category: 'plc', quantity: 2, minStock: 1, location: 'Estoque', notes: 'Módulo analógico' },
                { name: 'Siemens S7-1200 SM1221', category: 'plc', quantity: 1, minStock: 1, location: 'Depósito', notes: 'Módulo digital' },
                { name: 'Siemens RX5000PN', category: 'switch', quantity: 1, minStock: 1, location: 'Depósito', notes: '' },
                { name: 'Siemens RX1500PN', category: 'switch', quantity: 2, minStock: 1, location: 'Estoque', notes: '' },
                { name: 'Schneider BMXDDO1602', category: 'plc', quantity: 1, minStock: 1, location: 'Depósito', notes: '' },
                { name: 'Schneider XBTN410', category: 'plc', quantity: 6, minStock: 2, location: 'Estoque', notes: 'IHM' },
                { name: 'Schneider TSXAEY800', category: 'plc', quantity: 4, minStock: 2, location: 'Estoque', notes: 'Módulo analógico' },
                { name: 'Schneider BMXCP2010', category: 'plc', quantity: 3, minStock: 1, location: 'Depósito', notes: 'Controlador' },
                { name: 'MURR 56641', category: 'outros', quantity: 12, minStock: 5, location: 'Estoque', notes: 'Componentes' },
                { name: 'MURR 56741', category: 'outros', quantity: 2, minStock: 1, location: 'Depósito', notes: '' },
                { name: 'MURR 56521', category: 'outros', quantity: 12, minStock: 5, location: 'Estoque', notes: '' },
                { name: 'MURR 56601', category: 'outros', quantity: 3, minStock: 1, location: 'Depósito', notes: '' }
            ];

            await Inventory.insertMany(defaultInventory);
            console.log('✅ Inventário padrão criado (62 equipamentos)');
        } else {
            console.log(`ℹ️  Inventário já possui ${inventoryCount} itens`);
        }
    } catch (error) {
        console.error('❌ Erro ao inicializar dados padrão:', error.message);
        throw error;
    }
}

// ==================== TRATAMENTO DE ERROS ====================
process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection:', reason);
});

process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught Exception:', error);
});

app.use((err, req, res, next) => {
    console.error('❌ Erro:', err.stack);
    res.status(500).json({ error: 'Erro interno do servidor' });
});

// ==================== INICIALIZAÇÃO ====================
async function startServer() {
    try {
        const mongooseOptions = {
            serverSelectionTimeoutMS: 10000,
            socketTimeoutMS: 45000,
        };
        
        await mongoose.connect(process.env.MONGODB_URI, mongooseOptions);
        console.log('✅ Conectado ao MongoDB Atlas');

        await initializeDefaultData();

        const PORT = process.env.PORT || 3000;
        const server = app.listen(PORT, () => {
            console.log('\n=================================');
            console.log('🚀 Servidor iniciado com sucesso!');
            console.log('=================================');
            console.log(`📡 Porta: ${PORT}`);
            console.log(`📁 Frontend: ${frontendPath}`);
            console.log(`🔗 Local: http://localhost:${PORT}`);
            console.log(`🌐 Health: http://localhost:${PORT}/health`);
            console.log(`🌍 Ambiente: ${process.env.NODE_ENV || 'development'}`);
            console.log('\n🔐 Credenciais de acesso:');
            console.log(`   👤 Usuário: ${process.env.ADMIN_USERNAME || 'admin'}`);
            console.log(`   🔑 Senha: ${process.env.ADMIN_PASSWORD || 'Admin@123456'}`);
            console.log('=================================\n');
        });

        const gracefulShutdown = async (signal) => {
            console.log(`\n⚠️  Recebido sinal ${signal}. Desligando...`);
            server.close(async () => {
                await mongoose.connection.close();
                console.log('✅ Servidor encerrado');
                process.exit(0);
            });
            setTimeout(() => process.exit(1), 10000);
        };
        
        process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
        process.on('SIGINT', () => gracefulShutdown('SIGINT'));
        
    } catch (error) {
        console.error('❌ Erro ao iniciar servidor:', error.message);
        process.exit(1);
    }
}

startServer();