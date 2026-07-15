import {
  loadQuestions, createQuizPicker, showQuiz, loadSprites, sound, clamp, distance
} from "./core.js";
import { TILE, COLS, ROWS, MAPS, tileAt, isBuildable, validateMap, buildWaypoints } from "./tower-map.js";

const W = COLS * TILE;
const H = ROWS * TILE;

const STAGE_MAP = MAPS[0];
const PATH = buildWaypoints(STAGE_MAP.grid);

const DECO_SPRITES = { b: "bush", r: "rock", s: "signpost" };

const TOWER_TYPES = {
  archer: { name: "궁수", cost: 60, range: 155, rate: 0.55, damage: 9, bulletSpeed: 430, sprite: "archerIdle", attack: "archerAttack", bullet: "pencil", desc: "빠른 연사" },
  mage: { name: "마법사", cost: 85, range: 135, rate: 1.15, damage: 15, splash: 74, bulletSpeed: 300, sprite: "mageIdle", attack: "mageAttack", bullet: "star", desc: "범위 폭발" },
  knight: { name: "검사", cost: 70, range: 115, rate: 1.5, damage: 32, bulletSpeed: 260, sprite: "knightIdle", attack: "knightAttack", bullet: "marble", desc: "강한 한 방" }
};

const MOB_TYPES = {
  slimeGreen: { hp: 26, speed: 55, reward: 4, sprite: "slimeGreen" },
  fox: { hp: 34, speed: 78, reward: 5, sprite: "fox" },
  bat: { hp: 22, speed: 98, reward: 5, sprite: "bat" },
  boar: { hp: 62, speed: 48, reward: 6, sprite: "boar" },
  ghost: { hp: 44, speed: 66, reward: 6, sprite: "ghost" },
  wasp: { hp: 30, speed: 108, reward: 6, sprite: "wasp" },
  slimeElite: { hp: 130, speed: 50, reward: 12, sprite: "slimeElite", scale: 1.15 },
  crowned: { hp: 170, speed: 56, reward: 14, sprite: "crowned", scale: 1.15 },
  bossSlime: { hp: 950, speed: 30, reward: 90, sprite: "bossSlime", scale: 1.0, boss: true },
  bossGolem: { hp: 2400, speed: 24, reward: 160, sprite: "bossGolem", scale: 1.1, boss: true }
};

// [타입, 마리 수, 스폰 간격(초)]
const WAVES = [
  [["slimeGreen", 8, 1.1]],
  [["slimeGreen", 6, 1.0], ["fox", 5, 1.1]],
  [["bat", 8, 0.8], ["fox", 5, 1.0]],
  [["boar", 6, 1.2], ["bat", 6, 0.8]],
  [["bossSlime", 1, 1], ["slimeGreen", 8, 0.9]],
  [["ghost", 8, 0.9], ["wasp", 6, 0.8]],
  [["boar", 8, 1.0], ["ghost", 6, 0.9], ["slimeElite", 2, 4]],
  [["wasp", 10, 0.7], ["crowned", 3, 3.5]],
  [["slimeElite", 4, 2.4], ["crowned", 4, 2.4], ["bat", 10, 0.6]],
  [["bossGolem", 1, 1], ["crowned", 4, 3], ["wasp", 8, 0.8]]
];

const state = {
  phase: "build", // build | wave | quiz | over | win
  coins: 120,
  lives: 10,
  wave: 0,
  kills: 0,
  correct: 0,
  streak: 0,
  towers: [],
  mobs: [],
  bullets: [],
  fx: [],
  spawnQueue: [],
  spawnTimer: 0,
  time: 0
};

let sprites = {};
let picker = null;
let bankTitle = "";

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const stage = document.getElementById("stage");
const hud = {
  coins: document.getElementById("hud-coins"),
  lives: document.getElementById("hud-lives"),
  wave: document.getElementById("hud-wave"),
  kills: document.getElementById("hud-kills"),
  correct: document.getElementById("hud-correct")
};
const waveBtn = document.getElementById("wave-btn");
const muteBtn = document.getElementById("mute-btn");

