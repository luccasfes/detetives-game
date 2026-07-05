// ============ VARIÁVEIS ============
let allQuestions = [];
let currentGroup = null;
let currentMembers = [];
let currentQuestionIndex = 0;
let timerInterval = null;
let seconds = 0;
let gameStarted = false;
let tempGroupName = '';
let tempMembers = [];
let selectedAnswer = null;

// ============ CARREGAR PERGUNTAS ============
function loadQuestions() {
    database.ref('questions').on('value', (snapshot) => {
        const data = snapshot.val();
        if (data) {
            allQuestions = Object.values(data).sort((a, b) => (a.order || 0) - (b.order || 0));
            document.getElementById('totalQuestions').textContent = allQuestions.length;
            if (gameStarted) renderProgressDots();
        } else {
            allQuestions = [];
            document.getElementById('totalQuestions').textContent = '0';
        }
    });
}

// ============ GERENCIAR MEMBROS ============
function addMember() {
    const container = document.getElementById('membersList');
    const memberCount = container.children.length + 1;
    
    const row = document.createElement('div');
    row.className = 'member-row';
    row.innerHTML = `
        <span class="member-number">${memberCount}</span>
        <input type="text" placeholder="Nome do integrante ${memberCount}" class="member-input">
    `;
    container.appendChild(row);
    
    const newInput = row.querySelector('input');
    newInput.focus();
}

function removeLastMember() {
    const container = document.getElementById('membersList');
    if (container.children.length <= 2) {
        alert('⚠️ O grupo precisa ter pelo menos 2 integrantes!');
        return;
    }
    container.removeChild(container.lastChild);
    updateMemberNumbers();
}

function updateMemberNumbers() {
    const container = document.getElementById('membersList');
    const numbers = container.querySelectorAll('.member-number');
    numbers.forEach((num, index) => {
        num.textContent = index + 1;
    });
}

function getMembers() {
    const container = document.getElementById('membersList');
    const inputs = container.querySelectorAll('input');
    const members = [];
    inputs.forEach(input => {
        const name = input.value.trim();
        if (name) members.push(name);
    });
    return members;
}

// ============ IR PARA CONFIRMAÇÃO ============
function goToConfirm() {
    const groupName = document.getElementById('groupNameInput').value.trim();
    const members = getMembers();
    const errorDiv = document.getElementById('createGroupError');

    if (!groupName) {
        errorDiv.textContent = '❌ Digite o nome do grupo!';
        return;
    }

    if (members.length < 2) {
        errorDiv.textContent = '❌ Adicione pelo menos 2 integrantes!';
        return;
    }

    const uniqueMembers = new Set(members);
    if (uniqueMembers.size !== members.length) {
        errorDiv.textContent = '❌ Não pode ter nomes duplicados!';
        return;
    }

    // Verificar se todos os campos estão preenchidos
    const inputs = document.querySelectorAll('.member-input');
    let allFilled = true;
    inputs.forEach(input => {
        if (input.value.trim() === '') allFilled = false;
    });

    if (!allFilled) {
        errorDiv.textContent = '❌ Preencha o nome de todos os integrantes!';
        return;
    }

    const groupRef = database.ref('groups/' + groupName);
    groupRef.once('value').then((snapshot) => {
        if (snapshot.exists()) {
            const data = snapshot.val();
            const existingMembers = data.members || [];
            const membersMatch = members.every(m => existingMembers.includes(m)) && 
                               existingMembers.every(m => members.includes(m));
            
            if (!membersMatch) {
                errorDiv.textContent = '❌ Este grupo já existe com outros integrantes!';
                return;
            }
            
            tempGroupName = groupName;
            tempMembers = members;
            showConfirmScreen(groupName, members);
        } else {
            tempGroupName = groupName;
            tempMembers = members;
            showConfirmScreen(groupName, members);
        }
    }).catch((error) => {
        errorDiv.textContent = '❌ Erro ao verificar: ' + error.message;
    });
}

