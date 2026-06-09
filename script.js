const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

// ATTĒLU IELĀDE
const pepeImg = new Image(); pepeImg.src = 'pepe.png';
const pepeUpgradeImg = new Image(); pepeUpgradeImg.src = 'pepe_upgrade.png'; 
const beastImg = new Image(); beastImg.src = 'mrbeast.png';

// Spēles galvenie mainīgie
let money = 120; 
let lives = 10;
let currentLevel = 1;

let towers = [];
let enemies = [];
let lasers = []; 
let particles = [];      // JAUNUMS: Daļiņu sprādzieni
let floatingTexts = [];  // JAUNUMS: Peldošie teksti (+$, -dzīvības)

let placingTower = false;
let selectedTower = null; 

let enemiesToSpawn = 0; 
let spawnTimer = 0;     
let levelActive = false; 
let spawnedInWave = 0;   // Seko līdzi tekošā viļņa izlaisto pretinieku skaitam

// Pirksta vai peles pozīcija "ēnas" zīmēšanai
let mouseX = 0;
let mouseY = 0;

// PAPLAŠINĀTAIS CEĻŠ PRIEKŠ 800x600 LOGA
const path = [
  { x: 0, y: 300 },
  { x: 250, y: 300 },
  { x: 250, y: 120 },
  { x: 550, y: 120 },
  { x: 550, y: 480 },
  { x: 800, y: 480 }
];

const PATH_WIDTH = 38; 

function updateUI() {
  document.getElementById("money").innerText = money;
  document.getElementById("lives").innerText = lives;
  document.getElementById("level").innerText = currentLevel;
}

// SAGLABĀŠANAS UN IELĀDES FUNKCIJAS (localStorage)
function saveGame() {
  const gameState = {
    money: money,
    lives: lives,
    currentLevel: currentLevel,
    towers: towers.map(t => ({ x: t.x, y: t.y, lvl: t.lvl }))
  };
  localStorage.setItem("pepe_td_save", JSON.stringify(gameState));
}

function loadGame() {
  const savedData = localStorage.getItem("pepe_td_save");
  if (!savedData) {
    updateUI();
    return;
  }
  const gameState = JSON.parse(savedData);
  money = gameState.money;
  lives = gameState.lives;
  currentLevel = gameState.currentLevel;

  towers = [];
  for (let savedTower of gameState.towers) {
    let t = new Tower(savedTower.x, savedTower.y);
    if (savedTower.lvl === 2) t.upgrade();
    towers.push(t);
  }
  updateUI();
}

// KOORDINĀTU PRECIZĒŠANA (Telefoniem + Pelei)
function getCanvasTouchPos(e) {
  const rect = canvas.getBoundingClientRect();
  const clientX = e.touches && e.touches.length > 0 ? e.touches[0].clientX : e.clientX;
  const clientY = e.touches && e.touches.length > 0 ? e.touches[0].clientY : e.clientY;
  
  return {
    x: (clientX - rect.left) * (canvas.width / rect.width),
    y: (clientY - rect.top) * (canvas.height / rect.height)
  };
}

// VIZUĀLO EFEKTU GENERATORI
function spawnExplosion(x, y, color) {
  for (let i = 0; i < 15; i++) {
    particles.push({
      x: x,
      y: y,
      vx: (Math.random() - 0.5) * 5,
      vy: (Math.random() - 0.5) * 5,
      radius: Math.random() * 3 + 1.5,
      alpha: 1,
      decay: Math.random() * 0.03 + 0.02,
      color: color
    });
  }
}

function createFloatingText(text, x, y, color) {
  floatingTexts.push({
    text: text,
    x: x,
    y: y,
    alpha: 1,
    vy: -0.8
  });
}

