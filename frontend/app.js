/* ==========================================================================
   SISTEMA DE ESTOQUE INDUSTRIAL - VERSÃO 4.0.1 PRODUCTION
   ========================================================================== */

// URL da API - Configuração automática
const API_URL = (() => {
    // Em produção, usar a URL do backend no Render
    if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
        // Para deploy unificado (backend servindo frontend)
        return '/api';
    }
    // Desenvolvimento local
    return 'http://localhost:3000/api';
})();

let currentUser = null;
let authToken = null;
let inventory = [];
let history = [];
let currentCategory = 'all';
let currentSearch = '';
let currentView = 'grid';
let companyConfig = { name: 'KANBAN AUTOMAÇÃO' };
let currentWithdrawItemId = null;
let currentAddItemId = null;
let refreshInterval = null;

// ============================================================================
// NOTIFICAÇÕES
// ============================================================================

function showNotification(message, type = 'info') {
    const container = document.getElementById('notificationContainer');
    if (!container) return;
    
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    
    const icons = { success: '✅', error: '❌', info: 'ℹ️', warning: '⚠️' };
    notification.innerHTML = `${icons[type] || 'ℹ️'} ${escapeHtml(message)}`;
    
    container.appendChild(notification);
    
    setTimeout(() => {
        notification.style.opacity = '0';
        notification.style.transform = 'translateX(100%)';
        setTimeout(() => notification.remove(), 300);
    }, 5000);
}

// ============================================================================
// AUTENTICAÇÃO
// ============================================================================

async function login(username, password) {
    console.log('🔐 Tentando login com:', username);
    console.log('📍 API URL:', API_URL);
    
    try {
        const response = await fetch(`${API_URL}/auth/login`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({ username, password })
        });

        console.log('📡 Status da resposta:', response.status);

        if (!response.ok) {
            let errorMsg = 'Erro no login';
            try {
                const error = await response.json();
                errorMsg = error.error || errorMsg;
            } catch(e) {}
            throw new Error(errorMsg);
        }

        const data = await response.json();
        console.log('✅ Login bem-sucedido!');
        
        currentUser = data.user;
        authToken = data.token;
        
        // Salvar com expiração
        const tokenData = {
            token: authToken,
            user: currentUser,
            expires: Date.now() + (7 * 24 * 60 * 60 * 1000) // 7 dias
        };
        
        localStorage.setItem('authToken', JSON.stringify(tokenData));
        
        await loadInitialData();
        showMainApp();
        showNotification(`Bem-vindo, ${currentUser.name}!`, 'success');
        
        // Iniciar refresh automático (a cada 5 minutos)
        if (refreshInterval) clearInterval(refreshInterval);
        refreshInterval = setInterval(refreshData, 5 * 60 * 1000);
        
        return true;
    } catch (error) {
        console.error('❌ Erro no login:', error);
        showNotification(error.message, 'error');
        return false;
    }
}

function logout() {
    if (refreshInterval) {
        clearInterval(refreshInterval);
        refreshInterval = null;
    }
    
    currentUser = null;
    authToken = null;
    localStorage.removeItem('authToken');
    localStorage.removeItem('currentUser');
    showLoginScreen();
    showNotification('Logout realizado com sucesso!', 'info');
}

