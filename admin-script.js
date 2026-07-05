const ADMIN_PASSWORD = 'admin123';
let allGroups = [];
let allQuestions = [];

function adminLogin() {
    const password = document.getElementById('adminPassword').value;
    if (password === ADMIN_PASSWORD) {
        document.getElementById('adminError').textContent = '';
        switchScreen('adminDashboard');
        loadAdminData();
        switchTab('ranking');
    } else {
        document.getElementById('adminError').textContent = '❌ Senha incorreta!';
    }
}

function adminLogout() {
    switchScreen('adminLogin');
    document.getElementById('adminPassword').value = '';
}

function switchTab(tab) {
    document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    
    const tabs = { 'ranking': { index: 0, id: 'tabRanking' }, 'questions': { index: 1, id: 'tabQuestions' } };
    document.querySelectorAll('.admin-tab')[tabs[tab].index].classList.add('active');
    document.getElementById(tabs[tab].id).classList.add('active');
}

function loadAdminData() {
    database.ref('groups').on('value', (snapshot) => {
        allGroups = snapshot.exists() ? Object.keys(snapshot.val()).map(k => ({ name: k, ...snapshot.val()[k] })) : [];
        renderGroupsListRanking();
        updateStats();
    });

    database.ref('questions').on('value', (snapshot) => {
        allQuestions = snapshot.exists() ? Object.values(snapshot.val()).sort((a, b) => (a.order || 0) - (b.order || 0)) : [];
        renderQuestionsList();
        updateStats();
    });
}

function addQuestion() {
    const order = parseInt(document.getElementById('newQuestionOrder').value);
    const answer = document.getElementById('newQuestionAnswer').value.trim();
    const location = document.getElementById('newQuestionLocation').value.trim();
    const challenge = document.getElementById('newQuestionChallenge').value.trim();
    const hint = document.getElementById('newQuestionHint').value.trim();
    const msg = document.getElementById('addQuestionMessage');

    if (!order || !answer || !location) {
        msg.textContent = '❌ Ordem, Local e Senha são obrigatórios!';
        msg.className = 'clue-message error';
        return;
    }

    if (allQuestions.some(q => q.order === order)) {
        msg.textContent = '❌ Esta ordem já existe!';
        msg.className = 'clue-message error';
        return;
    }

    const questionData = {
        id: 'Q' + String(order).padStart(3, '0'),
        order: order,
        location: location,
        challenge: challenge || 'Resolva a conta do papel:',
        answer: answer,
        hint: hint,
        createdAt: Date.now()
    };

    database.ref('questions/' + questionData.id).set(questionData).then(() => {
        msg.textContent = '✅ Etapa cadastrada com sucesso!';
        msg.className = 'clue-message success';
        document.querySelectorAll('.question-form input, .question-form textarea').forEach(el => el.value = '');
    });
}

function deleteQuestion(id) {
    if (confirm('⚠️ Deseja excluir esta etapa do jogo?')) database.ref('questions/' + id).remove();
}

function renderQuestionsList() {
    const container = document.getElementById('questionsListAdmin');
    if (allQuestions.length === 0) return container.innerHTML = '<p class="empty-message">Nenhuma etapa cadastrada.</p>';

    container.innerHTML = allQuestions.map(q => `
        <div class="question-card">
            <div class="question-header">
                <span class="question-badge">Etapa #${q.order}</span>
                <button onclick="deleteQuestion('${q.id}')" class="btn-small btn-delete">🗑️ Excluir</button>
            </div>
            <div style="margin: 10px 0; color: #1a1a2e; background: #f8f9fa; padding: 10px; border-radius: 8px;">
                <strong>📍 Onde esconder o papel:</strong><br> ${q.location}
            </div>
            <div style="margin: 10px 0; color: #1a1a2e;">
                <strong>🧮 Missão do papel:</strong> ${q.challenge}
            </div>
            <div style="margin: 10px 0; color: #155724; background: #d4edda; padding: 10px; border-radius: 8px; border: 1px solid #c3e6cb;">
                <strong>🔐 Senha/Resultado:</strong> ${q.answer}
            </div>
        </div>
    `).join('');
}

function renderGroupsListRanking() {
    const container = document.getElementById('groupsList');
    if (allGroups.length === 0) return container.innerHTML = '<p class="empty-message">Nenhum grupo ativo...</p>';

    const sortedGroups = [...allGroups].sort((a, b) => {
        if (a.completed && !b.completed) return -1;
        if (!a.completed && b.completed) return 1;
        if (a.completed && b.completed) return (a.finalTime || 0) - (b.finalTime || 0);
        return (b.currentQuestion || 0) - (a.currentQuestion || 0);
    });

    container.innerHTML = sortedGroups.map((g, i) => {
        const prog = allQuestions.length > 0 ? Math.round(((g.currentQuestion || 0) / allQuestions.length) * 100) : 0;
        let badge = g.completed ? '<span style="background:#27ae60;padding:4px 12px;border-radius:12px;color:white;font-size:0.8em;font-weight:bold;">🏆 Venceu!</span>' : 
                   (g.started ? '<span style="background:#3498db;padding:4px 12px;border-radius:12px;color:white;font-size:0.8em;font-weight:bold;">🏃 Na Caçada</span>' : 
                                '<span style="background:#95a5a6;padding:4px 12px;border-radius:12px;color:white;font-size:0.8em;font-weight:bold;">📖 Na Base</span>');
        
        return `
            <div class="group-card-admin" style="display: block; ${g.completed ? 'border-color: #27ae60;' : ''}">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                    <div><span style="font-size:1.5em; font-weight:bold; color:#f39c12; margin-right: 10px;">#${i + 1}</span><strong>${g.name}</strong></div>
                    <div>${badge}</div>
                </div>
                <div style="background:#e9ecef; border-radius:10px; height:8px; margin-bottom: 5px;">
                    <div style="width:${prog}%; height:100%; background:${g.completed ? '#27ae60' : '#f39c12'}; border-radius:10px; transition: width 0.5s;"></div>
                </div>
                <div style="display: flex; justify-content: space-between; font-size: 0.9em; color: #666;">
                    <span>Etapa ${g.currentQuestion || 0}/${allQuestions.length}</span>
                    <span>⏱️ ${Math.floor((g.time || 0) / 60).toString().padStart(2, '0')}:${((g.time || 0) % 60).toString().padStart(2, '0')}</span>
                </div>
                <div style="margin-top: 10px; font-size: 0.85em; color: #999;">👤 ${g.members.join(', ')}</div>
            </div>
        `;
    }).join('');
}

function updateStats() {
    document.getElementById('totalGroups').textContent = allGroups.length;
    document.getElementById('totalQuestions').textContent = allQuestions.length;
    document.getElementById('activeGroups').textContent = allGroups.filter(g => !g.completed && g.started).length;
    document.getElementById('winnerGroups').textContent = allGroups.filter(g => g.completed).length;
}

function resetAllGames() {
    if (confirm('⚠️ ATENÇÃO: Deseja apagar todos os grupos da tela do professor e começar uma nova sessão?')) {
        database.ref('groups').remove();
    }
}

function switchScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(id).classList.add('active');
}

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('adminPassword').addEventListener('keypress', (e) => { if (e.key === 'Enter') adminLogin(); });
});

window.adminLogin = adminLogin; window.adminLogout = adminLogout; window.switchTab = switchTab;
window.addQuestion = addQuestion; window.deleteQuestion = deleteQuestion; window.resetAllGames = resetAllGames;