// LOGISKĀS ĢEOMETRIJAS PĀRBAUDES
function getDistanceToSegment(p, v, w) {
  let l2 = Math.pow(v.x - w.x, 2) + Math.pow(v.y - w.y, 2);
  if (l2 === 0) return Math.sqrt(Math.pow(p.x - v.x, 2) + Math.pow(p.y - v.y, 2));
  let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.sqrt(Math.pow(p.x - (v.x + t * (w.x - v.x)), 2) + Math.pow(p.y - (v.y + t * (w.y - v.y)), 2));
}

function isClickOnPath(x, y) {
  for (let i = 0; i < path.length - 1; i++) {
    let dist = getDistanceToSegment({x: x, y: y}, path[i], path[i+1]);
    if (dist < (PATH_WIDTH / 2) + 12) return true;
  }
  return false;
}

function isTooCloseToOtherTower(x, y) {
  const MIN_DISTANCE = 35;
  for (let t of towers) {
    if (Math.sqrt(Math.pow(t.x - x, 2) + Math.pow(t.y - y, 2)) < MIN_DISTANCE) return true;
  }
  return false;
}

// KLASES

class Enemy {
  constructor(level, type = "normal") {
    this.x = path[0].x;
    this.y = path[0].y;
    this.type = type;
    this.waypointIndex = 0;
    this.hitTimer = 0;
    this.distanceTraveled = 0; // Kritiski svarīgi viedajai torņu tēmēšanai

    // Atkarībā no pretinieka tipa, uzstādām statusus
    if (type === "fast") {
      this.speed = 2.0 + (level * 0.15);
      this.maxHp = 15 + (level * 10);
      this.size = 30;
      this.reward = 15;
      this.hue = "hue-rotate(130deg)"; // Zilgans pretinieks
    } else if (type === "boss") {
      this.speed = 0.8 + (level * 0.05);
      this.maxHp = 120 + (level * 50);
      this.size = 52;
      this.reward = 50;
      this.hue = "hue-rotate(270deg) brightness(0.8)"; // Violetīgi sarkans Boss
    } else {
      this.speed = 1.3 + (level * 0.12);
      this.maxHp = 25 + (level * 18);
      this.size = 36;
      this.reward = 12;
      this.hue = "none";
    }
    this.hp = this.maxHp;
  }

  update() {
    if (this.hitTimer > 0) this.hitTimer--;

    let target = path[this.waypointIndex + 1];
    if (!target) return;

    let dx = target.x - this.x;
    let dy = target.y - this.y;
    let dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < this.speed) {
      this.x = target.x;
      this.y = target.y;
      this.waypointIndex++;
    } else {
      this.x += (dx / dist) * this.speed;
      this.y += (dy / dist) * this.speed;
      this.distanceTraveled += this.speed;
    }
  }

  draw() {
    ctx.save();
    if (this.hue !== "none") ctx.filter = this.hue;
    if (this.hitTimer > 0) {
      ctx.shadowBlur = 15;
      ctx.shadowColor = "#ffffff";
    }
    ctx.drawImage(beastImg, this.x - this.size / 2, this.y - this.size / 2, this.size, this.size);
    ctx.restore();

    // HP josla
    let barW = this.size;
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fillRect(this.x - barW/2, this.y - this.size/2 - 8, barW, 5);
    ctx.fillStyle = "#e74c3c";
    ctx.fillRect(this.x - barW/2 + 0.5, this.y - this.size/2 - 7.5, barW - 1, 3);
    ctx.fillStyle = this.type === "boss" ? "#9b59b6" : "#2ecc71";
    ctx.fillRect(this.x - barW/2 + 0.5, this.y - this.size/2 - 7.5, (this.hp / this.maxHp) * (barW - 1), 3);
  }
}

