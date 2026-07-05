const ADMIN_PASSWORD = 'admin123';
let allGroups = [];
let allQuestions = [];
let editingId = null; // 🔥 Variável para controlar se estamos editando ou criando

// ============ LOGIN ============
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
    database.ref('groups').off();
    database.ref('questions').off();
    switchScreen('adminLogin');
    document.getElementById('adminPassword').value = '';
}

// ============ TABS ============
function switchTab(tab) {
    document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    
    const tabs = { 
        'ranking': { index: 0, id: 'tabRanking' }, 
        'analytics': { index: 1, id: 'tabAnalytics' },
        'questions': { index: 2, id: 'tabQuestions' } 
    };
    document.querySelectorAll('.admin-tab')[tabs[tab].index].classList.add('active');
    document.getElementById(tabs[tab].id).classList.add('active');
}

// ============ ALTERNAR TIPO ============
function toggleQuestionType() {
    const type = document.getElementById('newQuestionType').value;
    document.getElementById('answerField').style.display = type === 'multipla' ? 'none' : 'block';
    document.getElementById('alternativesField').style.display = type === 'multipla' ? 'block' : 'none';
}

// ============ CARREGAR DADOS EM TEMPO REAL ============
function loadAdminData() {
    database.ref('groups').on('value', (snapshot) => {
        if (snapshot.exists()) {
            const data = snapshot.val();
            allGroups = Object.keys(data).map(k => ({ 
                name: k, 
                ...data[k] 
            }));
        } else {
            allGroups = [];
        }
        renderGroupsListRanking();
        renderQuestionAnalytics();
        updateStats();
    });

    database.ref('questions').on('value', (snapshot) => {
        if (snapshot.exists()) {
            const data = snapshot.val();
            allQuestions = Object.values(data).sort((a, b) => (a.order || 0) - (b.order || 0));
        } else {
            allQuestions = [];
        }
        renderQuestionsList();
        renderQuestionAnalytics();
        updateStats();
    });
}

// ============ ADICIONAR / EDITAR QUESTÃO ============
function addQuestion() {
    const order = parseInt(document.getElementById('newQuestionOrder').value);
    const type = document.getElementById('newQuestionType').value;
    const location = document.getElementById('newQuestionLocation').value.trim();
    const challenge = document.getElementById('newQuestionChallenge').value.trim();
    const hint = document.getElementById('newQuestionHint').value.trim();
    const msg = document.getElementById('addQuestionMessage');

    if (!order || !location) {
        msg.textContent = '❌ Ordem e Local são obrigatórios!';
        msg.className = 'clue-message error';
        return;
    }

    // Verifica se a ordem já existe, ignorando a própria pergunta se estiver editando
    const existingWithOrder = allQuestions.find(q => q.order === order);
    if (existingWithOrder && existingWithOrder.id !== editingId) {
        msg.textContent = '❌ Esta ordem já existe!';
        msg.className = 'clue-message error';
        return;
    }

    // Mantém o ID se estiver editando, cria um novo se for cadastro
    let targetId = editingId ? editingId : ('Q' + String(order).padStart(3, '0'));

    let questionData = {
        id: targetId,
        order: order,
        type: type,
        location: location,
        challenge: challenge || 'Resolva o desafio da pista!',
        hint: hint || '',
        createdAt: editingId ? (allQuestions.find(x => x.id === editingId)?.createdAt || Date.now()) : Date.now()
    };

    if (type === 'multipla') {
        const altInputs = document.querySelectorAll('.alt-input');
        const alternatives = [];
        altInputs.forEach(input => {
            const value = input.value.trim();
            if (value) alternatives.push(value);
        });

        const correctRadio = document.querySelector('input[name="correctAnswer"]:checked');
        const correctAnswer = correctRadio ? correctRadio.value : null;

        if (alternatives.length < 2) {
            msg.textContent = '❌ Adicione pelo menos 2 alternativas!';
            msg.className = 'clue-message error';
            return;
        }

        if (!correctAnswer) {
            msg.textContent = '❌ Selecione a alternativa correta!';
            msg.className = 'clue-message error';
            return;
        }

        const letters = ['A', 'B', 'C', 'D'];
        questionData.alternatives = alternatives;
        questionData.correctAnswer = correctAnswer;
        questionData.answer = alternatives[letters.indexOf(correctAnswer)];

    } else {
        const answer = document.getElementById('newQuestionAnswer').value.trim();
        if (!answer) {
            msg.textContent = '❌ Digite a resposta correta!';
            msg.className = 'clue-message error';
            return;
        }
        questionData.answer = answer.toLowerCase().trim();
    }

    database.ref('questions/' + targetId).set(questionData).then(() => {
        msg.textContent = editingId ? '✅ Etapa atualizada com sucesso!' : '✅ Etapa cadastrada com sucesso!';
        msg.className = 'clue-message success';
        resetQuestionForm();
        loadAdminData();
    }).catch(err => {
        msg.textContent = '❌ Erro: ' + err.message;
        msg.className = 'clue-message error';
    });
}

