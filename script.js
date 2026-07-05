// Configuração das pistas
const CLUES = [
    { id: 'PISTA01', name: '🔍 Pista 1 - Biblioteca', hint: 'Procure na estante de livros' },
    { id: 'PISTA02', name: '🔍 Pista 2 - Pátio', hint: 'Olhe perto do jardim' },
    { id: 'PISTA03', name: '🔍 Pista 3 - Sala de Aula', hint: 'Verifique o quadro branco' },
    { id: 'PISTA04', name: '🔍 Pista 4 - Cantina', hint: 'Procure perto do bebedouro' },
    { id: 'PISTA05', name: '🔍 Pista 5 - Secretaria', hint: 'Pergunte na recepção' }
];

let currentGroup = null;
let timerInterval = null;
let seconds = 0;
let cluesFound = [];

// Login
function login() {
    const groupName = document.getElementById('groupName').value.trim();
    
    if (!groupName) {
        showError('Por favor, digite o nome do grupo!');
        return;
    }

    currentGroup = groupName;
    document.getElementById('displayGroup').textContent = groupName;
    document.getElementById('errorMessage').textContent = '';
    
    // Carregar dados do grupo
    loadGroupData(groupName);
    
    // Mudar para tela do jogo
    switchScreen('gameScreen');
    
    // Iniciar timer
    startTimer();
}

// Carregar dados do grupo do Firebase
function loadGroupData(groupName) {
    const groupRef = database.ref('groups/' + groupName);
    
    groupRef.once('value').then((snapshot) => {
        const data = snapshot.val();
        
        if (data) {
            // Carregar pistas encontradas
            if (data.clues) {
                cluesFound = data.clues;
                updateCluesList();
            }
            
            // Carregar tempo
            if (data.time) {
                seconds = data.time;
                updateTimerDisplay();
            }
        }
    }).catch((error) => {
        console.error('Erro ao carregar dados:', error);
    });
}

// Verificar código da pista
function checkClue() {
    const code = document.getElementById('clueCode').value.toUpperCase().trim();
    const messageDiv = document.getElementById('clueMessage');
    
    if (!code) {
        messageDiv.textContent = 'Digite um código de pista!';
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

// Atualizar lista de pistas
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
                <span class="clue-time">Encontrada!</span>
            `;
            list.appendChild(item);
        }
    });
}

// Atualizar progresso
function updateProgress() {
    document.getElementById('cluesFound').textContent = cluesFound.length;
    document.getElementById('totalClues').textContent = CLUES.length;
}

// Salvar dados no Firebase
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

// Timer
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

// Vitória
function winGame() {
    clearInterval(timerInterval);
    timerInterval = null;
    
    document.getElementById('winTime').textContent = document.getElementById('timerDisplay').textContent;
    switchScreen('winScreen');
    
    // Salvar resultado final
    if (currentGroup) {
        database.ref('groups/' + currentGroup).update({
            completed: true,
            finalTime: seconds
        });
    }
}

// Resetar jogo
function resetGame() {
    if (currentGroup) {
        database.ref('groups/' + currentGroup).remove();
    }
    
    cluesFound = [];
    seconds = 0;
    currentGroup = null;
    
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
    
    switchScreen('loginScreen');
}

// Logout
function logout() {
    if (currentGroup && confirm('Deseja realmente sair?')) {
        saveGroupData();
        resetGame();
    }
}

// Mostrar erro
function showError(message) {
    document.getElementById('errorMessage').textContent = message;
}

// Mudar tela
function switchScreen(screenId) {
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.remove('active');
    });
    document.getElementById(screenId).classList.add('active');
}

// Inicialização
document.addEventListener('DOMContentLoaded', function() {
    document.getElementById('totalClues').textContent = CLUES.length;
    
    // Permitir Enter para login
    document.getElementById('groupName').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            login();
        }
    });
    
    // Permitir Enter para verificar pista
    document.getElementById('clueCode').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            checkClue();
        }
    });
});

// Sincronização em tempo real (opcional)
function syncRealTime() {
    if (!currentGroup) return;
    
    const groupRef = database.ref('groups/' + currentGroup);
    groupRef.on('value', (snapshot) => {
        const data = snapshot.val();
        if (data && data.clues) {
            // Atualizar lista se houver mudanças de outro dispositivo
            if (data.clues.length > cluesFound.length) {
                cluesFound = data.clues;
                updateCluesList();
                updateProgress();
            }
        }
    });
}

// Exportar funções para uso no HTML
window.login = login;
window.checkClue = checkClue;
window.resetGame = resetGame;
window.logout = logout;