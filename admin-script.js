const ADMIN_PASSWORD = 'admin123';
let allGroups = [];
let allQuestions = [];
let editingId = null; 

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

    // A etapa final não possui resposta nem alternativas.
    document.getElementById('answerField').style.display = type === 'descritiva' ? 'block' : 'none';
    document.getElementById('alternativesField').style.display = type === 'multipla' ? 'block' : 'none';
}

// ============ CARREGAR DADOS EM TEMPO REAL ============
function loadAdminData() {
    // 🔥 CORREÇÃO: remove listeners antigos antes de registrar novos.
    // Sem isso, cada save/edição adicionava um listener extra no Firebase,
    // fazendo a tela renderizar múltiplas vezes e acumulando memória com o tempo.
    database.ref('groups').off();
    database.ref('questions').off();

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
        challenge: challenge || (type === 'final'
            ? 'Parabéns! Vocês encontraram o tesouro!'
            : 'Resolva o desafio da pista!'),
        hint: type === 'final' ? '' : (hint || ''),
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

    } else if (type === 'descritiva') {
        const answer = document.getElementById('newQuestionAnswer').value.trim();
        if (!answer) {
            msg.textContent = '❌ Digite a resposta correta!';
            msg.className = 'clue-message error';
            return;
        }
        questionData.answer = answer.toLowerCase().trim();
    } else if (type === 'final') {
        // A etapa final serve apenas para comemorar e encerrar o jogo.
        // Como usamos set(), qualquer answer antigo/undefined é removido do Firebase.
    } else {
        msg.textContent = '❌ Tipo de etapa inválido!';
        msg.className = 'clue-message error';
        return;
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
        const alternatives = q.alternatives || [];
        
        altInputs.forEach((input, i) => {
            input.value = alternatives[i] || '';
            radios[i].checked = (q.correctAnswer === letters[i]);
        });
    } else if (q.type === 'descritiva') {
        document.getElementById('newQuestionAnswer').value = q.answer || '';
    } else {
        document.getElementById('newQuestionAnswer').value = '';
    }
    
    toggleEditMode(true);
    document.getElementById('tabQuestions').scrollIntoView({ behavior: 'smooth' });
}

