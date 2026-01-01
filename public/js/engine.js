// Import game state and entity classes relative to the engine file. When this
// file is placed into the public/js folder it should be able to resolve these
// modules correctly.
import { State } from "./state.js";
import { Player, Pot, SimpleEnemy, NPC, Projectile } from "./entities.js";

/*
 * Custom engine for the Oasis game.
 *
 * This file mirrors the original engine provided with the Oasis source but
 * includes a key enhancement: when the per‑screen background image is not
 * available the engine will draw a procedurally generated grassy field
 * instead of leaving the canvas black. This allows the game to remain
 * playable even when large background assets are missing from the repo.
 */

export class Engine {
  constructor(canvas, boot) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.images = new Map();
    this.entities = [];
    this.keys = {};
    this.state = State;
    this.screenId = boot.screenId;
    this.biome = boot.biome;
    this.isTemple = boot.isTemple;
    this.registerBiome = boot.registerBiome;
    // fixed canvas size used by the game
    this.width = canvas.width = 1280;
    this.height = canvas.height = 720;
    this.mask = null; // ImageData for collision
    // create player entity at stored position
    this.player = new Player(this, { x: this.state.data.player.x, y: this.state.data.player.y });
    this.entities.push(this.player);
    this.floatingTexts = [];
    this.aimAngle = 0; // for ranged attacks
    this.loadHUD();
    this.bindKeys();
    this.initBiome();
    this.loadScreen(this.screenId);
    this.loop();
  }

  /* ------------------------------------------------------------------------
   * UI helpers
   */
  loadHUD() {
    this.uiHearts = document.querySelector(".ui .hearts");
    this.uiCoins = document.querySelector(".ui .coins .val");
    this.dialogEl = document.getElementById("dialog");
    this.dialogText = this.dialogEl.querySelector(".text");
    this.dialogName = this.dialogEl.querySelector(".name");
    this.mapOverlay = document.getElementById("map-overlay");
    this.invOverlay = document.getElementById("inv-overlay");
    this.shopOverlay = document.getElementById("shop-overlay");
    this.pauseOverlay = document.getElementById("pause-overlay");
    this.bossBar = document.getElementById("bossbar");
    this.bossFill = this.bossBar?.querySelector(".fill");
    this.refreshUI();
  }
  refreshUI() {
    const hearts = Math.ceil(this.state.data.player.heartsMax * 2);
    const full = Math.floor(this.state.data.player.hearts);
    const half = (this.state.data.player.hearts - full) >= 0.5 ? 1 : 0;
    this.uiHearts.innerHTML = "";
    for (let i = 0; i < full; i++) this.uiHearts.appendChild(this.img("/assets/layout/heart.png", 28));
    if (half) this.uiHearts.appendChild(this.img("/assets/layout/heart.png", 28, 0.5));
    this.uiCoins.textContent = this.state.data.player.coins.toString();
  }
  img(src, size = 32, opacity = 1) {
    const im = document.createElement("img");
    im.src = src; im.width = size; im.height = size; im.style.opacity = opacity;
    return im;
  }

  /* ------------------------------------------------------------------------
   * Input handling
   */
  bindKeys() {
    window.addEventListener("keydown", (e) => {
      this.keys[e.code] = true;
      if (e.code === "KeyM") this.toggleMap();
      if (e.code === "KeyE") this.toggleInventory();
      if (e.code === "Escape") this.togglePause();
      if (e.code === "KeyI") this.tryInteract();
      if (e.code === "Space") this.tryFireRange();
    });
    window.addEventListener("keyup", (e) => { this.keys[e.code] = false; });
    // mouse for melee
    this.canvas.addEventListener("mousedown", (e) => {
      if (e.button === 0) this.tryMelee();
    });
  }

  /* ------------------------------------------------------------------------
   * UI toggles
   */
  toggleMap() {
    if (this.isTemple) {
      this.showDialog("Map", "Map not available in temples.");
      return;
    }
    const body = this.mapOverlay.querySelector(".modal-card .body");
    body.innerHTML = `<img src="/assets/maps/${this.biome}_map.png" style="max-width:100%"/>`;
    this.mapOverlay.style.display = this.mapOverlay.style.display === "flex" ? "none" : "flex";
  }
  toggleInventory() {
    const body = this.invOverlay.querySelector(".modal-card .body");
    body.innerHTML = "";
    const grid = document.createElement("div"); grid.className = "grid";
    for (const item of this.state.data.inventory) {
      const cell = document.createElement("div"); cell.className = "cell";
      cell.title = item.id;
      const img = document.createElement("img"); img.src = `/assets/${item.icon}`;
      cell.appendChild(img); grid.appendChild(cell);
    }
    body.appendChild(grid);
    this.invOverlay.style.display = this.invOverlay.style.display === "flex" ? "none" : "flex";
  }
  togglePause() {
    const body = this.pauseOverlay.querySelector(".modal-card .body");
    body.innerHTML = `<div style="display:flex;gap:1rem;align-items:center">
      <button id="btn-save">Save</button>
      <button id="btn-close">Close</button>
    </div>`;
    this.pauseOverlay.style.display = this.pauseOverlay.style.display === "flex" ? "none" : "flex";
    body.querySelector("#btn-close").onclick = () => (this.pauseOverlay.style.display = "none");
    body.querySelector("#btn-save").onclick = async () => { await this.state.save(); this.addFloatingText("Saved", this.player.x, this.player.y - 40, "#90caf9"); };
  }

  /* ------------------------------------------------------------------------
   * Stats helpers
   */
  cardSpeedBoost() {
    const counts = this.state.data.player.cards.filter(c => c.includes("_speed")).length;
    return counts * 0.4;
  }
  showDialog(name, text, cb) {
    this.dialogName.textContent = name;
    this.dialogText.textContent = text;
    this.dialogEl.classList.add("show");
    const btn = this.dialogEl.querySelector(".btn");
    btn.onclick = () => { this.dialogEl.classList.remove("show"); if (cb) cb(); };
  }
  addFloatingText(text, x, y, color = "#fff") {
    this.floatingTexts.push({ text, x, y, color, t: 1200 });
  }

  /* ------------------------------------------------------------------------
   * Asset loader
   */
  getImage(key) {
    if (!key) return null;
    const src = key.startsWith("assets/") || key.startsWith("/assets/") ? (key.startsWith("/") ? key : `/${key}`) : `/assets/${key}`;
    if (!this.images.has(src)) {
      const im = new Image(); im.src = src; this.images.set(src, im);
    }
    return this.images.get(src);
  }

  /* ------------------------------------------------------------------------
   * Biome registration and screen loading
   */
  initBiome() {
    const reg = this.registerBiome;
    reg && reg(this);
  }
  async loadScreen(screenId) {
    this.screenId = screenId;
    this.state.setScreen(screenId);
    this.entities = [this.player];
    this.player.x = this.state.data.player.x || 640;
    this.player.y = this.state.data.player.y || 360;
    const bg = this.getImage(`assets/background_graphics/${screenId}.png`);
    const maskImg = this.getImage(`assets/background_graphics/${screenId}_mask.png`);
    this.background = bg;
    this.mask = null;
    await new Promise(r => setTimeout(r, 30));
    const oc = document.createElement("canvas"); oc.width = this.width; oc.height = this.height;
    const octx = oc.getContext("2d");
    octx.drawImage(maskImg, 0, 0, this.width, this.height);
    try { this.mask = octx.getImageData(0, 0, this.width, this.height); } catch (e) { this.mask = null; }
    this.onPopulate && this.onPopulate(screenId);
    this.state.save();
    this.refreshUI();
  }

  /* ------------------------------------------------------------------------
   * Collision helpers
   */
  pointWalkable(x, y) {
    if (!this.mask) return true;
    const px = Math.max(0, Math.min(this.width - 1, Math.floor(x)));
    const py = Math.max(0, Math.min(this.height - 1, Math.floor(y)));
    const i = (py * this.width + px) * 4;
    const r = this.mask.data[i];
    return r < 128;
  }
  resolveCollisions(entity) {
    const pts = [
      [entity.x - entity.w / 2, entity.y - entity.h / 2],
      [entity.x + entity.w / 2, entity.y - entity.h / 2],
      [entity.x - entity.w / 2, entity.y + entity.h / 2],
      [entity.x + entity.w / 2, entity.y + entity.h / 2],
    ];
    for (const [px, py] of pts) {
      if (!this.pointWalkable(px, py)) {
        entity.x -= entity.vx || 0;
        entity.y -= entity.vy || 0;
        return;
      }
    }
  }

  /* ------------------------------------------------------------------------
   * Entity management
   */
  addEntity(e) { this.entities.push(e); return e; }
  removeEntity(e) { const i = this.entities.indexOf(e); if (i >= 0) this.entities.splice(i, 1); }
  spawnProjectile(x, y, angle, speed = 260, damage = 1, owner = "enemy") {
    return this.addEntity(new Projectile(this, { x, y, angle, speed, owner, damage }));
  }

  /* ------------------------------------------------------------------------
   * Combat & interactions
   */
  tryMelee() {
    const dmg = (this.state.data.player.melee?.damage || 1) + this.damageBonusFromCards();
    for (const e of this.entities) {
      if (e instanceof SimpleEnemy) {
        const d = Math.hypot(e.x - this.player.x, e.y - this.player.y);
        if (d < 72) e.hit(dmg);
      }
    }
  }
  damageBonusFromCards() {
    const cards = this.state.data.player.cards || [];
    let bonus = 0;
    for (const id of cards) {
      if (id.endsWith("_damage")) {
        if (id.startsWith("common")) bonus += 1;
        else if (id.startsWith("rare")) bonus += 2;
        else if (id.startsWith("epic")) bonus += 3;
        else if (id.startsWith("legendary")) bonus += 4;
        else if (id.startsWith("legacy")) bonus += 5;
      }
    }
    return bonus;
  }
  tryFireRange() {
    const r = this.state.data.player.range;
    if (!r) return this.addFloatingText("No bow", this.player.x, this.player.y - 40, "#ef9a9a");
    if (this.player.rangeCooldown > 0) return;
    const damage = (r.damage || 1) + this.damageBonusFromCards();
    this.spawnProjectile(this.player.x, this.player.y, this.aimAngle, 360, damage, "player");
    this.player.rangeCooldown = (r.cooldownMs || 3000);
  }
  tryInteract() {
    const p = this.player;
    const near = this.entities.find(e => !(e instanceof Player) && Math.hypot((e.x - p.x), (e.y - p.y)) < 64);
    if (!near) return;
    if (near instanceof Pot) near.tryOpen(p);
    else if (near instanceof NPC) this.handleNPCInteract(near);
    else if (near.kind === "task_item") this.pickupTaskItem(near);
  }
  handleNPCInteract(npc) {
    const q = this.state.data.quests.grasslands;
    // simplified interactions; handle only basic villagers for brevity
    if (npc.kind === "intro_villager") {
      if (!q._introDone) {
        this.showDialog("Villager", "Hi! Welcome to the Oasis. We need your help!", () => {
          q._introDone = true;
          this.state.data.player.melee = { type: "wooden_sword", damage: 1 };
          this.state.addItem({ id: "wooden_sword", kind: "melee", icon: "items/melee/wooden_sword.png" });
          this.removeEntity(npc);
        });
      }
      return;
    }
    // fallback to generic message
    this.showDialog(npc.name || "NPC", "Hello there!");
  }
  pickupTaskItem(it) {
    this.state.addItem({ id: it.id, kind: "task", icon: it.icon });
    this.addFloatingText(`${it.name} +1`, it.x, it.y - 18, "#fff59d");
    this.removeEntity(it);
  }

  /* ------------------------------------------------------------------------
   * Health and death
   */
  onPlayerDamaged(amount) {
    const hp = this.state.takeDamage(amount);
    this.refreshUI();
    if (hp <= 0) {
      this.addFloatingText("You Died", this.player.x, this.player.y, "#ef9a9a");
      this.state.data.player.hearts = this.state.data.player.heartsMax;
      const respawnScreen = `${this.biome}_a4`;
      this.state.data.player.x = 640; this.state.data.player.y = 360;
      this.navigateTo(respawnScreen, 640, 360);
    }
  }

  /* ------------------------------------------------------------------------
   * Screen transitions
   */
  navigateTo(nextScreenId, spawnX, spawnY) {
    this.state.data.player.x = spawnX; this.state.data.player.y = spawnY;
    window.location.href = `/screens/${nextScreenId}.html?from=${encodeURIComponent(this.screenId)}&sx=${spawnX}&sy=${spawnY}`;
  }
  checkEdgesAndTransition() {
    const padding = 8;
    const w = this.width, h = this.height;
    const p = this.player;
    if (p.x <= padding) {
      const next = this.neighborId(this.screenId, "left");
      if (next) this.navigateTo(next, w - 20, p.y);
    } else if (p.x >= w - padding) {
      const next = this.neighborId(this.screenId, "right");
      if (next) this.navigateTo(next, 20, p.y);
    } else if (p.y <= padding) {
      const next = this.neighborId(this.screenId, "up");
      if (next) this.navigateTo(next, p.x, h - 20);
    } else if (p.y >= h - padding) {
      const next = this.neighborId(this.screenId, "down");
      if (next) this.navigateTo(next, p.x, 20);
    }
  }
  neighborId(id, dir) {
    const parts = id.split("_");
    const biome = parts[0];
    let isTemple = false;
    let col, row;
    if (parts[1] === "temple") { isTemple = true; col = parts[2]; row = parseInt(parts[3].slice(1), 10); }
    else { col = parts[1]; row = parseInt(parts[2].slice(1), 10); }
    let c = col.charCodeAt(0), r = row;
    if (dir === "left") c -= 1;
    if (dir === "right") c += 1;
    if (dir === "up") r += 1;
    if (dir === "down") r -= 1;
    const nextCol = String.fromCharCode(c);
    const next = isTemple ? `${biome}_temple_${nextCol}${r}` : `${biome}_${nextCol}${r}`;
    if (this.screens && this.screens.has(next)) return next;
    return null;
  }

  /* ------------------------------------------------------------------------
   * Screen population callback; defined by biome registration
   */
  onPopulate(screenId) {}

  /* ------------------------------------------------------------------------
   * Main loop
   */
  loop() {
    let last = performance.now();
    const frame = (now) => {
      const dt = Math.min(1 / 30, (now - last) / 1000); last = now;
      this.update(dt);
      this.draw();
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }
  update(dt) {
    for (const e of this.entities) e.update && e.update(dt);
    const ax = (this.keys["ArrowRight"] ? 1 : 0) - (this.keys["ArrowLeft"] ? 1 : 0);
    const ay = (this.keys["ArrowDown"] ? 1 : 0) - (this.keys["ArrowUp"] ? 1 : 0);
    if (ax || ay) this.aimAngle = Math.atan2(ay, ax);
    this.checkEdgesAndTransition();
    for (const ft of this.floatingTexts) ft.t -= dt * 1000, ft.y -= dt * 30;
    this.floatingTexts = this.floatingTexts.filter(ft => ft.t > 0);
  }
  draw() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.width, this.height);
    if (this.background && this.background.complete) {
      ctx.drawImage(this.background, 0, 0, this.width, this.height);
    } else {
      // draw a simple grassy field when the background image is unavailable.
      // use alternating shades of green to create a subtle checkerboard pattern.
      for (let y = 0; y < this.height; y += 64) {
        for (let x = 0; x < this.width; x += 64) {
          const isAlt = ((x / 64) + (y / 64)) % 2 === 0;
          ctx.fillStyle = isAlt ? "#3cba54" : "#45d06a";
          ctx.fillRect(x, y, 64, 64);
        }
      }
      // draw lighter grid lines over the grass for depth
      ctx.strokeStyle = "rgba(255,255,255,0.05)";
      for (let x = 0; x <= this.width; x += 64) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, this.height); ctx.stroke();
      }
      for (let y = 0; y <= this.height; y += 64) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(this.width, y); ctx.stroke();
      }
    }
    for (const e of this.entities) e.draw && e.draw(ctx);
    // ranged aim line
    if (this.state.data.player.range) {
      ctx.save();
      ctx.translate(this.player.x, this.player.y);
      ctx.rotate(this.aimAngle);
      ctx.strokeStyle = "rgba(255,255,255,.8)";
      ctx.beginPath(); ctx.moveTo(24, 0); ctx.lineTo(64, 0); ctx.stroke();
      ctx.restore();
    }
    ctx.font = "16px sans-serif"; ctx.textAlign = "center";
    for (const ft of this.floatingTexts) {
      ctx.fillStyle = ft.color; ctx.fillText(ft.text, ft.x, ft.y);
    }
  }
}

