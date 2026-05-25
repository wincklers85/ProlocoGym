(async function(){
  try{
    const r = await fetch('/api/public/settings');
    const j = await r.json();
    if(!j.ok) return;
    const s = j.settings || {};
    document.documentElement.setAttribute('data-theme', s.theme || 'clean-light');
    document.querySelectorAll('[data-logo-text]').forEach(e=>e.textContent=s.logo_text||'PG');
    document.querySelectorAll('[data-gym-name]').forEach(e=>e.textContent=s.gym_name||'Palestra Proloco');
    document.querySelectorAll('[data-public-message]').forEach(e=>e.textContent=s.public_message||'');
    document.querySelectorAll('[data-hours]').forEach(e=>e.textContent=`${s.allowed_from||'06:00'} - ${s.allowed_to||'23:00'}`);
  }catch(e){}
})();
