// Entities module for Oasis game (patched version)
//
// This file defines the various in‑game entities such as the player,
// enemies, NPCs and simple objects like pots. It is largely based on
// the original code found on the hosted Oasis game but has been
// adjusted to ensure the main player character appears correctly.
//
// The original implementation stored the player sprite images in the
// top‑level `characters` folder and built image keys like
// "characters/main_walking_down.png". However the provided asset pack
// places all of the main character art inside a `characters/main`
// subfolder. As a result the engine would look up files that did not
// exist and fall back to drawing a solid coloured square instead of
// your custom artwork. To fix this we construct image keys that point
// into the `characters/main` folder and use consistent file names for
// stopped and walking animations.

export class Sprite {
  constructor(engine, opts) {
    // Provide sensible defaults for all sprites. These values are
    // overridden via the opts parameter.
    Object.assign(
      this,
      {
        engine,
        x: 0,
        y: 0,
        w: 48,
        h: 48,
        vx: 0,
        vy: 0,
        speed: 2,
        facing: "down",
        imgKey: null,
        collides: true,
      },
      opts,
    );
  }
  update(dt) {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
  }
  draw(ctx) {
    const img = this.engine.getImage(this.imgKey);
    if (img) {
      ctx.drawImage(
        img,
        this.x - this.w / 2,
        this.y - this.h / 2,
        this.w,
        this.h,
      );
    } else {
      // If an image cannot be found we draw a green rectangle so
      // something appears on screen instead of nothing. This is a good
      // fallback for debugging missing assets.
      ctx.fillStyle = "#4caf50";
      ctx.fillRect(
        this.x - this.w / 2,
        this.y - this.h / 2,
        this.w,
        this.h,
      );
    }
  }
  aabb() {
    return { x: this.x - this.w / 2, y: this.y - this.h / 2, w: this.w, h: this.h };
  }
}

export class Player extends Sprite {
  constructor(engine, opts) {
    // Use a slightly larger hitbox for the player and adjust speed to
    // feel more responsive (pixels per frame). The original used a
    // speed of 190/60 which equates to ~3.17 pixels per tick; we
    // preserve that value here.
    super(engine, Object.assign({ w: 56, h: 56, speed: 190 / 60 }, opts));
    this.attackCooldown = 0;
    this.rangeCooldown = 0;
  }
  update(dt) {
    const k = this.engine.keys;
    let dx = 0,
      dy = 0;
    // Movement controls. Use WASD to move the character. We update
    // dx/dy based on which keys are held down.
    if (k["KeyW"]) dy -= 1;
    if (k["KeyS"]) dy += 1;
    if (k["KeyA"]) dx -= 1;
    if (k["KeyD"]) dx += 1;
    const speedBoost = this.engine.cardSpeedBoost();
    const spd = (this.speed + speedBoost) * 60; // pixels/sec normalized
    const mag = Math.hypot(dx, dy) || 1;
    this.vx = (dx / mag) * spd * dt;
    this.vy = (dy / mag) * spd * dt;
    this.x += this.vx;
    this.y += this.vy;

    // Determine which direction the character is facing based on
    // horizontal/vertical movement magnitude. This is used by the draw
    // method to select the appropriate sprite.
    if (Math.abs(dx) > Math.abs(dy)) this.facing = dx > 0 ? "right" : "left";
    else if (Math.abs(dy) > 0) this.facing = dy > 0 ? "down" : "up";

    // Constrain the player within the bounds of the canvas and check
    // collisions with the world mask. Without these lines the player
    // could walk off screen or into solid objects.
    const { w, h } = this.engine.canvas;
    this.x = Math.max(24, Math.min(w - 24, this.x));
    this.y = Math.max(24, Math.min(h - 24, this.y));
    this.engine.resolveCollisions(this);

    // Cooldowns for melee and ranged attacks decrease over time
    this.attackCooldown = Math.max(0, this.attackCooldown - dt * 1000);
    this.rangeCooldown = Math.max(0, this.rangeCooldown - dt * 1000);
  }
  draw(ctx) {
    // Choose the correct sprite based on whether the character is moving.
    const moving = Math.abs(this.vx) + Math.abs(this.vy) > 0.1;
    // When the player is moving we build a key like
    // "characters/main/walking_left.png". When stationary we use
    // "characters/main/stopped.png".
    // Build image keys using the naming convention within the
    // `characters/main` folder. All player sprites are prefixed with
    // `main_` followed by either `stopped` or `walking_direction`.
    // For example: `characters/main/main_walking_left.png` or
    // `characters/main/main_stopped.png`.
    let key;
    if (moving) {
      key = `characters/main/main_walking_${this.facing}.png`;
    } else {
      key = `characters/main/main_stopped.png`;
    }
    this.imgKey = key;
    super.draw(ctx);
  }
}

