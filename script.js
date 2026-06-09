const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

// ATTĒLU IELĀDE
const pepeImg = new Image(); pepeImg.src = 'pepe.png';
const pepeUpgradeImg = new Image(); pepeUpgradeImg.src = 'pepe_upgrade.png'; 
const beastImg = new Image(); beastImg.src = 'mrbeast.png';

// Spēles mainīgie
let money = 120; 
let lives = 10;
let currentLevel = 1;

let towers = [];
let enemies = [];
let lasers = []; 
let placingTower = false;
let selectedTower = null; 

let enemiesToSpawn = 0; 
let spawnTimer = 0;     
let levelActive = false; 

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

const PATH_WIDTH = 38; // Platāks ceļš, lai labāk izskatītos uz lielā ekrāna

function updateUI() {
  document.getElementById("money").innerText = money;
  document.getElementById("lives").innerText = lives;
  document.getElementById("level").innerText = currentLevel;
}

// KOORDINĀTU PRECIZĒŠANAS FUNKCIJA (Svarīga telefoniem)
// Pārrēķina pieskāriena vietu no ekrāna fiziskā izmēra uz spēles 800x600 pikseļiem
function getCanvasTouchPos(e) {
  const rect = canvas.getBoundingClientRect();
  // Ja tas ir skāriens (touch), ņemam pirmo pirkstu, ja nē — peli
  const clientX = e.touches && e.touches.length > 0 ? e.touches[0].clientX : e.clientX;
  const clientY = e.touches && e.touches.length > 0 ? e.touches[0].clientY : e.clientY;
  
  return {
    x: (clientX - rect.left) * (canvas.width / rect.width),
    y: (clientY - rect.top) * (canvas.height / rect.height)
  };
}

// LOGISKĀS PĀRBAUDES

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
    let dist = Math.sqrt(Math.pow(t.x - x, 2) + Math.pow(t.y - y, 2));
    if (dist < MIN_DISTANCE) return true;
  }
  return false;
}

// KLASES

class Enemy {
  constructor(level) {
    this.x = path[0].x;
    this.y = path[0].y;
    this.speed = 1.3 + (level * 0.12); 
    this.maxHp = 25 + (level * 18);   
    this.hp = this.maxHp;
    this.waypointIndex = 0;
    this.size = 36; // Lielāks tēls priekš 800x600 loga
    this.hitTimer = 0; 
  }

  update() {
    if (this.hitTimer > 0) this.hitTimer--;

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
    ctx.save();
    if (this.hitTimer > 0) {
      ctx.shadowBlur = 15;
      ctx.shadowColor = "#ffffff";
    }
    ctx.drawImage(beastImg, this.x - this.size / 2, this.y - this.size / 2, this.size, this.size);
    ctx.restore();

    // HP josla
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fillRect(this.x - 18, this.y - 28, 36, 5);
    ctx.fillStyle = "#e74c3c";
    ctx.fillRect(this.x - 17, this.y - 27, 34, 3);
    ctx.fillStyle = "#2ecc71";
    ctx.fillRect(this.x - 17, this.y - 27, (this.hp / this.maxHp) * 34, 3);
  }
}

class Tower {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.lvl = 1; 
    this.range = 125; // Palielināts darbības rādiuss lielākai kartei
    this.fireRate = 25; 
    this.cooldown = 0;
    this.size = 40; 
    this.damage = 10;
  }

  upgrade() {
    this.lvl = 2;
    this.damage = 25;      
    this.fireRate = 14;    
    this.range = 165;      
  }

  update() {
    if (this.cooldown > 0) this.cooldown--;

    let target = null;
    let minDist = this.range;

    for (let enemy of enemies) {
      let dist = Math.sqrt(Math.pow(enemy.x - this.x, 2) + Math.pow(enemy.y - this.y, 2));
      if (dist < minDist) {
        minDist = dist;
        target = enemy;
      }
    }

    if (target && this.cooldown === 0) {
      target.hp -= this.damage;
      target.hitTimer = 5; 
      
      lasers.push({
        startX: this.x,
        startY: this.y,
        endX: target.x,
        endY: target.y,
        color: this.lvl === 1 ? "#f1c40f" : "#e67e22",
        width: this.lvl === 1 ? 2 : 4,
        life: 6 
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

    let currentSize = this.lvl === 1 ? this.size : this.size * 2; 
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
    ctx.arc(mouseX, mouseY, 125, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = invalid ? "rgba(231, 76, 60, 0.05)" : "rgba(46, 204, 113, 0.05)";
    ctx.fill();

    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.drawImage(pepeImg, mouseX - 20, mouseY - 20, 40, 40);
    ctx.restore();
  }
}

// IEVADES APSTRĀDE (Pele + Touch)

function handleMove(e) {
  const pos = getCanvasTouchPos(e);
  mouseX = pos.x;
  mouseY = pos.y;
}

function handleInput(e) {
  // Novērš lapas ritināšanu uz leju/raustīšanos, kad spēlē telefonā
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
  } else {
    let foundTower = null;
    // Telefoniem palielināts uztveršanas rādiuss līdz 28, lai vieglāk uzspiest ar pirkstu
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

// Notikumu klausītāji abām platformām
canvas.addEventListener("mousemove", handleMove);
canvas.addEventListener("touchmove", handleMove, { passive: true });

canvas.addEventListener("click", handleInput);
canvas.addEventListener("touchstart", handleInput, { passive: false });

// UPGRADE IZVĒLNE

const menu = document.getElementById("upgradeMenu");

function openUpgradeMenu(e, x, y) {
  menu.style.display = "block";
  
  // Izmantojam fiziskos CSS pikseļus loga pozicionēšanai, lai tas nedeformētos uz mazākiem ekrāniem
  const rect = canvas.getBoundingClientRect();
  const clientX = e.touches && e.touches.length > 0 ? e.touches[0].clientX : e.clientX;
  const relativeX = clientX - rect.left;

  menu.style.left = (relativeX - 75) + "px";
  menu.style.top = (y * (rect.height / canvas.height) - 115) + "px";

  if (selectedTower.lvl === 1) {
    document.getElementById("upgradeStats").innerText = "Dmg: 10➔25 | Ātrums: x2";
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

// Pieslēdzam pogu darbības abiem režīmiem
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

  if (levelActive && enemiesToSpawn > 0) {
    spawnTimer++;
    if (spawnTimer >= 35) { 
      enemies.push(new Enemy(currentLevel));
      enemiesToSpawn--;
      spawnTimer = 0;
    }
  }

  if (levelActive && enemiesToSpawn === 0 && enemies.length === 0) {
    levelActive = false;
    currentLevel++; 
    money += 60;     
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
      money += 12; 
      enemies.splice(i, 1);
      updateUI();
    }
  }

  for (let t of towers) {
    t.update();
    t.draw();
  }

  for (let i = lasers.length - 1; i >= 0; i--) {
    let l = lasers[i];
    ctx.strokeStyle = l.color;
    ctx.lineWidth = l.width;
    ctx.shadowBlur = 10;
    ctx.shadowColor = l.color; 
    
    ctx.beginPath();
    ctx.moveTo(l.startX, l.startY);
    ctx.lineTo(l.endX, l.endY);
    ctx.stroke();
    
    ctx.shadowBlur = 0; 
    l.life--;
    if (l.life <= 0) lasers.splice(i, 1);
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
  }
}

// Palaišana
updateUI();
gameLoop();
