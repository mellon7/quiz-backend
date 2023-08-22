const express = require('express');
const path = require('path');
const fs = require('fs');
const session = require('express-session');
const crypto = require('crypto');
const cors = require('cors');
const { doc, getDoc, updateDoc, setDoc  } = require('firebase/firestore');
const admin = require('firebase-admin');
const { auth, firestore } = require('./firebaseConfig.cjs');
const app = express();
const PORT = process.env.PORT || 3000;
const categoryData = require('./src/data/categoryData.json');
const questionDataPath = './src/data/questions/';
const os = require('os');
const { generateMissions, Mission } = require('./missions.cjs');

const generateSecretKey = () => {
  const bytes = crypto.randomBytes(32);
  return bytes.toString('hex');
};
const secretKey = generateSecretKey();

const maintainMissions = (req, uid, category, score) => {
  console.log('maintainMissions input:', { uid, category, score });

  let userData = userCache[uid];
  console.log('Initial userData:', userData);

  if (!userData) {
    console.log('No userData found, initializing.');
    userData = {
      activeMissions: [],
      completedMissions: 0,
      globalScore: 0
    };
  }

  // Check for expired missions and replace them with new ones
  userData.activeMissions.forEach((mission, index) => {
    const creationTime = mission.creationTime;
    const currentTime = Date.now();
    const differenceInHours = (currentTime - creationTime) / 1000 / 60 / 60;

    if (differenceInHours > 24) { // assuming missions expire after 24 hours
      userData.activeMissions[index] = generateMissions(Math.random() < 0.5 ? 'easy' : 'medium');
      console.log('Expired mission replaced:', userData.activeMissions[index]);
    }
  });

  // Update progress of each active mission and check if any are completed
  const completedMissions = [];
  if (userData.activeMissions) {
    userData.activeMissions.forEach((mission, index) => {
      if (mission.category === category) {
        mission.progress += score;
        if (mission.progress >= mission.target) {
          mission.completed = true;
          completedMissions.push(index);
          console.log('Mission completed:', mission);
        }
      }
    });
  }

  completedMissions.reverse().forEach((index) => {
    const completedMission = userData.activeMissions.splice(index, 1)[0];
    userData.completedMissions += 1; // Increment completedMissions count
    const newMission = generateMissions(Math.random() < 0.5 ? 'easy' : 'medium');
    userData.activeMissions.push(newMission);

    // Add the reward for the completed mission to the global score
    userData.globalScore += completedMission.reward;
  });

  // Add the score of the current quiz to the global score
  userData.globalScore += score;

  console.log('maintainMissions output:', userData);
  console.log('End of maintainMissions.');

  // Return the updated user object
  return userData;
};



const NB_QUIZ_QUESTIONS = 2;
let userCache = {};
let firestoreReadCounter = 0;
let sessionScoreSubmitted = {};

const isProduction = process.env.NODE_ENV === 'production';
console.log("Environment:", process.env.NODE_ENV);
app.use(express.json());

app.use(cors({
  origin: [
    'http://localhost:5173',
    'https://quiz-frontend-vhra.vercel.app',
    'https://quiz-frontend-rose.vercel.app',
  ],
  methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
  credentials: true
}));

app.use(
  session({
    secret: secretKey,
    resave: false,
    saveUninitialized: true,
    cookie: {
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000,
    },
  })
);

let idSet = new Set();
let allQuestions = [];

function logProcessMemoryUsage() {
  const memoryUsage = process.memoryUsage();
  const logMessage = `Process Memory Usage:
  RSS: ${(memoryUsage.rss / (1024 * 1024)).toFixed(2)} MB
  Heap Total: ${(memoryUsage.heapTotal / (1024 * 1024)).toFixed(2)} MB
  Heap Used: ${(memoryUsage.heapUsed / (1024 * 1024)).toFixed(2)} MB
  External: ${(memoryUsage.external / (1024 * 1024)).toFixed(2)} MB`;

  console.log(logMessage);

  // Save the log to a file
  fs.appendFileSync('memory_log.txt', logMessage + '\n');
}

