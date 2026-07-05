let allQuestions = [];
let currentGroup = null;
let currentMembers = [];
let currentQuestionIndex = 0;
let timerInterval = null;
let seconds = 0;
let gameStarted = false;
let hintsLeft = 3; 

// ============ CARREGAR DADOS DA ESCOLA ============
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
    row.innerHTML = `<span class="member-number">${memberCount}</span><input type="text" placeholder="Nome do detetive" class="input-field" style="margin:0;">`;
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

// ============ FLUXO DE LOGIN (SEM CHECAGEM DE NOME DUPLA) ============
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
            const match = members.every(m => existingMembers.includes(m)) && existingMembers.every(m => members.includes(m));
            if (!match) return errorDiv.textContent = '❌ Esta equipe já existe com outros integrantes!';
        }
        
        currentGroup = groupName; // Guarda direto no estado global
        currentMembers = members;
        
        document.getElementById('previewGroupName').textContent = groupName;
        document.getElementById('previewMembers').innerHTML = members.map(m => `<span class="member-tag-preview">${m}</span>`).join(' ');
        
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
        
        currentQuestionIndex = data ? (data.currentQuestion || 0) : 0;
        
        if (data && data.completed) {
            winGame();
            return;
        }

        if (!data) {
            database.ref('groups/' + currentGroup).set({
                members: currentMembers, 
                currentQuestion: 0, 
                started: false, 
                completed: false, 
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
    if (currentQuestionIndex >= allQuestions.length) return winGame();
    
    const question = allQuestions[currentQuestionIndex];
    document.getElementById('questionProgress').textContent = currentQuestionIndex;
    
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
    document.getElementById('challengeText').textContent = question.challenge;
    
    // Reseta visual e botão
    const input = document.getElementById('answerInput');
    input.value = '';
    input.style.borderColor = '#ddd';
    input.focus();
    
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

// ============ SISTEMA DE DICAS E VERIFICAÇÃO ============
function useHint() {
    if (hintsLeft > 0) {
        hintsLeft--;
        document.getElementById('hintsRemaining').textContent = hintsLeft;
        document.getElementById('questionHint').style.display = 'block'; 
        document.getElementById('btnShowHint').style.display = 'none'; 
    } else {
        showFeedback('❌ A equipe esgotou todas as 3 dicas disponíveis na missão!', 'error');
    }
}

function checkAnswer() {
    if (!gameStarted) return;
    
    const question = allQuestions[currentQuestionIndex];
    const userAnswer = document.getElementById('answerInput').value.trim().toLowerCase();
    const btn = document.getElementById('btnCheckAnswer');
    
    if (!userAnswer) return showFeedback('❌ Digite o resultado numérico que vocês encontraram!', 'error');
    
    btn.disabled = true;
    const isCorrect = userAnswer === question.answer.toLowerCase().trim();
    
    if (isCorrect) {
        document.getElementById('answerInput').style.borderColor = '#27ae60';
        showFeedback(`✅ Cadeado Aberto! Código aceito com sucesso! 🎉`, 'success');
        
        currentQuestionIndex++;
        database.ref('groups/' + currentGroup).update({ currentQuestion: currentQuestionIndex });
        
        setTimeout(() => {
            if (currentQuestionIndex >= allQuestions.length) winGame();
            else showPhaseLocation();
        }, 2000);
    } else {
        document.getElementById('answerInput').style.borderColor = '#e74c3c';
        showFeedback(`❌ Cadeado Travado. Verifiquem o cálculo e tentem novamente.`, 'error');
        setTimeout(() => { btn.disabled = false; }, 1500);
    }
}

function showFeedback(message, type) {
    const div = document.getElementById('feedbackMessage');
    div.textContent = message;
    div.className = `feedback-message ${type}`;
    div.style.display = 'block';
}

// ============ SISTEMA CENTRAL ============
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
        if (seconds % 10 === 0) database.ref('groups/' + currentGroup).update({ time: seconds });
    }, 1000);
}

function winGame() {
    clearInterval(timerInterval);
    timerInterval = null;
    document.getElementById('winTime').textContent = document.getElementById('timerDisplay').textContent;
    document.getElementById('winGroup').textContent = currentGroup;
    document.getElementById('winMembers').textContent = currentMembers.join(', ');
    switchScreen('winScreen');
    database.ref('groups/' + currentGroup).update({ completed: true, finalTime: seconds });
}

function resetGame() {
    if (currentGroup && confirm('⚠️ Desistir da caçada e apagar progresso da equipe?')) {
        database.ref('groups/' + currentGroup).remove();
    } else if (currentGroup) {
        return;
    }
    
    currentGroup = null; currentMembers = []; currentQuestionIndex = 0; gameStarted = false; seconds = 0; hintsLeft = 3;
    if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
    
    document.getElementById('timerDisplay').textContent = '00:00';
    document.getElementById('groupNameInput').value = '';
    document.getElementById('membersList').innerHTML = '';
    addMember(); addMember();
    switchScreen('loginScreen');
}

function logout() {
    resetGame();
}

function switchScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(id).classList.add('active');
}

// ============ INICIADORES E EVENTOS ============
document.addEventListener('DOMContentLoaded', () => {
    loadQuestions(); 
    addMember(); 
    addMember();
    
    document.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            if (document.getElementById('stepCreateGroup').classList.contains('active')) goToConfirm();
            else if (document.getElementById('stepConfirmGroup').classList.contains('active')) confirmGroup();
            else if (document.getElementById('phaseChallenge').classList.contains('active')) {
                if (!document.getElementById('btnCheckAnswer').disabled) checkAnswer();
            }
        }
    });
});

window.addMember = addMember; window.removeLastMember = removeLastMember;
window.goToConfirm = goToConfirm; window.goBackToCreate = goBackToCreate; window.confirmGroup = confirmGroup;
window.foundPaper = foundPaper; window.useHint = useHint; window.checkAnswer = checkAnswer;
window.resetGame = resetGame; window.logout = logout;