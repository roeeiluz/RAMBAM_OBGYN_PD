# 🤖 הנחיות עבודה — Claude × CBME

> **שים מסמך זה ב-Project Instructions ב-Claude Projects.** הוא ייטען בכל סשן חדש.
> תאריך עדכון אחרון: **12.5.2026** · גרסה נוכחית: **v2.10.1** frontend / **v2.10.0** backend (awaiting deploy)

---

## 1. מי אני (המשתמש)

ד"ר רועי אילוז (`r_iluz@rambam.health.gov.il`):
- **PD** במחלקת נשים-יולדות, רמב"ם
- משתמש מתקדם בטכנולוגיה, **לא מפתח מקצועי**
- Mac + OneDrive: `/Users/mac_iluz/Library/CloudStorage/OneDrive-Personal/CLAUDE WORKSHOP/משובי מתמחים/COWORK_V1/CBME/`
- מעלה ל-GitHub ידנית; מעלה ל-Apps Script ידנית
- **מתקשר בעברית** (חוץ ממונחי קוד)

---

## 2. עקרונות עבודה — חובה לעקוב

### 2.1 הקובץ העובד הוא `index_8.html`
- `index.html` זה ה-mirror שמעלים ל-GitHub (זהה לתוכן)
- **תמיד אמת מול `APP_VERSION`** ב-`index_8.html` (~שורה 666) — ה-line numbers זזים. השתמש ב-grep.

### 2.2 לפני כל שינוי — הבן את ההקשר
- 6 קבצי docs ב-OneDrive: PROJECT_STATE.md, PROJECT_INSTRUCTIONS.md, QUICK_REF.md, BACKEND_NOTES.md, STABILITY_REPORT_v2.10.0.md, DEPLOY_v2.10.2_GO_LIVE.md
- קרא רק את הרלוונטיים (לא הכל בכל שינוי)

### 2.3 יציבות לפני פיצ'רים
1. הרץ `node --check` על JS שחולץ
2. הרץ regression tests
3. הצג `X/Y עברו` לפני סיום — **מינימום 10 בדיקות**

### 2.4 גרסאות — תמיד bump
לאחר כל שינוי:
```javascript
const APP_VERSION = '2.X.Y';
const APP_VERSION_DATE = '...';
const APP_VERSION_NOTES = '...';
```
- PATCH (.0.X) — תיקוני באגים
- MINOR (.X.0) — פיצ'ר חדש
- MAJOR (X.0.0) — breaking change

### 2.5 Frontend-first
- שינוי ב-`Code.gs` דורש Apps Script deploy ידני
- אם פיצ'ר אפשרי רק ב-frontend — **תעדיף את זה**
- כשעובדים על Code.gs, יש לעדכן את `DEPLOY_v2.10.2_GO_LIVE.md` בהתאם

### 2.6 הגנה על נתוני דמו
- מתמחה דמו אחד: **רן דוגמן** (`isDemo: true`)
- **כל גישה** ל-`DEMO_SEED_EVALUATIONS` דרך `getSeedEvalsForResident(name)` whitelist
- אם הauth fails → **block**, לא user סינתטי

### 2.7 fail-CLOSED, לא fail-OPEN
default ל-`role:'resident'` הוא anti-pattern.

### 2.8 תקשורת בעברית
- UI strings + הסברים — בעברית
- function names + JS keywords — באנגלית
- הערות בקוד — באנגלית

### 2.9 שינוי משמעותי = 2-3 חלופות
לא לקבל החלטות עיצוב גדולות לבד.

### 2.10 אל תוציא קוד גדול בצ'אט
ערוך עם Edit. בצ'אט רק: מה השתנה, איפה, בדיקות.

### 2.11 שאלה חוזרת = ענה שוב בקצרה
ולא להיות גס.

### 2.12 אם משהו לא ברור — שאל
לא "להשלים מהתחת".

---

## 3. החלטות שכבר נסגרו — אל תפתח מחדש

אם משהו שאני מציע מתנגש עם הרשימה — **חייב לבקש אישור מפורש**.

