let allQuestions = [];
let currentGroup = null;
let currentMembers = [];
let currentQuestionIndex = 0;
let timerInterval = null;
let seconds = 0;
let gameStarted = false;
let hintsLeft = 3;
let selectedAlternative = null;
let isGameOver = false;

// ============ CARREGAR DADOS ============
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
        <input type="text" placeholder="Nome do detetive" class="input-field" style="margin:0;">
    `;
    container.appendChild(row);
    row.querySelector('input').focus();
}

function removeLastMember() {
    const container = document.getElementById('membersList');
    if (container.children.length <= 2) {
        alert('⚠️ A equipe precisa ter pelo menos 2 detetives!');
        return;
    }
    container.removeChild(container.lastChild);
    const numbers = container.querySelectorAll('.member-number');
    numbers.forEach((num, index) => { num.textContent = index + 1; });
}

function getMembers() {
    const inputs = document.querySelectorAll('#membersList input');
    return Array.from(inputs).map(input => input.value.trim()).filter(name => name);
}

// ============ FLUXO DE LOGIN ============
function goToConfirm() {
    const groupName = document.getElementById('groupNameInput').value.trim();
    const members = getMembers();
    const errorDiv = document.getElementById('createGroupError');

    if (!groupName) return errorDiv.textContent = '❌ Digite o nome da equipe!';
    if (members.length < 2) return errorDiv.textContent = '❌ Adicione pelo menos 2 detetives!';
    if (new Set(members).size !== members.length) return errorDiv.textContent = '❌ Não pode ter nomes duplicados!';
    
    if (members.length !== document.querySelectorAll('#membersList input').length) {
        return errorDiv.textContent = '❌ Preencha todos os campos de nome vazios!';
    }

    database.ref('groups/' + groupName).once('value').then((snapshot) => {
        if (snapshot.exists()) {
            const data = snapshot.val();
            const existingMembers = data.members || [];
            const match = members.every(m => existingMembers.includes(m)) && 
                         existingMembers.every(m => members.includes(m));
            if (!match) return errorDiv.textContent = '❌ Esta equipe já existe com outros integrantes!';
            
            // Se o grupo já completou, mostra mensagem
            if (data.completed) {
                errorDiv.textContent = '🏆 Esta equipe já completou a caçada! Parabéns!';
                return;
            }
        }
        
        currentGroup = groupName;
        currentMembers = members;
        
        document.getElementById('previewGroupName').textContent = groupName;
        document.getElementById('previewMembers').innerHTML = members.map(m => 
            `<span class="member-tag-preview">${m}</span>`
        ).join(' ');
        
        document.getElementById('stepCreateGroup').classList.remove('active');
        document.getElementById('stepConfirmGroup').classList.add('active');
        document.getElementById('step1').classList.replace('active', 'completed');
        document.getElementById('step2').classList.add('active');
    });
}

function goBackToCreate() {
    document.getElementById('stepConfirmGroup').classList.remove('active');
    document.getElementById('stepCreateGroup').classList.add('active');
    document.getElementById('step2').classList.remove('active');
    document.getElementById('step1').classList.replace('completed', 'active');
}

function confirmGroup() {
    const errorDiv = document.getElementById('confirmError');
    errorDiv.textContent = 'Conectando à base...';
    
    database.ref('groups/' + currentGroup).once('value').then((snapshot) => {
        const data = snapshot.exists() ? snapshot.val() : null;
        
        // Verifica se já completou
        if (data && data.completed) {
            // Recupera os dados da vitória
            currentMembers = data.members || [];
            seconds = data.finalTime || 0;
            const m = Math.floor(seconds / 60).toString().padStart(2, '0');
            const s = (seconds % 60).toString().padStart(2, '0');
            document.getElementById('winTime').textContent = `${m}:${s}`;
            document.getElementById('winGroup').textContent = currentGroup;
            document.getElementById('winMembers').textContent = currentMembers.join(', ');
            switchScreen('winScreen');
            return;
        }
        
        currentQuestionIndex = data ? (data.currentQuestion || 0) : 0;
        
        if (!data) {
            database.ref('groups/' + currentGroup).set({
                members: currentMembers,
                currentQuestion: 0,
                started: false,
                completed: false,
                errors: 0,
                hintsUsed: 0,
                createdAt: Date.now()
            });
        }
        startGame();
    }).catch(err => {
        errorDiv.textContent = '❌ Erro de conexão com o servidor!';
    });
}

// ============ INICIAR CAÇADA ============
function startGame() {
    database.ref('groups/' + currentGroup).update({ started: true });
    gameStarted = true;
    isGameOver = false;
    switchScreen('gameScreen');
    document.getElementById('displayGroup').textContent = currentGroup;
    document.getElementById('displayMembers').textContent = currentMembers.join(', ');
    document.getElementById('totalQuestions').textContent = allQuestions.length;
    renderProgressDots();
    showPhaseLocation();
    startTimer();
}

// ============ FASE 1: BUSCANDO O PAPEL FÍSICO ============
function showPhaseLocation() {
    if (currentQuestionIndex >= allQuestions.length) {
        winGame();
        return;
    }
    
    const question = allQuestions[currentQuestionIndex];
    document.getElementById('questionProgress').textContent = currentQuestionIndex + 1;
    
    document.getElementById('phaseChallenge').classList.remove('active');
    document.getElementById('phaseLocation').classList.add('active');
    
    document.getElementById('questionNumberLocation').textContent = `Etapa ${currentQuestionIndex + 1} de ${allQuestions.length}`;
    document.getElementById('locationText').textContent = question.location;
    
    renderProgressDots();
}

// ============ FASE 2: RESOLVENDO O DESAFIO ============
function foundPaper() {
    const question = allQuestions[currentQuestionIndex];
    
    document.getElementById('phaseLocation').classList.remove('active');
    document.getElementById('phaseChallenge').classList.add('active');
    
    document.getElementById('questionNumberChallenge').textContent = `Desafio da Etapa ${currentQuestionIndex + 1}`;
    
    // ⚠️ O aluno NUNCA vê a pergunta - só a instrução genérica
    document.getElementById('challengeText').textContent = "🔐 Digite a resposta que vocês encontraram na pista física:";
    
    // Resetar seleção
    selectedAlternative = null;
    document.getElementById('selectedAlternative').textContent = '';
    document.querySelectorAll('.alt-btn').forEach(btn => btn.classList.remove('selected'));
    
    // Mostrar input correto conforme o tipo
    const descriptiveDiv = document.getElementById('descriptiveInput');
    const multipleDiv = document.getElementById('multipleChoiceInput');
    const answerInput = document.getElementById('answerInput');
    
    if (question.type === 'multipla') {
        descriptiveDiv.style.display = 'none';
        multipleDiv.style.display = 'block';
        const letters = ['A', 'B', 'C', 'D'];
        const buttons = document.querySelectorAll('.alt-btn');
        buttons.forEach((btn, index) => {
            if (index < question.alternatives.length) {
                btn.textContent = `${letters[index]}) ${question.alternatives[index]}`;
                btn.style.display = 'inline-block';
            } else {
                btn.style.display = 'none';
            }
        });
        answerInput.value = '';
    } else {
        descriptiveDiv.style.display = 'block';
        multipleDiv.style.display = 'none';
        answerInput.value = '';
        answerInput.style.borderColor = '#ddd';
        answerInput.focus();
    }
    
    document.getElementById('btnCheckAnswer').disabled = false;
    document.getElementById('feedbackMessage').style.display = 'none';
    
    // Dicas do professor
    const hintElement = document.getElementById('questionHint');
    const hintButton = document.getElementById('btnShowHint');
    if (question.hint) {
        hintElement.textContent = `💡 Dica da Central: ${question.hint}`;
        hintElement.style.display = 'none';
        hintButton.style.display = 'inline-block';
        document.getElementById('hintsRemaining').textContent = hintsLeft;
    } else {
        hintElement.style.display = 'none';
        hintButton.style.display = 'none';
    }
}

// ============ SELECIONAR ALTERNATIVA (Múltipla Escolha) ============
function selectAlternative(letter) {
    selectedAlternative = letter;
    document.querySelectorAll('.alt-btn').forEach(btn => {
        btn.classList.toggle('selected', btn.dataset.letter === letter);
    });
    document.getElementById('selectedAlternative').textContent = `✅ Alternativa ${letter} selecionada`;
    document.getElementById('answerInput').value = letter;
}

// ============ SISTEMA DE DICAS ============
function useHint() {
    if (hintsLeft > 0) {
        hintsLeft--;
        document.getElementById('hintsRemaining').textContent = hintsLeft;
        document.getElementById('questionHint').style.display = 'block';
        document.getElementById('btnShowHint').style.display = 'none';
        
        database.ref('groups/' + currentGroup).update({ hintsUsed: (3 - hintsLeft) });
    } else {
        showFeedback('❌ A equipe esgotou todas as 3 dicas disponíveis!', 'error');
    }
}

// ============ VERIFICAR RESPOSTA ============
function checkAnswer() {
    if (!gameStarted || isGameOver) return;
    
    const question = allQuestions[currentQuestionIndex];
    const userAnswer = document.getElementById('answerInput').value.trim();
    const btn = document.getElementById('btnCheckAnswer');
    
    // Verifica se resposta foi fornecida
    if (question.type === 'multipla') {
        if (!selectedAlternative) {
            return showFeedback('❌ Selecione uma alternativa clicando nela!', 'error');
        }
    } else {
        if (!userAnswer) {
            return showFeedback('❌ Digite a resposta que vocês encontraram!', 'error');
        }
    }
    
    btn.disabled = true;
    let isCorrect = false;
    
    if (question.type === 'multipla') {
        isCorrect = selectedAlternative === question.correctAnswer;
    } else {
        isCorrect = userAnswer.toLowerCase().trim() === question.answer.toLowerCase().trim();
    }
    
    if (isCorrect) {
        document.getElementById('answerInput').style.borderColor = '#27ae60';
        showFeedback(`✅ Cadeado Aberto! Código aceito com sucesso! 🎉`, 'success');
        
        currentQuestionIndex++;
        database.ref('groups/' + currentGroup).update({ 
            currentQuestion: currentQuestionIndex,
            errors: 0
        });
        
        // Verifica se completou TODAS as etapas
        if (currentQuestionIndex >= allQuestions.length) {
            setTimeout(() => {
                winGame();
            }, 1500);
        } else {
            setTimeout(() => {
                showPhaseLocation();
            }, 1500);
        }
    } else {
        document.getElementById('answerInput').style.borderColor = '#e74c3c';
        
        database.ref('groups/' + currentGroup + '/errors').transaction((current) => {
            return (current || 0) + 1;
        });
        
        showFeedback(`❌ Cadeado Travado. Verifiquem a pista e tentem novamente.`, 'error');
        setTimeout(() => { 
            btn.disabled = false;
            if (question.type === 'multipla') {
                // Mantém a seleção
            } else {
                document.getElementById('answerInput').focus();
            }
        }, 1500);
    }
}

function showFeedback(message, type) {
    const div = document.getElementById('feedbackMessage');
    div.textContent = message;
    div.className = `feedback-message ${type}`;
    div.style.display = 'block';
}

// ============ UTILITÁRIOS ============
function renderProgressDots() {
    const container = document.getElementById('progressDots');
    container.innerHTML = '';
    for (let i = 0; i < allQuestions.length; i++) {
        const dot = document.createElement('div');
        dot.className = `progress-dot ${i < currentQuestionIndex ? 'completed' : (i === currentQuestionIndex ? 'current' : 'locked')}`;
        dot.textContent = i + 1;
        container.appendChild(dot);
    }
}

function startTimer() {
    if (timerInterval) return;
    timerInterval = setInterval(() => {
        seconds++;
        const m = Math.floor(seconds / 60).toString().padStart(2, '0');
        const s = (seconds % 60).toString().padStart(2, '0');
        document.getElementById('timerDisplay').textContent = `${m}:${s}`;
        if (seconds % 10 === 0) {
            database.ref('groups/' + currentGroup).update({ time: seconds });
        }
    }, 1000);
}

function winGame() {
    // Para o timer
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
    
    // Marca como completo no banco
    database.ref('groups/' + currentGroup).update({ 
        completed: true, 
        finalTime: seconds 
    });
    
    // Mostra tela de vitória
    isGameOver = true;
    gameStarted = false;
    
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    document.getElementById('winTime').textContent = `${m}:${s}`;
    document.getElementById('winGroup').textContent = currentGroup;
    document.getElementById('winMembers').textContent = currentMembers.join(', ');
    
    switchScreen('winScreen');
}

function resetGame() {
    // Se já completou, não pede confirmação
    if (isGameOver) {
        cleanupAndReset();
        return;
    }
    
    if (currentGroup && !confirm('⚠️ Desistir da caçada e apagar progresso da equipe?')) {
        return;
    }
    
    if (currentGroup) {
        database.ref('groups/' + currentGroup).remove();
    }
    
    cleanupAndReset();
}

function cleanupAndReset() {
    // Limpa listeners e timers
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
    
    // Reseta variáveis
    currentGroup = null;
    currentMembers = [];
    currentQuestionIndex = 0;
    gameStarted = false;
    isGameOver = false;
    seconds = 0;
    hintsLeft = 3;
    selectedAlternative = null;
    
    // Reseta UI
    document.getElementById('timerDisplay').textContent = '00:00';
    document.getElementById('groupNameInput').value = '';
    document.getElementById('membersList').innerHTML = '';
    document.getElementById('feedbackMessage').style.display = 'none';
    document.getElementById('feedbackMessage').className = 'feedback-message';
    document.getElementById('phaseChallenge').classList.remove('active');
    document.getElementById('phaseLocation').classList.add('active');
    document.querySelectorAll('.alt-btn').forEach(btn => btn.classList.remove('selected'));
    document.getElementById('selectedAlternative').textContent = '';
    
    // Adiciona membros padrão
    addMember();
    addMember();
    
    // Volta para tela de login
    switchScreen('loginScreen');
}

function logout() {
    cleanupAndReset();
}

function switchScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(id).classList.add('active');
}

// ============ INICIALIZAÇÃO ============
document.addEventListener('DOMContentLoaded', () => {
    loadQuestions();
    addMember();
    addMember();
    
    document.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            if (document.getElementById('stepCreateGroup').classList.contains('active')) {
                goToConfirm();
            } else if (document.getElementById('stepConfirmGroup').classList.contains('active')) {
                confirmGroup();
            } else if (document.getElementById('phaseChallenge').classList.contains('active')) {
                if (!document.getElementById('btnCheckAnswer').disabled) {
                    checkAnswer();
                }
            }
        }
    });
    
    document.getElementById('answerInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !document.getElementById('btnCheckAnswer').disabled) {
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
window.foundPaper = foundPaper;
window.useHint = useHint;
window.checkAnswer = checkAnswer;
window.selectAlternative = selectAlternative;
window.resetGame = resetGame;
window.logout = logout;