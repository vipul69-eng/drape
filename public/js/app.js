/* ═══════════════════════════════════════
   DRAPE — Application Controller
   Visual chat · Wardrobe cards · Agentic
═══════════════════════════════════════ */
const $=id=>document.getElementById(id),$$=s=>document.querySelectorAll(s);

// ── Helper: create icon element ──
function ic(name,cls){
  const s=document.createElementNS('http://www.w3.org/2000/svg','svg');
  s.setAttribute('class','ic'+(cls?' '+cls:''));
  const u=document.createElementNS('http://www.w3.org/2000/svg','use');
  u.setAttributeNS('http://www.w3.org/1999/xlink','href','#ic-'+name);
  s.appendChild(u);return s;
}
function icHTML(name,cls){return '<span class="ic'+(cls?' '+cls:'')+'"><svg><use href="#ic-'+name+'"/></svg></span>'}

// ── State ──
const S={deviceId:null,profile:null,wardrobe:[],chatHistory:[],chips:{},itemPhoto:null,profilePhoto:null,online:false,pairInt:null};
const ICON_MAP={Topwear:'hanger',Bottomwear:'scissors',Shoes:'briefcase',Outerwear:'hanger',Accessories:'sparkle'};

// ── Utils ──
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function esc(s){const d=document.createElement('div');d.textContent=s||'';return d.innerHTML}
function compress(file,max,q){return new Promise(r=>{const rd=new FileReader();rd.onload=e=>{const img=new Image();img.onload=()=>{const c=document.createElement('canvas');let w=img.width,h=img.height;if(w>max||h>max){if(w>h){h=Math.round(h*max/w);w=max}else{w=Math.round(w*max/h);h=max}}c.width=w;c.height=h;c.getContext('2d').drawImage(img,0,0,w,h);r(c.toDataURL('image/jpeg',q))};img.src=e.target.result};rd.readAsDataURL(file)})}
function c2hex(n){const m={white:'#f5f5f5',black:'#1a1a1a',navy:'#1e3a5f',blue:'#3b82f6',red:'#ef4444',green:'#22c55e',khaki:'#c8b468',beige:'#e8d5b7',cream:'#fdf8e8',brown:'#8b5e3c',grey:'#9ca3af',gray:'#9ca3af',charcoal:'#4b5563',yellow:'#fbbf24',orange:'#f97316',pink:'#ec4899',purple:'#8b5cf6',terracotta:'#c4622d',rust:'#b45309',maroon:'#6b2132',sage:'#7a9b76',olive:'#6b7c3a',camel:'#c2956c',tan:'#d2a679',lavender:'#a78bfa',burgundy:'#7f1d1d',mustard:'#d97706'};const l=(n||'').toLowerCase().replace(/\s/g,'');for(const k in m)if(l.includes(k))return m[k];return'#c8b468'}

// Scroll the latest message into view smoothly
function scrollToLatest(){
  const msgs=$('chatMessages');
  if(!msgs||!msgs.lastElementChild)return;
  // Small delay to let DOM render + animations start
  requestAnimationFrame(()=>{
    msgs.lastElementChild.scrollIntoView({behavior:'smooth',block:'end'});
  });
}

// ── Toast system (auto-dismiss, slides out) ──
function toast(msg,type){
  const wrap=$('toastWrap');
  const el=document.createElement('div');
  el.className='toast-item'+(type==='error'?' error':'');
  el.innerHTML=icHTML(type==='error'?'x':'check','ic-sm')+' '+esc(msg);
  wrap.appendChild(el);
  setTimeout(()=>{el.classList.add('out');setTimeout(()=>el.remove(),300)},2400);
}

function showSync(s){const e=$('syncIndicator'),d=$('syncDot'),t=$('syncText');e.classList.add('show');d.className='sync-dot '+(s==='syncing'?'orange':s==='error'?'red':'green');t.textContent=s==='syncing'?'syncing…':s==='error'?'offline':'synced';if(s!=='syncing')setTimeout(()=>e.classList.remove('show'),2500)}

