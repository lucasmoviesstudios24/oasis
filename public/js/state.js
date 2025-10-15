
// Global game state, save/load, RNG, helpers

export const DEFAULT_STATE = {
  player: {
    heartsMax: 4,
    hearts: 4,
    coins: 0,
    x: 640, y: 360,
    facing: "down",
    speed: 2.25,
    melee: { type: "wooden_sword", damage: 1 },
    range: null, // e.g., { type: "basic_bow", damage: 1, cooldownMs: 3000 }
    armor: "no_armor",
    cards: [], // up to 3 entries by id
  },
  quests: {
    grasslands: {
      started: true,
      villagerSpectaclesAssigned: false,
      villagerSpectaclesDone: false,
      villagerComputerAssigned: false,
      villagerComputerDone: false,
      fairySpoken: false,
      extraKillsNeeded: 0,
      templeKey: false,
      crownPieces: 0
    }
  },
  inventory: [], // { id, kind, icon, meta }
  killsByBiome: { grasslands: 0 },
  biome: "grasslands",
  screenId: "grasslands_a4",
  lastShopRoll: {}, // { merchantId: { timeISO, items: [...] } }
};

// Simple RNG with seed (for deterministic shop rolls per hour per merchant)
function mulberry32(a) {
  return function() {
    let t = a += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  }
}
export function rngFromString(s) {
  let h = 2166136261;
  for (let i=0;i<s.length;i++) { h ^= s.charCodeAt(i); h += (h<<1) + (h<<4) + (h<<7) + (h<<8) + (h<<24); }
  return mulberry32(h>>>0);
}

export const State = {
  data: structuredClone(DEFAULT_STATE),

  setScreen(id) { this.data.screenId = id; },
  setBiome(name) { this.data.biome = name; },

  addCoins(n) { this.data.player.coins += n; },
  spendCoins(n) { if (this.data.player.coins >= n) { this.data.player.coins -= n; return true; } return false; },

  addItem(item) {
    const exists = this.data.inventory.find(x => x.id === item.id);
    if (!exists) this.data.inventory.push(item);
  },
  removeItemById(id) { this.data.inventory = this.data.inventory.filter(x => x.id !== id); },

  healToFull() { this.data.player.hearts = this.data.player.heartsMax; },
  takeDamage(hearts=0.5) {
    const armor = this.data.player.armor || "no_armor";
    let mult = 1;
    if (armor === "diamond_armor") mult = 0.5;
    else if (armor === "mythical_armor") mult = 0.25;
    else if (armor === "legacy_armor") mult = 0.125;
    const loss = hearts * mult;
    this.data.player.hearts = Math.max(0, this.data.player.hearts - loss);
    return this.data.player.hearts;
  },
  addHeartsMax(n) {
    this.data.player.heartsMax += n;
    this.data.player.hearts = Math.min(this.data.player.heartsMax, this.data.player.hearts);
  },

  // Save/Load via backend
  async save(slot="slot1") {
    try {
      await fetch("/api/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slot, data: this.data })
      });
    } catch (e) { console.warn("Save failed", e); }
  },
  async load(slot="slot1") {
    try {
      const r = await fetch(`/api/load?slot=${encodeURIComponent(slot)}`);
      const j = await r.json();
      if (j && j.data) this.data = j.data;
    } catch (e) { console.warn("Load failed", e); }
  }
};
