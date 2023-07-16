const express = require('express');
const path = require('path');
const fs = require('fs');
const session = require('express-session');
const crypto = require('crypto');
const cors = require('cors');
const { doc, getDoc, updateDoc, setDoc, collection, serverTimestamp } = require('firebase/firestore');
const admin = require('firebase-admin');
const { auth, firestore } = require('./firebaseConfig.cjs');

const app = express();
const PORT = process.env.PORT || 3000;

const categoryData = require('./src/data/categoryData.json');
const questionDataPath = './src/data/questions/';

const generateSecretKey = () => {
  const bytes = crypto.randomBytes(32);
  return bytes.toString('hex');
};

const secretKey = generateSecretKey();

app.use(express.json());

app.use(
  cors({
    origin: ['http://localhost:5173', 'https://quiz-frontend-vhra.vercel.app'],
    credentials: true,
  })
);

app.use(
  session({
    secret: secretKey,
    resave: false,
    saveUninitialized: true,
    cookie: {
      sameSite: 'none',
      httpOnly: true,
      secure: false,
    },
  })
);

let totalQuestions = 0;

// Count the total number of questions on server start
countTotalQuestions();

function countTotalQuestions() {
  for (let category of categoryData) {
    const questionDataFile = `${category.id}.json`;
    const questionDataFilePath = path.join(questionDataPath, questionDataFile);

    try {
      const questionData = JSON.parse(fs.readFileSync(questionDataFilePath, 'utf8'));
      totalQuestions += questionData.length;
    } catch (error) {
      console.log('Error reading question data:', error);
    }
  }

  console.log('Total Questions:', totalQuestions);
}

app.get('/api/totalQuestions', (req, res) => {
  res.json({ totalQuestions });
});

app.get('/api/randomQuestions', (req, res) => {
  const { count } = req.query;
  let allQuestions = [];

  for (let category of categoryData) {
    const questionDataFile = `${category.id}.json`;
    const questionDataFilePath = path.join(questionDataPath, questionDataFile);

    try {
      const questionData = JSON.parse(fs.readFileSync(questionDataFilePath, 'utf8'));
      allQuestions = allQuestions.concat(questionData);
    } catch (error) {
      console.log('Error reading question data:', error);
    }
  }

  const shuffledQuestions = allQuestions.sort(() => 0.5 - Math.random());
  const selectedQuestions = shuffledQuestions.slice(0, count || 10);

  req.session.questions = selectedQuestions;
  req.session.score = 0;

  res.json({
    sessionId: req.sessionID,
    questions: selectedQuestions,
  });
});

app.get('/api/categories', (req, res) => {
  res.json(categoryData);
});

app.get('/api/questions', (req, res) => {
  const { category, count } = req.query;

  if (category === 'random') {
    let allQuestions = [];

    for (let category of categoryData) {
      const questionDataFile = `${category.id}.json`;
      const questionDataFilePath = path.join(questionDataPath, questionDataFile);

      try {
        const questionData = JSON.parse(fs.readFileSync(questionDataFilePath, 'utf8'));
        allQuestions = allQuestions.concat(questionData);
      } catch (error) {
        console.log('Error reading question data:', error);
      }
    }

    const shuffledQuestions = allQuestions.sort(() => 0.5 - Math.random());
    const selectedQuestions = shuffledQuestions.slice(0, count || 10);

    req.session.questions = selectedQuestions;
    req.session.score = 0;

    res.json({
      sessionId: req.sessionID,
      questions: selectedQuestions,
    });
  } else if (!category) {
    return res.status(400).json({ error: 'Category not specified' });
  } else {
    const questionDataFile = `${category}.json`;
    const questionDataFilePath = path.join(questionDataPath, questionDataFile);

    try {
      const questionData = JSON.parse(fs.readFileSync(questionDataFilePath, 'utf8'));

      const shuffledQuestions = questionData.sort(() => 0.5 - Math.random());
      const selectedQuestions = shuffledQuestions.slice(0, count || 3);

      req.session.questions = selectedQuestions;
      req.session.score = 0;

      res.json({
        sessionId: req.sessionID,
        questions: selectedQuestions,
      });
    } catch (error) {
      console.log('Error reading question data:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

app.post('/api/score', async (req, res) => {
  console.log('Received request for /api/score');
  console.log('Request body:', req.body);
  console.log('Request headers:', req.headers);
  const { score, category, uid } = req.body;

  if (!uid) {
    return res.status(400).json({ error: 'User ID not provided' });
  }

  const idToken = req.headers.authorization && req.headers.authorization.split('Bearer ')[1];

  if (!idToken) {
    return res.status(403).send('Unauthorized');
  }

  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken, true);
    if (decodedToken.uid === uid) {
      const userRef = doc(firestore, 'users', uid);
      const userSnap = await getDoc(userRef);
    
      if (userSnap.exists()) {
        console.log('User exists'); // Debug line
    
        // Update user score
        const currentGlobalScore = userSnap.data().globalScore;
        const newGlobalScore = currentGlobalScore + score;
        await updateDoc(userRef, { globalScore: newGlobalScore });
    
        console.log('Updated global score'); // Debug line
    
        // Create a new game history document in the "quizzes" collection
        const gamesCollectionRef = collection(firestore, 'users', uid, 'games');
        const gameHistoryRef = doc(gamesCollectionRef);
        const gameRecordData = {
            category: category,
            score: score,
            date: serverTimestamp(),
        };
        await setDoc(gameHistoryRef, gameRecordData);
    
        console.log('Updated games subcollection'); // Debug line
    
        return res.sendStatus(200);
      } else {
        // Create user and set initial score
        await setDoc(userRef, { globalScore: score });
    
        console.log('Created user and set initial score'); // Debug line
    
        return res.sendStatus(200);
      }
    } else {
      console.log('Unauthorized request'); // Debug line
      return res.status(403).send('Unauthorized');
    }
  } catch (error) {
    console.error('Error updating user score:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
