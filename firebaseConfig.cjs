const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');
const { initializeApp } = require('firebase/app');
const { getAuth, GoogleAuthProvider } = require('firebase/auth');
const { getFirestore } = require('firebase/firestore');


const firebaseConfig = {
  apiKey: "AIzaSyCD5JmCTlyciSYnDwDS6e3RNnwnxVz7PAU",
  authDomain: "quiz-d767f.firebaseapp.com",
  projectId: "quiz-d767f",
  storageBucket: "quiz-d767f.appspot.com",
  messagingSenderId: "63806084885",
  appId: "1:63806084885:web:8c36b39c6af0a8b98b178a"
};

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  ...firebaseConfig,
});

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();
const firestore = getFirestore(app);

const adminFirestore = admin.firestore();

module.exports = { auth, provider, firestore, adminFirestore };