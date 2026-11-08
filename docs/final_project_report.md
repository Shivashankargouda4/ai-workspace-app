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

The backend is developed with Node.js and PostgreSQL 18, structured around 16 normalized relational tables with strict role-based access control (Admin, Manager, Member) and audit history tracking. As developers update task progress on an interactive Kanban board, the system captures mid-sprint velocity snapshots and passes them to a Python FastAPI microservice serving a trained Random Forest model. 5-Fold Stratified Cross-Validation on a 3,000-record synthetic dataset demonstrated an accuracy of 89.03% (±1.03%) for Random Forest compared to a 90.17% (±0.97%) linear Logistic Regression baseline. In addition to predictive analytics, the system incorporates an AI Assistant for meeting notes summarization and structured action item extraction via the Gemini Flash API, an interactive Recharts visual analytics dashboard, a secure multipart file repository, and an installable Progressive Web App (PWA) delivering a responsive mobile experience on Android devices. All core modules were validated across 31 automated test assertions with zero failures.

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
- Integrate a generative AI assistant for meeting notes summarization and automated action-item extraction.
- Provide an installable Progressive Web App (PWA) with zero horizontal overflow on mobile screens.

---

## Chapter 2: Literature Review & Comparative Analysis

| Feature | Jira Software | Trello | Asana | Proposed System |
| :--- | :---: | :---: | :---: | :---: |
| **Kanban Task Board** | Yes | Yes | Yes | **Yes** |
| **Audit History Logging** | Enterprise only | Activity feed | Activity feed | **Built-in (`task_status_history`)** |
| **Machine Learning Delay Prediction** | No | No | No | **Yes (FastAPI + Random Forest)** |
| **Integrated Channel Chat** | Requires Slack | No | No | **Yes (Socket.IO Room Multicast)** |
| **AI Meeting Summarizer** | Add-on ($) | No | Intelligence ($) | **Built-in (Gemini API + NLP Fallback)** |
| **Installable Mobile PWA** | Native App only | Native App only | Native App only | **Yes (PWA with Offline Shell)** |

---

## Chapter 3: System Architecture & Database Design

### 3.1 Architecture Overview
The system follows a multi-tier decoupled microservices architecture:
1. **Frontend Presentation:** React 18 SPA bundled with Vite, styled with Tailwind CSS, utilizing `@hello-pangea/dnd` for drag-and-drop and Recharts for SVG metric charts.
2. **Application Server:** Express.js REST API with Socket.IO, Helmet security headers, rate limiting, and JWT authentication.
3. **Machine Learning Microservice:** FastAPI (Python 3.12) serving a scikit-learn Pipeline with `StandardScaler` and `OneHotEncoder`.
4. **Relational Storage:** PostgreSQL 18 database with 16 normalized tables and foreign key constraints.

### 3.2 Relational Schema (16 Tables)
- `users`: User profiles and bcrypt password hashes (salt rounds: 12).
- `organizations`: Tenant entities identified by unique slugs.
- `organization_members`: Junction table mapping users to organizations with roles (`admin`, `manager`, `member`).
- `workspaces`: Sub-units within an organization.
- `workspace_members`: Workspace membership and permissions.
- `projects`: Groupings of deliverables within a workspace.
- `tasks`: Core task entities with priority, complexity, estimated days, progress, and due date.
- `task_assignees`: Task-to-user assignment mappings.
- `task_comments`: Collaboration commentary on tasks.
- `task_status_history`: Immutable audit trail logging state transitions, progress changes, actor IDs, and UTC timestamps.
- `channels`: Communication channels (`public`, `direct`).
- `messages`: Channel messages.
- `notifications`: User notification queue.
- `documents`: Document store schema.
- `files`: File metadata repository.
- `task_predictions`: Serialized ML predictions with delay probabilities, risk levels, and model versions.

---

## Chapter 4: Implementation Details

### 4.1 Authentication & Multi-Tenant Access Control
- **Password Security:** Hashed with `bcryptjs` using **12 salt rounds** (`$2a$12$`).
- **Token Lifecycle:** 15-minute JWT access tokens passed via `Authorization: Bearer <token>` and 7-day refresh tokens in `httpOnly` secure cookies.
- **Tenant Isolation:** The `requireRole` middleware checks `organization_members WHERE org_id = $1 AND user_id = $2`. Unauthorized requests are blocked immediately with HTTP 403 Forbidden before database queries execute.
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

A comprehensive automated test suite of **31 executable assertions** was implemented and executed against the live system:

| Test File | Verified Assertions | Key Validations | Exit Code | Status |
| :--- | :---: | :--- | :---: | :---: |
| `test_auth.js` | 6 | Bcrypt salt 12, JWT access tokens, 401 wrong password, 409 duplicate email, 401 missing token | 0 | **PASS** |
| `test_multitenancy.js` | 10 | Cross-tenant 403 blocking, cryptographic invitation links, 410 token re-use prevention, admin role hierarchy | 0 | **PASS** |
| `test_ai.js` | 4 | Meeting notes summarization, structured action items JSON extraction, 401 unauthenticated guard | 0 | **PASS** |
| `test_analytics.js` | 5 | Live SQL aggregations (completion rate, status & workload breakdown), cross-tenant 403 boundary | 0 | **PASS** |
| `test_files.js` | 4 | Multipart upload with MIME whitelist, workspace listing, authenticated download content match, 401 unauthenticated block | 0 | **PASS** |
| `test_predict.py` | 2 | High-risk task delay prediction (99.7% [RED]) vs low-risk prediction (3.2% [GREEN]) | 0 | **PASS** |
| **Total** | **31** | **Comprehensive Full-Stack Coverage** | **0** | **100% PASS** |

---

## Chapter 6: Project Limitations & Future Scope

### 6.1 Academic Disclosures & Limitations
1. **Synthetic Machine Learning Data:** The 3,000-record dataset was generated using probabilistic rules due to the proprietary nature of commercial sprint records. Model scores demonstrate pipeline integrity, but real-world accuracy is unknown.
2. **Collaborative Document Editing:** Shared rich-text editing (Yjs / CRDT) was deferred to future scope to prioritize multi-tenant access control, delay forecasting, and real-time chat.
3. **AI Document Retrieval (RAG):** The AI assistant operates directly on user-provided prompt text; automated semantic indexing over uploaded workspace documents is planned for future work.
4. **Mobile Delivery:** Delivered as a Progressive Web App (PWA) rather than a compiled native Android Kotlin/Java APK.

### 6.2 Future Work
- Pilot testing across commercial software engineering teams to collect real-world sprint delay telemetry.
- Implementing Retrieval-Augmented Generation (RAG) with pgvector to enable tenant-filtered semantic search over uploaded PDFs and project specifications.
- Compiling the PWA into a native Android APK using Capacitor or Trusted Web Activities (TWA).

---

## Chapter 7: Conclusion

The **AI-Powered Real-Time Collaborative Workspace with Predictive Analytics** successfully demonstrates that proactive machine learning classification can be integrated into standard project management workflows to give managers early warning indicators before deadlines slip. Through 16 normalized relational tables, multi-tenant role enforcement, real-time Socket.IO messaging, Gemini AI assistance, and an installable Android PWA shell, the system provides a robust pair-programming and team coordination platform verified through 31 automated test assertions.
