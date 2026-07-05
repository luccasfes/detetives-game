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
let errorsPerQuestion = 0;
let blockedUntil = 0;
let alternativeOrder = [];
let isProcessing = false; // Evita múltiplos cliques
let blockCountdownInterval = null; // 🔥 NOVO: controla o contador em tempo real do bloqueio

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
        
        if (data && data.completed) {
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
    errorsPerQuestion = 0;
    isProcessing = false;
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
    
    // 🔥 RESETA TUDO para a nova questão
    errorsPerQuestion = 0;
    blockedUntil = 0;
    isProcessing = false;
    selectedAlternative = null;
    alternativeOrder = [];
    stopBlockCountdown(); // 🔥 garante que nenhum contador de bloqueio antigo continue rodando
    
    // Reseta botões
    document.querySelectorAll('.alt-btn').forEach(btn => {
        btn.classList.remove('selected');
        btn.disabled = false;
    });
    document.getElementById('selectedAlternative').textContent = '';
    document.getElementById('feedbackMessage').style.display = 'none';
    document.getElementById('btnCheckAnswer').disabled = false;
    document.getElementById('answerInput').disabled = false;
    document.getElementById('answerInput').value = '';
    document.getElementById('answerInput').style.borderColor = '#ddd';
    
    const question = allQuestions[currentQuestionIndex];
    document.getElementById('questionProgress').textContent = currentQuestionIndex + 1;
    
    document.getElementById('phaseChallenge').classList.remove('active');
    document.getElementById('phaseLocation').classList.add('active');
    
    document.getElementById('questionNumberLocation').textContent = `Etapa ${currentQuestionIndex + 1} de ${allQuestions.length}`;
    document.getElementById('locationText').textContent = question.location;
    
    renderProgressDots();
}

// ============ EMBARALHAR ALTERNATIVAS ============
function shuffleAlternatives(alternatives) {
    const indices = alternatives.map((_, i) => i);
    for (let i = indices.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [indices[i], indices[j]] = [indices[j], indices[i]];
    }
    return indices;
}

