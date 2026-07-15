import {
  loadQuestions, createQuizPicker, loadSprites, sound, clamp, formatMath, formatClock
} from "./core.js";

const W = 540;
const H = 760;
const ROAD_LEFT = 60;
const ROAD_RIGHT = W - 60;
const SQUAD_Y = 640;
const MAX_SOLDIERS = 60;
const BEST_KEY = "qq_lastwar_best";

const MOB_TYPES = {
  slimeGreen: { hp: 16, speed: 62, kill: 1, sprite: "slimeGreen" },
  slimeBlue: { hp: 22, speed: 58, kill: 1, sprite: "slimeBlue" },
  fox: { hp: 26, speed: 82, kill: 1, sprite: "fox" },
  bat: { hp: 18, speed: 96, kill: 1, sprite: "bat", wobble: true },
  boar: { hp: 52, speed: 55, kill: 2, sprite: "boar" },
  ghost: { hp: 40, speed: 66, kill: 2, sprite: "ghost", wobble: true },
  wasp: { hp: 24, speed: 100, kill: 1, sprite: "wasp", wobble: true },
  crowned: { hp: 130, speed: 52, kill: 3, sprite: "crowned", scale: 1.15 },
  bossBat: { hp: 700, speed: 26, kill: 10, sprite: "bossBat", scale: 1.1, boss: true }
};

const SPAWN_TABLE = [
  // [경과 시간(초) 이상, 스폰 간격, 타입 후보]
  [0, 2.1, ["slimeGreen", "slimeBlue"]],
  [25, 1.5, ["slimeGreen", "slimeBlue", "fox", "bat"]],
  [55, 1.15, ["fox", "bat", "boar", "slimeBlue"]],
  [90, 0.95, ["boar", "ghost", "wasp", "bat"]],
  [130, 0.78, ["ghost", "wasp", "boar", "crowned"]],
  [180, 0.64, ["wasp", "crowned", "ghost", "boar"]]
];

const state = {
  phase: "ready", // ready | play | over
  time: 0,
  distance: 0,
  soldiers: 5,
  kills: 0,
  correct: 0,
  squadX: W / 2,
  moveDir: 0,
  mobs: [],
  bullets: [],
  fx: [],
  spawnTimer: 0,
  fireTimer: 0,
  gate: null,       // { y, question, options:[{text,correct}], banner }
  gateTimer: 6,     // 첫 게이트까지 남은 시간
  bossTimer: 60,
  hpScale: 1,
  walkFrame: 0
};

let sprites = {};
let picker = null;
let heroKey = "knight";

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const stage = document.getElementById("stage");
const hud = {
  squad: document.getElementById("hud-squad"),
  dist: document.getElementById("hud-dist"),
  kills: document.getElementById("hud-kills"),
  correct: document.getElementById("hud-correct")
};
const muteBtn = document.getElementById("mute-btn");

/* ------------------------------------------------------------------ */
/* 입력                                                                */
/* ------------------------------------------------------------------ */

const keys = new Set();
document.addEventListener("keydown", event => {
  if (["ArrowLeft", "ArrowRight", "a", "d", "A", "D"].includes(event.key)) {
    keys.add(event.key.toLowerCase().replace("arrow", ""));
    event.preventDefault();
  }
});
document.addEventListener("keyup", event => {
  keys.delete(event.key.toLowerCase().replace("arrow", ""));
});

let dragging = false;
canvas.addEventListener("pointerdown", event => {
  dragging = true;
  canvas.setPointerCapture(event.pointerId);
  movePointer(event);
});
canvas.addEventListener("pointermove", event => {
  if (dragging) movePointer(event);
});
canvas.addEventListener("pointerup", () => { dragging = false; });

function movePointer(event) {
  const rect = canvas.getBoundingClientRect();
  const x = (event.clientX - rect.left) * (W / rect.width);
  state.squadX = clamp(x, ROAD_LEFT + 30, ROAD_RIGHT - 30);
}

/* ------------------------------------------------------------------ */
/* HUD / 토스트                                                        */
/* ------------------------------------------------------------------ */

function syncHud() {
  hud.squad.textContent = state.soldiers;
  hud.dist.textContent = `${Math.floor(state.distance)}m`;
  hud.kills.textContent = state.kills;
  hud.correct.textContent = state.correct;
}

let toastText = "";
let toastTimer = 0;
let explainText = "";
let explainTimer = 0;

