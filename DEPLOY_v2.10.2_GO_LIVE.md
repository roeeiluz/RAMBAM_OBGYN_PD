# 🚀 Go-Live Checklist — DEV_BYPASS_AUTH=false (v2.10.2)

> **קריטי**: זהו המעבר ממצב פיתוח לייצור אמיתי. הזהירות חשובה.
> צריך לעבור על הצ'ק-ליסט הזה לפני flipping the switch.

---

## מצב נוכחי (v2.10.1 בייצור)

- ה-frontend פועל ב-**dev mode** — `DEV_BYPASS_AUTH = true` (שורה 672 ב-`index_8.html`)
- כל login הוא ללא אימות: המסך מציג role picker, אפשר לבחור כל משתמש בלי קוד
- כל submit נשמר ב-**localStorage בלבד** של המשתמש; אינו מסונכרן ל-Drive
- ה-Apps Script Code.gs קיים אבל ה-frontend לא ניגש אליו

**משמעות:**
- 🔓 **כל מי שגולש לקישור** רואה מסך role picker — סיכון אבטחה משמעותי
- 📵 **אין סנכרון בין משתמשים** — אם PD שולח בקשה ממכשיר A, Senior במכשיר B לא יראה אותה
- 💾 **כל המידע חי לוקלית** — אם המתמחה מנקה cache של הדפדפן, הכל נעלם

---

## תוכנית המעבר (3 שלבים)

### שלב 1: ודא ש-Code.gs פעיל ומעודכן

לפני שמשנים את הflag, חייב לוודא ש-Apps Script deployed עם v2.10.0:

- [ ] עורך Apps Script: `https://script.google.com/macros/s/AKfycbxCmhq.../edit`
- [ ] הקובץ ב-`Code.gs` כולל את 5 ה-actions החדשות:
  - [ ] `action_submitEvalRequest`
  - [ ] `action_listEvalRequests`
  - [ ] `action_cancelEvalRequest`
  - [ ] `action_submitMicroRequest`
  - [ ] `action_listMicroRequests`
- [ ] `USERS` array בלי `a-iluz` ו-`a-mor` (רק `pd-iluz` ו-`pd-mor`)
- [ ] Deploy → Manage deployments → Edit → New version → Deploy
- [ ] Web App URL לא השתנה (ברירת מחדל בדיפלוי קיים)

**בדיקה ידנית מהירה:**
פתח טאב חדש בדפדפן, נווט ל-Web App URL (`https://script.google.com/macros/s/AK.../exec`).
צריך לראות: `{"ok":true,"message":"CBME OBGYN Apps Script. Use POST.","timestamp":"..."}`.
אם רואים שגיאה — Code.gs לא deployed או SHARED_SECRET לא מתאים.

---

### שלב 2: גיבוי מידע קיים מ-localStorage

כל משתמש שהשתמש במערכת ב-dev mode יש לו מידע בlocalStorage שלו:
- הערכות שמילא
- טיוטות פתוחות
- pad אישי (`cbme_resident_personal_pad`)
- הגדרות (`cbme_user_settings`)
- eval/micro requests (`cbme_eval_requests`, `cbme_micro_requests`)

**אופציה A — איבוד מקובל:** הודע למשתמשים שמה שמילאו עד עכשיו אבד (זה היה מצב פיתוח).

