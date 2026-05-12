/**
 * ═══════════════════════════════════════════════════════════════════════
 * CBME OBGYN — Apps Script Backend
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Architecture:
 *   - Single endpoint: doPost(e)
 *   - All requests are JSON. All responses are JSON.
 *   - Auth: shared secret + Magic Link (24h session token)
 *   - Storage: Drive folder CBME_OBGYN with structured subfolders
 *
 * To deploy:
 *   1. Create new Apps Script project under obgynrambam@gmail.com
 *   2. Paste this code as Code.gs
 *   3. Edit CONFIG block below: set SHARED_SECRET to a long random string
 *   4. Run setupFolderStructure() once manually to create folders
 *   5. Deploy → New deployment → Web app → Execute as: Me, Access: Anyone
 *   6. Copy the Web App URL — send to Claude
 *
 * ═══════════════════════════════════════════════════════════════════════
 */


// ╔═════════════════════════════════════════════════════════════════════╗
// ║                            CONFIG                                    ║
// ╠═════════════════════════════════════════════════════════════════════╣
// ║  EDIT THESE VALUES BEFORE DEPLOYING                                  ║
// ╚═════════════════════════════════════════════════════════════════════╝

const CONFIG = {
  // SHARED_SECRET — generate a long random string. Will be embedded in
  // index.html. Anyone with this secret + a valid email can request
  // a magic link. Treat it as moderately sensitive (not as critical
  // as a password — magic link still required to act).
  // To generate one: https://www.uuidgenerator.net/version4
  // and concatenate 2-3 of them.
  SHARED_SECRET: 'd714dacc-baea-4254-b8b6-af80f5a4ef59',

  // Drive folder name (root). Change only if needed.
  ROOT_FOLDER_NAME: 'CBME_OBGYN',

  // Magic link code TTL (seconds)
  CODE_TTL_SEC: 600,        // 10 minutes
  // Session token TTL (seconds)
  TOKEN_TTL_SEC: 86400,     // 24 hours
  // Max code attempts before invalidation
  MAX_CODE_ATTEMPTS: 5,

  // Sender display name in magic link emails
  EMAIL_SENDER_NAME: 'CBME רמב"ם',
};


// ╔═════════════════════════════════════════════════════════════════════╗
// ║                   ENTRY POINT — doPost(e)                            ║
// ╚═════════════════════════════════════════════════════════════════════╝

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const { action, secret, token, data } = body;

    // Layer 1 — Shared secret
    if (secret !== CONFIG.SHARED_SECRET) {
      return _err('Unauthorized', 401);
    }

    // Public actions (no token required)
    if (action === 'request_login') return action_requestLogin(data);
    if (action === 'verify_login')  return action_verifyLogin(data);
    if (action === 'health_check')  return action_healthCheck();

    // Authenticated actions — require valid token
    const session = _validateToken(token);
    if (!session) return _err('Invalid or expired session', 401);

    switch (action) {
      case 'get_data':              return action_getData(data, session);
      case 'upload_procedures':     return action_uploadProcedures(data, session);
      case 'upload_exams':          return action_uploadExams(data, session);
      case 'submit_evaluation':     return action_submitEvaluation(data, session);
      case 'get_evaluations':       return action_getEvaluations(data, session);
      case 'start_macro_quarter':   return action_startMacroQuarter(data, session);
      case 'extend_macro_deadline': return action_extendMacroDeadline(data, session);
      case 'submit_pd_summary':     return action_submitPdSummary(data, session);
      case 'add_user':              return action_addUser(data, session);
      case 'remove_user':           return action_removeUser(data, session);
      case 'list_dynamic_users':    return action_listDynamicUsers(data, session);
      case 'archive_user':          return action_archiveUser(data, session);
      case 'restore_user':          return action_restoreUser(data, session);
      case 'replace_user_in_role':  return action_replaceUserInRole(data, session);
      case 'promote_resident':      return action_promoteResidentToAttending(data, session);
      case 'list_all_users':        return action_listAllUsers(data, session);
      case 'save_user_settings':    return action_saveUserSettings(data, session);
      case 'get_user_settings':     return action_getUserSettings(data, session);
      // v2.10.0: Distribution mechanism (eval + micro requests)
      case 'submit_eval_request':   return action_submitEvalRequest(data, session);
      case 'list_eval_requests':    return action_listEvalRequests(data, session);
      case 'cancel_eval_request':   return action_cancelEvalRequest(data, session);
      case 'submit_micro_request':  return action_submitMicroRequest(data, session);
      case 'list_micro_requests':   return action_listMicroRequests(data, session);
      case 'logout':                return action_logout(token, session);
      default:                      return _err('Unknown action: ' + action, 400);
    }
  } catch (err) {
    console.error('doPost error:', err);
    return _err('Server error: ' + err.message, 500);
  }
}

// Apps Script also needs doGet for sanity checks (browser-pasting the URL)
function doGet(e) {
  return ContentService.createTextOutput(JSON.stringify({
    ok: true,
    message: 'CBME OBGYN Apps Script. Use POST.',
    timestamp: new Date().toISOString(),
  })).setMimeType(ContentService.MimeType.JSON);
}


// ╔═════════════════════════════════════════════════════════════════════╗
// ║                       USER REGISTRY                                  ║
// ╠═════════════════════════════════════════════════════════════════════╣
// ║  Single source of truth for who can log in.                          ║
// ║  Mirrors the data in index.html — keep in sync when staff change.   ║
// ╚═════════════════════════════════════════════════════════════════════╝

const USERS = [
  // PD
  { id: 'pd-iluz',      name: 'ד"ר רועי אילוז',     role: 'pd',        email: 'r_iluz@rambam.health.gov.il' },
  { id: 'pd-mor',       name: 'ד"ר עומר מור',       role: 'pd',        email: 'o_mor@rambam.health.gov.il' },
  // v2.10.3: Cuzin and Shahak elevated to PD (full permissions)
  { id: 'pd-cuzin',     name: 'רויטל קוזין',         role: 'pd',        email: 'r_cuzin@rambam.health.gov.il' },
  { id: 'pd-shahak',    name: 'ד"ר גלעד שחק',       role: 'pd',        email: 'G_SHAHAK@rambam.health.gov.il' },

  // Program coordinator (רכזת תוכנית) — view all + upload data + generate reports.
  // Cannot approve final macro summaries (PD signature only).
  // v2.10.3: coord-cuzin removed — Cuzin elevated to pd-cuzin (same email, PD role).

  // Senior attendings (note: Iluz + Mor also appear as attending — same email)
  { id: 'a-argaz',      name: 'ד"ר אודי ארגז',      role: 'attending', email: 'u_ergaz@rambam.health.gov.il' },
  { id: 'a-tsipori',    name: 'ד"ר יניב ציפורי',     role: 'attending', email: 'Y_ZIPORI@rambam.health.gov.il' },
  { id: 'a-shulman',    name: 'פרופ\' עידו שולט',    role: 'attending', email: 'i_solt@rambam.health.gov.il' },
  // v2.10.3: a-shahak removed — Shahak elevated to pd-shahak (same email, PD role).
  // v2.10.0: a-iluz removed — duplicate of pd-iluz (same email). PD has senior privileges.
  { id: 'a-ginsberg',   name: 'ד"ר יובל גינסברג',   role: 'attending', email: 'y_ginsberg@rambam.health.gov.il' },
  // v2.10.0: a-mor removed — duplicate of pd-mor (same email).
  { id: 'a-avrahami',   name: 'ד"ר רוני אברהמי',    role: 'attending', email: 'r_avrahami@rambam.health.gov.il' },
  { id: 'a-ganaim',     name: 'ד"ר אימאן גנאים',    role: 'attending', email: 'E_ganayem@rambam.health.gov.il' },
  { id: 'a-tsur',       name: 'ד"ר ליליה צור',      role: 'attending', email: 'l_tzur@rambam.health.gov.il' },
  { id: 'a-aboud',      name: 'ד"ר יוסף עבוד',      role: 'attending', email: 'y_abbout@rambam.health.gov.il' },

  // Chiefs
  { id: 'c-aburas',     name: 'ד"ר היבא אבו ראס',   role: 'chief',     email: 'H_ABURASS@rambam.health.gov.il' },
  { id: 'c-buchnik',    name: 'ד"ר גילי בוחניק',    role: 'chief',     email: 'g_buchnikfater@rambam.health.gov.il' },
  { id: 'c-loberman',   name: 'ד"ר נמרוד לוברמן',   role: 'chief',     email: 'n_loberman@rambam.health.gov.il' },
  { id: 'c-wolfovich',  name: 'ד"ר אמיר וולפוביץ',  role: 'chief',     email: 'a_wolfovitz@rambam.health.gov.il' },
  { id: 'c-goldfreind', name: 'ד"ר רועי גולדפריינד', role: 'chief',    email: 'R_GF@rambam.health.gov.il' },

  // Pilot residents (PGY 1+2)
  { id: 'r-frishman',   name: 'נועה פרישמן',   role: 'resident', email: 'n_frishmanmartsiano@rambam.health.gov.il' },
  { id: 'r-halon',      name: 'מריה הלון',     role: 'resident', email: 'm_halon@rambam.health.gov.il' },
  { id: 'r-rosh',       name: 'בר ראש',        role: 'resident', email: 'B_ROSH@rambam.health.gov.il' },
  { id: 'r-shamai',     name: 'עידן שמאי',     role: 'resident', email: 'i_shamay@rambam.health.gov.il' },
  { id: 'r-shapira',    name: 'איריס שפירא',   role: 'resident', email: 'i_shapirobratt@rambam.health.gov.il' },
  { id: 'r-zeevi',      name: 'גילי זאבי-רוח', role: 'resident', email: 'GI_ZEEVI@rambam.health.gov.il' },
  { id: 'r-katz',       name: 'נועם כץ-לינדר', role: 'resident', email: 'n_katz@rambam.health.gov.il' },
  { id: 'r-gimon',      name: 'אלון גימון',    role: 'resident', email: 'a_gimmon@rambam.health.gov.il' },
  { id: 'r-wolf',       name: 'יעל וולף',      role: 'resident', email: 'y_wolf@rambam.health.gov.il' },
  { id: 'r-shreiber',   name: 'שרון שרייבר',   role: 'resident', email: 'sh_shreiber@rambam.health.gov.il' },
  { id: 'r-berman',     name: 'נופר ברמן',     role: 'resident', email: 'N_BERMAN@rambam.health.gov.il' },

  // DEMO resident (for testing only)
  { id: 'r-demo-dugman', name: 'רן דוגמן', role: 'resident', email: 'dr.iluz.roee@gmail.com', isDemo: true },
];

