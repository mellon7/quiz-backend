const fs = require('fs');

const categoryData = require('./src/data/categoryData.json');
const categories = categoryData.map((item) => item.id);
categories.push('random'); // Add the "random" category



class Mission {
  constructor(category, difficulty, target, reward) {
    this.category = category;
    this.difficulty = difficulty;
    this.target = target;
    this.reward = reward;
    this.progress = 0;
    this.completed = false;
    this.creationTime = Date.now(); // Add this line
  }

  addProgress(amount) {
    this.progress += amount;
    if (this.progress >= this.target) {
      this.completed = true;
    }
  }

  getReward() {
    if (this.completed) {
      return this.reward;
    }
    return 0;
  }
}

function generateMissions(difficulty) {
  let target, reward;

  switch (difficulty) {
    case 'easy':
      target = 3;
      reward = 5;
      break;
    case 'medium':
      target = 5;
      reward = 10;
      break;
    case 'difficult':
      target = 10;
      reward = 20;
      break;
    default:
      throw new Error('Invalid difficulty level');
  }

  let category = categories[Math.floor(Math.random() * categories.length)];

  
  // If the category is "random", double the reward
  if (category === 'random') {
    reward *= 2;
  }

  return new Mission(category, difficulty, target, reward);
}
module.exports = {
  categories,
  generateMissions,
  Mission
};