// ============ FASE 2: RESOLVENDO O DESAFIO ============
function foundPaper() {
    if (isProcessing) return;
    if (currentQuestionIndex >= allQuestions.length) {
        winGame();
        return;
    }
    
    const question = allQuestions[currentQuestionIndex];
    
    document.getElementById('phaseLocation').classList.remove('active');
    document.getElementById('phaseChallenge').classList.add('active');
    
    document.getElementById('questionNumberChallenge').textContent = `Desafio da Etapa ${currentQuestionIndex + 1}`;
    document.getElementById('challengeText').textContent = "🔐 Digite a resposta que vocês encontraram na pista física:";
    
    // Resetar seleção
    selectedAlternative = null;
    document.getElementById('selectedAlternative').textContent = '';
    document.querySelectorAll('.alt-btn').forEach(btn => {
        btn.classList.remove('selected');
        btn.disabled = false;
    });
    
    const descriptiveDiv = document.getElementById('descriptiveInput');
    const multipleDiv = document.getElementById('multipleChoiceInput');
    const answerInput = document.getElementById('answerInput');
    answerInput.value = '';
    answerInput.disabled = false;
    answerInput.style.borderColor = '#ddd';
    
    if (question.type === 'multipla') {
        descriptiveDiv.style.display = 'none';
        multipleDiv.style.display = 'block';
        
        const letters = ['A', 'B', 'C', 'D'];
        const shuffledIndices = shuffleAlternatives(question.alternatives);
        alternativeOrder = shuffledIndices;
        
        const buttons = document.querySelectorAll('.alt-btn');
        buttons.forEach((btn, index) => {
            if (index < shuffledIndices.length) {
                const originalIndex = shuffledIndices[index];
                btn.textContent = `${letters[index]}) ${question.alternatives[originalIndex]}`;
                btn.dataset.originalIndex = originalIndex;
                btn.dataset.letter = letters[index];
                btn.style.display = 'inline-block';
                btn.disabled = false;
            } else {
                btn.style.display = 'none';
            }
        });
    } else {
        descriptiveDiv.style.display = 'block';
        multipleDiv.style.display = 'none';
        answerInput.focus();
    }
    
    document.getElementById('btnCheckAnswer').disabled = false;
    document.getElementById('feedbackMessage').style.display = 'none';
    document.getElementById('feedbackMessage').className = 'feedback-message';
    
    // Dicas
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

// ============ SELECIONAR ALTERNATIVA ============
function selectAlternative(letter) {
    if (isProcessing) return;
    if (Date.now() < blockedUntil) {
        const remaining = Math.ceil((blockedUntil - Date.now()) / 1000);
        showFeedback(`⏳ Aguarde ${remaining} segundos antes de tentar novamente!`, 'error');
        return;
    }
    
    selectedAlternative = letter;
    document.querySelectorAll('.alt-btn').forEach(btn => {
        btn.classList.toggle('selected', btn.dataset.letter === letter);
    });
    document.getElementById('selectedAlternative').textContent = `✅ Alternativa ${letter} selecionada`;
    document.getElementById('answerInput').value = letter;
}

// ============ DICAS ============
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

// ============ BLOQUEIO EM TEMPO REAL ============
// 🔥 NOVO: mostra o tempo de bloqueio contando ao vivo (a cada segundo) e
// reabilita automaticamente os botões/alternativas quando o tempo acabar,
// sem depender de o aluno clicar em nada.
function stopBlockCountdown() {
    if (blockCountdownInterval) {
        clearInterval(blockCountdownInterval);
        blockCountdownInterval = null;
    }
}

function startBlockCountdown(blockSeconds) {
    stopBlockCountdown();

    let remaining = blockSeconds;
    showFeedback(`⛔ Muitas tentativas erradas! Bloqueado por ${remaining} segundos.`, 'error');

    blockCountdownInterval = setInterval(() => {
        remaining--;

        if (remaining > 0) {
            showFeedback(`⛔ Muitas tentativas erradas! Bloqueado por ${remaining} segundos.`, 'error');
        } else {
            stopBlockCountdown();
            blockedUntil = 0;

            // Reabilita tudo automaticamente
            document.querySelectorAll('.alt-btn').forEach(b => b.disabled = false);
            document.getElementById('btnCheckAnswer').disabled = false;
            document.getElementById('answerInput').disabled = false;
            document.getElementById('feedbackMessage').style.display = 'none';

            const question = allQuestions[currentQuestionIndex];
            if (question && question.type !== 'multipla') {
                document.getElementById('answerInput').focus();
            }
        }
    }, 1000);
}

// ============ VERIFICAR RESPOSTA ============
function checkAnswer() {
    // 🔥 IMPEDE PROCESSAMENTO DUPLO
    if (isProcessing) return;
    if (!gameStarted || isGameOver) return;
    if (currentQuestionIndex >= allQuestions.length) {
        winGame();
        return;
    }
    
    if (Date.now() < blockedUntil) {
        const remaining = Math.ceil((blockedUntil - Date.now()) / 1000);
        showFeedback(`⏳ Aguarde ${remaining} segundos antes de tentar novamente!`, 'error');
        return;
    }
    
    const question = allQuestions[currentQuestionIndex];
    const userAnswer = document.getElementById('answerInput').value.trim();
    const btn = document.getElementById('btnCheckAnswer');
    
    // Verifica resposta
    if (question.type === 'multipla') {
        if (!selectedAlternative) {
            return showFeedback('❌ Selecione uma alternativa clicando nela!', 'error');
        }
    } else {
        if (!userAnswer) {
            return showFeedback('❌ Digite a resposta que vocês encontraram!', 'error');
        }
    }
    
    // 🔥 MARCA COMO PROCESSANDO
    isProcessing = true;
    btn.disabled = true;
    
    let isCorrect = false;
    
    if (question.type === 'multipla') {
        const btn = document.querySelector(`.alt-btn[data-letter="${selectedAlternative}"]`);
        if (btn) {
            const originalIndex = parseInt(btn.dataset.originalIndex);
            const letters = ['A', 'B', 'C', 'D'];
            const selectedLetter = letters[originalIndex];
            isCorrect = selectedLetter === question.correctAnswer;
        }
    } else {
        isCorrect = userAnswer.toLowerCase().trim() === question.answer.toLowerCase().trim();
    }
    
    if (isCorrect) {
        // ✅ ACERTOU
        stopBlockCountdown();
        document.getElementById('answerInput').style.borderColor = '#27ae60';
        showFeedback(`✅ Cadeado Aberto! Código aceito com sucesso! 🎉`, 'success');
        
        // Reseta tudo
        blockedUntil = 0;
        errorsPerQuestion = 0;
        selectedAlternative = null;
        document.querySelectorAll('.alt-btn').forEach(b => b.classList.remove('selected'));
        
        // 🔥 ATUALIZA O BANCO COM A PRÓXIMA QUESTÃO
        const nextIndex = currentQuestionIndex + 1;
        database.ref('groups/' + currentGroup).update({ 
            currentQuestion: nextIndex,
            errors: 0,
            time: seconds
        });
        
        // 🔥 ATUALIZA O ÍNDICE LOCAL
        currentQuestionIndex = nextIndex;
        
        // Verifica se terminou
        if (currentQuestionIndex >= allQuestions.length) {
            setTimeout(() => {
                isProcessing = false;
                winGame();
            }, 1500);
        } else {
            setTimeout(() => {
                isProcessing = false;
                showPhaseLocation();
            }, 1500);
        }
    } else {
        // ❌ ERROU
        errorsPerQuestion++;
        document.getElementById('answerInput').style.borderColor = '#e74c3c';
        
        database.ref('groups/' + currentGroup + '/errors').transaction((current) => {
            return (current || 0) + 1;
        });
        
        let errorMessage = '❌ Cadeado Travado. Verifiquem a pista e tentem novamente.';
        let willBlock = false;
        
        // Estratégias anti-chute
        if (errorsPerQuestion >= 3) {
            willBlock = true;
            const blockTime = Math.min(errorsPerQuestion * 3, 15);
            blockedUntil = Date.now() + (blockTime * 1000);
            document.querySelectorAll('.alt-btn').forEach(b => b.disabled = true);
            document.getElementById('btnCheckAnswer').disabled = true;
            document.getElementById('answerInput').disabled = true;
            // 🔥 dispara o contador em tempo real, que reabilita tudo sozinho ao fim
            startBlockCountdown(blockTime);
        } else if (errorsPerQuestion === 2) {
            errorMessage = '⚠️ Cuidado! Essa já é a segunda tentativa errada. Releiam a pista com atenção!';
        } else if (errorsPerQuestion === 1 && question.type === 'multipla') {
            // Re-embaralha
            const letters = ['A', 'B', 'C', 'D'];
            const shuffledIndices = shuffleAlternatives(question.alternatives);
            alternativeOrder = shuffledIndices;
            
            const buttons = document.querySelectorAll('.alt-btn');
            buttons.forEach((btn, index) => {
                if (index < shuffledIndices.length) {
                    const originalIndex = shuffledIndices[index];
                    btn.textContent = `${letters[index]}) ${question.alternatives[originalIndex]}`;
                    btn.dataset.originalIndex = originalIndex;
                    btn.dataset.letter = letters[index];
                }
            });
            
            selectedAlternative = null;
            document.querySelectorAll('.alt-btn').forEach(b => b.classList.remove('selected'));
            document.getElementById('selectedAlternative').textContent = '🔄 Alternativas reorganizadas!';
            errorMessage = '🔄 As alternativas foram reorganizadas. Prestem atenção na pista!';
        }
        
        if (!willBlock) {
            showFeedback(errorMessage, 'error');
        }
        
        setTimeout(() => {
            isProcessing = false;
            // Só reabilita aqui se NÃO estiver em bloqueio -
            // se estiver bloqueado, quem cuida de reabilitar é o startBlockCountdown()
            if (!willBlock) {
                btn.disabled = false;
                document.querySelectorAll('.alt-btn').forEach(b => b.disabled = false);
                if (question.type !== 'multipla') {
                    document.getElementById('answerInput').focus();
                }
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

// ============ PROGRESSO ============
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

// ============ TIMER ============
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

// ============ VITÓRIA ============
function winGame() {
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
    stopBlockCountdown();
    
    database.ref('groups/' + currentGroup).update({ 
        completed: true, 
        finalTime: seconds 
    });
    
    isGameOver = true;
    gameStarted = false;
    isProcessing = false;
    
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    document.getElementById('winTime').textContent = `${m}:${s}`;
    document.getElementById('winGroup').textContent = currentGroup;
    document.getElementById('winMembers').textContent = currentMembers.join(', ');
    
    switchScreen('winScreen');
}

// ============ RESET ============
function resetGame() {
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
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
    stopBlockCountdown();
    
    currentGroup = null;
    currentMembers = [];
    currentQuestionIndex = 0;
    gameStarted = false;
    isGameOver = false;
    seconds = 0;
    hintsLeft = 3;
    selectedAlternative = null;
    errorsPerQuestion = 0;
    blockedUntil = 0;
    alternativeOrder = [];
    isProcessing = false;
    
    document.getElementById('timerDisplay').textContent = '00:00';
    document.getElementById('groupNameInput').value = '';
    document.getElementById('membersList').innerHTML = '';
    document.getElementById('feedbackMessage').style.display = 'none';
    document.getElementById('feedbackMessage').className = 'feedback-message';
    document.getElementById('phaseChallenge').classList.remove('active');
    document.getElementById('phaseLocation').classList.add('active');
    document.querySelectorAll('.alt-btn').forEach(btn => {
        btn.classList.remove('selected');
        btn.disabled = false;
    });
    document.getElementById('selectedAlternative').textContent = '';
    document.getElementById('answerInput').value = '';
    document.getElementById('answerInput').disabled = false;
    
    addMember();
    addMember();
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
                if (!document.getElementById('btnCheckAnswer').disabled && !isProcessing) {
                    checkAnswer();
                }
            }
        }
    });
    
    document.getElementById('answerInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !document.getElementById('btnCheckAnswer').disabled && !isProcessing) {
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