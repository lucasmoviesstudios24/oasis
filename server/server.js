const express = require('express'); const fs = require('fs'); const path = require('path');
const app = express(); app.use(express.json({limit:'1mb'}));
const SAVE_DIR = process.env.SAVE_DIR || '/var/oasis-saves'; fs.mkdirSync(SAVE_DIR,{recursive:true});
app.post('/save',(req,res)=>{ try{ fs.writeFileSync(path.join(SAVE_DIR,'slot1.json'), JSON.stringify(req.body||{},null,2)); res.json({ok:true}); }catch(e){ res.status(500).json({ok:false,error:String(e)});} });
app.get('/load',(req,res)=>{ try{ const p=path.join(SAVE_DIR,'slot1.json'); if(!fs.existsSync(p)) return res.json({ok:true,data:null}); res.json({ok:true,data:JSON.parse(fs.readFileSync(p,'utf8'))}); }catch(e){ res.status(500).json({ok:false,error:String(e)});} });
const PORT = process.env.PORT || 3000; app.listen(PORT, ()=>console.log('Oasis save server on', PORT));