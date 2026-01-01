
import { State } from "./state.js";
import { Player, Pot, SimpleEnemy, NPC, Projectile } from "./entities.js";

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
    this.width = canvas.width = 1280;
    this.height = canvas.height = 720;
    this.mask = null; // ImageData for collision
    this.player = new Player(this, { x: this.state.data.player.x, y: this.state.data.player.y });
    this.entities.push(this.player);
    this.floatingTexts = [];
    this.aimAngle = 0; // for ranged
    this.loadHUD();
    this.bindKeys();
    this.initBiome();
    this.loadScreen(this.screenId);
    this.loop();
  }

  loadHUD() {
    // UI hooks
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
    const hearts = Math.ceil(this.state.data.player.heartsMax*2);
    const full = Math.floor(this.state.data.player.hearts);
    const half = (this.state.data.player.hearts - full) >= 0.5 ? 1 : 0;
    // Render 1/2 hearts as needed (4 -> 4 icons)
    this.uiHearts.innerHTML = "";
    for (let i=0;i<full;i++) this.uiHearts.appendChild(this.img("/assets/layout/heart.png", 28));
    if (half) this.uiHearts.appendChild(this.img("/assets/layout/heart.png", 28, 0.5)); // reuse same icon with opacity as half
    this.uiCoins.textContent = this.state.data.player.coins.toString();
  }

  img(src, size=32, opacity=1) {
    const im = document.createElement("img");
    im.src = src; im.width = size; im.height = size; im.style.opacity = opacity;
    return im;
  }

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
    // Mouse melee
    this.canvas.addEventListener("mousedown", (e) => {
      if (e.button===0) this.tryMelee();
    });
  }

  toggleMap() {
    if (this.isTemple) {
      this.showDialog("Map", "Map not available in temples.");
      return;
    }
    const body = this.mapOverlay.querySelector(".modal-card .body");
    body.innerHTML = `<img src="/assets/maps/${this.biome}_map.png" style="max-width:100%"/>`;
    this.mapOverlay.style.display = this.mapOverlay.style.display==="flex" ? "none":"flex";
  }
  toggleInventory() {
    const body = this.invOverlay.querySelector(".modal-card .body");
    body.innerHTML = "";
    const grid = document.createElement("div"); grid.className="grid";
    for (const item of this.state.data.inventory) {
      const cell = document.createElement("div"); cell.className="cell";
      cell.title = item.id;
      const img = document.createElement("img"); img.src = `/assets/${item.icon}`;
      cell.appendChild(img); grid.appendChild(cell);
    }
    body.appendChild(grid);
    this.invOverlay.style.display = this.invOverlay.style.display==="flex" ? "none":"flex";
  }
  togglePause() {
    const body = this.pauseOverlay.querySelector(".modal-card .body");
    body.innerHTML = `<div style="display:flex;gap:1rem;align-items:center">
      <button id="btn-save">Save</button>
      <button id="btn-close">Close</button>
    </div>`;
    this.pauseOverlay.style.display = this.pauseOverlay.style.display==="flex" ? "none":"flex";
    body.querySelector("#btn-close").onclick = () => (this.pauseOverlay.style.display="none");
    body.querySelector("#btn-save").onclick = async () => { await this.state.save(); this.addFloatingText("Saved", this.player.x, this.player.y-40, "#90caf9"); };
  }

  cardSpeedBoost() {
    // Count speed cards to adjust speed. Simple tiers.
    const counts = this.state.data.player.cards.filter(c=>c.includes("_speed")).length;
    return counts * 0.4; // pixels/frame additive
  }

  showDialog(name, text, cb) {
    this.dialogName.textContent = name;
    this.dialogText.textContent = text;
    this.dialogEl.classList.add("show");
    const btn = this.dialogEl.querySelector(".btn");
    btn.onclick = () => { this.dialogEl.classList.remove("show"); if (cb) cb(); }
  }

  addFloatingText(text, x, y, color="#fff") {
    this.floatingTexts.push({ text, x, y, color, t: 1200 });
  }

  getImage(key) {
    if (!key) return null;
    // normalize asset key (allow "characters/..." or "/assets/characters/...")
    const src = key.startsWith("assets/") || key.startsWith("/assets/") ? (key.startsWith("/")?key:`/${key}`) : `/assets/${key}`;
    if (!this.images.has(src)) {
      const im = new Image(); im.src = src; this.images.set(src, im);
    }
    return this.images.get(src);
  }

  // Biome bootstrapping
  initBiome() {
    const reg = this.registerBiome;
    reg && reg(this);
  }

  async loadScreen(screenId) {
    this.screenId = screenId;
    this.state.setScreen(screenId);
    this.entities = [this.player]; // keep only player
    this.player.x = this.state.data.player.x || 640;
    this.player.y = this.state.data.player.y || 360;

    // Background and mask
    const bg = this.getImage(`assets/background_graphics/${screenId}.png`);
    const maskImg = this.getImage(`assets/background_graphics/${screenId}_mask.png`);
    this.background = bg;
    // Build mask ImageData for pixel-perfect collisions
    this.mask = null;
    await new Promise(r => setTimeout(r, 30)); // allow image decode
    const oc = document.createElement("canvas"); oc.width = this.width; oc.height = this.height;
    const octx = oc.getContext("2d");
    octx.drawImage(maskImg, 0, 0, this.width, this.height);
    try { this.mask = octx.getImageData(0,0,this.width,this.height); } catch(e) { this.mask = null; }

    // Populate screen content via biome hook
    this.onPopulate && this.onPopulate(screenId);

    // Autosave
    this.state.save();
    this.refreshUI();
  }

  // Collision helpers using mask
  pointWalkable(x,y) {
    if (!this.mask) return true; // no mask -> walkable
    const px = Math.max(0, Math.min(this.width-1, Math.floor(x)));
    const py = Math.max(0, Math.min(this.height-1, Math.floor(y)));
    const i = (py*this.width + px)*4;
    // Mask is black walkable (0), white NOT walkable (255)
    const r = this.mask.data[i]; // red channel is enough
    return r < 128;
  }
  resolveCollisions(entity) {
    // Sample 4 corners; nudge out if blocked
    const pts = [
      [entity.x-entity.w/2, entity.y-entity.h/2],
      [entity.x+entity.w/2, entity.y-entity.h/2],
      [entity.x-entity.w/2, entity.y+entity.h/2],
      [entity.x+entity.w/2, entity.y+entity.h/2],
    ];
    for (const [px,py] of pts) {
      if (!this.pointWalkable(px,py)) {
        // push back
        entity.x -= entity.vx || 0;
        entity.y -= entity.vy || 0;
        return;
      }
    }
  }

  // Entity management
  addEntity(e) { this.entities.push(e); return e; }
  removeEntity(e) { const i = this.entities.indexOf(e); if (i>=0) this.entities.splice(i,1); }

  spawnProjectile(x,y, angle, speed=260, damage=1, owner="enemy") {
    this.addEntity(new Projectile(this, { x,y, angle, speed, owner, damage }));
  }

  // Combat & Interactions
  tryMelee() {
    const dmg = (this.state.data.player.melee?.damage || 1) + this.damageBonusFromCards();
    // Short-range hit scan around player
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
    if (!r) return this.addFloatingText("No bow", this.player.x, this.player.y-40, "#ef9a9a");
    if (this.player.rangeCooldown>0) return;
    const damage = (r.damage||1) + this.damageBonusFromCards();
    this.spawnProjectile(this.player.x, this.player.y, this.aimAngle, 360, damage, "player");
    this.player.rangeCooldown = (r.cooldownMs || 3000);
  }

  tryInteract() {
    // Near pots, villagers, merchants, task items, fairy, temple door
    const p = this.player;
    const near = this.entities.find(e => !(e instanceof Player) && Math.hypot((e.x-p.x),(e.y-p.y)) < 64);
    if (!near) return;
    if (near instanceof Pot) near.tryOpen(p);
    else if (near instanceof NPC) this.handleNPCInteract(near);
    else if (near.kind === "task_item") this.pickupTaskItem(near);
  }

  handleNPCInteract(npc) {
    const q = this.state.data.quests.grasslands;
    if (npc.kind==="intro_villager") {
      // Only once
      if (!q._introDone) {
        this.showDialog("Villager", "Hi! Welcome to the Oasis. We need your help! The Evil Lord Zargon has captured our King and stolen his crown. You will need to find each piece of the king’s crown, scattered throughout the land. Here, take this wooden sword to aid you on your journey. First, go south and speak with the villagers.", () => {
          q._introDone = true;
          // Give wooden sword if not present
          this.state.data.player.melee = { type:"wooden_sword", damage:1 };
          this.state.addItem({ id:"wooden_sword", kind:"melee", icon:"items/melee/wooden_sword.png" });
          // Remove villager (leaves)
          this.removeEntity(npc);
        });
      }
      return;
    }
    if (npc.kind==="grasslands_villager_1_task_spectacles") {
      if (!q.villagerSpectaclesAssigned && !q.villagerSpectaclesDone) {
        q.villagerSpectaclesAssigned = true;
        this.showDialog("Villager", "Hi! I have misplaced my spectacles! Can you go to the campground and see where I might have left them? Bring them back and I’ll reward you!");
      } else if (q.villagerSpectaclesAssigned && !q.villagerSpectaclesDone) {
        // Check inventory
        const has = this.state.data.inventory.find(i=>i.id==="glasses");
        if (has) {
          q.villagerSpectaclesDone = true;
          this.state.removeItemById("glasses");
          // Reward: Stone sword
          this.state.addItem({ id:"stone_sword", kind:"melee", icon:"items/melee/stone_sword.png" });
          this.state.data.player.melee = { type:"stone_sword", damage:2 };
          this.showDialog("Villager", "Thank you for finding my spectacles! Please accept this Stone Sword.");
        } else {
          this.showDialog("Villager", "Please check the campground for my spectacles.");
        }
      } else {
        this.showDialog("Villager", "Thanks again!");
      }
      return;
    }
    if (npc.kind==="grasslands_villager_2_task_computer") {
      if (!q.villagerComputerAssigned && !q.villagerComputerDone) {
        q.villagerComputerAssigned = true;
        this.showDialog("Villager", "Hi! I have misplaced my computer! Could you check the old tower and bring it back? I’ll share some useful information.");
      } else if (q.villagerComputerAssigned && !q.villagerComputerDone) {
        const has = this.state.data.inventory.find(i=>i.id==="computer");
        if (has) {
          q.villagerComputerDone = true;
          this.state.removeItemById("computer");
          this.showDialog("Villager", "Thanks for finding my Computer! If you are low on health, find a magical pond and take a dip to heal up!");
        } else {
          this.showDialog("Villager", "Please check the old tower for my computer.");
        }
      } else {
        this.showDialog("Villager", "Much appreciated!");
      }
      return;
    }
    if (npc.kind==="fairy") {
      if (!q.villagerSpectaclesDone || !q.villagerComputerDone) {
        this.showDialog("Fairy", "Hello! Return after helping the two villagers.");
      } else if (!q.fairySpoken) {
        q.fairySpoken = true; q.extraKillsNeeded = 15;
        this.showDialog("Fairy", "Hello there! I have a key for you to enter the Temple. Defeat 15 more enemies around the Grasslands and return to me. Safe travels!");
      } else if (q.extraKillsNeeded > 0) {
        this.showDialog("Fairy", `Keep going! You still need ${q.extraKillsNeeded} more enemies.`);
      } else if (!q.templeKey) {
        q.templeKey = true;
        this.state.addItem({ id:"grasslands_temple_key", kind:"key", icon:"items/keys/grasslands_temple_key.png" });
        this.showDialog("Fairy", "Well done! Here is the key to the Grasslands Temple.");
      } else {
        this.showDialog("Fairy", "The key is yours. Good luck in the temple!");
      }
      return;
    }
    if (npc.kind.startsWith("shop_merchant")) {
      this.openShop(npc.kind);
      return;
    }
  }

  pickupTaskItem(it) {
    this.state.addItem({ id: it.id, kind:"task", icon: it.icon });
    this.addFloatingText(`${it.name} +1`, it.x, it.y-18, "#fff59d");
    this.removeEntity(it);
  }

  openShop(merchantId) {
    const modal = this.shopOverlay;
    const body = modal.querySelector(".modal-card .body");
    body.innerHTML = "<h3>Shop</h3>";
    const timeKey = new Date().toISOString().slice(0,13); // hour bucket
    // roll weighted items (common > rare > epic)
    const seed = `${merchantId}-${timeKey}`;
    const rng = State.rngFromString(seed);
    const rollItem = () => {
      const r = rng();
      if (r < 0.60) return { id:"common_damage", kind:"card", price: 10 + Math.floor(rng()*6), icon:"items/ability_cards/common_damage.png" };
      if (r < 0.80) return { id:"rare_speed", kind:"card", price: 20 + Math.floor(rng()*11), icon:"items/ability_cards/rare_speed.png" };
      if (r < 0.95) return { id:"epic_heart", kind:"card", price: 40 + Math.floor(rng()*11), icon:"items/ability_cards/epic_heart.png" };
      return { id:"basic_bow", kind:"range", price: 35, icon:"items/range/basic_bow.png" };
    };
    const items = [rollItem(), rollItem(), rollItem()];
    const grid = document.createElement("div"); grid.className = "grid";
    for (const it of items) {
      const cell = document.createElement("div"); cell.className = "cell";
      cell.innerHTML = `<div style="display:grid;place-items:center;gap:.5rem">
        <img src="/assets/${it.icon}"/>
        <div style="font-weight:700">${it.id.replace('_',' ').toUpperCase()}</div>
        <button class="buy">Buy ${it.price}c</button>
      </div>`;
      cell.querySelector(".buy").onclick = () => {
        if (this.state.spendCoins(it.price)) {
          // grant
          if (it.kind==="card") this.state.data.player.cards = [...this.state.data.player.cards, it.id].slice(-3);
          if (it.kind==="range") {
            this.state.data.player.range = { type: "basic_bow", damage: 1, cooldownMs: 3000 };
            this.state.addItem({ id: it.id, kind:"range", icon: it.icon });
          }
          this.refreshUI();
          cell.querySelector(".buy").textContent = "Purchased";
          cell.querySelector(".buy").disabled = true;
          this.state.save();
        } else {
          this.addFloatingText("Not enough coins", this.player.x, this.player.y-40, "#ef9a9a");
        }
      };
      grid.appendChild(cell);
    }
    body.appendChild(grid);
    modal.style.display = "flex";
  }

  onPlayerDamaged(amount) {
    const hp = this.state.takeDamage(amount);
    this.refreshUI();
    if (hp <= 0) {
      // respawn at biome start
      this.addFloatingText("You Died", this.player.x, this.player.y, "#ef9a9a");
      // Reset pos to biome start (A4 for grasslands)
      this.state.data.player.hearts = this.state.data.player.heartsMax;
      const respawnScreen = `${this.biome}_a4`;
      this.state.data.player.x = 640; this.state.data.player.y = 360;
      this.navigateTo(respawnScreen, 640, 360);
    }
  }

  // Screen transitions
  navigateTo(nextScreenId, spawnX, spawnY) {
    this.state.data.player.x = spawnX; this.state.data.player.y = spawnY;
    window.location.href = `/screens/${nextScreenId}.html?from=${encodeURIComponent(this.screenId)}&sx=${spawnX}&sy=${spawnY}`;
  }

  checkEdgesAndTransition() {
    const padding = 8;
    const w=this.width, h=this.height;
    const p=this.player;
    const offsetX = p.x, offsetY = p.y;
    if (p.x <= padding) {
      const next = this.neighborId(this.screenId, "left");
      if (next) this.navigateTo(next, w-20, offsetY);
    } else if (p.x >= w-padding) {
      const next = this.neighborId(this.screenId, "right");
      if (next) this.navigateTo(next, 20, offsetY);
    } else if (p.y <= padding) {
      const next = this.neighborId(this.screenId, "up");
      if (next) this.navigateTo(next, offsetX, h-20);
    } else if (p.y >= h-padding) {
      const next = this.neighborId(this.screenId, "down");
      if (next) this.navigateTo(next, offsetX, 20);
    }
  }

  neighborId(id, dir) {
    // id like 'grasslands_a4' or 'grasslands_temple_a3'
    const parts = id.split("_");
    const biome = parts[0];
    let isTemple = false;
    let col, row;
    if (parts[1] === "temple") { isTemple = true; col = parts[2]; row = parseInt(parts[3].slice(1),10); }
    else { col = parts[1]; row = parseInt(parts[2].slice(1),10); }
    let c = col.charCodeAt(0), r = row;
    if (dir==="left") c -= 1;
    if (dir==="right") c += 1;
    if (dir==="up") r += 1;
    if (dir==="down") r -= 1;
    const nextCol = String.fromCharCode(c);
    const next = isTemple ? `${biome}_temple_${nextCol}${r}` : `${biome}_${nextCol}${r}`;
    // validate against biome manifest
    if (this.screens.has(next)) return next;
    return null;
  }

  // Populate per screen
  onPopulate(screenId) {
    // Overridden by biome registration
  }

  // Main loop
  loop() {
    let last = performance.now();
    const frame = (now) => {
      const dt = Math.min(1/30, (now-last)/1000); last = now;
      this.update(dt);
      this.draw();
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }
  update(dt) {
    for (const e of this.entities) e.update && e.update(dt);
    // Aiming with arrow keys
    const ax = (this.keys["ArrowRight"]?1:0) - (this.keys["ArrowLeft"]?1:0);
    const ay = (this.keys["ArrowDown"]?1:0) - (this.keys["ArrowUp"]?1:0);
    if (ax||ay) this.aimAngle = Math.atan2(ay, ax);
    // Edge transition
    this.checkEdgesAndTransition();
    // Floating text
    for (const ft of this.floatingTexts) ft.t -= dt*1000, ft.y -= dt*30;
    this.floatingTexts = this.floatingTexts.filter(ft => ft.t>0);
  }
  draw() {
    const ctx = this.ctx;
    ctx.clearRect(0,0,this.width,this.height);
    if (this.background && this.background.complete) ctx.drawImage(this.background, 0, 0, this.width, this.height);
    else {
      // placeholder background for missing assets
      ctx.fillStyle = "#123"; ctx.fillRect(0,0,this.width,this.height);
      ctx.fillStyle = "rgba(255,255,255,.1)";
      for (let x=0;x<this.width;x+=64) for (let y=0;y<this.height;y+=64) ctx.fillRect(x,y,62,62);
    }
    for (const e of this.entities) e.draw && e.draw(ctx);
    // Draw aim reticle if ranged selected
    if (this.state.data.player.range) {
      ctx.save();
      ctx.translate(this.player.x, this.player.y);
      ctx.rotate(this.aimAngle);
      ctx.strokeStyle = "rgba(255,255,255,.8)";
      ctx.beginPath(); ctx.moveTo(24,0); ctx.lineTo(64,0); ctx.stroke();
      ctx.restore();
    }
    // Floating text
    ctx.font = "16px sans-serif"; ctx.textAlign="center";
    for (const ft of this.floatingTexts) {
      ctx.fillStyle = ft.color; ctx.fillText(ft.text, ft.x, ft.y);
    }
  }
}