function _findUserByEmail(email) {
  if (!email) return null;
  const normalized = String(email).trim().toLowerCase();
  
  // ── Apply overrides layer (v2.6.0) ──
  // overrides keyed by user ID — can mark users as archived, change email/name,
  // or "replace in role" (link old user to new email)
  const overrides = _readUserOverrides();
  
  // ── PRIORITY 1: Check active dynamic users FIRST ──
  // CRITICAL: dynamic users come first because of the "promote" use case:
  // when a static resident is promoted to attending, the static record gets
  // archived (in overrides) AND a new dynamic record is created with the same
  // email. If we checked static first, we'd find the archived record and
  // wrongly return null. By checking dynamic first, the new active record wins.
  try {
    const dynamic = _readDynamicUsers();
    const dynUser = dynamic.find(u => u.email.toLowerCase() === normalized && !u.archivedAt);
    if (dynUser) return dynUser;
  } catch (e) {
    Logger.log('Warning: failed to read dynamic users: ' + e);
  }
  
  // ── PRIORITY 2: Check if any static user was REPLACED with this email ──
  // (i.e., admin replaced "ד\"ר רועי" with "ד\"ר X" — old user.email → new email)
  for (const id in overrides) {
    const ov = overrides[id];
    if (ov.email && ov.email.toLowerCase() === normalized && !ov.archivedAt) {
      const baseUser = USERS.find(u => u.id === id);
      if (baseUser) return Object.assign({}, baseUser, ov);
    }
  }
  
  // ── PRIORITY 3: Check static users (hardcoded) ──
  let staticUser = USERS.find(u => u.email.toLowerCase() === normalized);
  if (staticUser) {
    const ov = overrides[staticUser.id];
    if (ov) {
      // If archived — block login (but only if no active dynamic user took over,
      // which we already handled in priority 1)
      if (ov.archivedAt) return null;
      // If email was changed via override — only the new email matches
      if (ov.email && ov.email.toLowerCase() !== normalized) return null;
      // Apply overrides on top of static fields
      staticUser = Object.assign({}, staticUser, ov);
    }
    return staticUser;
  }
  
  return null;
}

function _findUserById(id) {
  const overrides = _readUserOverrides();
  // Static users
  let staticU = USERS.find(u => u.id === id);
  if (staticU) {
    const ov = overrides[id];
    if (ov && ov.archivedAt) return null;
    return ov ? Object.assign({}, staticU, ov) : staticU;
  }
  // Dynamic users
  const dynU = _readDynamicUsers().find(u => u.id === id);
  if (dynU && !dynU.archivedAt) return dynU;
  return null;
}

/**
 * Reads the dynamic users list from Drive.
 * Returns empty array if file doesn't exist (e.g., before any user was added).
 */
function _readDynamicUsers() {
  try {
    const folder = _getFolderByPath(['staff']);
    const data = _readJsonFromFolder(folder, 'dynamic.json');
    return Array.isArray(data) ? data : (data?.users || []);
  } catch (e) {
    return [];
  }
}

function _writeDynamicUsers(users) {
  const folder = _getFolderByPath(['staff']);
  _writeJsonToFolder(folder, 'dynamic.json', users);
}

// ═══════════════════════════════════════════════════════════════════
// USER OVERRIDES (v2.6.0)
// Overlay layer on static USERS — allows archiving and replacing
// hardcoded users without touching the code.
// 
// Structure: { "<userId>": { archivedAt?, archivedReason?, email?, name?, ... } }
// 
// Use cases:
// - Archive a static user: { "pd-iluz": { archivedAt: "...", archivedReason: "..." } }
// - Replace user in role: { "pd-iluz": { email: "newemail@...", name: "ד\"ר X", 
//                                        replacedAt: "...", previousEmail: "r_iluz@..." } }
// - Both (archive then someone else takes the role): combine both fields
// ═══════════════════════════════════════════════════════════════════

function _readUserOverrides() {
  try {
    const folder = _getFolderByPath(['staff']);
    const data = _readJsonFromFolder(folder, 'user_overrides.json');
    return (data && typeof data === 'object') ? data : {};
  } catch (e) {
    return {};
  }
}

function _writeUserOverrides(overrides) {
  const folder = _getFolderByPath(['staff']);
  _writeJsonToFolder(folder, 'user_overrides.json', overrides);
}

/**
 * Returns ALL users (static + dynamic) with their effective state applied
 * (overrides for static, archivedAt for dynamic).
 * 
 * Each entry has: { id, name, email, role, archivedAt, archivedReason,
 *                   isStatic, isDemo?, replacedAt?, previousEmail?, ... }
 */
function _getAllUsersWithState() {
  const overrides = _readUserOverrides();
  const dynamic = _readDynamicUsers();
  const result = [];
  
  // Static users with overrides applied
  USERS.forEach(u => {
    const ov = overrides[u.id] || {};
    result.push(Object.assign({}, u, ov, { isStatic: true }));
  });
  
  // Dynamic users (overrides don't apply — they carry state directly)
  dynamic.forEach(u => {
    result.push(Object.assign({}, u, { isStatic: false }));
  });
  
  return result;
}

/**
 * Revokes any active sessions for a user. Called on archive/replace.
 * Stable: failures logged but never thrown.
 */
function _revokeUserSessions(userIdOrEmail) {
  try {
    const sessionsFolder = _getFolderByPath(['sessions']);
    const tokens = _readJsonFromFolder(sessionsFolder, 'tokens_active.json') || {};
    let killed = 0;
    Object.keys(tokens).forEach(t => {
      const tok = tokens[t];
      if (tok.userId === userIdOrEmail || (tok.email && tok.email.toLowerCase() === String(userIdOrEmail).toLowerCase())) {
        delete tokens[t];
        killed++;
      }
    });
    if (killed > 0) _writeJsonToFolder(sessionsFolder, 'tokens_active.json', tokens);
    return killed;
  } catch (e) {
    Logger.log('Warning: failed to revoke sessions: ' + e);
    return 0;
  }
}


// ╔═════════════════════════════════════════════════════════════════════╗
// ║                       FOLDER MANAGEMENT                              ║
// ╚═════════════════════════════════════════════════════════════════════╝

/**
 * Run this ONCE manually after deploying. Creates the folder structure.
 * Run via Apps Script editor: select function from dropdown, click Run.
 */
function setupFolderStructure() {
  const root = _getOrCreateFolder(DriveApp.getRootFolder(), CONFIG.ROOT_FOLDER_NAME);

  const subdirs = [
    'procedures',
    'procedures/archive',
    'exams',
    'exams/archive',
    'evaluations',
    'evaluations/micro',
    'evaluations/macro',
    'sessions',
    'staff',  // For dynamic.json — users added via admin UI
  ];

  for (const path of subdirs) {
    const parts = path.split('/');
    let parent = root;
    for (const part of parts) {
      parent = _getOrCreateFolder(parent, part);
    }
  }

  // Initialize empty session files
  const sessionsFolder = _getFolderByPath(['sessions']);
  _writeJsonToFolder(sessionsFolder, 'codes_pending.json', {});
  _writeJsonToFolder(sessionsFolder, 'tokens_active.json', {});

  // Initialize empty staff/dynamic.json (only if doesn't exist)
  const staffFolder = _getFolderByPath(['staff']);
  const it = staffFolder.getFilesByName('dynamic.json');
  if (!it.hasNext()) _writeJsonToFolder(staffFolder, 'dynamic.json', []);

  // Initialize empty audit log (ONLY if doesn't exist — never overwrite history)
  const auditIt = root.getFilesByName('audit-log.json');
  if (!auditIt.hasNext()) _writeJsonToFolder(root, 'audit-log.json', []);

  Logger.log('✅ Folder structure ready at: ' + root.getUrl());
  Logger.log('✅ Existing folders + files preserved. Only missing items were created.');
}

function _getOrCreateFolder(parent, name) {
  const it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}

function _getRootFolder() {
  const it = DriveApp.getRootFolder().getFoldersByName(CONFIG.ROOT_FOLDER_NAME);
  if (!it.hasNext()) throw new Error('Root folder not found. Run setupFolderStructure() first.');
  return it.next();
}

function _getFolderByPath(pathParts) {
  let folder = _getRootFolder();
  for (const part of pathParts) {
    const it = folder.getFoldersByName(part);
    if (!it.hasNext()) throw new Error('Folder not found: ' + pathParts.join('/'));
    folder = it.next();
  }
  return folder;
}


// ╔═════════════════════════════════════════════════════════════════════╗
// ║                       FILE I/O HELPERS                               ║
// ╚═════════════════════════════════════════════════════════════════════╝

function _readJsonFromFolder(folder, filename) {
  const it = folder.getFilesByName(filename);
  if (!it.hasNext()) return null;
  const content = it.next().getBlob().getDataAsString();
  return JSON.parse(content);
}

function _writeJsonToFolder(folder, filename, data) {
  const json = JSON.stringify(data, null, 2);
  const it = folder.getFilesByName(filename);
  if (it.hasNext()) {
    it.next().setContent(json);
  } else {
    folder.createFile(filename, json, MimeType.PLAIN_TEXT);
  }
}


// ╔═════════════════════════════════════════════════════════════════════╗
// ║                       AUTH — Magic Link                              ║
// ╚═════════════════════════════════════════════════════════════════════╝

function action_requestLogin(data) {
  const email = String(data.email || '').trim().toLowerCase();
  const user = _findUserByEmail(email);
  // For privacy: do NOT reveal whether the email is registered.
  // Always say "code sent" — but only actually send if user exists.
  if (!user) {
    Utilities.sleep(500); // small delay to make timing-attack harder
    return _ok({ message: 'אם המייל מורשה, נשלח אליך קוד.', expiresIn: CONFIG.CODE_TTL_SEC });
  }

  // Generate 6-digit code
  const code = String(Math.floor(Math.random() * 900000) + 100000);

  // Save pending code
  const sessionsFolder = _getFolderByPath(['sessions']);
  const pending = _readJsonFromFolder(sessionsFolder, 'codes_pending.json') || {};

  // Clean up expired entries while we're here
  const now = Date.now();
  for (const [k, v] of Object.entries(pending)) {
    if (new Date(v.expiresAt).getTime() < now) delete pending[k];
  }

  pending[email] = {
    code,
    userId: user.id,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(now + CONFIG.CODE_TTL_SEC * 1000).toISOString(),
    attempts: 0,
  };
  _writeJsonToFolder(sessionsFolder, 'codes_pending.json', pending);

  // Send the email
  const subject = `CBME — קוד כניסה: ${code}`;
  const body = `שלום ${user.name},

קוד הכניסה שלך למערכת CBME:

   ${code}

הקוד תקף ל-10 דקות. אם לא ביקשת קוד זה, התעלם/י ממייל זה.

—
מערכת CBME, מחלקת נשים ויולדות, רמב"ם`;

  try {
    MailApp.sendEmail({
      to: user.email,
      subject,
      body,
      name: CONFIG.EMAIL_SENDER_NAME,
    });
  } catch (err) {
    return _err('Failed to send email: ' + err.message, 500);
  }

  _audit({ action: 'request_login', userId: user.id, userEmail: user.email });
  return _ok({ message: 'אם המייל מורשה, נשלח אליך קוד.', expiresIn: CONFIG.CODE_TTL_SEC });
}

