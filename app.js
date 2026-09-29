'use strict';
/* EASY — система развозок. Автономная версия: данные в localStorage браузера. */
const KEY='easy_delivery_db',SALT='easy-v3|',OWNER_HASH='6c332db57190afb465899b47a800a309f3e3cbeb6d6232800f577fc7af7e41c1';
const PRODUCTS=[['burger','Бургеры'],['chicken','Сэндвичи куриные'],['sausage','Сэндвичи колбасные'],['croissant','Круассаны'],['hotdog','Хот-доги']];
const ST=['Новая','Принята','В пути','Доставлена'],NEXT=['Принять','Отправить в путь','Отметить доставленной'],LIVE=['Новая','Принята','В пути'];
const DAYS=[['Пн',1],['Вт',2],['Ср',3],['Чт',4],['Пт',5],['Сб',6],['Вс',0]];
const load=()=>{try{return JSON.parse(localStorage.getItem(KEY))||{}}catch{return{}}};
const fresh=()=>Object.assign({users:[],orders:[],activity:[]},load());
let db=fresh(),user=null,isOwner=false,page='home';
const $=id=>document.getElementById(id),save=()=>localStorage.setItem(KEY,JSON.stringify(db));
const esc=x=>String(x??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const pad=n=>String(n).padStart(2,'0'),iso=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const fmt=v=>new Date(v).toLocaleString('ru-RU',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
const dt=v=>typeof v==='number'?fmt(v):esc(v||'—');
const dayLabel=d=>new Date(d+'T12:00').toLocaleDateString('ru-RU',{weekday:'long',day:'numeric',month:'long'});
const sha=async s=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(SALT+s)))].map(b=>b.toString(16).padStart(2,'0')).join('');
const okPass=p=>p.length>=8&&/[A-Za-zА-Яа-я]/.test(p)&&/\d/.test(p)&&!/\s/.test(p);
function toast(m){const t=$('toast');t.textContent=m;t.classList.add('on');clearTimeout(toast.t);toast.t=setTimeout(()=>t.classList.remove('on'),2800)}
function act(a,e=''){db.activity.push({a,e,t:Date.now()});db.activity=db.activity.slice(-500);save()}
function modal(t,b){$('mt').textContent=t;$('mb').innerHTML=b;$('modal').classList.remove('hidden');$('mb').querySelector('input:not([disabled])')?.focus()}
const closeModal=()=>$('modal').classList.add('hidden');
const byId=id=>db.orders.find(o=>o.id===+id),nid=()=>db.orders.reduce((m,x)=>Math.max(m,x.id),0)+1;
const my=()=>db.orders.filter(o=>o.email===user.email).sort((a,b)=>b.id-a.id);
const sum=o=>PRODUCTS.reduce((s,[k])=>s+(+o[k]||0),0),lines=o=>PRODUCTS.filter(([k])=>o[k]).map(([k,n])=>`${n} ${o[k]}`).join(', ');
const tot=l=>Object.fromEntries(PRODUCTS.map(([k])=>[k,l.reduce((s,o)=>s+(+o[k]||0),0)]));
const byWhen=(a,b)=>a.whenISO>b.whenISO?1:-1;
const mk=(w,q,c,auto)=>({id:nid(),email:user.email,name:user.name,shop:user.shop,address:user.address,...q,whenISO:w,comment:c,status:'Новая',auto:!!auto,created:Date.now()});