/* ------------------------------------------------------------------ */
/* 경로 유틸                                                           */
/* ------------------------------------------------------------------ */

const segments = [];
let pathLength = 0;
for (let i = 0; i < PATH.length - 1; i++) {
  const [ax, ay] = PATH[i];
  const [bx, by] = PATH[i + 1];
  const len = distance(ax, ay, bx, by);
  segments.push({ ax, ay, bx, by, len, start: pathLength });
  pathLength += len;
}

function pointAt(progress) {
  const target = clamp(progress, 0, pathLength);
  for (const seg of segments) {
    if (target <= seg.start + seg.len) {
      const t = (target - seg.start) / seg.len;
      return {
        x: seg.ax + (seg.bx - seg.ax) * t,
        y: seg.ay + (seg.by - seg.ay) * t,
        dirX: Math.sign(seg.bx - seg.ax)
      };
    }
  }
  const last = segments[segments.length - 1];
  return { x: last.bx, y: last.by, dirX: 1 };
}

/* ------------------------------------------------------------------ */
/* HUD / 팝업                                                          */
/* ------------------------------------------------------------------ */

function syncHud() {
  hud.coins.textContent = state.coins;
  hud.lives.textContent = state.lives;
  hud.wave.textContent = `${state.wave}/${WAVES.length}`;
  hud.kills.textContent = state.kills;
  hud.correct.textContent = state.correct;
  waveBtn.disabled = state.phase !== "build";
}

let popup = null;

function closePopup() {
  popup?.remove();
  popup = null;
}

function openPopup(clientX, clientY, buttons) {
  closePopup();
  popup = document.createElement("div");
  popup.className = "gg-pop";
  for (const item of buttons) {
    const button = document.createElement("button");
    button.innerHTML = item.html;
    button.disabled = Boolean(item.disabled);
    button.addEventListener("click", () => { closePopup(); item.onPick(); });
    popup.appendChild(button);
  }
  stage.appendChild(popup);
  const stageRect = stage.getBoundingClientRect();
  const x = clamp(clientX - stageRect.left, 80, stageRect.width - 80);
  const y = clamp(clientY - stageRect.top, popup.offsetHeight + 8, stageRect.height - 8);
  popup.style.left = `${x}px`;
  popup.style.top = `${y}px`;
}

function towerIcon(file) {
  return `<img src="./assets/generated/${file}" alt="">`;
}

/* ------------------------------------------------------------------ */
/* 입력                                                                */
/* ------------------------------------------------------------------ */

let hoverTile = null;

function eventToCanvas(event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (event.clientX - rect.left) * (W / rect.width),
    y: (event.clientY - rect.top) * (H / rect.height)
  };
}

canvas.addEventListener("pointermove", event => {
  const { x, y } = eventToCanvas(event);
  const col = Math.floor(x / TILE);
  const row = Math.floor(y / TILE);
  hoverTile = isBuildable(STAGE_MAP.grid, col, row) && !towerOnTile(col, row) ? { col, row } : null;
});

canvas.addEventListener("pointerleave", () => { hoverTile = null; });

function towerOnTile(col, row) {
  return state.towers.find(t => t.col === col && t.row === row);
}