// ── Boot ──
async function boot(){
  const bar=$('loadBar'),st=$('loadStatus'),did=$('loadDeviceId');
  bar.style.width='20%';st.textContent='Generating device identity…';
  S.deviceId=API.getDeviceId();did.textContent='Device: '+S.deviceId.slice(0,8)+'…';
  await sleep(200);
  bar.style.width='40%';st.textContent='Connecting…';
  try{const h=await API.health();if(h.status==='ok')S.online=true}catch(_){}
  if(S.online){
    bar.style.width='60%';st.textContent='Loading profile…';
    try{S.profile=(await API.getProfile()).profile}catch(_){}
    bar.style.width='80%';st.textContent='Loading wardrobe…';
    try{S.wardrobe=(await API.getWardrobe()).items||[]}catch(_){S.wardrobe=[]}
  }else{bar.style.width='80%';st.textContent='Offline mode';await sleep(400)}
  bar.style.width='100%';st.textContent=S.profile?'Welcome back!':'Let\'s get started!';
  await sleep(350);
  $('loadingScreen').classList.add('fade');
  setTimeout(()=>{$('loadingScreen').style.display='none';if(S.profile)launch();else $('onboarding').classList.add('show')},400);
}
function launch(){$('onboarding').classList.remove('show');$('app').classList.add('visible');updateHero();updateAvatar();renderWardrobe();renderAnalytics();loadProfilePage();if(S.online)showSync('synced')}

// ── Onboarding ──
function goObStep(n){if(n===3){const v=$('ob-name').value.trim();if(!v){toast('Please enter your name','error');$('ob-name').focus();return}}$$('.ob-step').forEach(s=>s.classList.remove('active'));$('ob-step-'+n).classList.add('active');window.scrollTo(0,0)}
function handleChipClick(el){const g=el.dataset.chip;if(!g)return;el.closest('.chip-group').querySelectorAll('.chip-pill').forEach(c=>c.classList.remove('selected'));el.classList.add('selected');S.chips[g]=el.textContent.trim()}
async function finishOnboarding(){const name=$('ob-name').value.trim();if(!name){goObStep(2);toast('Enter your name first','error');return}$('finishBtn').disabled=true;$('finishBtn').textContent='Saving…';S.profile={name,age:$('ob-age').value||null,gender:$('ob-gender').value,height:$('ob-height').value,build:$('ob-build').value,skin:S.chips.skin||'',style:S.chips.style||'',lifestyle:$('ob-lifestyle').value,location:$('ob-location').value,photo:S.profilePhoto||null,photoAnalysis:null};if(S.online){try{showSync('syncing');await API.saveProfile(S.profile);showSync('synced')}catch(_){showSync('error')}}launch()}

// ── Nav ──
function showPage(name,tab){$$('.page').forEach(p=>p.classList.remove('active'));$$('.nav-tab').forEach(t=>t.classList.remove('active'));$$('.bottom-tab').forEach(t=>t.classList.remove('active'));$('page-'+name).classList.add('active');const bt=document.querySelector('.bottom-tab[data-page="'+name+'"]');if(bt)bt.classList.add('active');const nt=document.querySelector('.nav-tab[data-page="'+name+'"]');if(nt)nt.classList.add('active');if(tab&&tab.classList.contains('nav-tab'))tab.classList.add('active');if(name==='analytics')renderAnalytics();if(name==='profile')loadProfilePage();if(name!=='home')window.scrollTo(0,0)}
function updateHero(){const p=S.profile;if(!p)return;const h=new Date().getHours(),g=h<12?'Good morning':h<17?'Good afternoon':'Good evening';const el=$('heroName'),gr=$('heroGreeting');if(el)el.innerHTML=g+', <em>'+esc(p.name)+'</em>';if(gr)gr.innerHTML=icHTML('sun','ic-sm')+' What are you wearing today?'}
function updateAvatar(){const a=$('navAvatar'),p=S.profile;if(!a||!p)return;if(p.photo)a.innerHTML='<img src="'+p.photo+'" alt=""/>';else if(p.name)a.textContent=p.name[0].toUpperCase()}

