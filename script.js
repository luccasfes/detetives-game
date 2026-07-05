// Configuração das pistas (inicial - será carregada do Firebase)
let CLUES = [];
let currentGroup = null;
let currentMembers = [];
let timerInterval = null;
let seconds = 0;
let cluesFound = [];
let gameStarted = false;

// ============ LOGIN ============
function login() {
    const groupName = document.getElementById('groupName').value.trim();
    const memberNames = document.getElementById('memberNames').value.trim();
    const errorDiv = document.getElementById('errorMessage');

    // Validações
    if (!groupName) {
        errorDiv.textContent = '❌ Por favor, digite o nome do grupo!';
        return;
    }

    if (!memberNames) {
        errorDiv.textContent = '❌ Por favor, digite os nomes dos integrantes!';
        return;
    }

    // Processar nomes
    const members = memberNames.split(',').map(name => name.trim()).filter(name => name);
    
    if (members.length < 2) {
        errorDiv.textContent = '❌ O grupo precisa ter pelo menos 2 integrantes!';
        return;
    }

    // Verificar se o grupo já existe
    const groupRef = database.ref('groups/' + groupName);
    groupRef.once('value').then((snapshot) => {
        if (snapshot.exists()) {
            const data = snapshot.val();
            // Verificar se os nomes correspondem
            const existingMembers = data.members || [];
            const membersMatch = members.every(m => existingMembers.includes(m)) && 
                               existingMembers.every(m => members.includes(m));
            
            if (!membersMatch) {
                errorDiv.textContent = '❌ Este grupo já existe com outros integrantes!';
                return;
            }
            
            // Carregar dados existentes
            currentGroup = groupName;
            currentMembers = members;
            loadGroupData(groupName);
            showHintsScreen();
        } else {
            // Novo grupo
            currentGroup = groupName;
            currentMembers = members;
            
            // Salvar no Firebase
            groupRef.set({
                members: members,
                clues: [],
                time: 0,
                started: false,
                completed: false,
                createdAt: Date.now()
            });
            
            showHintsScreen();
        }
    }).catch((error) => {
        errorDiv.textContent = '❌ Erro ao verificar grupo: ' + error.message;
    });
}

// ============ TELA DE DICAS ============
function showHintsScreen() {
    document.getElementById('displayGroupHints').textContent = currentGroup;
    document.getElementById('displayMembersHints').textContent = currentMembers.join(', ');
    
    // Carregar pistas do Firebase
    loadCluesFromFirebase();
    
    switchScreen('hintsScreen');
}

function loadCluesFromFirebase() {
    database.ref('clues').once('value').then((snapshot) => {
        const data = snapshot.val();
        if (data) {
            CLUES = Object.values(data);
            renderCluesPreview();
        } else {
            // Pistas padrão se não houver no Firebase
            CLUES = [
                { id: 'PISTA01', name: '🔍 Pista da Biblioteca', hint: 'Procure na estante de livros' },
                { id: 'PISTA02', name: '🔍 Pista do Pátio', hint: 'Olhe perto do jardim' },
                { id: 'PISTA03', name: '🔍 Pista da Sala de Aula', hint: 'Verifique o quadro branco' },
                { id: 'PISTA04', name: '🔍 Pista da Cantina', hint: 'Procure perto do bebedouro' },
                { id: 'PISTA05', name: '🔍 Pista da Secretaria', hint: 'Pergunte na recepção' }
            ];
            // Salvar pistas padrão no Firebase
            CLUES.forEach(clue => {
                database.ref('clues/' + clue.id).set(clue);
            });
            renderCluesPreview();
        }
    });
}

function renderCluesPreview() {
    const container = document.getElementById('cluesPreviewList');
    container.innerHTML = CLUES.map(clue => `
        <div class="preview-clue-card">
            <div class="preview-clue-code">${clue.id}</div>
            <div class="preview-clue-info">
                <h4>${clue.name}</h4>
                <p>💡 Dica: ${clue.hint}</p>
                <span class="preview-difficulty ${clue.difficulty?.toLowerCase() || 'medio'}">
                    ${clue.difficulty || '⭐⭐ Médio'}
                </span>
            </div>
        </div>
    `).join('');
}

function startGame() {
    // Marcar que o jogo começou
    database.ref('groups/' + currentGroup).update({
        started: true,
        startTime: Date.now()
    });
    
    gameStarted = true;
    switchScreen('gameScreen');
    document.getElementById('displayGroup').textContent = currentGroup;
    document.getElementById('displayMembers').textContent = currentMembers.join(', ');
    document.getElementById('totalClues').textContent = CLUES.length;
    document.getElementById('cluesFound').textContent = '0';
    
    // Iniciar timer
    startTimer();
}

// ============ CARREGAR DADOS DO GRUPO ============
function loadGroupData(groupName) {
    const groupRef = database.ref('groups/' + groupName);
    
    groupRef.once('value').then((snapshot) => {
        const data = snapshot.val();
        
        if (data) {
            // Carregar pistas encontradas
            if (data.clues) {
                cluesFound = data.clues;
                document.getElementById('cluesFound').textContent = cluesFound.length;
                document.getElementById('totalClues').textContent = CLUES.length;
                updateCluesList();
            }
            
            // Carregar tempo
            if (data.time) {
                seconds = data.time;
                updateTimerDisplay();
            }
            
            // Se já completou, mostrar vitória
            if (data.completed) {
                winGame();
            }
        }
    }).catch((error) => {
        console.error('Erro ao carregar dados:', error);
    });
}

