# Oasis — HTML RPG (Starter)

This repo is a *playable* starter for **Oasis**, built to your spec:

- Top‑down, screen‑based world (NES Zelda style)
- Each **screen** is its own HTML file under `public/screens/`
- One shared **engine** (`public/js/engine.js`) controls gameplay & UI across screens
- Backgrounds and collision **masks**: `assets/background_graphics/{biome_grid}.png` and `{biome_grid}_mask.png`
- Characters, items, layout icons use the folder structure you described.
- Server (`server/server.js`) persists save files to **/var/oasis-saves** on Render.com

> Start at `/` which plays `start_game.mp4` in a loop until any key is pressed, then routes to **Grasslands A4**.

### Run locally

```bash
# 1) Install deps
npm install

# 2) Start dev server (serves /public and the save API)
npm run dev

# 3) Open the game
# http://localhost:5173/  (index -> start video -> grasslands_a4.html)
```

If you don't have the graphics yet, you'll see placeholder rectangles. Drop your real PNGs into the folders using the file names you specified.

### Deploy

- **GitHub**: push this whole folder as a repo.
- **Render.com**: create a Web Service from the repo. Use the default `npm start` command.
- Ensure the service has write access to **/var/oasis-saves** (Render persistent disk or writable tmp + cron backup).

### Project layout

```
oasis/
  public/
    index.html                # Start video (loops until any key)
    css/oasis.css
    js/
      engine.js               # Core engine: player, NPCs, items, collisions, transitions
      state.js                # Save/load, inventory, quests, RNG, helpers
      entities.js             # Player, Enemy, NPC, Pot, Loot, Boss, etc.
      screens.js              # Screen bootstrap (reads data-* from page, loads background & mask)
      biomes/grasslands.js    # Grasslands biome data (what spawns where)
    screens/
      grasslands_a4.html      # Starting screen
      grasslands_a3.html
      grasslands_a2.html
      grasslands_a1.html
      grasslands_b4.html
      grasslands_b3.html
      grasslands_b2.html
      grasslands_b1.html
      grasslands_c4.html
      grasslands_c3.html
      grasslands_c2.html
      grasslands_c1.html
      grasslands_d4.html
      grasslands_d3.html
      grasslands_d2.html
      grasslands_d1.html
      grasslands_temple_a1.html
      grasslands_temple_a2.html
      grasslands_temple_a3.html
      grasslands_temple_a4.html
      grasslands_temple_a5.html
    assets/
      background_graphics/    # grasslands_a1.png, grasslands_a1_mask.png, etc.
      characters/             # main_walking_*.png etc.
      items/
        melee/                # wooden_sword.png, stone_sword.png, ...
        range/                # basic_bow.png, crossbow.png, ...
        ability_cards/        # common_damage.png, legendary_healing.png, ...
        armor/                # diamond_armor.png, ...
        keys/                 # grasslands_temple_key.png
        tasks/                # glasses.png, computer.png, crown_piece.png
      layout/                 # heart.png, coin.png, pot.png
      maps/                   # grasslands_map.png
  server/
    server.js                 # Express server: /api/save, /api/load (stores JSON under /var/oasis-saves)
  package.json
```

### Notes

- Collision masks: black (walkable), white (blocked). The engine samples the mask per pixel.
- Transitions: leaving a screen at an edge moves to the neighbor screen and places the player on the opposite edge **at the same offset**.
- Inventory (`E`), Interact (`I`), Map (`M`), Move (`WASD`), Melee (Left click), Range aim (arrow keys) + fire (`Space`).
- Shop merchants: press `I` next to them to open a shop modal (3 slots, weighted rarity). Refreshes hourly per merchant.
- Saves: autosave on transitions + big interactions. Manual save from the pause menu (`Esc`).

This is a foundation you can extend biome‑by‑biome. See `biomes/grasslands.js` for how data drives screens, NPCs, pots, enemies, and temple logic.
