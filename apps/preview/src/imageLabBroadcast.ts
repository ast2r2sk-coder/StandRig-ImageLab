import './imageLabBroadcast.css';
export function installBroadcast(){
 const controls=document.createElement('div');controls.id='broadcastControls';controls.innerHTML='<button id="broadcastToggle" aria-pressed="false">방송 화면</button><label>배경 <select id="broadcastBackground"><option value="dark">다크</option><option value="green">크로마 그린</option><option value="transparent">투명 (캡처 지원 필요)</option></select></label><button id="micStart">마이크 시작</button><button id="micStop">마이크 정지</button><label>감도 <input id="micSensitivity" type="range" min="0.25" max="4" step="0.25" value="1"></label><p>시작 클릭 시 마이크 권한 요청 · 녹음/업로드/모니터 재생 없음</p><p id="micStatus" role="status">마이크 꺼짐 · Esc로 편집 복원</p>';
 document.body.append(controls);
 const toggle=document.getElementById('broadcastToggle')!;
 function set(on:boolean){document.documentElement.classList.toggle('broadcast',on);toggle.setAttribute('aria-pressed',String(on));toggle.textContent=on?'편집 복원 (Esc)':'방송 화면';if(on)(document.activeElement as HTMLElement|null)?.blur();else toggle.focus();}
 toggle.addEventListener('click',()=>set(!document.documentElement.classList.contains('broadcast')));
 document.addEventListener('keydown',e=>{if(e.key==='Escape')set(false);});
 document.getElementById('broadcastBackground')!.addEventListener('change',e=>{const v=(e.target as HTMLSelectElement).value;document.documentElement.style.setProperty('--broadcast-bg',v==='green'?'#00ff00':v==='transparent'?'transparent':'#111917');});
}
