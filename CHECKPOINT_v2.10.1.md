# 📍 Checkpoint v2.10.1-stable

> **נקודת שחזור יציבה** — נוצרה 12.5.2026 לפני שינוי המבנה ל-dual environment.
> אם משהו נשבר אחרי השינויים — קרא את הסעיף "איך לחזור" למטה.

---

## מה נשמר בנקודה הזאת

### גרסאות
- Frontend: **v2.10.1** (DEV_BYPASS_AUTH=true)
- Backend: **Code.gs v2.10.0** (5 actions חדשות + dedup pd-iluz/a-iluz)
- GitHub commit: `631cd6a` ב-`main`
- GitHub Pages deployment: #54

### קבצים מגובים ב-`_checkpoint_v2.10.1/`

| קובץ | תוכן |
|---|---|
| `index.html` | mirror של frontend v2.10.1 (630KB) |
| `index_8.html` | working file v2.10.1 (זהה ל-index.html) |
| `Code.gs` | backend v2.10.0 (93KB) |
| `PROJECT_STATE.md` | מצב מלא לתאריך |
| `PROJECT_INSTRUCTIONS.md` | הנחיות עבודה |
| `QUICK_REF.md` | משאבים + line numbers |
| `BACKEND_NOTES.md` | spec של Code.gs additions |
| `STABILITY_REPORT_v2.10.0.md` | דוח עומסים |
| `DEPLOY_v2.10.2_GO_LIVE.md` | checklist להעברה לייצור |
| `SESSION_SUMMARY_2026-05-12.md` | סיכום הסשן |

### מצב המערכת בנקודה הזאת

- **GitHub Pages live URL:** `https://roeeiluz.github.io/RAMBAM_OBGYN_PD/`
- **מודוס:** Dev mode (DEV_BYPASS_AUTH=true) — כל הנתונים בlocalStorage של המשתמש
- **Apps Script status:** Code.gs v2.10.0 קוד מוכן אך **עדיין לא deployed ל-Apps Script editor**
- **Drive data:** עדיין מהתקופה הישנה (לא נוגעת ב-eval_requests/, micro_requests/ folders)

---

## איך לחזור (3 רמות, מהמהירה לעמוקה)

### 🟢 רמה 1 — Rollback של Frontend בלבד (~3 דקות)

**מתי:** אם פיצ'ר חדש שבור והייצור לא עובד לחלק מהמשתמשים.

**איך:**
1. פתח `_checkpoint_v2.10.1/index.html` בOneDrive
2. העתק את התוכן
3. ב-GitHub web UI → ערוך את `index.html` במקור הריפו → הדבק → Commit
4. תוך 2 דקות ה-GitHub Pages יחזיר את הגרסה הישנה
5. ודא ב-chip בתחתית המסך שאתה רואה `v2.10.1`

**אופציה נוספת (אם Cowork פעיל):** "Cowork, חזור ל-checkpoint v2.10.1 בfrontend" — אני יעלה את הקובץ ידנית.

### 🟡 רמה 2 — Rollback של Backend (Code.gs) (~5 דקות)

**מתי:** אם פיצ'ר backend חדש מתנהג רע. שים לב: Apps Script שומר היסטוריית גרסאות אוטומטית, אז זה הכי קל מבין כל ה-rollbacks.

**איך (פשוט):**
1. עורך Apps Script: `https://script.google.com/.../edit`
2. Deploy → Manage deployments → Edit → Version dropdown
3. בחר את הגרסה הקודמת מהרשימה → Deploy
4. תוך 30 שניות הקוד הישן חי

**אם Apps Script version dropdown לא זמין (גרסה ידנית):**
1. פתח `_checkpoint_v2.10.1/Code.gs` בOneDrive
2. העתק את התוכן
3. ב-עורך Apps Script → סמן הכל, הדבק
4. Deploy → New version

### 🔴 רמה 3 — Rollback מלא של Drive (לא צריך לרוב)

**מתי:** רק אם נתונים אמיתיים נמחקו או הושחתו בDrive. **לא צריך אם רק שינינו קוד.**

**איך:**
- Drive Trash: קבצים נשארים שם 30 יום אחרי מחיקה. `drive.google.com → Trash → Restore`
- Drive Version history per file: לחץ ימני על קובץ → Manage versions
- Time-machine של רמב"ם (אם זמין): שאל את IT

---

## ⚠️ דברים שחשובים להבין

### מה לא צריך לדאוג ממנו
- **עדכון index.html אינו דורס נתוני מתמחים**. הקוד הוא רק "קורא" של הנתונים שב-Drive.
- **localStorage שגוי בקוד חדש** = אובדן cache לוקאלי, אבל Drive (האמיתי) נשאר.
- **GitHub history** שומר כל commit לנצח — תמיד יש דרך חזרה.

### מה כן צריך לדאוג ממנו
- **שינויי שדות בstored evaluations** — אם פיצ'ר חדש משנה את המבנה של איך הערכה נכתבת ל-Drive, וגרסה ישנה לא יודעת לקרוא אותו, יש בעיית תאימות. הכלל: רק להוסיף שדות, לא להסיר/שנות שמות.
- **שינוי SHARED_SECRET** — אם הוא משתנה, כל ה-sessions הפעילים מבוטלים. לא קריטי, אבל המשתמשים יצטרכו login מחדש.
- **שינוי WEB_APP_URL** — אם מ-Apps Script נוצר deployment חדש (לא edit על קיים), ה-URL משתנה. הfrontend הישן עדיין יפנה לישן → תוצאה: 404. הכלל: תמיד Edit existing deployment, לא New deployment.

---

## 🎯 איך לאמת שה-checkpoint תקין

הרץ את הבדיקה הבאה ב-bash (ב-Cowork או טרמינל):
```bash
cd "/sessions/peaceful-adoring-brahmagupta/mnt/CBME/_checkpoint_v2.10.1/"
grep "const APP_VERSION " index.html | head -1
# צריך להחזיר: const APP_VERSION = '2.10.1';

grep "const DEV_BYPASS_AUTH" index.html | head -1
# צריך להחזיר: const DEV_BYPASS_AUTH = true;

grep "v2.10.0: Distribution" Code.gs | head -1
# צריך להחזיר: // v2.10.0: Distribution mechanism (eval + micro requests)
```

אם 3 הבדיקות עוברות — ה-checkpoint תקין ושמיש.

---

## 📅 רישום

- **תאריך יצירה:** 12.5.2026
- **GitHub commit:** `631cd6a`
- **Deployment:** #54 ב-GitHub Pages
- **קונטקסט:** לפני מעבר ל-dual environment (dev/ + prod paths)
- **נוצר ע"י:** Claude (Cowork) בהוראת ד"ר רועי אילוז
