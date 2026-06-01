const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

// Spēles resursi
let money = 100;
let lives = 10;
let towers = [];
let enemies = [];
let projectiles = [];
let placingTower = false;

// Ceļa punkti (Waypoints), pa kuriem skries MrBeast pretinieki
const path = [
  { x: 0, y: 200 },
  { x: 200, y: 200 },
  { x: 200, y: 100 },
  { x: 400, y: 100 },
  { x: 400, y: 300 },
  { x: 600, y: 300 }
];

// Atjauno tekstu ekrānā
function updateUI() {
  document.getElementById("money").innerText = money;
  document.getElementById("lives").innerText = lives;
}

// KLASES

// Pretinieks: MrBeast komanda
class Enemy {
  constructor() {
    this.x = path[0].x;
    this.y = path[0].y;
    this.speed = 1.5;
    this.hp = 30;
    this.maxHp = 30;
    this.waypointIndex = 0;
    this.radius = 12;
  }

  update() {
    let target = path[this.waypointIndex + 1];
    if (!target) return;

    // Kustība uz nākamo punktu
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
    // Pretinieka ķermenis (Sarkans MrBeast aizvietotājs)
    ctx.fillStyle = "#ff4444";
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fill();

    // Dzīvību josla (HP bar)
    ctx.fillStyle = "red";
    ctx.fillRect(this.x - 15, this.y - 20, 30, 4);
    ctx.fillStyle = "green";
    ctx.fillRect(this.x - 15, this.y - 20, (this.hp / this.maxHp) * 30, 4);
  }
}

// Tornis: Pepe varde
class Tower {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.range = 100;
    this.fireRate = 30; // Šauj reizi 30 kadros
    this.cooldown = 0;
  }

  update() {
    if (this.cooldown > 0) this.cooldown--;

    // Meklē tuvāko pretinieku redzamības zonā
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

    // Ja atrod mērķi un gatavs šaut
    if (target && this.cooldown === 0) {
      projectiles.push(new Projectile(this.x, this.y, target));
      this.cooldown = this.fireRate;
    }
  }

  draw() {
    // Pepe torņa izskats (Zaļš kvadrāts)
    ctx.fillStyle = "#2ecc71";
    ctx.fillRect(this.x - 15, this.y - 15, 30, 30);

    // Parāda darbības rādiusu, ja tiek plānots vai novietots
    ctx.strokeStyle = "rgba(46, 204, 113, 0.2)";
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.range, 0, Math.PI * 2);
    ctx.stroke();
  }
}

// Šāviņš
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
      this.target.hp -= this.damage; // Nodara bojājumu
      return true; // Izdzēš šāviņu
    }

    this.x += (dx / dist) * this.speed;
    this.y += (dy / dist) * this.speed;
    return false;
  }

  draw() {
    ctx.fillStyle = "#f1c40f"; // Dzeltens šāviņš
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

canvas.addEventListener("click", (e) => {
  if (placingTower) {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    towers.push(new Tower(x, y));
    money -= 50;
    placingTower = false;
    updateUI();
  }
});

// SPĒLES CIKLS (Game Loop)

function drawPath() {
  ctx.strokeStyle = "#7f8c8d";
  ctx.lineWidth = 30;
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

  // 1. Zīmē ceļu
  drawPath();

  // 2. Automātiski rada pretiniekus
  if (Math.random() < 0.015 && lives > 0) {
    enemies.push(new Enemy());
  }

  // 3. Atjauno un zīmē pretiniekus
  for (let i = enemies.length - 1; i >= 0; i--) {
    let e = enemies[i];
    e.update();
    e.draw();

    // Ja pretinieks iziet cauri kartei
    if (e.waypointIndex >= path.length - 1) {
      lives--;
      enemies.splice(i, 1);
      updateUI();
    }
    // Ja pretinieks ir miris
    else if (e.hp <= 0) {
      money += 15; // Nopelna naudu
      enemies.splice(i, 1);
      updateUI();
    }
  }

  // 4. Atjauno un zīmē torņus
  for (let t of towers) {
    t.update();
    t.draw();
  }

  // 5. Atjauno un zīmē šāviņus
  for (let i = projectiles.length - 1; i >= 0; i--) {
    let p = projectiles[i];
    
    // Ja mērķis vairs neeksistē (nomira), izdzēš šāviņu
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

  // Pārbauda vai spēle nav beigusies
  if (lives > 0) {
    requestAnimationFrame(gameLoop);
  } else {
    ctx.fillStyle = "rgba(0,0,0,0.7)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "white";
    ctx.font = "40px Arial";
    ctx.textAlign = "center";
    ctx.fillText("SPĒLE BEIGUSIES!", canvas.width / 2, canvas.height / 2);
  }
}

// Sāk spēli
gameLoop();
