// firebase-config.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// SUAS CHAVES DO FIREBASE AQUI
const firebaseConfig = {
    apiKey: "AIzaSyChHtFpx1lYLSbZfhlsCFbFapiO1vcKxFE",
    authDomain: "detetives-game.firebaseapp.com",
    databaseURL: "https://detetives-game-default-rtdb.firebaseio.com",
    projectId: "detetives-game",
    storageBucket: "detetives-game.firebasestorage.app",
    messagingSenderId: "171144878887",
    appId: "1:171144878887:web:093bbcf605646b8bab2702"
  };

// Inicializa o Firebase
const app = initializeApp(firebaseConfig);

// Exporta o banco de dados (Firestore) para podermos usar no script.js
export const db = getFirestore(app);