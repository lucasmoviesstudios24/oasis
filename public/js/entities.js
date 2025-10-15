
export class Sprite {
  constructor(engine, opts) {
    Object.assign(this, { engine, x: 0, y: 0, w: 48, h: 48, vx:0, vy:0, speed: 2, facing: "down", imgKey: null, collides: true }, opts);
  }
  update(dt) {
    this.x += this.vx * dt; this.y += this.vy * dt;
  }
  draw(ctx) {
    const img = this.engine.getImage(this.imgKey);
    if (img) ctx.drawImage(img, this.x - this.w/2, this.y - this.h/2, this.w, this.h);
    else { ctx.fillStyle = "#4caf50"; ctx.fillRect(this.x - this.w/2, this.y - this.h/2, this.w, this.h); }
  }
  aabb() { return { x:this.x-this.w/2, y:this.y-this.h/2, w:this.w, h:this.h }; }
}

export class Player extends Sprite {
  constructor(engine, opts) {
    super(engine, Object.assign({ w: 96, h: 96, speed: 190/60 }, opts));
    this.attackCooldown = 0;
    this.rangeCooldown = 0;
  }
  update(dt) {
    const k = this.engine.keys;
    let dx=0, dy=0;
    if (k["KeyW"]) dy -= 1;
    if (k["KeyS"]) dy += 1;
    if (k["KeyA"]) dx -= 1;
    if (k["KeyD"]) dx += 1;
    const speedBoost = this.engine.cardSpeedBoost();
    const spd = (this.speed + speedBoost) * 60; // pixels/sec normalized
    const mag = Math.hypot(dx,dy) || 1;
    this.vx = (dx/mag) * spd * dt;
    this.vy = (dy/mag) * spd * dt;
    this.x += this.vx; this.y += this.vy;

    if (Math.abs(dx) > Math.abs(dy)) this.facing = dx>0 ? "right":"left";
    else if (Math.abs(dy) > 0) this.facing = dy>0 ? "down":"up";

    // Clamp & collide with mask
    const {w,h} = this.engine.canvas;
    this.x = Math.max(24, Math.min(w-24, this.x));
    this.y = Math.max(24, Math.min(h-24, this.y));
    this.engine.resolveCollisions(this);

    // Cooldowns
    this.attackCooldown = Math.max(0, this.attackCooldown - dt*1000);
    this.rangeCooldown = Math.max(0, this.rangeCooldown - dt*1000);
  }


  draw(ctx) {
    const moving = (Math.abs(this.vx) + Math.abs(this.vy)) > 0.1;
    const key = `characters/main_${moving ? 'walking' : 'stopped'}${moving ? `_${this.facing}` : ''}.png`;
    this.imgKey = key;

    // Draw a visible placeholder + shadow behind the sprite so you always see the player
    ctx.save();
    ctx.globalAlpha = 0.75;
    ctx.fillStyle = '#00ff88';
    ctx.fillRect(this.x - this.w/2, this.y - this.h/2, this.w, this.h);
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(this.x, this.y + this.h/2 - 8, this.w/2, 10, 0, Math.PI*2);
    ctx.fill();
    ctx.restore();

    // Now draw the actual PNG on top (if it's ready)
    super.draw(ctx);
  }

}

export class Pot extends Sprite {
  constructor(engine, x,y) { super(engine, { x,y, w:48, h:48, imgKey:"assets/layout/pot.png" }); this.opened=false; }
  tryOpen(byPlayer) {
    if (this.opened) return;
    const coins = Math.floor(5 + Math.random()*6); // 5-10
    this.engine.addFloatingText(`+${coins}`, this.x, this.y-20, "#ffd54f");
    this.engine.state.addCoins(coins);
    this.opened = true;
    // remove from scene
    this.engine.removeEntity(this);
  }
}