function showConfirmScreen(groupName, members) {
    document.getElementById('previewGroupName').textContent = groupName;
    document.getElementById('previewMembers').innerHTML = members.map(m => 
        `<span class="member-tag-preview">${m}</span>`
    ).join(' ');
    
    document.getElementById('stepCreateGroup').classList.remove('active');
    document.getElementById('stepConfirmGroup').classList.add('active');
    
    document.getElementById('step1').classList.remove('active');
    document.getElementById('step1').classList.add('completed');
    document.getElementById('step2').classList.add('active');
    
    document.getElementById('confirmMemberName').value = '';
    document.getElementById('confirmError').textContent = '';
}

function goBackToCreate() {
    document.getElementById('stepConfirmGroup').classList.remove('active');
    document.getElementById('stepCreateGroup').classList.add('active');
    
    document.getElementById('step2').classList.remove('active');
    document.getElementById('step1').classList.remove('completed');
    document.getElementById('step1').classList.add('active');
}

// ============ CONFIRMAR GRUPO ============
function confirmGroup() {
    const memberName = document.getElementById('confirmMemberName').value.trim();
    const errorDiv = document.getElementById('confirmError');
    
    if (!memberName) {
        errorDiv.textContent = '❌ Digite seu nome!';
        return;
    }
    
    if (!tempMembers.includes(memberName)) {
        errorDiv.textContent = '❌ Você não está na lista de integrantes!';
        return;
    }
    
    const groupRef = database.ref('groups/' + tempGroupName);
    groupRef.once('value').then((snapshot) => {
        if (snapshot.exists()) {
            const data = snapshot.val();
            const existingMembers = data.members || [];
            const membersMatch = tempMembers.every(m => existingMembers.includes(m)) && 
                               existingMembers.every(m => tempMembers.includes(m));
            
            if (!membersMatch) {
                errorDiv.textContent = '❌ Este grupo já existe com outros integrantes!';
                return;
            }
            
            currentGroup = tempGroupName;
            currentMembers = tempMembers;
            currentQuestionIndex = data.currentQuestion || 0;
            gameStarted = data.started || false;
            
            if (data.completed) {
                winGame();
                return;
            }
            
            startGame();
        } else {
            currentGroup = tempGroupName;
            currentMembers = tempMembers;
            currentQuestionIndex = 0;
            gameStarted = false;
            
            groupRef.set({
                members: tempMembers,
                currentQuestion: 0,
                started: false,
                completed: false,
                createdAt: Date.now()
            });
            
            startGame();
        }
    }).catch((error) => {
        errorDiv.textContent = '❌ Erro ao confirmar: ' + error.message;
    });
}

// ============ INICIAR JOGO ============
function startGame() {
    database.ref('groups/' + currentGroup).update({
        started: true,
        startTime: Date.now()
    });
    
    gameStarted = true;
    switchScreen('gameScreen');
    document.getElementById('displayGroup').textContent = currentGroup;
    document.getElementById('displayMembers').textContent = currentMembers.join(', ');
    document.getElementById('totalQuestions').textContent = allQuestions.length;
    
    renderProgressDots();
    showQuestion();
    startTimer();
}

// ============ MOSTRAR PERGUNTA ============
function showQuestion() {
    if (currentQuestionIndex >= allQuestions.length) {
        winGame();
        return;
    }
    
    const question = allQuestions[currentQuestionIndex];
    const letters = ['A', 'B', 'C', 'D'];
    
    document.getElementById('questionNumber').textContent = `Pergunta ${currentQuestionIndex + 1}/${allQuestions.length}`;
    document.getElementById('questionTitle').textContent = `🔍 Encontre a Pista!`;
    document.getElementById('questionHint').textContent = question.hint ? `💡 Dica: ${question.hint}` : '';
    document.getElementById('questionText').textContent = question.text;
    
    // Esconder todos os tipos de resposta
    document.getElementById('answerField').style.display = 'none';
    document.getElementById('alternativesContainer').style.display = 'none';
    document.getElementById('btnCheckAnswer').style.display = 'inline-block';
    document.getElementById('btnCheckAnswer').disabled = true;
    
    if (question.type === 'multipla') {
        // Múltipla escolha
        document.getElementById('alternativesContainer').style.display = 'grid';
        document.getElementById('answerField').style.display = 'none';
        
        const alternativesHtml = question.alternatives.map((alt, index) => `
            <div class="alternative-option" onclick="selectAlternative('${letters[index]}')" id="alt-${letters[index]}">
                <span class="alt-letter">${letters[index]})</span>
                <span class="alt-text">${alt}</span>
            </div>
        `).join('');
        
        document.getElementById('alternativesContainer').innerHTML = alternativesHtml;
        selectedAnswer = null;
        
    } else {
        // Charada ou Descritiva - resposta em texto
        document.getElementById('alternativesContainer').style.display = 'none';
        document.getElementById('answerField').style.display = 'block';
        document.getElementById('answerInput').value = '';
        document.getElementById('answerInput').focus();
        document.getElementById('btnCheckAnswer').disabled = false;
    }
    
    document.getElementById('feedbackMessage').style.display = 'none';
    document.getElementById('feedbackMessage').className = 'feedback-message';
    
    renderProgressDots();
    document.getElementById('questionProgress').textContent = currentQuestionIndex;
}

