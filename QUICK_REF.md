# 🔖 Quick Reference — CBME v2.10.1

> ניווט מהיר ל-cheatsheet — קישורים, קוד, שגיאות נפוצות. עודכן 12.5.2026.

---

## 🔗 URLs

| משאב | URL |
|---|---|
| מערכת חיה | `https://roeeiluz.github.io/RAMBAM_OBGYN_PD/` |
| GitHub repo | `https://github.com/roeeiluz/RAMBAM_OBGYN_PD` |
| Apps Script | `https://script.google.com/macros/s/AKfycbxCmhq.../exec` |
| Drive root | תיקיית `CBME_OBGYN/` ב-Google Drive |

---

## 📁 קבצים

| קובץ | תפקיד | גרסה |
|---|---|---|
| `index_8.html` | Frontend — **קובץ העבודה** | v2.10.1 |
| `index.html` | Frontend — mirror ל-GitHub | v2.10.1 |
| `Code.gs` | Backend (Apps Script) | v2.10.0 (awaiting deploy) |
| `PROJECT_STATE.md` | מצב נוכחי + history | — |
| `PROJECT_INSTRUCTIONS.md` | איך עובדים | — |
| `QUICK_REF.md` | זה | — |
| `BACKEND_NOTES.md` | spec ל-Code.gs additions (מומש) | — |
| `STABILITY_REPORT_v2.10.0.md` | דוח עומסים | — |
| `DEPLOY_v2.10.2_GO_LIVE.md` | checklist להעברה לייצור | — |
| `_archive/` | מסמכים ישנים | — |

---

## 🆘 קוד חשוב — `index_8.html` (line numbers approximate)

| מה | שורה ~ |
|---|---|
| `const DEV_BYPASS_AUTH` 🔴 | 672 |
| `const APP_VERSION` | 666 |
| `WEB_APP_URL` / `SHARED_SECRET` | 485 |
| `function escapeHtml` (v2.9.20) | 9596 |
| `function safeSetItem` (v2.10.1) | 9612 |
| `const LOCAL_HISTORY_MAX = 2000` | 1593 |
| `function _saveToLocalHistory` | 1595 |
| `function _getLocalHistory` | 1609 |
| `function _autoSaveMacroDraftOnExit` | 2721 |
| `function renderResidentDashboard` | 3434 |
| `function _renderResidentActionable` (v2.9.15) | 3461 |
| `function renderMicroForm` (v2.9.19 pre-fill) | 3964 |
| `function renderEvalStatus` (5 chips) | 4136 |
| `function renderMacroFormScreen` | 5124 |
| `function approveMacro` (v2.9.10 confirm) | 5388 |
| `function renderEvalRequests` | 6388 |
| `function _openMicroRequestModal` (v2.9.13) | 6470 |
| `function renderSeniorRequests` (v2.9.14) | — |
| `function _renderResidentMacroTiles` (v2.9.11) | 6692 |
| `function getSeedEvalsForResident` | 2009 |
| `function buildAnalysisContext` (v2.9.20 demo-iso) | 10698 |

## 🆘 קוד חשוב — `Code.gs`

| מה | שורה ~ |
|---|---|
| `USERS` (a-iluz/a-mor removed v2.10.0) | 117 |
| `doPost` switch | 58 |
| `_findUserByEmail` | 168 |
| `action_submitEvaluation` | 1342 |
| `action_submitPdSummary` | 1687 |
| **v2.10.0 NEW** at bottom: | ~2000+ |
| `action_submitEvalRequest` | — |
| `action_listEvalRequests` | — |
| `action_cancelEvalRequest` | — |
| `action_submitMicroRequest` | — |
| `action_listMicroRequests` | — |

---

## 👥 5 תפקידים

| Role | סייידבר | יכולות מרכזיות |
|---|---|---|
| `pd` | סגול | תצוגה מלאה + אישור Macro + שליחת בקשות הערכה |
| `coordinator` | ורוד | תצוגה מלאה + העלאת נתונים + שליחת בקשות הערכה |
| `attending` | כחול | מילוי הערכות + קבלת בקשות |
| `chief` | טורקיז כהה | מילוי + הערכה עצמית + קבלת בקשות |
| `resident` | טורקיז | הערכה עצמית + דשבורד אישי + בקשת משוב מבכיר |