// ============ PREPARAR PARA EDIÇÃO ============
function editQuestion(id) {
    const q = allQuestions.find(x => x.id === id);
    if (!q) return;
    
    editingId = id;
    
    // Preencher campos
    document.getElementById('newQuestionOrder').value = q.order;
    document.getElementById('newQuestionType').value = q.type;
    document.getElementById('newQuestionLocation').value = q.location;
    document.getElementById('newQuestionChallenge').value = q.challenge;
    document.getElementById('newQuestionHint').value = q.hint || '';
    
    toggleQuestionType();
    
    if (q.type === 'multipla') {
        const altInputs = document.querySelectorAll('.alt-input');
        const radios = document.querySelectorAll('input[name="correctAnswer"]');
        const letters = ['A', 'B', 'C', 'D'];
        
        altInputs.forEach((input, i) => {
            input.value = q.alternatives[i] || '';
            radios[i].checked = (q.correctAnswer === letters[i]);
        });
    } else {
        document.getElementById('newQuestionAnswer').value = q.answer;
    }
    
    toggleEditMode(true);
    document.getElementById('tabQuestions').scrollIntoView({ behavior: 'smooth' });
}

// ============ RESETAR FORMULÁRIO ============
function resetQuestionForm() {
    editingId = null;
    document.querySelectorAll('.question-form input, .question-form textarea').forEach(el => el.value = '');
    document.querySelectorAll('input[name="correctAnswer"]').forEach(r => r.checked = false);
    
    const msg = document.getElementById('addQuestionMessage');
    if(msg.textContent.includes('Erro') || msg.textContent.includes('obrigatório')) {
        msg.textContent = '';
        msg.className = 'clue-message';
    }
    
    toggleQuestionType();
    toggleEditMode(false);
}

// ============ ALTERAR VISUAL DO BOTÃO DE CADASTRO ============
function toggleEditMode(isEditing) {
    const submitBtn = document.querySelector('button[onclick="addQuestion()"]');
    let cancelBtn = document.getElementById('btnCancelEdit');
    
    // Cria o botão de cancelar dinamicamente se não existir
    if (!cancelBtn && submitBtn) {
        cancelBtn = document.createElement('button');
        cancelBtn.id = 'btnCancelEdit';
        cancelBtn.className = 'btn-outline';
        cancelBtn.style = 'margin-top: 15px; margin-left: 10px;';
        cancelBtn.innerHTML = '❌ Cancelar Edição';
        cancelBtn.onclick = resetQuestionForm;
        submitBtn.parentNode.insertBefore(cancelBtn, submitBtn.nextSibling);
    }

    if (isEditing) {
        if(submitBtn) {
            submitBtn.innerHTML = '💾 Salvar Alterações';
            submitBtn.style.backgroundColor = '#27ae60'; // Verde para salvar
        }
        if(cancelBtn) cancelBtn.style.display = 'inline-block';
    } else {
        if(submitBtn) {
            submitBtn.innerHTML = '➕ Cadastrar Missão';
            submitBtn.style.backgroundColor = ''; // Restaura a cor padrão
        }
        if(cancelBtn) cancelBtn.style.display = 'none';
    }
}

// ============ DELETAR ============
function deleteQuestion(id) {
    if (confirm('⚠️ Deseja excluir esta etapa do jogo?')) {
        database.ref('questions/' + id).remove().then(() => {
            loadAdminData();
            if(editingId === id) resetQuestionForm(); // Limpa form se deletou a que estava editando
        });
    }
}