// ============ SELECIONAR ALTERNATIVA ============
function selectAlternative(letter) {
    document.querySelectorAll('.alternative-option').forEach(el => {
        el.classList.remove('selected');
    });
    
    document.getElementById(`alt-${letter}`).classList.add('selected');
    selectedAnswer = letter;
    document.getElementById('btnCheckAnswer').disabled = false;
}

// ============ VERIFICAR RESPOSTA ============
function checkAnswer() {
    if (!gameStarted) {
        showFeedback('⚠️ O jogo ainda não começou!', 'error');
        return;
    }
    
    if (currentQuestionIndex >= allQuestions.length) {
        winGame();
        return;
    }
    
    const question = allQuestions[currentQuestionIndex];
    let userAnswer = '';
    let isCorrect = false;
    
    if (question.type === 'multipla') {
        if (!selectedAnswer) {
            showFeedback('❌ Selecione uma alternativa!', 'error');
            return;
        }
        userAnswer = selectedAnswer;
        isCorrect = selectedAnswer === question.correctAnswer;
        
        // Marcar alternativas
        document.querySelectorAll('.alternative-option').forEach(el => {
            const letter = el.id.replace('alt-', '');
            if (letter === question.correctAnswer) {
                el.classList.add('correct');
            } else if (letter === selectedAnswer && !isCorrect) {
                el.classList.add('wrong');
            }
        });
        
    } else {
        // Charada ou Descritiva
        userAnswer = document.getElementById('answerInput').value.trim().toLowerCase();
        if (!userAnswer) {
            showFeedback('❌ Digite sua resposta!', 'error');
            return;
        }
        
        // Comparação flexível (ignora maiúsculas/minúsculas e espaços extras)
        const correctAnswer = question.answer.toLowerCase().trim();
        isCorrect = userAnswer === correctAnswer;
        
        if (isCorrect) {
            document.getElementById('answerInput').style.borderColor = '#27ae60';
        } else {
            document.getElementById('answerInput').style.borderColor = '#e74c3c';
        }
    }
    
    document.getElementById('btnCheckAnswer').disabled = true;
    
    if (isCorrect) {
        showFeedback(`✅ Correto! 🎉`, 'success');
        
        currentQuestionIndex++;
        database.ref('groups/' + currentGroup).update({
            currentQuestion: currentQuestionIndex
        });
        
        if (currentQuestionIndex >= allQuestions.length) {
            setTimeout(() => winGame(), 1500);
        } else {
            setTimeout(() => showQuestion(), 1500);
        }
    } else {
        const correctDisplay = question.type === 'multipla' ? 
            `A resposta correta é ${question.correctAnswer}` : 
            `A resposta correta é "${question.answer}"`;
            
        showFeedback(`❌ Errado! ${correctDisplay}`, 'error');
        
        // Mesmo errando, avança para a próxima
        currentQuestionIndex++;
        database.ref('groups/' + currentGroup).update({
            currentQuestion: currentQuestionIndex
        });
        
        if (currentQuestionIndex >= allQuestions.length) {
            setTimeout(() => winGame(), 2000);
        } else {
            setTimeout(() => showQuestion(), 2000);
        }
    }
}

