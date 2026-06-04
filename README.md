# 🏭 KANBAN Estoque Industrial - Sistema de Controle

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-18.x-green.svg)](https://nodejs.org/)
[![MongoDB](https://img.shields.io/badge/MongoDB-Atlas-brightgreen.svg)](https://mongodb.com/atlas)
[![Express](https://img.shields.io/badge/Express-4.x-000000.svg)](https://expressjs.com/)

Sistema completo para gestão de estoque industrial com autenticação JWT, histórico de movimentações, geração de comprovantes e dashboards interativos.

---

## ✨ Funcionalidades

### 👥 Autenticação e Usuários
- Login seguro com JWT (JSON Web Token)
- Dois níveis de acesso: **Administrador** e **Operador**
- Gerenciamento de usuários (admin)
- Sessão persistente com localStorage

### 📦 Gestão de Estoque
- CRUD completo de equipamentos (admin)
- Categorias: Switch, GNSS/GPS, Rádio, PLC, Fonte, CFTV, Fibra, Outros
- Controle de estoque mínimo com alertas visuais
- Filtros por categoria e busca textual
- Visualização em Grid ou Lista

### 📊 Movimentações
- Retirada de materiais com comprovante
- Adição de materiais ao estoque
- Validação de quantidade disponível
- Geração automática de comprovantes em TXT
- Reimpressão de comprovantes

### 📈 Dashboard e Métricas
- Total de equipamentos e unidades
- Alertas de estoque baixo/crítico
- Taxa de rotatividade
- Total de movimentações
- Gráficos de categorias

### 📜 Histórico
- Registro completo de todas as movimentações
- Filtros por período, OM, equipamento
- Exportação para CSV e TXT
- Relatórios completos

### 🎨 Interface
- Design inspirado em Cisco Catalyst
- Tema claro/escuro (Dark/Light mode)
- Design responsivo (Desktop, Tablet, Mobile)
- Relógio ao vivo
- Notificações em tempo real

---

## 🚀 Demonstração Rápida

### Credenciais de Acesso (primeiro uso)

| Usuário | Senha | Perfil |
|---------|-------|--------|
| `admin` | `Admin@123456` | Administrador |

---

## 📋 Pré-requisitos

- **Node.js** 18.0 ou superior
- **npm** 9.0 ou superior
- **MongoDB Atlas** (gratuito) ou MongoDB local
- **Git** (opcional, para versionamento)

---

## 🔧 Instalação Local

### 1. Clone o repositório

```bash
git clone [https://github.com/seu-usuario/kanban-estoque.git](https://github.com/Jhonmacedo01/smart-distribution-production.git)
cd smart-distribution-productio