function toast(text, seconds = 2.2) {
  toastText = text;
  toastTimer = seconds;
}

/* ------------------------------------------------------------------ */
/* 게이트                                                              */
/* ------------------------------------------------------------------ */

function spawnGate() {
  const question = picker.next();
  if (!question) return;
  const wrongPool = question.options.filter((_, index) => index !== question.correctIndex);
  const wrong = wrongPool[Math.floor(Math.random() * wrongPool.length)] ?? "?";
  const correctOnLeft = Math.random() < 0.5;
  const options = [
    { text: correctOnLeft ? question.options[question.correctIndex] : wrong, correct: correctOnLeft },
    { text: correctOnLeft ? wrong : question.options[question.correctIndex], correct: !correctOnLeft }
  ];
  state.gate = { y: -70, question, options, speed: 52 };
}

function resolveGate() {
  const gate = state.gate;
  state.gate = null;
  state.gateTimer = 14 + Math.random() * 5;
  const mid = (ROAD_LEFT + ROAD_RIGHT) / 2;
  const pickedLeft = state.squadX < mid;
  const picked = gate.options[pickedLeft ? 0 : 1];
  if (picked.correct) {
    state.correct += 1;
    const gain = Math.min(MAX_SOLDIERS - state.soldiers, 4 + Math.floor(state.soldiers * 0.35));
    state.soldiers += Math.max(0, gain);
    sound.play("quiz_correct.wav", 0.5);
    sound.play("levelup.wav", 0.35);
    toast(gain > 0 ? `정답! 부대 +${gain}` : "정답! (부대 최대)");
    state.fx.push({ sprite: "levelup", x: state.squadX, y: SQUAD_Y - 30, age: 0, life: 0.7, scale: 1.2 });
  } else {
    const lost = Math.floor(state.soldiers / 2);
    state.soldiers = Math.max(1, state.soldiers - lost);
    sound.play("quiz_wrong.wav", 0.55);
    toast(`오답… 부대 -${lost}`);
    if (gate.question.explanation) {
      explainText = gate.question.explanation;
      explainTimer = 5;
    }
  }
  syncHud();
}

/* ------------------------------------------------------------------ */
/* 시뮬레이션                                                          */
/* ------------------------------------------------------------------ */

function currentSpawnSpec() {
  let spec = SPAWN_TABLE[0];
  for (const row of SPAWN_TABLE) {
    if (state.time >= row[0]) spec = row;
  }
  return spec;
}

function soldierPositions() {
  const count = Math.min(state.soldiers, 24); // 그리는 병사 수 상한
  const cols = clamp(Math.ceil(Math.sqrt(count * 1.6)), 1, 6);
  const positions = [];
  for (let i = 0; i < count; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    positions.push({
      x: state.squadX + (col - (cols - 1) / 2) * 26 + (row % 2 ? 7 : 0),
      y: SQUAD_Y + row * 22
    });
  }
  return positions;
}

