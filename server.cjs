const express = require('express');
const path = require('path');
const fs = require('fs');
const session = require('express-session');
const crypto = require('crypto');
const history = require('connect-history-api-fallback');
const cors = require('cors'); 

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

app.use(cors({
  origin: ['http://localhost:5173', 'https://quiz-frontend-vhra.vercel.app'],
  credentials: true,
}));


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

if (process.env.NODE_ENV === 'development') {
  const { createServer: createViteServer } = require('vite');

  const startServer = async () => {
    const vite = await createViteServer({
      server: { middlewareMode: true },
    });

    app.use(vite.middlewares);
    app.use(history());

    app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
    });
  };

  startServer();
} else {
  // Production mode
  app.use(express.static(path.join(__dirname, 'build')));

  app.get('/api/randomQuestions', (req, res) => {
    const { count } = req.query;
    let allQuestions = [];
  
    // Read all questions from all categories
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
  
    // Shuffle all questions and slice
    const shuffledQuestions = allQuestions.sort(() => 0.5 - Math.random());
    const selectedQuestions = shuffledQuestions.slice(0, count || 10); // 10 being the default number of questions
  
    // Save the associated questions in the session data
    req.session.questions = selectedQuestions;
    req.session.score = 0;
  
    res.json({
      sessionId: req.sessionID,  // Include the session ID in the response
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
  
      // Read all questions from all categories
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
  
      // Shuffle all questions and slice
      const shuffledQuestions = allQuestions.sort(() => 0.5 - Math.random());
      const selectedQuestions = shuffledQuestions.slice(0, count || 10); // 10 being the default number of questions
  
      // Save the associated questions in the session data
      req.session.questions = selectedQuestions;
      req.session.score = 0;
  
      res.json({
        sessionId: req.sessionID,  // Include the session ID in the response
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
        const selectedQuestions = shuffledQuestions.slice(0, count || 10);
  
        // Save the associated questions in the session data
        req.session.questions = selectedQuestions;
        req.session.score = 0;
  
        res.json({
          sessionId: req.sessionID,  // Include the session ID in the response
          questions: selectedQuestions,
        });
      } catch (error) {
        console.log('Error reading question data:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    }
  });
  


  app.post('/api/score', (req, res) => {
    const { score } = req.body;

    // Update the session data with the user's score
    if (req.session) {
      req.session.score = score;
      res.sendStatus(200);
    } else {
      res.status(404).json({ error: 'Session not found' });
    }
  });


  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
  });

  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
}