// ============ RENDERIZAR LISTA DE QUESTÕES ============
function renderQuestionsList() {
    const container = document.getElementById('questionsListAdmin');
    if (!container) return;
    
    if (allQuestions.length === 0) {
        container.innerHTML = '<p class="empty-message">📭 Nenhuma etapa cadastrada ainda. Crie uma missão acima!</p>';
        return;
    }

    const typeLabels = {
        'descritiva': '📝 Descritiva',
        'multipla': '🎯 Múltipla Escolha'
    };

    container.innerHTML = allQuestions.map(q => {
        let answerHtml = '';
        const letters = ['A', 'B', 'C', 'D'];

        if (q.type === 'multipla') {
            answerHtml = `
                <div style="margin: 10px 0; background: #f0f7ff; padding: 15px; border-radius: 10px; border: 1px solid #b8d4f0;">
                    <strong style="color: #1a5276;">📝 PERGUNTA DO DESAFIO (O que está NA PISTA FÍSICA):</strong>
                    <div style="margin: 10px 0; font-size: 1.2em; color: #1a1a2e; padding: 12px; background: white; border-radius: 8px; border: 2px solid #3498db;">
                        ${q.challenge}
                    </div>
                    <strong>🔘 Alternativas:</strong>
                    ${q.alternatives.map((alt, i) => `
                        <div style="padding: 8px 12px; margin: 5px 0; border-radius: 8px; ${q.correctAnswer === letters[i] ? 'background: #d4edda; border-left: 5px solid #27ae60; font-weight: bold;' : 'background: #f8f9fa; border-left: 5px solid #ddd;'}">
                            <span style="font-weight: bold; color: #1a5276;">${letters[i]})</span> ${alt} 
                            ${q.correctAnswer === letters[i] ? '✅ <span style="color:#27ae60;font-weight:bold;">CORRETA</span>' : ''}
                        </div>
                    `).join('')}
                </div>
            `;
        } else {
            answerHtml = `
                <div style="margin: 10px 0; background: #f0f7ff; padding: 15px; border-radius: 10px; border: 1px solid #b8d4f0;">
                    <strong style="color: #1a5276;">📝 PERGUNTA DO DESAFIO (O que está NA PISTA FÍSICA):</strong>
                    <div style="margin: 10px 0; font-size: 1.2em; color: #1a1a2e; padding: 12px; background: white; border-radius: 8px; border: 2px solid #3498db;">
                        ${q.challenge}
                    </div>
                    <div style="color: #155724; background: #d4edda; padding: 12px; border-radius: 8px; border: 2px solid #27ae60;">
                        <strong>✅ RESPOSTA CORRETA:</strong> ${q.answer}
                    </div>
                </div>
            `;
        }

        // 🔥 Botão Editar adicionado aqui!
        return `
            <div class="question-card">
                <div class="question-header" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
                    <div>
                        <span class="question-badge">Etapa #${q.order}</span>
                        <span style="background: ${q.type === 'multipla' ? '#3498db' : '#27ae60'}; color: white; padding: 3px 14px; border-radius: 20px; font-size: 0.8em; font-weight: bold;">
                            ${typeLabels[q.type] || q.type}
                        </span>
                    </div>
                    <div style="display: flex; gap: 8px;">
                        <button onclick="editQuestion('${q.id}')" class="btn-small btn-primary" style="background: #f39c12; border: none; cursor: pointer;">✏️ Editar</button>
                        <button onclick="deleteQuestion('${q.id}')" class="btn-small btn-delete">🗑️ Excluir</button>
                    </div>
                </div>
                
                <div style="margin: 10px 0; background: #fff8e1; padding: 12px; border-radius: 8px; border-left: 5px solid #f39c12;">
                    <strong>📍 PISTA (O que o aluno VÊ no celular):</strong><br> 
                    <span style="font-size: 1.05em;">${q.location}</span>
                </div>
                
                ${answerHtml}
                
                ${q.hint ? `<div style="margin: 10px 0; color: #856404; background: #fff3cd; padding: 10px 14px; border-radius: 8px; border-left: 5px solid #f39c12;">💡 DICA DO PROFESSOR: ${q.hint}</div>` : ''}
                
                <div style="margin-top: 8px; font-size: 0.85em; color: #999; background: #f8f9fa; padding: 6px 12px; border-radius: 6px;">
                    🆔 ID: ${q.id}
                </div>
            </div>
        `;
    }).join('');
}