// ============ VERIFICAR PISTA ============
function checkClue() {
    if (!gameStarted) {
        document.getElementById('clueMessage').textContent = '⚠️ O jogo ainda não começou!';
        document.getElementById('clueMessage').className = 'clue-message error';
        return;
    }

    const code = document.getElementById('clueCode').value.toUpperCase().trim();
    const messageDiv = document.getElementById('clueMessage');
    
    if (!code) {
        messageDiv.textContent = '❌ Digite um código de pista!';
        messageDiv.className = 'clue-message error';
        return;
    }
    
    // Verificar se a pista existe
    const clue = CLUES.find(c => c.id === code);
    
    if (!clue) {
        messageDiv.textContent = '❌ Código inválido! Tente novamente.';
        messageDiv.className = 'clue-message error';
        return;
    }
    
    // Verificar se já foi encontrada
    if (cluesFound.includes(code)) {
        messageDiv.textContent = '⚠️ Esta pista já foi encontrada!';
        messageDiv.className = 'clue-message error';
        return;
    }
    
    // Adicionar pista
    cluesFound.push(code);
    updateCluesList();
    updateProgress();
    saveGroupData();
    
    messageDiv.textContent = '✅ Pista encontrada! ' + clue.hint;
    messageDiv.className = 'clue-message success';
    
    document.getElementById('clueCode').value = '';
    
    // Verificar se todas as pistas foram encontradas
    if (cluesFound.length === CLUES.length) {
        setTimeout(() => {
            winGame();
        }, 1000);
    }
}

// ============ ATUALIZAR LISTA ============
function updateCluesList() {
    const list = document.getElementById('cluesList');
    list.innerHTML = '';
    
    if (cluesFound.length === 0) {
        list.innerHTML = '<p class="empty-message">Nenhuma pista encontrada ainda...</p>';
        return;
    }
    
    cluesFound.forEach((clueId, index) => {
        const clue = CLUES.find(c => c.id === clueId);
        if (clue) {
            const item = document.createElement('div');
            item.className = 'clue-item';
            item.innerHTML = `
                <span class="clue-name">${clue.name}</span>
                <span class="clue-time">#${index + 1}</span>
            `;
            list.appendChild(item);
        }
    });
}

// ============ PROGRESSO ============
function updateProgress() {
    document.getElementById('cluesFound').textContent = cluesFound.length;
    document.getElementById('totalClues').textContent = CLUES.length;
}

// ============ SALVAR DADOS ============
function saveGroupData() {
    if (!currentGroup) return;
    
    const groupRef = database.ref('groups/' + currentGroup);
    groupRef.update({
        clues: cluesFound,
        time: seconds,
        lastUpdate: Date.now()
    }).catch((error) => {
        console.error('Erro ao salvar dados:', error);
    });
}

// ============ TIMER ============
function startTimer() {
    if (timerInterval) return;
    
    timerInterval = setInterval(() => {
        seconds++;
        updateTimerDisplay();
        // Salvar tempo a cada 10 segundos
        if (seconds % 10 === 0) {
            saveGroupData();
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
    
    // Salvar resultado final
    if (currentGroup) {
        database.ref('groups/' + currentGroup).update({
            completed: true,
            finalTime: seconds
        });
    }
}

// ============ RESETAR ============
function resetGame() {
    if (currentGroup) {
        if (confirm('⚠️ Tem certeza que quer reiniciar? Isso vai apagar o progresso do seu grupo!')) {
            database.ref('groups/' + currentGroup).remove();
        } else {
            return;
        }
    }
    
    cluesFound = [];
    seconds = 0;
    currentGroup = null;
    currentMembers = [];
    gameStarted = false;
    
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
    
    document.getElementById('cluesFound').textContent = '0';
    document.getElementById('totalClues').textContent = CLUES.length;
    document.getElementById('timerDisplay').textContent = '00:00';
    document.getElementById('clueMessage').textContent = '';
    document.getElementById('clueMessage').className = 'clue-message';
    document.getElementById('clueCode').value = '';
    document.getElementById('groupName').value = '';
    document.getElementById('memberNames').value = '';
    
    switchScreen('loginScreen');
}

// ============ LOGOUT ============
function logout() {
    if (currentGroup) {
        saveGroupData();
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

// Inicialização
document.addEventListener('DOMContentLoaded', function() {
    // Carregar pistas
    loadCluesFromFirebase();
    
    // Permitir Enter para login
    document.getElementById('memberNames').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            login();
        }
    });
    
    document.getElementById('groupName').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            document.getElementById('memberNames').focus();
        }
    });
    
    // Permitir Enter para verificar pista
    document.getElementById('clueCode').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            checkClue();
        }
    });
});

// Exportar funções para uso no HTML
window.login = login;
window.startGame = startGame;
window.checkClue = checkClue;
window.resetGame = resetGame;
window.logout = logout;