setInterval(logProcessMemoryUsage, 1000 * 60 * 60); // logs process memory usage every 10 minutes

// Log memory usage when the server is about to close
process.on('beforeExit', () => {
  logProcessMemoryUsage();
  console.log('Server is closing. Logging memory usage to file.');
});

// Clear the user cache every hour
setInterval(() => {
  console.log('Clearing user cache');
  userCache = {};
}, 1000 * 60 * 60);

// Clear the sessionScoreSubmitted every hour
setInterval(() => {
  sessionScoreSubmitted = {};
}, 1000 * 60 * 60);

// This function ensures unique ids across all questions.
function ensureUniqueIds() {
  console.log('Ensuring unique question IDs...');

  // First, read all the question data and find duplicate ids
  for (let category of categoryData) {
      const questionDataFile = `${category.id}.json`;
      const questionDataFilePath = path.join(questionDataPath, questionDataFile);

      try {
          let questionData = JSON.parse(fs.readFileSync(questionDataFilePath, 'utf8'));

          for (let question of questionData) {
            if (question.id === undefined) {
                console.log('Question has undefined ID:', question);
            } else {
              if (idSet.has(question.id)) {
                  console.log('Duplicate id found:', question.id);
                  // If you find a duplicate id, generate a new one
                  let newId;
                  do {
                      newId = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);
                  } while (idSet.has(newId));

                  question.id = newId;
              }

              idSet.add(question.id);
          }
        }
          allQuestions.push({ category: category.id, data: questionData });
      } catch (error) {
          console.log('Error reading question data:', error);
      }
  }

  // Then, write the updated question data back to the files
  for (let categoryQuestions of allQuestions) {
      const questionDataFile = `${categoryQuestions.category}.json`;
      const questionDataFilePath = path.join(questionDataPath, questionDataFile);

      try {
          fs.writeFileSync(questionDataFilePath, JSON.stringify(categoryQuestions.data, null, 2), 'utf8');
      } catch (error) {
          console.log('Error writing question data:', error);
      }
  }

  console.log('Checked and updated question IDs');
}

// Call the function right before your server starts
ensureUniqueIds();

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
      console.log(`Total Questions in ${category.id}:`, questionData.length);
    } catch (error) {
      console.log('Error reading question data:', error);
    }
  }

  console.log('Total Questions:', totalQuestions);
}

const validateSession = (req, res, next) => {
  const sessionId = req.query.sessionId;
  console.log('Received Session ID:', sessionId);
  console.log('Stored Session ID:', req.sessionID);

  if (!sessionId || sessionId !== req.sessionID) {
    console.log('Session mismatch, regenerating session');
    req.session.regenerate((err) => {
      if (err) {
        console.log('Error regenerating session:', err);
        return res.status(500).json({ error: 'Internal server error' });
      }
      console.log('After regenerate - Session ID:', req.sessionID);
      next();
    });
  } else {
    next();
  }
};