// ============ RENDERIZAR GRUPOS EM TEMPO REAL ============
function renderGroupsListRanking() {
    const container = document.getElementById('groupsList');
    if (!container) return;
    
    if (allGroups.length === 0) {
        container.innerHTML = '<p class="empty-message">👀 Nenhum grupo correndo pela escola no momento...</p>';
        return;
    }

    const sortedGroups = [...allGroups].sort((a, b) => {
        if (a.completed && !b.completed) return -1;
        if (!a.completed && b.completed) return 1;
        if (a.completed && b.completed) return (a.finalTime || 0) - (b.finalTime || 0);
        return (b.currentQuestion || 0) - (a.currentQuestion || 0);
    });

    container.innerHTML = sortedGroups.map((g, i) => {
        const prog = allQuestions.length > 0 ? Math.round(((g.currentQuestion || 0) / allQuestions.length) * 100) : 0;
        
        let badge = '';
        if (g.completed) {
            badge = '<span style="background:#27ae60;padding:4px 14px;border-radius:20px;color:white;font-size:0.8em;font-weight:bold;">🏆 Venceu!</span>';
        } else if (g.started) {
            badge = '<span style="background:#3498db;padding:4px 14px;border-radius:20px;color:white;font-size:0.8em;font-weight:bold;">🏃 Na Caçada</span>';
        } else {
            badge = '<span style="background:#95a5a6;padding:4px 14px;border-radius:20px;color:white;font-size:0.8em;font-weight:bold;">📖 Na Base</span>';
        }
        
        const timeSeconds = g.time || 0;
        const minutes = Math.floor(timeSeconds / 60).toString().padStart(2, '0');
        const seconds = (timeSeconds % 60).toString().padStart(2, '0');
        
        return `
            <div class="group-card-admin" style="display: block; ${g.completed ? 'border-color: #27ae60; background: #f0faf0;' : ''}">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; flex-wrap: wrap; gap: 10px;">
                    <div>
                        <span style="font-size:1.5em; font-weight:bold; color:#f39c12; margin-right: 10px;">#${i + 1}</span>
                        <strong style="font-size: 1.1em;">${g.name}</strong>
                    </div>
                    <div>${badge}</div>
                </div>
                <div style="background:#e9ecef; border-radius:10px; height:10px; margin-bottom: 8px; overflow: hidden;">
                    <div style="width:${prog}%; height:100%; background:${g.completed ? '#27ae60' : '#f39c12'}; border-radius:10px; transition: width 0.5s ease;"></div>
                </div>
                <div style="display: flex; justify-content: space-between; font-size: 0.9em; color: #555; flex-wrap: wrap; gap: 5px;">
                    <span>📌 Etapa ${g.currentQuestion || 0}/${allQuestions.length}</span>
                    <span>⏱️ ${minutes}:${seconds}</span>
                    <span>❌ Erros: ${g.errors || 0}</span>
                    <span>💡 Dicas: ${g.hintsUsed || 0}/3</span>
                </div>
                <div style="margin-top: 8px; font-size: 0.85em; color: #888;">👤 ${g.members ? g.members.join(', ') : 'Sem membros'}</div>
                ${g.completed ? `<div style="margin-top: 5px; color: #27ae60; font-weight: bold;">🏆 COMPLETOU A CAÇADA!</div>` : ''}
            </div>
        `;
    }).join('');
}

// ============ ANÁLISE DE APRENDIZAGEM ============
function computeQuestionAnalytics() {
    return allQuestions.map(q => {
        const statsEntries = allGroups
            .map(g => ({ group: g.name, stat: g.questionStats && g.questionStats[q.id] }))
            .filter(e => e.stat);

        const totalAttempts = statsEntries.length;
        const totalErrors = statsEntries.reduce((sum, e) => sum + (e.stat.errors || 0), 0);
        const avgErrors = totalAttempts > 0 ? totalErrors / totalAttempts : 0;

        let fastest = null, slowest = null, totalTime = 0;
        statsEntries.forEach(e => {
            const t = e.stat.timeSpent || 0;
            totalTime += t;
            if (!fastest || t < fastest.time) fastest = { time: t, group: e.group };
            if (!slowest || t > slowest.time) slowest = { time: t, group: e.group };
        });
        const avgTime = totalAttempts > 0 ? totalTime / totalAttempts : 0;

        return { question: q, totalAttempts, totalErrors, avgErrors, avgTime, fastest, slowest };
    });
}

function formatMMSS(totalSeconds) {
    const s = Math.round(totalSeconds || 0);
    const m = Math.floor(s / 60).toString().padStart(2, '0');
    const sec = (s % 60).toString().padStart(2, '0');
    return `${m}:${sec}`;
}

