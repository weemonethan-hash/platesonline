// GitHub-backed plates manager
// Basic client-side implementation using GitHub REST API (requires PAT with repo scope).
// Stores config in localStorage for convenience.

const qs = sel => document.querySelector(sel);
const baseHeaders = () => ({ 'Accept': 'application/vnd.github.v3+json' });

function setStatus(msg, error=false) {
  const el = qs('#status');
  el.textContent = msg;
  el.style.color = error ? 'crimson' : '';
}

function saveConfigToLocal() {
  const cfg = {
    owner: qs('#repoOwner').value.trim(),
    repo: qs('#repoName').value.trim(),
    branch: qs('#repoBranch').value.trim() || 'main',
    token: qs('#token').value.trim()
  };
  localStorage.setItem('platesConfig', JSON.stringify(cfg));
  setStatus('Config saved locally.');
  return cfg;
}

function loadConfigFromLocal() {
  const raw = localStorage.getItem('platesConfig');
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

function getHeaders(token) {
  const h = { ...baseHeaders() };
  if (token) h['Authorization'] = `token ${token}`;
  return h;
}

function normalizePlate(input) {
  if (!input) return '';
  let s = input.toUpperCase().replace(/[^A-Z0-9]/g,'');
  // Basic normalization. No perfect validation; show normalized form.
  return s;
}

function validUKPlate(plate) {
  // Basic check for typical current format: 2 letters, 2 digits, 3 letters (e.g. AB12CDE)
  // Also accepts older formats loosely.
  if (!plate) return false;
  const p = normalizePlate(plate);
  return /^[A-Z]{2}[0-9]{2}[A-Z]{3}$/.test(p) || /^[A-Z]{1,3}[0-9]{1,4}[A-Z]{0,3}$/.test(p);
}

function apiUrl(cfg, path) {
  return `https://api.github.com/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}/${path}`;
}

async function listPlates() {
  const cfg = loadConfigFromLocal();
  if (!cfg) { setStatus('Missing config. Save repo owner/name/token first.', true); return; }
  const url = apiUrl(cfg, `contents/plates?ref=${encodeURIComponent(cfg.branch)}`);
  try {
    const res = await fetch(url, { headers: getHeaders(cfg.token) });
    if (res.status === 404) {
      // folder doesn't exist yet
      qs('#platesList').innerHTML = '<li class="small">No plates saved yet.</li>';
      return [];
    }
    if (!res.ok) {
      const txt = await res.text();
      setStatus(`Error listing plates: ${res.status} ${txt}`, true);
      return [];
    }
    const entries = await res.json(); // array of file entries
    // fetch each file content in parallel
    const fetches = entries.filter(e => e.type === 'file').map(async entry => {
      const r = await fetch(entry.url, { headers: getHeaders(cfg.token) });
      if (!r.ok) return null;
      const j = await r.json();
      const content = atob(j.content.replace(/\n/g,''));
      try { return { path: entry.path, json: JSON.parse(content), sha: j.sha }; } catch { return { path: entry.path, raw: content, sha: j.sha }; }
    });
    const results = (await Promise.all(fetches)).filter(Boolean);
    renderPlates(results);
    setStatus(`Loaded ${results.length} plates.`);
    return results;
  } catch (err) {
    setStatus('Network / fetch error: '+err.message, true);
    return [];
  }
}

function renderPlates(list) {
  const ul = qs('#platesList');
  const filter = qs('#search').value.trim().toUpperCase();
  ul.innerHTML = '';
  if (!list.length) {
    ul.innerHTML = '<li class="small">No plates saved yet.</li>';
    return;
  }
  list
    .filter(item => {
      const plate = (item.json && item.json.plate) || item.path.replace(/^plates\//,'');
      return !filter || plate.toUpperCase().includes(filter);
    })
    .sort((a,b) => ((a.json?.plate||'') > (b.json?.plate||'') ? 1 : -1))
    .forEach(item => {
      const p = item.json?.plate || item.path.replace(/^plates\//,'');
      const li = document.createElement('li');
      const left = document.createElement('div');
      left.innerHTML = `<strong>${p}</strong><div class="small">${item.json?.notes || ''}</div>`;
      const right = document.createElement('div');
      right.className = 'small';
      const flagged = item.json?.flagged ? `🚩 ${item.json.flagReason||''}` : '';
      right.innerHTML = `${flagged}<div>Added: ${item.json?.addedAt||'unknown'}</div>`;
      li.append(left, right);
      li.addEventListener('click', () => populateFormFromItem(item));
      ul.appendChild(li);
    });
}

function populateFormFromItem(item) {
  const json = item.json || {};
  qs('#plateDetails').classList.remove('hidden');
  qs('#normPlate').value = json.plate || item.path.replace(/^plates\//,'').replace(/\.json$/,'');
  qs('#owner').value = json.owner || '';
  qs('#notes').value = json.notes || '';
  qs('#flagged').checked = !!json.flagged;
  qs('#flagReason').value = json.flagReason || '';
  qs('#savePlateBtn').dataset.sha = item.sha || '';
}

async function getPlateFile(plate) {
  const cfg = loadConfigFromLocal();
  if (!cfg) { setStatus('Missing config.', true); return null; }
  const path = `contents/plates/${encodeURIComponent(plate)}.json?ref=${encodeURIComponent(cfg.branch)}`;
  const url = apiUrl(cfg, path);
  const res = await fetch(url, { headers: getHeaders(cfg.token) });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GET plate failed: ${res.status}`);
  const j = await res.json();
  const content = atob(j.content.replace(/\n/g,''));
  return { json: JSON.parse(content), sha: j.sha, path: j.path };
}

async function savePlate(plateData, sha) {
  const cfg = loadConfigFromLocal();
  if (!cfg) { setStatus('Missing config.', true); return false; }
  const path = `contents/plates/${plateData.plate}.json`;
  const url = apiUrl(cfg, path);
  const body = {
    message: (sha ? `Update plate ${plateData.plate}` : `Add plate ${plateData.plate}`),
    content: btoa(unescape(encodeURIComponent(JSON.stringify(plateData, null, 2)))),
    branch: cfg.branch
  };
  if (sha) body.sha = sha;
  const res = await fetch(url, { method: 'PUT', headers: getHeaders(cfg.token), body: JSON.stringify(body) });
  if (!res.ok) {
    const txt = await res.text();
    setStatus(`Save failed: ${res.status} ${txt}`, true);
    return false;
  }
  setStatus('Saved plate to repo.');
  return true;
}

/* UI wiring */
qs('#saveConfig').addEventListener('click', () => {
  saveConfigToLocal();
});

qs('#lookupBtn').addEventListener('click', async () => {
  const plateRaw = qs('#plateInput').value.trim();
  const norm = normalizePlate(plateRaw);
  if (!validUKPlate(plateRaw)) {
    setStatus('Plate looks invalid (basic check). Still trying lookup...', true);
  }
  qs('#plateDetails').classList.remove('hidden');
  qs('#normPlate').value = norm;
  // attempt to get existing file
  try {
    const file = await getPlateFile(norm);
    if (file) {
      qs('#owner').value = file.json.owner || '';
      qs('#notes').value = file.json.notes || '';
      qs('#flagged').checked = !!file.json.flagged;
      qs('#flagReason').value = file.json.flagReason || '';
      qs('#savePlateBtn').dataset.sha = file.sha;
      setStatus('Loaded existing plate.');
    } else {
      // new
      qs('#owner').value = '';
      qs('#notes').value = '';
      qs('#flagged').checked = false;
      qs('#flagReason').value = '';
      qs('#savePlateBtn').dataset.sha = '';
      setStatus('No existing plate found; you can add it.');
    }
  } catch (err) {
    setStatus('Lookup error: ' + err.message, true);
  }
});

qs('#addBtn').addEventListener('click', () => {
  const plateRaw = qs('#plateInput').value.trim();
  const norm = normalizePlate(plateRaw);
  if (!norm) { setStatus('Enter a plate first.', true); return; }
  qs('#plateDetails').classList.remove('hidden');
  qs('#normPlate').value = norm;
});

qs('#savePlateBtn').addEventListener('click', async () => {
  const plate = qs('#normPlate').value.trim();
  if (!plate) { setStatus('No plate to save.', true); return; }
  const data = {
    plate,
    owner: qs('#owner').value.trim(),
    notes: qs('#notes').value.trim(),
    addedAt: new Date().toISOString(),
    addedBy: '', // we'll attempt to read user from token below
    flagged: !!qs('#flagged').checked,
    flagReason: qs('#flagReason').value.trim()
  };
  const cfg = loadConfigFromLocal();
  if (cfg && cfg.token) {
    // fetch user login from token
    try {
      const r = await fetch('https://api.github.com/user', { headers: getHeaders(cfg.token) });
      if (r.ok) {
        const me = await r.json();
        data.addedBy = me.login;
      }
    } catch {}
  }
  const sha = qs('#savePlateBtn').dataset.sha || '';
  try {
    const ok = await savePlate(data, sha || undefined);
    if (ok) {
      await listPlates();
      setStatus('Plate saved.');
    }
  } catch (err) {
    setStatus('Save error: ' + err.message, true);
  }
});

qs('#refreshList').addEventListener('click', () => listPlates());
qs('#search').addEventListener('input', () => listPlates());

qs('#clearForm').addEventListener('click', () => {
  qs('#plateDetails').classList.add('hidden');
  qs('#plateInput').value = '';
});

window.addEventListener('load', () => {
  const cfg = loadConfigFromLocal();
  if (cfg) {
    qs('#repoOwner').value = cfg.owner || '';
    qs('#repoName').value = cfg.repo || '';
    qs('#repoBranch').value = cfg.branch || 'main';
    qs('#token').value = cfg.token || '';
  }
  // Initial listing attempt (if config present)
  if (cfg && cfg.owner && cfg.repo && cfg.token) listPlates();
});