/* ---------- вход, регистрация ---------- */
function tabs(m){['login','register','owner'].forEach(x=>{$(x+'Form').classList.toggle('hidden',x!==m);document.querySelector(`[data-tab=${x}]`).classList.toggle('active',x===m)})}
document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>tabs(b.dataset.tab));tabs('login');
$('rPass').oninput=()=>{const p=$('rPass').value;$('rules').innerHTML=[[p.length>=8,'8+ символов'],[/[A-Za-zА-Яа-я]/.test(p),'буква'],[/\d/.test(p),'цифра'],[p&&!/\s/.test(p),'без пробелов']].map(([ok,t])=>`<i class="${ok?'ok':''}">${t}</i>`).join('')};$('rPass').oninput();
$('loginForm').onsubmit=async e=>{e.preventDefault();const em=$('email').value.trim().toLowerCase(),pw=$('password').value,u=db.users.find(x=>x.email===em);
 if(u&&u.password&&u.password===pw){u.hash=await sha(em+pw);delete u.password}/* перенос старых аккаунтов на хэш */
 if(!u||u.hash!==await sha(em+pw))return toast('Неверный email или пароль. Проверьте раскладку и попробуйте снова.');
 u.last=Date.now();user=u;isOwner=false;sessionStorage.setItem('s',em);act('Вход продавца',em);enter()};
$('registerForm').onsubmit=async e=>{e.preventDefault();const em=$('rEmail').value.trim().toLowerCase(),pw=$('rPass').value;
 if(!okPass(pw))return toast('Пароль: минимум 8 символов, буква и цифра, без пробелов.');
 if(db.users.some(x=>x.email===em))return toast('Такой аккаунт уже есть. Откройте вкладку «Войти».');
 const code=String(100000+Math.floor(Math.random()*900000));
 modal('Подтвердите email',`<p>Это демо: письма не отправляются, поэтому код показан здесь.</p><p class="code">${code}</p><label>Код из письма<input class="field" id="code" inputmode="numeric" maxlength="6"></label><button class="primary" id="okCode">Подтвердить</button>`);
 $('okCode').onclick=async()=>{if($('code').value.trim()!==code)return toast('Код не совпадает. Проверьте цифры.');
  user={email:em,hash:await sha(em+pw),name:'',shop:'',address:'',created:Date.now(),last:Date.now()};db.users.push(user);save();isOwner=false;sessionStorage.setItem('s',em);act('Регистрация',em);closeModal();enter()}};
$('ownerForm').onsubmit=async e=>{e.preventDefault();if(await sha($('oLogin').value+'|'+$('oPass').value)!==OWNER_HASH)return toast('Неверный логин или пароль владельца.');
 isOwner=true;user=null;sessionStorage.setItem('o','1');act('Владелец вошёл');enter()};
$('logout').onclick=()=>{act(isOwner?'Владелец вышел':'Выход продавца',user?.email||'');sessionStorage.clear();user=null;isOwner=false;$('shell').classList.add('hidden');$('auth').classList.remove('hidden');$('logout').classList.add('hidden');$('who').textContent='';tabs('login')};
function profileSetup(){modal('Расскажите о магазине',`<div class="qs"><label>Ваше имя<input class="field" id="pn"></label><label>Магазин<input class="field" id="ps"></label></div><label>Адрес доставки<input class="field" id="pa"></label><button class="primary" id="saveProfile">Сохранить и продолжить</button>`);
 $('saveProfile').onclick=()=>{const v=['pn','ps','pa'].map(i=>$(i).value.trim());if(v.some(x=>!x))return toast('Заполните имя, магазин и адрес — они попадут в каждую заявку.');
  Object.assign(user,{name:v[0],shop:v[1],address:v[2]});save();closeModal();enter()}}
function enter(){if(!isOwner&&!user.shop){$('auth').classList.add('hidden');return profileSetup()}
 $('auth').classList.add('hidden');$('shell').classList.remove('hidden');$('logout').classList.remove('hidden');$('who').textContent=isOwner?'Владелец':user.shop;if(!isOwner)autoFill();go('home')}

