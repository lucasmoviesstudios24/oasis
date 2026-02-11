/* Oasis Engine — v2 with sprite loader */
(() => {
  const cfg = { CANVAS_W:1280, CANVAS_H:720, START_BIOME:'grasslands', START_CELL:'a4', SERVER_BASE_URL:'', USE_SERVER_SAVE:false };
  const qs = new URLSearchParams(location.search);
  const initialBiome = (qs.get('biome')||cfg.START_BIOME).toLowerCase();
  const initialCell  = (qs.get('cell')||cfg.START_CELL).toLowerCase();
  const canvas = document.getElementById('game'); const ctx = canvas.getContext('2d',{alpha:false});
  const hud = { hearts:by('hearts'), coins:by('coinAmt'), dialog:by('dialog'), dialogWho:by('dialogWho'), dialogText:by('dialogText'), dialogBtn:by('dialogBtn'), mapOverlay:by('mapOverlay'), inventory:by('inventory'), invList:by('inventoryList'), toast:by('toast') };
  function by(id){ return document.getElementById(id); }

  const G = {
    biome: initialBiome, cell: initialCell, inTemple:false,
    player:{ x:620,y:340,w:32,h:42,speed:2.6,heartsMax:4,hearts:4,alive:true,facing:'down',
      melee:{name:'Wooden Sword',damage:2}, range:{name:'None',damage:0,cooldown:3000,last:0,dir:'right'},
      abilities:[], armor:'none', killsSinceFairy:0, moving:false },
    coins:0, flags:{ introDone:false, questGlassesAccepted:false, questGlassesComplete:false, questComputerAccepted:false, questComputerComplete:false, talkedToFairy:false, need15AfterFairy:false, templeKey:false, bossDefeated:false },
    inventory:[], entities:[], projectiles:[], bullets:[],
    bg:null, mask:null, maskData:null, lastFrame:0, transitions:{pending:null}, screenMeta:null
  };

  const keys = new Set();
  addEventListener('keydown', e=>{ const k=e.key.toLowerCase(); keys.add(k);
    if(k==='m') toggleMap(); if(k==='e') toggleInventory(); if(k==='i') tryInteract();
    if(k.startsWith('arrow')) G.player.range.dir = k.replace('arrow',''); if(k==='q') doRanged();
    if ((e.key==='s') && (e.ctrlKey||e.metaKey)) { e.preventDefault(); saveGame(); notify('Saved.'); } });
  addEventListener('keyup', e=>keys.delete(e.key.toLowerCase()));

  // Sprite image cache (works without await)
  const spriteCache = new Map();
  function sprite(src){ let i=spriteCache.get(src); if(!i){ i=new Image(); i.decoding='async'; i.src=src; spriteCache.set(src,i); } return i; }

  // Background/mask loader
  const imgCache=new Map();
  function loadImage(src){ if(imgCache.has(src)) return imgCache.get(src); const p=new Promise(res=>{ const i=new Image(); i.onload=()=>res(i); i.onerror=()=>res(null); i.src=src; }); imgCache.set(src,p); return p; }

  function notify(t,ms=1500){ hud.toast.textContent=t; hud.toast.style.display='block'; clearTimeout(hud._t); hud._t=setTimeout(()=>hud.toast.style.display='none',ms); }
  function renderHearts(){ hud.hearts.innerHTML=''; for(let i=0;i<G.player.heartsMax;i++){ const d=document.createElement('div'); d.className='heart'; if(i+0.5>G.player.hearts && i+1>G.player.hearts) d.style.filter='grayscale(1) brightness(0.4)'; hud.hearts.appendChild(d);} }
  function toggleMap(){ if(G.inTemple) hud.mapOverlay.innerHTML='<div style="color:#fff;font:600 28px system-ui">Map not available in temple</div>'; else hud.mapOverlay.innerHTML='<img alt="Map" src="assets/maps/grasslands_map.png">'; hud.mapOverlay.style.display = hud.mapOverlay.style.display==='flex'?'none':'flex'; hud.mapOverlay.style.alignItems='center'; hud.mapOverlay.style.justifyContent='center'; }
  function toggleInventory(){ hud.inventory.style.display = hud.inventory.style.display==='flex'?'none':'flex'; if(hud.inventory.style.display==='flex') drawInventory(); }
  function drawInventory(){ const inv=G.inventory.map(it=>`<li>${it.name}</li>`).join('')||'<li>(empty)</li>'; hud.invList.innerHTML=`<ul>${inv}</ul>`; }
  function showDialog(who,text,cb){ hud.dialogWho.textContent=who||''; hud.dialogText.textContent=text||''; hud.dialog.style.display='block'; const close=()=>{ hud.dialog.style.display='none'; hud.dialogBtn.onclick=null; cb&&cb(); }; hud.dialogBtn.onclick=close; }

  async function loadScreen(biome,cell){
    G.entities=[]; G.projectiles=[]; G.bullets=[]; G.biome=biome; G.cell=cell; G.inTemple=biome.includes('temple');
    const path=`screens/${biome}/${cell}.html`; let meta=null;
    try{ const res=await fetch(path); if(res.ok){ const html=await res.text(); const m=html.match(/<script[^>]*id=["']screen-data["'][^>]*>([\s\S]*?)<\/script>/i); if(m){ try{ meta=JSON.parse(m[1]); }catch(e){} } } }catch(e){}
    if(!meta){ meta={ biome, cell, bg:`${biome}_${cell}.png`, mask:`${biome}_${cell}_mask.png`, entities:[],exits:{left:true,right:true,up:true,down:true} }; }
    G.screenMeta=meta;
    G.bg=await loadImage(`assets/background_graphics/${meta.bg}`);
    const maskImg=await loadImage(`assets/background_graphics/${meta.mask}`); G.mask=maskImg;
    if(maskImg){ const off=document.createElement('canvas'); off.width=1280; off.height=720; const o=off.getContext('2d'); o.drawImage(maskImg,0,0,1280,720); G.maskData=o.getImageData(0,0,1280,720); } else G.maskData=null;
    for(const e of meta.entities||[]) G.entities.push({...e, alive:true, t:0, facing:e.facing||'down'});
    if(G.transitions.pending){ const t=G.transitions.pending, m=20; if(t.entryFrom==='left'){ G.player.x=m; G.player.y=t.y; } if(t.entryFrom==='right'){ G.player.x=1280-40; G.player.y=t.y; } if(t.entryFrom==='down'){ G.player.y=720-60; G.player.x=t.x; } if(t.entryFrom==='up'){ G.player.y=40; G.player.x=t.x; } G.transitions.pending=null; }
    renderHearts(); hud.coins.textContent=G.coins; autosave();
    if(biome==='grasslands' && cell==='a4' && !G.flags.introDone){
      setTimeout(()=>{ showDialog('Villager',"Hi! Welcome to the Oasis. We need your help! The Evil Lord Zargon has captured our King and stolen his crown. Take this wooden sword. First, go south and speak with the villagers.",()=>{
        G.flags.introDone=true; giveItem({name:'Wooden Sword',type:'melee',key:'wooden_sword',damage:2});
        G.entities=G.entities.filter(e=>e.kind!=='villager_intro'); autosave(); }); },450);
    }
  }

  function giveItem(item){ G.inventory.push(item); if(item.type==='melee') G.player.melee={name:item.name,damage:item.damage||2}; notify(`Received: ${item.name}`); drawInventory(); }

  function walkable(x,y,w=G.player.w,h=G.player.h){ if(!G.maskData) return true; const md=G.maskData;
    function pix(px,py){ if(px<0||py<0||px>=md.width||py>=md.height) return 255; const i=(py*md.width+px)*4; return md.data[i]; }
    const pts=[[x+4,y+4],[x+w-4,y+4],[x+4,y+h-4],[x+w-4,y+h-4],[x+w/2,y+h/2]]; return pts.every(([px,py])=>pix(px|0,py|0)<128); }

  function updatePlayer(dt){ const p=G.player; let dx=0,dy=0, moving=false;
    if(keys.has('w')){ dy-=p.speed; p.facing='up'; moving=true; }
    if(keys.has('s')){ dy+=p.speed; p.facing='down'; moving=true; }
    if(keys.has('a')){ dx-=p.speed; p.facing='left'; moving=true; }
    if(keys.has('d')){ dx+=p.speed; p.facing='right'; moving=true; }
    p.moving=moving;
    const nx=p.x+dx, ny=p.y+dy; if(walkable(nx,p.y)) p.x=nx; if(walkable(p.x,ny)) p.y=ny;
    const m=6; if(p.x<m) moveToNeighbor('left'); if(p.x+p.w>1280-m) moveToNeighbor('right'); if(p.y<m) moveToNeighbor('up'); if(p.y+p.h>720-m) moveToNeighbor('down'); }
  function moveToNeighbor(dir){ const [c,r]=parseCell(G.cell); let nc=c,nr=r; if(!G.inTemple){ if(dir==='left')nc--; if(dir==='right')nc++; if(dir==='up')nr++; if(dir==='down')nr--; if(nc<0||nc>3||nr<1||nr>4) return; const n=mkCell(nc,nr); G.transitions.pending={biome:G.biome,cell:n,entryFrom:opp(dir),x:G.player.x,y:G.player.y}; loadScreen(G.biome,n); } else { let ni=r; if(dir==='up')ni++; if(dir==='down')ni--; if(ni<1||ni>5) return; const n=`a${ni}`; G.transitions.pending={biome:G.biome,cell:n,entryFrom:opp(dir),x:G.player.x,y:G.player.y}; loadScreen(G.biome,n);} }
  const opp=d=>({left:'right',right:'left',up:'down',down:'up'})[d];
  function parseCell(cell){ const c=cell[0].toLowerCase().charCodeAt(0)-97; const r=parseInt(cell.slice(1),10); return [c,r]; }
  function mkCell(c,r){ return String.fromCharCode(97+c)+r; }

  function tryInteract(){ const p=G.player;
    for(const e of G.entities){ if(!e.alive) continue; if(distRect(p,e)<40){
      if(e.kind==='pot'){ openPot(e); return; }
      if(e.kind==='villager1'){ if(!G.flags.questGlassesAccepted){ G.flags.questGlassesAccepted=True; showDialog('Villager',"Hi! I misplaced my spectacles at the campground. Bring them back and I'll reward you.",()=>autosave()); }
        else if(!G.flags.questGlassesComplete){ const ix=G.inventory.findIndex(i=>i.key==='glasses'); if(ix>=0){ G.inventory.splice(ix,1); giveItem({name:'Stone Sword',type:'melee',key:'stone_sword',damage:3}); G.flags.questGlassesComplete=true; showDialog('Villager',"Thank you! Take this Stone Sword.",()=>autosave()); } else showDialog('Villager',"Any luck finding my spectacles at the campground?",null); } return; }
      if(e.kind==='villager2'){ if(!G.flags.questComputerAccepted){ G.flags.questComputerAccepted=true; showDialog('Villager',"I lost my computer at the old tower. Bring it back for a tip!",()=>autosave()); }
        else if(!G.flags.questComputerComplete){ const ix=G.inventory.findIndex(i=>i.key==='computer'); if(ix>=0){ G.inventory.splice(ix,1); G.flags.questComputerComplete=true; showDialog('Villager',"Thanks! Tip: magical ponds fully heal you.",()=>autosave()); } else showDialog('Villager',"Please find my computer at the old tower.",null); } return; }
      if(e.kind==='glasses'||e.kind==='computer'){ e.alive=false; if(e.kind==='glasses') giveItem({name:'Spectacles',type:'task',key:'glasses'}); if(e.kind==='computer') giveItem({name:'Computer',type:'task',key:'computer'}); return; }
      if(e.kind==='merchant'){ showDialog('Merchant',"Welcome! Shops refresh hourly. (Shop system coming next.)",null); return; }
      if(e.kind==='healing'){ healFull(); notify('You feel rejuvenated.'); return; }
      if(e.kind==='fairy'){ if(G.flags.questGlassesComplete && G.flags.questComputerComplete){ if(!G.flags.talkedToFairy){ G.flags.talkedToFairy=true; G.flags.need15AfterFairy=true; G.player.killsSinceFairy=0; showDialog('Fairy',"Defeat 15 more enemies across the Grasslands, then return for the Temple Key.",null); }
        else if(G.flags.need15AfterFairy){ if(G.player.killsSinceFairy>=15){ G.flags.need15AfterFairy=false; G.flags.templeKey=true; giveItem({name:'Grasslands Temple Key',type:'key',key:'grasslands_temple_key'}); showDialog('Fairy',"Here is the Temple Key. Safe travels!",null); } else showDialog('Fairy',`Enemies defeated: ${G.player.killsSinceFairy}/15`,null); } else showDialog('Fairy',"You already have the key. Good luck!",null); } else showDialog('Fairy',"Help the villagers first, then return to me.",null); return; }
      if(e.kind==='templeEntrance'){ if(G.flags.templeKey){ notify('Entering Temple...'); setTimeout(()=>{ G.transitions.pending={biome:'grasslands_temple',cell:'a1',entryFrom:'down',x:G.player.x,y:G.player.y}; loadScreen('grasslands_temple','a1'); },250); } else notify('You need the Grasslands Temple Key.'); return; }
    } } }
  function healFull(){ G.player.hearts=G.player.heartsMax; renderHearts(); }
  function openPot(e){ if(!e.alive) return; e.alive=false; const add=5+Math.floor(Math.random()*6); G.coins+=add; hud.coins.textContent=G.coins; notify(`+${add} coins`); }
  function doMelee(){ for(const e of G.entities){ if(!e.alive||!e.isEnemy) continue; if(distRect(G.player,e)<48){ e.hp-= (G.player.melee.damage||2); if(e.hp<=0){ e.alive=false; onEnemyKilled(); } } } } addEventListener('mousedown',ev=>{ if(ev.button===0) doMelee(); });
  function doRanged(){ const now=performance.now(), r=G.player.range; if(!r || r.name==='None'){ notify('No ranged weapon equipped.'); return; } if(now-r.last<r.cooldown){ notify('Bow recharging...'); return; } r.last=now; const dir=r.dir||'right', speed=6; const proj={x:G.player.x+G.player.w/2, y:G.player.y+G.player.h/2, vx:0, vy:0, life:120, dmg:(r.damage||1)}; if(dir==='right') proj.vx=speed; if(dir==='left') proj.vx=-speed; if(dir==='up') proj.vy=-speed; if(dir==='down') proj.vy=speed; G.projectiles.push(proj); }
  function onEnemyKilled(){ G.player.killsSinceFairy++; autosave(); }
  function updateEntities(dt){ for(const e of G.entities){ if(!e.alive) continue; e.t+=dt; if(e.isEnemy){ if(!e.vx) e.vx=(Math.random()*2-1)*0.7; if(!e.vy) e.vy=(Math.random()*2-1)*0.7; if((e.t%1500)<dt){ e.vx=(Math.random()*2-1)*0.7; e.vy=(Math.random()*2-1)*0.7; } const nx=e.x+e.vx, ny=e.y+e.vy; if(Math.abs(e.vx)>Math.abs(e.vy)) e.facing=e.vx>0?'right':'left'; else e.facing=e.vy>0?'down':'up'; if(walkable(nx,e.y,e.w||28,e.h||28)) e.x=nx; if(walkable(e.x,ny,e.w||28,e.h||28)) e.y=ny; if((e.t%1200)<dt){ const ang=Math.atan2(G.player.y-e.y,G.player.x-e.x); G.bullets.push({x:e.x,y:e.y,vx:Math.cos(ang)*2.0,vy:Math.sin(ang)*2.0,dmg:0.5}); } if(rectOverlap(G.player,e)) takeDamage(0.5); } }
    for(const b of G.bullets){ b.x+=b.vx; b.y+=b.vy; } G.bullets=G.bullets.filter(b=>b.x>-10&&b.y>-10&&b.x<1280+10&&b.y<720+10);
    for(const p of G.projectiles){ p.x+=p.vx; p.y+=p.vy; p.life--; for(const e of G.entities){ if(!e.alive||!e.isEnemy) continue; if(distRect({x:p.x,y:p.y,w:6,h:6},e)<20){ e.hp-=p.dmg; p.life=0; if(e.hp<=0){ e.alive=false; onEnemyKilled(); } break; } } } G.projectiles=G.projectiles.filter(p=>p.life>0); }
  function takeDamage(hearts){ G.player.hearts -= hearts; if(G.player.hearts<=0){ G.player.hearts=0; showDialog('You Died','Respawning...',()=>{ G.player.hearts=G.player.heartsMax; if(G.inTemple){ G.inTemple=false; loadScreen('grasslands','c1'); } else { loadScreen(G.biome,'a4'); } }); } renderHearts(); }
  function rectOverlap(a,b){ return !(a.x+a.w<b.x || a.x>b.x+(b.w||28) || a.y+a.h<b.y || a.y>b.y+(b.h||28)); }
  function distRect(a,b){ const ax=a.x+(a.w||0)/2, ay=a.y+(a.h||0)/2, bx=b.x+(b.w||0)/2, by=b.y+(b.h||0)/2; return Math.hypot(ax-bx,ay-by); }
  function idForKind(kind){ if(kind==='villager_intro' || kind==='villager1') return 'grasslands_villager_1'; if(kind==='villager2') return 'grasslands_villager_2'; if(kind==='merchant') return 'shop_merchant'; if(kind==='grasslands_enemy_1') return 'grasslands_enemy_1'; if(kind==='grasslands_enemy_2') return 'grasslands_enemy_2'; if(kind==='grasslands_temple_enemy') return 'grasslands_temple_enemy'; return null; }
  function charSpritePath(id, movement, dir){ const file = movement==='stopped' ? `${id}_stopped.png` : `${id}_walking_${dir}.png`; const sub = (id==='main') ? '' : id + '/'; return `assets/characters/${sub}${file}`; }

  function draw(){
    if(G.bg) ctx.drawImage(G.bg,0,0,1280,720); else { ctx.fillStyle='#083'; ctx.fillRect(0,0,1280,720); ctx.fillStyle='#fff'; ctx.fillText(`Missing BG: assets/background_graphics/${G.screenMeta?.bg}`,20,20); }
    for(const e of G.entities){ if(!e.alive) continue;
      if(e.kind==='pot'){ const im=sprite('assets/layout/pot.png'); if(im.complete&&im.naturalWidth) ctx.drawImage(im,e.x,e.y,28,28); else {ctx.fillStyle='#7a4b2c'; ctx.fillRect(e.x,e.y,28,28);} continue; }
      if(e.kind==='glasses'||e.kind==='computer'){ const p=e.kind==='glasses'?'assets/items/tasks/glasses.png':'assets/items/tasks/computer.png'; const im=sprite(p); if(im.complete&&im.naturalWidth) ctx.drawImage(im,e.x,e.y,e.w||24,e.h||24); else {ctx.fillStyle='#fff'; ctx.fillRect(e.x,e.y,e.w||24,e.h||24);} continue; }
      if(e.kind==='healing'){ ctx.fillStyle='rgba(0,200,255,.4)'; ctx.beginPath(); ctx.arc(e.x,e.y,80,0,Math.PI*2); ctx.fill(); continue; }
      if(e.kind==='templeEntrance'){ ctx.fillStyle='rgba(255,255,255,.65)'; ctx.fillRect(e.x-40,e.y-10,80,20); continue; }
      const id=idForKind(e.kind);
      if(id){ const moving = e.isEnemy ? (Math.abs(e.vx||0)>0.05||Math.abs(e.vy||0)>0.05) : false; const movement=moving?'walking':'stopped'; const dir=e.facing||'down'; const path=charSpritePath(id,movement,dir); const im=sprite(path);
        if(im.complete&&im.naturalWidth) ctx.drawImage(im,e.x,e.y,e.w||30,e.h||40);
        else { const stop=sprite(charSpritePath(id,'stopped','')); if(stop.complete&&stop.naturalWidth) ctx.drawImage(stop,e.x,e.y,e.w||30,e.h||40); else { ctx.fillStyle = id==='shop_merchant' ? '#ffd700' : (e.isEnemy ? '#c33' : '#5cf'); ctx.fillRect(e.x,e.y,e.w||30,e.h||40); } }
      } else { ctx.fillStyle='#5cf'; ctx.fillRect(e.x,e.y,30,40); }
    }
    ctx.fillStyle='#fffb'; for(const b of G.bullets){ ctx.fillRect(b.x,b.y,6,6); }
    ctx.fillStyle='#fff'; for(const p of G.projectiles){ ctx.fillRect(p.x,p.y,6,6); }
    const pl=G.player, pMove=pl.moving?'walking':'stopped', pPath=charSpritePath('main',pMove,pl.facing), pim=sprite(pPath);
    if(pim.complete&&pim.naturalWidth) ctx.drawImage(pim,pl.x,pl.y,40,46);
    else { const stop=sprite(charSpritePath('main','stopped','')); if(stop.complete&&stop.naturalWidth) ctx.drawImage(stop,pl.x,pl.y,40,46); else { ctx.fillStyle='#0cf'; ctx.fillRect(pl.x,pl.y,pl.w,pl.h); } }
  }

  function autosave(){ saveGame(true); }
  function saveGame(silent){ const payload={biome:G.biome,cell:G.cell,player:G.player,coins:G.coins,flags:G.flags,inventory:G.inventory}; localStorage.setItem('oasis_save', JSON.stringify(payload)); if(cfg.USE_SERVER_SAVE&&cfg.SERVER_BASE_URL){ fetch(cfg.SERVER_BASE_URL+'/save',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}).catch(()=>{}); } if(!silent) notify('Saved.'); }
  async function loadGame(){ try{ const s=localStorage.getItem('oasis_save'); if(!s) return false; const d=JSON.parse(s); Object.assign(G,{biome:d.biome,cell:d.cell,coins:d.coins}); Object.assign(G.player,d.player); Object.assign(G.flags,d.flags); G.inventory=d.inventory||[]; return true; }catch{ return false; } }
  function loop(t){ const dt=G.lastFrame?(t-G.lastFrame):16; G.lastFrame=t; updatePlayer(dt); updateEntities(dt); draw(); requestAnimationFrame(loop); }
  (async function start(){ renderHearts(); await loadGame(); await loadScreen(G.biome,G.cell); requestAnimationFrame(loop); })();
})();