app.get('/api/user/:uid', async (req, res) => {
  const { uid } = req.params;

  try {
    // Check if the user data is in the cache
    if (!userCache[uid]) {
      const userRef = doc(firestore, 'users', uid);
      const userSnap = await getDoc(userRef);

      // If the user does not exist in Firestore, return 404
      if (!userSnap.exists()) {
        return res.status(404).send('User not found');
      }

      let userData = userSnap.data();

      // Increment the Firestore read counter and log it
      firestoreReadCounter++;
      console.log(`Read from Firestore for user ${uid}. Total Firestore reads: ${firestoreReadCounter}`);

      // Parse active missions data and store it in the cache
      let activeMissions = [];
      if (userData.activeMissions && isJsonString(userData.activeMissions)) {
        activeMissions = JSON.parse(userData.activeMissions).map(mission => Object.assign(new Mission(), mission));
      }

      // Parse completedMissions as a number
      let completedMissions = 0;
      if (userData.completedMissions) {
        completedMissions = Number(userData.completedMissions);
      }

      // Generate new active missions if they do not exist
      if (activeMissions.length === 0) {
        const difficulties = ['easy', 'medium', 'difficult'];
        for (let i = 0; i < 3; i++) { // Loop 3 times to generate 3 missions
          const difficulty = difficulties[Math.floor(Math.random() * difficulties.length)];
          activeMissions.push(generateMissions(difficulty)); // Add the new mission to the array
        }
      }

      // Store the user data in the cache
      userCache[uid] = {
        ...userData,
        activeMissions: activeMissions,
        completedMissions: completedMissions
      };

      console.log(`Fetched and stored data for user ${uid} from Firestore:`, userCache[uid]);
    } else {
      console.log(`Fetched data for user ${uid} from cache:`, userCache[uid]);
    }

    // Send the user data from the cache
    return res.json(userCache[uid]);
  } catch (error) {
    console.error('Error getting user data:', error);
    return res.status(500).send('Error getting user data');
  }
});

function isJsonString(str) {
  try {
      JSON.parse(str);
  } catch (e) {
      return false;
  }
  return true;
}

app.get('/api/newSession', (req, res, next) => {
  console.log('Before regenerate:', req.sessionID); // Log before regenerating
  
  req.session.regenerate((err) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to create session' });
    }
    
    req.session.sessionId = req.sessionID;
    sessionScoreSubmitted[req.sessionID] = false;

    console.log('After regenerate - Session ID:', req.sessionID); // Log after regenerating
    console.log('After regenerate - Stored Session ID:', req.session.sessionId); // Log stored session ID
    
    next();
  });
}, (req, res) => {
  res.json({ sessionId: req.session.sessionId });
});


app.get('/api/totalQuestions', (req, res) => {
  res.json({ totalQuestions });
});

app.get('/api/randomQuestions', validateSession, (req, res) => {
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
  const selectedQuestions = shuffledQuestions.slice(0, count || NB_QUIZ_QUESTIONS);

  req.session.questions = selectedQuestions;
  console.log('Stored questions in session:', req.session.questions);
  req.session.score = 0;
  req.session.sessionId = req.sessionID;
  
  res.json({
    sessionId: req.sessionID,
    questions: selectedQuestions.map(q => {
      let { answer, ...qWithoutAnswer } = q;
      return qWithoutAnswer;
    }),
  });
});

app.get('/api/categories', (req, res) => {
  res.json(categoryData);
});