function action_verifyLogin(data) {
  const email = String(data.email || '').trim().toLowerCase();
  const code = String(data.code || '').trim();

  if (!email || !code) return _err('Email and code required', 400);

  const sessionsFolder = _getFolderByPath(['sessions']);
  const pending = _readJsonFromFolder(sessionsFolder, 'codes_pending.json') || {};
  const entry = pending[email];

  if (!entry) return _err('Invalid email or code', 400);
  if (new Date(entry.expiresAt).getTime() < Date.now()) {
    delete pending[email];
    _writeJsonToFolder(sessionsFolder, 'codes_pending.json', pending);
    return _err('Code expired. Please request a new one.', 400);
  }
  if (entry.attempts >= CONFIG.MAX_CODE_ATTEMPTS) {
    delete pending[email];
    _writeJsonToFolder(sessionsFolder, 'codes_pending.json', pending);
    return _err('Too many attempts. Please request a new code.', 400);
  }

  // DEV_BYPASS: code '000000' always accepted. REMOVE BEFORE PRODUCTION.
  if (code !== '000000' && entry.code !== code) {
    entry.attempts += 1;
    pending[email] = entry;
    _writeJsonToFolder(sessionsFolder, 'codes_pending.json', pending);
    return _err('Invalid email or code', 400);
  }

  // Code OK — mint session token
  const user = _findUserById(entry.userId);
  if (!user) return _err('User no longer exists', 400);

  const token = 'tok_' + Utilities.getUuid().replace(/-/g, '');
  const expiresAt = new Date(Date.now() + CONFIG.TOKEN_TTL_SEC * 1000).toISOString();

  // Save token
  const tokens = _readJsonFromFolder(sessionsFolder, 'tokens_active.json') || {};
  // Clean expired tokens
  const now = Date.now();
  for (const [k, v] of Object.entries(tokens)) {
    if (new Date(v.expiresAt).getTime() < now) delete tokens[k];
  }
  tokens[token] = {
    email: user.email,
    userId: user.id,
    name: user.name,
    role: user.role,
    isDemo: !!user.isDemo,
    createdAt: new Date().toISOString(),
    expiresAt,
  };
  _writeJsonToFolder(sessionsFolder, 'tokens_active.json', tokens);

  // Remove the consumed code
  delete pending[email];
  _writeJsonToFolder(sessionsFolder, 'codes_pending.json', pending);

  _audit({ action: 'verify_login', userId: user.id, userEmail: user.email });

  return _ok({
    token,
    user: { id: user.id, name: user.name, role: user.role, email: user.email, isDemo: !!user.isDemo },
    expiresAt,
  });
}

function action_logout(token, session) {
  const sessionsFolder = _getFolderByPath(['sessions']);
  const tokens = _readJsonFromFolder(sessionsFolder, 'tokens_active.json') || {};
  delete tokens[token];
  _writeJsonToFolder(sessionsFolder, 'tokens_active.json', tokens);
  _audit({ action: 'logout', userId: session.userId, userEmail: session.email });
  return _ok({ message: 'Logged out' });
}

function _validateToken(token) {
  if (!token) return null;
  const sessionsFolder = _getFolderByPath(['sessions']);
  const tokens = _readJsonFromFolder(sessionsFolder, 'tokens_active.json') || {};
  const session = tokens[token];
  if (!session) return null;
  if (new Date(session.expiresAt).getTime() < Date.now()) {
    delete tokens[token];
    _writeJsonToFolder(sessionsFolder, 'tokens_active.json', tokens);
    return null;
  }
  return session;
}


// ╔═════════════════════════════════════════════════════════════════════╗
// ║              STAFF MANAGEMENT (Feature G — dynamic users)            ║
// ╚═════════════════════════════════════════════════════════════════════╝

/**
 * Adds a new user to the dynamic users list (stored in staff/dynamic.json).
 * Allowed for PD or coordinator. Validates uniqueness of email + ID.
 */
function action_addUser(data, session) {
  if (session.role !== 'pd' && session.role !== 'coordinator') {
    return _err('Only PD or coordinator can manage staff', 403);
  }
  const u = data || {};
  // Required fields (id is now optional — auto-generated if absent)
  if (!u.name || !u.email || !u.role) {
    return _err('שדות חובה: שם, מייל, תפקיד', 400);
  }
  // Validate role
  const validRoles = ['pd', 'coordinator', 'attending', 'chief', 'resident'];
  if (!validRoles.includes(u.role)) {
    return _err('Invalid role: ' + u.role, 400);
  }
  // Check email format
  const email = String(u.email).trim().toLowerCase();
  if (!email.includes('@')) return _err('כתובת מייל לא תקינה', 400);

  // Check uniqueness — across both static and dynamic
  if (_findUserByEmail(email)) {
    return _err('משתמש עם אימייל זה כבר קיים במערכת', 409);
  }

  // Auto-generate ID if not provided
  // Prefix by role for readability (a- for attending, r- for resident, etc.)
  const idPrefix = u.role === 'attending' ? 'a-' : (u.role === 'resident' ? 'r-' : (u.role === 'chief' ? 'c-' : 'u-'));
  const generatedId = u.id || (idPrefix + Utilities.getUuid().slice(0, 8));

  const newUser = {
    id: generatedId,
    name: String(u.name).trim(),
    email: email,
    role: u.role,
    addedBy: session.email,
    addedAt: new Date().toISOString(),
  };
  if (u.role === 'resident' && u.start) {
    if (!/^\d{4}-\d{2}$/.test(u.start)) {
      return _err('תאריך תחילת התמחות חייב להיות בפורמט YYYY-MM', 400);
    }
    newUser.start = u.start;
  }

  const dynamic = _readDynamicUsers();
  dynamic.push(newUser);
  _writeDynamicUsers(dynamic);

  // Optional: send welcome email (non-blocking, never fails the operation)
  let welcomeEmailSent = false;
  if (u.sendWelcomeEmail === true) {
    try {
      _sendWelcomeEmail(newUser);
      welcomeEmailSent = true;
    } catch (err) {
      Logger.log('Welcome email failed (non-blocking): ' + err);
      _audit({
        action: 'welcome_email_failed',
        userId: session.userId,
        details: { newUserEmail: newUser.email, error: String(err) },
      });
    }
  }

  _audit({
    action: 'add_user',
    userId: session.userId,
    userEmail: session.email,
    details: { newUserId: newUser.id, newUserEmail: newUser.email, newUserRole: newUser.role, welcomeEmailSent },
  });

  return _ok({ user: newUser, totalDynamic: dynamic.length, welcomeEmailSent });
}

/**
 * Sends a welcome email to a newly-added user.
 * Stable: any failure caught by caller.
 */
function _sendWelcomeEmail(user) {
  const isResident = user.role === 'resident';
  const roleLabel = isResident ? 'מתמחה' : (user.role === 'attending' ? 'רופא/ה בכיר/ה' : user.role);
  const subject = `ברוכ/ה הבא/ה למערכת CBME של מחלקת נשים-יולדות, רמב"ם`;
  
  // Plain-text body (renders cleanly in all email clients)
  const lines = [
    `שלום ${user.name},`,
    ``,
    `נוספת זה עתה למערכת ההערכות של מחלקת נשים-יולדות ברמב"ם בתפקיד: ${roleLabel}.`,
    ``,
    `═══════════════════════════════════════`,
    `כניסה למערכת:`,
    `═══════════════════════════════════════`,
    ``,
    `1. כנס/י לכתובת: https://roeeiluz.github.io/RAMBAM_OBGYN_PD/`,
    `2. הזן/י את שם המשתמש שלך — החלק לפני @ של כתובת המייל הרשמית`,
    `   (לדוגמה: ${user.email.split('@')[0]})`,
    `3. תקבל/י קוד 6 ספרות במייל הזה תוך כמה שניות`,
    `4. הזן/י את הקוד במסך — והחיבור תקף ל-24 שעות`,
    ``,
    `═══════════════════════════════════════`,
    `המלצות לכניסה ראשונה:`,
    `═══════════════════════════════════════`,
    ``,
    `📖 קרא/י את לשונית "מתודולוגיה" — מדריך מקיף ל-CBME, ACGME, ו-EPA`,
    `⚙ הגדר/י את ההעדפות שלך ב"הגדרות" — התראות מייל, ערכת נושא`,
    `📱 שמור/י קיצור למסך הבית בנייד:`,
    `   - iPhone (Safari): Share → "הוסף למסך הבית"`,
    `   - Android (Chrome): ⋮ → "התקן אפליקציה"`,
    ``,
  ];
  
  if (isResident) {
    lines.push(`═══════════════════════════════════════`);
    lines.push(`לידיעתך כמתמחה:`);
    lines.push(`═══════════════════════════════════════`);
    lines.push(``);
    lines.push(`• דשבורד אישי שמרכז את כל ההערכות והפעולות שלך`);
    lines.push(`• אופציה למשוב מהיר עצמי אחרי אירוע משמעותי`);
    lines.push(`• הערכה תקופתית עצמית בכל רבעון`);
    lines.push(`• AI Coach שעוזר/ת לבנות תוכנית אישית (PDP)`);
    lines.push(``);
  } else {
    lines.push(`═══════════════════════════════════════`);
    lines.push(`לידיעתך כבכיר/ה:`);
    lines.push(`═══════════════════════════════════════`);
    lines.push(``);
    lines.push(`• מילוי הערכה מיידית (Micro) — מומלץ אחרי כל ניתוח/לידה`);
    lines.push(`• מילוי הערכה תקופתית (Macro) — בכל רבעון, ~15 דק׳`);
    lines.push(`• צפייה בהיסטוריית ההערכות שמילאת`);
    lines.push(`• הסבר מלא במסך "מתודולוגיה" באפליקציה`);
    lines.push(``);
  }
  
  lines.push(`לכל שאלה — מנהל/ת התוכנית זמין/ה.`);
  lines.push(``);
  lines.push(`בהצלחה!`);
  lines.push(`---`);
  lines.push(`מערכת CBME · מחלקת נשים-יולדות · הקריה הרפואית רמב"ם · חיפה`);
  
  MailApp.sendEmail({
    to: user.email,
    subject: subject,
    body: lines.join('\n'),
    name: CONFIG.EMAIL_SENDER_NAME || 'CBME רמב"ם',
  });
}

function action_removeUser(data, session) {
  if (session.role !== 'pd' && session.role !== 'coordinator') {
    return _err('Only PD or coordinator can manage staff', 403);
  }
  const userId = data?.userId;
  if (!userId) return _err('userId is required', 400);

  // Cannot remove static users — only dynamic
  const dynamic = _readDynamicUsers();
  const idx = dynamic.findIndex(u => u.id === userId);
  if (idx === -1) {
    return _err('משתמש לא נמצא ברשימה הדינמית. לא ניתן להסיר משתמשים שמקודדים בקוד.', 404);
  }

  const removed = dynamic.splice(idx, 1)[0];
  _writeDynamicUsers(dynamic);

  // Also kill any active sessions for this user
  try {
    const sessionsFolder = _getFolderByPath(['sessions']);
    const tokens = _readJsonFromFolder(sessionsFolder, 'tokens_active.json') || {};
    let killed = 0;
    Object.keys(tokens).forEach(t => {
      if (tokens[t].userId === userId || tokens[t].email === removed.email) {
        delete tokens[t];
        killed++;
      }
    });
    if (killed > 0) _writeJsonToFolder(sessionsFolder, 'tokens_active.json', tokens);
  } catch (e) {
    Logger.log('Warning: failed to revoke sessions: ' + e);
  }

  _audit({
    action: 'remove_user',
    userId: session.userId,
    userEmail: session.email,
    details: { removedUserId: userId, removedUserEmail: removed.email },
  });

  return _ok({ removed: removed, totalDynamic: dynamic.length });
}

