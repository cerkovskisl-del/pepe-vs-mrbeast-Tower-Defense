const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

// IELĀDĒJAM ATTĒLUS
const pepeImg = new Image();
pepeImg.src = 'pepe.png';

const beastImg = new Image();
beastImg.src = 'mrbeast.png';

// Spēles resursi
let money = 100;
let lives = 10;
let currentLevel = 1;

let towers = [];
let enemies = [];
let projectiles = [];
let placingTower = false;

let enemiesToSpawn = 0; 
let spawnTimer = 0;     
let levelActive = false; 

const path = [
  { x: 0, y: 200 },
  { x: 200, y: 200 },
  { x: 200, y: 100 },
  { x: 400, y: 100 },
  { x: 400, y: 300 },
  { x: 600, y: 300 }
];

const PATH_WIDTH = 30; // Ceļa platums, ko izmantosim pārbaudei

function updateUI() {
  document.getElementById("money").innerText = money;
  document.getElementById("lives").innerText = lives;
  document.getElementById("level").innerText = currentLevel;
}

// FUNKCIJAS PĀRBAUDĒM (UZ CEĻA UN TUVUMĀ)

// Aprēķina attālumu no punkta līdz nogrieznim (ceļa posmam)
function getDistanceToSegment(p, v, w) {
  let l2 = Math.pow(v.x - w.x, 2) + Math.pow(v.y - w.y, 2);
  if (l2 === 0) return Math.sqrt(Math.pow(p.x - v.x, 2) + Math.pow(p.y - v.y, 2));
  let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.sqrt(Math.pow(p.x - (v.x + t * (w.x - v.x)), 2) + Math.pow(p.y - (v.y + t * (w.y - v.y)), 2));
}

// Pārbauda, vai klikšķis ir uz ceļa
function isClickOnPath(x, y) {
  for (let i = 0; i < path.length - 1; i++) {
    let dist = getDistanceToSegment({x: x, y: y}, path[i], path[i+1]);
    if (dist < (PATH_WIDTH / 2) + 15) { // 15 ir papildu buferis, lai neuzliktu par tuvu malai
      return true;
    }
  }
  return false;
}

// Pārbauda, vai klikšķis ir pārāk tuvu citam tornim
function isTooCloseToOtherTower(x, y) {
  const MIN_DISTANCE = 35; // Minimālais attālums starp torņu centriem
  for (let t of towers) {
    let dx = t.x - x;
    let dy = t.y - y;
    let dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < MIN_DISTANCE) {
      return true;
    }
  }
  return false;
}

// KLASES

class Enemy {
  constructor(level) {
    this.x = path[0].x;
    this.y = path[0].y;
    this.speed = 1.5 + (level * 0.1); 
    this.maxHp = 20 + (level * 15);   
    this.hp = this.maxHp;
    this.waypointIndex = 0;
    this.size = 32;
  }

  update() {
    let target = path[this.waypointIndex + 1];
    if (!target) return;

    let dx = target.x - this.x;
    let dy = target.y - this.y;
    let dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < this.speed) {
      this.waypointIndex++;
    } else {
      this.x += (dx / dist) * this.speed;
      this.y += (dy / dist) * this.speed;
    }
  }

  draw() {
    ctx.drawImage(beastImg, this.x - this.size / 2, this.y - this.size / 2, this.size, this.size);

    ctx.fillStyle = "red";
    ctx.fillRect(this.x - 15, this.y - 25, 30, 4);
    ctx.fillStyle = "green";
    ctx.fillRect(this.x - 15, this.y - 25, (this.hp / this.maxHp) * 30, 4);
  }
}

class Tower {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.range = 100;
    this.fireRate = 30; 
    this.cooldown = 0;
    this.size = 36;
  }

  update() {
    if (this.cooldown > 0) this.cooldown--;

    let target = null;
    let minDist = this.range;

    for (let enemy of enemies) {
      let dx = enemy.x - this.x;
      let dy = enemy.y - this.y;
      let dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < minDist) {
        minDist = dist;
        target = enemy;
      }
    }

    if (target && this.cooldown === 0) {
      projectiles.push(new Projectile(this.x, this.y, target));
      this.cooldown = this.fireRate;
    }
  }

  draw() {
    ctx.strokeStyle = "rgba(46, 204, 113, 0.15)";
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.range, 0, Math.PI * 2);
    ctx.stroke();

    ctx.drawImage(pepeImg, this.x - this.size / 2, this.y - this.size / 2, this.size, this.size);
  }
}

