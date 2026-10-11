# FocusFlow — Full Stack Integration

DecodeLabs Full Stack Development Internship — **Project 4: Frontend & Backend Integration**

FocusFlow is a student productivity and study dashboard. This final project connects the **frontend** to the **REST API** and the **PostgreSQL database**, so it works as one complete full-stack application: every task and study session you create is saved in the database and is still there after a reload.

## 1. Project overview

| Part       | Technology                                     | Folder      |
| ---------- | ---------------------------------------------- | ----------- |
| Frontend   | HTML5, CSS3, Vanilla JavaScript (`fetch`)      | `frontend/` |
| Backend    | Node.js, Express.js, REST API, CORS            | `backend/`  |
| Database   | PostgreSQL (`pg`)                              | `backend/`  |

No React, Vue, Angular, Axios or jQuery is used. All requests use the native `fetch()` API.

## 2. How the four weeks fit together

1. **Week 1 — Frontend:** the responsive FocusFlow interface (HTML, CSS, JavaScript). Data was sample data inside the page.
2. **Week 2 — Backend:** a REST API with Express, using an in-memory array.
3. **Week 3 — Database:** the in-memory array was replaced by PostgreSQL, giving persistent data and full CRUD.
4. **Week 4 — Integration (this project):** the frontend now loads, creates, updates and deletes everything through the API. The database is the single source of truth.

## 3. Architecture

```
USER ACTION             user adds a task
   |
FRONTEND JAVASCRIPT     frontend/script.js
   |  fetch()           HTTP request with a JSON body
   v
EXPRESS API             backend/  routes -> validation -> controllers
   |  SQL
   v
POSTGRESQL DATABASE     tasks, study_sessions
   |
   v
JSON RESPONSE           { "success": true, "data": ... }
   |
FRONTEND JAVASCRIPT     checks response.ok, parses the JSON
   |
   v
DOM UPDATE              the list, counters and charts are redrawn
   |
   v
USER SEES THE NEW DATA
```

The frontend contains **no database logic**. It only sends requests. The backend validates the data and talks to the database.

## 4. Project structure

```
FocusFlow/
├── .gitignore
├── frontend/
│   ├── index.html
│   ├── style.css
│   ├── script.js            all fetch() calls and DOM updates
│   └── assets/images/
└── backend/
    ├── server.js
    ├── package.json
    ├── .env.example         copy to .env and fill in
    ├── .gitignore
    ├── config/db.js         PostgreSQL connection pool
    ├── database/
    │   ├── schema.sql
    │   └── seed.sql
    ├── routes/              taskRoutes, studyRoutes, statsRoutes
    ├── controllers/         taskController, studyController, statsController
    └── middleware/          validation.js, errorHandler.js
```

## 5. API endpoints

| Method | URL                         | Used by the frontend for                  |
| ------ | --------------------------- | ----------------------------------------- |
| GET    | `/api/health`               | health check                              |
| GET    | `/api/tasks`                | load the task list on page load           |
| POST   | `/api/tasks`                | add a task                                |
| PUT    | `/api/tasks/:id`            | tick / untick a task, edit title and text |
| DELETE | `/api/tasks/:id`            | delete a task                             |
| GET    | `/api/study-sessions`       | load the study sessions                   |
| POST   | `/api/study-sessions`       | add a session (also "Save Study Session" after the timer) |
| PUT    | `/api/study-sessions/:id`   | edit a session                            |
| DELETE | `/api/study-sessions/:id`   | delete a session                          |
| GET    | `/api/stats`                | dashboard numbers (calculated by PostgreSQL) |

(`GET /api/tasks/:id` and `GET /api/study-sessions/:id` also exist.)

## 6. How to run

You need **Node.js 18+** and a **PostgreSQL** database (local, or free on Supabase / Neon).

### Backend (http://localhost:3000)

```bash
cd backend
npm install
cp .env.example .env          # Windows: copy .env.example .env
```

Edit `backend/.env`:

```
PORT=3000
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@localhost:5432/focusflow
DATABASE_SSL=false            # use true for Supabase / Neon
CORS_ORIGINS=http://localhost:5500,http://127.0.0.1:5500
```

Create the tables, add the sample data and start the server:

```bash
npm run db:schema
npm run db:seed               # optional sample data (empties the tables first)
npm start
```

### Frontend (http://localhost:5500)

In a second terminal:

```bash
cd frontend
npx serve -l 5500
```

Or open the `frontend` folder in VS Code and use the **Live Server** extension (it uses port 5500). Then open http://localhost:5500.

The backend address is written in one place only, at the top of `frontend/script.js`:

```js
const API_BASE_URL = "http://localhost:3000/api";
```

## 7. Frontend to backend communication

### `fetch()`

`fetch()` is the browser's built-in way to send an HTTP request. All the requests go through one function, `apiRequest()`, and these are the four kinds:

```js
// READ
fetch(`${API_BASE_URL}/tasks`)

// CREATE
fetch(`${API_BASE_URL}/tasks`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(data)
})

// UPDATE
fetch(`${API_BASE_URL}/tasks/${id}`, {
  method: "PUT",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(data)
})

// DELETE
fetch(`${API_BASE_URL}/tasks/${id}`, { method: "DELETE" })
```

### `async` / `await`

