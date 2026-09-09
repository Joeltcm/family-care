type ClinicalSnapshot = {
  expiresAt: string;
  patient: { name: string; birthDate: string | null; bloodType: string | null; emergencySummary: string | null };
  conditions: Array<Record<string, unknown>>;
  medications: Array<Record<string, unknown>>;
  encounters: Array<Record<string, unknown>>;
  appointments: Array<Record<string, unknown>>;
  labs: Array<Record<string, unknown>>;
};

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function date(value: unknown, includeTime = false) {
  if (!value) return 'No registrado';
  const raw = String(value);
  const parsed = new Date(!includeTime && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw + 'T12:00:00Z' : raw);
  if (Number.isNaN(parsed.getTime())) return escapeHtml(value);
  return new Intl.DateTimeFormat('es-PA', includeTime
    ? { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Panama' }
    : { dateStyle: 'medium', timeZone: 'America/Panama' }).format(parsed);
}

function page(title: string, content: string, script = '') {
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)} · Family Care</title>
<style>
:root{--navy:#173947;--teal:#0b7d76;--muted:#61767d;--line:#dde9e6;--soft:#eff8f6}
*{box-sizing:border-box}body{margin:0;background:#f4f8f7;color:var(--navy);font:14px/1.55 Inter,system-ui,-apple-system,sans-serif}
main{width:min(940px,calc(100% - 28px));margin:34px auto}.brand{display:flex;align-items:center;gap:12px;margin-bottom:22px}
.mark{display:grid;width:42px;height:42px;place-items:center;border-radius:13px;background:linear-gradient(145deg,#123e4d,#0b7d76);color:#fff;font-weight:900}
.brand strong{display:block}.brand small{color:var(--muted)}.card{border:1px solid var(--line);border-radius:20px;padding:24px;background:#fff;box-shadow:0 14px 45px #143c4810}
h1{margin:0 0 8px;font-size:28px;letter-spacing:-.035em}h2{margin:0 0 12px;font-size:16px}p{color:var(--muted)}
.notice{border-radius:12px;padding:12px 14px;background:#fff8e9;color:#765a29;font-size:12px}.gate{width:min(470px,100%);margin:8vh auto}
label{display:block;margin:20px 0 7px;font-size:12px;font-weight:800}input{width:100%;border:1px solid #cadbd7;border-radius:12px;padding:13px;font-size:22px;letter-spacing:.3em;text-align:center}
button{border:0;border-radius:12px;padding:12px 16px;background:var(--teal);color:#fff;font-weight:800;cursor:pointer}.gate button{width:100%;margin-top:12px}
.error{min-height:20px;color:#b1463b;font-size:12px}.toolbar{display:flex;justify-content:space-between;gap:12px;align-items:center;margin-bottom:18px}
.toolbar p{margin:0;font-size:11px}.hero{display:grid;grid-template-columns:1fr auto;gap:20px;border-bottom:1px solid var(--line);padding-bottom:20px}
.facts{display:flex;gap:22px}.fact{font-size:11px;color:var(--muted)}.fact strong{display:block;color:var(--navy);font-size:13px}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:16px}.section{break-inside:avoid}.section.full{grid-column:1/-1}
.section h2{border-bottom:1px solid var(--line);padding-bottom:8px}.item{border-bottom:1px solid #edf3f1;padding:9px 0}.item:last-child{border:0}
.item strong{display:block}.item span,.empty{color:var(--muted);font-size:12px}.lab{display:grid;grid-template-columns:1.2fr .8fr .7fr;gap:8px;border-bottom:1px solid #edf3f1;padding:7px 0;font-size:12px}
.footer{margin:22px 0;color:#71858b;font-size:10px;text-align:center}
@media(max-width:650px){.grid,.hero{grid-template-columns:1fr}.facts{flex-wrap:wrap}.toolbar{align-items:flex-start;flex-direction:column}.toolbar button{width:100%}}
@media print{body{background:#fff;font-size:11px}main{width:100%;margin:0}.brand{margin-bottom:12px}.card{border:0;border-radius:0;padding:0;box-shadow:none}.no-print{display:none!important}.grid{gap:12px}.section{border:1px solid var(--line);border-radius:10px;padding:12px}@page{size:A4;margin:14mm}}
</style></head><body><main><div class="brand"><span class="mark">FC</span><span><strong>Family Care</strong><small>Expediente médico compartido</small></span></div>${content}<p class="footer">Documento de consulta · Verifique la información con el paciente y sus fuentes clínicas originales.</p></main>${script}</body></html>`;
}

export function renderShareGate(available: boolean, expiresAt?: string, message?: string) {
  if (!available) {
    return page('Enlace no disponible', `<section class="card gate"><h1>Enlace no disponible</h1><p>Este enlace caducó, fue revocado o se bloqueó por seguridad.</p></section>`);
  }
  return page('Acceso médico', `<section class="card gate"><p class="notice">Acceso temporal y de solo lectura. Solicite al paciente el PIN por un canal separado.</p><h1>Revisar expediente</h1><p>Disponible hasta ${escapeHtml(date(expiresAt, true))}.</p><form id="pin-form"><label for="pin">PIN de 6 dígitos</label><input id="pin" name="pin" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" required><p class="error" id="error">${escapeHtml(message)}</p><button type="submit">Abrir expediente</button></form></section>`,
    `<script>const form=document.getElementById('pin-form');form.addEventListener('submit',async(e)=>{e.preventDefault();const button=form.querySelector('button');const error=document.getElementById('error');button.disabled=true;error.textContent='Verificando…';try{const response=await fetch(location.pathname,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({pin:form.pin.value})});const html=await response.text();document.open();document.write(html);document.close()}catch{error.textContent='No fue posible verificar el acceso.';button.disabled=false}})</script>`);
}

function items(rows: Array<Record<string, unknown>>, render: (row: Record<string, unknown>) => string) {
  return rows.length ? rows.map(render).join('') : '<p class="empty">Sin registros incluidos.</p>';
}

export function renderClinicalRecord(snapshot: ClinicalSnapshot) {
  const p = snapshot.patient;
  const content = `<div class="toolbar no-print"><p>Solo lectura · Caduca ${escapeHtml(date(snapshot.expiresAt, true))}</p><button onclick="window.print()">Imprimir / Guardar como PDF</button></div>
  <section class="card"><header class="hero"><div><p>RESUMEN CLÍNICO</p><h1>${escapeHtml(p.name)}</h1><p>${escapeHtml(p.emergencySummary || 'Sin resumen de emergencia registrado.')}</p></div><div class="facts"><span class="fact">Nacimiento<strong>${escapeHtml(date(p.birthDate))}</strong></span><span class="fact">Grupo sanguíneo<strong>${escapeHtml(p.bloodType || 'No registrado')}</strong></span></div></header>
  <div class="grid">
    <section class="section"><h2>Condiciones activas</h2>${items(snapshot.conditions, row => `<div class="item"><strong>${escapeHtml(row.name)}</strong><span>Desde ${escapeHtml(date(row.onset_date))}${row.notes ? ' · ' + escapeHtml(row.notes) : ''}</span></div>`)}</section>
    <section class="section"><h2>Medicamentos activos</h2>${items(snapshot.medications, row => `<div class="item"><strong>${escapeHtml(row.name)} ${escapeHtml(row.dose_text)}</strong><span>${escapeHtml(row.instructions || row.route || 'Indicaciones no registradas')}</span></div>`)}</section>
    <section class="section full"><h2>Atenciones recientes</h2>${items(snapshot.encounters, row => `<div class="item"><strong>${escapeHtml(row.encounter_type)} · ${escapeHtml(row.specialty || 'Especialidad no registrada')}</strong><span>${escapeHtml(date(row.occurred_at, true))} · ${escapeHtml(row.practitioner_name || row.facility_name || '')}</span><span>${escapeHtml(row.summary || row.reason || '')}</span></div>`)}</section>
    <section class="section"><h2>Citas</h2>${items(snapshot.appointments, row => `<div class="item"><strong>${escapeHtml(row.specialty || row.reason || 'Cita médica')}</strong><span>${escapeHtml(date(row.starts_at, true))} · ${escapeHtml(row.status)}</span></div>`)}</section>
    <section class="section"><h2>Resultados de laboratorio</h2>${items(snapshot.labs, row => `<div class="lab"><strong>${escapeHtml(row.analyte_name)}</strong><span>${escapeHtml(row.value_numeric ?? row.value_text ?? '—')} ${escapeHtml(row.unit)}</span><span>${escapeHtml(date(row.collected_at))}</span></div>`)}</section>
  </div></section>`;
  return page('Expediente de ' + p.name, content);
}