// ═══ AGENTIC CHAT ═══
const ACTION_MAP={
  'GO_WARDROBE':{label:'Open Wardrobe',icon:'hanger',fn:()=>showPage('wardrobe',null)},
  'ADD_ITEM':{label:'Add New Item',icon:'plus',fn:()=>{showPage('wardrobe',null);setTimeout(openAddModal,300)}},
  'GO_PLANNER':{label:'Open Planner',icon:'calendar',fn:()=>showPage('planner',null)},
  'GO_PROFILE':{label:'Edit Profile',icon:'user',fn:()=>showPage('profile',null)},
  'GO_INSIGHTS':{label:'View Insights',icon:'chart',fn:()=>showPage('analytics',null)},
};

// Suggestions based on context
const FOLLOW_UPS={
  outfit:['What shoes go with this?','Any accessories to add?','Show me alternatives'],
  buy:['Where can I find these?','What brands do you recommend?','Set a budget for me'],
  color:['Show outfits in these colors','What colors to avoid?','Seasonal color tips'],
  general:['Plan an outfit for tonight','What am I missing?','Analyse my wardrobe'],
};

function detectContext(text){
  const t=text.toLowerCase();
  if(t.includes('wear')||t.includes('outfit')||t.includes('top:')||t.includes('bottom:'))return'outfit';
  if(t.includes('buy')||t.includes('missing')||t.includes('essential')||t.includes('add'))return'buy';
  if(t.includes('color')||t.includes('colour')||t.includes('tone'))return'color';
  return'general';
}

function findMentionedItems(text){
  if(!S.wardrobe.length)return[];
  const lower=text.toLowerCase();
  return S.wardrobe.filter(item=>{
    const name=item.name.toLowerCase();
    // Match if AI mentioned the item name (at least 2-word overlap or exact)
    const words=name.split(/\s+/);
    if(words.length<=1) return lower.includes(name);
    return words.filter(w=>w.length>2&&lower.includes(w)).length>=Math.min(2,words.length);
  }).slice(0,6);
}

function parseActions(text){
  const regex=/\[ACTION:(\w+)\]/g;const actions=[];let m;
  while((m=regex.exec(text))!==null){if(ACTION_MAP[m[1]])actions.push(m[1])}
  return{cleanText:text.replace(/\[ACTION:\w+\]/g,'').trim(),actions};
}

function sysPrompt(){
  const p=S.profile||{};
  const w=S.wardrobe.length?S.wardrobe.map(i=>'- '+i.name+' ('+i.category+', '+i.color+', '+i.occasion+')').join('\n'):'No items yet.';
  return `You are DRAPE, a warm personal AI stylist. Give specific, actionable fashion advice.

USER: ${p.name||'—'} | Age:${p.age||'—'} | Gender:${p.gender||'—'} | Height:${p.height||'—'} | Build:${p.build||'—'} | Skin:${p.skin||'—'} | Style:${p.style||'—'} | Lifestyle:${p.lifestyle||'—'} | Location:${p.location||'—'}

WARDROBE (${S.wardrobe.length} items):
${w}

RULES:
- Only suggest items the user owns. Name them EXACTLY as listed.
- Format outfits: **Top:** / **Bottom:** / **Shoes:** / **Extra:**
- Be warm, personal, use their name occasionally.
- Keep responses concise but complete.

ACTIONS: After your response, append relevant action tags on a new line:
[ACTION:GO_WARDROBE] - when referencing their wardrobe
[ACTION:ADD_ITEM] - when suggesting buying/adding items
[ACTION:GO_PLANNER] - when suggesting outfit planning
[ACTION:GO_PROFILE] - when suggesting profile updates
[ACTION:GO_INSIGHTS] - when mentioning wardrobe analysis
Include only genuinely relevant actions.`;
}

async function sendChat(){
  const inp=$('chatInput'),txt=inp.value.trim();
  if(!txt)return;inp.value='';inp.style.height='auto';
  renderMsg('user',txt);const ld=renderLoader();$('sendBtn').disabled=true;
  S.chatHistory.push({role:'user',content:txt});
  try{
    const msgs=[{role:'system',content:sysPrompt()},...S.chatHistory.slice(-14)];
    if(S.online){
      const d=await API.chat(msgs);
      const{cleanText,actions}=parseActions(d.reply);
      S.chatHistory.push({role:'assistant',content:cleanText});
      ld.remove();renderAIMsg(cleanText,actions);
    }else{ld.remove();renderMsg('ai','Server offline — connect for AI features.',null)}
  }catch(e){ld.remove();renderMsg('ai','Could not reach the stylist: '+e.message,null)}
  $('sendBtn').disabled=false;
}