/* ---------- навигация ---------- */
const NAV={s:[['home','Главная'],['orders','Мои заявки'],['profile','Мой магазин']],o:[['home','Обзор'],['orders','Заявки'],['sum','Сводка на загрузку'],['sellers','Продавцы'],['log','Активность']]};
function go(p){page=p;$('nav').innerHTML=NAV[isOwner?'o':'s'].map(([k,n])=>`<button data-go="${k}" class="${k===p?'on':''}">${n}</button>`).join('');$('page').innerHTML=isOwner?ownerView(p):sellerView(p);
 if(isOwner&&$('ol')){const f=p==='orders'?()=>{const q=$('fq').value.toLowerCase(),s=$('fs').value;$('ol').innerHTML=rows(db.orders.filter(o=>(!s||o.status===s)&&(!q||[o.id,o.shop,o.address,o.name].join(' ').toLowerCase().includes(q))).sort((a,b)=>b.id-a.id),'o')}
  :()=>{const q=$('fq').value.toLowerCase();$('ol').innerHTML=db.users.filter(u=>!q||[u.name,u.shop,u.email,u.address].join(' ').toLowerCase().includes(q)).map(sbox).join('')||'<div class="empty">Никого не нашли. Попробуйте другое слово.</div>'};
  $('fq').oninput=f;if($('fs'))$('fs').onchange=f;f()}}
const head=(t,p,btn='')=>`<div class="head"><div><h2>${t}</h2><p>${p}</p></div><div class="acts">${btn}</div></div>`;
function rows(l,m){if(!l.length)return '<div class="empty">Заявок пока нет.'+(m==='s'?' Нажмите «Новая заявка» — это займёт полминуты.':'')+'</div>';
 return l.map(o=>{const i=ST.indexOf(o.status);
  const btn=m==='s'?(o.status==='Новая'?`<button class="secondary sm" data-a="edit:${o.id}">Изменить</button><button class="secondary sm danger" data-a="cancel:${o.id}">Отменить</button>`:'')+`<button class="secondary sm" data-a="copy:${o.id}">Повторить</button>`:m==='o'&&i>=0&&i<3?`<button class="primary sm" data-a="next:${o.id}">${NEXT[i]}</button>`:'';
  return `<div class="row"><b>№${o.id}</b><div><b>${esc(lines(o))}</b><div class="muted">${m==='o'?esc(o.shop)+', '+esc(o.address)+'. ':''}${esc(o.comment||'Без комментария')}</div></div><div><span class="st ${i<0?'sx':'s'+i}">${esc(o.status)}</span><div class="dots">${ST.map((s,j)=>`<i class="${j<=i?'on':''}"></i>`).join('')}</div><div class="muted">${fmt(o.whenISO||o.created)}</div></div><div class="acts">${btn}</div></div>`}).join('')}

/* ---------- продавец ---------- */
function sellerView(p){const a=my();
 if(p==='orders')return head('Мои заявки',`${a.length} всего`,'<button class="primary" data-a="new">+ Новая заявка</button>')+`<div class="panel">${rows(a,'s')}</div>`;
 if(p==='profile'){const x=user.auto;return head('Мой магазин',esc(user.email))+`<div class="panel info">${[['Имя',user.name],['Магазин',user.shop],['Адрес',user.address],['Регистрация',dt(user.created)]].map(([k,v])=>`<div><small class="muted">${k}</small><b>${k==='Регистрация'?v:esc(v)}</b></div>`).join('')}</div>
 <div class="panel"><h3>Автозаявки</h3><p class="muted">Заявка создаётся сама на выбранные дни, с теми же количествами, что в вашей последней заявке. Появляются на 7 дней вперёд при каждом входе.</p>
 <div class="chips">${DAYS.map(([n,d])=>`<button class="chip ${x?.days.includes(d)?'on':''}" data-a="day" data-d="${d}">${n}</button>`).join('')}</div>
 <label style="max-width:200px">Время доставки<input class="field" id="atime" type="time" value="${x?.time||'08:00'}"></label>
 <div class="acts"><button class="primary" data-a="autoOn">${x?'Обновить автозаявки':'Включить автозаявки'}</button>${x?'<button class="secondary" data-a="autoOff">Выключить</button>':''}</div></div>`}
 const live=a.filter(o=>LIVE.includes(o.status)),nx=live.slice().sort(byWhen)[0];
 return head(`Здравствуйте, ${esc(user.name)}`,`${esc(user.shop)}, ${esc(user.address)}`,(a[0]?'<button class="secondary" data-a="last">Повторить последнюю</button>':'')+'<button class="primary" data-a="new">+ Новая заявка</button>')
 +`<div class="metrics"><div class="metric y"><small>В работе</small><b>${live.length}</b></div><div class="metric"><small>Ближайшая доставка</small><b>${nx?fmt(nx.whenISO):'—'}</b></div><div class="metric"><small>Товаров заказано</small><b>${a.reduce((s,o)=>s+(o.status==='Отменена'?0:sum(o)),0)}</b></div></div><div class="panel"><h3>Последние заявки</h3>${rows(a.slice(0,5),'s')}</div>`}
