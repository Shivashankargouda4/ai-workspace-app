# Major Project Final Report
## AI-Powered Real-Time Collaborative Workspace with Predictive Analytics

**Candidate Name:** Shivashankargoud B R  
**University Register Number:** KUB25MCA019  
**Degree:** Master of Computer Applications (MCA)  
**Department:** Department of Computer Applications  
**Institution:** Kishkindha University  
**Academic Year:** 2026  

---

## Abstract

Modern software engineering teams rely heavily on collaborative task management tools such as Jira, Linear, and Trello. However, existing commercial platforms operate reactively: delays are flagged only after deadlines have already passed. This major project presents the **AI-Powered Real-Time Collaborative Workspace with Predictive Analytics**, a secure, multi-tenant engineering collaboration platform that pairs WebSocket-based real-time communication with a proactive machine learning classification pipeline.

The backend is developed with Node.js and PostgreSQL 18, structured around 18 normalized relational tables with strict role-based access control (`requireRole` for organization/analytics routes) and workspace-resolved tenant ownership checks (`tenantAccess.js` across tasks, channels, messages, files, and WebSockets), plus transactional audit history tracking (`task_status_history`). As developers update task progress on an interactive Kanban board, the system captures mid-sprint velocity snapshots and dispatches them (with a 5-second timeout and graceful failure fallback) to a Python FastAPI microservice serving a trained Random Forest model. 5-Fold Stratified Cross-Validation on a 3,000-record synthetic dataset demonstrated an accuracy of 89.03% (±1.03%) for Random Forest compared to a 90.17% (±0.97%) linear Logistic Regression baseline. In addition to predictive analytics, the system incorporates an AI Assistant for rule-based extractive summarization and heuristic action-item extraction (with optional Google Gemini support via `GEMINI_API_KEY`), an interactive Recharts visual analytics dashboard, a secure multipart file repository (`multer@2.5.0`), and an installable Progressive Web App (PWA) delivering a responsive mobile experience on Android devices. All core modules were validated across 36 automated checks across 7 suites with zero failures.

---

## Chapter 1: Introduction

### 1.1 Background
The global shift toward distributed and hybrid software development teams has made real-time collaboration platforms indispensable. Modern projects involve dozens of concurrent tasks, overlapping sprint cycles, and frequent requirement pivots. While tools like Trello and Jira manage task states effectively, they lack intelligence: they treat deadlines as passive target dates rather than dynamic, probabilistic variables.

### 1.2 Problem Statement
In conventional project management systems:
1. **Delays Are Reactive:** Managers discover task bottlenecks only during post-deadline sprint retrospectives or daily standup meetings.
2. **Context Switching:** Teams must juggle separate applications for project tracking, team chat, meeting summarization, and file storage.
3. **Data Isolation Vulnerabilities:** Multi-tenant collaboration platforms often risk cross-tenant data leaks when access control checks are not enforced consistently across every API endpoint and database query.

### 1.3 Objectives
- Engineer a multi-tenant relational backend in PostgreSQL 18 with complete data isolation across organizations.
- Implement an interactive Kanban board with real-time audit trail persistence in `task_status_history`.
- Deploy a machine learning microservice that calculates continuous delay probabilities and assigns discrete risk badges (`LOW`, `MEDIUM`, `HIGH`) to active tasks.
- Build a bidirectional Socket.IO chat service utilizing a **persist-then-broadcast** protocol to eliminate message loss upon network disconnection.
- Integrate a rule-based extractive summarization and heuristic action-item extraction assistant, with optional Google Gemini API support.
- Provide an installable Progressive Web App (PWA) with zero horizontal overflow on mobile screens.

---

## Chapter 2: Literature Review & Comparative Analysis

| Feature | Jira Software | Trello | Asana | Proposed System |
| :--- | :---: | :---: | :---: | :---: |
| **Kanban Task Board** | Yes | Yes | Yes | **Yes** |
| **Audit History Logging** | Enterprise only | Activity feed | Activity feed | **Built-in (`task_status_history`)** |
| **Machine Learning Delay Prediction** | No | No | No | **Yes (FastAPI + Random Forest)** |
| **Integrated Channel Chat** | Requires Slack | No | No | **Yes (Socket.IO Room Multicast)** |
| **AI Meeting Summarizer** | Add-on ($) | No | Intelligence ($) | **Rule-Based NLP + Optional Gemini API** |
| **Installable Mobile PWA** | Native App only | Native App only | Native App only | **Yes (PWA with Offline Shell)** |

---

## Chapter 3: System Architecture & Database Design