function quickAsk(t){showPage('home',null);$('chatInput').value=t;sendChat()}

function renderMsg(role,txt){
  const c=$('chatMessages'),row=document.createElement('div');row.className='msg-row '+role;
  const av=document.createElement('div');av.className='msg-ava '+(role==='ai'?'ai-ava':'');
  if(role==='user'){const p=S.profile;if(p&&p.photo)av.innerHTML='<img src="'+p.photo+'" style="width:100%;height:100%;object-fit:cover;border-radius:50%"/>';else av.textContent=p?p.name[0].toUpperCase():'U'}else av.textContent='D';
  const b=document.createElement('div');b.className='msg-bubble';
  b.innerHTML=txt.replace(/\*\*(.*?)\*\*/g,'<strong>$1</strong>').replace(/\n/g,'<br>');
  row.appendChild(av);row.appendChild(b);c.appendChild(row);scrollToLatest();
}

function renderAIMsg(txt,actions){
  const c=$('chatMessages'),row=document.createElement('div');row.className='msg-row ai';
  const av=document.createElement('div');av.className='msg-ava ai-ava';av.textContent='D';
  const b=document.createElement('div');b.className='msg-bubble';
  const mentioned=findMentionedItems(txt);
  const hasOutfit=/\*\*(Top|Bottom|Shoes|Extra|Layers|Accessories):\*\*/i.test(txt);

  if(mentioned.length>0 && hasOutfit){
    // ── VISUAL OUTFIT BOARD ──
    const introMatch=txt.match(/^([\s\S]*?)(?=\*\*(?:Top|Bottom|Shoes|Extra|Layers|Accessories):)/i);
    if(introMatch&&introMatch[1].trim()){
      const intro=document.createElement('div');intro.className='outfit-intro';
      intro.innerHTML=introMatch[1].trim().replace(/\n/g,'<br>');
      b.appendChild(intro);
    }
    const board=document.createElement('div');board.className='outfit-board';
    const grid=document.createElement('div');grid.className='outfit-grid';
    mentioned.forEach(item=>{
      const card=document.createElement('div');card.className='outfit-card';
      card.innerHTML=(item.photo
        ?'<div class="outfit-card-img"><img src="'+item.photo+'" alt="'+esc(item.name)+'"/></div>'
        :'<div class="outfit-card-img outfit-card-ph">'+icHTML(ICON_MAP[item.category]||'hanger','ic-lg')+'</div>')
        +'<div class="outfit-card-info"><div class="outfit-card-name">'+esc(item.name)+'</div>'
        +'<div class="outfit-card-cat"><div class="color-dot" style="background:'+c2hex(item.color)+'"></div>'+esc(item.color)+'</div></div>';
      grid.appendChild(card);
    });
    board.appendChild(grid);
    const det=document.createElement('div');det.className='outfit-details';
    const secText=txt.replace(introMatch?introMatch[1]:'','').trim();
    det.innerHTML=secText.replace(/\*\*(.*?)\*\*/g,'<strong>$1</strong>').replace(/\n/g,'<br>');
    board.appendChild(det);
    b.appendChild(board);
  } else {
    // ── REGULAR RESPONSE WITH INLINE CARDS ──
    b.innerHTML=txt.replace(/\*\*(.*?)\*\*/g,'<strong>$1</strong>').replace(/\n/g,'<br>');
    if(mentioned.length){
      const strip=document.createElement('div');strip.className='outfit-items-row';
      mentioned.forEach(item=>{
        const card=document.createElement('div');card.className='outfit-item-card';
        card.innerHTML=(item.photo?'<div class="card-thumb"><img src="'+item.photo+'" alt="'+esc(item.name)+'"/></div>':'<div class="card-thumb">'+icHTML(ICON_MAP[item.category]||'hanger','ic-lg')+'</div>')+'<div class="card-label">'+esc(item.name)+'</div><div class="card-meta">'+esc(item.color)+'</div>';
        strip.appendChild(card);
      });
      b.appendChild(strip);
    }
  }
  if(actions&&actions.length){const bar=document.createElement('div');bar.className='action-bar';actions.forEach(key=>{const a=ACTION_MAP[key];if(!a)return;const btn=document.createElement('button');btn.className='action-btn';btn.dataset.action=key;btn.innerHTML=icHTML(a.icon,'ic-sm')+' '+a.label;bar.appendChild(btn)});b.appendChild(bar)}
  const ctx=detectContext(txt);const suggestions=FOLLOW_UPS[ctx]||FOLLOW_UPS.general;const chips=document.createElement('div');chips.className='suggestion-chips';suggestions.forEach(s=>{const chip=document.createElement('button');chip.className='suggestion-chip';chip.dataset.ask=s;chip.innerHTML=icHTML('sparkle','ic-sm')+' '+s;chips.appendChild(chip)});b.appendChild(chips);
  row.appendChild(av);row.appendChild(b);c.appendChild(row);scrollToLatest();
}