function action_listDynamicUsers(data, session) {
  // Anyone with a valid session can list dynamic users (needed for app load)
  // but PD/coordinator see full details, others see name+role only
  const dynamic = _readDynamicUsers();
  const isAdmin = session.role === 'pd' || session.role === 'coordinator';
  const users = dynamic.map(u => isAdmin ? u : ({ id: u.id, name: u.name, role: u.role }));
  return _ok({ users: users, count: users.length });
}

// ╔═════════════════════════════════════════════════════════════════════╗
// ║       USER LIFECYCLE (v2.6.0)                                        ║
// ║                                                                      ║
// ║  Actions: list_all_users, archive_user, restore_user,                ║
// ║           replace_user_in_role, promote_resident                     ║
// ║                                                                      ║
// ║  Permission model:                                                   ║
// ║   - add_user: PD or coordinator                                      ║
// ║   - all others: PD ONLY (prevents identity-spoofing)                 ║
// ╚═════════════════════════════════════════════════════════════════════╝

/**
 * Lists ALL users (static + dynamic) with their effective state — active or archived.
 * Used by admin UI for the management screen with Active/Archive tabs.
 */
function action_listAllUsers(data, session) {
  if (session.role !== 'pd' && session.role !== 'coordinator') {
    return _err('Only PD or coordinator can list all users', 403);
  }
  const all = _getAllUsersWithState();
  return _ok({
    users: all,
    activeCount: all.filter(u => !u.archivedAt).length,
    archivedCount: all.filter(u => u.archivedAt).length,
  });
}

/**
 * Archives a user — they can no longer log in, won't appear in active lists,
 * but their historical evaluations remain accessible (with "(לשעבר)" tag).
 *
 * PD-ONLY (not coordinator) — prevents accidental or unauthorized lockouts.
 */
function action_archiveUser(data, session) {
  if (session.role !== 'pd') {
    return _err('פעולה זו שמורה למנהל/ת התוכנית בלבד (PD)', 403);
  }
  const userId = data?.userId;
  const reason = data?.reason || '';
  if (!userId) return _err('userId is required', 400);

  // Cannot archive yourself
  if (userId === session.userId) {
    return _err('לא ניתן לארכב את עצמך. בקש/י ממנהל/ת תוכנית אחר/ת.', 400);
  }

  const now = new Date().toISOString();
  const user = _findUserById(userId);
  if (!user) {
    const allRaw = _getAllUsersWithState();
    const existing = allRaw.find(u => u.id === userId);
    if (!existing) return _err('משתמש לא נמצא', 404);
    if (existing.archivedAt) return _err('משתמש כבר בארכיון', 409);
    return _err('משתמש לא נמצא', 404);
  }

  const isStatic = USERS.some(u => u.id === userId);

  if (isStatic) {
    const overrides = _readUserOverrides();
    overrides[userId] = Object.assign({}, overrides[userId] || {}, {
      archivedAt: now,
      archivedReason: reason,
      archivedBy: session.email,
    });
    _writeUserOverrides(overrides);
  } else {
    const dynamic = _readDynamicUsers();
    const idx = dynamic.findIndex(u => u.id === userId);
    if (idx === -1) return _err('משתמש לא נמצא ברשימה הדינמית', 404);
    dynamic[idx].archivedAt = now;
    dynamic[idx].archivedReason = reason;
    dynamic[idx].archivedBy = session.email;
    _writeDynamicUsers(dynamic);
  }

  // Revoke any active sessions
  const killed = _revokeUserSessions(user.email);

  _audit({
    action: 'archive_user',
    userId: session.userId,
    userEmail: session.email,
    details: { archivedUserId: userId, archivedUserEmail: user.email, archivedUserRole: user.role, reason, sessionsKilled: killed },
  });

  return _ok({ archived: true, userId, archivedAt: now, sessionsKilled: killed });
}

/**
 * Restores an archived user back to active status. PD-only.
 */
function action_restoreUser(data, session) {
  if (session.role !== 'pd') {
    return _err('פעולה זו שמורה למנהל/ת התוכנית בלבד (PD)', 403);
  }
  const userId = data?.userId;
  if (!userId) return _err('userId is required', 400);

  const all = _getAllUsersWithState();
  const user = all.find(u => u.id === userId);
  if (!user) return _err('משתמש לא נמצא', 404);
  if (!user.archivedAt) return _err('משתמש לא בארכיון', 400);

  // Verify no active user has the same email (could happen if replaced)
  const conflictingActive = all.find(u => 
    u.id !== userId && !u.archivedAt && u.email && user.email && 
    u.email.toLowerCase() === user.email.toLowerCase()
  );
  if (conflictingActive) {
    return _err(`לא ניתן לשחזר: יש משתמש פעיל אחר עם אותה כתובת מייל (${conflictingActive.name}). יש לארכב אותו תחילה.`, 409);
  }

  const isStatic = USERS.some(u => u.id === userId);

  if (isStatic) {
    const overrides = _readUserOverrides();
    if (overrides[userId]) {
      delete overrides[userId].archivedAt;
      delete overrides[userId].archivedReason;
      delete overrides[userId].archivedBy;
      delete overrides[userId].replacedBy;  // also clear replacement link
      if (Object.keys(overrides[userId]).length === 0) delete overrides[userId];
      _writeUserOverrides(overrides);
    }
  } else {
    const dynamic = _readDynamicUsers();
    const idx = dynamic.findIndex(u => u.id === userId);
    if (idx === -1) return _err('משתמש לא נמצא ברשימה הדינמית', 404);
    delete dynamic[idx].archivedAt;
    delete dynamic[idx].archivedReason;
    delete dynamic[idx].archivedBy;
    delete dynamic[idx].replacedBy;
    _writeDynamicUsers(dynamic);
  }

  _audit({
    action: 'restore_user',
    userId: session.userId,
    userEmail: session.email,
    details: { restoredUserId: userId, restoredUserEmail: user.email, restoredUserRole: user.role },
  });

  return _ok({ restored: true, userId });
}

/**
 * Replaces a user in a role — old user goes to archive, new user takes the role.
 * Use case: PD changes; resident replaces another resident; etc.
 *
 * The new user's role MUST match the old user's role (this is what "replace in role" means).
 * For role CHANGES (resident → attending), use promote_resident_to_attending instead.
 */
function action_replaceUserInRole(data, session) {
  if (session.role !== 'pd') {
    return _err('פעולה זו שמורה למנהל/ת התוכנית בלבד (PD)', 403);
  }

  const oldUserId = data?.oldUserId;
  const newUser = data?.newUser;
  const reason = data?.reason || 'החלפה בתפקיד';

  if (!oldUserId) return _err('oldUserId is required', 400);
  if (!newUser || !newUser.name || !newUser.email) {
    return _err('newUser.name and newUser.email are required', 400);
  }

  const oldUser = _findUserById(oldUserId);
  if (!oldUser) return _err('המשתמש המוחלף לא נמצא או כבר בארכיון', 404);

  const newEmail = String(newUser.email).trim().toLowerCase();
  if (!newEmail.includes('@')) return _err('כתובת מייל לא תקינה', 400);
  
  // Allow the new email to match the old one ONLY if explicitly indicated
  // (rare but valid: same user gets a new role via this path)
  const sameEmail = newEmail === String(oldUser.email).toLowerCase();
  if (!sameEmail && _findUserByEmail(newEmail)) {
    return _err('משתמש עם אימייל זה כבר פעיל במערכת', 409);
  }

  if (oldUserId === session.userId) {
    return _err('לא ניתן להחליף את עצמך. בקש/י ממנהל/ת אחר/ת.', 400);
  }

  const now = new Date().toISOString();
  const role = oldUser.role;
  const isStatic = USERS.some(u => u.id === oldUserId);

  // Step 1: archive old user
  if (isStatic) {
    const overrides = _readUserOverrides();
    overrides[oldUserId] = Object.assign({}, overrides[oldUserId] || {}, {
      archivedAt: now,
      archivedReason: reason,
      archivedBy: session.email,
      replacedBy: newEmail,
    });
    _writeUserOverrides(overrides);
  } else {
    const dynamic = _readDynamicUsers();
    const idx = dynamic.findIndex(u => u.id === oldUserId);
    if (idx !== -1) {
      dynamic[idx].archivedAt = now;
      dynamic[idx].archivedReason = reason;
      dynamic[idx].archivedBy = session.email;
      dynamic[idx].replacedBy = newEmail;
      _writeDynamicUsers(dynamic);
    }
  }

  // Step 2: add new user as dynamic
  const newId = newUser.id || ('u-' + Utilities.getUuid().slice(0, 8));
  const newUserRecord = {
    id: newId,
    name: String(newUser.name).trim(),
    email: newEmail,
    role: role,
    addedBy: session.email,
    addedAt: now,
    replacesUserId: oldUserId,
    previousUserName: oldUser.name,
  };
  if (role === 'resident' && newUser.start) {
    if (!/^\d{4}-\d{2}$/.test(newUser.start)) {
      return _err('Resident start date must be YYYY-MM', 400);
    }
    newUserRecord.start = newUser.start;
  }
  const dynamic = _readDynamicUsers();
  dynamic.push(newUserRecord);
  _writeDynamicUsers(dynamic);

  // Step 3: revoke old user sessions
  const killed = _revokeUserSessions(oldUser.email);

  _audit({
    action: 'replace_user_in_role',
    userId: session.userId,
    userEmail: session.email,
    details: {
      oldUserId, oldUserEmail: oldUser.email, oldUserName: oldUser.name,
      newUserId: newId, newUserEmail: newEmail, newUserName: newUserRecord.name,
      role, reason, sessionsKilled: killed,
    },
  });

  return _ok({
    replaced: true,
    archived: { id: oldUserId, name: oldUser.name, email: oldUser.email, role },
    added: { id: newId, name: newUserRecord.name, email: newEmail, role },
    sessionsKilled: killed,
  });
}

/**
 * Promotes a resident to attending. This is a CAREER MILESTONE action —
 * a resident finishes residency and becomes an attending.
 *
 * Behavior:
 *   1. Old resident record → archived (their resident-era evaluations preserved)
 *   2. New attending record created
 *   3. Same person can keep same email OR get a new one (PD chooses)
 *
 * This is distinct from replace_user_in_role because the role CHANGES
 * (resident → attending), not the person.
 *
 * PD-only — prevents identity-impersonation attacks.
 */
