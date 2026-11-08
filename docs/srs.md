# Software Requirements Specification (SRS)
## AI-Powered Real-Time Collaborative Workspace with Predictive Analytics

**Document Version:** 1.0  
**Date:** November 2026  
**Author:** Shivashankargoud B R (Reg No: **KUB25MCA019**)  
**Degree:** Master of Computer Applications (MCA)  
**Institution:** Kishkindha University  

---

## 1. Introduction

### 1.1 Purpose
This Software Requirements Specification (SRS) document details the functional, non-functional, and interface requirements for the **AI-Powered Real-Time Collaborative Workspace with Predictive Analytics**. The platform is engineered to combine multi-tenant project coordination, real-time communication, generative AI meeting assistance, and machine-learning-driven task delay forecasting.

### 1.2 Document Conventions
- **MUST / SHALL:** Mandatory requirement for system compliance.
- **SHOULD:** Recommended feature incorporated in current build.
- **MAY:** Optional feature or future scope item.

### 1.3 Intended Audience
Project evaluators, academic examiners, system architects, and full-stack software engineers reviewing the architectural compliance, test verification, and viva deliverables.

### 1.4 Product Scope
The system addresses project management blind spots where teams only detect task delays after deadlines have already passed. By feeding mid-sprint velocity snapshots into a trained Random Forest classifier, the system assigns real-time risk badges (`LOW`, `MEDIUM`, `HIGH`) to active Kanban cards, giving project managers proactive intervention windows.

---

## 2. Overall System Description

### 2.1 Product Perspective
The application follows a distributed, multi-tier microservices architecture:
- **Presentation Layer:** React 18 SPA bundled via Vite, styled with Tailwind CSS, utilizing `@hello-pangea/dnd` for Kanban drag-and-drop and Recharts for interactive SVG metrics. Configured as an installable Progressive Web App (PWA).
- **Application Server:** Express.js REST API server (Node.js LTS) utilizing Socket.IO for bidirectional WebSocket events.
- **Predictive Analytics Microservice:** Python 3.12 FastAPI microservice serving scikit-learn models serialized via Joblib.
- **Persistence Layer:** PostgreSQL 18 relational database with 16 normalized tables enforcing foreign key referential integrity.

### 2.2 User Classes & Roles
1. **Organization Admin:** Creates organizations, manages workspaces, defines departments, and generates cryptographic employee invitations.
2. **Project Manager:** Creates projects, assigns tasks, reviews predictive risk assessments, and queries project analytics.
3. **Team Member:** Updates task progress, drags Kanban cards, chats in channel rooms, uploads documents, and triggers AI summaries.

### 2.3 Operating Environment
- **Server:** Node.js v24+, Python 3.12+, PostgreSQL 18.x.
- **Client:** Modern web browsers (Chrome, Edge, Firefox, Safari) and mobile browsers supporting Progressive Web App manifests and Service Workers.

---

## 3. Functional Requirements

### FR-1: Authentication & Token Security
- **FR-1.1:** The system SHALL hash user passwords using `bcryptjs` with **12 salt rounds** before storage.
- **FR-1.2:** The system SHALL issue a 15-minute JSON Web Token (JWT) access token upon valid credential submission.
- **FR-1.3:** The system SHALL store a 7-day refresh token in an `httpOnly`, `sameSite: strict` cookie.
- **FR-1.4:** The system SHALL reject invalid passwords with HTTP 401 Unauthorized and duplicate emails with HTTP 409 Conflict.

### FR-2: Multi-Tenancy & Role-Based Access Control (RBAC)
- **FR-2.1:** Every workspace, project, task, channel, and file SHALL maintain an immutable `org_id` foreign key.
- **FR-2.2:** The `requireRole` middleware SHALL verify that the authenticated user possesses an active record in `organization_members WHERE org_id = $1` before routing.
- **FR-2.3:** Cross-tenant access attempts SHALL immediately return HTTP 403 Forbidden.
- **FR-2.4:** Invitations SHALL be generated as cryptographically secure 32-byte hex tokens, valid for 7 days, and expire immediately upon first use (HTTP 410 Gone on reuse).

### FR-3: Task Management & Audit History
- **FR-3.1:** Users SHALL create tasks with priority, complexity (1–10), estimated days, and due dates.
- **FR-3.2:** Dragging cards between Kanban columns (`todo`, `in_progress`, `review`, `done`) SHALL update the `tasks` table and append an audit row to `task_status_history` capturing `old_status`, `new_status`, `old_progress`, `new_progress`, `changed_by`, and UTC timestamp.