---

## 🗂️ 8 קטגוריות אירועים (Micro)

`delivery` (חדר לידה), `cs` (ניתוח קיסרי), `or` (חדר ניתוח), `lap` (לפרוסקופיה), `triage` (מיון), `oncall` (תורנות), `ward` (אחריות מחלקה), `clinic` (מרפאה)

---

## 🛠️ פקודות שימושיות

### Syntax check על JS
```bash
python3 -c "
import re
with open('/sessions/peaceful-adoring-brahmagupta/mnt/CBME/index_8.html') as f: h = f.read()
scripts = re.findall(r'<script>([\\s\\S]*?)</script>', h)
biggest = max(scripts, key=len)
with open('/tmp/main.js', 'w') as f: f.write(biggest)
"
node --check /tmp/main.js
```

### בדיקת `APP_VERSION`
```bash
grep "const APP_VERSION " /path/to/index_8.html | head -3
```

### חיפוש onclick handler
```bash
grep -n "onclick.*funcName" /path/to/index_8.html
```

### בדיקה ש-DEV_BYPASS_AUTH=false (לפני go-live)
```bash
grep "const DEV_BYPASS_AUTH" /path/to/index_8.html
```

---

## 🚦 דגלי אבטחה (v2.10.1)

- **fail-CLOSED auth** ✅ (v2.6.4)
- **demo isolation** ✅ (v2.9.20 — getSeedEvalsForResident)
- **role enforcement backend** ✅ (אוכף ב-Code.gs ב-9 מקומות + 2 חדשים ב-v2.10.0)
- **XSS protection** ✅ (v2.9.20 — escapeHtml() + 10 sinks)
- **localStorage quota guard** ⚠ (utility קיים, לא הוחל על 14 מקומות)
- **DEV_BYPASS_AUTH** 🔴 `true` — חוסם go-live אמיתי. ראה DEPLOY_v2.10.2_GO_LIVE.md

---

## 📋 Deploy flow

### Frontend (אוטומטי דרך GitHub Pages)
1. ערוך `index_8.html`
2. עדכן `APP_VERSION` (3 שורות)
3. הרץ syntax + regression tests
4. העתק ל-`index.html`
5. העלה ל-GitHub via web UI
6. GitHub Pages deploy תוך ~2 דק'
7. ודא chip חדש במערכת חיה (hard refresh)

### Backend (ידני דרך Apps Script editor)
1. ערוך `Code.gs`
2. הדבק לעורך Apps Script
3. שמור (`Cmd+S`)
4. Deploy → Manage deployments → Edit → New version → Deploy
5. ודא Web App URL לא השתנה
6. בדוק `GET /exec` מחזיר `{"ok":true,...}`

---

## ⚠️ דברים שלא לעשות

- אל תוסיף שימוש ב-`DEMO_SEED_EVALUATIONS` בלי `getSeedEvalsForResident()` או `isDemoResident()`
- אל תשתמש ב-`innerHTML` עם input משתמש בלי `escapeHtml()`
- אל תוסיף default ל-`role:'resident'` ב-auth path (fail-OPEN)
- אל תיגע ב-`USERS` array — השתמש ב-`user_overrides.json`
- אל תשנה `Code.gs` אם הפיצ'ר אפשרי ב-frontend בלבד
- **אל תפליפ `DEV_BYPASS_AUTH = false` אוטומטית** — דורש החלטה + checklist

---

## 🎯 הצעד הבא

1. **קריאה**: `STABILITY_REPORT_v2.10.0.md` (דוח עומסים)
2. **החלטה + ביצוע**: `DEPLOY_v2.10.2_GO_LIVE.md` (go-live checklist)
3. **לאחר flip**: QA runtime על 5 תפקידים + Macro flow end-to-end + User Lifecycle
