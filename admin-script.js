// ============ CONSTANTES ============
const ADMIN_PASSWORD = 'admin123';

let allGroups = [];
let allQuestions = [];

// ============ LOGIN ADMIN ============
function adminLogin() {
    const password = document.getElementById('adminPassword').value;
    const errorDiv = document.getElementById('adminError');
    
    if (password === ADMIN_PASSWORD) {
        errorDiv.textContent = '';
        switchScreen('adminDashboard');
        loadAdminData();
        switchTab('groups');
    } else {
        errorDiv.textContent = '❌ Senha incorreta! Tente novamente.';
    }
}

function adminLogout() {
    switchScreen('adminLogin');
    document.getElementById('adminPassword').value = '';
}

// ============ TABS ============
function switchTab(tab) {
    document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    
    const tabs = {
        'groups': { index: 0, id: 'tabGroups' },
        'questions': { index: 1, id: 'tabQuestions' },
        'ranking': { index: 2, id: 'tabRanking' }
    };
    
    const selected = tabs[tab];
    document.querySelectorAll('.admin-tab')[selected.index].classList.add('active');
    document.getElementById(selected.id).classList.add('active');
}

// ============ ALTERNAR TIPO DE PERGUNTA ============
function toggleQuestionType() {
    const type = document.getElementById('newQuestionType').value;
    const answerField = document.getElementById('answerField');
    const alternativesField = document.getElementById('alternativesField');
    
    if (type === 'multipla') {
        answerField.style.display = 'none';
        alternativesField.style.display = 'block';
    } else {
        answerField.style.display = 'block';
        alternativesField.style.display = 'none';
    }
}

// ============ CARREGAR DADOS ============
function loadAdminData() {
    // Carregar grupos
    database.ref('groups').on('value', (snapshot) => {
        const data = snapshot.val();
        if (data) {
            allGroups = Object.keys(data).map(key => ({
                name: key,
                ...data[key]
            }));
            renderGroupsListAdmin();
            renderGroupsListRanking();
            updateStats();
        } else {
            allGroups = [];
            renderGroupsListAdmin();
            renderGroupsListRanking();
            updateStats();
        }
    });

    // Carregar perguntas
    database.ref('questions').on('value', (snapshot) => {
        const data = snapshot.val();
        if (data) {
            allQuestions = Object.values(data).sort((a, b) => (a.order || 0) - (b.order || 0));
            renderQuestionsList();
            updateStats();
        } else {
            allQuestions = [];
            renderQuestionsList();
            updateStats();
        }
    });
}

// ============ GERENCIAR GRUPOS ============
function addGroup() {
    const name = document.getElementById('newGroupName').value.trim();
    const membersInput = document.getElementById('newGroupMembers').value.trim();
    const messageDiv = document.getElementById('addGroupMessage');

    if (!name || !membersInput) {
        messageDiv.textContent = '❌ Preencha todos os campos!';
        messageDiv.className = 'clue-message error';
        return;
    }

    const members = membersInput.split(',').map(m => m.trim()).filter(m => m);
    
    if (members.length < 2) {
        messageDiv.textContent = '❌ Mínimo 2 integrantes!';
        messageDiv.className = 'clue-message error';
        return;
    }

    if (allGroups.some(g => g.name === name)) {
        messageDiv.textContent = '❌ Este grupo já existe!';
        messageDiv.className = 'clue-message error';
        return;
    }

    const newGroup = {
        name: name,
        members: members,
        currentQuestion: 0,
        completed: false,
        started: false,
        createdAt: Date.now()
    };

    database.ref('groups/' + name).set(newGroup)
        .then(() => {
            messageDiv.textContent = '✅ Grupo criado com sucesso!';
            messageDiv.className = 'clue-message success';
            document.getElementById('newGroupName').value = '';
            document.getElementById('newGroupMembers').value = '';
            loadAdminData();
        })
        .catch((error) => {
            messageDiv.textContent = '❌ Erro: ' + error.message;
            messageDiv.className = 'clue-message error';
        });
}

function deleteGroup(groupName) {
    if (!confirm(`⚠️ Excluir grupo "${groupName}"?`)) return;

    database.ref('groups/' + groupName).remove()
        .then(() => {
            showToast('🗑️ Grupo removido!', 'success');
            loadAdminData();
        })
        .catch((error) => {
            showToast('❌ Erro: ' + error.message, 'error');
        });
}