function action_promoteResidentToAttending(data, session) {
  if (session.role !== 'pd') {
    return _err('פעולה זו שמורה למנהל/ת התוכנית בלבד (PD)', 403);
  }

  const residentUserId = data?.residentUserId;
  const newName = data?.newName;        // optional — usually same name
  const newEmail = data?.newEmail;      // optional — if changing email
  const newId = data?.newId;            // optional — auto-generated if absent
  const reason = data?.reason || 'סיום התמחות — קידום לבכיר';

  if (!residentUserId) return _err('residentUserId is required', 400);

  const resident = _findUserById(residentUserId);
  if (!resident) return _err('המתמחה לא נמצא או כבר בארכיון', 404);
  if (resident.role !== 'resident') {
    return _err('פעולה זו זמינה רק למתמחים. לתפקיד אחר השתמש/י ב"החלפה בתפקיד".', 400);
  }

  // Determine new email — default to same if not specified
  const finalEmail = newEmail ? String(newEmail).trim().toLowerCase() : String(resident.email).toLowerCase();
  if (!finalEmail.includes('@')) return _err('כתובת מייל לא תקינה', 400);

  // Check uniqueness ONLY if the email is changing
  if (finalEmail !== String(resident.email).toLowerCase()) {
    if (_findUserByEmail(finalEmail)) {
      return _err('משתמש פעיל אחר כבר משתמש בכתובת מייל זו', 409);
    }
  }

  const now = new Date().toISOString();
  const isStatic = USERS.some(u => u.id === residentUserId);

  // Step 1: archive the resident record
  if (isStatic) {
    const overrides = _readUserOverrides();
    overrides[residentUserId] = Object.assign({}, overrides[residentUserId] || {}, {
      archivedAt: now,
      archivedReason: reason,
      archivedBy: session.email,
      promotedTo: 'attending',
    });
    _writeUserOverrides(overrides);
  } else {
    const dynamic = _readDynamicUsers();
    const idx = dynamic.findIndex(u => u.id === residentUserId);
    if (idx !== -1) {
      dynamic[idx].archivedAt = now;
      dynamic[idx].archivedReason = reason;
      dynamic[idx].archivedBy = session.email;
      dynamic[idx].promotedTo = 'attending';
      _writeDynamicUsers(dynamic);
    }
  }

  // Step 2: create new attending record (always dynamic)
  const finalId = newId || ('a-' + Utilities.getUuid().slice(0, 8));
  const finalName = newName ? String(newName).trim() : resident.name;
  const newAttendingRecord = {
    id: finalId,
    name: finalName,
    email: finalEmail,
    role: 'attending',
    addedBy: session.email,
    addedAt: now,
    promotedFromResidentId: residentUserId,   // metadata for traceability
    previousResidentName: resident.name,
  };
  const dynamic = _readDynamicUsers();
  dynamic.push(newAttendingRecord);
  _writeDynamicUsers(dynamic);

  // Step 3: revoke any active resident sessions (force re-login as attending)
  const killed = _revokeUserSessions(resident.email);

  _audit({
    action: 'promote_resident',
    userId: session.userId,
    userEmail: session.email,
    details: {
      residentUserId, residentEmail: resident.email, residentName: resident.name,
      newAttendingId: finalId, newAttendingEmail: finalEmail, newAttendingName: finalName,
      emailChanged: finalEmail !== String(resident.email).toLowerCase(),
      reason, sessionsKilled: killed,
    },
  });

  return _ok({
    promoted: true,
    resident: { id: residentUserId, name: resident.name, email: resident.email },
    attending: { id: finalId, name: finalName, email: finalEmail },
    sessionsKilled: killed,
  });
}

// ╔═════════════════════════════════════════════════════════════════════╗
// ║              USER SETTINGS (Server-side preferences)                 ║
// ║  Stored at: settings/<email>.json — one file per user.               ║
// ║  Used to honor opt-in for email notifications across devices.        ║
// ╚═════════════════════════════════════════════════════════════════════╝

const SETTINGS_DEFAULTS_SERVER = {
  emailOnMicroSubmit: false,
  emailOnMacroSubmit: false,
  emailOnMacroApproved: true,
};

/**
 * Saves user settings to Drive. Only the user themselves can save their settings.
 * Stable: validates input, never throws.
 */
function action_saveUserSettings(data, session) {
  const settings = data.settings || {};
  const email = session.email;
  if (!email) return _err('No session email', 401);
  
  // Whitelist: only allow known setting keys (prevents pollution)
  const sanitized = {};
  Object.keys(SETTINGS_DEFAULTS_SERVER).forEach(k => {
    if (k in settings) sanitized[k] = !!settings[k];  // coerce to boolean
  });
  
  try {
    const folder = _getOrCreateSettingsFolder();
    const filename = _safeFilename(email) + '.json';
    _writeJsonToFolder(folder, filename, {
      email,
      userId: session.userId,
      role: session.role,
      settings: sanitized,
      updatedAt: new Date().toISOString(),
    });
    
    _audit({
      action: 'save_user_settings',
      userId: session.userId,
      userEmail: email,
      details: { changedKeys: Object.keys(sanitized) },
    });
    
    return _ok({ saved: true, settings: sanitized });
  } catch (err) {
    Logger.log('save_user_settings failed: ' + err);
    return _err('שגיאה בשמירת הגדרות', 500);
  }
}

/**
 * Returns the user's saved settings, or defaults if none exist.
 */
function action_getUserSettings(data, session) {
  const email = session.email;
  if (!email) return _err('No session email', 401);
  
  try {
    const settings = _readUserSettings(email);
    return _ok({ settings, email });
  } catch (err) {
    return _ok({ settings: SETTINGS_DEFAULTS_SERVER, email });
  }
}

/**
 * Reads settings for a given email. Returns defaults if not found.
 * Used both by action_getUserSettings AND by submit_evaluation (to check
 * if resident wants email notification).
 */
function _readUserSettings(email) {
  try {
    const folder = _getOrCreateSettingsFolder();
    const filename = _safeFilename(email) + '.json';
    const data = _readJsonFromFolder(folder, filename);
    if (!data || !data.settings) return { ...SETTINGS_DEFAULTS_SERVER };
    return { ...SETTINGS_DEFAULTS_SERVER, ...data.settings };
  } catch (e) {
    return { ...SETTINGS_DEFAULTS_SERVER };
  }
}

function _getOrCreateSettingsFolder() {
  const root = _getRootFolder();
  return _getOrCreateFolder(root, 'user_settings');
}

function _safeFilename(email) {
  // Convert email to safe filename (no @, no dots in directory parts)
  return String(email).toLowerCase().replace(/[^a-z0-9_-]/g, '_');
}


// ╔═════════════════════════════════════════════════════════════════════╗
// ║              DATA — Procedures & Exams (read/upload)                 ║
// ╚═════════════════════════════════════════════════════════════════════╝

function action_getData(data, session) {
  const type = data.type || 'all';
  const result = {};

  if (type === 'procedures' || type === 'all') {
    const folder = _getFolderByPath(['procedures']);
    result.procedures = _readJsonFromFolder(folder, 'current.json');
  }
  if (type === 'exams' || type === 'all') {
    const folder = _getFolderByPath(['exams']);
    result.exams = _readJsonFromFolder(folder, 'current.json');
  }
  return _ok(result);
}

function action_uploadProcedures(data, session) {
  if (session.role !== 'pd' && session.role !== 'coordinator') return _err('Only PD or coordinator can upload procedures', 403);

  const folder = _getFolderByPath(['procedures']);
  const archiveFolder = _getFolderByPath(['procedures', 'archive']);

  // Archive old version
  const it = folder.getFilesByName('current.json');
  if (it.hasNext()) {
    const oldFile = it.next();
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const archiveCopy = oldFile.getBlob().getDataAsString();
    archiveFolder.createFile(`procedures_${ts}.json`, archiveCopy, MimeType.PLAIN_TEXT);
  }

  // Write new
  const payload = {
    procedures: data.procedures || {},
    cesareans: data.cesareans || {},
    uploadedAt: new Date().toLocaleString('he-IL'),
    uploadedBy: session.name,
  };
  _writeJsonToFolder(folder, 'current.json', payload);

  _audit({
    action: 'upload_procedures',
    userId: session.userId,
    userEmail: session.email,
    details: {
      residentCount: Object.keys(payload.procedures).length,
      cesareanCount: Object.keys(payload.cesareans).length,
    },
  });

  return _ok({
    uploadedAt: payload.uploadedAt,
    residentCount: Object.keys(payload.procedures).length,
    cesareanCount: Object.keys(payload.cesareans).length,
  });
}

function action_uploadExams(data, session) {
  if (session.role !== 'pd' && session.role !== 'coordinator') return _err('Only PD or coordinator can upload exams', 403);

  const folder = _getFolderByPath(['exams']);
  const archiveFolder = _getFolderByPath(['exams', 'archive']);

  const it = folder.getFilesByName('current.json');
  if (it.hasNext()) {
    const oldFile = it.next();
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    archiveFolder.createFile(`exams_${ts}.json`, oldFile.getBlob().getDataAsString(), MimeType.PLAIN_TEXT);
  }

  const payload = {
    exams: data.exams || [],
    uploadedAt: new Date().toLocaleString('he-IL'),
    uploadedBy: session.name,
  };
  _writeJsonToFolder(folder, 'current.json', payload);

  _audit({
    action: 'upload_exams',
    userId: session.userId,
    userEmail: session.email,
    details: { examCount: payload.exams.length },
  });

  return _ok({ uploadedAt: payload.uploadedAt, examCount: payload.exams.length });
}


// ╔═════════════════════════════════════════════════════════════════════╗
// ║                       EVALUATIONS                                    ║
// ╚═════════════════════════════════════════════════════════════════════╝

function action_submitEvaluation(data, session) {
  const type = data.type;       // 'micro' | 'macro'
  const subType = data.subType; // 'draft' | 'final'

  if (!['micro', 'macro'].includes(type)) return _err('Invalid evaluation type', 400);
  if (type === 'macro' && !['draft', 'final'].includes(subType)) return _err('Macro requires subType', 400);

  // Verify evaluator matches session
  if (data.evaluatorId !== session.userId) {
    return _err('Evaluator ID mismatch', 403);
  }

  const evaluation = {
    id: data.id || ('eval_' + Utilities.getUuid().replace(/-/g, '')),
    type,
    subType: type === 'micro' ? 'final' : subType,
    evaluatorId: session.userId,
    evaluatorName: session.name,
    evaluatorRole: session.role,
    residentId: data.residentId,
    residentName: data.residentName,
    submittedAt: new Date().toISOString(),
    lastEditedAt: new Date().toISOString(),
  };

  if (type === 'micro') {
    evaluation.category = data.category;
    evaluation.categoryScore = data.categoryScore;
    evaluation.visibleFeedback = data.visibleFeedback || '';
    evaluation.privateNote = data.privateNote || null;

    // Save under evaluations/micro/YYYY-MM/
    const ym = new Date().toISOString().slice(0, 7); // "2026-04"
    const microFolder = _getFolderByPath(['evaluations', 'micro']);
    const monthFolder = _getOrCreateFolder(microFolder, ym);
    _writeJsonToFolder(monthFolder, evaluation.id + '.json', evaluation);
  } else {
    // MACRO
    evaluation.quarterId = data.quarterId;
    evaluation.scores = data.scores || {};
    evaluation.visibleFeedback = data.visibleFeedback || '';
    evaluation.privateNote = data.privateNote || null;

    const quarterId = data.quarterId;
    if (!quarterId) return _err('Macro requires quarterId', 400);

    const macroFolder = _getFolderByPath(['evaluations', 'macro']);
    const quarterFolder = _getOrCreateFolder(macroFolder, quarterId);
    const draftsFolder = _getOrCreateFolder(quarterFolder, 'drafts');
    const finalsFolder = _getOrCreateFolder(quarterFolder, 'finals');

    const filename = `${session.userId}__${data.residentId}.json`;

    if (subType === 'draft') {
      _writeJsonToFolder(draftsFolder, filename, evaluation);
    } else {
      // Move from drafts to finals (delete draft if exists)
      const draftIt = draftsFolder.getFilesByName(filename);
      if (draftIt.hasNext()) draftIt.next().setTrashed(true);
      _writeJsonToFolder(finalsFolder, filename, evaluation);
    }
  }

  _audit({
    action: 'submit_evaluation',
    userId: session.userId,
    userEmail: session.email,
    details: { type, subType: evaluation.subType, residentId: data.residentId },
  });

  // ── Optional email notification to resident ──
  // CRITICAL: Wrapped in try/catch — email failure must NEVER break submission.
  // Looks up resident's email preferences from Drive (settings/<email>.json).
  // If preference is OFF or settings missing — no email sent (default OFF).
  if (evaluation.subType === 'final' && data.residentEmail) {
    try {
      const residentPrefs = _readUserSettings(data.residentEmail);
      const shouldNotify = (
        (evaluation.type === 'micro' && residentPrefs.emailOnMicroSubmit) ||
        (evaluation.type === 'macro' && residentPrefs.emailOnMacroSubmit)
      );
      if (shouldNotify) {
        _sendEvaluationNotificationEmail(evaluation, data.residentEmail);
      }
    } catch (err) {
      Logger.log('Email notification failed (non-blocking): ' + err);
      _audit({
        action: 'eval_notification_failed',
        userId: session.userId,
        details: { error: String(err), residentId: data.residentId },
      });
    }
  }

  return _ok({ id: evaluation.id, submittedAt: evaluation.submittedAt });
}

