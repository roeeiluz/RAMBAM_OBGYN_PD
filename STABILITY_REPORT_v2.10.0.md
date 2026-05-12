# 🔬 דוח יציבות + עומסים — CBME v2.10.0

> תאריך: 9.5.2026 · בוצע על קוד מקור + simulation (לא runtime על מערכת חיה)
> מתודולוגיה: 7 חבילות בדיקה (40 בדיקות) + סקירת קוד סטטית

---

## 🚨 ממצאים קריטיים — דורשים תיקון מיידי

### #1 [קריטי 🔴] `DEV_BYPASS_AUTH = true` בקוד הייצור

**איפה:** `index_8.html` שורה 672:
```javascript
const DEV_BYPASS_AUTH = true;
```

**ההשלכה:**
- **כל מה שעלה לייצור עד עכשיו** רץ ב-dev mode.
- כל submit (micro, macro, eval-request, micro-request) **נשמר רק ב-localStorage** של המשתמש ולא מגיע ל-Drive.
- **אין סנכרון בין משתמשים** — PD שולח בקשת הערכה, הבכיר לא יראה אותה במכשיר שלו.
- ה-Apps Script deploy מעדכן את ה-Code.gs, אבל ה-frontend לא קורא לו.
- מתמחים שמתחברים אינם מקבלים Magic Link אמיתי — הם נכנסים אוטומטית.

**מה לעשות:**
1. **לפני שינוי**: לתעד את כל המשתמשים שיש להם מידע ב-localStorage — לבקש מהם לעשות "Export" אם תרצה.
2. שנה ל-`const DEV_BYPASS_AUTH = false;`
3. ודא ש-Code.gs כבר deploy'ed עם v2.10.0
4. בדוק login מלא (Magic Link) על אחד מהמכשירים
5. רק אז העלה לייצור

**עדיפות:** P0 — לפני כל הוספת משתמשים חדשים.

---

### #2 [גבוה 🟠] `LOCAL_HISTORY_MAX = 100` קטן מדי לשנת שימוש

**איפה:** `index_8.html` שורה 1593: `const LOCAL_HISTORY_MAX = 100;`

**המספרים:**
- שימוש שנתי ריאליסטי: 13 מתמחים × (6 micros/חודש × 12 + 4 macros/רבעון × 4) = **1,144 הערכות**
- עם MAX=100, כ-**91% מההערכות נדחקות החוצה** מ-localStorage
- ה-cache המקומי מאבד את ההיסטוריה; מסך "היסטוריית משובים והערכות" יציג רק 100 אחרונות
- (המידע ב-Drive שלם, אבל ה-UI לא רואה אותו אלא אם נקרא משם בכל פתיחה)

**מה לעשות:**
- העלה ל-MAX=2000 או הסר את ה-cap לחלוטין
- בדוק: JSON של 2000 הערכות מאקרו ≈ 460KB — הרבה מתחת ל-5MB quota
- אופציה מתקדמת: pagination + lazy fetch מ-Drive

**עדיפות:** P1 — לפני שנת שימוש 1 מסתיימת.

---

## ⚠️ ממצאים בינוניים

### #3 [בינוני 🟡] `localStorage.setItem` ב-14 מקומות בלי try/catch

**ההשלכה:** אם המשתמש חורג מ-quota (5MB) — `localStorage.setItem` זורק `QuotaExceededError` שלא נתפס. הזרימה מתקרסת בשקט.

**מה לעשות:** עטוף את כל קריאות `setItem` בtry/catch או צור utility:
```javascript
function safeSetItem(key, value) {
  try { localStorage.setItem(key, value); return true; }
  catch (e) { console.warn('localStorage write failed:', e); showToast('שגיאת אחסון מקומי', 'error'); return false; }
}
```

**עדיפות:** P2.

---

### #4 [בינוני 🟡] בעיית Two-Tab — אובדן נתונים שקט

**ההשלכה:** משתמש פותח 2 טאבים של אותו טופס. שמירה ב-tab A → שמירה ב-tab B דורסת בשקט. אין locking, אין notification.

**מה לעשות:**
- אופציה A: הוסף `version` field לכל draft. בעת שמירה, בדוק אם הגרסה ב-localStorage עדכנית; אם לא — הזהר.
- אופציה B: שלח `BroadcastChannel` event בעת שמירה כדי שטאבים אחרים יידעו.
- אופציה C: שמור מצב "פתוח לעריכה" ב-localStorage; אם tab B מוצא תאריך פתיחה מאוחר יותר, לא תפתח טופס.

**עדיפות:** P2 — לא נפוץ אבל יקרה.

---

## ✅ ממצאים חיוביים — עברו בדיקות