// ============ PROGRESSO ============
function renderProgressDots() {
    const container = document.getElementById('progressDots');
    container.innerHTML = '';
    
    for (let i = 0; i < allQuestions.length; i++) {
        const dot = document.createElement('div');
        dot.className = 'progress-dot';
        dot.textContent = i + 1;
        
        if (i < currentQuestionIndex) {
            dot.classList.add('completed');
        } else if (i === currentQuestionIndex && gameStarted) {
            dot.classList.add('current');
        } else {
            dot.classList.add('locked');
        }
        
        container.appendChild(dot);
    }
}

// ============ FEEDBACK ============
function showFeedback(message, type) {
    const div = document.getElementById('feedbackMessage');
    div.textContent = message;
    div.className = `feedback-message ${type}`;
    div.style.display = 'block';
}

// ============ TIMER ============
function startTimer() {
    if (timerInterval) return;
    
    timerInterval = setInterval(() => {
        seconds++;
        updateTimerDisplay();
        if (seconds % 10 === 0) {
            database.ref('groups/' + currentGroup).update({ time: seconds });
        }
    }, 1000);
}

function updateTimerDisplay() {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    document.getElementById('timerDisplay').textContent = 
        `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
}

// ============ VITÓRIA ============
function winGame() {
    clearInterval(timerInterval);
    timerInterval = null;
    
    document.getElementById('winTime').textContent = document.getElementById('timerDisplay').textContent;
    document.getElementById('winGroup').textContent = currentGroup;
    document.getElementById('winMembers').textContent = currentMembers.join(', ');
    switchScreen('winScreen');
    
    database.ref('groups/' + currentGroup).update({
        completed: true,
        finalTime: seconds
    });
}

// ============ RESETAR ============
function resetGame() {
    if (currentGroup) {
        if (!confirm('⚠️ Tem certeza que quer reiniciar? Isso vai apagar o progresso do seu grupo!')) {
            return;
        }
        database.ref('groups/' + currentGroup).remove();
    }
    
    currentGroup = null;
    currentMembers = [];
    currentQuestionIndex = 0;
    gameStarted = false;
    seconds = 0;
    tempGroupName = '';
    tempMembers = [];
    selectedAnswer = null;
    
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
    
    document.getElementById('timerDisplay').textContent = '00:00';
    document.getElementById('questionProgress').textContent = '0';
    document.getElementById('feedbackMessage').style.display = 'none';
    document.getElementById('feedbackMessage').className = 'feedback-message';
    document.getElementById('groupNameInput').value = '';
    document.getElementById('confirmMemberName').value = '';
    
    const container = document.getElementById('membersList');
    container.innerHTML = '';
    addMember();
    addMember();
    
    switchScreen('loginScreen');
}

function logout() {
    if (currentGroup) {
        database.ref('groups/' + currentGroup).update({ time: seconds });
    }
    resetGame();
}

// ============ UTILITÁRIOS ============
function switchScreen(screenId) {
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.remove('active');
    });
    document.getElementById(screenId).classList.add('active');
}

// ============ INICIALIZAÇÃO ============
document.addEventListener('DOMContentLoaded', function() {
    loadQuestions();
    
    addMember();
    addMember();
    
    document.getElementById('groupNameInput').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            const inputs = document.querySelectorAll('.member-input');
            if (inputs.length > 0) inputs[0].focus();
        }
    });
    
    document.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            if (document.getElementById('stepCreateGroup').classList.contains('active')) {
                goToConfirm();
            } else if (document.getElementById('stepConfirmGroup').classList.contains('active')) {
                confirmGroup();
            } else if (document.getElementById('gameScreen').classList.contains('active')) {
                const answerInput = document.getElementById('answerInput');
                if (answerInput && answerInput.value !== '') {
                    checkAnswer();
                }
            }
        }
    });
    
    document.getElementById('answerInput').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            checkAnswer();
        }
    });
});

// ============ EXPORTAR ============
window.addMember = addMember;
window.removeLastMember = removeLastMember;
window.goToConfirm = goToConfirm;
window.goBackToCreate = goBackToCreate;
window.confirmGroup = confirmGroup;
window.selectAlternative = selectAlternative;
window.checkAnswer = checkAnswer;
window.resetGame = resetGame;
window.logout = logout;