/*
 * Helper function used by biome scripts to register a manifest of entities
 * and special behaviours for each screen. This helper attaches a custom
 * population function to the provided engine instance and stores a set
 * of known screen identifiers for use during navigation.
 */
export function registerScreenPopulation(engine, manifest, populateFn) {
  engine.screens = new Set(Object.keys(manifest));
  engine.onPopulate = (screenId) => {
    const def = manifest[screenId];
    if (!def) return;
    for (const p of (def.pots || [])) engine.addEntity(new Pot(engine, p[0], p[1]));
    for (const en of (def.enemies || [])) engine.addEntity(new SimpleEnemy(engine, en));
    for (const np of (def.npcs || [])) engine.addEntity(new NPC(engine, np));
    for (const it of (def.items || [])) {
      const e = new NPC(engine, { x: it[1], y: it[2], w: 40, h: 40, collides: false });
      e.kind = "task_item"; e.id = it[0]; e.name = it[3]; e.icon = it[4];
      e.draw = (ctx) => {
        const img = engine.getImage(`assets/${e.icon}`);
        if (img) ctx.drawImage(img, e.x - 24, e.y - 24, 48, 48);
        else { ctx.fillStyle = "#fff"; ctx.fillRect(e.x - 16, e.y - 16, 32, 32); }
      };
      engine.addEntity(e);
    }
    populateFn && populateFn(screenId, def, engine);
  };
}