app.get('/api/questions', validateSession, (req, res) => {
  const { category, count } = req.query;

  console.log('Validated session:', req.session.sessionId);
  console.log('Category:', category);

  // Handle 'random' case specifically
  if (category !== 'random') {
    req.session.category = category;
  } else {
    req.session.category = "random";
  }

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
    const selectedQuestions = shuffledQuestions.slice(0, count || NB_QUIZ_QUESTIONS);

    req.session.category = category;
    req.session.questions = selectedQuestions;
    console.log('Stored questions in session:', req.session.questions);
    req.session.score = 0;

    res.json({
      sessionId: req.sessionID,
      questions: selectedQuestions,
    });
  } else if (!category) {
    console.log('Category not specified');
    return res.status(400).json({ error: 'Category not specified' });
  } else {
    const questionDataFile = `${category}.json`;
    const questionDataFilePath = path.join(questionDataPath, questionDataFile);

    try {
      const questionData = JSON.parse(fs.readFileSync(questionDataFilePath, 'utf8'));

      const shuffledQuestions = questionData.sort(() => 0.5 - Math.random());
      const selectedQuestions = shuffledQuestions.slice(0, count || NB_QUIZ_QUESTIONS);

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

app.post('/api/answer', validateSession, async (req, res) => {
  const { questionId, answer, uid } = req.body;

  console.log('Received request to /api/answer');
  console.log('Request Body:', req.body);

  const idToken = req.headers.authorization && req.headers.authorization.split('Bearer ')[1];

  if (idToken) {
    try {
      const decodedToken = await admin.auth().verifyIdToken(idToken, true);
      if (uid && decodedToken.uid !== uid) {
        console.log('Token UID does not match provided UID');
        return res.status(403).send('Unauthorized');
      }
    } catch (error) {
      console.error('Error verifying ID token:', error);
      return res.status(403).send('Unauthorized');
    }
  }

  const question = req.session.questions.find(q => q.id === questionId);
  if (!question) {
    console.log('No matching question in session');
    return res.status(400).json({ error: 'Invalid question id' });
  }
  console.log('Found matching question in session:', question);

  if (question.correctAnswer === answer) {
    req.session.score++;
    console.log('Correct answer. Score:', req.session.score);
  
    req.session.save((err) => {
      if (err) {
        console.log('Error saving session:', err);
        return res.status(500).json({ error: 'Internal server error' });
      }
      return res.json({ correct: true });
    });
  } else {
    console.log('Incorrect answer. Score:', req.session.score);
    return res.json({ correct: false });
  }
});

app.post('/api/score', validateSession, async (req, res) => {
  const { uid, category } = req.body;

  console.log('Received score submission...');
  console.log('UID:', uid);
  console.log('Actual Category:', category);
  console.log('Score:', req.session.score);

  if (!uid || !category) {
    console.error('Missing uid or category in request');
    return res.status(400).send('Missing uid or category in request');
  }

    // Check if the score has already been submitted for this session
  if (sessionScoreSubmitted[req.sessionID]) {
    console.error('Score already submitted for this session');
    return res.status(400).send('Score already submitted for this session');
  }

  try {
    const userRef = doc(firestore, 'users', uid);
    const userSnap = await getDoc(userRef);
    if (userSnap.exists()) {
      let userData = userSnap.data();

          // Get existing activeMissions from userCache
          let existingActiveMissions = userCache[uid]?.activeMissions || [];

         // Ensure the categoryStats object exists
if (!userData.categoryStats) {
  userData.categoryStats = {};
}

// Ensure the specific category exists
if (!userData.categoryStats[category]) {
  userData.categoryStats[category] = { quizzesPlayed: 0, pointsEarned: 0 };
}

// Increment the category stats
userData.categoryStats[category].quizzesPlayed += 1;
userData.categoryStats[category].pointsEarned += req.session.score;

// Update userCache with the incremented values
userCache[uid] = {
  ...userData, // Include existing user data
  activeMissions: existingActiveMissions,
  completedMissions: userData.completedMissions || 0,
  categoryStats: {
    ...userCache[uid]?.categoryStats,
    [category]: userData.categoryStats[category] // Update the specific category
  }
};


      // Call maintainMissions and capture the returned user object
      const updatedUser = maintainMissions(req, uid, category, req.session.score);

      // Now, you can use the updated userCache to build the updatedData object
const updatedData = {
  globalScore: updatedUser.globalScore || 0,
  completedMissions: updatedUser.completedMissions,
  [`categoryStats.${category}.quizzesPlayed`]: userCache[uid].categoryStats[category].quizzesPlayed, // Using updated values from cache
  [`categoryStats.${category}.pointsEarned`]: userCache[uid].categoryStats[category].pointsEarned  // Using updated values from cache
};


      // Update the cached globalScore, quizzesPlayed, pointsEarned, and completedMissions but keep activeMissions
      userCache[uid] = {
        ...userCache[uid],
        ...updatedUser,
        activeMissions: existingActiveMissions // Keep the existing activeMissions
      };

      console.log('Updating user data:', updatedData);
      await updateDoc(userRef, updatedData);
      
      // Score submission successful, mark it as submitted
      sessionScoreSubmitted[req.sessionID] = true;
      
      return res.json({ message: 'Score submitted successfully' });
    } else {
      return res.status(404).send('User not found');
    }
  } catch (error) {
    console.error('Error submitting score:', error);
    return res.status(500).send('Error submitting score');
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  
});