function renderQuestionAnalytics() {
    const hardestContainer = document.getElementById('hardestStagesList');
    const detailContainer = document.getElementById('questionAnalyticsList');
    if (!hardestContainer || !detailContainer) return;

    if (allQuestions.length === 0) {
        hardestContainer.innerHTML = '<p class="empty-message">📭 Cadastre etapas para ver a análise.</p>';
        detailContainer.innerHTML = '<p class="empty-message">📭 Cadastre etapas para ver a análise.</p>';
        return;
    }

    const analytics = computeQuestionAnalytics();
    const withData = analytics.filter(a => a.totalAttempts > 0);

    if (withData.length === 0) {
        hardestContainer.innerHTML = '<p class="empty-message">📭 Ainda não há dados suficientes. Assim que os grupos começarem a jogar, o ranking aparece aqui.</p>';
        detailContainer.innerHTML = '<p class="empty-message">📭 Nenhum dado registrado ainda.</p>';
        return;
    }

    const ranked = withData.filter(a => a.totalErrors > 0).sort((a, b) => b.totalErrors - a.totalErrors);

    if (ranked.length === 0) {
        hardestContainer.innerHTML = '<p class="empty-message">🎉 Nenhum erro registrado até agora — os grupos estão mandando bem!</p>';
    } else {
        const medalColors = ['#a8362a', '#b3862f', '#8f6a22'];
        hardestContainer.innerHTML = ranked.slice(0, 10).map((a, i) => {
            const color = i < 3 ? medalColors[i] : '#6b5730';
            const locationPreview = (a.question.location || '').slice(0, 70) + ((a.question.location || '').length > 70 ? '…' : '');
            return `
                <div style="display:flex; justify-content:space-between; align-items:center; gap: 10px; padding: 12px 16px; margin-bottom: 8px; background:#fffdf7; border-radius: 8px; border-left: 5px solid ${color};">
                    <div>
                        <strong style="color:#1b2436;">#${i + 1} — Etapa ${a.question.order}</strong>
                        <div style="font-size:0.85em; color:#6b5730; margin-top:2px;">${locationPreview}</div>
                    </div>
                    <div style="text-align:right; white-space: nowrap;">
                        <div style="font-weight:800; color:${color};">${a.totalErrors} erro${a.totalErrors === 1 ? '' : 's'}</div>
                        <div style="font-size:0.8em; color:#6b5730;">${a.avgErrors.toFixed(1)} por grupo</div>
                    </div>
                </div>
            `;
        }).join('');
    }

    detailContainer.innerHTML = withData
        .sort((a, b) => (a.question.order || 0) - (b.question.order || 0))
        .map(a => `
            <div class="question-card">
                <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; margin-bottom: 10px;">
                    <span class="question-badge">Etapa #${a.question.order}</span>
                    <span style="font-size:0.85em; color:#6b5730; font-weight:700;">${a.totalAttempts} grupo${a.totalAttempts === 1 ? '' : 's'} concluíram</span>
                </div>
                <div style="font-size:0.95em; color:#1b2436; margin-bottom: 12px;">📍 ${a.question.location}</div>
                <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(150px,1fr)); gap: 10px;">
                    <div style="background:#f7e2df; padding: 10px 14px; border-radius: 8px;">
                        <div style="font-size:0.78em; color:#a8362a; font-weight:800; text-transform:uppercase;">❌ Total de Erros</div>
                        <div style="font-size:1.3em; font-weight:800; color:#a8362a;">${a.totalErrors}</div>
                    </div>
                    <div style="background:#f2e8d3; padding: 10px 14px; border-radius: 8px;">
                        <div style="font-size:0.78em; color:#8f6a22; font-weight:800; text-transform:uppercase;">📊 Média de Erros</div>
                        <div style="font-size:1.3em; font-weight:800; color:#8f6a22;">${a.avgErrors.toFixed(1)}</div>
                    </div>
                    <div style="background:#e3f3ea; padding: 10px 14px; border-radius: 8px;">
                        <div style="font-size:0.78em; color:#2e6b52; font-weight:800; text-transform:uppercase;">⏱️ Tempo Médio</div>
                        <div style="font-size:1.3em; font-weight:800; color:#2e6b52;">${formatMMSS(a.avgTime)}</div>
                    </div>
                    <div style="background:#e3f3ea; padding: 10px 14px; border-radius: 8px;">
                        <div style="font-size:0.78em; color:#2e6b52; font-weight:800; text-transform:uppercase;">🏆 Grupo Mais Rápido</div>
                        <div style="font-size:1.1em; font-weight:800; color:#2e6b52;">${a.fastest ? formatMMSS(a.fastest.time) : '—'}</div>
                        <div style="font-size:0.8em; color:#2e6b52;">${a.fastest ? a.fastest.group : ''}</div>
                    </div>
                </div>
            </div>
        `).join('');
}