### 3.1 Architecture Overview
The system follows a multi-tier decoupled microservices architecture:
1. **Frontend Presentation:** React 18 SPA bundled with Vite, styled with Tailwind CSS, utilizing `@hello-pangea/dnd` for drag-and-drop and Recharts for SVG metric charts.
2. **Application Server:** Express.js REST API with Socket.IO, Helmet security headers, `express-rate-limit` (`skipSuccessfulRequests: true`), and JWT authentication.
3. **Machine Learning Microservice:** FastAPI (Python 3.12) serving a scikit-learn Pipeline with `StandardScaler` and `OneHotEncoder` (called with a 5-second `AbortController` timeout and graceful failure logging).
4. **Relational Storage:** PostgreSQL 18 database with 18 normalized tables and foreign key constraints (`001_initial_schema.sql` and `003_invitations_and_departments.sql`).

### 3.2 Relational Schema (18 Tables)
- `users`: User profiles and bcrypt password hashes (salt rounds: 12).
- `organizations`: Tenant entities identified by unique slugs.
- `organization_members`: Junction table mapping users to organizations with roles (`admin`, `manager`, `member`).
- `workspaces`: Sub-units within an organization.
- `workspace_members`: Workspace membership and permissions.
- `projects`: Groupings of deliverables within a workspace.
- `tasks`: Core task entities with priority, complexity (1–10), estimated days, progress, and due date.
- `task_assignees`: Task-to-user assignment mappings.
- `task_comments`: Collaboration commentary on tasks.
- `task_status_history`: Append-only audit trail written by `taskController.js` inside the status update transaction (no database triggers).
- `channels`: Communication channels (`public`, `direct`).
- `messages`: Channel messages.
- `notifications`: User notification queue.
- `documents`: Reserved document store schema (including `yjs_state BYTEA`) for future collaborative editing.
- `files`: File metadata repository.
- `task_predictions`: Serialized ML predictions with delay probabilities, risk levels, and model versions.
- `departments`: Organization departments (`003_invitations_and_departments.sql`).
- `invitations`: Single-use 32-byte cryptographic invitation tokens (`003_invitations_and_departments.sql`).

---

## Chapter 4: Implementation Details

### 4.1 Authentication & Multi-Tenant Access Control
- **Password Security:** Hashed with `bcryptjs` using **12 salt rounds** (`$2a$12$`). `/api/auth/login` and `/api/auth/register` apply `express-rate-limit` with `skipSuccessfulRequests: true` (`max: 20` production / `60` development per 15 minutes).
- **Token Lifecycle:** 15-minute JWT access tokens (carrying `userId` only) passed via `Authorization: Bearer <token>` and 7-day refresh tokens in `httpOnly` secure cookies.
- **Tenant Isolation:** On organization and analytics routes (`/api/orgs/:orgId`, `/api/analytics/overview/:orgId`), the `requireRole` middleware checks `organization_members WHERE org_id = $1 AND user_id = $2` and rejects non-members with HTTP 403. On task, channel, message, file, and Socket.IO handlers (`channel:join` and every `message:send`), the shared helper `resolveAuthorizedResource` (`server/src/utils/tenantAccess.js`) resolves the target organization through the resource's workspace in PostgreSQL — ignoring client-supplied org IDs — verifies `organization_members`, and returns HTTP 404 across tenants so existence is not leaked.
- **Single-Use Invitations:** 32-byte cryptographic hex tokens that expire upon consumption (HTTP 410 Gone on re-use).

### 4.2 Machine Learning Delay Forecasting Engine
- **Dataset:** 3,000 synthetic task records based on complexity, workload, and midpoint velocity.
- **Pipeline Architecture:**
  - Categorical transformation: `OneHotEncoder(drop='first')` for priority.
  - Numerical transformation: `StandardScaler()` across complexity, workload, progress, and estimated days.
  - Estimator: `RandomForestClassifier(n_estimators=100, max_depth=8, random_state=42)`.
- **Cross-Validation:** 5-Fold Stratified Cross-Validation yielded:
  - Logistic Regression: **90.17%** (±0.97%) accuracy, **0.966** ROC-AUC.
  - Random Forest: **89.03%** (±1.03%) accuracy, **0.956** ROC-AUC.
- **Feature Importance Weights:**
  - `midpoint_progress`: **38.96%**
  - `complexity`: **27.45%**
  - `assignee_workload`: **12.02%**
  - `previous_delays_ratio`: **10.54%**
  - *Academic Note:* Feature importance weights reflect the synthetic generation rules, as documented in our disclosures.

