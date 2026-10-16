/* Forma Studio v2 — interação de protótipo, sem backend, DWG ou Three.js */
(() => {
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const roomSuggestions = ['Sala de estar', 'Cozinha', 'Quarto', 'Escritório', 'Banheiro', 'Garagem', 'Área de serviço', 'Quintal'];
  const roomNames = ['Sala de estar', 'Sala de jantar', 'Cozinha', 'Quarto', 'Suíte', 'Banheiro', 'Escritório', 'Área de serviço', 'Garagem', 'Varanda', 'Quintal', 'Deck', 'Hall', 'Closet', 'Lavabo', 'Home theater', 'Jardim', 'Depósito', 'Outro'];
  const assets = [
    { name: 'Sofá de linho', cat: 'Sala', icon: '🛋️', unit: 3290 },
    { name: 'Mesa lateral', cat: 'Sala', icon: '🪵', unit: 480 },
    { name: 'Planta ornamental', cat: 'Sala', icon: '🪴', unit: 160 },
    { name: 'Poltrona', cat: 'Sala', icon: '🪑', unit: 980 },
    { name: 'Cama de casal', cat: 'Quarto', icon: '🛏️', unit: 2890 },
    { name: 'Criado-mudo', cat: 'Quarto', icon: '🛋', unit: 490 },
    { name: 'Bancada de cozinha', cat: 'Cozinha', icon: '▱', unit: 2350 },
    { name: 'Armário planejado', cat: 'Cozinha', icon: '▥', unit: 4400 }
  ];
  const state = {
    view: 'home', step: 'step-styles', layout: 'cad', source: 'dwg', manualEmpty: false,
    rooms: Array(8).fill(''), selected: 'Parede da sala', selectedKind: 'wall', material: 'Off-white',
    time: 16, chosenAssets: [], showroomModified: false, enabledEditor: false
  };
  const flow = ['step-styles', 'step-feel', 'step-source', 'step-upload'];
  let loadingTimer, toastTimer;
  function toast(message) {
    const el = $('#toast'); el.textContent = message; el.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 3500);
  }
  function scrollTop() { window.scrollTo({ top: 0, behavior: 'instant' }); }
  function go(id) {
    clearTimeout(loadingTimer);
    const group = flow.includes(id) ? 'flow' : id === 'loading' ? 'loading' : id === 'workspace' ? 'workspace' : 'home';
    state.view = group;
    $$('body > .page').forEach(el => el.classList.toggle('active', el.id === group));
    document.body.dataset.view = group;
    if (group === 'flow') setStep(id);
    if (group === 'loading') {
      loadingTimer = setTimeout(() => { if (state.view === 'loading') { setLayout('cad'); go('workspace'); } }, 2450);
    }
    if (group === 'workspace') syncWorkspace();
    scrollTop();
  }
  function setStep(id) {
    state.step = id;
    $$('.flow-panel').forEach(el => el.classList.toggle('active', el.id === id));
    const index = flow.indexOf(id);
    $$('.flow-steps button').forEach((button, i) => {
      button.classList.toggle('active', i === index);
      button.classList.toggle('done', i < index);
      button.setAttribute('aria-current', i === index ? 'step' : 'false');
    });
    $('#flowProgressBar').style.width = `${(index + 1) * 25}%`;
    $('#flowProgressText').textContent = `ETAPA 0${index + 1} DE 04`;
  }
  function back() {
    const index = flow.indexOf(state.step);
    if (index <= 0) go('home'); else go(flow[index - 1]);
  }
  $$('#flowBack').forEach(el => el.addEventListener('click', back));
  $$('[data-goto]').forEach(el => el.addEventListener('click', e => { e.preventDefault(); go(el.dataset.goto); }));
  $$('.flow-steps button').forEach(btn => btn.addEventListener('click', () => {
    // Navegação livre entre perguntas já visitadas, para revisão do briefing.
    if (flow.indexOf(btn.dataset.step) <= flow.indexOf(state.step)) go(btn.dataset.step);
    else toast('Continue pelas próximas perguntas para liberar essa etapa.');
  }));
  $('#sourceDWG').addEventListener('click', () => {
    state.source = 'dwg'; $('#dwgZone').hidden = false; $('#roomplanPreview').hidden = true;
    $('#uploadTitle').innerHTML = 'Tudo começa<br><em>com um desenho.</em>';
    $('#uploadIntro').textContent = 'Selecione seu arquivo DWG para começar.';
    go('step-upload');
  });
  $('#sourceRoomPlan').addEventListener('click', () => {
    state.source = 'roomplan'; $('#dwgZone').hidden = true; $('#roomplanPreview').hidden = false;
    $('#uploadTitle').innerHTML = 'Em breve, sua casa<br><em>pelo iPhone.</em>';
    $('#uploadIntro').textContent = 'Prévia do caminho RoomPlan — ainda não disponível.';
    go('step-upload');
  });
  $('#dwgInput').addEventListener('change', e => {
    const file = e.target.files?.[0]; if (file) $('#uploadFileName').textContent = `Selecionado: ${file.name} · demonstração visual`;
  });
  $('#beginLoading').addEventListener('click', () => { state.manualEmpty = false; clearRooms(); go('loading'); });
  $('#skipLoading').addEventListener('click', () => { state.manualEmpty = false; setLayout('cad'); go('workspace'); });
  $('#exploreDemo').addEventListener('click', () => {
    state.rooms = [...roomSuggestions]; state.manualEmpty = false; state.chosenAssets = [{ ...assets[0], quantity: 1 }];
    renderRooms(); setLayout('interior'); go('workspace'); toast('Você está explorando uma cena demonstrativa.');
  });

  const roomEditor = $('#roomEditor');
  function renderRooms() {
    roomEditor.innerHTML = '';
    state.rooms.forEach((name, i) => {
      const row = document.createElement('div'); row.className = `room-field ${name ? '' : 'pending'}`;
      const options = [...new Set([name, ...roomNames].filter(Boolean))];
      row.innerHTML = `<span class="room-index">${String(i+1).padStart(2, '0')}</span><label><span>AMBIENTE ${String(i+1).padStart(2, '0')}</span><select data-room="${i}" aria-label="Tipo do ambiente ${i+1}"><option value="">Selecionar cômodo...</option>${options.map(o => `<option value="${escapeHtml(o)}" ${o===name?'selected':''}>${escapeHtml(o)}</option>`).join('')}</select></label>`;
      roomEditor.append(row);
    });
    updateRooms();
  }
  function updateRooms() {
    const count = state.rooms.filter(Boolean).length;
    $('#namedCount').textContent = `${count}/8`;
    $('#finishRooms').disabled = count < 8;
    $('#viewFirst').disabled = !(count === 8 || state.manualEmpty);
    $('#viewFirst').title = $('#viewFirst').disabled ? 'Nomeie os cômodos para continuar' : 'Entrar em primeira pessoa';
    $$('[data-room-label]').forEach((label, i) => {
      const name = state.rooms[i];
      label.textContent = name ? name.toUpperCase().slice(0, 20) : `AMBIENTE ${String(i+1).padStart(2, '0')}`;
      label.setAttribute('fill', name ? '#365e43' : '#879a89');
    });
  }
  roomEditor.addEventListener('change', event => {
    if (!event.target.matches('select[data-room]')) return;
    state.rooms[Number(event.target.dataset.room)] = event.target.value;
    event.target.closest('.room-field').classList.toggle('pending', !event.target.value);
    updateRooms();
  });
  function clearRooms() { state.rooms = Array(8).fill(''); renderRooms(); }
  $('#autoName').addEventListener('click', () => { state.rooms = [...roomSuggestions]; renderRooms(); toast('Sugestões aplicadas. Você pode alterar cada ambiente.'); });
  $('#finishRooms').addEventListener('click', () => { if (state.rooms.every(Boolean)) { state.manualEmpty=false; setLayout('interior'); } });
  $('#manualEmpty').addEventListener('click', () => { state.manualEmpty=true; updateRooms(); setLayout('interior'); toast('Modo manual: comece com os ambientes vazios.'); });
  $('#viewCAD').addEventListener('click', () => setLayout('cad'));
  $('#viewFirst').addEventListener('click', () => { if (!$('#viewFirst').disabled) setLayout('interior'); });
  function setLayout(mode) {
    state.layout = mode; $('#workspace').dataset.mode = mode;
    $('#viewCAD').classList.toggle('active', mode === 'cad'); $('#viewFirst').classList.toggle('active', mode === 'interior');
    $('#sidebarCAD').hidden = mode !== 'cad'; $('#sidebarInterior').hidden = mode !== 'interior';
    $('#cadCanvas').hidden = mode !== 'cad'; $('#interiorCanvas').hidden = mode !== 'interior';
    $('#cadInfo').hidden = mode !== 'cad'; $('#interiorInfo').hidden = mode !== 'interior';
    $('#contextSide').hidden = true;
    $('#emptyIllustration').hidden = !(mode === 'interior' && state.manualEmpty);
  }
  function syncWorkspace() { updateRooms(); setLayout(state.layout); }
  $('#recenterView').addEventListener('click', () => toast('Vista centralizada (demonstração).'));
  $('#canvasGrid').addEventListener('click', () => { $('#cadCanvas').classList.toggle('gridless'); toast('Grade alterada (prévia).'); });

  // Editor de interiores: apenas seleção e feedback; não altera geometrias reais.
  function selectElement(name, kind) {
    state.selected = name; state.selectedKind = kind;
    $('#selectedElement').textContent = name;
    $('#selectedElementType').textContent = kind === 'wall' ? 'Parede selecionada' : kind === 'floor' ? 'Piso selecionado' : 'Objeto selecionado';
    $('#contextSide').hidden = false;
    toast(`${name} selecionado.`);
  }
  $$('.interest-point').forEach(b => b.addEventListener('click', () => selectElement(b.dataset.point, b.classList.contains('interest-wall') ? 'wall' : b.classList.contains('interest-floor') ? 'floor' : 'object')));
  $('#selectWalls').addEventListener('click', () => selectElement('Parede da sala', 'wall'));
  $('#selectFloor').addEventListener('click', () => selectElement('Piso da sala', 'floor'));
  $('#selectObjects').addEventListener('click', () => selectElement('Sofá', 'object'));
  $('#editSelected').addEventListener('click', () => { $('#contextSide').hidden = false; $('#aiPrompt').focus(); });
  $('#moveSelected').addEventListener('click', () => toast('Mover objetos por arraste estará disponível com a cena Three.js.'));
  $('#deleteSelected').addEventListener('click', () => {
    if (state.selectedKind === 'object') {
      const idx = state.chosenAssets.findIndex(item => state.selected.toLowerCase().includes(item.name.split(' ')[0].toLowerCase()));
      if (idx >= 0) state.chosenAssets.splice(idx,1);
      toast('Objeto removido da lista de demonstração.');
    } else toast('Para excluir pisos e paredes será necessária confirmação no editor 3D.');
  });
  $$('.swatch').forEach(btn => btn.addEventListener('click', () => {
    $$('.swatch').forEach(el => el.classList.toggle('selected',el===btn));
    state.material=btn.dataset.material; $('#materialLabel').textContent=state.material;
    toast(`Acabamento selecionado: ${state.material} (prévia).`);
  }));
  $('#contextClose').addEventListener('click', () => $('#contextSide').hidden = true);
  $$('.prompt-suggestions button').forEach(btn => btn.addEventListener('click', () => {$('#aiPrompt').value=btn.dataset.example;$('#aiPrompt').focus();}));
  $('#applyAI').addEventListener('click', () => {
    if (!$('#aiPrompt').value.trim()) return toast('Descreva a alteração desejada.');
    toast('Comando registrado! A aplicação com IA será integrada futuramente.');
    state.showroomModified=true;
  });
  $('#timeTool').addEventListener('click', () => $('#timePopover').hidden = !$('#timePopover').hidden);
  $('#timeRange').addEventListener('input', event => {
    state.time=Number(event.target.value);
    $('#timeLabel').textContent=`${String(state.time).padStart(2,'0')}:00 · ${state.time<11?'Manhã':state.time<16?'Tarde':state.time<19?'Fim de tarde':'Noite'}`;
    $('#dayOverlay').style.setProperty('--night', state.time < 8 || state.time > 18 ? '.49' : state.time > 16 ? '.19' : '.03');
  });
  $('#assetsToggle').addEventListener('click', () => { const el=$('#assetLibrary');el.hidden=!el.hidden;if(!el.hidden)renderAssets('Todos'); });
  $$('.asset-filters button').forEach(btn => btn.addEventListener('click', () => {
    $$('.asset-filters button').forEach(b=>b.classList.toggle('selected',b===btn));
    renderAssets(btn.dataset.assetFilter);
  }));
  function renderAssets(cat) {
    const grid=$('#assetGrid');grid.innerHTML='';
    assets.filter(item=>cat==='Todos'||item.cat===cat).forEach(item=>{
      const btn=document.createElement('button');btn.className='asset-item';btn.innerHTML=`<span class="asset-emoji">${item.icon}</span><small>${escapeHtml(item.name)}</small>`;
      btn.addEventListener('click',()=>{
        const existing=state.chosenAssets.find(a=>a.name===item.name);
        if(existing) existing.quantity++; else state.chosenAssets.push({...item,quantity:1});
        state.selected=item.name;state.selectedKind='object';
        $('#selectedElement').textContent=item.name;$('#selectedElementType').textContent='Asset adicionado';
        toast(`${item.name} adicionado à lista. Renderização 3D virá depois.`);
      });grid.append(btn);
    });
  }
  function escapeHtml(s) {return String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');}
  // Modais e CSV apenas para demonstração de quantitativos.
  function showPhoto() { $('#photoModal').hidden=false; }
  $('#photoOpen').addEventListener('click',showPhoto);
  function budgetItems() {
    const base = [
      { name:'Tinta acrílica (parede)', quantity:'18 L (exemplo)', cost:380, store:'A definir' },
      { name:'Piso porcelanato', quantity:'24 m² (exemplo)', cost:2880, store:'A definir' },
    ];
    state.chosenAssets.forEach(a=>base.push({name:a.name,quantity:`${a.quantity} un.`,cost:a.unit*a.quantity,store:'A definir'}));
    return base;
  }
  const brl=n=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(n);
  function showBudget() {
    const rows=budgetItems(), body=$('#budgetTableBody');body.innerHTML='';
    rows.forEach(r=>{const tr=document.createElement('tr');[r.name,r.quantity,brl(r.cost),r.store].forEach(v=>{const td=document.createElement('td');td.textContent=v;tr.append(td);});body.append(tr);});
    $('#budgetTotal').textContent=brl(rows.reduce((total,r)=>total+r.cost,0));
    $('#budgetModal').hidden=false;
  }
  $('#exportTop').addEventListener('click',showBudget);
  $('#exportSide').addEventListener('click',showBudget);
  $$('[data-close]').forEach(el=>el.addEventListener('click',()=>{el.closest('.modal-shell').hidden=true;}));
  window.addEventListener('keydown',e=>{if(e.key==='Escape')$$('.modal-shell').forEach(el=>el.hidden=true);});
  $('#downloadBudget').addEventListener('click',()=>{
    const rows=budgetItems(), quote=s=>'"'+String(s).replaceAll('"','""')+'"';
    const csv='\ufeff'+[['Item','Quantidade','Valor estimado (R$)','Onde comprar'],...rows.map(r=>[r.name,r.quantity,r.cost.toFixed(2).replace('.',','),r.store])].map(row=>row.map(quote).join(';')).join('\r\n');
    const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8;'}));
    const a=document.createElement('a');a.href=url;a.download='forma-studio-orcamento-demonstrativo.csv';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);
    toast('CSV demonstrativo exportado. Não representa orçamento real.');
  });

  // Movimento visual da hero: responde ao mouse e ao scroll; respeita reduced motion.
  const stage=$('.hero-stage'), track=$('#heroTrack');
  const reduceMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!reduceMotion) {
    stage.addEventListener('pointermove', event => {
      const rect=stage.getBoundingClientRect(), cx=rect.left+rect.width/2,cy=rect.top+rect.height/2;
      stage.style.setProperty('--mx',`${Math.round((event.clientX-cx)/rect.width*35)}px`);
      stage.style.setProperty('--my',`${Math.round((event.clientY-cy)/rect.height*35)}px`);
    });
    stage.addEventListener('pointerleave',()=>{stage.style.setProperty('--mx','0px');stage.style.setProperty('--my','0px');});
    let raf=0;
    window.addEventListener('scroll',()=>{
      if(state.view!=='home'||raf) return;
      raf=requestAnimationFrame(()=>{
        const progress=Math.max(0,Math.min(1,window.scrollY/(track.offsetHeight-innerHeight || 1)));
        stage.style.setProperty('--scroll',String(Math.round(progress*135)));
        raf=0;
      });
    },{passive:true});
  }
  renderRooms();renderAssets('Todos');go('home');
})();