/**
 * Sends a notification email to the resident about a new evaluation.
 * Stable: bounded, never throws (catches MailApp errors and silences them).
 * The resident's email preference is checked client-side before this is called.
 */
function _sendEvaluationNotificationEmail(evaluation, residentEmail) {
  if (!residentEmail || !evaluation) return;
  
  const subject = evaluation.type === 'micro'
    ? 'התקבלה הערכה מיידית חדשה במערכת CBME'
    : 'התקבלה הערכה תקופתית חדשה במערכת CBME';
  
  const evalTypeHe = evaluation.type === 'micro' ? 'הערכה מיידית (Micro)' : 'הערכה תקופתית (Macro)';
  const dateHe = new Date(evaluation.submittedAt).toLocaleDateString('he-IL');
  
  // For micro: include the visible feedback. For macro: only meta info (full
  // breakdown will be visible after PD approval).
  const bodyParts = [
    `שלום,`,
    ``,
    `התקבלה ${evalTypeHe} חדשה עליך במערכת CBME של מחלקת נשים-יולדות, רמב"ם.`,
    ``,
    `מעריך/ה: ${evaluation.evaluatorName}`,
    `תאריך: ${dateHe}`,
  ];
  
  if (evaluation.type === 'micro') {
    bodyParts.push(``);
    bodyParts.push(`קטגוריה: ${evaluation.category || '—'}`);
    if (evaluation.categoryScore) bodyParts.push(`ציון EPA: ${evaluation.categoryScore} מתוך 5`);
    if (evaluation.visibleFeedback) {
      bodyParts.push(``);
      bodyParts.push(`פידבק:`);
      bodyParts.push(evaluation.visibleFeedback);
    }
  } else {
    // Macro — preserve privacy; just notification, no scores
    bodyParts.push(``);
    bodyParts.push('הסיכום המלא יוצג לך לאחר אישור סופי של מנהלת התוכנית.');
  }
  
  bodyParts.push(``);
  bodyParts.push(`לצפייה במערכת:`);
  bodyParts.push(`https://roeeiluz.github.io/RAMBAM_OBGYN_PD/`);
  bodyParts.push(``);
  bodyParts.push(`---`);
  bodyParts.push(`הודעה זו נשלחה אוטומטית. ניתן לבטל התראות אלו דרך מסך "הגדרות" במערכת.`);
  bodyParts.push(`מערכת CBME — מחלקת נשים ויולדות, רמב"ם`);
  
  MailApp.sendEmail({
    to: residentEmail,
    subject: subject,
    body: bodyParts.join('\n'),
    name: CONFIG.EMAIL_SENDER_NAME || 'CBME רמב"ם',
  });
  
  _audit({
    action: 'eval_notification_sent',
    userId: 'system',
    userEmail: residentEmail,
    details: { evalType: evaluation.type, evalId: evaluation.id },
  });
}

function action_getEvaluations(data, session) {
  const scope = data.scope;
  const result = [];

  if (scope === 'for_resident') {
    // Resident sees only PD-approved Macro summaries.
    // PD/attending/chief sees all evaluations on this resident.
    const residentId = data.residentId;
    if (!residentId) return _err('residentId required', 400);

    // Permission check: resident can only see own; others can see anyone's
    if (session.role === 'resident' && session.userId !== residentId) {
      return _err('Access denied', 403);
    }

    // Iterate Macro quarters, gather PD summaries
    const macroFolder = _getFolderByPath(['evaluations', 'macro']);
    const quarterIt = macroFolder.getFolders();
    while (quarterIt.hasNext()) {
      const quarter = quarterIt.next();
      const summaryIt = quarter.getFoldersByName('pd_summary');
      if (summaryIt.hasNext()) {
        const summaryFolder = summaryIt.next();
        const fileIt = summaryFolder.getFilesByName(residentId + '.json');
        if (fileIt.hasNext()) {
          const summary = JSON.parse(fileIt.next().getBlob().getDataAsString());
          // Strip private note if requester is the resident
          if (session.role === 'resident') {
            delete summary.privateNote;
            if (summary.history) summary.history.forEach(h => delete h.privateNote);
          }
          result.push(summary);
        }
      }
    }

    // Also gather Micro evaluations IF requester is not the resident.
    // Residents see Micro on themselves (they got the visible feedback).
    // Strip privateNote for resident.
    const microFolder = _getFolderByPath(['evaluations', 'micro']);
    const monthIt = microFolder.getFolders();
    while (monthIt.hasNext()) {
      const month = monthIt.next();
      const fileIt = month.getFiles();
      while (fileIt.hasNext()) {
        const file = fileIt.next();
        const ev = JSON.parse(file.getBlob().getDataAsString());
        if (ev.residentId === residentId) {
          if (session.role === 'resident') delete ev.privateNote;
          result.push(ev);
        }
      }
    }

  } else if (scope === 'by_evaluator') {
    // Show evaluations the requester submitted
    if (data.evaluatorId !== session.userId && session.role !== 'pd') {
      return _err('Access denied', 403);
    }
    const evaluatorId = data.evaluatorId || session.userId;
    _walkAllEvaluations(ev => {
      if (ev.evaluatorId === evaluatorId) result.push(ev);
    });

  } else if (scope === 'macro_quarter') {
    // PD only — get all Macro evals for a given quarter
    if (session.role !== 'pd') return _err('PD only', 403);
    const quarterId = data.quarterId;
    if (!quarterId) return _err('quarterId required', 400);

    const macroFolder = _getFolderByPath(['evaluations', 'macro']);
    const quarterIt = macroFolder.getFoldersByName(quarterId);
    if (quarterIt.hasNext()) {
      const quarterFolder = quarterIt.next();
      ['drafts', 'finals'].forEach(subName => {
        const subIt = quarterFolder.getFoldersByName(subName);
        if (subIt.hasNext()) {
          const subFolder = subIt.next();
          const fileIt = subFolder.getFiles();
          while (fileIt.hasNext()) {
            result.push(JSON.parse(fileIt.next().getBlob().getDataAsString()));
          }
        }
      });
    }
  } else {
    return _err('Invalid scope', 400);
  }

  return _ok({ evaluations: result });
}

function _walkAllEvaluations(callback) {
  // Walk Micro
  const microFolder = _getFolderByPath(['evaluations', 'micro']);
  const monthIt = microFolder.getFolders();
  while (monthIt.hasNext()) {
    const month = monthIt.next();
    const fileIt = month.getFiles();
    while (fileIt.hasNext()) {
      callback(JSON.parse(fileIt.next().getBlob().getDataAsString()));
    }
  }
  // Walk Macro (drafts + finals)
  const macroFolder = _getFolderByPath(['evaluations', 'macro']);
  const quarterIt = macroFolder.getFolders();
  while (quarterIt.hasNext()) {
    const quarter = quarterIt.next();
    ['drafts', 'finals'].forEach(subName => {
      const subIt = quarter.getFoldersByName(subName);
      if (subIt.hasNext()) {
        const subFolder = subIt.next();
        const fIt = subFolder.getFiles();
        while (fIt.hasNext()) {
          callback(JSON.parse(fIt.next().getBlob().getDataAsString()));
        }
      }
    });
  }
}


// ╔═════════════════════════════════════════════════════════════════════╗
// ║                       MACRO QUARTER MANAGEMENT                       ║
// ╚═════════════════════════════════════════════════════════════════════╝

function action_startMacroQuarter(data, session) {
  if (session.role !== 'pd') return _err('PD only', 403);
  const quarterId = data.quarterId;
  const deadline = data.deadline;
  if (!quarterId || !deadline) return _err('quarterId and deadline required', 400);

  const macroFolder = _getFolderByPath(['evaluations', 'macro']);
  const quarterFolder = _getOrCreateFolder(macroFolder, quarterId);
  _getOrCreateFolder(quarterFolder, 'drafts');
  _getOrCreateFolder(quarterFolder, 'finals');
  _getOrCreateFolder(quarterFolder, 'pd_summary');

  const meta = {
    quarterId,
    openedBy: session.userId,
    openedAt: new Date().toISOString(),
    deadline,
    extensions: {},
    status: 'open',
  };
  _writeJsonToFolder(quarterFolder, '_meta.json', meta);

  _audit({
    action: 'start_macro_quarter',
    userId: session.userId,
    userEmail: session.email,
    details: { quarterId, deadline },
  });

  // TODO: optionally email all evaluators about the new quarter

  return _ok({ quarterId, deadline });
}

function action_extendMacroDeadline(data, session) {
  if (session.role !== 'pd') return _err('PD only', 403);
  const { quarterId, residentId, newDeadline } = data;
  if (!quarterId || !residentId || !newDeadline) return _err('Missing fields', 400);

  const quarterFolder = _getFolderByPath(['evaluations', 'macro']).getFoldersByName(quarterId);
  if (!quarterFolder.hasNext()) return _err('Quarter not found', 404);
  const folder = quarterFolder.next();

  const meta = _readJsonFromFolder(folder, '_meta.json') || {};
  meta.extensions = meta.extensions || {};
  meta.extensions[residentId] = newDeadline;
  _writeJsonToFolder(folder, '_meta.json', meta);

  _audit({
    action: 'extend_macro_deadline',
    userId: session.userId,
    userEmail: session.email,
    details: { quarterId, residentId, newDeadline },
  });

  return _ok({ quarterId, residentId, newDeadline });
}