class Tower {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.lvl = 1; 
    this.range = 130; 
    this.fireRate = 24; 
    this.cooldown = 0;
    this.size = 40; 
    this.damage = 10;
  }

  upgrade() {
    this.lvl = 2;
    this.damage = 26;      
    this.fireRate = 13;    
    this.range = 170;      
  }

  update() {
    if (this.cooldown > 0) this.cooldown--;

    let target = null;
    let maxProgress = -1;

    // VIEDĀ TĒMĒŠANA: Atrod pretinieku, kas ir rādiusā UN ticis vistālāk pa ceļu
    for (let enemy of enemies) {
      let dist = Math.sqrt(Math.pow(enemy.x - this.x, 2) + Math.pow(enemy.y - this.y, 2));
      if (dist < this.range && enemy.distanceTraveled > maxProgress) {
        maxProgress = enemy.distanceTraveled;
        target = enemy;
      }
    }

    if (target && this.cooldown === 0) {
      target.hp -= this.damage;
      target.hitTimer = 4; 
      
      lasers.push({
        startX: this.x,
        startY: this.y - 6,
        endX: target.x,
        endY: target.y,
        color: this.lvl === 1 ? "#f1c40f" : "#e67e22",
        width: this.lvl === 1 ? 2.5 : 4.5,
        life: 5 
      });

      this.cooldown = this.fireRate;
    }
  }

  draw() {
    if (selectedTower === this) {
      ctx.strokeStyle = this.lvl === 1 ? "rgba(46, 204, 113, 0.25)" : "rgba(241, 196, 15, 0.35)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.range, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = this.lvl === 1 ? "rgba(46, 204, 113, 0.03)" : "rgba(241, 196, 15, 0.04)";
      ctx.fill();
    }

    let currentSize = this.lvl === 1 ? this.size : this.size * 1.8; 
    let imgToDraw = this.lvl === 1 ? pepeImg : pepeUpgradeImg;
    
    ctx.drawImage(imgToDraw, this.x - currentSize / 2, this.y - currentSize / 2, currentSize, currentSize);
  }
}

// PASAULES ZĪMĒŠANA
function drawMap() {
  // Zāle
  ctx.fillStyle = "#1e3d23";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  ctx.strokeStyle = "#1a351e";
  ctx.lineWidth = 2;
  for(let i=0; i<canvas.width; i+=40) {
    ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, canvas.height); ctx.stroke();
  }

  // Zemes ceļa apmale
  ctx.strokeStyle = "#4e3621";
  ctx.lineWidth = PATH_WIDTH + 6;
  ctx.lineCap = "round"; ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(path[0].x, path[0].y);
  for (let p of path) ctx.lineTo(p.x, p.y);
  ctx.stroke();

  // Ceļš
  ctx.strokeStyle = "#ba9158";
  ctx.lineWidth = PATH_WIDTH;
  ctx.beginPath();
  ctx.moveTo(path[0].x, path[0].y);
  for (let p of path) ctx.lineTo(p.x, p.y);
  ctx.stroke();
}

function drawPlacementGhost() {
  if (placingTower) {
    let invalid = isClickOnPath(mouseX, mouseY) || isTooCloseToOtherTower(mouseX, mouseY) || money < 50;
    
    ctx.strokeStyle = invalid ? "rgba(231, 76, 60, 0.4)" : "rgba(46, 204, 113, 0.4)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(mouseX, mouseY, 130, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = invalid ? "rgba(231, 76, 60, 0.05)" : "rgba(46, 204, 113, 0.05)";
    ctx.fill();

    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.drawImage(pepeImg, mouseX - 20, mouseY - 20, 40, 40);
    ctx.restore();
  }
}

// IEVADES APSTRĀDE (Mērogota abām platformām)
function handleMove(e) {
  const pos = getCanvasTouchPos(e);
  mouseX = pos.x;
  mouseY = pos.y;
}