// ============ RESETAR FORMULÁRIO ============
function resetQuestionForm() {
    editingId = null;
    document.querySelectorAll('.question-form input, .question-form textarea').forEach(el => {
        // 🔥 CORREÇÃO: não zera o "value" de radios/checkboxes, senão os radios A/B/C/D
        // perdem seu value="A"/"B"/"C"/"D" para sempre e a checagem de alternativa correta quebra.
        if (el.type !== 'radio' && el.type !== 'checkbox') el.value = '';
    });
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
        'multipla': '🎯 Múltipla Escolha',
        'final': '🎉 Final'
    };

    const typeColors = {
        'descritiva': '#27ae60',
        'multipla': '#3498db',
        'final': '#8e44ad'
    };

    container.innerHTML = allQuestions.map(q => {
        let answerHtml = '';
        const letters = ['A', 'B', 'C', 'D'];

        if (q.type === 'final') {
            answerHtml = `
                <div style="margin: 10px 0; background: #f4f0ff; padding: 15px; border-radius: 10px; border: 1px solid #c9b6e4;">
                    <strong style="color: #6c3483;">🎉 MENSAGEM DE ENCERRAMENTO:</strong>
                    <div style="margin: 10px 0; font-size: 1.2em; color: #1a1a2e; padding: 12px; background: white; border-radius: 8px; border: 2px solid #8e44ad;">
                        ${q.challenge || 'Parabéns! Vocês encontraram o tesouro!'}
                    </div>
                    <div style="color: #6c3483; background: #eee5f8; padding: 12px; border-radius: 8px;">
                        🎊 Esta etapa não exige resposta. O aluno verá o botão <strong>“Uhul! Finalizar Caçada”</strong>.
                    </div>
                </div>
            `;
        } else if (q.type === 'multipla') {
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
                        <span style="background: ${typeColors[q.type] || '#7f8c8d'}; color: white; padding: 3px 14px; border-radius: 20px; font-size: 0.8em; font-weight: bold;">
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
                if (!Array.isArray(q.alternatives) || q.alternatives.length < 2 || !q.correctAnswer) {
                    throw new Error(`A etapa ${order} de múltipla escolha está incompleta.`);
                }
                questionData.alternatives = q.alternatives;
                questionData.correctAnswer = q.correctAnswer;
                const letters = ['A', 'B', 'C', 'D'];
                questionData.answer = q.alternatives[letters.indexOf(q.correctAnswer)];
            } else if (q.type === 'descritiva') {
                if (q.answer === undefined || q.answer === null || String(q.answer).trim() === '') {
                    throw new Error(`A etapa ${order} descritiva precisa de uma resposta.`);
                }
                questionData.answer = String(q.answer).toLowerCase().trim();
            } else if (q.type === 'final') {
                questionData.challenge = q.challenge || 'Parabéns! Vocês encontraram o tesouro!';
                questionData.hint = '';
            } else {
                throw new Error(`Tipo inválido na etapa ${order}: ${q.type}`);
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
// ============================================================================
// CENTRAL INTERATIVA — pausa, avisos, pontos, comandos por equipe e relatório
// Esta seção funciona sem alterar o admin.html ou o styles.css.
// ============================================================================
let globalGamePaused = false;
let adminPauseRef = null;

function escapeAdminHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function injectAdminInteractiveStyles() {
    if (document.getElementById('adminInteractiveStyles')) return;

    const style = document.createElement('style');
    style.id = 'adminInteractiveStyles';
    style.textContent = `
        .live-control-panel {
            background: linear-gradient(135deg, #f9f4e6, #fffdf8);
            border: 2px solid #d6b460; box-shadow: 0 10px 28px rgba(48,39,20,.09);
        }
        .live-control-grid {
            display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
            gap: 14px; margin-top: 15px;
        }
        .live-control-box {
            background: #fff; border: 1px solid #ead9ad; border-radius: 14px;
            padding: 15px; min-width: 0;
        }
        .live-control-box h3 { margin: 0 0 9px; color:#1b2436; }
        .live-control-row { display:flex; gap:8px; flex-wrap:wrap; align-items:center; }
        .live-control-row .input-field { flex:1; min-width:180px; margin:0; }
        .live-status {
            display:inline-flex; align-items:center; gap:7px; padding:7px 12px;
            border-radius:999px; font-weight:900; background:#e6f5ea; color:#25653b;
        }
        .live-status.paused { background:#fde7e4; color:#a33428; }
        .admin-score-chip {
            display:inline-flex; align-items:center; padding:5px 10px; border-radius:999px;
            background:#fff1b8; color:#624500; font-weight:900; white-space:nowrap;
        }
        .admin-group-actions {
            display:flex; flex-wrap:wrap; gap:7px; margin-top:13px; padding-top:12px;
            border-top:1px dashed #d8c9a8;
        }
        .admin-action-btn {
            border:0; border-radius:9px; padding:8px 10px; cursor:pointer;
            font-weight:800; background:#edf2f7; color:#1b2436;
        }
        .admin-action-btn:hover { transform:translateY(-1px); filter:brightness(.98); }
        .admin-action-btn.primary { background:#dceefc; color:#155b87; }
        .admin-action-btn.success { background:#dff3e7; color:#276846; }
        .admin-action-btn.warning { background:#fff0cf; color:#7c5500; }
        .admin-action-btn.danger { background:#f9dfdc; color:#a33428; }
        .admin-live-message {
            min-height: 22px; margin-top:9px; font-weight:800; color:#2e6b52;
        }
        @media(max-width:650px) {
            .live-control-grid { grid-template-columns: 1fr; }
            .admin-group-actions .admin-action-btn { flex:1 1 46%; }
        }
    `;
    document.head.appendChild(style);
}

function ensureFinalQuestionOption() {
    const select = document.getElementById('newQuestionType');
    if (!select || select.querySelector('option[value="final"]')) return;
    const option = document.createElement('option');
    option.value = 'final';
    option.textContent = '🎉 Final (sem resposta)';
    select.appendChild(option);
}

function injectLiveControlPanel() {
    injectAdminInteractiveStyles();
    const rankingTab = document.getElementById('tabRanking');
    if (!rankingTab || document.getElementById('liveControlPanel')) return;

    const panel = document.createElement('div');
    panel.id = 'liveControlPanel';
    panel.className = 'admin-section live-control-panel';
    panel.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;">
            <div>
                <h2 style="margin-bottom:4px;">🎛️ Central de Comando</h2>
                <p class="helper-text">Controle a partida em tempo real nos celulares das equipes.</p>
            </div>
            <span id="globalPauseStatus" class="live-status">▶️ Caçada liberada</span>
        </div>
        <div class="live-control-grid">
            <div class="live-control-box">
                <h3>⏯️ Pausar a partida</h3>
                <p class="helper-text" style="margin-bottom:10px;">O cronômetro e as respostas param em todos os celulares.</p>
                <button id="togglePauseButton" onclick="toggleGlobalPause()" class="btn-primary" style="width:auto;padding:10px 16px;">⏸️ Pausar todos</button>
            </div>
            <div class="live-control-box">
                <h3>📢 Aviso geral</h3>
                <div class="live-control-row">
                    <input id="globalAnnouncementInput" class="input-field" maxlength="180" placeholder="Ex.: Faltam 10 minutos!">
                    <button onclick="sendGlobalAnnouncement()" class="btn-primary" style="width:auto;padding:10px 16px;">Enviar</button>
                </div>
                <div id="liveControlMessage" class="admin-live-message"></div>
            </div>
            <div class="live-control-box">
                <h3>📊 Relatório</h3>
                <p class="helper-text" style="margin-bottom:10px;">Baixe classificação, pontos, tempo, erros e dicas.</p>
                <button onclick="exportResultsCSV()" class="btn-primary" style="width:auto;padding:10px 16px;background:#2e6b52;">⬇️ Exportar CSV</button>
            </div>
        </div>
    `;

    rankingTab.insertBefore(panel, rankingTab.firstChild);
    const announcementInput = document.getElementById('globalAnnouncementInput');
    if (announcementInput) {
        announcementInput.addEventListener('keydown', event => {
            if (event.key === 'Enter') sendGlobalAnnouncement();
        });
    }
}

function showAdminLiveMessage(message, isError = false) {
    const element = document.getElementById('liveControlMessage');
    if (!element) return;
    element.textContent = message;
    element.style.color = isError ? '#a33428' : '#2e6b52';
    clearTimeout(showAdminLiveMessage.timeoutId);
    showAdminLiveMessage.timeoutId = setTimeout(() => { element.textContent = ''; }, 4000);
}

function updateGlobalPauseUI() {
    const status = document.getElementById('globalPauseStatus');
    const button = document.getElementById('togglePauseButton');
    if (status) {
        status.classList.toggle('paused', globalGamePaused);
        status.textContent = globalGamePaused ? '⏸️ Caçada pausada' : '▶️ Caçada liberada';
    }
    if (button) {
        button.textContent = globalGamePaused ? '▶️ Liberar todos' : '⏸️ Pausar todos';
        button.style.background = globalGamePaused ? '#27ae60' : '#b3392e';
    }
}

function attachAdminControlListener() {
    if (adminPauseRef) adminPauseRef.off();
    adminPauseRef = database.ref('gameControl/paused');
    adminPauseRef.on('value', snapshot => {
        globalGamePaused = Boolean(snapshot.val());
        updateGlobalPauseUI();
    });
}

function toggleGlobalPause() {
    const nextState = !globalGamePaused;
    database.ref('gameControl/paused').set(nextState).then(() => {
        showAdminLiveMessage(nextState ? 'Todos os grupos foram pausados.' : 'Caçada liberada.');
    }).catch(error => showAdminLiveMessage(`Erro: ${error.message}`, true));
}

function sendGlobalAnnouncement() {
    const input = document.getElementById('globalAnnouncementInput');
    const message = input ? input.value.trim() : '';
    if (!message) {
        showAdminLiveMessage('Digite uma mensagem antes de enviar.', true);
        return;
    }

    database.ref('gameControl/announcement').set({
        message,
        createdAt: Date.now()
    }).then(() => {
        input.value = '';
        showAdminLiveMessage('Aviso enviado para todas as equipes.');
    }).catch(error => showAdminLiveMessage(`Erro: ${error.message}`, true));
}

function writeGroupCommand(groupName, command) {
    return database.ref(`gameControl/groupCommands/${groupName}`).set({
        ...command,
        createdAt: Date.now()
    });
}

function addScoreToGroup(groupName, amount = 50) {
    database.ref(`groups/${groupName}/score`).transaction(current => (Number(current) || 0) + amount)
        .then(() => showAdminLiveMessage(`+${amount} pontos para ${groupName}.`))
        .catch(error => showAdminLiveMessage(`Erro: ${error.message}`, true));
}

function giveHintToGroup(groupName) {
    writeGroupCommand(groupName, { type: 'bonusHint' })
        .then(() => showAdminLiveMessage(`Dica extra enviada para ${groupName}.`))
        .catch(error => showAdminLiveMessage(`Erro: ${error.message}`, true));
}

function sendMessageToGroup(groupName) {
    const message = prompt(`Mensagem para a equipe "${groupName}":`);
    if (!message || !message.trim()) return;

    writeGroupCommand(groupName, { type: 'message', message: message.trim() })
        .then(() => showAdminLiveMessage(`Mensagem enviada para ${groupName}.`))
        .catch(error => showAdminLiveMessage(`Erro: ${error.message}`, true));
}

function advanceGroupStage(groupName) {
    database.ref(`groups/${groupName}`).once('value').then(snapshot => {
        if (!snapshot.exists()) throw new Error('Equipe não encontrada.');
        const data = snapshot.val();
        if (data.completed) throw new Error('A equipe já concluiu a caçada.');

        const targetIndex = Math.min(Number(data.currentQuestion || 0) + 1, allQuestions.length);
        return Promise.all([
            database.ref(`groups/${groupName}`).update({ currentQuestion: targetIndex }),
            writeGroupCommand(groupName, { type: 'advance', targetIndex })
        ]);
    }).then(() => showAdminLiveMessage(`${groupName} avançou uma etapa.`))
      .catch(error => showAdminLiveMessage(`Erro: ${error.message}`, true));
}

resetGroupProgress = function resetGroupProgressInteractive(groupName) {
    if (!confirm(`⚠️ Deseja resetar o progresso do grupo "${groupName}"?`)) return;

    const updates = {
        currentQuestion: 0,
        started: false,
        completed: false,
        errors: 0,
        hintsUsed: 0,
        score: 0,
        firstTryCount: 0,
        time: 0,
        finalTime: null,
        questionStats: null,
        stageScores: null,
        currentStageHintUsed: false,
        currentStageErrors: 0
    };

    Promise.all([
        database.ref(`groups/${groupName}`).update(updates),
        writeGroupCommand(groupName, { type: 'reset' })
    ]).then(() => showAdminLiveMessage(`${groupName} foi reiniciado.`))
      .catch(error => showAdminLiveMessage(`Erro: ${error.message}`, true));
};

function exportResultsCSV() {
    if (!allGroups.length) {
        showAdminLiveMessage('Ainda não existem grupos para exportar.', true);
        return;
    }

    const sorted = [...allGroups].sort((a, b) => {
        if (a.completed !== b.completed) return a.completed ? -1 : 1;
        if ((b.score || 0) !== (a.score || 0)) return (b.score || 0) - (a.score || 0);
        return (a.finalTime || a.time || 0) - (b.finalTime || b.time || 0);
    });

    const quote = value => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const header = ['Posição', 'Equipe', 'Integrantes', 'Status', 'Etapa', 'Pontuação', 'Tempo (s)', 'Erros', 'Dicas', 'Acertos de primeira'];
    const rows = sorted.map((group, index) => [
        index + 1,
        group.name,
        (group.members || []).join(', '),
        group.completed ? 'Concluiu' : (group.started ? 'Em andamento' : 'Não iniciou'),
        `${group.currentQuestion || 0}/${allQuestions.length}`,
        group.score || 0,
        group.finalTime || group.time || 0,
        group.errors || 0,
        group.hintsUsed || 0,
        group.firstTryCount || 0
    ]);

    const csv = '\uFEFF' + [header, ...rows].map(row => row.map(quote).join(';')).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `relatorio-detetives-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    showAdminLiveMessage('Relatório CSV gerado com sucesso.');
}

renderGroupsListRanking = function renderGroupsListRankingInteractive() {
    const container = document.getElementById('groupsList');
    if (!container) return;

    if (allGroups.length === 0) {
        container.innerHTML = '<p class="empty-message">👀 Nenhum grupo correndo pela escola no momento...</p>';
        return;
    }

    const sortedGroups = [...allGroups].sort((a, b) => {
        if (a.completed !== b.completed) return a.completed ? -1 : 1;
        if ((b.score || 0) !== (a.score || 0)) return (b.score || 0) - (a.score || 0);
        if (a.completed && b.completed) return (a.finalTime || 0) - (b.finalTime || 0);
        if ((b.currentQuestion || 0) !== (a.currentQuestion || 0)) return (b.currentQuestion || 0) - (a.currentQuestion || 0);
        return (a.time || 0) - (b.time || 0);
    });

    container.innerHTML = sortedGroups.map((group, index) => {
        const progress = allQuestions.length > 0
            ? Math.min(100, Math.round(((group.currentQuestion || 0) / allQuestions.length) * 100))
            : 0;
        const timeSeconds = group.completed ? (group.finalTime || group.time || 0) : (group.time || 0);
        const minutes = Math.floor(timeSeconds / 60).toString().padStart(2, '0');
        const secondsText = (timeSeconds % 60).toString().padStart(2, '0');
        const encodedName = encodeURIComponent(group.name).replace(/'/g, '%27');
        const safeName = escapeAdminHtml(group.name);
        const safeMembers = escapeAdminHtml((group.members || []).join(', ') || 'Sem membros');

        let statusBadge;
        if (group.completed) {
            statusBadge = '<span style="background:#27ae60;padding:4px 14px;border-radius:20px;color:white;font-size:.8em;font-weight:bold;">🏆 Venceu!</span>';
        } else if (group.started) {
            statusBadge = '<span style="background:#3498db;padding:4px 14px;border-radius:20px;color:white;font-size:.8em;font-weight:bold;">🏃 Na Caçada</span>';
        } else {
            statusBadge = '<span style="background:#95a5a6;padding:4px 14px;border-radius:20px;color:white;font-size:.8em;font-weight:bold;">📖 Na Base</span>';
        }

        return `
            <div class="group-card-admin" style="display:block;${group.completed ? 'border-color:#27ae60;background:#f0faf0;' : ''}">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:15px;flex-wrap:wrap;gap:10px;">
                    <div>
                        <span style="font-size:1.5em;font-weight:bold;color:#f39c12;margin-right:10px;">#${index + 1}</span>
                        <strong style="font-size:1.1em;">${safeName}</strong>
                    </div>
                    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
                        <span class="admin-score-chip">⭐ ${Number(group.score || 0)} pts</span>
                        ${statusBadge}
                    </div>
                </div>
                <div style="background:#e9ecef;border-radius:10px;height:10px;margin-bottom:8px;overflow:hidden;">
                    <div style="width:${progress}%;height:100%;background:${group.completed ? '#27ae60' : '#f39c12'};border-radius:10px;transition:width .5s ease;"></div>
                </div>
                <div style="display:flex;justify-content:space-between;font-size:.9em;color:#555;flex-wrap:wrap;gap:7px;">
                    <span>📌 Etapa ${group.currentQuestion || 0}/${allQuestions.length}</span>
                    <span>⏱️ ${minutes}:${secondsText}</span>
                    <span>❌ Erros: ${group.errors || 0}</span>
                    <span>💡 Dicas: ${group.hintsUsed || 0}/3</span>
                    <span>⚡ Primeira tentativa: ${group.firstTryCount || 0}</span>
                </div>
                <div style="margin-top:8px;font-size:.85em;color:#888;">👤 ${safeMembers}</div>
                ${group.completed ? '<div style="margin-top:6px;color:#27ae60;font-weight:bold;">🏆 COMPLETOU A CAÇADA!</div>' : ''}
                <div class="admin-group-actions">
                    <button class="admin-action-btn success" onclick="addScoreToGroup(decodeURIComponent('${encodedName}'), 50)">⭐ +50 pontos</button>
                    <button class="admin-action-btn warning" onclick="giveHintToGroup(decodeURIComponent('${encodedName}'))">💡 +1 dica</button>
                    <button class="admin-action-btn primary" onclick="sendMessageToGroup(decodeURIComponent('${encodedName}'))">📨 Mensagem</button>
                    <button class="admin-action-btn primary" onclick="advanceGroupStage(decodeURIComponent('${encodedName}'))" ${group.completed ? 'disabled' : ''}>⏭️ Avançar</button>
                    <button class="admin-action-btn danger" onclick="resetGroupProgress(decodeURIComponent('${encodedName}'))">↩️ Resetar</button>
                </div>
            </div>
        `;
    }).join('');
};

document.addEventListener('DOMContentLoaded', () => {
    ensureFinalQuestionOption();
    injectLiveControlPanel();
    attachAdminControlListener();
    toggleQuestionType();
});

window.toggleGlobalPause = toggleGlobalPause;
window.sendGlobalAnnouncement = sendGlobalAnnouncement;
window.addScoreToGroup = addScoreToGroup;
window.giveHintToGroup = giveHintToGroup;
window.sendMessageToGroup = sendMessageToGroup;
window.advanceGroupStage = advanceGroupStage;
window.resetGroupProgress = resetGroupProgress;
window.exportResultsCSV = exportResultsCSV;