canvas.addEventListener("pointerdown", event => {
  if (state.phase === "over" || state.phase === "win" || state.phase === "quiz") return;
  const { x, y } = eventToCanvas(event);

  const tower = state.towers.find(t => distance(t.x, t.y, x, y) < 34);
  if (tower) {
    const spec = TOWER_TYPES[tower.type];
    const upgradeCost = Math.round(spec.cost * 0.8 * (tower.level + 1));
    const sellGain = Math.round(tower.spent * 0.6);
    openPopup(event.clientX, event.clientY, [
      tower.level < 3 ? {
        html: `⬆️ 강화 Lv.${tower.level + 1} <small>${upgradeCost}코인</small>`,
        disabled: state.coins < upgradeCost,
        onPick: () => {
          state.coins -= upgradeCost;
          tower.spent += upgradeCost;
          tower.level += 1;
          sound.play("levelup.wav", 0.4);
          syncHud();
        }
      } : { html: "⭐ 최대 강화 완료", disabled: true, onPick: () => {} },
      {
        html: `🪙 판매 <small>+${sellGain}코인</small>`,
        onPick: () => {
          state.coins += sellGain;
          state.towers = state.towers.filter(t => t !== tower);
          syncHud();
        }
      }
    ]);
    return;
  }

  // 잔디 타일에만 건설 가능 — 길/장식/기존 타워 자리는 자동 차단
  const col = Math.floor(x / TILE);
  const row = Math.floor(y / TILE);
  if (isBuildable(STAGE_MAP.grid, col, row) && !towerOnTile(col, row)) {
    const cx = col * TILE + TILE / 2;
    const cy = row * TILE + TILE / 2;
    openPopup(event.clientX, event.clientY, Object.entries(TOWER_TYPES).map(([type, spec]) => ({
      html: `${towerIcon(`hero_${type}_hurt.png`)} ${spec.name} <small>${spec.cost}코인 · ${spec.desc}</small>`,
      disabled: state.coins < spec.cost,
      onPick: () => {
        state.coins -= spec.cost;
        state.towers.push({ type, x: cx, y: cy, col, row, level: 1, cooldown: 0, attackTime: 0, spent: spec.cost });
        sound.play("pickup.wav", 0.35);
        syncHud();
      }
    })));
    return;
  }
  closePopup();
});

document.addEventListener("pointerdown", event => {
  if (popup && !popup.contains(event.target) && event.target !== canvas) closePopup();
});

/* ------------------------------------------------------------------ */
/* 웨이브 / 퀴즈                                                       */
/* ------------------------------------------------------------------ */

function startWave() {
  if (state.phase !== "build" || state.wave >= WAVES.length) return;
  state.wave += 1;
  state.phase = "wave";
  state.spawnQueue = [];
  const hpScale = 1 + (state.wave - 1) * 0.16;
  let delay = 0.5;
  for (const [type, count, interval] of WAVES[state.wave - 1]) {
    for (let i = 0; i < count; i++) {
      state.spawnQueue.push({ type, at: delay + i * interval, hpScale });
    }
    delay += count * interval * 0.55;
  }
  state.spawnQueue.sort((a, b) => a.at - b.at);
  state.spawnTimer = 0;
  closePopup();
  syncHud();
}

waveBtn.addEventListener("click", startWave);

async function waveClearQuiz() {
  state.phase = "quiz";
  syncHud();
  const question = picker.next();
  if (!question) {
    state.phase = "build";
    syncHud();
    return;
  }
  const result = await showQuiz(question, { tag: `${bankTitle} · 보너스 퀴즈` });
  if (result.correct) {
    state.correct += 1;
    state.streak += 1;
    const bonus = 40 + state.streak * 10;
    state.coins += bonus;
    sound.play("quiz_correct.wav", 0.5);
    toast(`정답! +${bonus}코인 (연속 ${state.streak})`);
  } else {
    state.streak = 0;
    state.coins += 10;
    sound.play("quiz_wrong.wav", 0.5);
    toast("아쉬워요! 위로 코인 +10");
  }
  state.phase = state.wave >= WAVES.length ? "win" : "build";
  if (state.phase === "win") showEnd(true);
  syncHud();
}

/* ------------------------------------------------------------------ */
/* 토스트 / 종료 오버레이                                              */
/* ------------------------------------------------------------------ */

let toastTimer = 0;
let toastText = "";

function toast(text) {
  toastText = text;
  toastTimer = 2.4;
}