function handleInput(e) {
  if (e.cancelable) e.preventDefault(); 
  
  const pos = getCanvasTouchPos(e);
  const x = pos.x;
  const y = pos.y;

  if (placingTower) {
    if (isClickOnPath(x, y) || isTooCloseToOtherTower(x, y) || money < 50) return;

    towers.push(new Tower(x, y));
    money -= 50;
    placingTower = false;
    updateUI();
    saveGame();
  } else {
    let foundTower = null;
    for (let t of towers) {
      if (Math.sqrt(Math.pow(t.x - x, 2) + Math.pow(t.y - y, 2)) < 28) {
        foundTower = t;
        break;
      }
    }

    if (foundTower) {
      selectedTower = foundTower;
      openUpgradeMenu(e, x, y);
    } else {
      closeUpgradeMenu();
    }
  }
}

canvas.addEventListener("mousemove", handleMove);
canvas.addEventListener("touchmove", handleMove, { passive: true });
canvas.addEventListener("click", handleInput);
canvas.addEventListener("touchstart", handleInput, { passive: false });

// UPGRADE IZVĒLNE
const menu = document.getElementById("upgradeMenu");

function openUpgradeMenu(e, x, y) {
  menu.style.display = "block";
  
  const rect = canvas.getBoundingClientRect();
  const clientX = e.touches && e.touches.length > 0 ? e.touches[0].clientX : e.clientX;
  const relativeX = clientX - rect.left;

  menu.style.left = (relativeX - 75) + "px";
  menu.style.top = (y * (rect.height / canvas.height) - 115) + "px";

  if (selectedTower.lvl === 1) {
    document.getElementById("upgradeStats").innerText = "Dmg: 10➔26 | Ātrums: x2";
    document.getElementById("upgradeBtn").innerText = "Uzlabot ($75)";
    document.getElementById("upgradeBtn").disabled = false;
  } else {
    document.getElementById("upgradeStats").innerText = "Max Līmenis!";
    document.getElementById("upgradeBtn").innerText = "Max Lvl";
    document.getElementById("upgradeBtn").disabled = true;
  }
}

function closeUpgradeMenu() {
  menu.style.display = "none";
  selectedTower = null;
}

const closeEvents = ["click", "touchstart"];
closeEvents.forEach(evt => {
  document.getElementById("closeBtn").addEventListener(evt, (e) => {
    e.stopPropagation();
    closeUpgradeMenu();
  });
});

function triggerUpgrade(e) {
  e.stopPropagation();
  if (selectedTower && selectedTower.lvl === 1 && money >= 75) {
    money -= 75;
    selectedTower.upgrade();
    updateUI();
    closeUpgradeMenu();
    saveGame(); 
  }
}
document.getElementById("upgradeBtn").addEventListener("click", triggerUpgrade);
document.getElementById("upgradeBtn").addEventListener("touchstart", triggerUpgrade);

function buyPepeAction(e) {
  if (money >= 50) {
    placingTower = true;
    closeUpgradeMenu();
  }
}
document.getElementById("buyPepe").addEventListener("click", buyPepeAction);
document.getElementById("buyPepe").addEventListener("touchstart", buyPepeAction);

function nextLevelAction() {
  if (!levelActive) {
    levelActive = true;
    spawnedInWave = 0;
    enemiesToSpawn = 6 + (currentLevel * 3); 
    document.getElementById("nextLevel").disabled = true;
  }
}
document.getElementById("nextLevel").addEventListener("click", nextLevelAction);
document.getElementById("nextLevel").addEventListener("touchstart", nextLevelAction);