function update(dt) {
  state.time += dt;
  state.distance += dt * 14;
  state.walkFrame += dt * 8;
  if (toastTimer > 0) toastTimer -= dt;
  if (explainTimer > 0) explainTimer -= dt;
  state.hpScale = 1 + state.time / 55;

  // 이동
  const left = keys.has("left") || keys.has("a");
  const right = keys.has("right") || keys.has("d");
  const speed = 240;
  if (left && !right) state.squadX -= speed * dt;
  if (right && !left) state.squadX += speed * dt;
  state.squadX = clamp(state.squadX, ROAD_LEFT + 30, ROAD_RIGHT - 30);

  // 스폰
  const [, interval, types] = currentSpawnSpec();
  state.spawnTimer -= dt;
  if (state.spawnTimer <= 0) {
    state.spawnTimer = state.gate ? interval * 1.6 : interval;
    const type = types[Math.floor(Math.random() * types.length)];
    spawnMob(type);
  }
  state.bossTimer -= dt;
  if (state.bossTimer <= 0) {
    state.bossTimer = 75;
    spawnMob("bossBat");
    sound.play("rush_warning.wav", 0.4);
    toast("⚠️ 보스 출현!", 2.6);
  }

  // 게이트
  if (!state.gate) {
    state.gateTimer -= dt;
    if (state.gateTimer <= 0) spawnGate();
  } else {
    state.gate.y += state.gate.speed * dt;
    if (state.gate.y >= SQUAD_Y - 26) resolveGate();
  }

  // 사격 (살아있는 적을 조준해서 발사)
  state.fireTimer -= dt;
  if (state.fireTimer <= 0) {
    state.fireTimer = 0.32;
    const shooters = Math.min(state.soldiers, 10);
    const damagePerBullet = (3 + state.soldiers * 1.15) / shooters;
    const positions = soldierPositions();
    const alive = state.mobs.filter(mob => !mob.dead && mob.y < SQUAD_Y - 40);
    for (let i = 0; i < shooters; i++) {
      const from = positions[i % positions.length];
      const x = from.x + (Math.random() * 8 - 4);
      const y = from.y - 18;
      let vx = 0;
      let vy = -430;
      if (alive.length) {
        const target = alive[i % alive.length];
        const aimY = target.y + MOB_TYPES[target.type].speed * 0.25;
        const dist = Math.hypot(target.x - x, aimY - y) || 1;
        vx = ((target.x - x) / dist) * 430;
        vy = Math.min(-120, ((aimY - y) / dist) * 430);
      }
      state.bullets.push({ x, y, vx, vy, damage: damagePerBullet });
    }
    sound.play("pickup.wav", 0.05);
  }

  // 몹
  for (const mob of state.mobs) {
    const spec = MOB_TYPES[mob.type];
    mob.y += spec.speed * dt;
    mob.frame += dt * 6;
    if (spec.wobble) mob.x += Math.sin(state.time * 3 + mob.seed) * 28 * dt;
    mob.x = clamp(mob.x, ROAD_LEFT + 20, ROAD_RIGHT - 20);
    if (mob.y >= SQUAD_Y - 12) {
      mob.dead = true;
      hitSquad(spec.kill, mob);
    }
  }

  // 탄환 충돌
  for (const bullet of state.bullets) {
    bullet.x += (bullet.vx || 0) * dt;
    bullet.y += bullet.vy * dt;
    if (bullet.y < -20 || bullet.x < -20 || bullet.x > W + 20) { bullet.dead = true; continue; }
    for (const mob of state.mobs) {
      if (mob.dead) continue;
      const spec = MOB_TYPES[mob.type];
      const hitRadius = 22 * (spec.scale || 1);
      if (Math.abs(mob.x - bullet.x) < hitRadius && Math.abs(mob.y - bullet.y) < hitRadius) {
        bullet.dead = true;
        mob.hp -= bullet.damage;
        if (Math.random() < 0.3) {
          state.fx.push({ sprite: "spark", x: bullet.x, y: bullet.y, age: 0, life: 0.25, scale: 0.55 });
        }
        if (mob.hp <= 0) {
          mob.dead = true;
          state.kills += 1;
          state.fx.push({ sprite: "poof", x: mob.x, y: mob.y, age: 0, life: 0.5, scale: spec.boss ? 1.6 : 0.9 });
          sound.play("monster_die.mp3", 0.15);
        }
        break;
      }
    }
  }
  state.mobs = state.mobs.filter(mob => !mob.dead);
  state.bullets = state.bullets.filter(bullet => !bullet.dead);

  for (const fx of state.fx) fx.age += dt;
  state.fx = state.fx.filter(fx => fx.age < fx.life);

  syncHud();
}

function spawnMob(type) {
  const spec = MOB_TYPES[type];
  state.mobs.push({
    type,
    x: spec.boss ? W / 2 : ROAD_LEFT + 30 + Math.random() * (ROAD_RIGHT - ROAD_LEFT - 60),
    y: -50,
    hp: spec.hp * state.hpScale,
    maxHp: spec.hp * state.hpScale,
    frame: Math.random() * 2,
    seed: Math.random() * 10
  });
}

function hitSquad(kill, mob) {
  state.soldiers -= kill;
  sound.play("player_hit.mp3", 0.4);
  state.fx.push({ sprite: "explosion", x: mob.x, y: SQUAD_Y - 6, age: 0, life: 0.45, scale: 1 });
  if (state.soldiers <= 0) {
    state.soldiers = 0;
    endGame();
  }
  syncHud();
}

/* ------------------------------------------------------------------ */
/* 종료                                                                */
/* ------------------------------------------------------------------ */