// ============ GERENCIAR PERGUNTAS ============
function addQuestion() {
    const order = parseInt(document.getElementById('newQuestionOrder').value);
    const type = document.getElementById('newQuestionType').value;
    const text = document.getElementById('newQuestionText').value.trim();
    const hint = document.getElementById('newQuestionHint').value.trim();
    const messageDiv = document.getElementById('addQuestionMessage');

    if (!order || !text) {
        messageDiv.textContent = '❌ Preencha a ordem e o texto!';
        messageDiv.className = 'clue-message error';
        return;
    }

    if (allQuestions.some(q => q.order === order)) {
        messageDiv.textContent = '❌ Esta ordem já está em uso!';
        messageDiv.className = 'clue-message error';
        return;
    }

    let questionData = {
        id: 'Q' + String(order).padStart(3, '0'),
        order: order,
        type: type,
        text: text,
        hint: hint || '',
        createdAt: Date.now()
    };

    if (type === 'multipla') {
        // Pegar alternativas
        const altInputs = document.querySelectorAll('.alt-input');
        const alternatives = [];
        altInputs.forEach(input => {
            const value = input.value.trim();
            if (value) alternatives.push(value);
        });

        // Pegar alternativa correta
        const correctRadio = document.querySelector('input[name="correctAnswer"]:checked');
        const correctAnswer = correctRadio ? correctRadio.value : null;

        if (alternatives.length < 2) {
            messageDiv.textContent = '❌ Adicione pelo menos 2 alternativas!';
            messageDiv.className = 'clue-message error';
            return;
        }

        if (!correctAnswer) {
            messageDiv.textContent = '❌ Selecione a alternativa correta!';
            messageDiv.className = 'clue-message error';
            return;
        }

        questionData.alternatives = alternatives;
        questionData.correctAnswer = correctAnswer;
        questionData.answer = alternatives[['A', 'B', 'C', 'D'].indexOf(correctAnswer)];

    } else {
        // Charada ou Descritiva
        const answer = document.getElementById('newQuestionAnswer').value.trim();
        if (!answer) {
            messageDiv.textContent = '❌ Digite a resposta correta!';
            messageDiv.className = 'clue-message error';
            return;
        }
        questionData.answer = answer;
    }

    database.ref('questions/' + questionData.id).set(questionData)
        .then(() => {
            messageDiv.textContent = '✅ Pista/Pergunta adicionada com sucesso!';
            messageDiv.className = 'clue-message success';
            
            // Limpar formulário
            document.getElementById('newQuestionOrder').value = '';
            document.getElementById('newQuestionText').value = '';
            document.getElementById('newQuestionHint').value = '';
            document.getElementById('newQuestionAnswer').value = '';
            document.querySelectorAll('.alt-input').forEach(input => input.value = '');
            document.querySelectorAll('input[name="correctAnswer"]').forEach(radio => radio.checked = false);
            
            loadAdminData();
        })
        .catch((error) => {
            messageDiv.textContent = '❌ Erro: ' + error.message;
            messageDiv.className = 'clue-message error';
        });
}

function deleteQuestion(questionId) {
    if (!confirm(`⚠️ Excluir esta pista/pergunta?`)) return;

    database.ref('questions/' + questionId).remove()
        .then(() => {
            showToast('🗑️ Removido!', 'success');
            loadAdminData();
        })
        .catch((error) => {
            showToast('❌ Erro: ' + error.message, 'error');
        });
}

