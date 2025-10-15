
import { registerScreenPopulation } from "../engine.js";

export function registerGrasslands(engine) {
  // Manifest describing pots, enemies, NPCs, and special logic per screen
  const M = {
    "grasslands_a4": { 
      npcs: [{ x:640, y:460, kind:"intro_villager", name:"Villager" }],
      pots: [[280,540]]
    },
    "grasslands_a3": {
      npcs: [
        { x:420, y:420, kind:"grasslands_villager_1_task_spectacles" },
        { x:860, y:380, kind:"grasslands_villager_2_task_computer" },
        { x:1100, y:520, kind:"shop_merchant_1" }
      ],
      pots: [[320,520]]
    },
    "grasslands_a2": {
      npcs: [{ x:720, y:420, kind:"grasslands_villager_1_task_spectacles" }],
      pots: [[1060,480]]
    },
    "grasslands_a1": {
      enemies: [{ x:600, y:380, variant:1 }, { x:900, y:300, variant:1 }],
      pots: [[240,520],[980,520]]
    },
    "grasslands_b4": {
      enemies: [{ x:700, y:380, variant:1 }, { x:1000, y:380, variant:1 }],
      pots: [[260,520],[1080,520]]
    },
    "grasslands_b3": { pots: [[300,520],[700,520],[1080,520]] },
    "grasslands_b2": {
      enemies: [{ x:700, y:380, variant:2 }, { x:1000, y:380, variant:2 }],
      pots: [[320,520],[700,520],[1080,520]]
    },
    "grasslands_b1": {
      enemies: [{ x:700, y:380, variant:1 }],
      pots: [[320,520],[980,520]]
      // glasses spawn handled below when quest assigned
    },
    "grasslands_c4": {
      enemies: [{ x:700, y:380, variant:2 }, { x:1000, y:380, variant:2 }],
      pots: [[300,520],[520,520],[860,520],[1080,520]]
    },
    "grasslands_c3": {
      npcs: [{ x:600, y:420, kind:"grasslands_villager_2_task_computer" }]
    },
    "grasslands_c2": {
      enemies: [{ x:860, y:380, variant:1 }],
      pots: [[320,520],[700,520],[1080,520]]
    },
    "grasslands_c1": {
      // Temple entrance handled in populate hook
    },
    "grasslands_d4": {
      enemies: [{ x:900, y:380, variant:2 }],
      pots: [[300,520],[520,520],[860,520],[1080,520]]
    },
    "grasslands_d3": {
      enemies: [{ x:900, y:380, variant:2 }],
      pots: [[300,520],[520,520],[860,520],[1080,520]]
    },
    "grasslands_d2": {
      enemies: [{ x:700, y:380, variant:1 }],
      pots: [[320,520],[980,520]]
      // computer spawn handled below when quest assigned
    },
    "grasslands_d1": {
      // Healing pond + fairy
    },

    // Temple linear a1 -> a5
    "grasslands_temple_a1": {},
    "grasslands_temple_a2": { enemies:[{x:700,y:380,variant:2},{x:520,y:420,variant:2}] },
    "grasslands_temple_a3": { enemies:[{x:700,y:380,variant:2},{x:920,y:420,variant:2}] },
    "grasslands_temple_a4": { enemies:[{x:700,y:380,variant:2},{x:920,y:420,variant:2},{x:540,y:300,variant:2}] },
    "grasslands_temple_a5": { boss:true }
  };

  registerScreenPopulation(engine, M, (screenId, def, eng) => {
    const q = eng.state.data.quests.grasslands;

    // Spawn task items when appropriate
    if (screenId === "grasslands_b1" && q.villagerSpectaclesAssigned && !q.villagerSpectaclesDone) {
      def.items = def.items || [];
      def.items.push(["glasses", 820, 420, "Spectacles", "items/tasks/glasses.png"]);
    }
    if (screenId === "grasslands_d2" && q.villagerComputerAssigned && !q.villagerComputerDone) {
      def.items = def.items || [];
      def.items.push(["computer", 520, 420, "Computer", "items/tasks/computer.png"]);
    }

    // Healing pond + fairy (center)
    if (screenId === "grasslands_d1") {
      // Pond as a circular area in center
      const pond = { x: 640, y: 360, r: 120 };
      const fairy = { x: 640, y: 260 };
      // Draw pond overlay
      const origDraw = eng.draw.bind(eng);
      eng.draw = function() {
        origDraw();
        const ctx = eng.ctx;
        ctx.save();
        ctx.globalAlpha = 0.25;
        ctx.fillStyle = "#64b5f6";
        ctx.beginPath(); ctx.arc(pond.x, pond.y, pond.r, 0, Math.PI*2); ctx.fill();
        ctx.restore();
      };
      // Healing check
      const origUpdate = eng.update.bind(eng);
      eng.update = function(dt) {
        origUpdate(dt);
        const d = Math.hypot(eng.player.x - pond.x, eng.player.y - pond.y);
        if (d < pond.r-12) { eng.state.healToFull(); eng.refreshUI(); }
      };
      // Fairy NPC
      eng.addEntity(new (class extends NPC {
        constructor(){ super(eng, { x:fairy.x, y:fairy.y, kind:"fairy", name:"Fairy" }); }
        draw(ctx){ ctx.fillStyle = "#fff59d"; ctx.beginPath(); ctx.arc(this.x, this.y, 14, 0, Math.PI*2); ctx.fill(); }
      })());
    }

    // Temple entrance guard: require key
    if (screenId === "grasslands_c1") {
      const door = new NPC(eng, { x: 640, y: 80, kind:"temple_door", name:"Temple Door" });
      door.draw = (ctx) => { ctx.fillStyle = "#ffc107"; ctx.fillRect(door.x-48, door.y-24, 96, 48); };
      door.interact = () => {};
      eng.addEntity(door);
      const origInteract = eng.tryInteract.bind(eng);
      eng.tryInteract = function() {
        const p = eng.player;
        const near = eng.entities.find(e => e===door && Math.hypot((e.x-p.x),(e.y-p.y)) < 64);
        if (near) {
          if (q.templeKey) {
            eng.showDialog("Door", "The key fits! Entering the temple...", () => {
              eng.navigateTo("grasslands_temple_a1", p.x, eng.height-20);
            });
          } else {
            eng.showDialog("Door", "The door is locked. You need the Grasslands Temple Key.");
          }
          return;
        }
        return origInteract();
      }
    }

    // Temple flow + boss bar (very light boss)
    if (def.boss) {
      eng.bossBar.style.display = "block";
      let bossHP = 20;
      function updateBar() {
        const pct = Math.max(0, bossHP)/20 * 100;
        eng.bossFill.style.width = pct+"%";
      }
      updateBar();
      // Boss entity
      const boss = new NPC(eng, { x: 640, y: 360, w: 120, h: 120, kind:"grasslands_boss", name:"Grasslands Boss" });
      boss.draw = (ctx)=>{
        ctx.fillStyle = "#2e7d32"; ctx.fillRect(boss.x-boss.w/2, boss.y-boss.h/2, boss.w, boss.h);
      };
      eng.addEntity(boss);
      // Simple boss pattern: shoot at player + random fire circles
      const fires = [];
      const origUpdate = eng.update.bind(eng);
      eng.update = function(dt) {
        origUpdate(dt);
        // Shoot
        if (Math.random()<0.02) {
          const a = Math.atan2(eng.player.y-boss.y, eng.player.x-boss.x);
          eng.spawnProjectile(boss.x, boss.y, a, 300, 0.5, "enemy");
        }
        // Stomp (AoE ring)
        if (Math.random()<0.005) {
          const d = Math.hypot(eng.player.x-boss.x, eng.player.y-boss.y);
          if (d<160) eng.onPlayerDamaged(1);
        }
        // Fire hazards
        if (Math.random()<0.01 && fires.length<6) {
          fires.push({ x: 200+Math.random()*880, y: 140+Math.random()*420, t: 1800, on:false });
        }
        for (const f of fires) {
          f.t -= dt*1000;
          if (f.t<900) f.on = true;
          if (f.on) {
            if (Math.hypot(eng.player.x-f.x, eng.player.y-f.y) < 28) {
              // burn
              if (Math.random()<0.06) eng.onPlayerDamaged(0.5);
            }
          }
        }
        // Draw overlay
        const origDraw = eng.draw.bind(eng);
        eng.draw = function() {
          origDraw();
          const ctx = eng.ctx;
          for (const f of fires) {
            ctx.save();
            ctx.globalAlpha = f.on?0.9:0.5;
            ctx.fillStyle = f.on? "#ef6c00":"#ffcc80";
            ctx.beginPath(); ctx.arc(f.x, f.y, 24, 0, Math.PI*2); ctx.fill();
            ctx.restore();
          }
        };
      };
      // Player hits boss using melee/range
      const origMelee = eng.tryMelee.bind(eng);
      eng.tryMelee = function() {
        const d = Math.hypot(eng.player.x-boss.x, eng.player.y-boss.y);
        if (d<120) { bossHP -= (1 + eng.damageBonusFromCards()); updateBar(); }
        if (bossHP<=0) win();
        return origMelee();
      };
      const origSpawn = eng.spawnProjectile.bind(eng);
      eng.spawnProjectile = function(x,y,a,s,dmg,owner) {
        const proj = origSpawn(x,y,a,s,dmg,owner);
        // collision with boss handled in projectile update by checking distance
        return proj;
      };
      function win() {
        eng.bossBar.style.display = "none";
        eng.addFloatingText("Boss Defeated!", 640, 120, "#fff59d");
        // Rewards
        eng.state.addItem({ id:"basic_bow", kind:"range", icon:"items/range/basic_bow.png" });
        eng.state.addItem({ id:"legendary_healing", kind:"card", icon:"items/ability_cards/legendary_healing.png" });
        eng.state.addItem({ id:"crown_piece", kind:"task", icon:"items/tasks/crown_piece.png" });
        eng.state.data.player.range = { type:"basic_bow", damage:1, cooldownMs:3000 };
        // Exit to next biome start (placeholder: back to grasslands a4)
        setTimeout(()=>{
          eng.navigateTo("grasslands_a4", 640, 360);
        }, 1800);
      }
    }
  });
}