### Roles + methodology
- **5 תפקידים**: pd, coordinator, attending, chief, resident
- **ACGME 2.0** (לא 1.0)
- **Two-Tier Transparency** (visible + private note)
- **8 קטגוריות אירועים**: delivery, cs, or, lap, triage, oncall, ward, clinic
- **Magic Link auth** (לא Google OAuth)
- **רן דוגמן** — היחיד עם DEMO data

### Naming (אחרי v2.9.13-21)
- "הערכה מיידית/מהירה" → **"משוב מהיר"** בכל מקום
- "סטטוס משובים" → **"היסטוריית משובים והערכות"**
- KPI "יעדים" — **הוסר**. הוחלף ב"המשימות שלי לתקופה" (3 קופסאות)
- "פיילוט" → **CBME / תוכנית / המערכת**

### Lifecycle
- **5 פעולות**: add (PD/רכזת), archive/restore/replace/promote (PD-only)
- **`user_overrides.json`** דרך הארכוב למשתמשים סטטיים
- **Position vs Person** — `replace_user_in_role`, לא add+archive

### Distribution (v2.9.12-14)
- PD/coordinator שולחים בקשת הערכה תקופתית עם deadline
- Resident מבקש משוב מהיר מבכיר (אחרי ניתוח/יום עבודה)
- Senior רואה את שני הסוגים ב"בקשות משובים והערכותי"
- **Deadline lock**: ב-23:00 ביום היעד ההערכה ננעלת

### PD Macro Approval (v2.9.10, v2.9.15)
- ציון משוקלל סופי מתעדכן live כש-PD עורך
- Confirm dialog לפני "אשר ושלח"
- שדה "2 נקודות עיקריות לשיפור" + "יעדים" — מוצגים בדשבורד המתמחה

### Mobile UX (v2.9.7-8, v2.9.17)
- Top-bar מקוצר במובייל (שם קצר + תפקיד)
- Bottom-nav 4 + "⋯ עוד" (sheet עם מתודולוגיה + הגדרות)
- מסך אריחי הערכה תקופתית — 2x2 גם במובייל

### Security (v2.9.20)
- `escapeHtml()` global utility
- כל user-controlled ל-innerHTML עוטף
- AI Coach דרך `getSeedEvalsForResident()`

---

## 4. הצעד הקריטי הבא

**`DEV_BYPASS_AUTH = true` בייצור** (line ~672) — חוסם go-live אמיתי.

לפני flipping → קרא את `DEPLOY_v2.10.2_GO_LIVE.md` ב-OneDrive ועבור את ה-checklist:
1. Apps Script Code.gs v2.10.0 deployed
2. החלטה על גיבוי dev-mode data
3. Flip → v2.10.2 → bump → push

לא לפלוט את זה אוטומטית — דורש החלטה שלי כמשתמש.

---

## 5. מבנה הפרויקט

**קבצים פעילים ב-OneDrive CBME/:**
- `index_8.html` — frontend (v2.10.1, ~565KB)
- `index.html` — mirror ל-GitHub (זהה לתוכן)
- `Code.gs` — backend (v2.10.0, awaiting Apps Script deploy)
- `PROJECT_STATE.md` — סנאפשוט נוכחי + version history
- `PROJECT_INSTRUCTIONS.md` — זה
- `QUICK_REF.md` — קישורים + line numbers
- `BACKEND_NOTES.md` — spec ל-Code.gs additions (כעת מומש)
- `STABILITY_REPORT_v2.10.0.md` — דוח עומסים 12.5.26
- `DEPLOY_v2.10.2_GO_LIVE.md` — checklist להעברה לייצור

**Archive:**
- `_archive/00_START_HERE.md`, `01_API_CONTRACT.md`, `02_DEPLOY_GUIDE.md`, `03_DEPLOY_NOW.md`, `README.md`, `CBME_QA_Report_v2.7.1.docx`

---

## 6. ❤️ העיקר

המערכת תשפיע על איך 13+ מתמחים יחיו את ההתמחות שלהם בשנים הבאות.

**עדיף 1 פיצ'ר יציב מ-3 פיצ'רים שבורים.**

לפני כל commit אל main — תוודא:
- Static tests passing
- אין `DEMO_SEED` access ללא whitelist
- אין `innerHTML` של user input ללא `escapeHtml()`
- bump גרסה
- update PROJECT_STATE
