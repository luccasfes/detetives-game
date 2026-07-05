// Constantes
const ADMIN_PASSWORD = 'admin123'; 

let allClues = [];
let allGroups = [];

// ============ LOGIN ADMIN ============
function adminLogin() {
    const password = document.getElementById('adminPassword').value;
    const errorDiv = document.getElementById('adminError');
    
    if (password === ADMIN_PASSWORD) {
        errorDiv.textContent = '';
        switchScreen('adminDashboard');
        loadAdminData();
    } else {
        errorDiv.textContent = '❌ Senha incorreta! Tente novamente.';
    }
}

function adminLogout() {
    switchScreen('adminLogin');
    document.getElementById('adminPassword').value = '';
}

// ============ CARREGAR DADOS ============
function loadAdminData() {
    // Carregar pistas do Firebase
    database.ref('clues').on('value', (snapshot) => {
        const data = snapshot.val();
        if (data) {
            allClues = Object.values(data);
            renderCluesList();
            updateStats();
        } else {
            allClues = [];
            renderCluesList();
        }
    });

    // Carregar grupos
    database.ref('groups').on('value', (snapshot) => {
        const data = snapshot.val();
        if (data) {
            allGroups = Object.keys(data).map(key => ({
                name: key,
                ...data[key]
            }));
            renderGroupsList();
            updateStats();
        } else {
            allGroups = [];
            renderGroupsList();
        }
    });
}

// ============ GERENCIAR PISTAS ============
function addClue() {
    const code = document.getElementById('newClueCode').value.trim().toUpperCase();
    const name = document.getElementById('newClueName').value.trim();
    const hint = document.getElementById('newClueHint').value.trim();
    const difficulty = document.getElementById('newClueDifficulty').value;
    const messageDiv = document.getElementById('addClueMessage');

    // Validações
    if (!code || !name || !hint) {
        messageDiv.textContent = '❌ Preencha todos os campos!';
        messageDiv.className = 'clue-message error';
        return;
    }

    // Verificar se código já existe
    const exists = allClues.some(clue => clue.id === code);
    if (exists) {
        messageDiv.textContent = '❌ Este código já está em uso!';
        messageDiv.className = 'clue-message error';
        return;
    }

    // Salvar no Firebase
    const newClue = {
        id: code,
        name: name,
        hint: hint,
        difficulty: difficulty,
        createdAt: Date.now()
    };

    database.ref('clues/' + code).set(newClue)
        .then(() => {
            messageDiv.textContent = '✅ Pista adicionada com sucesso!';
            messageDiv.className = 'clue-message success';
            
            // Limpar formulário
            document.getElementById('newClueCode').value = '';
            document.getElementById('newClueName').value = '';
            document.getElementById('newClueHint').value = '';
            
            // Atualizar lista
            allClues.push(newClue);
            renderCluesList();
            updateStats();
        })
        .catch((error) => {
            messageDiv.textContent = '❌ Erro ao adicionar pista: ' + error.message;
            messageDiv.className = 'clue-message error';
        });
}

function editClue(clueId) {
    const clue = allClues.find(c => c.id === clueId);
    if (!clue) return;

    // Preencher formulário com dados da pista
    document.getElementById('newClueCode').value = clue.id;
    document.getElementById('newClueName').value = clue.name;
    document.getElementById('newClueHint').value = clue.hint;
    document.getElementById('newClueDifficulty').value = clue.difficulty || 'Médio';
    
    // Mudar botão para atualizar
    const addBtn = document.querySelector('.clue-form .btn-primary');
    addBtn.textContent = '🔄 Atualizar Pista';
    addBtn.setAttribute('onclick', `updateClue('${clueId}')`);
    
    document.getElementById('addClueMessage').textContent = '✏️ Editando pista: ' + clueId;
    document.getElementById('addClueMessage').className = 'clue-message';
}

function updateClue(clueId) {
    const code = document.getElementById('newClueCode').value.trim().toUpperCase();
    const name = document.getElementById('newClueName').value.trim();
    const hint = document.getElementById('newClueHint').value.trim();
    const difficulty = document.getElementById('newClueDifficulty').value;
    const messageDiv = document.getElementById('addClueMessage');

    if (!code || !name || !hint) {
        messageDiv.textContent = '❌ Preencha todos os campos!';
        messageDiv.className = 'clue-message error';
        return;
    }

    const updatedClue = {
        id: code,
        name: name,
        hint: hint,
        difficulty: difficulty,
        updatedAt: Date.now()
    };

    database.ref('clues/' + clueId).update(updatedClue)
        .then(() => {
            messageDiv.textContent = '✅ Pista atualizada com sucesso!';
            messageDiv.className = 'clue-message success';
            
            // Resetar formulário
            document.getElementById('newClueCode').value = '';
            document.getElementById('newClueName').value = '';
            document.getElementById('newClueHint').value = '';
            
            const addBtn = document.querySelector('.clue-form .btn-primary');
            addBtn.textContent = '➕ Adicionar Pista';
            addBtn.setAttribute('onclick', 'addClue()');
            
            loadAdminData();
        })
        .catch((error) => {
            messageDiv.textContent = '❌ Erro ao atualizar: ' + error.message;
            messageDiv.className = 'clue-message error';
        });
}