function orderForm(src,edit){const d=new Date(Date.now()+864e5),w=edit?src.whenISO:iso(d)+'T08:00';
 modal(edit?'Заявка №'+src.id:'Новая заявка',`<div class="qs">${PRODUCTS.map(([k,n])=>`<div class="qty"><span>${n}</span><div class="stp"><button type="button" data-a="step" data-k="${k}" data-d="-1" aria-label="Меньше">−</button><input class="field" id="q_${k}" type="number" min="0" value="${src?.[k]||0}"><button type="button" data-a="step" data-k="${k}" data-d="1" aria-label="Больше">+</button></div></div>`).join('')}</div>
 <label>Дата и время доставки<input class="field" id="when" type="datetime-local" value="${w}"></label><label>Адрес<input class="field" value="${esc(user.address)}" disabled></label>
 <label>Комментарий<textarea class="field" id="comment" rows="2">${esc(src?.comment||'')}</textarea></label><button class="primary" id="saveOrder">${edit?'Сохранить изменения':'Отправить заявку'}</button>`);
 $('saveOrder').onclick=()=>{const v={};PRODUCTS.forEach(([k])=>v[k]=Math.max(0,parseInt($('q_'+k).value)||0));
  if(!Object.values(v).some(Boolean))return toast('Добавьте хотя бы один товар.');const w2=$('when').value;if(!w2)return toast('Укажите дату и время доставки.');
  const c=$('comment').value.trim();if(edit){Object.assign(src,v,{whenISO:w2,comment:c});act('Изменён заказ №'+src.id,user.email)}else{const o=mk(w2,v,c);db.orders.push(o);act('Создан заказ №'+o.id,user.email)}
  save();closeModal();go(page);toast(edit?'Заявка сохранена':'Заявка отправлена')}}
function autoFill(){const a=user.auto;if(!a)return;let n=0;for(let i=0;i<7;i++){const d=new Date();d.setDate(d.getDate()+i);if(!a.days.includes(d.getDay()))continue;const w=iso(d)+'T'+a.time;
 if(new Date(w)<new Date()||db.orders.some(o=>o.email===user.email&&o.auto&&o.whenISO===w))continue;db.orders.push(mk(w,a.q,'Автозаявка',1));n++}
 if(n){save();act('Автозаявок создано: '+n,user.email)}}