// Biome registration helper API called by ./biomes/grasslands.js
export function registerScreenPopulation(engine, manifest, populateFn) {
  engine.screens = new Set(Object.keys(manifest));
  engine.onPopulate = (screenId) => {
    const def = manifest[screenId];
    if (!def) return;
    // Pots
    for (const p of (def.pots||[])) engine.addEntity(new Pot(engine, p[0], p[1]));
    // Enemies
    for (const en of (def.enemies||[])) engine.addEntity(new SimpleEnemy(engine, en));
    // NPCs
    for (const np of (def.npcs||[])) engine.addEntity(new NPC(engine, np));
    // Task items (glasses/computer)
    for (const it of (def.items||[])) {
      const e = new NPC(engine, { x:it[1], y:it[2], w:40, h:40, collides:false });
      e.kind="task_item"; e.id=it[0]; e.name=it[3]; e.icon=it[4];
      e.draw = (ctx)=>{ const img = engine.getImage(`assets/${e.icon}`); if (img) ctx.drawImage(img, e.x-24, e.y-24, 48, 48); else { ctx.fillStyle="#fff"; ctx.fillRect(e.x-16, e.y-16, 32, 32);} };
      engine.addEntity(e);
    }

    // Special hooks (healing pond, temple doors, boss, etc.)
    populateFn && populateFn(screenId, def, engine);
  };
}