export class SimpleEnemy extends Sprite {
  constructor(engine, opts) {
    super(engine, Object.assign({ w:56, h:56, speed: 120/60, hp: 3, shootCooldown: 0 }, opts));
    this.wanderDir = Math.random()*Math.PI*2;
  }
  update(dt) {
    // Wander
    const change = (Math.random()<0.02);
    if (change) this.wanderDir = Math.random()*Math.PI*2;
    this.vx = Math.cos(this.wanderDir) * this.speed * 60 * dt;
    this.vy = Math.sin(this.wanderDir) * this.speed * 60 * dt;
    this.x += this.vx; this.y += this.vy;
    this.engine.resolveCollisions(this);
    // Clamp
    const {w,h} = this.engine.canvas; this.x = Math.max(24, Math.min(w-24, this.x)); this.y = Math.max(24, Math.min(h-24, this.y));
    // Face player
    const p = this.engine.player;
    const dx = p.x - this.x, dy = p.y - this.y;
    this.facing = Math.abs(dx)>Math.abs(dy) ? (dx>0?"right":"left") : (dy>0?"down":"up");
    // Shoot if visible
    this.shootCooldown -= dt*1000;
    if (this.shootCooldown <= 0) {
      this.engine.spawnProjectile(this.x, this.y, Math.atan2(dy,dx), 240, 0.5, "enemy");
      this.shootCooldown = 1000 + Math.random()*1200;
    }
  }
  draw(ctx) {
    const variant = this.variant || 1;
    const key = `characters/grasslands_enemy_${variant}/grasslands_enemy_${variant}_walking_${this.facing}.png`;
    this.imgKey = key; super.draw(ctx);
  }
  hit(dmg=1) {
    this.hp -= dmg;
    if (this.hp <= 0) {
      this.engine.removeEntity(this);
      const biome = this.engine.state.data.biome;
      this.engine.state.data.killsByBiome[biome] = (this.engine.state.data.killsByBiome[biome]||0)+1;
      // Quest bookkeeping
      const q = this.engine.state.data.quests.grasslands;
      if (q && q.extraKillsNeeded>0) q.extraKillsNeeded = Math.max(0, q.extraKillsNeeded-1);
      this.engine.addFloatingText("+1", this.x, this.y-18, "#4caf50");
    }
  }
}

export class NPC extends Sprite {
  constructor(engine, opts) { super(engine, Object.assign({ w:56, h:56, speed:0, collides:false }, opts)); this.kind=opts.kind; this.name=opts.name||"Villager"; }
  draw(ctx) {
    const key = this.imgKey || this.kindKey();
    this.imgKey = key;
    super.draw(ctx);
  }
  kindKey() {
    if (this.kind.startsWith("shop_merchant")) return "characters/shop_merchant/shop_merchant_stopped.png";
    if (this.kind.startsWith("grasslands_villager_1")) return `characters/grasslands_villager_1/grasslands_villager_1_stopped.png`;
    if (this.kind.startsWith("grasslands_villager_2")) return `characters/grasslands_villager_2/grasslands_villager_2_stopped.png`;
    if (this.kind.startsWith("fairy")) return `characters/fairy_stopped.png`;
    return "characters/unknown.png";
  }
}

export class Projectile extends Sprite {
  constructor(engine, opts) { super(engine, Object.assign({ w:12, h:12, collides:false }, opts)); this.lifetime=2000; this.owner=opts.owner; this.damage=opts.damage||1; }
  update(dt) {
    this.x += Math.cos(this.angle) * this.speed * dt;
    this.y += Math.sin(this.angle) * this.speed * dt;
    this.lifetime -= dt*1000;
    if (this.lifetime<=0) this.engine.removeEntity(this);
    // Collide with walls
    if (!this.engine.pointWalkable(this.x, this.y)) this.engine.removeEntity(this);
    // Hit logic
    if (this.owner==="enemy") {
      const p = this.engine.player;
      const dx = Math.abs(p.x - this.x), dy = Math.abs(p.y - this.y);
      if (dx < p.w/2 && dy < p.h/2) {
        this.engine.onPlayerDamaged(0.5);
        this.engine.removeEntity(this);
      }
    } else if (this.owner==="player") {
      // damage enemies
      for (const e of this.engine.entities) {
        if (e instanceof SimpleEnemy) {
          const dx = Math.abs(e.x - this.x), dy = Math.abs(e.y - this.y);
          if (dx < e.w/2 && dy < e.h/2) {
            e.hit(this.damage);
            this.engine.removeEntity(this); break;
          }
        }
      }
    }
  }
  draw(ctx) {
    ctx.fillStyle = this.owner==="enemy" ? "#ef5350" : "#bbdefb";
    ctx.beginPath(); ctx.arc(this.x, this.y, 6, 0, Math.PI*2); ctx.fill();
  }
}