function showEnd(win) {
  state.phase = win ? "win" : "over";
  const overlay = document.createElement("div");
  overlay.className = "gg-overlay";
  overlay.innerHTML = `
    <div class="gg-overlay-card">
      <h2>${win ? "🎉 승리! 교실을 지켰다!" : "💥 게임 오버"}</h2>
      <p>${win ? "모든 웨이브를 막아냈어요. 대단해요!" : "챌린지가 교실에 도착했어요. 다시 도전해 볼까요?"}</p>
      <div class="gg-stats">
        <span>🌊 웨이브 ${state.wave}/${WAVES.length}</span>
        <span>⚔️ 해결 ${state.kills}</span>
        <span>✏️ 정답 ${state.correct}</span>
      </div>
      <button type="button" class="gg-btn primary" id="retry-btn">다시 하기</button>
      <a class="gg-btn" href="./index.html">홈으로</a>
    </div>
  `;
  stage.appendChild(overlay);
  overlay.querySelector("#retry-btn").addEventListener("click", () => location.reload());
}

/* ------------------------------------------------------------------ */
/* 시뮬레이션                                                          */
/* ------------------------------------------------------------------ */

function spawnMob(type, hpScale) {
  const spec = MOB_TYPES[type];
  state.mobs.push({
    type,
    hp: spec.hp * hpScale,
    maxHp: spec.hp * hpScale,
    progress: 0,
    frame: Math.random() * 2,
    scale: spec.scale || 1
  });
}

function update(dt) {
  state.time += dt;
  if (toastTimer > 0) toastTimer -= dt;

  if (state.phase === "wave") {
    state.spawnTimer += dt;
    while (state.spawnQueue.length && state.spawnQueue[0].at <= state.spawnTimer) {
      const item = state.spawnQueue.shift();
      spawnMob(item.type, item.hpScale);
    }
  }

  // 몹 이동
  for (const mob of state.mobs) {
    const spec = MOB_TYPES[mob.type];
    mob.progress += spec.speed * dt;
    mob.frame += dt * 6;
    if (mob.progress >= pathLength) {
      mob.dead = true;
      state.lives -= spec.boss ? 3 : 1;
      sound.play("player_hit.mp3", 0.4);
      if (state.lives <= 0 && state.phase !== "over") {
        state.lives = 0;
        showEnd(false);
      }
    }
  }
  state.mobs = state.mobs.filter(mob => !mob.dead);

  // 타워 공격
  for (const tower of state.towers) {
    const spec = TOWER_TYPES[tower.type];
    const damage = spec.damage * Math.pow(1.6, tower.level - 1);
    const range = spec.range + (tower.level - 1) * 14;
    const rate = spec.rate * Math.pow(0.88, tower.level - 1);
    tower.cooldown -= dt;
    tower.attackTime = Math.max(0, tower.attackTime - dt);
    if (tower.cooldown > 0) continue;
    let best = null;
    for (const mob of state.mobs) {
      const pos = pointAt(mob.progress);
      if (distance(tower.x, tower.y, pos.x, pos.y) <= range) {
        if (!best || mob.progress > best.progress) best = mob;
      }
    }
    if (best) {
      tower.cooldown = rate;
      tower.attackTime = 0.3;
      state.bullets.push({
        type: tower.type, x: tower.x, y: tower.y - 24,
        target: best, damage, splash: spec.splash || 0,
        speed: spec.bulletSpeed, rotate: 0
      });
    }
  }

  // 투사체
  for (const bullet of state.bullets) {
    if (bullet.target.dead || bullet.target.hp <= 0) {
      const nearest = state.mobs[0];
      if (!nearest) { bullet.dead = true; continue; }
      bullet.target = nearest;
    }
    const pos = pointAt(bullet.target.progress);
    const dist = distance(bullet.x, bullet.y, pos.x, pos.y);
    const step = bullet.speed * dt;
    bullet.rotate += dt * 9;
    if (dist <= step + 12) {
      bullet.dead = true;
      hitMob(bullet, pos);
    } else {
      bullet.x += ((pos.x - bullet.x) / dist) * step;
      bullet.y += ((pos.y - bullet.y) / dist) * step;
    }
  }
  state.bullets = state.bullets.filter(bullet => !bullet.dead);

  // 이펙트
  for (const fx of state.fx) fx.age += dt;
  state.fx = state.fx.filter(fx => fx.age < fx.life);

  // 웨이브 종료 → 퀴즈
  if (state.phase === "wave" && !state.spawnQueue.length && !state.mobs.length) {
    waveClearQuiz();
  }
}

