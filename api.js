// =====================================================
// api.js — Logica backend condivisa per InkBooks
// =====================================================

// Configurazione Supabase
const SUPABASE_URL      = 'https://aoimnqtvdaczkrlfftzi.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFvaW1ucXR2ZGFjemtybGZmdHppIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg3MDU0MjQsImV4cCI6MjA5NDI4MTQyNH0.GRkHzm0qWvUpYnFEt4YvLKMlwolWTOQLc0argntr7gk';

const { createClient } = supabase;
const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// =====================================================
// STATO GLOBALE
// =====================================================
let currentUser    = null;
let userProfile    = null;
let STUDIO_PCT     = 0;
let TAX_PCT        = 0;
let entrate        = [];
let uscite         = [];
let appuntamenti   = [];
let currentYear, currentMonth, selectedDay;
let _pendingEmail  = '';
let speseRicorrenti = [], eccezioniRicorrenti = [];

const MONTHS       = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];
const MONTHS_SHORT = ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic'];

// =====================================================
// INIZIALIZZAZIONE DATA (da chiamare all'avvio)
// =====================================================
function initDateState() {
  const now = new Date();
  currentYear  = now.getFullYear();
  currentMonth = now.getMonth();
  selectedDay  = now.getDate();
}

// =====================================================
// FUNZIONI DI UTILITÀ
// =====================================================
function fmtDate(y, m, d) {
  return `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
}
function dayStr(d) {
  return fmtDate(currentYear, currentMonth + 1, d);
}
function monthRange() {
  const lastDay = new Date(currentYear, currentMonth + 1, 0).getDate();
  return {
    start: fmtDate(currentYear, currentMonth + 1, 1),
    end:   fmtDate(currentYear, currentMonth + 1, lastDay)
  };
}
function fmtItDate(isoStr) {
  if (!isoStr) return '';
  const [y, m, d] = isoStr.split('-');
  return `${d}/${m}/${y}`;
}
function parseItDate(str) {
  const m = (str || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  const d = new Date(+yyyy, +mm - 1, +dd);
  if (d.getFullYear() !== +yyyy || d.getMonth() !== +mm - 1 || d.getDate() !== +dd) return null;
  return `${yyyy}-${mm.padStart(2,'0')}-${dd.padStart(2,'0')}`;
}
function getTzOffset() {
  const off = -new Date().getTimezoneOffset();
  const sign = off >= 0 ? '+' : '-';
  const abs = Math.abs(off);
  return sign + String(Math.floor(abs / 60)).padStart(2,'0') + ':' + String(abs % 60).padStart(2,'0');
}
function isUtcMidnight(data_ora) {
  if (!data_ora) return true;
  const d = new Date(data_ora);
  return d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0;
}
let _toastTimer;
function showToast(msg) {
  const t = document.getElementById('toast');
  if (!t) return console.log(msg);
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => t.classList.remove('show'), 2500);
}

// =====================================================
// AUTENTICAZIONE
// =====================================================
function setAuthError(msg) {
  const el = document.getElementById('auth-error');
  if (!el) return;
  el.textContent = msg;
  el.style.display = msg ? 'block' : 'none';
}

async function doLogin() {
  const email = document.getElementById('login-email').value.trim();
  const pass  = document.getElementById('login-password').value;
  if (!email || !pass) return setAuthError('Inserisci email e password.');
  const btn = document.getElementById('btn-login');
  btn.textContent = 'Accesso...'; btn.disabled = true;
  const { error } = await sb.auth.signInWithPassword({ email, password: pass });
  btn.textContent = 'Accedi'; btn.disabled = false;
  if (error) setAuthError(error.message === 'Invalid login credentials' ? 'Email o password errati.' : error.message);
}

async function doRegister() {
  const email = document.getElementById('reg-email').value.trim();
  const pass  = document.getElementById('reg-password').value;
  if (!email || !pass) return setAuthError('Inserisci email e password.');
  if (pass.length < 6)  return setAuthError('Password di almeno 6 caratteri.');
  const btn = document.getElementById('btn-register');
  btn.textContent = 'Creazione...'; btn.disabled = true;
  const { error } = await sb.auth.signUp({ email, password: pass });
  btn.textContent = 'Crea account'; btn.disabled = false;
  if (error) { setAuthError(error.message); return; }
  _pendingEmail = email;
  const verifyEmailDisplay = document.getElementById('verify-email-display');
  if (verifyEmailDisplay) verifyEmailDisplay.textContent = email;
  const formRegister = document.getElementById('form-register');
  const formVerify = document.getElementById('form-verify');
  const authSwitchReg = document.getElementById('auth-switch-reg');
  if (formRegister) formRegister.style.display = 'none';
  if (authSwitchReg) authSwitchReg.style.display = 'none';
  if (formVerify) formVerify.style.display = 'block';
  const verifyCodeInput = document.getElementById('verify-code');
  if (verifyCodeInput) verifyCodeInput.focus();
  setAuthError('');
}

async function doVerifyCode() {
  const code = document.getElementById('verify-code').value.trim().replace(/\D/g, '');
  if (code.length !== 8) return setAuthError('Inserisci il codice a 8 cifre.');
  const email = _pendingEmail || sessionStorage.getItem('_pendingEmail') || '';
  if (!email) return setAuthError('Sessione scaduta. Ricarica la pagina e registrati di nuovo.');
  const btn = document.getElementById('btn-verify');
  btn.textContent = 'Verifica...'; btn.disabled = true;
  const { error } = await sb.auth.verifyOtp({ email, token: code, type: 'signup' });
  btn.textContent = 'Conferma'; btn.disabled = false;
  if (error) {
    console.error('verifyOtp error:', error);
    setAuthError(error.message || 'Codice non valido o scaduto. Riprova o richiedine uno nuovo.');
  }
}

async function doResendCode() {
  if (!_pendingEmail) return;
  const { error } = await sb.auth.resend({ email: _pendingEmail, type: 'signup' });
  if (!error) showToast('Nuovo codice inviato a ' + _pendingEmail);
  else showToast('Errore nel reinvio. Riprova tra qualche secondo.');
}

async function doLogout() {
  await sb.auth.signOut();
  localStorage.clear();
}

async function clearSession() {
  await sb.auth.signOut();
  localStorage.clear();
  showToast('Sessione pulita');
}

// =====================================================
// PROFILO
// =====================================================
async function loadProfile() {
  const { data, error } = await sb.from('profiles').select('*').eq('id', currentUser.id).single();

  if (!error && data) {
    userProfile = data;
    STUDIO_PCT  = (userProfile.percentuale_studio || 0) / 100;
    TAX_PCT     = (userProfile.aliquota_tasse    || 0) / 100;
    return true;
  }

  const { data: created, error: upsertErr } = await sb.from('profiles')
    .upsert(
      { id: currentUser.id, percentuale_studio: 30, aliquota_tasse: 5, subscription_active: false, setup_done: false },
      { onConflict: 'id' }
    )
    .select().single();

  if (!upsertErr && created) {
    userProfile = created;
    STUDIO_PCT  = (userProfile.percentuale_studio || 0) / 100;
    TAX_PCT     = (userProfile.aliquota_tasse    || 0) / 100;
    return true;
  }

  console.error('loadProfile failed — sessione non valida:', error, upsertErr);
  return false;
}

async function updateProfile(updates) {
  const { error: updErr } = await sb.from('profiles')
    .update(updates)
    .eq('id', currentUser.id);

  if (!updErr) {
    userProfile = { ...(userProfile || {}), ...updates };
    STUDIO_PCT  = (userProfile.percentuale_studio || 0) / 100;
    TAX_PCT     = (userProfile.aliquota_tasse    || 0) / 100;
    return null;
  }

  console.warn('UPDATE fallito, tento INSERT:', updErr);

  const { error: insErr } = await sb.from('profiles')
    .insert({ id: currentUser.id, ...updates });

  if (!insErr) {
    userProfile = { ...(userProfile || {}), id: currentUser.id, ...updates };
    STUDIO_PCT  = (userProfile.percentuale_studio || 0) / 100;
    TAX_PCT     = (userProfile.aliquota_tasse    || 0) / 100;
    return null;
  }

  console.error('updateProfile INSERT error:', insErr);
  return insErr;
}

async function doSetup(studioPct, taxPct) {
  const err = await updateProfile({
    percentuale_studio: parseFloat(studioPct),
    aliquota_tasse: parseFloat(taxPct),
    setup_done: true,
    subscription_active: true   // Rimuovere dopo integrazione Stripe
  });
  return err;
}

async function saveSettings(studioPct, taxPct) {
  const err = await updateProfile({
    percentuale_studio: parseFloat(studioPct),
    aliquota_tasse: parseFloat(taxPct)
  });
  return err;
}

// =====================================================
// FLUSSO POST-LOGIN
// =====================================================
async function afterLogin(onProfileReady, onSetupNeeded, onPaywallNeeded, onAppReady) {
  const ok = await loadProfile();

  if (!ok) {
    await sb.auth.signOut();
    localStorage.clear();
    currentUser = null;
    userProfile = null;
    showToast('Sessione scaduta. Rieffettua il login.');
    return;
  }

  if (typeof onProfileReady === 'function') onProfileReady(userProfile);

  if (!userProfile?.setup_done) {
    if (typeof onSetupNeeded === 'function') onSetupNeeded();
    return;
  }

  if (!userProfile?.subscription_active) {
    if (typeof onPaywallNeeded === 'function') {
      onPaywallNeeded();
      if (window.location.search.includes('subscribed=1')) waitForActivation(onAppReady);
    }
    return;
  }

  if (typeof onAppReady === 'function') onAppReady();
}

// =====================================================
// PAGAMENTO
// =====================================================
function goToCheckout() {
  if (!currentUser) return;
  const base       = 'https://inkbookss.lemonsqueezy.com/checkout/buy/a88fcb09-4446-4b5b-9ed8-e9d97b82f731';
  const userId     = encodeURIComponent(currentUser.id);
  const email      = encodeURIComponent(currentUser.email || '');
  const successUrl = encodeURIComponent(window.location.href.split('?')[0] + '?subscribed=1');
  window.open(`${base}?checkout[custom][user_id]=${userId}&checkout[email]=${email}`, '_blank');
}

async function waitForActivation(onSuccess) {
  let attempts = 0;
  const poll = async () => {
    attempts++;
    await loadProfile();
    if (userProfile?.subscription_active) {
      history.replaceState({}, '', window.location.pathname);
      if (typeof onSuccess === 'function') onSuccess();
      showToast('Abbonamento attivato! Benvenuto.');
      return;
    }
    if (attempts < 10) {
      setTimeout(poll, 3000);
    } else {
      history.replaceState({}, '', window.location.pathname);
      showToast('Attivazione in corso, ricarica tra qualche secondo.');
    }
  };
  setTimeout(poll, 3000);
}

// =====================================================
// CARICAMENTO DATI
// =====================================================
async function loadMonthData() {
  if (!currentUser) return;
  const { start, end } = monthRange();
  const uid = currentUser.id;
  const [rE, rU, rA] = await Promise.all([
    sb.from('entrate').select('*').eq('user_id', uid).gte('data', start).lte('data', end).order('data'),
    sb.from('uscite').select('*').eq('user_id', uid).gte('data', start).lte('data', end).order('data'),
    sb.from('appuntamenti').select('*').eq('user_id', uid)
      .gte('data_ora', start + 'T00:00:00Z')
      .lte('data_ora', end   + 'T23:59:59Z')
      .order('data_ora')
  ]);
  entrate      = rE.data || [];
  uscite       = rU.data || [];
  appuntamenti = rA.data || [];
}

async function loadRicorrenti() {
  if (!currentUser) return;
  const [rR, rE] = await Promise.all([
    sb.from('spese_ricorrenti').select('*').eq('user_id', currentUser.id).order('giorno'),
    sb.from('spese_ricorrenti_eccezioni').select('*').eq('user_id', currentUser.id)
      .eq('anno', currentYear).eq('mese', currentMonth + 1)
  ]);
  speseRicorrenti    = rR.data || [];
  eccezioniRicorrenti = rE.data || [];
}

// =====================================================
// ENTRATE / USCITE
// =====================================================
async function addEntry(type) {
  const isIncome = type === 'income';
  const amtEl  = document.getElementById(isIncome ? 'inc-amount' : 'exp-amount');
  const descEl = document.getElementById(isIncome ? 'inc-desc'   : 'exp-desc');
  const val    = parseFloat(amtEl.value);
  if (!val || val <= 0) return false;

  const btnId = isIncome ? 'btn-add-income' : 'btn-add-expense';
  const btn   = document.getElementById(btnId);
  if (!btn) return false;
  btn.disabled = true;

  const date = dayStr(selectedDay);
  let result;

  if (isIncome) {
    const taxable = document.getElementById('inc-taxable')?.checked ?? true;
    result = await sb.from('entrate')
      .insert({ user_id: currentUser.id, importo: val, descrizione: descEl.value || '', data: date, tassata: taxable })
      .select().single();
    if (result.data) entrate.push(result.data);
  } else {
    result = await sb.from('uscite')
      .insert({ user_id: currentUser.id, importo: val, descrizione: descEl.value || '', data: date })
      .select().single();
    if (result.data) uscite.push(result.data);
  }

  btn.disabled = false;
  if (!result.error) {
    amtEl.value = ''; descEl.value = '';
    showToast('Aggiunto');
    return true;
  } else {
    showToast('Errore: ' + result.error.message);
    return false;
  }
}

async function deleteEntry(type, id) {
  if (!confirm('Eliminare questa voce?')) return false;
  const table = type === 'income' ? 'entrate' : 'uscite';
  const { error } = await sb.from(table).delete().eq('id', id).eq('user_id', currentUser.id);
  if (!error) {
    if (type === 'income') entrate = entrate.filter(e => String(e.id) !== String(id));
    else                   uscite  = uscite.filter(e => String(e.id) !== String(id));
    showToast('Eliminato');
    return true;
  } else {
    console.error('deleteEntry error:', error);
    showToast('Errore eliminazione: ' + (error.message || 'Riprovare'));
    return false;
  }
}

// =====================================================
// APPUNTAMENTI
// =====================================================
async function addAppuntamento(dateIso, timeVal, client, amtRaw, notes) {
  const btn = document.getElementById('btn-add-apt');
  if (!btn) return null;
  btn.disabled = true;

  const dataOra = timeVal
    ? dateIso + 'T' + timeVal + ':00' + getTzOffset()
    : dateIso + 'T00:00:00Z';

  const { data, error } = await sb.from('appuntamenti').insert({
    user_id:          currentUser.id,
    data_ora:         dataOra,
    nome_cliente:     client,
    importo_previsto: amtRaw,
    note:             notes,
    stato:            'confermato'
  }).select().single();

  btn.disabled = false;

  if (!error && data) {
    const { start, end } = monthRange();
    const aptLocalDate = data.data_ora ? new Date(data.data_ora).toLocaleDateString('sv') : null;
    if (aptLocalDate && aptLocalDate >= start && aptLocalDate <= end) appuntamenti.push(data);
    showToast('Appuntamento aggiunto');
    return data;
  } else {
    showToast('Errore: ' + (error?.message || 'Riprovare'));
    return null;
  }
}

async function deleteAppuntamento(id) {
  if (!currentUser) return false;
  if (!confirm('Eliminare questo appuntamento?')) return false;
  const { error } = await sb.from('appuntamenti').delete().eq('id', id).eq('user_id', currentUser.id);
  if (!error) {
    appuntamenti = appuntamenti.filter(a => String(a.id) !== String(id));
    showToast('Appuntamento eliminato');
    return true;
  } else {
    console.error('deleteAppuntamento error:', error);
    showToast('Errore eliminazione: ' + (error.message || 'Riprovare'));
    return false;
  }
}

async function confirmRiportaEntrata(id, tassata) {
  if (!id || !currentUser) return null;
  const apt = appuntamenti.find(a => String(a.id) === String(id));
  if (!apt) return null;
  const aptDate = apt.data_ora ? new Date(apt.data_ora).toLocaleDateString('sv') : new Date().toLocaleDateString('sv');
  const desc = apt.nome_cliente + (apt.note ? ' — ' + apt.note : '');
  const importo = parseFloat(apt.importo_previsto || 0);

  const { data, error } = await sb.from('entrate').insert({
    user_id: currentUser.id, importo, descrizione: desc, data: aptDate, tassata
  }).select().single();

  if (!error && data) {
    const { start, end } = monthRange();
    if (aptDate >= start && aptDate <= end) entrate.push(data);
    await sb.from('appuntamenti').delete().eq('id', id).eq('user_id', currentUser.id);
    appuntamenti = appuntamenti.filter(a => String(a.id) !== String(id));
    showToast('Entrata aggiunta, appuntamento eliminato');
    return data;
  } else {
    console.error('confirmRiportaEntrata error:', error);
    showToast('Errore: ' + (error?.message || 'Riprovare'));
    return null;
  }
}

async function saveEditApt(id, dateIso, timeVal, client, amtRaw, notes, status) {
  if (!id || !currentUser) return false;
  const dataOra = timeVal
    ? dateIso + 'T' + timeVal + ':00' + getTzOffset()
    : dateIso + 'T00:00:00Z';
  const updates = {
    data_ora: dataOra,
    nome_cliente: client,
    importo_previsto: isNaN(amtRaw) ? 0 : amtRaw,
    note: notes,
    stato: status
  };
  const { error } = await sb.from('appuntamenti').update(updates).eq('id', id).eq('user_id', currentUser.id);
  if (!error) {
    const idx = appuntamenti.findIndex(a => String(a.id) === String(id));
    if (idx !== -1) appuntamenti[idx] = { ...appuntamenti[idx], ...updates };
    showToast('Appuntamento aggiornato');
    return true;
  } else {
    console.error('saveEditApt error:', error);
    showToast('Errore: ' + (error.message || 'Riprovare'));
    return false;
  }
}

// =====================================================
// MODIFICA VOCI ESISTENTI
// =====================================================
async function saveEditEntry(type, id, amount, desc, taxable) {
  if (!currentUser) return false;
  const table = type === 'income' ? 'entrate' : 'uscite';
  const updates = { importo: amount, descrizione: desc };
  if (type === 'income') updates.tassata = taxable;

  const { error } = await sb.from(table).update(updates).eq('id', id).eq('user_id', currentUser.id);
  if (!error) {
    const arr = type === 'income' ? entrate : uscite;
    const idx = arr.findIndex(e => String(e.id) === String(id));
    if (idx !== -1) arr[idx] = { ...arr[idx], ...updates };
    showToast('Voce aggiornata');
    return true;
  } else {
    console.error('saveEditEntry error:', error);
    showToast('Errore: ' + (error.message || 'Riprovare'));
    return false;
  }
}

// =====================================================
// SPESE RICORRENTI
// =====================================================
function getRicorrentiAttive() {
  const excSet  = new Set(eccezioniRicorrenti.map(e => String(e.spesa_id)));
  const lastDay = new Date(currentYear, currentMonth + 1, 0).getDate();
  return speseRicorrenti.filter(r => !excSet.has(String(r.id)) && r.giorno <= lastDay);
}
function getRicorrentiForDay(day) {
  return getRicorrentiAttive().filter(r => r.giorno === day);
}

async function skipRicorrente(id) {
  const already = eccezioniRicorrenti.some(
    e => String(e.spesa_id) === String(id) && e.anno === currentYear && e.mese === currentMonth + 1
  );
  if (already) return false;
  const { error } = await sb.from('spese_ricorrenti_eccezioni').insert({
    user_id: currentUser.id, spesa_id: id, anno: currentYear, mese: currentMonth + 1
  });
  if (!error) {
    eccezioniRicorrenti.push({ spesa_id: id, anno: currentYear, mese: currentMonth + 1 });
    return true;
  } else {
    console.error('skipRicorrente:', error);
    showToast('Errore: ' + (error.message || 'Riprovare'));
    return false;
  }
}

async function saveRicorrente(desc, amt, giorno, editingId) {
  if (!currentUser) return false;
  const payload = { descrizione: desc, importo: amt, giorno };

  if (editingId) {
    const { error } = await sb.from('spese_ricorrenti')
      .update(payload).eq('id', editingId).eq('user_id', currentUser.id);
    if (error) {
      console.error('saveRicorrente update:', error);
      showToast('Errore: ' + (error.message || 'Riprovare'));
      return false;
    }
    const idx = speseRicorrenti.findIndex(r => String(r.id) === String(editingId));
    if (idx !== -1) speseRicorrenti[idx] = { ...speseRicorrenti[idx], ...payload };
    showToast('Spesa ricorrente aggiornata');
    return true;
  } else {
    const { data, error } = await sb.from('spese_ricorrenti')
      .insert({ ...payload, user_id: currentUser.id }).select().single();
    if (error) {
      console.error('saveRicorrente insert:', error);
      showToast('Errore: ' + (error.message || 'Riprovare'));
      return false;
    }
    if (data) speseRicorrenti.push(data);
    showToast('Spesa ricorrente aggiunta');
    return true;
  }
}

async function deleteRicorrente(id) {
  if (!confirm('Eliminare questa spesa ricorrente da tutti i mesi?')) return false;
  const { error } = await sb.from('spese_ricorrenti').delete()
    .eq('id', id).eq('user_id', currentUser.id);
  if (!error) {
    speseRicorrenti = speseRicorrenti.filter(r => String(r.id) !== String(id));
    eccezioniRicorrenti = eccezioniRicorrenti.filter(e => String(e.spesa_id) !== String(id));
    showToast('Spesa ricorrente eliminata');
    return true;
  } else {
    console.error('deleteRicorrente:', error);
    showToast('Errore eliminazione.');
    return false;
  }
}

// =====================================================
// NAVIGAZIONE MESE
// =====================================================
async function changeMonth(dir) {
  currentMonth += dir;
  if (currentMonth > 11) { currentMonth = 0; currentYear++; }
  if (currentMonth < 0)  { currentMonth = 11; currentYear--; }
  const now = new Date();
  selectedDay = (currentYear === now.getFullYear() && currentMonth === now.getMonth())
    ? now.getDate()
    : 1;
  await loadMonthData();
  await loadRicorrenti().catch(() => {});
  return { currentMonth, currentYear, selectedDay };
}

// =====================================================
// UTILITY PER INPUT DATA
// =====================================================
function initDateInput(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.addEventListener('input', function() {
    let digits = this.value.replace(/\D/g, '').substring(0, 8);
    let formatted = digits;
    if (digits.length > 4) formatted = digits.slice(0,2) + '/' + digits.slice(2,4) + '/' + digits.slice(4);
    else if (digits.length > 2) formatted = digits.slice(0,2) + '/' + digits.slice(2);
    this.value = formatted;
  });
}