class Projectile {
  constructor(x, y, target) {
    this.x = x;
    this.y = y;
    this.target = target;
    this.speed = 5;
    this.damage = 10;
  }

  update() {
    let dx = this.target.x - this.x;
    let dy = this.target.y - this.y;
    let dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < this.speed) {
      this.target.hp -= this.damage;
      return true; 
    }

    this.x += (dx / dist) * this.speed;
    this.y += (dy / dist) * this.speed;
    return false;
  }

  draw() {
    ctx.fillStyle = "#f1c40f"; 
    ctx.beginPath();
    ctx.arc(this.x, this.y, 4, 0, Math.PI * 2);
    ctx.fill();
  }
}

// NOTIKUMI (Events)

document.getElementById("buyPepe").addEventListener("click", () => {
  if (money >= 50) {
    placingTower = true;
  }
});

document.getElementById("nextLevel").addEventListener("click", () => {
  if (!levelActive) {
    levelActive = true;
    enemiesToSpawn = 5 + (currentLevel * 3); 
    document.getElementById("nextLevel").disabled = true;
  }
});

canvas.addEventListener("click", (e) => {
  if (placingTower) {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // JAUNĀS PĀRBAUDES PIRMS NOVIETOŠANAS
    if (isClickOnPath(x, y)) {
      alert("Nedarbojas! Tu nevari likt Pepe torni uz ceļa!");
      return;
    }

    if (isTooCloseToOtherTower(x, y)) {
      alert("Pārāk tuvu! Tev jāatstāj vieta starp Pepe torņiem!");
      return;
    }

    // Ja abas pārbaudes izietas, novieto torni
    towers.push(new Tower(x, y));
    money -= 50;
    placingTower = false;
    updateUI();
  }
});

// SPĒLES CIKLS

function drawPath() {
  ctx.strokeStyle = "#7f8c8d";
  ctx.lineWidth = PATH_WIDTH;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(path[0].x, path[0].y);
  for (let p of path) {
    ctx.lineTo(p.x, p.y);
  }
  ctx.stroke();
}

function gameLoop() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  drawPath();

  if (levelActive && enemiesToSpawn > 0) {
    spawnTimer++;
    if (spawnTimer >= 40) { 
      enemies.push(new Enemy(currentLevel));
      enemiesToSpawn--;
      spawnTimer = 0;
    }
  }

  if (levelActive && enemiesToSpawn === 0 && enemies.length === 0) {
    levelActive = false;
    currentLevel++; 
    money += 50;    
    document.getElementById("nextLevel").disabled = false; 
    updateUI();
  }

  for (let i = enemies.length - 1; i >= 0; i--) {
    let e = enemies[i];
    e.update();
    e.draw();

    if (e.waypointIndex >= path.length - 1) {
      lives--;
      enemies.splice(i, 1);
      updateUI();
    }
    else if (e.hp <= 0) {
      money += 15; 
      enemies.splice(i, 1);
      updateUI();
    }
  }

  for (let t of towers) {
    t.update();
    t.draw();
  }

  for (let i = projectiles.length - 1; i >= 0; i--) {
    let p = projectiles[i];
    
    if (!enemies.includes(p.target)) {
      projectiles.splice(i, 1);
      continue;
    }

    let hit = p.update();
    p.draw();

    if (hit) {
      projectiles.splice(i, 1);
    }
  }

  if (lives > 0) {
    requestAnimationFrame(gameLoop);
  } else {
    ctx.fillStyle = "rgba(0,0,0,0.8)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "white";
    ctx.font = "40px Arial";
    ctx.textAlign = "center";
    ctx.fillText("SPĒLE BEIGUSIES!", canvas.width / 2, canvas.height / 2);
  }
}

gameLoop();