// ============ ESTATÍSTICAS EM TEMPO REAL ============
function updateStats() {
    const totalGroups = document.getElementById('totalGroups');
    const totalQuestions = document.getElementById('totalQuestions');
    const activeGroups = document.getElementById('activeGroups');
    const winnerGroups = document.getElementById('winnerGroups');
    
    if (totalGroups) totalGroups.textContent = allGroups.length;
    if (totalQuestions) totalQuestions.textContent = allQuestions.length;
    if (activeGroups) activeGroups.textContent = allGroups.filter(g => !g.completed && g.started).length;
    if (winnerGroups) winnerGroups.textContent = allGroups.filter(g => g.completed).length;
}

// ============ RESETAR ============
function resetAllGames() {
    if (confirm('⚠️ ATENÇÃO: Deseja apagar TODOS os grupos e começar uma nova sessão?')) {
        database.ref('groups').remove().then(() => {
            loadAdminData();
        });
    }
}

function resetGroupProgress(groupName) {
    if (confirm(`⚠️ Deseja resetar o progresso do grupo "${groupName}"?`)) {
        database.ref('groups/' + groupName).update({
            currentQuestion: 0,
            started: false,
            completed: false,
            errors: 0,
            hintsUsed: 0,
            time: 0
        });
    }
}

// ============ UTILITÁRIOS ============
function switchScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(id).classList.add('active');
}

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('adminPassword').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') adminLogin();
    });
    toggleQuestionType();
});

// ============ IMPORTAÇÃO EM LOTE (IA) ============
function importQuestionsAI() {
    const aiText = document.getElementById('aiImportText').value.trim();
    const msg = document.getElementById('importAiMessage');

    if (!aiText) {
        msg.textContent = '❌ Cole o código gerado pela IA primeiro!';
        msg.className = 'clue-message error';
        return;
    }

    try {
        // Remove marcações de código (como ```json e ```) que a IA costuma colocar
        const cleanText = aiText.replace(/```json/gi, '').replace(/```/g, '').trim();
        const parsedData = JSON.parse(cleanText);
        
        if (!Array.isArray(parsedData)) {
            throw new Error("O formato precisa ser uma lista (array) de missões.");
        }

        let promises = [];

        parsedData.forEach(q => {
            const order = parseInt(q.order);
            const targetId = 'Q' + String(order).padStart(3, '0');
            
            let questionData = {
                id: targetId,
                order: order,
                type: q.type,
                location: q.location,
                challenge: q.challenge,
                hint: q.hint || '',
                createdAt: Date.now()
            };

            if (q.type === 'multipla') {
                questionData.alternatives = q.alternatives;
                questionData.correctAnswer = q.correctAnswer;
                const letters = ['A', 'B', 'C', 'D'];
                questionData.answer = q.alternatives[letters.indexOf(q.correctAnswer)];
            } else {
                questionData.answer = String(q.answer).toLowerCase().trim();
            }

            promises.push(database.ref('questions/' + targetId).set(questionData));
        });

        Promise.all(promises).then(() => {
            msg.textContent = `✅ ${parsedData.length} missões importadas com sucesso!`;
            msg.className = 'clue-message success';
            document.getElementById('aiImportText').value = ''; // Limpa a caixa
            loadAdminData(); // Atualiza a lista abaixo
        }).catch(err => {
            msg.textContent = '❌ Erro ao salvar no banco: ' + err.message;
            msg.className = 'clue-message error';
        });

    } catch (error) {
        msg.textContent = '❌ Erro! Certifique-se de colar exatamente o JSON gerado. Detalhe: ' + error.message;
        msg.className = 'clue-message error';
    }
}

// ============ EXPORTAR ============
window.adminLogin = adminLogin;
window.adminLogout = adminLogout;
window.switchTab = switchTab;
window.toggleQuestionType = toggleQuestionType;
window.addQuestion = addQuestion;
window.editQuestion = editQuestion; 
window.resetQuestionForm = resetQuestionForm; 
window.deleteQuestion = deleteQuestion;
window.resetAllGames = resetAllGames;
window.resetGroupProgress = resetGroupProgress;