### FR-4: Predictive Analytics Microservice
- **FR-4.1:** The FastAPI microservice SHALL expose a `POST /predict` endpoint consuming task features.
- **FR-4.2:** Numeric features SHALL be normalized using `StandardScaler`; categorical features (`priority`) SHALL be transformed via `OneHotEncoder`.
- **FR-4.3:** Predictions SHALL output a continuous delay probability ($0.0 - 1.0$) and a discrete risk category:
  - Low Risk: $p < 0.40$ (Green)
  - Medium Risk: $0.40 \le p < 0.70$ (Amber)
  - High Risk: $p \ge 0.70$ (Red)

### FR-5: Real-Time Communication
- **FR-5.1:** Socket.IO SHALL authenticate socket connections using JWT tokens.
- **FR-5.2:** Messages SHALL follow a **persist-then-broadcast** protocol: records are saved in PostgreSQL `messages` before emitting to channel rooms.
- **FR-5.3:** Clients reconnecting after network drops SHALL retrieve message history from PostgreSQL via REST API.

### FR-6: AI Meeting Assistant
- **FR-6.1:** The system SHALL provide an authenticated endpoint `POST /api/ai/summarize` that generates structured markdown bullet points.
- **FR-6.2:** The system SHALL provide `POST /api/ai/action-items` that parses transcripts into structured JSON tasks with assignees and priorities.
- **FR-6.3:** The backend SHALL store the Gemini API key in server-side `.env` and provide a deterministic local NLP fallback if the cloud API is unavailable.

### FR-7: Visual SQL Analytics
- **FR-7.1:** The server SHALL execute SQL aggregations computing completion rates, overdue task counts, workflow stage distributions, and member active workloads in a single database roundtrip.
- **FR-7.2:** The frontend SHALL render these metrics using Recharts responsive donut and bar charts.

### FR-8: Secure File Repository
- **FR-8.1:** File uploads SHALL enforce a 10 MB size limit and an explicit MIME whitelist (PDF, DOCX, TXT, CSV, PNG, JPG).
- **FR-8.2:** Uploaded files SHALL be saved with sanitized unique filenames in an isolated directory.
- **FR-8.3:** File downloads SHALL require JWT authentication and verify organization tenancy.

### FR-9: Progressive Web App (PWA)
- **FR-9.1:** The application SHALL serve a valid Web App Manifest (`manifest.json`) specifying standalone display mode and theme color `#0284c7`.
- **FR-9.2:** The application SHALL register a Service Worker (`sw.js`) implementing stale-while-revalidate caching for static assets while keeping API calls network-fresh.

---

## 4. Non-Functional Requirements

### 4.1 Security Requirements
- All database queries MUST use parameterized SQL bindings to completely eliminate SQL injection.
- Security headers MUST be injected on every HTTP response using `helmet`.
- Cross-Origin Resource Sharing (CORS) MUST be restricted strictly to configured client origins.
- API endpoints MUST be protected against brute-force attacks via `express-rate-limit`.

### 4.2 Performance Design Targets
- **WebSocket Latency Target:** p95 under 500 ms with 20 concurrent users on local network (design target, unbenchmarked under load).
- **REST API Target:** Authenticated CRUD operations intended to complete under 300 ms on local test environments.
- **Machine Learning Inference Target:** Inference pipeline via FastAPI intended to complete under 100 ms per task.

### 4.3 Data Integrity & Timestamps
- All timestamps MUST be stored in PostgreSQL using `TIMESTAMPTZ` (UTC) to eliminate timezone skew across distributed teams.

---

## 5. System Limitations & Future Scope

1. **Synthetic Machine Learning Data:** The 3,000-record dataset was generated using rule-based probabilistic modeling due to confidentiality of proprietary sprint data. Real-world accuracy requires future deployment across active commercial software teams.
2. **Collaborative Document Editing:** Shared rich-text editing (CRDT / Yjs) was deferred from the semester build to focus on predictive analytics, multi-tenant RBAC, and real-time chat.
3. **AI Document Retrieval (RAG):** The AI Assistant currently processes user-provided text inputs; automated indexing and vector embeddings over uploaded files is planned for future work.
4. **Native Mobile App:** Delivered as a Progressive Web App (PWA) installable on Android rather than a compiled Kotlin/Java native APK.
