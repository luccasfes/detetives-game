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
let isProcessing = false; 
let blockCountdownInterval = null; 
let stageStartSeconds = 0; 
let challengeSetupIndex = -1;
let pendingShowPhaseLocation = false; // 🔥 true quando a Etapa 1 tentou renderizar mas as perguntas ainda não tinham chegado do Firebase

// ============ CARREGAR DADOS ============
function loadQuestions() {
    database.ref('questions').on('value', (snapshot) => {
        const data = snapshot.val();
        if (data) {
            allQuestions = Object.values(data).sort((a, b) => (a.order || 0) - (b.order || 0));
            document.getElementById('totalQuestions').textContent = allQuestions.length;
            if (gameStarted) renderProgressDots();
            // 🔥 Se a Etapa 1 ficou esperando as perguntas chegarem, renderiza agora que os dados já chegaram
            if (gameStarted && pendingShowPhaseLocation) {
                showPhaseLocation();
            }
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
    // 🔥 Se as perguntas ainda não chegaram do Firebase, NÃO finaliza o jogo -
    // só espera e mostra um aviso. Sem essa checagem, o jogo entendia "0 perguntas
    // carregadas" como "já terminamos tudo" e marcava a equipe como concluída.
    if (allQuestions.length === 0) {
        pendingShowPhaseLocation = true;
        document.getElementById('phaseChallenge').classList.remove('active');
        document.getElementById('phaseLocation').classList.add('active');
        document.getElementById('questionNumberLocation').textContent = 'Carregando...';
        document.getElementById('locationText').textContent = '⏳ Carregando as pistas da missão, aguarde um instante...';
        return;
    }
    pendingShowPhaseLocation = false;

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
    stageStartSeconds = seconds; // 🔥 marca o início da etapa (para medir quanto tempo o grupo levou nela)
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

    if (challengeSetupIndex === currentQuestionIndex) {
        document.getElementById('phaseLocation').classList.remove('active');
        document.getElementById('phaseChallenge').classList.add('active');
        return;
    }
    challengeSetupIndex = currentQuestionIndex;

    const question = allQuestions[currentQuestionIndex];
    const descriptiveDiv = document.getElementById('descriptiveInput');
    const multipleDiv = document.getElementById('multipleChoiceInput');
    const answerInput = document.getElementById('answerInput');
    const checkButton = document.getElementById('btnCheckAnswer');
    const challengeTitle = document.querySelector('#phaseChallenge h2');
    const challengeText = document.getElementById('challengeText');
    const hintElement = document.getElementById('questionHint');
    const hintButton = document.getElementById('btnShowHint');

    document.getElementById('phaseLocation').classList.remove('active');
    document.getElementById('phaseChallenge').classList.add('active');

    // Restaura o botão porque a etapa final troca seu texto e sua ação.
    checkButton.disabled = false;
    checkButton.textContent = '✅ Tentar Abrir Cadeado';
    checkButton.onclick = checkAnswer;
    if (challengeTitle) challengeTitle.textContent = '🔐 O Cadeado Numérico';

    document.getElementById('questionNumberChallenge').textContent = `Desafio da Etapa ${currentQuestionIndex + 1}`;
    challengeText.textContent = '🔐 Digite a resposta que vocês encontraram na pista física:';

    // Resetar seleção
    selectedAlternative = null;
    document.getElementById('selectedAlternative').textContent = '';
    document.querySelectorAll('.alt-btn').forEach(btn => {
        btn.classList.remove('selected');
        btn.disabled = false;
    });

    answerInput.value = '';
    answerInput.disabled = false;
    answerInput.style.borderColor = '#ddd';
    document.getElementById('feedbackMessage').style.display = 'none';
    document.getElementById('feedbackMessage').className = 'feedback-message';

    // 🎉 ETAPA FINAL: não existe resposta para corrigir.
    if (question.type === 'final') {
        document.getElementById('questionNumberChallenge').textContent = `Etapa ${currentQuestionIndex + 1} - Final`;
        if (challengeTitle) challengeTitle.textContent = '🎉 Tesouro Encontrado!';
        challengeText.textContent = question.challenge || 'Parabéns! Vocês encontraram o tesouro!';

        descriptiveDiv.style.display = 'none';
        multipleDiv.style.display = 'none';
        hintElement.style.display = 'none';
        hintButton.style.display = 'none';

        checkButton.textContent = '🎊 Uhul! Finalizar Caçada';
        checkButton.onclick = finishFinalStage;
        return;
    }

    if (question.type === 'multipla') {
        descriptiveDiv.style.display = 'none';
        multipleDiv.style.display = 'block';

        const alternatives = question.alternatives || [];
        const letters = ['A', 'B', 'C', 'D'];
        const shuffledIndices = shuffleAlternatives(alternatives);
        alternativeOrder = shuffledIndices;

        const buttons = document.querySelectorAll('.alt-btn');
        buttons.forEach((btn, index) => {
            if (index < shuffledIndices.length) {
                const originalIndex = shuffledIndices[index];
                btn.textContent = `${letters[index]}) ${alternatives[originalIndex]}`;
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

    // Dicas
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

// ============ FINALIZAR ETAPA COMEMORATIVA ============
function finishFinalStage() {
    if (isProcessing || !gameStarted || isGameOver) return;

    const question = allQuestions[currentQuestionIndex];
    if (!question || question.type !== 'final') return;

    isProcessing = true;
    const button = document.getElementById('btnCheckAnswer');
    button.disabled = true;

    const timeSpentOnStage = Math.max(0, seconds - stageStartSeconds);
    const updates = {
        // A etapa "final" encerra a caça, mesmo sem resposta.
        currentQuestion: allQuestions.length,
        time: seconds
    };

    if (question.id) {
        updates[`questionStats/${question.id}/order`] = question.order || (currentQuestionIndex + 1);
        updates[`questionStats/${question.id}/errors`] = 0;
        updates[`questionStats/${question.id}/timeSpent`] = timeSpentOnStage;
    }

    database.ref('groups/' + currentGroup).update(updates).then(() => {
        currentQuestionIndex = allQuestions.length;
        errorsPerQuestion = 0;
        isProcessing = false;
        winGame();
    }).catch(() => {
        isProcessing = false;
        button.disabled = false;
        showFeedback('❌ Não foi possível finalizar agora. Tentem novamente.', 'error');
    });
}

// ============ VOLTAR PRA PISTA (sem resetar progresso) ============
function voltarParaPista() {
    if (!gameStarted || isGameOver) return;
    if (typeof gamePaused !== 'undefined' && gamePaused) {
        showAnnouncement('A caçada está pausada. Aguardem a liberação.');
        return;
    }
    document.getElementById('phaseChallenge').classList.remove('active');
    document.getElementById('phaseLocation').classList.add('active');
}
window.voltarParaPista = voltarParaPista;

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

    // Segurança extra: etapa final nunca deve passar pela correção de resposta.
    if (question.type === 'final') {
        finishFinalStage();
        return;
    }

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
        selectedAlternative = null;
        document.querySelectorAll('.alt-btn').forEach(b => b.classList.remove('selected'));
        
        // 🔥 ATUALIZA O BANCO COM A PRÓXIMA QUESTÃO + ESTATÍSTICAS DA ETAPA (numa única escrita)
        // Importante: NÃO zeramos "errors" aqui — esse campo é o total acumulado da caçada inteira
        // e já é incrementado à parte (na transaction lá embaixo, quando o grupo erra).
        const nextIndex = currentQuestionIndex + 1;
        const timeSpentOnStage = Math.max(0, seconds - stageStartSeconds);
        const updates = {
            currentQuestion: nextIndex,
            time: seconds
        };
        if (question.id) {
            updates[`questionStats/${question.id}/order`] = question.order || (currentQuestionIndex + 1);
            updates[`questionStats/${question.id}/errors`] = errorsPerQuestion;
            updates[`questionStats/${question.id}/timeSpent`] = timeSpentOnStage;
        }
        database.ref('groups/' + currentGroup).update(updates);
        
        // Zera os erros locais desta etapa (não o total do grupo) para a próxima pergunta
        errorsPerQuestion = 0;
        
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
    stageStartSeconds = 0;
    pendingShowPhaseLocation = false;
    challengeSetupIndex = -1;
    
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
window.finishFinalStage = finishFinalStage;
window.useHint = useHint;
window.checkAnswer = checkAnswer;
window.selectAlternative = selectAlternative;
window.resetGame = resetGame;
window.logout = logout;
// ============================================================================
// PACOTE INTERATIVO — pontuação, efeitos, medalhas e comandos ao vivo
// Esta seção foi adicionada sem exigir mudanças no index.html ou styles.css.
// ============================================================================
let gameScore = 0;
let firstTryCount = 0;
let stageHintUsed = false;
let soundEnabled = true;
let gamePaused = false;
let resumeCurrentStage = false;
let audioContext = null;
let lastAnnouncementAt = 0;
let lastGroupCommandAt = 0;
let groupCommandRef = null;
let groupScoreRef = null;
let pauseControlRef = null;
let announcementControlRef = null;

function injectInteractiveStyles() {
    if (document.getElementById('interactiveGameStyles')) return;

    const style = document.createElement('style');
    style.id = 'interactiveGameStyles';
    style.textContent = `
        .interactive-score-pill {
            display: inline-flex; align-items: center; justify-content: center;
            gap: 6px; min-width: 105px; padding: 9px 14px; border-radius: 999px;
            background: linear-gradient(135deg, #fff4bd, #f6c453);
            color: #4d3700; font-weight: 900; box-shadow: 0 4px 12px rgba(0,0,0,.16);
            border: 2px solid rgba(112,75,0,.22);
        }
        .interactive-sound-button {
            border: 0; border-radius: 999px; padding: 9px 12px; cursor: pointer;
            background: #1b2436; color: #fff; font-weight: 800;
            box-shadow: 0 4px 12px rgba(0,0,0,.16);
        }
        .interactive-announcement {
            position: fixed; z-index: 10050; left: 50%; top: 18px;
            transform: translate(-50%, -140%); opacity: 0;
            width: min(92vw, 620px); padding: 15px 18px; border-radius: 14px;
            background: #1b2436; color: #fff; font-weight: 800; text-align: center;
            box-shadow: 0 14px 40px rgba(0,0,0,.3); transition: .35s ease;
            border: 2px solid #f6c453;
        }
        .interactive-announcement.show { transform: translate(-50%, 0); opacity: 1; }
        .interactive-points-toast {
            position: fixed; z-index: 10060; left: 50%; bottom: 24px;
            transform: translate(-50%, 120px) scale(.85); opacity: 0;
            padding: 14px 20px; border-radius: 16px; background: #fff8df;
            color: #4d3700; font-weight: 900; text-align: center;
            box-shadow: 0 12px 35px rgba(0,0,0,.25); border: 3px solid #f6c453;
            transition: .3s ease; pointer-events: none;
        }
        .interactive-points-toast.show { transform: translate(-50%, 0) scale(1); opacity: 1; }
        .interactive-points-toast small { display:block; margin-top:4px; font-weight:700; opacity:.78; }
        .interactive-pause-overlay {
            position: fixed; inset: 0; z-index: 10040; display: none;
            align-items: center; justify-content: center; padding: 25px;
            background: rgba(13,20,33,.86); backdrop-filter: blur(5px);
        }
        .interactive-pause-overlay.show { display: flex; }
        .interactive-pause-card {
            width: min(92vw, 520px); padding: 30px; border-radius: 22px;
            background: #fffaf0; text-align: center; box-shadow: 0 18px 55px rgba(0,0,0,.35);
            border: 4px solid #f6c453;
        }
        .interactive-pause-card .pause-icon { font-size: 4rem; display:block; animation: pausePulse 1.3s infinite; }
        @keyframes pausePulse { 50% { transform: scale(1.08); } }
        .interactive-confetti {
            position: fixed; z-index: 10100; top: -20px; width: 11px; height: 18px;
            border-radius: 3px; pointer-events: none;
            animation: confettiFall var(--fall, 2.7s) linear forwards;
        }
        @keyframes confettiFall {
            to { transform: translate(var(--drift, 0px), 110vh) rotate(900deg); opacity: .2; }
        }
        .interactive-win-summary {
            margin: 22px auto 0; width: min(100%, 620px); padding: 18px;
            border-radius: 18px; background: #fff8df; border: 3px solid #f6c453;
            box-shadow: 0 8px 24px rgba(0,0,0,.12);
        }
        .interactive-win-score { font-size: 1.55rem; font-weight: 900; color:#6d4c00; }
        .interactive-badges { display:flex; flex-wrap:wrap; justify-content:center; gap:9px; margin-top:13px; }
        .interactive-badge {
            padding: 8px 12px; border-radius: 999px; background:#1b2436; color:#fff;
            font-size:.9rem; font-weight:800; box-shadow:0 4px 10px rgba(0,0,0,.12);
        }
        @media (max-width: 720px) {
            #gameScreen .game-header { gap: 8px; }
            .interactive-score-pill { min-width: 88px; padding: 8px 10px; }
            .interactive-sound-button { padding: 8px 10px; }
        }
    `;
    document.head.appendChild(style);
}

function ensureInteractiveGameUI() {
    injectInteractiveStyles();

    const header = document.querySelector('#gameScreen .game-header');
    if (header && !document.getElementById('scoreDisplay')) {
        const scorePill = document.createElement('div');
        scorePill.className = 'interactive-score-pill';
        scorePill.innerHTML = '⭐ <span id="scoreDisplay">0</span> pts';
        header.appendChild(scorePill);

        const soundButton = document.createElement('button');
        soundButton.id = 'soundToggleButton';
        soundButton.className = 'interactive-sound-button';
        soundButton.type = 'button';
        soundButton.onclick = toggleSound;
        soundButton.textContent = '🔊 Som';
        header.appendChild(soundButton);
    }

    if (!document.getElementById('interactiveAnnouncement')) {
        const announcement = document.createElement('div');
        announcement.id = 'interactiveAnnouncement';
        announcement.className = 'interactive-announcement';
        document.body.appendChild(announcement);
    }

    if (!document.getElementById('interactivePointsToast')) {
        const toast = document.createElement('div');
        toast.id = 'interactivePointsToast';
        toast.className = 'interactive-points-toast';
        document.body.appendChild(toast);
    }

    if (!document.getElementById('interactivePauseOverlay')) {
        const overlay = document.createElement('div');
        overlay.id = 'interactivePauseOverlay';
        overlay.className = 'interactive-pause-overlay';
        overlay.innerHTML = `
            <div class="interactive-pause-card">
                <span class="pause-icon">⏸️</span>
                <h2>Caçada pausada pelo professor</h2>
                <p>Aguardem a Central de Investigação liberar a continuação.</p>
            </div>
        `;
        document.body.appendChild(overlay);
    }

    const winContent = document.querySelector('#winScreen .win-content');
    if (winContent && !document.getElementById('interactiveWinSummary')) {
        const summary = document.createElement('div');
        summary.id = 'interactiveWinSummary';
        summary.className = 'interactive-win-summary';
        summary.innerHTML = `
            <div class="interactive-win-score">⭐ Pontuação: <span id="winScore">0</span></div>
            <div id="winScoreDetails" style="margin-top:6px;color:#6d4c00;font-weight:700;"></div>
            <div id="winBadges" class="interactive-badges"></div>
        `;
        const winDetails = winContent.querySelector('.win-details');
        if (winDetails) winDetails.insertAdjacentElement('afterend', summary);
        else winContent.appendChild(summary);
    }

    updateScoreUI();
}

function updateScoreUI() {
    const scoreElement = document.getElementById('scoreDisplay');
    if (scoreElement) scoreElement.textContent = Math.max(0, Math.round(gameScore || 0));
}

function toggleSound() {
    soundEnabled = !soundEnabled;
    const button = document.getElementById('soundToggleButton');
    if (button) button.textContent = soundEnabled ? '🔊 Som' : '🔇 Mudo';
    if (soundEnabled) playGameSound('hint');
}

function playGameSound(type) {
    if (!soundEnabled) return;

    try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;
        if (!audioContext) audioContext = new AudioCtx();
        if (audioContext.state === 'suspended') audioContext.resume();

        const patterns = {
            success: [[523, 0, .11], [659, .11, .11], [784, .22, .2]],
            error: [[190, 0, .16], [125, .14, .24]],
            hint: [[440, 0, .1], [660, .12, .14]],
            win: [[523, 0, .13], [659, .14, .13], [784, .28, .13], [1046, .43, .35]]
        };
        const notes = patterns[type] || patterns.hint;
        const start = audioContext.currentTime;

        notes.forEach(([frequency, delay, duration]) => {
            const oscillator = audioContext.createOscillator();
            const gain = audioContext.createGain();
            oscillator.type = type === 'error' ? 'sawtooth' : 'sine';
            oscillator.frequency.value = frequency;
            gain.gain.setValueAtTime(.0001, start + delay);
            gain.gain.exponentialRampToValueAtTime(.18, start + delay + .015);
            gain.gain.exponentialRampToValueAtTime(.0001, start + delay + duration);
            oscillator.connect(gain);
            gain.connect(audioContext.destination);
            oscillator.start(start + delay);
            oscillator.stop(start + delay + duration + .02);
        });
    } catch (error) {
        // O jogo continua normalmente caso o navegador bloqueie áudio.
    }
}

function vibrateDevice(pattern) {
    if ('vibrate' in navigator) navigator.vibrate(pattern);
}

function launchConfetti(amount = 45) {
    const colors = ['#f6c453', '#e74c3c', '#3498db', '#2ecc71', '#9b59b6', '#ff7f50'];
    for (let i = 0; i < amount; i++) {
        const piece = document.createElement('span');
        piece.className = 'interactive-confetti';
        piece.style.left = `${Math.random() * 100}vw`;
        piece.style.background = colors[Math.floor(Math.random() * colors.length)];
        piece.style.setProperty('--fall', `${2.1 + Math.random() * 2.2}s`);
        piece.style.setProperty('--drift', `${-130 + Math.random() * 260}px`);
        piece.style.animationDelay = `${Math.random() * .45}s`;
        document.body.appendChild(piece);
        setTimeout(() => piece.remove(), 5000);
    }
}

function showPointsToast(points, detail) {
    ensureInteractiveGameUI();
    const toast = document.getElementById('interactivePointsToast');
    if (!toast) return;
    toast.innerHTML = `+${points} pontos<small>${detail}</small>`;
    toast.classList.add('show');
    clearTimeout(showPointsToast.timeoutId);
    showPointsToast.timeoutId = setTimeout(() => toast.classList.remove('show'), 2500);
}

function showAnnouncement(message, duration = 5000) {
    if (!message) return;
    ensureInteractiveGameUI();
    const element = document.getElementById('interactiveAnnouncement');
    if (!element) return;
    element.textContent = `📢 ${message}`;
    element.classList.add('show');
    playGameSound('hint');
    clearTimeout(showAnnouncement.timeoutId);
    showAnnouncement.timeoutId = setTimeout(() => element.classList.remove('show'), duration);
}

function setGamePaused(paused) {
    gamePaused = Boolean(paused);
    const overlay = document.getElementById('interactivePauseOverlay');
    if (overlay) overlay.classList.toggle('show', gamePaused && gameStarted && !isGameOver);
    if (!gamePaused && gameStarted) showAnnouncement('A caçada foi liberada. Podem continuar!', 3200);
}

function attachGlobalControlListeners() {
    if (typeof database === 'undefined') return;

    if (pauseControlRef) pauseControlRef.off();
    if (announcementControlRef) announcementControlRef.off();

    pauseControlRef = database.ref('gameControl/paused');
    pauseControlRef.on('value', snapshot => setGamePaused(Boolean(snapshot.val())));

    // 🔥 CORREÇÃO: o aviso do professor fica salvo no Firebase para sempre (até ser
    // sobrescrito por um novo). Sem esse controle, toda vez que uma equipe entrava
    // no jogo, o listener disparava com o ÚLTIMO aviso já enviado (mesmo que antigo)
    // e mostrava de novo, como se fosse novidade.
    let isFirstAnnouncementSnapshot = true;
    announcementControlRef = database.ref('gameControl/announcement');
    announcementControlRef.on('value', snapshot => {
        const data = snapshot.val();

        // Na primeira leitura, só registra o que já existia ali - não exibe nada.
        if (isFirstAnnouncementSnapshot) {
            isFirstAnnouncementSnapshot = false;
            lastAnnouncementAt = (data && data.createdAt) ? data.createdAt : 0;
            return;
        }

        if (!data || !data.message || !data.createdAt) return;
        if (data.createdAt <= lastAnnouncementAt) return;
        lastAnnouncementAt = data.createdAt;
        showAnnouncement(data.message);
    });
}

function detachGroupControlListeners() {
    if (groupCommandRef) groupCommandRef.off();
    if (groupScoreRef) groupScoreRef.off();
    groupCommandRef = null;
    groupScoreRef = null;
}

function attachGroupControlListeners() {
    detachGroupControlListeners();
    if (!currentGroup || typeof database === 'undefined') return;

    groupScoreRef = database.ref(`groups/${currentGroup}/score`);
    groupScoreRef.on('value', snapshot => {
        const value = Number(snapshot.val());
        if (Number.isFinite(value)) {
            gameScore = value;
            updateScoreUI();
        }
    });

    lastGroupCommandAt = Date.now();
    groupCommandRef = database.ref(`gameControl/groupCommands/${currentGroup}`);
    groupCommandRef.on('value', snapshot => {
        const command = snapshot.val();
        if (!command || !command.createdAt || command.createdAt <= lastGroupCommandAt) return;
        lastGroupCommandAt = command.createdAt;
        handleGroupCommand(command);
    });
}

function handleGroupCommand(command) {
    switch (command.type) {
        case 'message':
            showAnnouncement(command.message || 'Mensagem da Central de Investigação.');
            break;
        case 'bonusHint':
            hintsLeft = Math.min(3, hintsLeft + 1);
            document.getElementById('hintsRemaining').textContent = hintsLeft;
            database.ref(`groups/${currentGroup}`).update({ hintsUsed: Math.max(0, 3 - hintsLeft) });
            showAnnouncement('O professor concedeu uma dica extra para a equipe!');
            break;
        case 'advance':
            forceAdvanceFromAdmin(command.targetIndex);
            break;
        case 'reset':
            showAnnouncement('O professor reiniciou o progresso da equipe.', 2800);
            setTimeout(() => cleanupAndReset(), 900);
            break;
    }
}

function forceAdvanceFromAdmin(targetIndex) {
    if (!gameStarted || isGameOver) return;

    const requestedIndex = Number(targetIndex);
    const nextIndex = Number.isFinite(requestedIndex)
        ? Math.min(Math.max(requestedIndex, currentQuestionIndex + 1), allQuestions.length)
        : Math.min(currentQuestionIndex + 1, allQuestions.length);

    stopBlockCountdown();
    isProcessing = true;
    blockedUntil = 0;
    selectedAlternative = null;
    errorsPerQuestion = 0;
    stageHintUsed = false;
    currentQuestionIndex = nextIndex;

    database.ref(`groups/${currentGroup}`).update({
        currentQuestion: nextIndex,
        time: seconds,
        currentStageHintUsed: false,
        currentStageErrors: 0
    });

    showAnnouncement('A Central liberou o avanço para a próxima etapa!');
    setTimeout(() => {
        isProcessing = false;
        if (currentQuestionIndex >= allQuestions.length) winGame();
        else showPhaseLocation();
    }, 700);
}

function normalizeGameAnswer(value) {
    return String(value ?? '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim()
        .replace(/\s+/g, ' ');
}

function descriptiveAnswerIsCorrect(userAnswer, configuredAnswer) {
    const acceptedAnswers = String(configuredAnswer ?? '')
        .split('|')
        .map(normalizeGameAnswer)
        .filter(Boolean);
    return acceptedAnswers.includes(normalizeGameAnswer(userAnswer));
}

function calculateStagePoints(timeSpent) {
    const base = 100;
    const firstTryBonus = errorsPerQuestion === 0 ? 50 : 0;
    const noHintBonus = stageHintUsed ? 0 : 25;
    const speedBonus = Math.max(0, 30 - Math.floor(Math.max(0, timeSpent) / 30) * 5);
    const errorPenalty = errorsPerQuestion * 10;
    const points = Math.max(20, base + firstTryBonus + noHintBonus + speedBonus - errorPenalty);
    return { points, base, firstTryBonus, noHintBonus, speedBonus, errorPenalty };
}

function awardStagePoints(question, scoring, timeSpent, isFinal = false) {
    const points = isFinal ? 100 : scoring.points;
    gameScore += points;
    updateScoreUI();

    database.ref(`groups/${currentGroup}/score`).transaction(current => (Number(current) || 0) + points);

    if (!isFinal && errorsPerQuestion === 0) {
        firstTryCount++;
        database.ref(`groups/${currentGroup}/firstTryCount`).transaction(current => (Number(current) || 0) + 1);
    }

    if (question && question.id) {
        database.ref(`groups/${currentGroup}/stageScores/${question.id}`).set({
            order: question.order || currentQuestionIndex + 1,
            points,
            timeSpent,
            errors: isFinal ? 0 : errorsPerQuestion,
            usedHint: isFinal ? false : stageHintUsed,
            firstTry: isFinal ? true : errorsPerQuestion === 0,
            updatedAt: Date.now()
        });
    }

    const detail = isFinal
        ? 'Bônus por concluir a investigação'
        : `${errorsPerQuestion === 0 ? 'acerto de primeira' : `${errorsPerQuestion} erro(s)`}${stageHintUsed ? ' • dica usada' : ' • sem dica'}`;
    showPointsToast(points, detail);
    return points;
}

function renderWinSummary(groupData = {}) {
    ensureInteractiveGameUI();
    const scoreValue = Number(groupData.score ?? gameScore) || 0;
    const errors = Number(groupData.errors) || 0;
    const hints = Number(groupData.hintsUsed) || 0;
    const firstTries = Number(groupData.firstTryCount ?? firstTryCount) || 0;
    const finalTime = Number(groupData.finalTime ?? seconds) || 0;
    const regularStages = allQuestions.filter(q => q.type !== 'final').length;

    const winScore = document.getElementById('winScore');
    const details = document.getElementById('winScoreDetails');
    const badgesContainer = document.getElementById('winBadges');
    if (winScore) winScore.textContent = Math.round(scoreValue);
    if (details) details.textContent = `${firstTries} acerto(s) de primeira • ${errors} erro(s) • ${hints} dica(s)`;

    const badges = ['🏆 Caso Encerrado'];
    if (errors === 0) badges.push('🎯 Precisão Perfeita');
    if (hints === 0) badges.push('🧠 Sem Dicas');
    if (regularStages > 0 && firstTries >= regularStages) badges.push('⚡ Mestre de Primeira');
    if (regularStages > 0 && finalTime <= regularStages * 90) badges.push('🚀 Investigação Relâmpago');
    if (scoreValue >= Math.max(300, regularStages * 165)) badges.push('⭐ Pontuação Lendária');

    if (badgesContainer) {
        badgesContainer.innerHTML = '';
        badges.forEach(label => {
            const badge = document.createElement('span');
            badge.className = 'interactive-badge';
            badge.textContent = label;
            badgesContainer.appendChild(badge);
        });
    }
}

// Guarda as implementações corrigidas que já existiam antes do pacote interativo.
const baseShowPhaseLocationInteractive = showPhaseLocation;
const baseFoundPaperInteractive = foundPaper;
const baseSelectAlternativeInteractive = selectAlternative;
const baseUseHintInteractive = useHint;
const baseCleanupAndResetInteractive = cleanupAndReset;

confirmGroup = function confirmGroupInteractive() {
    const errorDiv = document.getElementById('confirmError');
    errorDiv.textContent = 'Conectando à base...';

    database.ref(`groups/${currentGroup}`).once('value').then(snapshot => {
        const data = snapshot.exists() ? snapshot.val() : null;

        if (data && data.completed) {
            currentMembers = data.members || [];
            isGameOver = true;
            gameStarted = false;
            seconds = data.finalTime || data.time || 0;
            gameScore = Number(data.score) || 0;
            firstTryCount = Number(data.firstTryCount) || 0;
            const m = Math.floor(seconds / 60).toString().padStart(2, '0');
            const s = (seconds % 60).toString().padStart(2, '0');
            document.getElementById('winTime').textContent = `${m}:${s}`;
            document.getElementById('winGroup').textContent = currentGroup;
            document.getElementById('winMembers').textContent = currentMembers.join(', ');
            renderWinSummary(data);
            switchScreen('winScreen');
            playGameSound('win');
            launchConfetti(90);
            return;
        }

        currentQuestionIndex = data ? Number(data.currentQuestion || 0) : 0;
        seconds = data ? Number(data.time || 0) : 0;
        gameScore = data ? Number(data.score || 0) : 0;
        firstTryCount = data ? Number(data.firstTryCount || 0) : 0;
        hintsLeft = data ? Math.max(0, 3 - Number(data.hintsUsed || 0)) : 3;
        stageHintUsed = Boolean(data && data.currentStageHintUsed);
        errorsPerQuestion = data ? Number(data.currentStageErrors || 0) : 0;
        resumeCurrentStage = Boolean(data && data.started);

        if (!data) {
            return database.ref(`groups/${currentGroup}`).set({
                members: currentMembers,
                currentQuestion: 0,
                started: false,
                completed: false,
                errors: 0,
                hintsUsed: 0,
                score: 0,
                firstTryCount: 0,
                time: 0,
                currentStageHintUsed: false,
                currentStageErrors: 0,
                createdAt: Date.now()
            }).then(startGame);
        }
        startGame();
    }).catch(() => {
        errorDiv.textContent = '❌ Erro de conexão com o servidor!';
    });
};

startGame = function startGameInteractive() {
    database.ref(`groups/${currentGroup}`).update({ started: true });
    gameStarted = true;
    isGameOver = false;
    if (!resumeCurrentStage) errorsPerQuestion = 0;
    isProcessing = false;

    ensureInteractiveGameUI();
    attachGroupControlListeners();
    switchScreen('gameScreen');
    document.getElementById('displayGroup').textContent = currentGroup;
    document.getElementById('displayMembers').textContent = currentMembers.join(', ');
    document.getElementById('totalQuestions').textContent = allQuestions.length;
    document.getElementById('hintsRemaining').textContent = hintsLeft;
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    document.getElementById('timerDisplay').textContent = `${m}:${s}`;
    updateScoreUI();
    renderProgressDots();
    showPhaseLocation();
    startTimer();
    setGamePaused(gamePaused);
};

showPhaseLocation = function showPhaseLocationInteractive() {
    const wasResuming = resumeCurrentStage;
    const resumedErrors = wasResuming ? errorsPerQuestion : 0;
    if (!wasResuming) stageHintUsed = false;
    resumeCurrentStage = false;
    baseShowPhaseLocationInteractive();
    errorsPerQuestion = resumedErrors;
    if (currentGroup && gameStarted && currentQuestionIndex < allQuestions.length) {
        database.ref(`groups/${currentGroup}`).update({
            currentStageHintUsed: stageHintUsed,
            currentStageErrors: errorsPerQuestion
        });
    }
    updateScoreUI();
};

foundPaper = function foundPaperInteractive() {
    if (gamePaused) {
        showAnnouncement('A caçada está pausada. Aguardem o professor liberar.');
        return;
    }
    baseFoundPaperInteractive();
};

selectAlternative = function selectAlternativeInteractive(letter) {
    if (gamePaused) {
        showAnnouncement('A caçada está pausada.');
        return;
    }
    baseSelectAlternativeInteractive(letter);
};

useHint = function useHintInteractive() {
    if (gamePaused) {
        showAnnouncement('A caçada está pausada.');
        return;
    }
    const before = hintsLeft;
    baseUseHintInteractive();
    if (hintsLeft < before) {
        stageHintUsed = true;
        database.ref(`groups/${currentGroup}`).update({ currentStageHintUsed: true });
        playGameSound('hint');
        vibrateDevice(70);
    }
};

finishFinalStage = function finishFinalStageInteractive() {
    if (isProcessing || !gameStarted || isGameOver || gamePaused) return;

    const question = allQuestions[currentQuestionIndex];
    if (!question || question.type !== 'final') return;

    isProcessing = true;
    const button = document.getElementById('btnCheckAnswer');
    button.disabled = true;
    const timeSpentOnStage = Math.max(0, seconds - stageStartSeconds);
    const updates = {
        currentQuestion: allQuestions.length,
        time: seconds,
        currentStageHintUsed: false,
        currentStageErrors: 0
    };

    if (question.id) {
        updates[`questionStats/${question.id}/order`] = question.order || currentQuestionIndex + 1;
        updates[`questionStats/${question.id}/errors`] = 0;
        updates[`questionStats/${question.id}/timeSpent`] = timeSpentOnStage;
        updates[`questionStats/${question.id}/points`] = 100;
        updates[`questionStats/${question.id}/usedHint`] = false;
    }

    database.ref(`groups/${currentGroup}`).update(updates).then(() => {
        awardStagePoints(question, { points: 100 }, timeSpentOnStage, true);
        currentQuestionIndex = allQuestions.length;
        errorsPerQuestion = 0;
        isProcessing = false;
        playGameSound('win');
        launchConfetti(110);
        setTimeout(winGame, 700);
    }).catch(() => {
        isProcessing = false;
        button.disabled = false;
        showFeedback('❌ Não foi possível finalizar agora. Tentem novamente.', 'error');
    });
};

checkAnswer = function checkAnswerInteractive() {
    if (isProcessing || !gameStarted || isGameOver) return;
    if (gamePaused) {
        showAnnouncement('A caçada está pausada. Aguardem a liberação.');
        return;
    }
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
    if (question.type === 'final') {
        finishFinalStage();
        return;
    }

    const userAnswer = document.getElementById('answerInput').value.trim();
    const checkButton = document.getElementById('btnCheckAnswer');

    if (question.type === 'multipla' && !selectedAlternative) {
        showFeedback('❌ Selecione uma alternativa clicando nela!', 'error');
        return;
    }
    if (question.type !== 'multipla' && !userAnswer) {
        showFeedback('❌ Digite a resposta que vocês encontraram!', 'error');
        return;
    }

    isProcessing = true;
    checkButton.disabled = true;
    let isCorrect = false;

    if (question.type === 'multipla') {
        const selectedButton = document.querySelector(`.alt-btn[data-letter="${selectedAlternative}"]`);
        if (selectedButton) {
            const originalIndex = Number(selectedButton.dataset.originalIndex);
            const originalLetters = ['A', 'B', 'C', 'D'];
            isCorrect = originalLetters[originalIndex] === question.correctAnswer;
        }
    } else {
        if (!String(question.answer ?? '').trim()) {
            isProcessing = false;
            checkButton.disabled = false;
            showFeedback('⚠️ Esta etapa está sem resposta configurada. Avise o professor.', 'error');
            return;
        }
        isCorrect = descriptiveAnswerIsCorrect(userAnswer, question.answer);
    }

    if (isCorrect) {
        stopBlockCountdown();
        blockedUntil = 0;
        document.getElementById('answerInput').style.borderColor = '#27ae60';

        const nextIndex = currentQuestionIndex + 1;
        const timeSpentOnStage = Math.max(0, seconds - stageStartSeconds);
        const scoring = calculateStagePoints(timeSpentOnStage);
        const updates = {
            currentQuestion: nextIndex,
            time: seconds,
            currentStageHintUsed: false,
            currentStageErrors: 0
        };

        if (question.id) {
            updates[`questionStats/${question.id}/order`] = question.order || currentQuestionIndex + 1;
            updates[`questionStats/${question.id}/errors`] = errorsPerQuestion;
            updates[`questionStats/${question.id}/timeSpent`] = timeSpentOnStage;
            updates[`questionStats/${question.id}/points`] = scoring.points;
            updates[`questionStats/${question.id}/usedHint`] = stageHintUsed;
            updates[`questionStats/${question.id}/firstTry`] = errorsPerQuestion === 0;
        }

        database.ref(`groups/${currentGroup}`).update(updates).then(() => {
            const earnedPoints = awardStagePoints(question, scoring, timeSpentOnStage, false);
            showFeedback(`✅ Cadeado aberto! +${earnedPoints} pontos para a equipe! 🎉`, 'success');
            playGameSound('success');
            vibrateDevice([70, 45, 90]);
            launchConfetti(34);

            selectedAlternative = null;
            document.querySelectorAll('.alt-btn').forEach(button => button.classList.remove('selected'));
            errorsPerQuestion = 0;
            stageHintUsed = false;
            currentQuestionIndex = nextIndex;

            setTimeout(() => {
                isProcessing = false;
                if (currentQuestionIndex >= allQuestions.length) winGame();
                else showPhaseLocation();
            }, 1500);
        }).catch(() => {
            isProcessing = false;
            checkButton.disabled = false;
            showFeedback('❌ Não foi possível salvar o progresso. Tentem novamente.', 'error');
        });
        return;
    }

    errorsPerQuestion++;
    document.getElementById('answerInput').style.borderColor = '#e74c3c';
    playGameSound('error');
    vibrateDevice(180);
    database.ref(`groups/${currentGroup}/errors`).transaction(current => (Number(current) || 0) + 1);
    database.ref(`groups/${currentGroup}/currentStageErrors`).set(errorsPerQuestion);

    let errorMessage = '❌ Cadeado travado. Verifiquem a pista e tentem novamente.';
    let willBlock = false;

    if (errorsPerQuestion >= 3) {
        willBlock = true;
        const blockTime = Math.min(errorsPerQuestion * 3, 15);
        blockedUntil = Date.now() + blockTime * 1000;
        document.querySelectorAll('.alt-btn').forEach(button => { button.disabled = true; });
        checkButton.disabled = true;
        document.getElementById('answerInput').disabled = true;
        startBlockCountdown(blockTime);
    } else if (errorsPerQuestion === 2) {
        errorMessage = '⚠️ Segunda tentativa errada. Releiam a pista com bastante atenção!';
    } else if (errorsPerQuestion === 1 && question.type === 'multipla') {
        const alternatives = question.alternatives || [];
        const visibleLetters = ['A', 'B', 'C', 'D'];
        const shuffledIndices = shuffleAlternatives(alternatives);
        alternativeOrder = shuffledIndices;
        document.querySelectorAll('.alt-btn').forEach((button, index) => {
            if (index < shuffledIndices.length) {
                const originalIndex = shuffledIndices[index];
                button.textContent = `${visibleLetters[index]}) ${alternatives[originalIndex]}`;
                button.dataset.originalIndex = originalIndex;
                button.dataset.letter = visibleLetters[index];
            }
        });
        selectedAlternative = null;
        document.querySelectorAll('.alt-btn').forEach(button => button.classList.remove('selected'));
        document.getElementById('selectedAlternative').textContent = '🔄 Alternativas reorganizadas!';
        errorMessage = '🔄 As alternativas mudaram de posição. Prestem atenção na pista!';
    }

    if (!willBlock) showFeedback(errorMessage, 'error');
    setTimeout(() => {
        isProcessing = false;
        if (!willBlock) {
            checkButton.disabled = false;
            document.querySelectorAll('.alt-btn').forEach(button => { button.disabled = false; });
            if (question.type !== 'multipla') document.getElementById('answerInput').focus();
        }
    }, 1500);
};

startTimer = function startTimerInteractive() {
    if (timerInterval) return;
    timerInterval = setInterval(() => {
        if (!gameStarted || isGameOver || gamePaused) return;
        seconds++;
        const minutes = Math.floor(seconds / 60).toString().padStart(2, '0');
        const remainingSeconds = (seconds % 60).toString().padStart(2, '0');
        document.getElementById('timerDisplay').textContent = `${minutes}:${remainingSeconds}`;
        if (seconds % 10 === 0 && currentGroup) {
            database.ref(`groups/${currentGroup}`).update({ time: seconds });
        }
    }, 1000);
};

winGame = function winGameInteractive() {
    if (isGameOver) return;
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
    stopBlockCountdown();

    isGameOver = true;
    gameStarted = false;
    isProcessing = false;
    const pauseOverlay = document.getElementById('interactivePauseOverlay');
    if (pauseOverlay) pauseOverlay.classList.remove('show');

    const minutes = Math.floor(seconds / 60).toString().padStart(2, '0');
    const remainingSeconds = (seconds % 60).toString().padStart(2, '0');
    document.getElementById('winTime').textContent = `${minutes}:${remainingSeconds}`;
    document.getElementById('winGroup').textContent = currentGroup;
    document.getElementById('winMembers').textContent = currentMembers.join(', ');
    switchScreen('winScreen');

    database.ref(`groups/${currentGroup}`).update({
        completed: true,
        currentQuestion: allQuestions.length,
        finalTime: seconds,
        time: seconds,
        currentStageHintUsed: false,
        currentStageErrors: 0
    }).then(() => database.ref(`groups/${currentGroup}`).once('value')).then(snapshot => {
        renderWinSummary(snapshot.val() || {});
    }).catch(() => renderWinSummary({ score: gameScore, firstTryCount, finalTime: seconds }));

    playGameSound('win');
    vibrateDevice([100, 60, 100, 60, 220]);
    launchConfetti(130);
};

cleanupAndReset = function cleanupAndResetInteractive() {
    detachGroupControlListeners();
    gameScore = 0;
    firstTryCount = 0;
    stageHintUsed = false;
    resumeCurrentStage = false;
    const overlay = document.getElementById('interactivePauseOverlay');
    if (overlay) overlay.classList.remove('show');
    baseCleanupAndResetInteractive();
    updateScoreUI();
};

document.addEventListener('DOMContentLoaded', () => {
    ensureInteractiveGameUI();
    attachGlobalControlListeners();
});

// Atualiza as funções usadas pelos atributos onclick do HTML.
window.confirmGroup = confirmGroup;
window.foundPaper = foundPaper;
window.finishFinalStage = finishFinalStage;
window.useHint = useHint;
window.checkAnswer = checkAnswer;
window.selectAlternative = selectAlternative;
window.toggleSound = toggleSound;