function hitMob(bullet, pos) {
  const targets = bullet.splash
    ? state.mobs.filter(mob => {
        const mobPos = pointAt(mob.progress);
        return distance(pos.x, pos.y, mobPos.x, mobPos.y) <= bullet.splash;
      })
    : [bullet.target];
  if (bullet.splash) {
    state.fx.push({ sprite: "explosion", x: pos.x, y: pos.y, age: 0, life: 0.5, scale: 1.4 });
  } else {
    state.fx.push({ sprite: "spark", x: pos.x, y: pos.y, age: 0, life: 0.3, scale: 0.7 });
  }
  sound.play("monster_hit.mp3", 0.18);
  for (const mob of targets) {
    mob.hp -= bullet.damage;
    if (mob.hp <= 0 && !mob.dead) {
      mob.dead = true;
      const spec = MOB_TYPES[mob.type];
      state.kills += 1;
      state.coins += spec.reward;
      const mobPos = pointAt(mob.progress);
      state.fx.push({ sprite: "poof", x: mobPos.x, y: mobPos.y, age: 0, life: 0.55, scale: 1 });
      sound.play("monster_die.mp3", 0.22);
    }
  }
  syncHud();
}

/* ------------------------------------------------------------------ */
/* 렌더링                                                              */
/* ------------------------------------------------------------------ */

function drawMap() {
  // 잔디 바탕
  ctx.fillStyle = "#b8dc8c";
  ctx.fillRect(0, 0, W, H);
  // 잔디 점무늬
  ctx.fillStyle = "rgba(255,255,255,0.16)";
  for (let i = 0; i < 60; i++) {
    ctx.fillRect((i * 137) % W, (i * 251) % H, 4, 4);
  }
  // 옅은 격자 (건설 칸 힌트)
  ctx.strokeStyle = "rgba(41,37,36,0.06)";
  ctx.lineWidth = 1;
  for (let col = 1; col < COLS; col++) {
    ctx.beginPath(); ctx.moveTo(col * TILE, 0); ctx.lineTo(col * TILE, H); ctx.stroke();
  }
  for (let row = 1; row < ROWS; row++) {
    ctx.beginPath(); ctx.moveTo(0, row * TILE); ctx.lineTo(W, row * TILE); ctx.stroke();
  }
  // 길 타일 (테두리 → 안쪽 순서로 두 번 칠해 통짜 길처럼 보이게)
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      if (tileAt(STAGE_MAP.grid, col, row) !== "#") continue;
      ctx.fillStyle = "#9b7748";
      ctx.fillRect(col * TILE - 4, row * TILE - 4, TILE + 8, TILE + 8);
    }
  }
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      if (tileAt(STAGE_MAP.grid, col, row) !== "#") continue;
      ctx.fillStyle = "#d9b075";
      const grow = (dc, dr) => tileAt(STAGE_MAP.grid, col + dc, row + dr) === "#" ? 5 : 0;
      ctx.fillRect(
        col * TILE + 5 - grow(-1, 0), row * TILE + 5 - grow(0, -1),
        TILE - 10 + grow(-1, 0) + grow(1, 0), TILE - 10 + grow(0, -1) + grow(0, 1)
      );
    }
  }
  // 장식 타일
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const deco = DECO_SPRITES[tileAt(STAGE_MAP.grid, col, row)];
      if (deco) sprites[deco].draw(ctx, col * TILE + TILE / 2, row * TILE + TILE / 2, { scale: 0.9 });
    }
  }
  // 마우스가 올라간 건설 가능 칸 표시
  if (hoverTile && (state.phase === "build" || state.phase === "wave")) {
    ctx.fillStyle = "rgba(255,253,246,0.45)";
    ctx.strokeStyle = "rgba(41,37,36,0.6)";
    ctx.lineWidth = 3;
    ctx.setLineDash([7, 6]);
    ctx.fillRect(hoverTile.col * TILE + 3, hoverTile.row * TILE + 3, TILE - 6, TILE - 6);
    ctx.strokeRect(hoverTile.col * TILE + 3, hoverTile.row * TILE + 3, TILE - 6, TILE - 6);
    ctx.setLineDash([]);
    ctx.fillStyle = "rgba(41,37,36,0.65)";
    ctx.font = "700 24px 'Jua', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("+", hoverTile.col * TILE + TILE / 2, hoverTile.row * TILE + TILE / 2 + 9);
  }
}