### 4.3 Real-Time WebSocket Communication
- Implements a **persist-then-broadcast** architecture in Socket.IO.
- Messages are committed to PostgreSQL's `messages` table synchronously before broadcasting to connected room peers, preventing phantom or lost messages upon disconnection.

### 4.4 Installable Android Progressive Web App (PWA)
- Web App Manifest (`manifest.json`) defines standalone display mode, `#0284c7` theme color, and maskable 192×192 and 512×512 PNG app icons.
- App-Shell Service Worker (`sw.js`) caches static bundles while strictly keeping all `/api/` endpoints network-first to prevent data leakage between tenants.
- Responsive layout verified at 390px mobile viewport with an Android-style bottom navigation bar and zero horizontal overflow.

---

## Chapter 5: Testing & Verification Results

A comprehensive automated test suite of **36 executable checks across 7 suites** was implemented and executed against the live system:

| Test File | Verified Checks | Key Validations | Exit Code | Status |
| :--- | :---: | :--- | :---: | :---: |
| `test_auth.js` | 6 | Bcrypt salt 12, JWT access tokens, 401 wrong password, 409 duplicate email, 401 missing token | 0 | **PASS** |
| `test_multitenancy.js` | 10 | Cross-tenant 403 blocking on org routes, cryptographic invitations, 410 re-use prevention, admin role hierarchy | 0 | **PASS** |
| `test_analytics.js` | 5 | Live SQL aggregations (completion rate, status & workload breakdown), cross-tenant 403 boundary | 0 | **PASS** |
| `test_ai.js` | 4 | Rule-based summarization (preserving decimal values), heuristic action items JSON extraction, 401 guard | 0 | **PASS** |
| `test_files.js` | 4 | Multipart upload (`multer@2.5.0`) with MIME whitelist, workspace listing, authenticated download content match, 401 block | 0 | **PASS** |
| `test_tenant_tasks.js` | 5 | Cross-tenant 404 isolation on project tasks (read/create/update), chat (channels/messages), files (spoofed upload/list/owner 200/cross-org 404), and Socket.IO join/send | 0 | **PASS** |
| `test_predict.py` | 2 | High-risk task delay prediction (99.7% [RED]) vs low-risk prediction (3.2% [GREEN]) | 0 | **PASS** |
| **Total** | **36** | **Comprehensive Full-Stack Verification** | **0** | **100% PASS** |

In addition, **graceful ML degradation** was verified directly: stopping the FastAPI ML service while dragging a card in Chrome still committed the task status update and appended row `36` to `task_status_history` without an error page, and restarting Uvicorn resumed same-transaction ML predictions (`task_predictions`).

---

## Chapter 6: Project Limitations & Future Scope

### 6.1 Academic Disclosures & Limitations
1. **Synthetic Machine Learning Data:** The 3,000-record dataset was generated using probabilistic rules due to the proprietary nature of commercial sprint records. Model scores demonstrate pipeline integrity, but real-world accuracy is unknown.
2. **Collaborative Document Editing:** Shared rich-text editing (Yjs / CRDT) was deferred to future scope to prioritize multi-tenant access control, delay forecasting, and real-time chat; the `documents` table remains reserved in the schema.
3. **AI Document Retrieval & Local Fallback:** When `GEMINI_API_KEY` is unset, the AI module executes rule-based extractive summarization and heuristic action-item extraction on prompt text; automated semantic search (RAG) over uploaded files is deferred.
4. **Mobile Delivery, Localization & Load Testing:** Delivered as an installable Progressive Web App (PWA) rather than a compiled native Android APK; interface is English-only (no multi-language localization); high-concurrency load testing remains future work.

### 6.2 Future Work
- Pilot testing across commercial software engineering teams to collect real-world sprint delay telemetry.
- CRDT-based collaborative rich-text editing (TipTap + Yjs + Hocuspocus) reusing `tenantAccess.js` and the `documents` table.
- Retrieval-Augmented Generation (RAG) with pgvector for tenant-filtered semantic search over uploaded files, multi-language localization, and concurrency load testing.

---

## Chapter 7: Conclusion

The **AI-Powered Real-Time Collaborative Workspace with Predictive Analytics** demonstrates proactive machine learning delay forecasting integrated into collaborative Agile task management. Through 18 normalized relational tables, verified workspace-resolved and RBAC multi-tenant isolation, real-time Socket.IO messaging, rule-based AI assistance with optional Gemini support, and an installable Android PWA shell, the prototype works end to end and was verified across 36 automated test checks with zero failures.
