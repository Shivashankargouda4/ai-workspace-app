# Major Project Viva Voce Defense & Presentation Guide
## AI-Powered Real-Time Collaborative Workspace with Predictive Analytics

**Candidate:** Shivashankargoud B R (Reg No: **KUB25MCA019**)  
**Program:** Master of Computer Applications (MCA)  
**Department:** Computer Science & Applications  
**Institution:** Kishkindha University  

---

## 1. Slide-by-Slide Presentation Structure (PPT Template)

### Slide 1: Title & Candidate Information
- **Title:** AI-Powered Real-Time Collaborative Workspace with Predictive Analytics
- **Candidate:** Shivashankargoud B R (KUB25MCA019)
- **Degree:** Master of Computer Applications (MCA)
- **Department:** Department of Computer Applications, Kishkindha University

### Slide 2: Problem Statement & Motivation
- **The Core Problem:** Modern project management tools (Jira, Trello) are purely *reactive*—delays are only identified after deadlines have expired.
- **Root Causes:** Unmonitored mid-sprint velocity drops, uneven assignee workloads, and lack of real-time multi-tenant communication within the same tool.
- **Proposed Solution:** An integrated collaborative workspace combining WebSocket-based team communication with a machine learning classification engine that assigns predictive delay risk badges to active tasks before deadlines pass.

### Slide 3: Objectives & Scope
- **Primary Objectives:**
  1. Build a multi-tenant workspace with strict role-based data isolation (Admin, Manager, Member).
  2. Implement bidirectional real-time communication via WebSockets with persistent message history.
  3. Train and deploy a machine learning model to predict task delay probability ($p \ge 0.70 \rightarrow \text{High Risk}$).
  4. Integrate a rule-based extractive summarization and heuristic action-item extraction assistant (with optional Gemini support).
  5. Provide an installable Progressive Web App (PWA) for Android and desktop devices.

### Slide 4: System Architecture
- Multi-tier architecture diagram:
  - **Client:** React 18 SPA, Vite, Tailwind CSS, TanStack Query, Recharts, PWA Service Worker (`sw.js` app-shell cache; `/api/` always network-fresh).
  - **API Server:** Express.js, Socket.IO, Helmet, `express-rate-limit` (`skipSuccessfulRequests: true`), JWT (`userId`-only access tokens) + `httpOnly` refresh cookies.
  - **ML Microservice:** Python 3.12, FastAPI, scikit-learn Pipeline (Joblib) with 10-second timeout and graceful fallback.
  - **Database:** PostgreSQL 18 with **21 normalized tables** (`001_initial_schema.sql` + `003_invitations_and_departments.sql` + `004_v2_features.sql` + `005_code_and_meetings.sql`) and foreign key constraints.

### Slide 5: Machine Learning Methodology & Honest Findings
- **Dataset:** 3,000 synthetic task records (probabilistic generation reflecting mid-sprint velocity).
- **Validation:** 5-Fold Stratified Cross-Validation:
  - Logistic Regression (Baseline): **90.17%** (±0.97%) CV Accuracy, 0.966 ROC-AUC.
  - Random Forest (Primary): **89.03%** (±1.03%) CV Accuracy, 0.956 ROC-AUC.
- **Feature Importance Rankings (Reflects Synthetic Generation Rules):**
  1. `midpoint_progress`: **38.96%**
  2. `complexity`: **27.45%**
  3. `assignee_workload`: **12.02%**
  4. `previous_delays_ratio`: **10.54%**
- **Academic Stance:** On synthetic data, the linear baseline slightly outperformed or matched Random Forest. Random Forest was retained because it handles non-linear interactions in real data and outputs feature importance, and we report honestly that it did not beat the baseline here. With real team data, we would compare them again.

### Slide 6: Database Schema & Multi-Tenant Isolation
- **18 normalized relational tables** (`001_initial_schema.sql` 16 + `003_invitations_and_departments.sql` 2) with `TIMESTAMPTZ` UTC timestamps and **zero database triggers**.
- Audit history logging: `taskController.js` inserts a row into `task_status_history` inside the `BEGIN ... COMMIT` status update transaction.
- Tenant Isolation Proof: JWT carries only `userId`. Organization & analytics routes enforce `requireRole` (403 on mismatch); tasks, channels, messages, files, and Socket.IO handlers use `tenantAccess.js` (`resolveAuthorizedResource`) resolving org membership via workspace in PostgreSQL (404 across tenants). Proven by `test_multitenancy.js` (10 checks) and `test_tenant_tasks.js` (5 checks).