function drawTowers() {
  for (const tower of state.towers) {
    const spec = TOWER_TYPES[tower.type];
    // 받침
    ctx.fillStyle = "#fffdf6";
    ctx.strokeStyle = "#292524";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(tower.x, tower.y + 22, 26, 12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    const attacking = tower.attackTime > 0;
    const sprite = attacking ? sprites[spec.attack] : sprites[spec.sprite];
    const frame = attacking
      ? (1 - tower.attackTime / 0.3) * sprite.frames
      : state.time * 2.4;
    sprite.draw(ctx, tower.x, tower.y - 10, { frame, scale: 0.82 });
    // 레벨 별
    ctx.font = "13px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("⭐".repeat(tower.level), tower.x, tower.y - 46);
  }
}

function drawMobs() {
  const sorted = [...state.mobs].sort((a, b) => {
    const pa = pointAt(a.progress);
    const pb = pointAt(b.progress);
    return pa.y - pb.y;
  });
  for (const mob of sorted) {
    const spec = MOB_TYPES[mob.type];
    const pos = pointAt(mob.progress);
    sprites.shadow.draw(ctx, pos.x, pos.y + 16, { scale: 1.2 * mob.scale });
    sprites[spec.sprite].draw(ctx, pos.x, pos.y, {
      frame: mob.frame, scale: 0.95 * mob.scale, flipX: pos.dirX < 0
    });
    // HP 바
    const ratio = clamp(mob.hp / mob.maxHp, 0, 1);
    const barWidth = spec.boss ? 64 : 34;
    const barY = pos.y - (spec.boss ? 64 : 34);
    ctx.fillStyle = "rgba(41,37,36,0.75)";
    ctx.fillRect(pos.x - barWidth / 2 - 1, barY - 1, barWidth + 2, 7);
    ctx.fillStyle = ratio > 0.4 ? "#4ade80" : "#fb7185";
    ctx.fillRect(pos.x - barWidth / 2, barY, barWidth * ratio, 5);
  }
}

function drawBullets() {
  for (const bullet of state.bullets) {
    const sprite = sprites[TOWER_TYPES[bullet.type].bullet];
    sprite.draw(ctx, bullet.x, bullet.y, { scale: 0.62, rotate: bullet.rotate });
  }
}

function drawFx() {
  for (const fx of state.fx) {
    const sprite = sprites[fx.sprite];
    const frame = (fx.age / fx.life) * sprite.frames;
    sprite.draw(ctx, fx.x, fx.y, { frame, scale: fx.scale, alpha: 1 - (fx.age / fx.life) * 0.4 });
  }
}

function drawToast() {
  if (toastTimer <= 0 || !toastText) return;
  ctx.save();
  ctx.globalAlpha = clamp(toastTimer / 0.4, 0, 1);
  ctx.font = "400 22px 'Jua', sans-serif";
  ctx.textAlign = "center";
  const width = ctx.measureText(toastText).width + 36;
  ctx.fillStyle = "#fffdf6";
  ctx.strokeStyle = "#292524";
  ctx.lineWidth = 3;
  const x = W / 2, y = 54;
  ctx.beginPath();
  ctx.roundRect(x - width / 2, y - 24, width, 40, 12);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#292524";
  ctx.fillText(toastText, x, y + 4);
  ctx.restore();
}

function drawBuildHint() {
  if (state.phase !== "build") return;
  ctx.font = "400 20px 'Jua', sans-serif";
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(41,37,36,0.7)";
  ctx.fillText(
    state.wave === 0 ? "잔디 칸을 눌러 타워를 짓고 ▶ 웨이브 시작!" : "타워를 정비하고 ▶ 다음 웨이브 시작!",
    W / 2, H - 24
  );
}

/* ------------------------------------------------------------------ */
/* 메인 루프                                                           */
/* ------------------------------------------------------------------ */

let lastTime = 0;

function frame(now) {
  const dt = Math.min(0.05, (now - lastTime) / 1000 || 0);
  lastTime = now;
  if (state.phase === "wave" || state.phase === "build") update(dt);
  drawMap();
  drawTowers();
  drawMobs();
  drawBullets();
  drawFx();
  drawToast();
  drawBuildHint();
  requestAnimationFrame(frame);
}

/* ------------------------------------------------------------------ */
/* 부트스트랩                                                          */
/* ------------------------------------------------------------------ */

function syncMute() {
  muteBtn.textContent = sound.muted ? "🔇" : "🔊";
}

muteBtn.addEventListener("click", () => {
  sound.toggle();
  syncMute();
});

async function boot() {
  const mapErrors = validateMap(STAGE_MAP.grid);
  if (mapErrors.length) {
    throw new Error(`맵 데이터 오류 — ${mapErrors.join(" / ")}`);
  }
  const [bank, loaded] = await Promise.all([
    loadQuestions(),
    loadSprites({
      archerIdle: ["hero_archer_idle_strip.png", 2],
      archerAttack: ["hero_archer_attack_strip.png", 4],
      mageIdle: ["hero_mage_idle_strip.png", 2],
      mageAttack: ["hero_mage_attack_strip.png", 4],
      knightIdle: ["hero_knight_idle_strip.png", 2],
      knightAttack: ["hero_knight_attack_strip.png", 4],
      slimeGreen: ["slime_green_walk_strip.png", 2],
      fox: ["monster_fox_walk_strip.png", 2],
      bat: ["monster_bat_walk_strip.png", 2],
      boar: ["monster_boar_walk_strip.png", 2],
      ghost: ["monster_ghost_walk_strip.png", 2],
      wasp: ["monster_wasp_walk_strip.png", 2],
      slimeElite: ["slime_elite_walk_strip.png", 2],
      crowned: ["monster_elite_crowned_walk_strip.png", 2],
      bossSlime: ["boss_slime_king_walk_strip.png", 6],
      bossGolem: ["boss_golem_walk_strip.png", 2],
      pencil: ["weapon_pencil.png", 1],
      star: ["weapon_star.png", 1],
      marble: ["weapon_marble.png", 1],
      explosion: ["fx_explosion_strip.png", 6],
      spark: ["fx_hit_spark_small_strip.png", 4],
      poof: ["fx_death_poof_strip.png", 6],
      shadow: ["shadow_blob.png", 1],
      bush: ["deco_bush.png", 1],
      rock: ["deco_rock.png", 1],
      signpost: ["deco_signpost.png", 1]
    })
  ]);
  sprites = loaded;
  picker = createQuizPicker(bank.questions);
  bankTitle = bank.title;
  syncMute();
  syncHud();
  requestAnimationFrame(frame);
}

boot().catch(error => {
  document.querySelector(".gg-note").textContent = `불러오기 실패: ${error.message}`;
});