export class Pot extends Sprite {
  constructor(engine, x, y) {
    // Pots are decorative objects that can be opened by the player.
    super(engine, { x, y, w: 48, h: 48, imgKey: "assets/layout/pot.png" });
    this.opened = false;
  }
  tryOpen(byPlayer) {
    if (this.opened) return;
    const coins = Math.floor(5 + Math.random() * 6); // 5–10 coins
    this.engine.addFloatingText(`+${coins}`, this.x, this.y - 20, "#ffd54f");
    this.engine.state.addCoins(coins);
    this.opened = true;
    // Remove from scene
    this.engine.removeEntity(this);
  }
}

export class SimpleEnemy extends Sprite {
  constructor(engine, opts) {
    super(engine, Object.assign({ w: 56, h: 56, speed: 120 / 60, hp: 3, shootCooldown: 0 }, opts));
    this.wanderDir = Math.random() * Math.PI * 2;
  }
  update(dt) {
    // Wander randomly
    const change = Math.random() < 0.02;
    if (change) this.wanderDir = Math.random() * Math.PI * 2;
    this.vx = Math.cos(this.wanderDir) * this.speed * 60 * dt;
    this.vy = Math.sin(this.wanderDir) * this.speed * 60 * dt;
    this.x += this.vx;
    this.y += this.vy;
    this.engine.resolveCollisions(this);
    // Clamp within bounds
    const { w, h } = this.engine.canvas;
    this.x = Math.max(24, Math.min(w - 24, this.x));
    this.y = Math.max(24, Math.min(h - 24, this.y));
    // Face player
    const p = this.engine.player;
    const dx = p.x - this.x,
      dy = p.y - this.y;
    this.facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up";
    // Shoot if ready
    this.shootCooldown -= dt * 1000;
    if (this.shootCooldown <= 0) {
      this.engine.spawnProjectile(this.x, this.y, Math.atan2(dy, dx), 240, 0.5, "enemy");
      this.shootCooldown = 1000 + Math.random() * 1200;
    }
  }
  draw(ctx) {
    // Select variant and facing to determine enemy sprite path. The
    // default variant is 1.
    const variant = this.variant || 1;
    this.imgKey = `characters/grasslands_enemy_${variant}/grasslands_enemy_${variant}_walking_${this.facing}.png`;
    super.draw(ctx);
  }
  hit(dmg = 1) {
    this.hp -= dmg;
    if (this.hp <= 0) {
      this.engine.removeEntity(this);
      const biome = this.engine.state.data.biome;
      this.engine.state.data.killsByBiome[biome] = (this.engine.state.data.killsByBiome[biome] || 0) + 1;
      // Quest bookkeeping for grasslands
      const q = this.engine.state.data.quests.grasslands;
      if (q && q.extraKillsNeeded > 0) q.extraKillsNeeded = Math.max(0, q.extraKillsNeeded - 1);
      this.engine.addFloatingText("+1", this.x, this.y - 18, "#4caf50");
    }
  }
}

export class NPC extends Sprite {
  constructor(engine, opts) {
    // NPCs are static characters that can optionally collide with the
    // player. They may have names and unique kinds used to select
    // appropriate sprites. The `kind` property is used in the draw
    // method below.
    super(engine, Object.assign({ w: 56, h: 56, speed: 0, collides: false }, opts));
    this.kind = opts.kind;
    this.name = opts.name || "Villager";
  }
  draw(ctx) {
    const key = this.imgKey || this.kindKey();
    this.imgKey = key;
    super.draw(ctx);
  }
  kindKey() {
    // Map NPC kind identifiers to the appropriate sprite. If no match
    // exists we fall back to a generic unknown sprite. This helper
    // encapsulates the naming convention for NPC artwork.
    if (this.kind.startsWith("shop_merchant"))
      return "characters/shop_merchant/shop_merchant_stopped.png";
    if (this.kind.startsWith("grasslands_villager_1"))
      return `characters/grasslands_villager_1/grasslands_villager_1_stopped.png`;
    if (this.kind.startsWith("grasslands_villager_2"))
      return `characters/grasslands_villager_2/grasslands_villager_2_stopped.png`;
    if (this.kind.startsWith("fairy"))
      return `characters/fairy_stopped.png`;
    return "characters/unknown.png";
  }
}