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
  4. Integrate an AI Assistant for meeting notes summarization and structured action item extraction.
  5. Provide an installable Progressive Web App (PWA) for Android and desktop devices.

### Slide 4: System Architecture
- Multi-tier architecture diagram:
  - **Client:** React 18 SPA, Vite, Tailwind CSS, TanStack Query, Recharts, PWA Service Worker.
  - **API Server:** Express.js, Socket.IO, Helmet, JWT access tokens + httpOnly refresh cookies.
  - **ML Microservice:** Python 3.12, FastAPI, scikit-learn Pipeline (Joblib).
  - **Database:** PostgreSQL 18 with 16 normalized tables and foreign key constraints.

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
- 16 normalized relational tables with `TIMESTAMPTZ` UTC timestamps.
- Audit history logging: Every Kanban status change appends a record to `task_status_history`.
- Tenant Isolation Proof: Foreign keys keep data consistent, but true isolation is enforced by queries filtering on `org_id` and the `requireRole` middleware verifying membership before execution, proven by our 10 automated multi-tenancy tests.

### Slide 7: Real-Time Communication & AI Assistant
- **Chat Engine:** Socket.IO room multicast using a **persist-then-broadcast** protocol (writes to PostgreSQL before emitting).
- **AI Assistant:** Gemini Flash API integration with deterministic local NLP fallback for offline resilience.
- **Security Guard:** API keys remain strictly server-side in `.env`; unauthenticated calls return HTTP 401 Unauthorized.

### Slide 8: Live Demonstration Sequence
1. **Authentication:** Log in as Admin (`admin@workspace.local`).
2. **Dashboard & Analytics:** Live SQL aggregations (25% completion, workflow status donuts, workload bars).
3. **AI Assistant:** Summarize a meeting transcript and extract structured action items.
4. **Kanban & ML Risk Badges:** Drag task between columns; show risk badge and verify audit history in PostgreSQL.
5. **Real-Time Chat:** Exchange messages across two browser sessions in `#general`.
6. **Mobile PWA:** Inspect Service Worker and Web App Manifest in Chrome DevTools.

### Slide 9: Project Limitations & Future Work
- **Limitations:** Synthetic ML data; collaborative rich-text editor (Yjs) deferred; AI operates on prompt text without automated document vector search (RAG).
- **Future Scope:** Real-world enterprise dataset collection; automated RAG file search; mobile native APK build.

### Slide 10: Conclusion & Q&A
- Delivered a verified, multi-tenant collaborative platform combining real-time communication, predictive analytics, and automated auditing.

---

## 2. Five-Minute Viva Voce Defense Script

> *"Good morning respected evaluators and guide. My project is an **AI-Powered Real-Time Collaborative Workspace with Predictive Analytics**, developed for Kishkindha University.
>
> Traditional project trackers like Jira or Trello are retrospective—they notify managers only after a deadline has been breached. The core innovation of this platform is proactive risk mitigation: as developers update task progress on our Kanban board, the system passes mid-sprint velocity snapshots to a FastAPI machine learning service that calculates the probability of task delay.
>
> We evaluated both Logistic Regression and Random Forest using 5-Fold Stratified Cross-Validation on a 3,000-record dataset. On this synthetic dataset, the baseline Logistic Regression slightly outperformed Random Forest with 90.17% vs 89.03% CV accuracy. I retained Random Forest because it is architecturally prepared for non-linear interactions in real software team data and provides feature importance rankings, but I report honestly that it did not beat the baseline on this linear synthetic dataset.
>
> On the engineering side, the backend is built with Node.js and PostgreSQL 18 with 16 normalized tables. Foreign keys maintain database consistency, but true tenant isolation is enforced because every database query filters by `org_id` and our `requireRole` middleware verifies active membership before execution. We proved this through 10 automated multi-tenancy tests that confirmed HTTP 403 Forbidden on cross-tenant requests.
>
> For real-time chat, we solved the message consistency problem using a persist-then-broadcast pattern: messages are saved in PostgreSQL before emitting via Socket.IO. We also built an AI assistant for meeting summarization, a visual Recharts analytics dashboard, and an installable Progressive Web App (PWA) service worker for mobile access.
>
> I have verified the system through 31 automated tests, and I invite you to view the live demonstration."*
