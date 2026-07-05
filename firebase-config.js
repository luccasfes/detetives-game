// firebase-config.js

// Cole aqui as chaves geradas no painel do Firebase
const firebaseConfig = {
    apiKey: "AIzaSyChHtFpx1lYLSbZfhlsCFbFapiO1vcKxFE",
    authDomain: "detetives-game.firebaseapp.com",
    databaseURL: "https://detetives-game-default-rtdb.firebaseio.com",
    projectId: "detetives-game",
    storageBucket: "detetives-game.firebasestorage.app",
    messagingSenderId: "171144878887",
    appId: "1:171144878887:web:093bbcf605646b8bab2702"
  };

// Inicializa o aplicativo Firebase
firebase.initializeApp(firebaseConfig);

// Cria a conexão com o Realtime Database para ser usada no script.js
const database = firebase.database();