**אופציה B — שמירה לפני המעבר:** הוסף כפתור export בדף הגדרות:
```javascript
function exportLocalStorageToFile() {
  const keys = ['cbme_eval_history', 'cbme_user_settings', 'cbme_resident_personal_pad', 'cbme_eval_requests', 'cbme_micro_requests'];
  const dump = {};
  keys.forEach(k => { dump[k] = localStorage.getItem(k); });
  const blob = new Blob([JSON.stringify(dump, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `cbme-backup-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
}
```

המלצה: בחר A — זה היה dev mode מההתחלה, סביר שהמשתמשים יבינו.

---

### שלב 3: Flip the switch

ב-`index_8.html` שורה 672:

```diff
- const DEV_BYPASS_AUTH = true;
+ const DEV_BYPASS_AUTH = false;
```

ושנה את APP_VERSION:
```diff
- const APP_VERSION = '2.10.1';
+ const APP_VERSION = '2.10.2';
```

ו-APP_VERSION_NOTES:
```javascript
const APP_VERSION_NOTES = "🚀 Go-live: DEV_BYPASS_AUTH=false. Magic Link login enabled. כל submit עכשיו ל-Drive (לא localStorage בלבד). דורש Code.gs v2.10.0 פעיל.";
```

העלה ל-GitHub (קובץ אחד: index.html). GitHub Pages deploy אוטומטי תוך ~2 דק'.

---

## ✅ בדיקה אחרי deploy

### על המכשיר שלך:
1. נווט ל-`https://roeeiluz.github.io/RAMBAM_OBGYN_PD/`
2. **קייז ראשון**: hard refresh (Ctrl+Shift+R / Cmd+Shift+R). ה-chip אמור להראות `v2.10.2`
3. אתה רואה מסך login רגיל (לא role picker)
4. הזן `r_iluz` → לחץ "שלח קוד אימות"
5. בדוק email — מגיע קוד 6 ספרות
6. הזן קוד → אתה נכנס כ-PD
7. נסה לשלוח בקשת הערכה (`+ בקשה חדשה`)
8. לחץ "שלח בקשה"
9. **ב-Drive**: וודא ש-`CBME_OBGYN/eval_requests/2026-Q2/req_*.json` נוצר

### על מכשיר/דפדפן שני (incognito):
10. נווט לאותו URL
11. הזן username של בכיר (למשל `y_zipori`) → קבל קוד → היכנס
12. ראה את הבקשה ב"בקשות משובים והערכותי"

### בכל המכשירים:
- [ ] localStorage המקורי **נמחק** (כי הקוד החדש לא יקבל `_devSeed:true` משם)
- [ ] PD/coordinator/attending/chief/resident — כולם נכנסים רגיל
- [ ] מתמחה משלים הערכה → ב-Drive `evaluations/macro/2026-Q2/...`

---

## ⚠️ אם משהו נשבר אחרי הflip

### "Magic Link לא נשלח"
- בדוק את עורך Apps Script → View → Logs (לוגים של 24 ש' אחרונים)
- ודא ש-MailApp.sendEmail עובד (יש quota יומי של 100 מיילים)

### "אני נכנס אבל אין נתונים בדאשבורד"
- צפוי — ה-localStorage נשאר עם נתונים ישנים שעדיין מוצגים, אבל לא בוצע fetch ראשון ל-Drive
- אופציה 1: ניקוי לוקאלי + relogin → ימשוך מ-Drive
- אופציה 2: וודא שיש `_fetchHistoryFromBackend()` שמתעדכן בעת login

### "החזרה אחורה"
אם משהו לא בסדר וצריך rollback:
```diff
- const DEV_BYPASS_AUTH = false;
+ const DEV_BYPASS_AUTH = true;
```
ועדכן `APP_VERSION` ל-`2.10.3-rollback`, העלה — תוך 2 דק' חוזרים ל-dev mode.

---

## 📋 רשימת בדיקה לפני go-live

- [ ] Code.gs v2.10.0 deployed ל-Apps Script (`/exec` URL פעיל)
- [ ] Admin (אתה) קיבל מייל עם קוד אימות ונכנס בהצלחה
- [ ] בקשת הערכה נוצרה ב-Drive (`eval_requests/...`)
- [ ] Senior במכשיר אחר רואה את הבקשה
- [ ] לפחות מתמחה אחד נכנס והגיש משוב מהיר → רואה ב-Drive
- [ ] גיבוי הוכן (אם בחרת אופציה B) או הודעה נשלחה למשתמשים (אופציה A)
- [ ] בדיקת לחיצה על כפתורים מרכזיים — אין שגיאות console

לאחר Sign-off:
- [ ] שנה `DEV_BYPASS_AUTH = false`
- [ ] ✅ Go live
