
import { Engine } from "./engine.js";
import { registerGrasslands } from "./biomes/grasslands.js";

// Boot
const params = new URLSearchParams(location.search);
const SCREEN_ID = document.body.dataset.screen;        // e.g., "grasslands_a4"
const BIOME = document.body.dataset.biome;             // e.g., "grasslands"
const IS_TEMPLE = document.body.dataset.temple === "1";

// Register biomes (data + hooks)
const biomeRegistry = new Map();
function registerBiome(name, fn) { biomeRegistry.set(name, fn); }
registerBiome("grasslands", registerGrasslands);

// Create engine
const canvas = document.getElementById("game-canvas");
const engine = new Engine(canvas, { screenId: SCREEN_ID, biome: BIOME, isTemple: IS_TEMPLE, registerBiome });

// Expose for debug
window.__engine = engine;