// SPĒLES GALVENAIS CIKLS
function gameLoop() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  drawMap();

  // Pretinieku veidošanas loģika (Spawning)
  if (levelActive && enemiesToSpawn > 0) {
    spawnTimer++;
    if (spawnTimer >= 35) { 
      spawnedInWave++;
      let type = "normal";
      
      // Dinamiska pretinieku dažādība viļņos
      if (currentLevel % 5 === 0 && enemiesToSpawn === 1) {
        type = "boss"; // Ik pēc 5 līmeņiem viļņa beigās iznāk Boss
      } else if (spawnedInWave % 3 === 0) {
        type = "fast"; // Katrs trešais pretinieks parastā vilnī ir ātrs
      }

      enemies.push(new Enemy(currentLevel, type));
      enemiesToSpawn--;
      spawnTimer = 0;
    }
  }

  // Viļņa beigu pārbaude
  if (levelActive && enemiesToSpawn === 0 && enemies.length === 0) {
    levelActive = false;
    currentLevel++; 
    money += 60;     
    document.getElementById("nextLevel").disabled = false; 
    updateUI();
    saveGame(); 
  }

  // Pretinieku cikls
  for (let i = enemies.length - 1; i >= 0; i--) {
    let e = enemies[i];
    e.update();
    e.draw();

    // Ja sasniedz galu
    if (e.waypointIndex >= path.length - 1) {
      let damage = e.type === "boss" ? 3 : 1;
      lives -= damage;
      createFloatingText(`-${damage}`, e.x, e.y, "#e74c3c");
      enemies.splice(i, 1);
      updateUI();
      if (lives > 0) saveGame(); 
    }
    // Ja tiek iznīcināts
    else if (e.hp <= 0) {
      money += e.reward;
      let pColor = e.type === "fast" ? "#3498db" : (e.type === "boss" ? "#9b59b6" : "#f1c40f");
      spawnExplosion(e.x, e.y, pColor); // Efektīgs sprādziens
      createFloatingText(`+$${e.reward}`, e.x, e.y, "#f1c40f"); // Peldošais teksts
      enemies.splice(i, 1);
      updateUI();
    }
  }

  // Torņu cikls
  for (let t of towers) {
    t.update();
    t.draw();
  }

  // Lāzeru/Zibeņu zīmēšana
  for (let i = lasers.length - 1; i >= 0; i--) {
    let l = lasers[i];
    ctx.strokeStyle = l.color;
    ctx.lineWidth = l.width;
    ctx.shadowBlur = 10;
    ctx.shadowColor = l.color; 
    
    ctx.beginPath();
    // JAUNUMS: Zibens zig-zag vibrācijas efekts
    let midX = (l.startX + l.endX) / 2 + (Math.random() - 0.5) * 8;
    let midY = (l.startY + l.endY) / 2 + (Math.random() - 0.5) * 8;
    ctx.moveTo(l.startX, l.startY);
    ctx.lineTo(midX, midY);
    ctx.lineTo(l.endX, l.endY);
    ctx.stroke();
    
    ctx.shadowBlur = 0; 
    l.life--;
    if (l.life <= 0) lasers.splice(i, 1);
  }

  // JAUNUMS: Sprādzienu daļiņu apstrāde
  for (let i = particles.length - 1; i >= 0; i--) {
    let p = particles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.alpha -= p.decay;
    if (p.alpha <= 0) {
      particles.splice(i, 1);
    } else {
      ctx.save();
      ctx.globalAlpha = p.alpha;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  // JAUNUMS: Peldošo tekstu apstrāde
  for (let i = floatingTexts.length - 1; i >= 0; i--) {
    let ft = floatingTexts[i];
    ft.y += ft.vy;
    ft.alpha -= 0.02;
    if (ft.alpha <= 0) {
      floatingTexts.splice(i, 1);
    } else {
      ctx.save();
      ctx.globalAlpha = ft.alpha;
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 16px 'Segoe UI'";
      ctx.shadowBlur = 4;
      ctx.shadowColor = "#000000";
      ctx.fillText(ft.text, ft.x - 10, ft.y);
      ctx.restore();
    }
  }

  drawPlacementGhost();

  if (lives > 0) {
    requestAnimationFrame(gameLoop);
  } else {
    ctx.fillStyle = "rgba(0,0,0,0.85)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#e74c3c";
    ctx.font = "bold 45px 'Segoe UI'";
    ctx.textAlign = "center";
    ctx.fillText("SPĒLE BEIGUSIES!", canvas.width / 2, canvas.height / 2);
    localStorage.removeItem("pepe_td_save"); 
  }
}

// Ielāde un palaišana
loadGame();
gameLoop();