/* ---------- владелец ---------- */
const bars=t=>{const m=Math.max(1,...Object.values(t));return PRODUCTS.map(([k,n])=>`<div class="bar"><span>${n}</span><div><i style="width:${t[k]/m*100}%"></i></div><b>${t[k]}</b></div>`).join('')};
const tbl=l=>`<div class="tw"><table class="table"><thead><tr><th>№</th><th>Магазин</th><th>Адрес</th>${PRODUCTS.map(x=>`<th>${x[1]}</th>`).join('')}<th>Когда</th><th>Статус</th></tr></thead><tbody>${l.map(o=>`<tr><td>${o.id}</td><td>${esc(o.shop)}</td><td>${esc(o.address)}</td>${PRODUCTS.map(([k])=>`<td>${o[k]||0}</td>`).join('')}<td>${fmt(o.whenISO)}</td><td>${esc(o.status)}</td></tr>`).join('')}</tbody></table></div>`;
const groups=()=>{const g={};db.orders.filter(o=>o.status!=='Отменена').sort(byWhen).forEach(o=>(g[o.whenISO.slice(0,10)]??=[]).push(o));return Object.entries(g)};
const sbox=u=>`<div class="sb"><div><b>${esc(u.shop||'—')}</b><div class="muted">${esc(u.name||'—')}, ${esc(u.address||'—')}</div></div><div class="muted">${esc(u.email)}<br>Последний вход: ${dt(u.last)}</div><div class="cnt"><b>${db.orders.filter(o=>o.email===u.email).length}</b><span class="muted">заявок</span></div></div>`;
function ownerView(p){const all=db.orders,live=all.filter(o=>LIVE.includes(o.status)),nw=all.filter(o=>o.status==='Новая').length;
 if(p==='orders')return head('Заявки',`${all.length} всего`,nw?`<button class="primary" data-a="acceptAll">Принять все новые (${nw})</button>`:'')+`<div class="panel"><div class="filters"><input class="field" id="fq" placeholder="Поиск: №, магазин, адрес"><select class="field" id="fs"><option value="">Все статусы</option>${[...ST,'Отменена'].map(s=>`<option>${s}</option>`).join('')}</select></div><div id="ol"></div></div>`;
 if(p==='sum'){const g=groups();return head('Сводка на загрузку','Сколько чего собрать на каждый день — считается автоматически','<button class="secondary" data-a="csv">Скачать CSV</button><button class="primary" data-a="print">Печать A4</button>')
  +(g.map(([d,l])=>{const t=tot(l);return `<section class="panel day"><h3>${dayLabel(d)}<small>заявок: ${l.length}</small></h3><div class="tiles">${PRODUCTS.map(([k,n])=>`<div class="tile ${t[k]?'':'zero'}"><b>${t[k]}</b><span>${n}</span></div>`).join('')}</div>${tbl(l)}</section>`}).join('')||'<div class="empty">Когда появятся заявки, здесь будет готовый список на загрузку.</div>')}
 if(p==='sellers')return head('Продавцы',`${db.users.length} аккаунтов`)+`<div class="panel"><input class="field" id="fq" placeholder="Поиск: имя, магазин, email"><div id="ol"></div></div>`;
 if(p==='log')return head('Активность','Последние 500 событий','<button class="secondary" data-a="backup">Скачать резервную копию</button>')+`<div class="panel">${db.activity.slice().reverse().map(x=>`<div class="log"><div><b>${esc(x.a)}</b><div class="muted">${esc(x.e||'Владелец')}</div></div><span class="muted">${dt(x.t)}</span></div>`).join('')||'<div class="empty">Пока пусто.</div>'}</div>`;
 return head('Обзор','Что происходит прямо сейчас',nw?`<button class="primary" data-a="acceptAll">Принять все новые (${nw})</button>`:'')
 +`<div class="metrics"><div class="metric y"><small>Новых заявок</small><b>${nw}</b></div><div class="metric"><small>В работе</small><b>${live.length}</b></div><div class="metric"><small>Продавцов</small><b>${db.users.length}</b></div><div class="metric"><small>Товаров в работе</small><b>${live.reduce((s,o)=>s+sum(o),0)}</b></div></div>
 <div class="panel"><h3>Нужно собрать</h3>${bars(tot(live))}</div><div class="panel"><h3>Требуют действия</h3>${rows(live.slice().sort(byWhen).slice(0,10),'o')}</div>`}

