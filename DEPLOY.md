# הוראות העלאה ל-GitHub Pages

מדריך שלב-אחר-שלב להעלאת הדמו לאינטרנט. לוקח כ-10 דקות.

---

## שלב 1: יצירת חשבון GitHub (אם אין לך)

1. כנס ל-[github.com](https://github.com)
2. לחץ **Sign up** והשלם את הפרטים
3. אמת את כתובת המייל שלך

> 💡 השתמש בחשבון אישי, לא במייל המוסדי של רמב"ם — זה נוח יותר לעבודה מכל מקום.

---

## שלב 2: יצירת Repository חדש

1. לחץ על **"+"** בפינה הימנית-עליונה ← **New repository**
2. מלא:
   - **Repository name**: `cbme-rambam` (או שם אחר)
   - **Description**: `מערכת הערכת מתמחים – נשים ויולדות`
   - **Public** ✓ (חובה ל-GitHub Pages חינמי)
   - ✗ **אל תסמן** "Add a README" — יש לנו כבר
3. לחץ **Create repository**

---

## שלב 3: העלאת הקבצים

### דרך הקלה: דרך הדפדפן

1. בעמוד הריפו החדש, לחץ **uploading an existing file**
2. גרור את שלושת הקבצים:
   - `index.html`
   - `README.md`
   - `.gitignore`
3. בתחתית, ב-**Commit changes**:
   - **Commit message**: `Initial demo upload`
   - לחץ **Commit changes**

### דרך מתקדמת: דרך Terminal (אם נוח לך)

```bash
cd /path/to/cbme-github
git init
git add .
git commit -m "Initial demo upload"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/cbme-rambam.git
git push -u origin main
```

---

## שלב 4: הפעלת GitHub Pages

1. בריפו ← **Settings** (גלגל שיניים בראש)
2. בתפריט הצד-ימני: **Pages**
3. תחת **Source**:
   - Branch: **main**
   - Folder: **/ (root)**
   - לחץ **Save**
4. המתן 1-2 דקות, ורענן את הדף
5. תראה: `Your site is live at https://YOUR-USERNAME.github.io/cbme-rambam/`

---

## שלב 5: התאמות חשובות לפני הפצה

### 1️⃣ עדכן את כתובת המייל למשוב

פתח את `index.html`, חפש (Ctrl+F) את:
```
const recipient = 'YOUR-EMAIL@rambam.health.gov.il';
```

החלף ב-**מייל אמיתי** שלך — אליו ישלחו הקולגות את המשוב.

### 2️⃣ עדכן את ה-README

פתח את `README.md`, החלף בכל מקום:
- `YOUR-USERNAME` → שם המשתמש שלך ב-GitHub
- `YOUR-EMAIL@rambam.health.gov.il` → המייל שלך

### 3️⃣ העלה את השינויים

- דרך הדפדפן: לחץ על הקובץ → אייקון **עפרון** ← ערוך ← **Commit changes**
- דרך Terminal:
```bash
git add .
git commit -m "Update email and links"
git push
```

---

## שלב 6: הפצה לקולגות

שלח לקולגות את הלינק:
```
https://YOUR-USERNAME.github.io/cbme-rambam/
```

**הצעת תוכן הודעה:**
```
שלום [שם],

הכנו דמו אינטראקטיבי של מערכת הערכת מתמחים חדשה לחטיבה.
זה ייקח לך 5-10 דקות לסקור ולהתרשם.

🔗 הדמו: https://YOUR-USERNAME.github.io/cbme-rambam/

מה לעשות:
1. פתח את הקישור (עדיף ב-Chrome / Edge)
2. נסה את 3 התפקידים מלמעלה (מנהלת / רופא בכיר / מתמחה)
3. לחץ על כפתור "שלח משוב" אם יש לך הערה
4. הכל פיקטיבי — אין נתונים אמיתיים

תודה!
[שם]
```

---

## שלב 7 (אופציונלי): URL מקוצר ויפה

לדמו יש URL ארוך. אפשר לקצר:
- **bit.ly** (חינם) — מייצר לינק כמו `bit.ly/cbme-demo`
- **GitHub Custom Domain** — אם יש לך דומיין משלך

---

## עדכונים עתידיים

כשאתן לך גרסאות חדשות:

1. החלף את `index.html` בגרסה החדשה
2. **Commit changes**
3. הקולגות יראו את העדכון תוך 1-2 דקות בלינק שכבר שלחת

> 💡 **מתחילים פיילוט?** ראה [`PILOT.md`](./PILOT.md) למדריך הפעלה מפורט עם Google Drive.

---

## פתרון בעיות נפוצות

### "הדף ריק / 404 Not Found"
- ודא ש-GitHub Pages מופעל (שלב 4)
- המתן 2-3 דקות אחרי ההפעלה הראשונית
- ודא שהקובץ נקרא **בדיוק** `index.html` (אותיות קטנות)

### "המשוב לא נשלח"
- ודא שעדכנת את המייל ב-`index.html` (שלב 5.1)
- המשוב נשלח דרך מייל הלקוח של המשתמש (Outlook / Gmail)
- אם רוצה לאסוף משוב ללא מייל, אפשר לשלב Google Form (פנה אלי לעזרה)

### "אני רוצה ריפו פרטי"
- GitHub Pages חינמי **דורש ריפו ציבורי**
- לפרטי, צריך GitHub Pro ($4/חודש) — או פתרון אחר כמו Netlify / Vercel

---

## עזרה?

יש בעיה? פתח Issue ב-GitHub או חזור לשיחה כאן.