// ============ RENDERIZAR LISTAS ============
function renderGroupsListAdmin() {
    const container = document.getElementById('groupsListAdmin');
    
    if (allGroups.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">👥</div>
                <p>Nenhum grupo criado ainda</p>
            </div>
        `;
        return;
    }

    container.innerHTML = allGroups.map(group => {
        let statusClass = 'waiting';
        let statusText = '📖 Aguardando';
        if (group.completed) {
            statusClass = 'winner';
            statusText = '🏆 Finalizado';
        } else if (group.started) {
            statusClass = 'playing';
            statusText = '🏃 Jogando';
        }
        
        return `
            <div class="group-card-admin">
                <div class="group-info">
                    <strong>${group.name}</strong>
                    <div style="margin-top: 5px;">
                        ${group.members.map(m => `<span class="member-tag">${m}</span>`).join(' ')}
                    </div>
                    <div style="margin-top: 5px;">
                        <span class="group-status ${statusClass}">${statusText}</span>
                        ${group.completed ? ` ⏱️ ${formatTime(group.finalTime || 0)}` : ''}
                        ${group.currentQuestion ? ` 📝 ${group.currentQuestion}/${allQuestions.length}` : ''}
                    </div>
                </div>
                <button onclick="deleteGroup('${group.name}')" class="btn-small btn-delete">🗑️</button>
            </div>
        `;
    }).join('');
}

function renderQuestionsList() {
    const container = document.getElementById('questionsListAdmin');
    
    if (allQuestions.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">📝</div>
                <p>Nenhuma pista ou pergunta cadastrada</p>
            </div>
        `;
        return;
    }

    const typeLabels = {
        'charada': '🔍 Charada',
        'descritiva': '📝 Descritiva',
        'multipla': '📝 Múltipla Escolha'
    };

    const letters = ['A', 'B', 'C', 'D'];

    container.innerHTML = allQuestions.map(q => {
        let answerHtml = '';
        
        if (q.type === 'multipla') {
            answerHtml = `
                <div class="alternatives-list">
                    ${q.alternatives.map((alt, index) => `
                        <div class="alternative-item ${q.correctAnswer === letters[index] ? 'correct' : ''}">
                            <span class="alt-letter">${letters[index]})</span>
                            ${alt}
                            ${q.correctAnswer === letters[index] ? ' ✅' : ''}
                        </div>
                    `).join('')}
                </div>
            `;
        } else {
            answerHtml = `
                <div class="question-answer">✅ Resposta: ${q.answer}</div>
            `;
        }

        return `
            <div class="question-card">
                <div class="question-header">
                    <div class="question-badge">
                        <span class="question-order">#${q.order}</span>
                        <span class="question-type">${typeLabels[q.type] || q.type}</span>
                        <span style="color:#666;font-size:0.9em;">${q.id}</span>
                    </div>
                    <button onclick="deleteQuestion('${q.id}')" class="btn-small btn-delete">🗑️</button>
                </div>
                <div class="question-text">${q.text}</div>
                ${q.hint ? `<div style="color:#666;font-size:0.9em;margin-bottom:10px;">💡 Dica: ${q.hint}</div>` : ''}
                ${answerHtml}
            </div>
        `;
    }).join('');
}

