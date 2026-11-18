# Sri Brunda Chits – full-stack website (Django)

One Django project serves **both** the website and the database API.
Everything typed on the page (customers, payments, groups, hand loans) is saved in the Django database.

## Run it (Windows PowerShell)

```powershell
cd sri_brunda_backend
py -m venv venv                      # skip if you already have a venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
py manage.py migrate                 # creates the database and Sri Brunda Group 1-26
py manage.py createsuperuser         # this is your login for the website
py manage.py runserver
```

Open **http://127.0.0.1:8000** and sign in with the user you just created.
(Admin screens are at http://127.0.0.1:8000/admin/.)

If PowerShell blocks activation: `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass`

## How it fits together

```
Browser page (chits/static/chits/scripts.js)
   │  sign in:  POST /api/token/  → JWT (kept for the tab session, auto-renewed)
   │  every save/delete → /api/app/...  (Authorization: Bearer <token>)
   ▼
Django (chits/app_api.py)  → models in chits/models.py → db.sqlite3
```

| Page action | Saved in |
|---|---|
| Add / edit / delete customer | `Customer` |
| Tick / untick a payment month | `ChitPayment` (receipt no. `SBC-0001-03`) |
| Change group to 20/24/30 months | `ChitGroup.duration_months` (members' monthly = chit value ÷ months) |
| Hand loans | `HandLoan` |
| Weekly loans (new tab) | `WeeklyLoan` + `WeeklyLoanPayment` (one row per paid week) |
| Backup / Restore buttons | whole database as JSON |

Website endpoints (`/api/app/`): `bootstrap/`, `customers/`, `customers/<id>/`,
`customers/<id>/payments/<month>/`, `groups/<name>/`, `loans/`, `loans/<id>/`, `weekly/`, `weekly/<id>/`, `weekly/<id>/payments/<week>/`, `backup/`, `restore/`.
The standard REST endpoints from the starter (`/api/customers/`, `/api/payments/`, ...) still work.

## Weekly loans

Open the **Weekly Loans** tab → **+ Add weekly loan**. Enter amount, interest **% per week**, number of weeks and start date.
Simple interest = amount × rate% × weeks; weekly installment = (amount + interest) ÷ weeks (e.g. ₹10,000 at 2%/week for 10 weeks → ₹1,200 × 10).
Week *n* is due `start date + 7 × n` days. Use **Payments** to mark each week paid/undo, and 🔔 for a WhatsApp reminder listing overdue weeks.
Run `py manage.py migrate` once to create the new tables. Backups now include weekly loans; restoring an old backup without them leaves your weekly loans untouched.

## Moving old data

- Data saved by the old browser-only version: sign in from the **same browser** and click OK on
  "Upload them to the server now?" (shown only while the database is empty).
- Or use **Restore** with an old backup `.json`.
- Old customers with no group are put in a group called `Unassigned`; pick a real group when you edit them.
  Customers with no join date get today's date (the page tells you which).
- Your earlier `db.sqlite3` still works with this version (no model changes). Copy it next to `manage.py`.
  Customers that are in groups not named "Sri Brunda Group N" show in the table; choose a group when editing them.

## Going live

Set environment variables before starting:

| Variable | Meaning |
|---|---|
| `DJANGO_DEBUG=false` | turns off debug mode |
| `DJANGO_SECRET_KEY` | long random string (required when debug is off) |
| `DJANGO_ALLOWED_HOSTS` | e.g. `chits.example.com` |
| `DJANGO_CSRF_TRUSTED_ORIGINS` | e.g. `https://chits.example.com` |
| `DB_ENGINE=postgres` + `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_HOST`, `DB_PORT` | use PostgreSQL |

Then run `py manage.py collectstatic --noinput` and serve with a production server such as gunicorn/waitress behind HTTPS.
Back up the database regularly (the **Backup** button, or the `db.sqlite3` file).

## Notes

- Login is limited to 10 attempts per minute. Tokens: access 30 min (renewed automatically), session 12 h.
  Tokens are kept in the browser tab's session storage, so a new tab asks you to sign in again.
- CORS is closed by default because the page and API share one address. If you host the page elsewhere,
  set `DJANGO_CORS_ORIGINS=https://your-page-address` (and the page's API address must be changed too).
- Aadhaar numbers are stored as typed; restrict access to this system and consider not storing them.
- Interest, due dates and WhatsApp messages are still calculated in the page, as before.