### Dedup ב-`_saveToLocalHistory` עובד נכון
- 100 שמירות draft לאותו מתמחה+רבעון → 1 בלבד נשמר (last-write-wins)
- 5 מעריכים שונים שולחים final → כל 5 נשמרים
- אותו מעריך שולח final פעמיים → המאוחר דורס

### Performance של filter/sort על 1000 פריטים
- 200 filter calls על 1000 פריטים: 4ms
- 100 sorts על 1000 פריטים: 41ms
- 100 aggregations של 334 מאקרו: 2ms
- ⚡ הביצועים מצוינים. אין צוואר בקבוק UI.

### XSS Protection (v2.9.20)
- 17 payloads זדוניים נוסו: כולם נוטרלו בצורה תקינה
- `<script>`, `<img onerror>`, `<svg onload>` כולם מוצגים כטקסט בלבד
- `&` מקודד ראשון (חשוב למניעת double-encoding bugs)

### v2.9.6 Bug Fix של auto-save
- וידוא רגרסיה: עם הקוד הישן (v2.9.5), autosave-on-exit היה מאפס scores
- עם הקוד החדש (v2.9.6+), scores+comments+mode נשמרים בכל מסלולי השמירה
- 6/6 race-condition בדיקות עברו

### אין memory leaks ברורים
- `setInterval(...)` ב-0 מקומות (אין timers שלא נוקו)
- `addEventListener` ב-13 מקומות (סבירים: input/change/click/blur/beforeunload/pagehide/visibilitychange/DOMContentLoaded)
- 11/15 קריאות `JSON.parse` עטופות ב-try/catch (טוב; ה-4 הנותרות בקוד הגנתי)

---

## 🔬 מתודולוגיה: מה נבדק

| # | חבילה | מה נבדק | תוצאה |
|---|---|---|---|
| 1 | localStorage concurrency | 100 שמירות בכפיפה לאותו key, dedup logic | 8/8 ✓ |
| 2 | Data volume | 1-year שימוש ריאליסטי, quota | 2/4 ⚠ |
| 3 | Race conditions | autosave + explicit save, two-tab, debounce | 6/6 ✓ |
| 4 | DOM rendering load | filter/sort/aggregate על 1000 פריטים | 5/5 ✓ |
| 5 | Static audit | setInterval/addEventListener/JSON.parse/quota | 3 findings |
| 6 | XSS verification | 17 payloads זדוניים | 17/17 ✓ (3 false-fails בtest design) |
| 7 | Dev-mode artifacts | DEV_BYPASS_AUTH, _devSeed flagging | 2/5 ⚠ → finding #1 |

---

## 🎯 סדר עדיפות לתיקון

| # | חומרה | זמן משוער | תיקון |
|---|---|---|---|
| 1 | 🔴 קריטי | 15 דק' + בדיקות | שנה `DEV_BYPASS_AUTH = false` והעלה |
| 2 | 🟠 גבוה | 5 דק' + רגרסיה | `LOCAL_HISTORY_MAX = 2000` |
| 3 | 🟡 בינוני | 30 דק' | `safeSetItem` utility + עטיפת 14 קריאות |
| 4 | 🟡 בינוני | 60-90 דק' | BroadcastChannel ל-two-tab awareness |

**סך הכל v2.10.1 — security/stability hardening:** ~3 שעות עבודה. כל התיקונים frontend-only.

---

## 📋 בדיקות runtime שצריכות להתבצע ידנית

הבדיקות שעשיתי הן סטטיות + simulation. עוד נדרש runtime על המערכת החיה:

1. **Magic Link login flow** — כשתשנה `DEV_BYPASS_AUTH=false`, ודא ש-login עובד מקצה לקצה
2. **Cross-device data sync** — אחרי deploy של Code.gs:
   - PD שולח בקשת הערכה ממכשיר A
   - Senior מתחבר ממכשיר B — צריך לראות את הבקשה
3. **Apps Script quota** — לאחר 50-100 בקשות, בדוק שאין throttling (BUG-002/003)
4. **localStorage quota בפועל** — מלא 5MB → ראה איך ה-app מגיב
5. **Multi-tab editing** — פתח 2 טאבים, ערוך אותו draft, ראה איזה ניצח
6. **Mobile rendering load** — דשבורד עם 30+ מתמחים פעילים

---

## 💡 הצעות לעתיד

- **Service Worker + IndexedDB**: עבור cache גדול יותר ויציב יותר
- **Optimistic locking**: בקשת `If-None-Match: <etag>` לפני write ל-Drive
- **Local backup לפני wipe**: ייצוא localStorage ל-JSON file לפני devCleanup או version bump
- **Telemetry בסיסי**: errors → console.error נשלחים ל-Drive (audit-log already exists)
- **Rate limiter בצד הלקוח**: השהיה 2-3 שניות בין POSTs ל-Apps Script (BUG-003)