### Slide 7: Real-Time Communication & AI Assistant
- **Chat Engine:** Socket.IO room multicast using a **persist-then-broadcast** protocol with org membership verified on `channel:join` and every `message:send`.
- **AI Assistant:** Rule-based extractive summarization and heuristic action-item extraction (`Local Extractive Engine` / `Heuristic Engine`), with optional Google Gemini support when `GEMINI_API_KEY` is configured in `.env`.
- **Security Guard:** Keys stay server-side; `/login` & `/register` enforce `express-rate-limit` (`skipSuccessfulRequests: true`); unauthenticated calls return HTTP 401.

### Slide 8: Live Demonstration Sequence
1. **Authentication:** Log in as Admin (`admin@workspace.local`).
2. **Kanban & ML Audit Trail:** Drag/move task between columns; show `task_status_history` and `task_predictions` in PostgreSQL (and ML-down fallback evidence).
3. **Real-Time Chat:** Send message from Incognito (`priya@workspace.local`) → instant update on Admin screen + F5 persistence + `messages` table query.
4. **AI Assistant:** Summarize notes (`Local Extractive Engine`) and extract structured action items.
5. **Analytics:** Live SQL aggregations (read actual task & completion metrics from screen).
6. **Mobile PWA:** Show installed PWA running standalone on Android phone + recording backup.

### Slide 9: Project Limitations & Future Work
- **Limitations:** Synthetic ML training data; rule-based AI without vector RAG over files; PWA rather than compiled native APK; English-only interface; high-concurrency load testing.
- **Future Scope:** Real-world team telemetry across commercial teams; automated RAG file search with pgvector; compiled native mobile APKs; multi-language localization.

### Slide 10: Conclusion & Defense
- Delivered a verified, multi-tenant collaborative platform across **36 automated checks (7 suites)** combining real-time communication, predictive analytics, and transactional auditing.

---

## 2. Five-Minute Viva Voce Defense Script

> *"Good morning respected evaluators and guide. My project is an **AI-Powered Real-Time Collaborative Workspace with Predictive Analytics**, developed for Kishkindha University.
>
> Traditional project trackers like Jira or Trello are retrospective—they notify managers only after a deadline has been breached. The core innovation of this platform is proactive risk mitigation: as developers move cards on our Kanban board, `taskController.js` logs the audit transition inside a PostgreSQL transaction and passes velocity features (with a 10-second timeout and graceful failure fallback) to a FastAPI machine learning service that stores the delay prediction in `task_predictions`.
>
> We evaluated both Logistic Regression and Random Forest using 5-Fold Stratified Cross-Validation on a 3,000-record dataset. On this synthetic dataset, Logistic Regression scored 90.17% vs Random Forest 89.03% CV accuracy. I retained Random Forest because it provides feature importance rankings and can capture non-linear interactions in real data, and I report honestly that it did not beat the baseline on this synthetic dataset.
>
> On the engineering side, the backend runs Node.js and PostgreSQL 18 with **21 normalized tables** and zero database triggers. The JWT carries only `userId`; organization and analytics routes verify `organization_members` in `requireRole` (HTTP 403), while task, chat, file, and Socket.IO handlers use our shared `tenantAccess.js` helper to resolve organization ownership through the workspace and return HTTP 404 across tenants. Writing `test_tenant_tasks.js` caught a real 0-of-5 cross-tenant leak on those sub-routes earlier, which I fixed and verified at 5 of 5.
>
> For real-time chat, messages persist to PostgreSQL before broadcasting via Socket.IO. We also provide rule-based extractive summarization and heuristic action-item extraction (with optional Gemini support if an API key is configured), live SQL analytics, and an installable Android PWA app shell where `/api/` calls always fetch fresh server data.
>
> I verified the system across **36 automated checks in 7 suites** plus live browser checks, and I invite you to view the demonstration."*