async function verifyToken() {
    const tokenData = localStorage.getItem('authToken');
    if (!tokenData) return false;
    
    try {
        const { token, expires } = JSON.parse(tokenData);
        
        // Verificar se token expirou
        if (Date.now() > expires) {
            localStorage.removeItem('authToken');
            return false;
        }
        
        const response = await fetch(`${API_URL}/auth/verify`, {
            method: 'GET',
            headers: { 
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        if (response.ok) {
            const data = await response.json();
            currentUser = data.user;
            authToken = token;
            await loadInitialData();
            showMainApp();
            
            // Iniciar refresh automático
            if (refreshInterval) clearInterval(refreshInterval);
            refreshInterval = setInterval(refreshData, 5 * 60 * 1000);
            
            return true;
        } else {
            localStorage.removeItem('authToken');
            return false;
        }
    } catch (error) {
        console.error('Erro ao verificar token:', error);
        return false;
    }
}

// Função para refresh automático dos dados
async function refreshData() {
    if (!authToken) return;
    console.log('🔄 Atualizando dados automaticamente...');
    try {
        await Promise.all([loadInventory(), loadHistory()]);
        renderInventory();
        updateStats();
        updateMetrics();
        console.log('✅ Dados atualizados');
    } catch (error) {
        console.error('❌ Erro ao atualizar dados:', error);
    }
}

// ============================================================================
// CARREGAMENTO DE DADOS
// ============================================================================

async function loadInitialData() {
    try {
        await Promise.all([loadInventory(), loadHistory()]);
        renderInventory();
        renderHistory();
        updateStats();
        updateMetrics();
        startClock();
    } catch (error) {
        console.error('Erro ao carregar dados:', error);
        showNotification('Erro ao carregar dados', 'error');
    }
}

async function loadInventory() {
    try {
        const response = await fetch(`${API_URL}/inventory`, {
            headers: { 
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json'
            }
        });
        
        if (response.ok) {
            inventory = await response.json();
            console.log(`📦 Inventário carregado: ${inventory.length} itens`);
        } else if (response.status === 401) {
            logout();
        } else {
            throw new Error('Erro ao carregar inventário');
        }
    } catch (error) {
        console.error('Erro ao carregar inventário:', error);
        throw error;
    }
}

async function loadHistory() {
    try {
        const response = await fetch(`${API_URL}/history`, {
            headers: { 
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json'
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            history = data.history || data;
            console.log(`📜 Histórico carregado: ${history.length} registros`);
        }
    } catch (error) {
        console.error('Erro ao carregar histórico:', error);
        throw error;
    }
}

// ============================================================================
// MOVIMENTAÇÕES (com retry e validação)
// ============================================================================

async function withdrawItem(itemId, data) {
    if (!authToken) {
        showNotification('Sessão expirada. Faça login novamente.', 'error');
        logout();
        return false;
    }
    
    try {
        const response = await fetch(`${API_URL}/inventory/${itemId}/withdraw`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify(data)
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error);
        }

        const result = await response.json();
        
        await Promise.all([loadInventory(), loadHistory()]);
        renderInventory();
        updateStats();
        updateMetrics();
        
        generateWithdrawReceipt({
            ...data,
            itemName: result.item.name,
            date: new Date().toLocaleString('pt-BR')
        });
        
        showNotification('Retirada realizada com sucesso!', 'success');
        return true;
    } catch (error) {
        showNotification(error.message, 'error');
        return false;
    }
}

async function addStock(itemId, data) {
    if (!authToken) {
        showNotification('Sessão expirada. Faça login novamente.', 'error');
        logout();
        return false;
    }
    
    try {
        const response = await fetch(`${API_URL}/inventory/${itemId}/add`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify(data)
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error);
        }

        const result = await response.json();
        
        await Promise.all([loadInventory(), loadHistory()]);
        renderInventory();
        updateStats();
        updateMetrics();
        
        generateAddReceipt({
            ...data,
            itemName: result.item.name,
            date: new Date().toLocaleString('pt-BR')
        });
        
        showNotification('Adição realizada com sucesso!', 'success');
        return true;
    } catch (error) {
        showNotification(error.message, 'error');
        return false;
    }
}

// ============================================================================
// COMPROVANTES
// ============================================================================

function generateWithdrawReceipt(data) {
    const { company, om, collaboratorName, collaboratorRegistration, activity, itemName, quantity, date } = data;
    
    const receipt = `========================================================================
                    COMPROVANTE DE RETIRADA
                          KANBAN AUTOMAÇÃO
========================================================================

EMPRESA: ${company}
OM: ${om}
DATA: ${date}

------------------------------------------------------------------------
DADOS DO COLABORADOR
------------------------------------------------------------------------
NOME: ${collaboratorName}
MATRÍCULA: ${collaboratorRegistration}
ATIVIDADE: ${activity}

------------------------------------------------------------------------
MATERIAL RETIRADO
------------------------------------------------------------------------
EQUIPAMENTO: ${itemName}
QUANTIDADE: ${quantity} unidade(s)

========================================================================
Documento gerado eletronicamente - Válido como comprovante
Sistema de controle de estoque.
Realizado por: ${currentUser?.name || 'Sistema'}
========================================================================`;
    
    downloadReceipt(receipt, `retirada_${om}_${Date.now()}.txt`);
}

function generateAddReceipt(data) {
    const { company, responsible, om, itemName, quantity, observation, date } = data;
    
    const receipt = `========================================================================
                    COMPROVANTE DE ADIÇÃO
                          KANBAN AUTOMAÇÃO
========================================================================

EMPRESA: ${company}
DATA: ${date}
OM/NOTA FISCAL: ${om}
RESPONSÁVEL: ${responsible}

------------------------------------------------------------------------
MATERIAL ADICIONADO
------------------------------------------------------------------------
EQUIPAMENTO: ${itemName}
QUANTIDADE: +${quantity} unidade(s)
OBSERVAÇÃO: ${observation || 'N/A'}

========================================================================
Documento gerado eletronicamente - Válido como comprovante
Sistema de controle de estoque.
Realizado por: ${currentUser?.name || 'Sistema'}
========================================================================`;
    
    downloadReceipt(receipt, `adicao_${itemName.replace(/\s/g, '_')}_${Date.now()}.txt`);
}

function downloadReceipt(content, filename) {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    URL.revokeObjectURL(link.href);
}

// ============================================================================
// CRUD (Admin only) - com validação melhorada
// ============================================================================

async function addItem(itemData) {
    if (currentUser.role !== 'admin') {
        showNotification('Apenas administradores podem adicionar equipamentos!', 'error');
        return false;
    }
    
    try {
        const response = await fetch(`${API_URL}/inventory`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify(itemData)
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error);
        }
        
        await loadInventory();
        renderInventory();
        updateStats();
        updateMetrics();
        showNotification('Equipamento adicionado!', 'success');
        return true;
    } catch (error) {
        showNotification(error.message, 'error');
        return false;
    }
}

async function updateItem(id, itemData) {
    if (currentUser.role !== 'admin') {
        showNotification('Apenas administradores podem editar equipamentos!', 'error');
        return false;
    }
    
    try {
        const response = await fetch(`${API_URL}/inventory/${id}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify(itemData)
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error);
        }
        
        await loadInventory();
        renderInventory();
        updateStats();
        updateMetrics();
        showNotification('Equipamento atualizado!', 'success');
        return true;
    } catch (error) {
        showNotification(error.message, 'error');
        return false;
    }
}

async function deleteItem(id) {
    if (currentUser.role !== 'admin') {
        showNotification('Apenas administradores podem excluir equipamentos!', 'error');
        return;
    }
    
    const item = inventory.find(i => i._id === id);
    if (!confirm(`⚠️ Atenção!\n\nDeseja excluir permanentemente o equipamento:\n"${item?.name}"?\n\nEsta ação não pode ser desfeita!`)) return;
    
    try {
        const response = await fetch(`${API_URL}/inventory/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        
        if (response.ok) {
            await loadInventory();
            renderInventory();
            updateStats();
            updateMetrics();
            showNotification('Equipamento removido!', 'info');
        } else {
            throw new Error('Erro ao excluir');
        }
    } catch (error) {
        showNotification('Erro ao excluir equipamento!', 'error');
    }
}

async function clearHistory() {
    if (currentUser.role !== 'admin') {
        showNotification('Apenas administradores podem limpar o histórico!', 'error');
        return;
    }
    
    if (!confirm('⚠️ ATENÇÃO!\n\nLimpar todo o histórico?\nEsta ação não pode ser desfeita e todos os registros serão perdidos permanentemente.')) return;
    
    try {
        const response = await fetch(`${API_URL}/history/clear`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        
        if (response.ok) {
            await loadHistory();
            renderHistory();
            updateMetrics();
            showNotification('Histórico limpo com sucesso!', 'success');
        } else {
            throw new Error('Erro ao limpar histórico');
        }
    } catch (error) {
        showNotification('Erro ao limpar histórico.', 'error');
    }
}

// ============================================================================
// RENDERIZAÇÃO
// ============================================================================

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function getCategoryName(category) {
    const categories = { switch: 'SWITCH', gnss: 'GNSS/GPS', radio: 'RÁDIO', plc: 'PLC', fonte: 'FONTE', cftv: 'CFTV', fibra: 'FIBRA', outros: 'OUTROS' };
    return categories[category] || category.toUpperCase();
}

function renderInventory() {
    let filtered = [...inventory];
    
    if (currentCategory !== 'all') {
        filtered = filtered.filter(item => item.category === currentCategory);
    }
    
    if (currentSearch) {
        const searchLower = currentSearch.toLowerCase();
        filtered = filtered.filter(item => 
            item.name.toLowerCase().includes(searchLower) ||
            (item.location && item.location.toLowerCase().includes(searchLower))
        );
    }
    
    const grid = document.getElementById('inventoryGrid');
    const list = document.getElementById('inventoryList');
    
    if (filtered.length === 0) {
        const emptyHtml = `<div class="empty-message"><i class="fas fa-box-open"></i><p>Nenhum equipamento encontrado</p></div>`;
        if (grid) grid.innerHTML = emptyHtml;
        if (list) list.innerHTML = emptyHtml;
        return;
    }
    
    // Grid View
    if (grid) {
        grid.innerHTML = filtered.map(item => {
            const isCritical = item.quantity <= 2;
            const isLow = item.quantity <= item.minStock && !isCritical;
            const stockClass = isCritical ? 'critical' : (isLow ? 'low' : '');
            
            return `
                <div class="stock-card ${stockClass}" data-id="${item._id}">
                    <div class="card-header">
                        <h3>${escapeHtml(item.name)}</h3>
                        <span class="category-tag ${item.category}">${getCategoryName(item.category)}</span>
                    </div>
                    <div class="card-body">
                        <div class="stock-info">
                            <span class="stock-qty">${item.quantity} <small>un.</small></span>
                            <span class="min-stock"><i class="fas fa-chart-line"></i> Mín: ${item.minStock}</span>
                        </div>
                        <div class="location"><i class="fas fa-map-marker-alt"></i> ${escapeHtml(item.location) || '-'}</div>
                        ${(isCritical || isLow) ? `<div class="alert-indicator ${isCritical ? 'alert-critical' : 'alert-low'}"><i class="fas ${isCritical ? 'fa-skull-crosswalk' : 'fa-exclamation-triangle'}"></i> ${isCritical ? 'CRÍTICO' : 'ESTOQUE BAIXO'}</div>` : ''}
                        <div class="card-actions">
                            <button class="btn-withdraw" onclick="openWithdrawModal('${item._id}')"><i class="fas fa-sign-out-alt"></i> Retirar</button>
                            <button class="btn-add" onclick="openAddStockModal('${item._id}')"><i class="fas fa-plus"></i> Adicionar</button>
                            ${currentUser?.role === 'admin' ? `
                                <button onclick="editItem('${item._id}')" title="Editar"><i class="fas fa-edit"></i></button>
                                <button onclick="deleteItem('${item._id}')" title="Excluir" style="color: var(--status-critical);"><i class="fas fa-trash-alt"></i></button>
                            ` : ''}
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }
    
    // List View
    if (list) {
        list.innerHTML = `
            <table class="list-table">
                <thead>
                    <tr><th>Equipamento</th><th>Categoria</th><th>Qtd</th><th>Mín</th><th>Local</th><th>Ações</th></tr>
                </thead>
                <tbody>
                    ${filtered.map(item => `
                        <tr>
                            <td><strong>${escapeHtml(item.name)}</strong></td>
                            <td><span class="category-tag ${item.category}">${getCategoryName(item.category)}</span></td>
                            <td style="font-weight: 600; ${item.quantity <= 2 ? 'color: var(--status-critical);' : ''}">${item.quantity}</td>
                            <td>${item.minStock}</td>
                            <td>${escapeHtml(item.location) || '-'}</td>
                            <td>
                                <button onclick="openWithdrawModal('${item._id}')" style="margin-right: 5px;" title="Retirar"><i class="fas fa-sign-out-alt"></i></button>
                                <button onclick="openAddStockModal('${item._id}')" style="margin-right: 5px;" title="Adicionar"><i class="fas fa-plus"></i></button>
                                ${currentUser?.role === 'admin' ? `<button onclick="editItem('${item._id}')" title="Editar"><i class="fas fa-edit"></i></button>` : ''}
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    }
}

function renderHistory() {
    const tbody = document.getElementById('historyBody');
    
    if (!tbody) return;
    
    if (history.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="empty-message"><i class="fas fa-inbox"></i> Nenhuma movimentação</td></tr>`;
        return;
    }
    
    tbody.innerHTML = history.map(record => `
        <tr>
            <td>${new Date(record.createdAt).toLocaleString('pt-BR')}</td>
            <td><strong>${escapeHtml(record.om)}</strong></td>
            <td>${escapeHtml(record.company) || '-'}</td>
            <td>${escapeHtml(record.itemName)}</td>
            <td>${record.type === 'retirada' ? '-' : '+'} ${record.quantity}</td>
            <td><span class="type-badge ${record.type}">${record.type === 'retirada' ? 'RETIRADA' : 'ADIÇÃO'}</span></td>
            <td>${escapeHtml(record.collaboratorName || record.responsible || record.performedBy || '-')}</td>
            <td><button class="reprint-btn" onclick="reprintReceipt('${record._id}')" title="Reimprimir comprovante"><i class="fas fa-print"></i></button></td>
        </tr>
    `).join('');
}

function updateStats() {
    const totalItems = inventory.length;
    const totalUnits = inventory.reduce((sum, item) => sum + item.quantity, 0);
    const alertsCount = inventory.filter(item => item.quantity <= item.minStock).length;
    
    const totalItemsEl = document.getElementById('totalItemsCount');
    const totalUnitsEl = document.getElementById('totalUnitsCount');
    const alertsCountEl = document.getElementById('alertsCount');
    
    if (totalItemsEl) totalItemsEl.textContent = totalItems;
    if (totalUnitsEl) totalUnitsEl.textContent = totalUnits;
    if (alertsCountEl) alertsCountEl.textContent = alertsCount;
}

function updateMetrics() {
    const totalMovements = history.length;
    const totalUnits = inventory.reduce((sum, item) => sum + item.quantity, 0);
    const turnover = totalMovements > 0 && totalUnits > 0 ? ((totalMovements / totalUnits) * 100).toFixed(1) : 0;
    
    const turnoverEl = document.getElementById('turnoverRate');
    const categoriesEl = document.getElementById('categoriesCount');
    const movementsEl = document.getElementById('totalMovements');
    
    if (turnoverEl) turnoverEl.textContent = `${turnover}%`;
    if (categoriesEl) categoriesEl.textContent = new Set(inventory.map(i => i.category)).size;
    if (movementsEl) movementsEl.textContent = totalMovements;
}

// ============================================================================
// MODAIS
// ============================================================================

function openWithdrawModal(itemId) {
    const item = inventory.find(i => i._id === itemId);
    if (!item) return;
    
    currentWithdrawItemId = itemId;
    document.getElementById('withdrawItemName').textContent = item.name;
    document.getElementById('availableQty').textContent = item.quantity;
    document.getElementById('withdrawQty').value = 1;
    document.getElementById('withdrawQty').max = item.quantity;
    document.getElementById('withdrawCompany').value = companyConfig.name;
    document.getElementById('withdrawOm').value = '';
    document.getElementById('withdrawName').value = '';
    document.getElementById('withdrawRegistration').value = '';
    document.getElementById('withdrawActivity').value = '';
    
    document.getElementById('withdrawModal').classList.add('active');
}

function closeWithdrawModal() {
    document.getElementById('withdrawModal').classList.remove('active');
    currentWithdrawItemId = null;
}

function openAddStockModal(itemId) {
    const item = inventory.find(i => i._id === itemId);
    if (!item) return;
    
    currentAddItemId = itemId;
    document.getElementById('addItemName').textContent = item.name;
    document.getElementById('addQty').value = 1;
    document.getElementById('addCompany').value = companyConfig.name;
    document.getElementById('addResponsible').value = currentUser?.name || '';
    document.getElementById('addOmNota').value = '';
    document.getElementById('addObservation').value = '';
    
    document.getElementById('addStockModal').classList.add('active');
}

function closeAddStockModal() {
    document.getElementById('addStockModal').classList.remove('active');
    currentAddItemId = null;
}

function editItem(itemId) {
    if (currentUser?.role !== 'admin') {
        showNotification('Apenas administradores podem editar equipamentos!', 'error');
        return;
    }
    
    const item = inventory.find(i => i._id === itemId);
    if (!item) return;
    
    document.getElementById('itemId').value = item._id;
    document.getElementById('itemName').value = item.name;
    document.getElementById('itemCategory').value = item.category;
    document.getElementById('itemQuantity').value = item.quantity;
    document.getElementById('itemMinStock').value = item.minStock;
    document.getElementById('itemLocation').value = item.location || '';
    document.getElementById('itemNotes').value = item.notes || '';
    document.getElementById('modalTitle').innerHTML = '<i class="fas fa-edit"></i> Editar Equipamento';
    
    document.getElementById('itemModal').classList.add('active');
}

function openAddItemModal() {
    if (currentUser?.role !== 'admin') {
        showNotification('Apenas administradores podem adicionar equipamentos!', 'error');
        return;
    }
    
    document.getElementById('itemId').value = '';
    document.getElementById('itemName').value = '';
    document.getElementById('itemCategory').value = 'switch';
    document.getElementById('itemQuantity').value = '0';
    document.getElementById('itemMinStock').value = '5';
    document.getElementById('itemLocation').value = '';
    document.getElementById('itemNotes').value = '';
    document.getElementById('modalTitle').innerHTML = '<i class="fas fa-plus"></i> Novo Equipamento';
    
    document.getElementById('itemModal').classList.add('active');
}

function closeModal() {
    document.getElementById('itemModal').classList.remove('active');
}

function openCompanyModal() {
    document.getElementById('companyNameInput').value = companyConfig.name;
    document.getElementById('companyModal').classList.add('active');
}

function closeCompanyModal() {
    document.getElementById('companyModal').classList.remove('active');
}

function saveCompanyConfig() {
    companyConfig.name = document.getElementById('companyNameInput').value || 'KANBAN AUTOMAÇÃO';
    const companyDisplay = document.getElementById('companyNameDisplay');
    if (companyDisplay) companyDisplay.textContent = companyConfig.name;
    localStorage.setItem('cisco_company_config', JSON.stringify(companyConfig));
    closeCompanyModal();
    showNotification('Configuração salva!', 'success');
}

function showAlertsModal() {
    const alertItems = inventory.filter(item => item.quantity <= item.minStock);
    
    const modalBody = document.getElementById('alertsModalBody');
    if (!modalBody) return;
    
    if (alertItems.length === 0) {
        modalBody.innerHTML = `<div class="empty-message"><i class="fas fa-check-circle" style="font-size: 3rem; color: var(--status-ok);"></i><p>Nenhum item em alerta!</p></div>`;
    } else {
        modalBody.innerHTML = `
            <div style="margin-bottom: 1rem;"><strong>${alertItems.length}</strong> item(ns) abaixo do estoque mínimo:</div>
            <div class="alerts-list">
                ${alertItems.map(item => {
                    const isCritical = item.quantity <= 2;
                    return `
                        <div style="display: flex; justify-content: space-between; padding: 12px; margin-bottom: 8px; border-radius: 8px; background: ${isCritical ? 'var(--status-critical-bg)' : 'var(--status-warning-bg)'}; border-left: 4px solid ${isCritical ? 'var(--status-critical)' : 'var(--status-warning)'}">
                            <div><strong>${escapeHtml(item.name)}</strong><div style="font-size: 0.75rem;">${escapeHtml(item.location) || '-'}</div></div>
                            <div style="text-align: right;"><span style="font-size: 1.25rem; font-weight: 700;">${item.quantity}</span><div style="font-size: 0.7rem;">min: ${item.minStock}</div></div>
                        </div>
                    `;
                }).join('')}
            </div>
        `;
    }
    
    document.getElementById('alertsModal').classList.add('active');
}

function closeAlertsModal() {
    document.getElementById('alertsModal').classList.remove('active');
}

function confirmWithdraw() {
    if (!currentWithdrawItemId) return;
    
    const qtyElement = document.getElementById('withdrawQty');
    const maxQty = parseInt(qtyElement.max) || 0;
    const requestedQty = parseInt(qtyElement.value);
    
    if (requestedQty > maxQty) {
        showNotification(`Quantidade máxima disponível é ${maxQty}!`, 'error');
        return;
    }
    
    const data = {
        company: document.getElementById('withdrawCompany').value.trim(),
        om: document.getElementById('withdrawOm').value.trim(),
        collaboratorName: document.getElementById('withdrawName').value.trim(),
        collaboratorRegistration: document.getElementById('withdrawRegistration').value.trim(),
        activity: document.getElementById('withdrawActivity').value.trim(),
        quantity: requestedQty
    };
    
    if (!data.company) { showNotification('Empresa é obrigatória!', 'error'); return; }
    if (!data.om) { showNotification('OM é obrigatória!', 'error'); return; }
    if (!data.collaboratorName) { showNotification('Nome do colaborador é obrigatório!', 'error'); return; }
    if (!data.collaboratorRegistration) { showNotification('Matrícula é obrigatória!', 'error'); return; }
    if (!data.activity) { showNotification('Atividade é obrigatória!', 'error'); return; }
    if (isNaN(data.quantity) || data.quantity <= 0) { showNotification('Quantidade inválida!', 'error'); return; }
    
    withdrawItem(currentWithdrawItemId, data);
    closeWithdrawModal();
}

function confirmAdd() {
    if (!currentAddItemId) return;
    
    const data = {
        company: document.getElementById('addCompany').value.trim(),
        responsible: document.getElementById('addResponsible').value.trim(),
        om: document.getElementById('addOmNota').value.trim(),
        quantity: parseInt(document.getElementById('addQty').value),
        observation: document.getElementById('addObservation').value
    };
    
    if (!data.company) { showNotification('Empresa é obrigatória!', 'error'); return; }
    if (!data.responsible) { showNotification('Funcionário responsável é obrigatório!', 'error'); return; }
    if (!data.om) { showNotification('OM ou Nota Fiscal é obrigatória!', 'error'); return; }
    if (isNaN(data.quantity) || data.quantity <= 0) { showNotification('Quantidade inválida!', 'error'); return; }
    
    addStock(currentAddItemId, data);
    closeAddStockModal();
}

function saveItem() {
    const id = document.getElementById('itemId').value;
    const data = {
        name: document.getElementById('itemName').value.trim(),
        category: document.getElementById('itemCategory').value,
        quantity: parseInt(document.getElementById('itemQuantity').value) || 0,
        minStock: parseInt(document.getElementById('itemMinStock').value) || 5,
        location: document.getElementById('itemLocation').value.trim(),
        notes: document.getElementById('itemNotes').value.trim()
    };
    
    if (!data.name) { showNotification('Nome do equipamento é obrigatório!', 'error'); return; }
    if (data.quantity < 0) { showNotification('Quantidade não pode ser negativa!', 'error'); return; }
    if (data.minStock < 1) { showNotification('Estoque mínimo deve ser pelo menos 1!', 'error'); return; }
    
    if (id) {
        updateItem(id, data);
    } else {
        addItem(data);
    }
    closeModal();
}

function reprintReceipt(historyId) {
    const record = history.find(h => h._id === historyId);
    if (!record) return;
    
    if (record.type === 'retirada') {
        generateWithdrawReceipt({
            company: record.company,
            om: record.om,
            collaboratorName: record.collaboratorName || 'N/A',
            collaboratorRegistration: record.collaboratorRegistration || 'N/A',
            activity: record.activity || 'N/A',
            itemName: record.itemName,
            quantity: record.quantity,
            date: new Date(record.createdAt).toLocaleString('pt-BR')
        });
    } else {
        generateAddReceipt({
            company: record.company,
            responsible: record.responsible || 'N/A',
            om: record.om,
            itemName: record.itemName,
            quantity: record.quantity,
            observation: record.observation || '',
            date: new Date(record.createdAt).toLocaleString('pt-BR')
        });
    }
}

// ============================================================================
// EXPORTAÇÕES
// ============================================================================

async function exportToCSV() {
    const headers = ['ID', 'Nome', 'Categoria', 'Quantidade', 'Mínimo', 'Localização', 'Observações'];
    const rows = inventory.map(item => [item._id, `"${item.name}"`, item.category, item.quantity, item.minStock, `"${item.location || ''}"`, `"${item.notes || ''}"`]);
    const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
    
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `estoque_${new Date().toISOString().slice(0,19).replace(/:/g, '-')}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
    showNotification('CSV exportado com sucesso!', 'success');
}

async function exportFullReport() {
    try {
        const response = await fetch(`${API_URL}/history/export/all`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        
        if (!response.ok) throw new Error('Erro na exportação');
        
        const blob = await response.blob();
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `relatorio_estoque_${new Date().toISOString().slice(0,19).replace(/:/g, '-')}.txt`;
        link.click();
        URL.revokeObjectURL(link.href);
        showNotification('Relatório exportado com sucesso!', 'success');
    } catch (error) {
        console.error('Erro na exportação:', error);
        showNotification('Erro ao exportar relatório!', 'error');
    }
}

// ============================================================================
// TEMA
// ============================================================================

function toggleTheme() {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    if (isDark) {
        document.documentElement.removeAttribute('data-theme');
        localStorage.setItem('cisco_theme', 'light');
        updateThemeIcon(false);
    } else {
        document.documentElement.setAttribute('data-theme', 'dark');
        localStorage.setItem('cisco_theme', 'dark');
        updateThemeIcon(true);
    }
}

function updateThemeIcon(isDark) {
    const btn = document.getElementById('themeToggle');
    if (btn) btn.innerHTML = isDark ? '<i class="fas fa-sun"></i>' : '<i class="fas fa-moon"></i>';
}

// ============================================================================
// CLOCK
// ============================================================================

function startClock() {
    function update() {
        const clock = document.getElementById('liveClock');
        if (clock) {
            const now = new Date();
            const timeStr = now.toLocaleTimeString('pt-BR');
            const dateStr = now.toLocaleDateString('pt-BR');
            clock.textContent = `${dateStr} ${timeStr}`;
        }
    }
    update();
    setInterval(update, 1000);
}

// ============================================================================
// INTERFACE DE LOGIN/APP
// ============================================================================

function showLoginScreen() {
    const loginContainer = document.getElementById('loginContainer');
    const appContainer = document.getElementById('appContainer');
    if (loginContainer) loginContainer.style.display = 'flex';
    if (appContainer) appContainer.style.display = 'none';
    
    // Limpar campos de login
    const usernameInput = document.getElementById('loginUsername');
    const passwordInput = document.getElementById('loginPassword');
    if (usernameInput) usernameInput.value = '';
    if (passwordInput) passwordInput.value = '';
}

function showMainApp() {
    const loginContainer = document.getElementById('loginContainer');
    const appContainer = document.getElementById('appContainer');
    if (loginContainer) loginContainer.style.display = 'none';
    if (appContainer) appContainer.style.display = 'block';
    
    const userNameDisplay = document.getElementById('userNameDisplay');
    const userRole = document.getElementById('userRole');
    const companyNameDisplay = document.getElementById('companyNameDisplay');
    
    if (userNameDisplay) userNameDisplay.textContent = currentUser?.name || '';
    if (userRole) userRole.textContent = currentUser?.role === 'admin' ? 'Administrador' : 'Operador';
    if (companyNameDisplay) companyNameDisplay.textContent = companyConfig.name;
    
    // Mostrar/esconder elementos de admin
    const adminElements = document.querySelectorAll('.admin-only');
    if (currentUser?.role === 'admin') {
        adminElements.forEach(el => el.style.display = 'inline-flex');
    } else {
        adminElements.forEach(el => el.style.display = 'none');
    }
}

// ============================================================================
// EVENTOS
// ============================================================================

function setupEventListeners() {
    // Login
    const loginBtn = document.getElementById('loginBtn');
    const loginPassword = document.getElementById('loginPassword');

    async function doLogin() {
        const username = document.getElementById('loginUsername').value.trim();
        const password = document.getElementById('loginPassword').value;
        if (!username || !password) {
            showNotification('Preencha usuário e senha.', 'warning');
            return;
        }
        if (loginBtn) {
            loginBtn.disabled = true;
            loginBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Entrando...';
        }
        await login(username, password);
        if (loginBtn) {
            loginBtn.disabled = false;
            loginBtn.innerHTML = '<i class="fas fa-sign-in-alt"></i> ENTRAR';
        }
    }

    if (loginBtn) loginBtn.addEventListener('click', doLogin);
    if (loginPassword) loginPassword.addEventListener('keypress', async (e) => {
        if (e.key === 'Enter') await doLogin();
    });
    
    // Logout
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) logoutBtn.addEventListener('click', logout);
    
    // CRUD
    const saveItemBtn = document.getElementById('saveItemBtn');
    if (saveItemBtn) saveItemBtn.onclick = saveItem;
    
    const addItemBtn = document.getElementById('addItemBtn');
    if (addItemBtn) addItemBtn.onclick = openAddItemModal;
    
    // Movimentações
    const confirmWithdrawBtn = document.getElementById('confirmWithdrawBtn');
    if (confirmWithdrawBtn) confirmWithdrawBtn.onclick = confirmWithdraw;
    
    const confirmAddBtn = document.getElementById('confirmAddBtn');
    if (confirmAddBtn) confirmAddBtn.onclick = confirmAdd;
    
    // Empresa
    const editCompanyBtn = document.getElementById('editCompanyBtn');
    if (editCompanyBtn) editCompanyBtn.onclick = openCompanyModal;
    
    const saveCompanyBtn = document.getElementById('saveCompanyBtn');
    if (saveCompanyBtn) saveCompanyBtn.onclick = saveCompanyConfig;
    
    // Alertas
    const alertStatCard = document.getElementById('alertStatCard');
    if (alertStatCard) alertStatCard.onclick = showAlertsModal;
    
    // Exportações
    const exportCsvBtn = document.getElementById('exportCsvBtn');
    if (exportCsvBtn) exportCsvBtn.onclick = exportToCSV;
    
    const exportHistoryBtn = document.getElementById('exportHistoryBtn');
    if (exportHistoryBtn) exportHistoryBtn.onclick = exportFullReport;
    
    const clearHistoryBtn = document.getElementById('clearHistoryBtn');
    if (clearHistoryBtn) clearHistoryBtn.onclick = clearHistory;
    
    // Tema
    const themeToggle = document.getElementById('themeToggle');
    if (themeToggle) themeToggle.onclick = toggleTheme;
    
    // Busca
    const searchInput = document.getElementById('searchInput');
    const clearSearchBtn = document.getElementById('clearSearchBtn');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            currentSearch = e.target.value;
            if (clearSearchBtn) clearSearchBtn.style.display = currentSearch ? 'flex' : 'none';
            renderInventory();
        });
    }
    if (clearSearchBtn) {
        clearSearchBtn.addEventListener('click', () => {
            if (searchInput) searchInput.value = '';
            currentSearch = '';
            if (clearSearchBtn) clearSearchBtn.style.display = 'none';
            renderInventory();
        });
    }
    
    // Filtros
    document.querySelectorAll('.filter-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            currentCategory = chip.dataset.category;
            renderInventory();
        });
    });
    
    // View
    document.querySelectorAll('.view-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentView = btn.dataset.view;
            const grid = document.getElementById('inventoryGrid');
            const list = document.getElementById('inventoryList');
            if (grid) grid.style.display = currentView === 'grid' ? 'grid' : 'none';
            if (list) list.style.display = currentView === 'list' ? 'block' : 'none';
        });
    });
    
    // Modal fechar com ESC
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            document.querySelectorAll('.modal-overlay.active').forEach(modal => {
                modal.classList.remove('active');
            });
        }
    });
    
    // Fechar modais clicando fora
    document.querySelectorAll('.modal-overlay').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.classList.remove('active');
            }
        });
    });
}

// ============================================================================
// INICIALIZAÇÃO
// ============================================================================

async function init() {
    console.log('🚀 Inicializando aplicação...');
    console.log(`📍 API URL: ${API_URL}`);
    console.log(`🌍 Ambiente: ${window.location.hostname}`);
    
    // Carregar tema salvo
    const savedTheme = localStorage.getItem('cisco_theme');
    if (savedTheme === 'dark') {
        document.documentElement.setAttribute('data-theme', 'dark');
        updateThemeIcon(true);
    }
    
    // Carregar configuração da empresa
    const savedCompany = localStorage.getItem('cisco_company_config');
    if (savedCompany) {
        companyConfig = JSON.parse(savedCompany);
        const companyDisplay = document.getElementById('companyNameDisplay');
        if (companyDisplay) companyDisplay.textContent = companyConfig.name;
    }

    // Configurar eventos
    setupEventListeners();
    
    // Verificar token
    const tokenValid = await verifyToken();
    if (!tokenValid) {
        showLoginScreen();
    }
}

// Inicializar quando o DOM estiver pronto
document.addEventListener('DOMContentLoaded', init);

// Expor funções globalmente
window.openWithdrawModal = openWithdrawModal;
window.closeWithdrawModal = closeWithdrawModal;
window.openAddStockModal = openAddStockModal;
window.closeAddStockModal = closeAddStockModal;
window.editItem = editItem;
window.deleteItem = deleteItem;
window.closeModal = closeModal;
window.reprintReceipt = reprintReceipt;
window.closeCompanyModal = closeCompanyModal;
window.closeAlertsModal = closeAlertsModal;
window.openAddItemModal = openAddItemModal;
window.saveItem = saveItem;