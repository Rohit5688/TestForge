/**
 * Forge Session Viewer — single-file JSONL viewer template.
 * Written to mcp-logs/viewer.html on first session start.
 */
export const VIEWER_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Forge Session Viewer</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:system-ui,sans-serif;background:#f5f5f0;color:#1a1a1a}
    header{background:#1a1a1a;color:#fff;padding:1rem 1.5rem;display:flex;align-items:center;gap:1rem}
    header h1{font-size:1rem;font-weight:500}
    header span{font-size:.8rem;color:#888;margin-left:auto}
    #drop-zone{border:2px dashed #ccc;border-radius:8px;padding:3rem;text-align:center;margin:2rem;cursor:pointer;background:#fff;color:#666}
    #drop-zone.over{border-color:#378add;background:#e6f1fb}
    #stats{display:grid;grid-template-columns:repeat(4,1fr);gap:1rem;padding:0 2rem 1rem}
    .stat{background:#fff;border-radius:8px;padding:1rem;border:.5px solid #ddd}
    .stat-label{font-size:.75rem;color:#888;margin-bottom:.25rem}
    .stat-value{font-size:1.5rem;font-weight:500}
    .stat-value.ok{color:#3b6d11}.stat-value.err{color:#a32d2d}
    #timeline{padding:0 2rem 2rem;display:flex;flex-direction:column;gap:.4rem}
    .event{background:#fff;border-radius:6px;border:.5px solid #e0e0e0;padding:.6rem 1rem;display:grid;grid-template-columns:80px 180px 1fr 70px 80px;gap:.75rem;align-items:center;font-size:.82rem}
    .event.error{border-left:3px solid #e24b4a}.event.success{border-left:3px solid #639922}
    .event.start{border-left:3px solid #378add;opacity:.6}.event.warning{border-left:3px solid #ef9f27}
    .trace{font-family:monospace;font-size:.72rem;color:#888}.time{color:#888;font-size:.72rem}
    .tool{font-weight:500}.dur{text-align:right;color:#888;font-size:.72rem}
    .badge{font-size:.7rem;padding:2px 8px;border-radius:20px;font-weight:500;text-align:center}
    .badge.ok{background:#eaf3de;color:#3b6d11}.badge.err{background:#fcebeb;color:#a32d2d}
    .badge.run{background:#e6f1fb;color:#185fa5}.badge.wrn{background:#faeeda;color:#854f0b}
    #filter-bar{padding:.75rem 2rem;display:flex;gap:.75rem;align-items:center}
    #filter-bar input{flex:1;padding:.4rem .75rem;border:.5px solid #ccc;border-radius:6px;font-size:.85rem}
    #filter-bar select{padding:.4rem .75rem;border:.5px solid #ccc;border-radius:6px;font-size:.85rem}
    .empty{text-align:center;color:#888;padding:3rem;font-size:.9rem}
    details summary{cursor:pointer}
    .detail-row{grid-column:1/-1;background:#f8f8f6;border-radius:4px;padding:.5rem .75rem;font-family:monospace;font-size:.75rem;color:#444;white-space:pre-wrap;word-break:break-all}
  </style>
</head>
<body>
  <header><h1>Forge Session Viewer</h1><span id="file-label">No file loaded</span></header>
  <div id="drop-zone">
    Drop a <code>mcp-logs/*.jsonl</code> file here, or click to browse<br><br>
    <input type="file" id="file-input" accept=".jsonl,.json" style="display:none">
    <button onclick="document.getElementById('file-input').click()" style="margin-top:.5rem;padding:.4rem 1rem;border-radius:6px;border:.5px solid #ccc;cursor:pointer;background:#fff">Browse</button>
  </div>
  <div id="stats" style="display:none">
    <div class="stat"><div class="stat-label">Total tool calls</div><div class="stat-value" id="s-total">0</div></div>
    <div class="stat"><div class="stat-label">Successful</div><div class="stat-value ok" id="s-ok">0</div></div>
    <div class="stat"><div class="stat-label">Errors</div><div class="stat-value err" id="s-err">0</div></div>
    <div class="stat"><div class="stat-label">Avg duration</div><div class="stat-value" id="s-avg">—</div></div>
  </div>
  <div id="filter-bar" style="display:none">
    <input type="text" id="search" placeholder="Filter by tool name or trace ID…">
    <select id="type-filter">
      <option value="">All events</option>
      <option value="tool_end">Completed calls</option>
      <option value="tool_error">Errors only</option>
      <option value="healing">Healing events</option>
    </select>
  </div>
  <div id="timeline"></div>
  <script>
    let allEvents=[];
    const dz=document.getElementById('drop-zone');
    dz.addEventListener('dragover',e=>{e.preventDefault();dz.classList.add('over')});
    dz.addEventListener('dragleave',()=>dz.classList.remove('over'));
    dz.addEventListener('drop',e=>{e.preventDefault();dz.classList.remove('over');loadFile(e.dataTransfer.files[0])});
    document.getElementById('file-input').addEventListener('change',e=>{if(e.target.files[0])loadFile(e.target.files[0])});
    document.getElementById('search').addEventListener('input',render);
    document.getElementById('type-filter').addEventListener('change',render);
    function loadFile(file){
      document.getElementById('file-label').textContent=file.name;
      const reader=new FileReader();
      reader.onload=e=>{
        allEvents=e.target.result.split('\\n').filter(l=>l.trim()).map(l=>{try{return JSON.parse(l)}catch{return null}}).filter(Boolean);
        document.getElementById('drop-zone').style.display='none';
        document.getElementById('stats').style.display='grid';
        document.getElementById('filter-bar').style.display='flex';
        updateStats();render();
      };
      reader.readAsText(file);
    }
    function updateStats(){
      const ends=allEvents.filter(e=>e.type==='tool_end');
      const errors=allEvents.filter(e=>e.type==='tool_error');
      const ok=ends.filter(e=>e.success);
      const avgMs=ends.length?Math.round(ends.reduce((s,e)=>s+(e.durationMs||0),0)/ends.length):0;
      document.getElementById('s-total').textContent=ends.length+errors.length;
      document.getElementById('s-ok').textContent=ok.length;
      document.getElementById('s-err').textContent=errors.length;
      document.getElementById('s-avg').textContent=avgMs?avgMs+'ms':'—';
    }
    function render(){
      const search=document.getElementById('search').value.toLowerCase();
      const type=document.getElementById('type-filter').value;
      let events=allEvents.filter(e=>{
        if(type==='tool_end'&&e.type!=='tool_end')return false;
        if(type==='tool_error'&&e.type!=='tool_error')return false;
        if(type==='healing'&&!e.type?.includes('heal'))return false;
        if(search&&!e.tool?.toLowerCase().includes(search)&&!e.traceId?.toLowerCase().includes(search))return false;
        return true;
      });
      const tl=document.getElementById('timeline');
      if(events.length===0){tl.innerHTML='<div class="empty">No events match the current filter.</div>';return;}
      tl.innerHTML=events.map(ev=>{
        const time=ev.timestamp?new Date(ev.timestamp).toLocaleTimeString():'—';
        const trace=ev.traceId?.slice(0,8)??'—';
        const tool=ev.tool??ev.type??'—';
        const dur=ev.durationMs!=null?ev.durationMs+'ms':'';
        let cls='event start',badge='<span class="badge run">running</span>',detail='';
        if(ev.type==='tool_end'){cls=ev.success?'event success':'event error';badge=ev.success?'<span class="badge ok">ok</span>':'<span class="badge err">failed</span>';if(ev.outputSummary)detail=JSON.stringify(ev.outputSummary,null,2);}
        else if(ev.type==='tool_error'){cls='event error';badge='<span class="badge err">error</span>';detail=ev.errorMessage??'';}
        else if(ev.type==='warning'){cls='event warning';badge='<span class="badge wrn">warning</span>';detail=ev.message??'';}
        const detailHtml = detail ? \`<details><summary style="font-size:.72rem;color:#888">details</summary><div class="detail-row">\${detail.replace(/</g, '&lt;')}</div></details>\` : '';
        return \`<div class="\${cls}"><span class="time">\${time}</span><span class="trace">\${trace}</span><span class="tool">\${tool}\${detailHtml}</span><span class="dur">\${dur}</span>\${badge}</div>\`;
      }).join('');
    }
  </script>
</body>
</html>`;