/* ---------- действия ---------- */
const dlFile=(n,t,m)=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([t],{type:m}));a.download=n;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1e3)};
const A={
 new:()=>orderForm(null,false),last:()=>orderForm(my()[0],false),copy:id=>orderForm(byId(id),false),
 edit:id=>{const o=byId(id);if(o?.status==='Новая')orderForm(o,true)},
 step:(_,b)=>{const i=$('q_'+b.dataset.k);i.value=Math.max(0,(+i.value||0)+ +b.dataset.d)},
 cancel:id=>{const o=byId(id);if(o?.status!=='Новая'||!confirm('Отменить заявку №'+id+'?'))return;o.status='Отменена';act('Отменён заказ №'+id,user.email);save();go(page);toast('Заявка отменена')},
 next:id=>{const o=byId(id),i=ST.indexOf(o?.status);if(i<0||i>2)return;o.status=ST[i+1];act(`Заказ №${id}: ${o.status}`);save();go(page)},
 acceptAll:()=>{const n=db.orders.filter(o=>o.status==='Новая');n.forEach(o=>o.status='Принята');act('Принято заявок: '+n.length);save();go(page);toast('Принято заявок: '+n.length)},
 day:(_,b)=>b.classList.toggle('on'),
 autoOn:()=>{const l=my()[0],days=[...document.querySelectorAll('.chip.on')].map(c=>+c.dataset.d);if(!l)return toast('Сначала создайте одну заявку: по ней будут повторяться следующие.');if(!days.length)return toast('Выберите хотя бы один день недели.');
  user.auto={days,time:$('atime').value||'08:00',q:Object.fromEntries(PRODUCTS.map(([k])=>[k,l[k]||0]))};save();act('Автозаявки включены',user.email);autoFill();go('profile');toast('Автозаявки включены')},
 autoOff:()=>{delete user.auto;save();act('Автозаявки выключены',user.email);go('profile');toast('Автозаявки выключены')},
 backup:()=>dlFile('easy-backup.json',JSON.stringify(db),'application/json'),
 csv:()=>{const cell=c=>{let s=String(c);if(/^[=+\-@]/.test(s))s="'"+s;return `"${s.replace(/"/g,'""')}"`};
  const r=[['№','Магазин','Адрес','Email',...PRODUCTS.map(x=>x[1]),'Дата и время','Статус','Комментарий'],...db.orders.map(o=>[o.id,o.shop,o.address,o.email,...PRODUCTS.map(([k])=>o[k]||0),(o.whenISO||'').replace('T',' '),o.status,o.comment||''])];
  dlFile('easy-orders.csv','\ufeff'+r.map(x=>x.map(cell).join(';')).join('\r\n'),'text/csv')},
 print:()=>{const w=window.open('','_blank');if(!w)return toast('Разрешите всплывающие окна, чтобы открыть печать.');
  w.document.write(`<html><head><title>EASY — сводка</title><style>body{font:12px Arial}table{border-collapse:collapse;width:100%;margin-bottom:14px}th,td{border:1px solid #999;padding:5px;text-align:left}h1{font-size:18px}h2{font-size:14px;margin:14px 0 4px}</style></head><body><h1>EASY — сводка на загрузку</h1>${groups().map(([d,l])=>{const t=tot(l);return `<h2>${dayLabel(d)}: ${PRODUCTS.map(([k,n])=>n+' — '+t[k]).join(', ')}</h2>${tbl(l)}`}).join('')}</body></html>`);w.document.close();w.print()}
};
document.addEventListener('click',e=>{const b=e.target.closest('[data-go],[data-a],[data-close]');if(!b)return;if(b.dataset.go)return go(b.dataset.go);if(b.dataset.a===undefined)return closeModal();const[a,id]=b.dataset.a.split(':');A[a]?.(id,b)});
$('modal').onclick=e=>{if(e.target===$('modal'))closeModal()};document.addEventListener('keydown',e=>{if(e.key==='Escape')closeModal()});
/* синхронизация между вкладками браузера */
addEventListener('storage',e=>{if(e.key!==KEY)return;db=fresh();if(user)user=db.users.find(x=>x.email===user.email)||user;if(!$('shell').classList.contains('hidden')&&$('modal').classList.contains('hidden'))go(page)});
/* восстановление сессии */
if(sessionStorage.getItem('o')){isOwner=true;enter()}else if((user=db.users.find(x=>x.email===sessionStorage.getItem('s'))||null))enter();