function endGame() {
  if (state.phase === "over") return;
  state.phase = "over";
  const score = Math.floor(state.distance) + state.kills * 5 + state.correct * 30;
  const best = Math.max(score, Number(localStorage.getItem(BEST_KEY) || 0));
  localStorage.setItem(BEST_KEY, String(best));
  const overlay = document.createElement("div");
  overlay.className = "gg-overlay";
  overlay.innerHTML = `
    <div class="gg-overlay-card">
      <h2>💥 부대 전멸…</h2>
      <p>${formatClock(state.time)} 동안 버텼어요!</p>
      <div class="gg-stats">
        <span>🏆 점수 ${score}</span>
        <span>📏 ${Math.floor(state.distance)}m</span>
        <span>⚔️ 해결 ${state.kills}</span>
        <span>✏️ 정답 ${state.correct}</span>
        <span>⭐ 최고 ${best}</span>
      </div>
      <button type="button" class="gg-btn primary" id="retry-btn">다시 하기</button>
      <a class="gg-btn" href="./index.html">홈으로</a>
    </div>
  `;
  stage.appendChild(overlay);
  overlay.querySelector("#retry-btn").addEventListener("click", () => location.reload());
}

/* ------------------------------------------------------------------ */
/* 렌더링                                                              */
/* ------------------------------------------------------------------ */

function drawRoad() {
  ctx.fillStyle = "#8a9a5b";
  ctx.fillRect(0, 0, W, H);
  // 갓길 잔디
  ctx.fillStyle = "#7c9150";
  ctx.fillRect(0, 0, ROAD_LEFT - 12, H);
  ctx.fillRect(ROAD_RIGHT + 12, 0, W - ROAD_RIGHT - 12, H);
  // 도로
  ctx.fillStyle = "#d9b075";
  ctx.fillRect(ROAD_LEFT - 12, 0, ROAD_RIGHT - ROAD_LEFT + 24, H);
  ctx.fillStyle = "#9b7748";
  ctx.fillRect(ROAD_LEFT - 12, 0, 6, H);
  ctx.fillRect(ROAD_RIGHT + 6, 0, 6, H);
  // 중앙 점선 (아래로 흐름)
  const offset = (state.distance * 6) % 48;
  ctx.fillStyle = "rgba(255,253,246,0.5)";
  for (let y = -48 + offset; y < H; y += 48) {
    ctx.fillRect(W / 2 - 3, y, 6, 22);
  }
  // 수비선
  ctx.fillStyle = "rgba(41,37,36,0.25)";
  ctx.fillRect(ROAD_LEFT - 12, SQUAD_Y - 14, ROAD_RIGHT - ROAD_LEFT + 24, 3);
}

function drawGate() {
  const gate = state.gate;
  if (!gate) return;
  const mid = (ROAD_LEFT + ROAD_RIGHT) / 2;
  const halves = [
    { x0: ROAD_LEFT - 12, x1: mid - 4 },
    { x0: mid + 4, x1: ROAD_RIGHT + 12 }
  ];
  gate.options.forEach((option, index) => {
    const { x0, x1 } = halves[index];
    ctx.fillStyle = index === 0 ? "rgba(2,132,199,0.82)" : "rgba(249,115,22,0.82)";
    ctx.strokeStyle = "#292524";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(x0, gate.y - 38, x1 - x0, 76, 10);
    ctx.fill();
    ctx.stroke();
    drawOptionText(option.text, (x0 + x1) / 2, gate.y, x1 - x0 - 16);
  });
}

// {a/b} 분수를 캔버스용 "a/b" 텍스트로 정리
function plainMath(text) {
  return String(text).replace(/\{(?:(\d+)\s+)?(\d+)\/(\d+)\}/g, (_, whole, top, bottom) =>
    whole ? `${whole}과 ${top}/${bottom}` : `${top}/${bottom}`);
}

// 게이트 폭에 맞을 때까지 폰트를 줄이고 최대 2줄로 감싼다 — 정답이 잘리면 안 된다
function drawOptionText(text, cx, cy, maxWidth) {
  const plain = plainMath(text);
  ctx.fillStyle = "#fffdf6";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  let lines = [plain];
  for (const size of [22, 19, 16, 14, 12]) {
    ctx.font = `400 ${size}px 'Jua', sans-serif`;
    if (ctx.measureText(plain).width <= maxWidth) {
      lines = [plain];
      break;
    }
    const wrapped = wrapChars(plain, maxWidth);
    lines = wrapped;
    if (wrapped.length <= 2) break; // 2줄 안에 들어오는 가장 큰 폰트 채택
  }
  lines = lines.slice(0, 2);
  const lineHeight = parseInt(ctx.font, 10) + 4;
  const startY = cy - ((lines.length - 1) * lineHeight) / 2;
  lines.forEach((line, index) => {
    ctx.fillText(line, cx, startY + index * lineHeight);
  });
  ctx.textBaseline = "alphabetic";
}