function renderGroupsListRanking() {
    const container = document.getElementById('groupsList');
    
    if (allGroups.length === 0) {
        container.innerHTML = '<p class="empty-message">Nenhum grupo ativo...</p>';
        return;
    }

    const sortedGroups = [...allGroups].sort((a, b) => {
        if (a.completed && !b.completed) return -1;
        if (!a.completed && b.completed) return 1;
        if (a.completed && b.completed) return (a.finalTime || 0) - (b.finalTime || 0);
        return (a.currentQuestion || 0) - (b.currentQuestion || 0);
    });

    container.innerHTML = sortedGroups.map((group, index) => {
        const progress = allQuestions.length > 0 ? Math.round(((group.currentQuestion || 0) / allQuestions.length) * 100) : 0;
        
        let statusBadge = '';
        if (group.completed) {
            statusBadge = '<span style="background:#27ae60;padding:4px 12px;border-radius:12px;color:white;font-size:0.8em;font-weight:bold;">🏆 Venceu!</span>';
        } else if (group.started) {
            statusBadge = '<span style="background:#3498db;padding:4px 12px;border-radius:12px;color:white;font-size:0.8em;font-weight:bold;">🏃 Jogando</span>';
        } else {
            statusBadge = '<span style="background:#95a5a6;padding:4px 12px;border-radius:12px;color:white;font-size:0.8em;font-weight:bold;">📖 Aguardando</span>';
        }
        
        return `
            <div class="group-card ${group.completed ? 'winner' : ''}" style="${group.completed ? 'border:2px solid #27ae60;' : 'border-left:4px solid #3498db;'}padding:15px;margin-bottom:10px;background:white;border-radius:10px;">
                <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;">
                    <div style="display:flex;align-items:center;gap:15px;">
                        <span style="font-size:1.5em;font-weight:bold;color:#f39c12;">#${index + 1}</span>
                        <div>
                            <h4 style="margin:0;">👥 ${group.name}</h4>
                            <div style="font-size:0.85em;color:#666;">👤 ${group.members ? group.members.join(', ') : 'N/A'}</div>
                        </div>
                    </div>
                    <div style="display:flex;align-items:center;gap:15px;flex-wrap:wrap;">
                        <div style="min-width:100px;">
                            <div style="background:#e9ecef;border-radius:10px;height:8px;overflow:hidden;">
                                <div style="width:${progress}%;height:100%;background:${group.completed ? 'linear-gradient(90deg,#27ae60,#2ecc71)' : 'linear-gradient(90deg,#f39c12,#e67e22)'};transition:width 0.5s;"></div>
                            </div>
                            <div style="font-size:0.8em;color:#666;text-align:center;margin-top:3px;">
                                ${group.currentQuestion || 0}/${allQuestions.length} (${progress}%)
                            </div>
                        </div>
                        <div>${statusBadge}</div>
                        ${group.completed ? `<span style="background:#f8f9fa;padding:3px 10px;border-radius:8px;">⏱️ ${formatTime(group.finalTime || 0)}</span>` : ''}
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// ============ ESTATÍSTICAS ============
function updateStats() {
    document.getElementById('totalGroups').textContent = allGroups.length;
    document.getElementById('totalQuestions').textContent = allQuestions.length;
    
    const activeGroups = allGroups.filter(g => !g.completed && g.started);
    document.getElementById('activeGroups').textContent = activeGroups.length;
    
    const winners = allGroups.filter(g => g.completed);
    document.getElementById('winnerGroups').textContent = winners.length;
}

// ============ CONTROLES RÁPIDOS ============
function resetAllGames() {
    if (!confirm('⚠️ Resetar TODOS os jogos?')) return;
    if (!confirm('🔄 Última chance!')) return;
    
    database.ref('groups').remove()
        .then(() => {
            showToast('🔄 Todos resetados!', 'success');
            loadAdminData();
        })
        .catch((error) => {
            showToast('❌ Erro: ' + error.message, 'error');
        });
}

function exportData() {
    const data = {
        groups: allGroups,
        questions: allQuestions,
        exportedAt: new Date().toISOString()
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `detetives-data-${new Date().toLocaleDateString('pt-BR')}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('📥 Dados exportados!', 'success');
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
                
                data.questions.forEach(q => {
                    database.ref('questions/' + q.id).set(q);
                });
                
                data.groups.forEach(g => {
                    database.ref('groups/' + g.name).set(g);
                });
                
                showToast(`📤 Importado! (${data.questions.length} perguntas, ${data.groups.length} grupos)`, 'success');
                loadAdminData();
            } catch (error) {
                showToast('❌ Erro: ' + error.message, 'error');
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
    document.querySelectorAll('.toast').forEach(t => t.remove());
    
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    toast.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 15px 25px;
        border-radius: 10px;
        color: white;
        font-weight: bold;
        z-index: 1000;
        transform: translateX(120%);
        transition: transform 0.5s ease;
        box-shadow: 0 5px 20px rgba(0,0,0,0.2);
        max-width: 400px;
        background: ${type === 'success' ? 'linear-gradient(135deg, #27ae60, #2ecc71)' : 'linear-gradient(135deg, #e74c3c, #c0392b)'};
    `;
    
    document.body.appendChild(toast);
    setTimeout(() => toast.style.transform = 'translateX(0)', 100);
    setTimeout(() => {
        toast.style.transform = 'translateX(120%)';
        setTimeout(() => toast.remove(), 500);
    }, 3000);
}

function switchScreen(screenId) {
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.remove('active');
    });
    document.getElementById(screenId).classList.add('active');
}

// ============ INICIALIZAÇÃO ============
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('adminPassword').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') adminLogin();
    });
    toggleQuestionType();
});

// ============ EXPORTAR ============
window.adminLogin = adminLogin;
window.adminLogout = adminLogout;
window.switchTab = switchTab;
window.toggleQuestionType = toggleQuestionType;
window.addGroup = addGroup;
window.deleteGroup = deleteGroup;
window.addQuestion = addQuestion;
window.deleteQuestion = deleteQuestion;
window.resetAllGames = resetAllGames;
window.exportData = exportData;
window.importData = importData;