function action_submitPdSummary(data, session) {
  if (session.role !== 'pd') return _err('PD only', 403);
  const { quarterId, residentId, scores, visibleFeedback, privateNote } = data;
  if (!quarterId || !residentId) return _err('quarterId and residentId required', 400);

  const macroFolder = _getFolderByPath(['evaluations', 'macro']);
  const quarterIt = macroFolder.getFoldersByName(quarterId);
  if (!quarterIt.hasNext()) return _err('Quarter not found', 404);
  const quarterFolder = quarterIt.next();
  const summaryFolder = _getOrCreateFolder(quarterFolder, 'pd_summary');

  // Load existing summary if any (for revision history)
  let existing = _readJsonFromFolder(summaryFolder, residentId + '.json');
  let history = [];
  let newVersion = 1;

  if (existing) {
    history = existing.history || [];
    history.push({
      version: existing.currentVersion,
      approvedAt: existing.approvedAt,
      scores: existing.scores,
      visibleFeedback: existing.visibleFeedback,
      privateNote: existing.privateNote,
    });
    newVersion = existing.currentVersion + 1;
  }

  const user = _findUserById(residentId);
  const summary = {
    residentId,
    residentName: user ? user.name : data.residentName,
    quarterId,
    currentVersion: newVersion,
    approvedAt: new Date().toISOString(),
    approvedBy: session.userId,
    scores: scores || {},
    visibleFeedback: visibleFeedback || '',
    privateNote: privateNote || null,
    history,
  };

  _writeJsonToFolder(summaryFolder, residentId + '.json', summary);

  _audit({
    action: 'submit_pd_summary',
    userId: session.userId,
    userEmail: session.email,
    details: { quarterId, residentId, version: newVersion },
  });

  return _ok({ version: newVersion, approvedAt: summary.approvedAt });
}


// ╔═════════════════════════════════════════════════════════════════════╗
// ║                       UTILS                                          ║
// ╚═════════════════════════════════════════════════════════════════════╝

function action_healthCheck() {
  return _ok({
    status: 'ok',
    timestamp: new Date().toISOString(),
    userCount: USERS.length,
  });
}


// ╔═════════════════════════════════════════════════════════════════════╗
// ║              REMINDERS SYSTEM (Feature A)                            ║
// ║  Time-based triggers send automatic email reminders for:             ║
// ║   1. Macro deadline approaching (3 days before)                      ║
// ║   2. Resident missing self-eval                                       ║
// ║   3. Attending hasn't submitted macro for assigned resident           ║
// ║                                                                       ║
// ║  Setup: After deploying this script, run setupReminderTriggers()     ║
// ║  ONCE manually from the Apps Script editor.                          ║
// ╚═════════════════════════════════════════════════════════════════════╝

/**
 * Run ONCE manually from Apps Script editor to install daily reminder trigger.
 * Idempotent: removes any existing reminder trigger before creating a new one.
 */
function setupReminderTriggers() {
  // Remove any existing triggers for this function
  const existing = ScriptApp.getProjectTriggers();
  existing.forEach(t => {
    if (t.getHandlerFunction() === 'sendDailyReminders') {
      ScriptApp.deleteTrigger(t);
    }
  });
  // Create new daily trigger at 7 AM
  ScriptApp.newTrigger('sendDailyReminders')
    .timeBased()
    .everyDays(1)
    .atHour(7)
    .create();
  Logger.log('✅ Daily reminder trigger installed (runs at 7am)');
}

/**
 * Called daily by the time-based trigger.
 * Iterates through users and sends contextual reminder emails.
 */
function sendDailyReminders() {
  const today = new Date();
  const reminders = [];

  try {
    // 1. Check if we're approaching a macro deadline (need active macro quarter file)
    const macroQuarter = _readActiveMacroQuarter();
    if (macroQuarter && macroQuarter.deadline) {
      const deadlineDate = new Date(macroQuarter.deadline);
      const daysUntil = Math.ceil((deadlineDate - today) / (1000 * 60 * 60 * 24));

      if (daysUntil === 3 || daysUntil === 1) {
        // Find which evaluators haven't submitted yet
        const submitted = _getMacroSubmitters(macroQuarter.quarterId);
        const allEvaluators = USERS.filter(u =>
          u.role === 'attending' || u.role === 'pd'
        );
        const pending = allEvaluators.filter(u => !submitted.has(u.email));

        pending.forEach(user => {
          reminders.push({
            to: user.email,
            subject: `תזכורת: הערכה תקופתית — ${daysUntil} ימים נותרו`,
            body: `שלום ${user.name},\n\nתזכורת: הדדליין להגשת הערכות תקופתיות (Macro) לרבעון ${macroQuarter.quarterId} מתקרב — ${daysUntil} ימים נותרו (${deadlineDate.toLocaleDateString('he-IL')}).\n\nאנא היכנס/י למערכת CBME והשלם/י את ההערכות הנדרשות:\n${CONFIG.WEB_APP_URL || 'https://obgynrambam.github.io/cbme'}\n\nתודה,\nמערכת CBME — מחלקת נשים-יולדות, רמב"ם`,
          });
        });

        // Also notify residents who haven't submitted self-eval
        const residents = USERS.filter(u => u.role === 'resident');
        residents.forEach(r => {
          if (!submitted.has(r.email)) {
            reminders.push({
              to: r.email,
              subject: `תזכורת: הערכה עצמית תקופתית — ${daysUntil} ימים נותרו`,
              body: `שלום ${r.name},\n\nתזכורת: יש לך עוד ${daysUntil} ימים להשלים את ההערכה העצמית התקופתית שלך לרבעון ${macroQuarter.quarterId}.\n\nההערכה העצמית חשובה — היא משמשת בסיס לדיון הסיכום עם מנהלת התוכנית.\n\nכניסה למערכת:\n${CONFIG.WEB_APP_URL || 'https://obgynrambam.github.io/cbme'}\n\nתודה,\nמערכת CBME`,
            });
          }
        });
      }
    }

    // 2. Send all collected reminders (with daily quota in mind — Apps Script limit ~100/day)
    const MAX_DAILY = 80;
    let sent = 0;
    for (const r of reminders) {
      if (sent >= MAX_DAILY) {
        Logger.log(`⚠ Hit daily reminder limit (${MAX_DAILY}). ${reminders.length - sent} pending.`);
        break;
      }
      try {
        MailApp.sendEmail({ to: r.to, subject: r.subject, body: r.body });
        sent++;
      } catch (e) {
        Logger.log(`Failed to send to ${r.to}: ${e}`);
      }
    }

    _audit({
      action: 'send_reminders',
      userId: 'system',
      userEmail: 'system',
      details: { totalQueued: reminders.length, sent: sent },
    });
    Logger.log(`✅ Reminders sent: ${sent}/${reminders.length}`);
    return { sent, total: reminders.length };

  } catch (err) {
    Logger.log('❌ sendDailyReminders error: ' + err);
    _audit({ action: 'reminder_error', userEmail: 'system', details: { error: String(err) } });
    return { error: String(err) };
  }
}

/**
 * Reads the currently active macro quarter (set when PD opens a quarter via action_startMacroQuarter).
 * Returns null if no active quarter.
 */
function _readActiveMacroQuarter() {
  try {
    const root = _getRootFolder();
    const data = _readJsonFromFolder(root, 'active_macro_quarter.json');
    return data || null;
  } catch (e) {
    return null;
  }
}

/**
 * Returns a Set of email addresses that have submitted a macro evaluation for the given quarter.
 */
function _getMacroSubmitters(quarterId) {
  const submitters = new Set();
  try {
    const macroFolder = _getFolderByPath(['evaluations', 'macro']);
    const it = macroFolder.getFiles();
    while (it.hasNext()) {
      const file = it.next();
      try {
        const data = JSON.parse(file.getBlob().getDataAsString());
        if (data.quarterId === quarterId && data.evaluatorEmail) {
          submitters.add(data.evaluatorEmail.toLowerCase());
        }
      } catch (e) { /* skip malformed */ }
    }
  } catch (e) {
    Logger.log('_getMacroSubmitters: ' + e);
  }
  return submitters;
}


function _audit(event) {
  try {
    const root = _getRootFolder();
    const log = _readJsonFromFolder(root, 'audit-log.json') || [];
    log.push({ timestamp: new Date().toISOString(), ...event });
    // Keep last 5000 entries to avoid bloat
    if (log.length > 5000) log.splice(0, log.length - 5000);
    _writeJsonToFolder(root, 'audit-log.json', log);
  } catch (err) {
    console.error('Audit failed:', err);
  }
}

function _ok(data) {
  return ContentService.createTextOutput(JSON.stringify({ ok: true, data: data || {} }))
    .setMimeType(ContentService.MimeType.JSON);
}

function _err(message, code) {
  return ContentService.createTextOutput(JSON.stringify({
    ok: false,
    error: message,
    code: code || 500,
  })).setMimeType(ContentService.MimeType.JSON);
}

// ═══════════════════════════════════════════════════════════════════
// RESET EVALUATIONS — Run from Apps Script editor only.
// Deletes all micro + macro evaluations + PD summaries.
// Does NOT touch: procedures, exams, users, sessions, audit log.
// ═══════════════════════════════════════════════════════════════════
function resetAllEvaluations() {
  const ui = SpreadsheetApp.getUi ? SpreadsheetApp.getUi() : null;
  // Safety prompt (only works when run from editor/menu)
  if (ui) {
    const resp = ui.alert('⚠️ מחיקת כל ההערכות',
      'פעולה זו תמחק את כל ההערכות (micro + macro + PD summaries).\n' +
      'מבחנים ופעולות לא ייפגעו.\n\nלהמשיך?',
      ui.ButtonSet.YES_NO);
    if (resp !== ui.Button.YES) { Logger.log('Reset cancelled.'); return; }
  }

  let deleted = 0;

  // 1. Delete all files under evaluations/micro/
  try {
    const microFolder = _getFolderByPath(['evaluations', 'micro']);
    deleted += _deleteAllFilesRecursive(microFolder);
    Logger.log('✅ Deleted micro evaluations');
  } catch (e) { Logger.log('⚠️ micro folder not found: ' + e); }

  // 2. Delete all files under evaluations/macro/
  try {
    const macroFolder = _getFolderByPath(['evaluations', 'macro']);
    deleted += _deleteAllFilesRecursive(macroFolder);
    Logger.log('✅ Deleted macro evaluations');
  } catch (e) { Logger.log('⚠️ macro folder not found: ' + e); }

  // 3. Clear request-status tracking (eval requests/deadlines)
  try {
    const root = _getRootFolder();
    const reqIt = root.getFilesByName('eval_requests.json');
    if (reqIt.hasNext()) { reqIt.next().setTrashed(true); deleted++; }
  } catch (e) { Logger.log('⚠️ eval_requests cleanup: ' + e); }

  _audit({
    action: 'reset_all_evaluations',
    userId: 'system',
    details: { deletedFiles: deleted },
  });

  Logger.log('🧹 Reset complete. Deleted ' + deleted + ' files. Exams + procedures intact.');
}