function drawQuestionBanner(question) {
  const text = plainMath(question);
  ctx.font = "600 15px 'Plus Jakarta Sans', sans-serif";
  ctx.textAlign = "center";
  const lines = wrapText(text, W - 90);
  const height = 26 + lines.length * 20;
  ctx.fillStyle = "#fffdf6";
  ctx.strokeStyle = "#292524";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.roundRect(28, 12, W - 56, height, 12);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#292524";
  lines.forEach((line, index) => {
    ctx.fillText(line, W / 2, 34 + index * 20);
  });
}

// 공백 없는 한국어 답도 잘리지 않도록 글자 단위로 줄바꿈
function wrapChars(text, maxWidth) {
  const lines = [];
  let line = "";
  for (const ch of text) {
    if (ctx.measureText(line + ch).width > maxWidth && line) {
      lines.push(line);
      line = ch === " " ? "" : ch;
    } else {
      line += ch;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function wrapText(text, maxWidth) {
  const words = text.split(" ");
  const lines = [];
  let line = "";
  for (const word of words) {
    const merged = line ? `${line} ${word}` : word;
    if (ctx.measureText(merged).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = merged;
    }
  }
  if (line) lines.push(line);
  return lines.slice(0, 3);
}

function drawMobs() {
  for (const mob of state.mobs) {
    const spec = MOB_TYPES[mob.type];
    const scale = (spec.scale || 1) * (spec.boss ? 1.5 : 1.05);
    sprites.shadow.draw(ctx, mob.x, mob.y + 18, { scale: 1.1 * scale });
    sprites[spec.sprite].draw(ctx, mob.x, mob.y, { frame: mob.frame, scale });
    if (mob.hp < mob.maxHp) {
      const ratio = clamp(mob.hp / mob.maxHp, 0, 1);
      const barWidth = spec.boss ? 70 : 32;
      ctx.fillStyle = "rgba(41,37,36,0.75)";
      ctx.fillRect(mob.x - barWidth / 2 - 1, mob.y - 36 * scale - 1, barWidth + 2, 6);
      ctx.fillStyle = ratio > 0.4 ? "#4ade80" : "#fb7185";
      ctx.fillRect(mob.x - barWidth / 2, mob.y - 36 * scale, barWidth * ratio, 4);
    }
  }
}

function drawBullets() {
  ctx.save();
  for (const bullet of state.bullets) {
    const angle = Math.atan2(bullet.vy, bullet.vx || 0) + Math.PI * 0.75;
    sprites.pencil.draw(ctx, bullet.x, bullet.y, { scale: 0.42, rotate: angle });
  }
  ctx.restore();
}

function drawSquad() {
  const positions = soldierPositions();
  const hero = sprites[heroKey];
  for (let i = positions.length - 1; i >= 0; i--) {
    const pos = positions[i];
    sprites.shadow.draw(ctx, pos.x, pos.y + 20, { scale: 1 });
    hero.draw(ctx, pos.x, pos.y, { frame: state.walkFrame + i * 0.7, scale: 0.62 });
  }
  // 부대 수 뱃지
  ctx.font = "400 17px 'Jua', sans-serif";
  ctx.textAlign = "center";
  const label = `x${state.soldiers}`;
  const width = ctx.measureText(label).width + 18;
  ctx.fillStyle = "#fffdf6";
  ctx.strokeStyle = "#292524";
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.roundRect(state.squadX - width / 2, SQUAD_Y - 62, width, 26, 999);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#292524";
  ctx.fillText(label, state.squadX, SQUAD_Y - 44);
}

function drawFx() {
  for (const fx of state.fx) {
    const sprite = sprites[fx.sprite];
    const frame = (fx.age / fx.life) * sprite.frames;
    sprite.draw(ctx, fx.x, fx.y, { frame, scale: fx.scale });
  }
}

function drawToast() {
  if (toastTimer > 0 && toastText) {
    ctx.save();
    ctx.globalAlpha = clamp(toastTimer / 0.4, 0, 1);
    ctx.font = "400 21px 'Jua', sans-serif";
    ctx.textAlign = "center";
    const width = ctx.measureText(toastText).width + 34;
    const y = state.gate ? 130 : 70;
    ctx.fillStyle = "#fffdf6";
    ctx.strokeStyle = "#292524";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(W / 2 - width / 2, y - 24, width, 38, 12);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#292524";
    ctx.fillText(toastText, W / 2, y + 3);
    ctx.restore();
  }
  if (explainTimer > 0 && explainText) {
    ctx.save();
    ctx.globalAlpha = clamp(explainTimer / 0.5, 0, 1) * 0.96;
    ctx.font = "600 13px 'Plus Jakarta Sans', sans-serif";
    const lines = wrapText(`💡 ${plainMath(explainText)}`, W - 100);
    const height = 20 + lines.length * 18;
    const y = H - 60 - height;
    ctx.fillStyle = "#fff7e6";
    ctx.strokeStyle = "rgba(41,37,36,0.5)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(30, y, W - 60, height, 10);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#292524";
    ctx.textAlign = "center";
    lines.forEach((line, index) => ctx.fillText(line, W / 2, y + 22 + index * 18));
    ctx.restore();
  }
}

/* ------------------------------------------------------------------ */
/* 메인 루프 / 부트스트랩                                               */
/* ------------------------------------------------------------------ */

let lastTime = 0;

function frame(now) {
  const dt = Math.min(0.05, (now - lastTime) / 1000 || 0);
  lastTime = now;
  if (state.phase === "play") update(dt);
  drawRoad();
  drawGate();
  drawMobs();
  drawBullets();
  drawSquad();
  drawFx();
  if (state.gate) drawQuestionBanner(state.gate.question.question); // 몹 위 최상단 레이어
  drawToast();
  requestAnimationFrame(frame);
}

function showStartOverlay(bankTitle, count) {
  const overlay = document.createElement("div");
  overlay.className = "gg-overlay";
  overlay.innerHTML = `
    <div class="gg-overlay-card">
      <h2>🛡️ 라스트 워: 서바이벌</h2>
      <p>밀려오는 대군을 막아내세요!<br>
      <b>정답 게이트</b>를 통과하면 부대가 커지고, 오답이면 절반으로 줄어요.<br>
      <small>문제 세트: ${bankTitle} (${count}문항)</small></p>
      <button type="button" class="gg-btn primary" id="start-btn">게임 시작</button>
      <a class="gg-btn" href="./index.html">홈으로</a>
    </div>
  `;
  stage.appendChild(overlay);
  overlay.querySelector("#start-btn").addEventListener("click", () => {
    overlay.remove();
    state.phase = "play";
    sound.play("pickup.wav", 0.2);
  });
}

function syncMute() {
  muteBtn.textContent = sound.muted ? "🔇" : "🔊";
}

muteBtn.addEventListener("click", () => {
  sound.toggle();
  syncMute();
});

async function boot() {
  const savedHero = localStorage.getItem("qq_hero_class");
  heroKey = ["mage", "knight", "archer"].includes(savedHero) ? savedHero : "knight";
  const [bank, loaded] = await Promise.all([
    loadQuestions(),
    loadSprites({
      mage: ["hero_mage_walk_strip.png", 6],
      knight: ["hero_knight_walk_strip.png", 6],
      archer: ["hero_archer_walk_strip.png", 6],
      slimeGreen: ["slime_green_walk_strip.png", 2],
      slimeBlue: ["slime_blue_walk_strip.png", 2],
      fox: ["monster_fox_walk_strip.png", 2],
      bat: ["monster_bat_walk_strip.png", 2],
      boar: ["monster_boar_walk_strip.png", 2],
      ghost: ["monster_ghost_walk_strip.png", 2],
      wasp: ["monster_wasp_walk_strip.png", 2],
      crowned: ["monster_elite_crowned_walk_strip.png", 2],
      bossBat: ["boss_giant_bat_walk_strip.png", 2],
      pencil: ["weapon_pencil.png", 1],
      explosion: ["fx_explosion_strip.png", 6],
      spark: ["fx_hit_spark_small_strip.png", 4],
      poof: ["fx_death_poof_strip.png", 6],
      levelup: ["fx_levelup_strip.png", 8],
      shadow: ["shadow_blob.png", 1]
    })
  ]);
  sprites = loaded;
  picker = createQuizPicker(bank.questions);
  syncMute();
  syncHud();
  showStartOverlay(bank.title, bank.questions.length);
  requestAnimationFrame(frame);
}

boot().catch(error => {
  document.querySelector(".gg-note").textContent = `불러오기 실패: ${error.message}`;
});