function deleteClue(clueId) {
    if (!confirm(`Deseja realmente excluir a pista "${clueId}"?`)) return;

    database.ref('clues/' + clueId).remove()
        .then(() => {
            allClues = allClues.filter(c => c.id !== clueId);
            renderCluesList();
            updateStats();
            showToast('🗑️ Pista removida com sucesso!');
        })
        .catch((error) => {
            showToast('❌ Erro ao remover: ' + error.message, 'error');
        });
}

// ============ RENDERIZAR LISTAS ============
function renderCluesList() {
    const container = document.getElementById('cluesListAdmin');
    
    if (allClues.length === 0) {
        container.innerHTML = '<p class="empty-message">Nenhuma pista cadastrada ainda...</p>';
        return;
    }

    container.innerHTML = allClues.map(clue => `
        <div class="clue-card">
            <div class="clue-card-header">
                <span class="clue-code">${clue.id}</span>
                <span class="clue-difficulty ${clue.difficulty?.toLowerCase() || 'medio'}">
                    ${clue.difficulty || '⭐⭐ Médio'}
                </span>
            </div>
            <h4>${clue.name}</h4>
            <p>${clue.hint}</p>
            <div class="clue-actions">
                <button onclick="editClue('${clue.id}')" class="btn-edit">✏️ Editar</button>
                <button onclick="deleteClue('${clue.id}')" class="btn-delete">🗑️ Excluir</button>
            </div>
        </div>
    `).join('');
}

function renderGroupsList() {
    const container = document.getElementById('groupsList');
    
    if (allGroups.length === 0) {
        container.innerHTML = '<p class="empty-message">Nenhum grupo ativo no momento...</p>';
        return;
    }

    // Ordenar por tempo (os que completaram primeiro)
    const sortedGroups = allGroups.sort((a, b) => {
        if (a.completed && !b.completed) return -1;
        if (!a.completed && b.completed) return 1;
        if (a.completed && b.completed) return (a.finalTime || 0) - (b.finalTime || 0);
        return 0;
    });

    container.innerHTML = sortedGroups.map((group, index) => {
        const cluesFound = group.clues ? group.clues.length : 0;
        const totalClues = allClues.length || 0;
        const progress = totalClues > 0 ? Math.round((cluesFound / totalClues) * 100) : 0;
        const time = group.finalTime ? formatTime(group.finalTime) : formatTime(group.time || 0);
        
        return `
            <div class="group-card ${group.completed ? 'winner' : ''}">
                <div class="group-rank">#${index + 1}</div>
                <div class="group-info">
                    <h4>👥 ${group.name}</h4>
                    <div class="group-progress">
                        <div class="progress-bar">
                            <div class="progress-fill" style="width: ${progress}%"></div>
                        </div>
                        <span>${cluesFound}/${totalClues} pistas</span>
                    </div>
                    <div class="group-details">
                        <span>⏱️ ${time}</span>
                        ${group.completed ? '<span class="badge-winner">🏆 VENCEDOR!</span>' : ''}
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// ============ ESTATÍSTICAS ============
function updateStats() {
    document.getElementById('totalCluesAdmin').textContent = allClues.length;
    
    const activeGroups = allGroups.filter(g => !g.completed);
    document.getElementById('activeGroups').textContent = activeGroups.length;
    
    const winners = allGroups.filter(g => g.completed);
    document.getElementById('winnerGroups').textContent = winners.length;
}

// ============ CONTROLES RÁPIDOS ============
function resetAllGames() {
    if (!confirm('⚠️ Isso vai apagar todos os dados dos grupos! Continuar?')) return;
    
    database.ref('groups').remove()
        .then(() => {
            allGroups = [];
            renderGroupsList();
            updateStats();
            showToast('🔄 Todos os jogos foram resetados!');
        })
        .catch((error) => {
            showToast('❌ Erro ao resetar: ' + error.message, 'error');
        });
}

function exportData() {
    const data = {
        clues: allClues,
        groups: allGroups,
        exportedAt: new Date().toISOString()
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `detetives-data-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    
    showToast('📥 Dados exportados com sucesso!');
}

function importData() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    
    input.onchange = (e) => {
        const file = e.target.files[0];
        const reader = new FileReader();
        
        reader.onload = (event) => {
            try {
                const data = JSON.parse(event.target.result);
                
                // Importar pistas
                if (data.clues) {
                    data.clues.forEach(clue => {
                        database.ref('clues/' + clue.id).set(clue);
                    });
                }
                
                showToast('📤 Dados importados com sucesso!');
                loadAdminData();
            } catch (error) {
                showToast('❌ Erro ao importar dados: ' + error.message, 'error');
            }
        };
        
        reader.readAsText(file);
    };
    
    input.click();
}

// ============ UTILITÁRIOS ============
function formatTime(seconds) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
}

function showToast(message, type = 'success') {
    // Criar toast
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.classList.add('show');
    }, 100);
    
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => {
            toast.remove();
        }, 300);
    }, 3000);
}

function switchScreen(screenId) {
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.remove('active');
    });
    document.getElementById(screenId).classList.add('active');
}

// Permite Enter para login
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('adminPassword').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') adminLogin();
    });
});

// Exportar funções para uso global
window.adminLogin = adminLogin;
window.adminLogout = adminLogout;
window.addClue = addClue;
window.editClue = editClue;
window.updateClue = updateClue;
window.deleteClue = deleteClue;
window.resetAllGames = resetAllGames;
window.exportData = exportData;
window.importData = importData;