`fetch()` takes time, so it returns a *Promise*. `await` pauses the function until the answer arrives, so the code reads top to bottom instead of nested `.then().then()` chains. A function that uses `await` is declared `async` (for example `async function loadTasks()`).

### JSON

JSON is a text format for data that both sides understand.

- **Serialization:** `JSON.stringify(object)` turns a JavaScript object into JSON text to send.
- **Deserialization:** `await response.json()` turns the JSON text that came back into a JavaScript object.

Requests that send data use the header `Content-Type: application/json`.

### `response.ok` and HTTP status codes

`fetch()` only throws an error when the *network* fails (server off, no internet). For `400`, `404` or `500` it still "succeeds". So the code always checks `response.ok` (true for status 200-299) before using the data, and turns any problem into a friendly message:

| Status | Meaning                | What the user sees                                |
| ------ | ---------------------- | ------------------------------------------------- |
| 200 / 201 | OK / Created        | the page updates                                  |
| 400 / 422 | Invalid input       | the server's clear message (e.g. "Task title must be between 3 and 100 characters") |
| 404    | Not found              | "That item was not found. It may already have been deleted." |
| 5xx    | Server error           | "The server ran into a problem. Please try again in a moment." |
| network failure / timeout | server unreachable | "Unable to connect to the FocusFlow server. Please check that the backend is running." |

### `try` / `catch` / `finally`

Every network action uses all three parts:

```js
try {
  showLoading();
  const response = await fetch(...);
  if (!response.ok) throw new Error("Failed to load tasks");
  const data = await response.json();
  renderTasks(data.data);
} catch (error) {
  showError(error.message);      // friendly message, never a raw error
} finally {
  hideLoading();                 // always runs, even after an error
}
```

`finally` is what guarantees that loading spinners are removed and buttons are re-enabled even when a request fails.

### CORS

The frontend (`localhost:5500`) and the API (`localhost:3000`) are different *origins*. By default a browser **blocks** a page from reading responses from another origin. CORS is how the API says "this origin is allowed". The backend uses the `cors` package with an allow-list (`CORS_ORIGINS`), so only the frontend's address is accepted. Nothing is disabled or bypassed in the browser.

## 8. Complete flow: adding a task

1. The user types a task and submits the form.
2. The frontend does a basic check (the title must be 3 to 100 characters) and disables the button, which shows "Saving...".
3. `fetch()` sends `POST /api/tasks` with `{ "title": "...", "description": "..." }`.
4. The backend validates the data. Bad input gets a `400` response.
5. The controller runs a parameterized `INSERT` in PostgreSQL.
6. The backend answers `201` with the new row as JSON.
7. The frontend checks `response.ok` and reads the JSON.
8. The frontend asks the API again (`GET /api/tasks` and `GET /api/stats`), because **the database is the source of truth**.
9. The list, the counters and the dashboard are redrawn. The page never reloads.
10. `finally` restores the button, and a "Task added successfully!" toast appears.

Update, delete and study sessions follow the same flow.

## 9. User-interface states

| State   | What is shown                                                           |
| ------- | ----------------------------------------------------------------------- |
| Loading | "Loading your tasks..." with a spinner (also for sessions and stats)    |
| Empty   | "No tasks yet. Add one to get started!"                                 |
| Error   | A clear message with a **Try Again** button that repeats the request    |
| Success | A toast, such as "Task added successfully!"                             |
| Saving  | The submit button is disabled and says "Saving..."                      |

The dashboard header also shows whether the last request reached the server ("Connected to server" or "Server unreachable").

## 10. Defensive programming and security

- Responses are checked before use: `payload.data` must be an array or object, every task and session is normalised, and bad entries are skipped, so one malformed response cannot break the page.
- Zero tasks is handled safely (progress shows 0% instead of dividing by zero).
- Text from the database is inserted with `textContent`, never `innerHTML`, so it can never run as HTML.
- Each request has a 10 second timeout.
- No database address, password or secret is in the frontend. The backend reads them from `.env`, which is not committed.
- The backend validates everything again, because frontend checks can be bypassed. Database `CHECK` constraints are a third layer.
- Every SQL query is parameterized (`$1, $2 ...`), which prevents SQL injection.

## 11. Pomodoro timer

The timer runs in the browser only and needs no API. When a focus session finishes, a **Save Study Session** button appears. Pressing it sends the session to `POST /api/study-sessions`.

## 12. Responsive design

The Week 1 responsive design is unchanged: mobile-first, CSS Grid and Flexbox, tested from 320px to 1440px. Loading, error and empty states are also designed for small screens.

## 13. Testing checklist

- **Load:** the page opens, the requests are sent, tasks and sessions come from the database.
- **Create:** add a task, see it appear, reload the page, it is still there.
- **Update:** tick a task, edit a task, edit a study session.
- **Delete:** delete a task and a study session (a confirmation is shown first).
- **Errors:** stop the backend and the page shows "Unable to connect..." with Try Again; submitting a too short title shows the server's 400 message; deleting an already deleted item shows the 404 message.
- **Loading:** the spinner appears and then disappears.
- **CORS:** requests from `localhost:5500` are accepted.
- **Responsive:** mobile, tablet and desktop.

## 14. Future improvements

- User accounts and login, with a `user_id` foreign key
- Task due dates and categories
- Pagination
- Automated tests
- Deploying the frontend and the API