function renderLoader(){const c=$('chatMessages'),r=document.createElement('div');r.className='msg-row ai';r.innerHTML='<div class="msg-ava ai-ava">D</div><div class="msg-bubble"><div class="dots"><span></span><span></span><span></span></div></div>';c.appendChild(r);scrollToLatest();return r}

// ── Wardrobe ──
let wFilter='All';
function renderWardrobe(){
  const g=$('clothesGrid');if(!g)return;
  const items=wFilter==='All'?S.wardrobe:S.wardrobe.filter(i=>i.category===wFilter);
  if(!items.length){g.innerHTML='<div class="empty-state" style="grid-column:1/-1">'+icHTML(ICON_MAP[wFilter]||'hanger','ic-xl')+'<div class="empty-state-title">Nothing here yet</div><div class="empty-state-sub">Tap "+ Add Item" to start building your wardrobe</div></div>';return}
  g.innerHTML=items.map(i=>'<div class="clothes-card"><div class="clothes-card-del" data-del="'+parseInt(i.id)+'">'+icHTML('trash','ic-sm')+'</div>'+(i.photo?'<img class="clothes-card-img" src="'+i.photo+'" alt="'+esc(i.name)+'"/>':'<div class="clothes-card-placeholder">'+icHTML(ICON_MAP[i.category]||'hanger','ic-lg')+'</div>')+'<div class="clothes-card-body"><div class="clothes-card-name">'+esc(i.name)+'</div><div class="clothes-card-meta"><div class="color-dot" style="background:'+c2hex(i.color)+'"></div>'+esc(i.color)+' · '+esc(i.occasion)+'</div></div></div>').join('');
}
async function deleteItem(id){if(S.online){try{showSync('syncing');await API.deleteItem(id);showSync('synced')}catch(e){showSync('error');toast('Delete failed','error');return}}S.wardrobe=S.wardrobe.filter(i=>i.id!==id);renderWardrobe();renderAnalytics();toast('Item removed')}
function openAddModal(){$('addModal').classList.add('open');S.itemPhoto=null;const z=$('itemPhotoZone');z.innerHTML='<div class="photo-zone-icon">'+icHTML('upload','ic-lg')+'</div><div class="photo-zone-text">Upload clothing photo</div><div class="photo-zone-sub">AI detects type, color & style</div><div class="photo-overlay"><span>Change photo</span></div>';z.classList.remove('has-photo');$('photoDetected').style.display='none';$('analyzingState').classList.remove('show');['mi-name','mi-color','mi-brand','mn-name','mn-color','mn-brand'].forEach(id=>{const e=$(id);if(e)e.value=''});['mi-cat','mi-occasion','mi-season','mn-cat','mn-occasion','mn-season'].forEach(id=>{const e=$(id);if(e)e.selectedIndex=0})}
function closeAddModal(){$('addModal').classList.remove('open')}
function switchTab(t,el){$$('.upload-tab').forEach(x=>x.classList.remove('active'));$$('.upload-pane').forEach(x=>x.classList.remove('active'));el.classList.add('active');$('pane-'+t).classList.add('active')}
async function addItem(pfx){const name=$(pfx+'-name').value.trim();if(!name){toast('Add a name','error');return}const item={name,category:$(pfx+'-cat').value,color:$(pfx+'-color').value||'Not specified',occasion:$(pfx+'-occasion').value,season:$(pfx+'-season').value,brand:$(pfx+'-brand').value,photo:pfx==='mi'?S.itemPhoto:null};let id=Date.now();if(S.online){try{showSync('syncing');const r=await API.addItem(item);id=r.id;showSync('synced')}catch(e){showSync('error')}}item.id=id;S.wardrobe.unshift(item);renderWardrobe();renderAnalytics();closeAddModal();toast('Added to wardrobe')}
async function generatePlan(){const ev=$('pl-event').value.trim();if(!ev){toast('Describe the occasion','error');return}const w=$('pl-weather').value,t=$('pl-time').value,mood=S.chips.plmood||'';const btn=$('planBtn');btn.disabled=true;btn.textContent='Styling…';$('planResult').innerHTML='<div class="outfit-result-card"><div class="dots"><span></span><span></span><span></span></div></div>';try{if(!S.online)throw new Error('Server offline');const msgs=[{role:'system',content:sysPrompt()},{role:'user',content:'Create outfit for: '+ev+'. Weather:'+w+'. Time:'+t+'. '+(mood?'Mood:'+mood:'')+'. Use ONLY my items.'}];const d=await API.chat(msgs);const{cleanText}=parseActions(d.reply);$('planResult').innerHTML='<div class="outfit-result-card"><div class="outfit-result-title">'+icHTML('sparkle')+' '+esc(ev)+'</div><div style="font-size:14px;line-height:1.8;color:var(--ink2)">'+cleanText.replace(/\*\*(.*?)\*\*/g,'<strong>$1</strong>').replace(/\n/g,'<br>')+'</div></div>'}catch(e){$('planResult').innerHTML='<div style="color:var(--danger);font-size:13px;padding:16px">'+icHTML('x','ic-sm')+' '+esc(e.message)+'</div>'}btn.disabled=false;btn.textContent='Generate Outfit'}
function renderAnalytics(){const w=S.wardrobe,sr=$('statsRow');if(!sr)return;sr.innerHTML='<div class="stat-box"><div class="stat-num">'+w.length+'</div><div class="stat-label">Items</div></div><div class="stat-box"><div class="stat-num">'+[...new Set(w.map(i=>i.category))].length+'</div><div class="stat-label">Categories</div></div><div class="stat-box"><div class="stat-num">'+[...new Set(w.map(i=>i.occasion))].length+'</div><div class="stat-label">Occasions</div></div><div class="stat-box"><div class="stat-num">'+[...new Set(w.map(i=>(i.color||'').toLowerCase()))].length+'</div><div class="stat-label">Colours</div></div>';const cc={},oc={};w.forEach(i=>{cc[i.category]=(cc[i.category]||0)+1;oc[i.occasion]=(oc[i.occasion]||0)+1});bars(cc,'catBars');bars(oc,'occBars')}
function bars(counts,id){const mx=Math.max(...Object.values(counts),1),el=$(id);if(!el)return;if(!Object.keys(counts).length){el.innerHTML='<div style="font-size:12px;color:var(--muted)">No data yet</div>';return}el.innerHTML=Object.entries(counts).map(([k,v])=>'<div class="bar-item"><div class="bar-label">'+esc(k)+'</div><div class="bar-track"><div class="bar-fill" style="width:'+Math.round(v/mx*100)+'%"></div></div><div class="bar-count">'+v+'</div></div>').join('')}
async function runAnalysis(){if(!S.wardrobe.length){toast('Add items first','error');return}const c=$('aiAnalysis');c.innerHTML='<div class="dots" style="margin:8px 0"><span></span><span></span><span></span></div>';try{if(!S.online)throw new Error('Server offline');const msgs=[{role:'system',content:sysPrompt()},{role:'user',content:"Analyse my wardrobe: 1)Strengths 2)Top 3 missing 3)Colour gaps 4)Versatility tip."}];const d=await API.chat(msgs);const{cleanText}=parseActions(d.reply);c.innerHTML='<div style="font-size:14px;line-height:1.8;color:var(--ink2)">'+cleanText.replace(/\*\*(.*?)\*\*/g,'<strong>$1</strong>').replace(/\n/g,'<br>')+'</div>'}catch(e){c.innerHTML='<div style="color:var(--danger);font-size:13px">'+icHTML('x','ic-sm')+' '+esc(e.message)+'</div><button class="btn-ghost" id="btnRetryAnalysis" style="margin-top:12px">Try again</button>'}}
function loadProfilePage(){const p=S.profile;if(!p)return;$('pr-name').value=p.name||'';$('pr-age').value=p.age||'';$('pr-gender').value=p.gender||'';$('pr-height').value=p.height||'';$('pr-build').value=p.build||'';$('pr-skin').value=p.skin||'';$('pr-style').value=p.style||'';$('pr-lifestyle').value=p.lifestyle||'';$('pr-location').value=p.location||'';$('profileDisplayName').textContent=p.name||'My Profile';$('profileDisplayMeta').textContent=[p.style,p.lifestyle].filter(Boolean).join(' · ')||'Update your style details';$('profileDeviceId').textContent='Device: '+S.deviceId.slice(0,12)+'…';const av=$('profileAvatar');if(p.photo)av.innerHTML='<img src="'+p.photo+'" style="width:100%;height:100%;object-fit:cover"/>';else av.textContent=p.name?p.name[0].toUpperCase():'?'}
async function saveProfileEdit(){const p=S.profile||{};p.name=$('pr-name').value;p.age=$('pr-age').value||null;p.gender=$('pr-gender').value;p.height=$('pr-height').value;p.build=$('pr-build').value;p.skin=$('pr-skin').value;p.style=$('pr-style').value;p.lifestyle=$('pr-lifestyle').value;p.location=$('pr-location').value;S.profile=p;if(S.online){try{showSync('syncing');await API.saveProfile(p);showSync('synced')}catch(_){showSync('error')}}updateAvatar();loadProfilePage();updateHero();toast('Profile updated')}
function openPairModal(mode){const ov=$('pairOverlay'),pi=$('pairInput'),pc=$('pairCode'),ps=$('pairSub'),pt=$('pairTimer');ov.classList.add('open');if(mode==='generate'){pi.style.display='none';pc.textContent='······';ps.textContent='Generating…';pt.textContent='';if(!S.online){ps.textContent='Server offline — pairing unavailable';return}API.genPair().then(({token,expiresAt})=>{pc.textContent=token;pc.style.opacity='1';ps.textContent='Share this code with your other device';if(S.pairInt)clearInterval(S.pairInt);S.pairInt=setInterval(()=>{const rem=Math.max(0,Math.floor((new Date(expiresAt)-Date.now())/1000));pt.textContent='Expires '+Math.floor(rem/60)+':'+String(rem%60).padStart(2,'0');if(rem<=0){clearInterval(S.pairInt);pt.textContent='Expired';pc.style.opacity='.4'}},1000)}).catch(e=>{ps.textContent='Error: '+e.message})}else{pi.style.display='block';pc.textContent='';pc.innerHTML=icHTML('link','ic-xl');ps.textContent='Enter code from other device';pt.textContent='';$('pairCodeInput').value='';setTimeout(()=>$('pairCodeInput').focus(),100)}}
function closePairModal(){$('pairOverlay').classList.remove('open');if(S.pairInt)clearInterval(S.pairInt)}
async function submitPairCode(){const code=$('pairCodeInput').value.trim();if(!code||code.length<6){toast('Enter full 6-char code','error');return}try{await API.usePair(code);toast('Device linked!');closePairModal();S.profile=(await API.getProfile()).profile;S.wardrobe=(await API.getWardrobe()).items||[];if(S.profile)launch()}catch(e){toast('Failed: '+e.message,'error')}}