/**
 * Recursively deletes all files in a folder and its subfolders.
 * Removes empty subfolders afterwards.
 */
function _deleteAllFilesRecursive(folder) {
  let count = 0;

  // Delete files in this folder
  const files = folder.getFiles();
  while (files.hasNext()) {
    files.next().setTrashed(true);
    count++;
  }

  // Recurse into subfolders
  const subs = folder.getFolders();
  while (subs.hasNext()) {
    const sub = subs.next();
    count += _deleteAllFilesRecursive(sub);
    // Remove empty subfolder
    sub.setTrashed(true);
    count++;
  }

  return count;
}


// ╔═════════════════════════════════════════════════════════════════════╗
// ║          v2.10.0 — EVALUATION REQUESTS (Distribution)                ║
// ╠═════════════════════════════════════════════════════════════════════╣
// ║  PD/Coordinator sends macro-eval requests to evaluators with a       ║
// ║  deadline. Residents request micro feedback from seniors.            ║
// ║  Storage:                                                            ║
// ║    eval_requests/<quarterId>/<reqId>.json    — macro requests        ║
// ║    micro_requests/<residentId>/<reqId>.json  — micro requests        ║
// ╚═════════════════════════════════════════════════════════════════════╝

function _getEvalRequestsFolder(quarterId) {
  const root = _getRoot();
  const reqRoot = _getOrCreateFolder(root, 'eval_requests');
  return _getOrCreateFolder(reqRoot, quarterId);
}

function _getMicroRequestsFolder(residentId) {
  const root = _getRoot();
  const reqRoot = _getOrCreateFolder(root, 'micro_requests');
  return _getOrCreateFolder(reqRoot, residentId);
}

/**
 * action: submit_eval_request
 * Body: { secret, token, data: { id, type:'macro_request', quarterId, residentId, residentName,
 *         requesterId, requesterName, evaluatorIds, evaluatorNames, deadline, notes, createdAt, status } }
 * Auth: PD or coordinator only.
 */
function action_submitEvalRequest(data, session) {
  if (session.role !== 'pd' && session.role !== 'coordinator') {
    return _err('Only PD/coordinator can send evaluation requests', 403);
  }
  const req = data.data;
  if (!req || !req.id || !req.quarterId || !req.residentId || !Array.isArray(req.evaluatorIds) || !req.deadline) {
    return _err('Missing required fields: id, quarterId, residentId, evaluatorIds, deadline', 400);
  }
  try {
    const folder = _getEvalRequestsFolder(req.quarterId);
    folder.createFile(req.id + '.json', JSON.stringify(req, null, 2), 'application/json');

    // Best-effort: email evaluators about the new request
    try {
      const residentEmail = _emailForResidentId(req.residentId);
      (req.evaluatorIds || []).forEach((evId, i) => {
        const evEmail = _emailForUserId(evId);
        if (!evEmail) return;
        const evName = (req.evaluatorNames || [])[i] || '';
        MailApp.sendEmail({
          to: evEmail,
          subject: `[CBME] בקשת הערכה תקופתית — ${req.residentName}, ${req.quarterId}`,
          htmlBody: `<div dir="rtl"><p>שלום ${evName},</p>` +
                    `<p>התבקשת למלא הערכה תקופתית עבור <strong>${req.residentName}</strong> לרבעון <strong>${req.quarterId}</strong>.</p>` +
                    `<p><strong>תאריך יעד:</strong> ${req.deadline}</p>` +
                    (req.notes ? `<p><strong>הערות:</strong> ${req.notes}</p>` : '') +
                    `<p>היכנס/י לאפליקציה כדי למלא את ההערכה.</p></div>`,
          name: CONFIG.EMAIL_SENDER_NAME,
        });
      });
      // Also notify the resident
      if (residentEmail) {
        MailApp.sendEmail({
          to: residentEmail,
          subject: `[CBME] התבקשו הערכות עבורך — ${req.quarterId}`,
          htmlBody: `<div dir="rtl"><p>${req.requesterName || 'PD'} שלח/ה בקשות הערכה למספר בכירים עבור הרבעון ${req.quarterId}.</p><p>תאריך יעד: ${req.deadline}</p></div>`,
          name: CONFIG.EMAIL_SENDER_NAME,
        });
      }
    } catch (e) { console.warn('Eval-request emails failed:', e); }

    _appendAudit('eval_request_created', { reqId: req.id, residentId: req.residentId, by: session.user.id });
    return _ok({ id: req.id });
  } catch (e) {
    return _err('Failed to save eval request: ' + e.message, 500);
  }
}

/**
 * action: list_eval_requests
 * Body: { secret, token, data: { quarterId? } }
 * Auth: any logged-in user. Filtered by role:
 *   - PD/coordinator: all requests
 *   - attending/chief: requests they're evaluators on
 *   - resident: requests for them
 */
function action_listEvalRequests(data, session) {
  const onlyQ = data && data.data && data.data.quarterId;
  const all = [];
  try {
    const root = _getRoot();
    const reqRoot = _getOrCreateFolder(root, 'eval_requests');
    const qFolders = reqRoot.getFolders();
    while (qFolders.hasNext()) {
      const qf = qFolders.next();
      if (onlyQ && qf.getName() !== onlyQ) continue;
      const files = qf.getFiles();
      while (files.hasNext()) {
        const f = files.next();
        if (!f.getName().endsWith('.json')) continue;
        try { all.push(JSON.parse(f.getBlob().getDataAsString())); }
        catch (e) { /* skip malformed */ }
      }
    }
  } catch (e) { return _err('Failed to list eval requests: ' + e.message, 500); }

  // Filter by role
  const myId = session.user.id;
  let filtered = all;
  if (session.role === 'attending' || session.role === 'chief') {
    filtered = all.filter(r => (r.evaluatorIds || []).indexOf(myId) >= 0);
  } else if (session.role === 'resident') {
    filtered = all.filter(r => r.residentId === myId);
  }
  return _ok({ requests: filtered });
}

/**
 * action: cancel_eval_request
 * Body: { secret, token, data: { reqId, quarterId } }
 * Auth: PD/coordinator only.
 */
function action_cancelEvalRequest(data, session) {
  if (session.role !== 'pd' && session.role !== 'coordinator') {
    return _err('Only PD/coordinator can cancel evaluation requests', 403);
  }
  const reqId = data.data && data.data.reqId;
  const quarterId = data.data && data.data.quarterId;
  if (!reqId || !quarterId) return _err('Missing reqId or quarterId', 400);
  try {
    const folder = _getEvalRequestsFolder(quarterId);
    const files = folder.getFilesByName(reqId + '.json');
    if (!files.hasNext()) return _err('Request not found', 404);
    const f = files.next();
    // Read, mark cancelled, write back
    const obj = JSON.parse(f.getBlob().getDataAsString());
    obj.status = 'cancelled';
    obj.cancelledAt = new Date().toISOString();
    obj.cancelledBy = session.user.id;
    f.setContent(JSON.stringify(obj, null, 2));
    _appendAudit('eval_request_cancelled', { reqId, by: session.user.id });
    return _ok({});
  } catch (e) {
    return _err('Failed to cancel: ' + e.message, 500);
  }
}

/**
 * action: submit_micro_request
 * Body: { secret, token, data: { id, type:'micro_request', residentId, residentName,
 *         evaluatorId, evaluatorName, eventId, eventLabel, deadline, notes, createdAt, status } }
 * Auth: residents and chiefs only (they request micro feedback about themselves).
 */
function action_submitMicroRequest(data, session) {
  if (session.role !== 'resident' && session.role !== 'chief') {
    return _err('Only residents/chiefs can request micro feedback', 403);
  }
  const req = data.data;
  if (!req || !req.id || !req.residentId || !req.evaluatorId || !req.deadline) {
    return _err('Missing required fields', 400);
  }
  // Force residentId to current user — prevent forging requests as someone else
  if (req.residentId !== session.user.id) {
    return _err('Cannot request feedback for another resident', 403);
  }
  try {
    const folder = _getMicroRequestsFolder(req.residentId);
    folder.createFile(req.id + '.json', JSON.stringify(req, null, 2), 'application/json');

    // Best-effort: email the senior
    try {
      const evEmail = _emailForUserId(req.evaluatorId);
      if (evEmail) {
        MailApp.sendEmail({
          to: evEmail,
          subject: `[CBME] בקשת משוב מהיר — ${req.residentName}`,
          htmlBody: `<div dir="rtl"><p>שלום ${req.evaluatorName || ''},</p>` +
                    `<p><strong>${req.residentName}</strong> מבקש/ת ממך משוב מהיר${req.eventLabel ? ' על ' + req.eventLabel : ''}.</p>` +
                    `<p><strong>תאריך יעד:</strong> ${req.deadline}</p>` +
                    (req.notes ? `<p><strong>הערות:</strong> ${req.notes}</p>` : '') +
                    `<p>היכנס/י לאפליקציה כדי למלא את המשוב.</p></div>`,
          name: CONFIG.EMAIL_SENDER_NAME,
        });
      }
    } catch (e) { console.warn('Micro-request email failed:', e); }

    _appendAudit('micro_request_created', { reqId: req.id, evaluatorId: req.evaluatorId, by: session.user.id });
    return _ok({ id: req.id });
  } catch (e) {
    return _err('Failed to save micro request: ' + e.message, 500);
  }
}

/**
 * action: list_micro_requests
 * Body: { secret, token, data: { residentId? } }
 * Auth: any logged-in user. Filtered by role:
 *   - resident: own requests (residentId === self)
 *   - attending/chief: requests where they're evaluators
 *   - PD/coordinator: all (for audit/oversight)
 */
function action_listMicroRequests(data, session) {
  const all = [];
  try {
    const root = _getRoot();
    const reqRoot = _getOrCreateFolder(root, 'micro_requests');
    const rFolders = reqRoot.getFolders();
    while (rFolders.hasNext()) {
      const rf = rFolders.next();
      const files = rf.getFiles();
      while (files.hasNext()) {
        const f = files.next();
        if (!f.getName().endsWith('.json')) continue;
        try { all.push(JSON.parse(f.getBlob().getDataAsString())); }
        catch (e) { /* skip */ }
      }
    }
  } catch (e) { return _err('Failed to list micro requests: ' + e.message, 500); }

  const myId = session.user.id;
  let filtered = all;
  if (session.role === 'resident' || session.role === 'chief') {
    filtered = all.filter(r => r.residentId === myId || r.evaluatorId === myId);
  } else if (session.role === 'attending') {
    filtered = all.filter(r => r.evaluatorId === myId);
  }
  // PD/coordinator: see all
  return _ok({ requests: filtered });
}

/**
 * Helper — look up email by user ID (searches USERS array + dynamic users).
 */
function _emailForUserId(userId) {
  if (!userId) return null;
  const u = USERS.find(x => x.id === userId);
  if (u) return u.email;
  try {
    const dyn = _readDynamicUsers();
    const dynU = dyn.find(x => x.id === userId);
    if (dynU) return dynU.email;
  } catch (e) {}
  return null;
}

/**
 * Helper — look up resident's email by ID.
 */
function _emailForResidentId(residentId) {
  return _emailForUserId(residentId);
}