// ═══ EVENT BINDING ═══
function bindEvents(){
  $('btnBegin').addEventListener('click',()=>goObStep(2));
  $('btnOb2Back').addEventListener('click',()=>goObStep(1));
  $('btnOb2Next').addEventListener('click',()=>goObStep(3));
  $('btnOb3Back').addEventListener('click',()=>goObStep(2));
  $('finishBtn').addEventListener('click',finishOnboarding);
  $('btnLinkOnboarding').addEventListener('click',()=>openPairModal('join'));
  $('profilePhotoZone').addEventListener('click',()=>$('profilePhotoInput').click());
  $('profilePhotoInput').addEventListener('change',e=>{const f=e.target.files[0];if(!f)return;compress(f,600,.7).then(d=>{const z=$('profilePhotoZone');z.innerHTML='<img src="'+d+'" alt="Profile"/><div class="photo-overlay"><span>Change photo</span></div>';z.classList.add('has-photo');S.profilePhoto=d})});
  // Delegated events
  document.addEventListener('click',e=>{
    const chip=e.target.closest('[data-chip]');if(chip){handleChipClick(chip);return}
    const page=e.target.closest('[data-page]');if(page){showPage(page.dataset.page,page);return}
    const ask=e.target.closest('[data-ask]');if(ask){quickAsk(ask.dataset.ask);return}
    const filt=e.target.closest('[data-filter]');if(filt){wFilter=filt.dataset.filter;$$('.filter-pill').forEach(x=>x.classList.remove('active'));filt.classList.add('active');renderWardrobe();return}
    const del=e.target.closest('[data-del]');if(del){deleteItem(parseInt(del.dataset.del));return}
    const tab=e.target.closest('[data-tab]');if(tab){switchTab(tab.dataset.tab,tab);return}
    const act=e.target.closest('[data-action]');if(act){const a=ACTION_MAP[act.dataset.action];if(a)a.fn();return}
    if(e.target.closest('#btnRetryAnalysis'))runAnalysis();
  });
  $('navAvatar').addEventListener('click',()=>showPage('profile',null));
  $('btnPairNav').addEventListener('click',()=>openPairModal('generate'));
  $('chatInput').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendChat()}});
  $('chatInput').addEventListener('input',function(){this.style.height='auto';this.style.height=Math.min(this.scrollHeight,120)+'px'});
  $('sendBtn').addEventListener('click',sendChat);
  $('btnAddItem').addEventListener('click',openAddModal);
  $('btnCloseModal').addEventListener('click',closeAddModal);
  $('itemPhotoZone').addEventListener('click',()=>$('itemPhotoInput').click());
  $('itemPhotoInput').addEventListener('change',async e=>{const f=e.target.files[0];if(!f)return;const src=await compress(f,400,.6);const z=$('itemPhotoZone');z.innerHTML='<img src="'+src+'" alt="item" style="width:100%;max-height:200px;object-fit:contain;padding:8px"/><div class="photo-overlay"><span>Change photo</span></div>';z.classList.add('has-photo');S.itemPhoto=src});
  $('btnAddPhoto').addEventListener('click',()=>addItem('mi'));
  $('btnAddManual').addEventListener('click',()=>addItem('mn'));
  $('planBtn').addEventListener('click',generatePlan);
  $('btnAnalyse').addEventListener('click',runAnalysis);
  $('profileAvatarWrap').addEventListener('click',()=>$('profileEditPhoto').click());
  $('profileEditPhoto').addEventListener('change',e=>{const f=e.target.files[0];if(!f)return;compress(f,600,.7).then(src=>{S.profile.photo=src;$('profileAvatar').innerHTML='<img src="'+src+'" style="width:100%;height:100%;object-fit:cover"/>';updateAvatar()})});
  $('btnSaveProfile').addEventListener('click',saveProfileEdit);
  $('btnGenCode').addEventListener('click',()=>openPairModal('generate'));
  $('btnLinkDevice').addEventListener('click',()=>openPairModal('join'));
  $('btnClosePair').addEventListener('click',closePairModal);
  $('btnSubmitPair').addEventListener('click',submitPairCode);
  $('pairCodeInput').addEventListener('keydown',e=>{if(e.key==='Enter')submitPairCode()});
}
document.addEventListener('DOMContentLoaded',()=>{bindEvents();boot()});
