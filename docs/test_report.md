# Major Project Testing & Verification Report
**Project Title:** AI-Powered Real-Time Collaborative Workspace with Predictive Analytics  
**Candidate:** Shivashankargoud B R (Reg No: KUB25MCA019)  
**Program:** Master of Computer Applications (MCA)  
**Institution:** Kishkindha University  

---

## 1. Academic Disclosures

> **Synthetic Data Disclosure:**  
> The ML dataset is synthetic, so the scores show how the pipeline behaves, not real-world accuracy. Real-world task delays depend on shifting client specifications, team fatigue, and unforeseen technical blockers.

> **AI Assistance Disclosure:**  
> AI-assisted development tools were used in building this project.

> **Project Scope Clarification:**  
> To ensure robust delivery of the core multi-tenant backend, predictive analytics, and real-time communication within the solo development timeframe, **collaborative rich-text editing (Yjs / CRDT)** was deferred as future scope. The database schema retains the `documents` table for future integration.

---

## 2. Test Execution Summary

This report contains only the tests that have been written, automated, and executed against the running system. Every check corresponds to an explicit assertion on HTTP status codes or return payloads.

| Test File | Target Module | Executable Checks | Verified Terminal Exit Code | Status |
| :--- | :--- | :---: | :---: | :---: |
| `server/test_auth.js` | Authentication & Tokens | 6 | Code 0 | **VERIFIED (PASS)** |
| `server/test_multitenancy.js` | Organization RBAC & Invitations | 10 | Code 0 | **VERIFIED (PASS)** |
| `server/test_analytics.js` | SQL Aggregation & Metrics | 5 | Code 0 | **VERIFIED (PASS)** |
| `server/test_ai.js` | Rule-Based AI Assistant & Optional Gemini | 4 | Code 0 | **VERIFIED (PASS)** |
| `server/test_files.js` | Secure File Repository (`multer@2.5.0`) | 4 | Code 0 | **VERIFIED (PASS)** |
| `server/test_tenant_tasks.js` | Cross-Tenant Tasks, Chat, Files & Socket.IO | 5 | Code 0 | **VERIFIED (PASS)** |
| `ml-service/test_predict.py` | ML Delay Risk Classifier | 2 | Code 0 | **VERIFIED (PASS)** |
| **Total Verified** | | **36 Checks (7 Suites)** | **Zero Failures** | **100% PASS** |

---

## 3. Real Code Assertions & Evidence

### Test Suite 1: Authentication (`server/test_auth.js`)
- **Assertion 1.1 (Registration):** `assert(res.status === 201 && res.data.accessToken)` -> Verifies that registering an account returns an HTTP 201 and a valid JWT access token.
- **Assertion 1.2 (Login):** `assert(res.status === 200 && res.data.accessToken)` -> Verifies that bcrypt successfully validates the submitted password against the stored salt hash.
- **Assertion 1.3 (Security Reject):** `assert(res.status === 401)` -> Verifies that submitting an incorrect password blocks entry with HTTP 401 Unauthorized.
- **Assertion 1.4 (Duplicate Prevention):** `assert(res.status === 409)` -> Verifies that attempting to register an existing email is rejected with HTTP 409 Conflict.
- **Assertion 1.5 (Profile Fetch):** `assert(res.status === 200 && res.data.user.email)` -> Verifies authenticated profile retrieval via bearer token.
- **Assertion 1.6 (Missing Token Guard):** `assert(res.status === 401)` -> Verifies that omitting the Authorization header blocks protected endpoints.

### Test Suite 2: Multi-Tenancy & RBAC (`server/test_multitenancy.js`)
- **Assertion 2.1 & 2.2 (Independent Tenant Creation):** User A creates Org A (ID: 2); User B creates Org B (ID: 3). Each user is assigned `role = 'admin'` in `organization_members` for their respective tenant.
- **Assertion 2.3 (Data Isolation Boundary):**  
  `assert(res.status === 403 && res.data.error.includes('not a member'))`  
  *Execution:* User A sends bearer token to `GET /api/orgs/3` (Org B).  
  *Evidence:* Express `requireRole` middleware checks `organization_members WHERE org_id = 3 AND user_id = userA.id`, finds zero rows, and aborts with HTTP 403.
- **Assertion 2.4 & 2.5 (Invitation Flow):** Org Admin generates a 32-byte hex cryptographic token in `invitations`. User B accepts the token (`POST /api/orgs/join/:token`) and joins Org A with role `member`.
- **Assertion 2.6 (Single-Use Token Enforcement):**  
  `assert(res.status === 410)`  
  *Execution:* User B attempts to accept the same token a second time.  
  *Evidence:* Endpoint checks `invitations.is_accepted = true` and returns HTTP 410 Gone.
- **Assertion 2.7 (Role Hierarchy Check):**  
  `assert(res.status === 403 && res.data.error.includes('privileges'))`  
  *Execution:* User B (role `member`) attempts `POST /api/orgs/2/departments`.  
  *Evidence:* Middleware compares `roleWeights['member'] (1)` vs `roleWeights['admin'] (3)` and aborts with HTTP 403.

### Test Suite 3: AI Assistant (`server/test_ai.js`)
- **Assertion 3.1 (Summarization & Decimal Integrity):** Sends sprint text containing `89.3%` and `94.5%` to `POST /api/ai/summarize`; verifies `source: 'Local Extractive Engine...'` and confirms decimal percentages are not truncated at `.`.
- **Assertion 3.2 (Action Item Extraction):** `POST /api/ai/action-items` returns structured JSON items (`title`, `priority`, `estimated_days`) with `source: 'Heuristic Engine...'`.
- **Assertion 3.3 & 3.4 (Auth Setup & Missing-Token Block):** Authenticates `admin@workspace.local` and confirms unauthenticated `/api/ai/summarize` returns HTTP 401.

### Test Suite 4: SQL Analytics (`server/test_analytics.js`)
- **Assertion 4.1 (Unauthenticated Block):** `assert(res.status === 401)` on `/api/analytics/overview/1`.
- **Assertion 4.2–4.4 (Setup & Live SQL Aggregation):** Registers temporary user, grants Org 1 membership, and verifies `GET /api/analytics/overview/1` returns HTTP 200 with live SQL summary, status/priority distribution, member workload, and ML risk predictions.
- **Assertion 4.5 (Tenant Guard):** `assert(res.status === 403)` when querying non-member Org 999999.

### Test Suite 5: Secure File Repository (`server/test_files.js`)
- **Assertion 5.1 (Multipart Upload):** `assert(res.status === 201 && res.data.file.id)` using `multer@2.5.0`. Stores file in `server/uploads/` with unique sanitized filename and validates MIME whitelist.
- **Assertion 5.2 (Workspace File Listing):** `assert(res.status === 200 && res.data.files.length >= 1)` for Workspace 1.
- **Assertion 5.3 (Authenticated Download):** `assert(res.status === 200 && downloadedText === originalContent)`. Verifies binary integrity.
- **Assertion 5.4 (Unauthenticated Download Block):** `assert(res.status === 401)`.

### Test Suite 6: Cross-Tenant Resource Isolation (`server/test_tenant_tasks.js`)
*(Hardening note: this test initially exposed a 0/5 gap where sub-routes checked authentication only and `downloadFile` hardcoded `orgId = 1`. After adding the shared `resolveAuthorizedResource` helper in `server/src/utils/tenantAccess.js`, all 5 checks pass 5/5.)*
- **Check 6.1 (Read Tasks):** User B (Org B) requesting `GET /api/tasks/project/:projectAId` receives HTTP `404`.
- **Check 6.2 (Write Tasks):** User B calling `POST /api/tasks` into Project A and `PATCH /api/tasks/:taskAId/status` receives HTTP `404` on both.
- **Check 6.3 (Chat REST):** User B requesting `GET /api/chat/channels/:wsAId` and `GET /api/chat/messages/:channelAId` receives HTTP `404` on both.
- **Check 6.4 (Files With Spoofed `orgId`):** User B uploading to Workspace A (even with `orgId = orgBId` spoofed), listing Workspace A files, and downloading File A all receive HTTP `404`, while legitimate Owner User A downloads File A with HTTP `200`.
- **Check 6.5 (Socket.IO Isolation):** User B attempting `channel:join` on Channel A does not receive User A's `message:new` broadcast, and User B's `message:send` fails to write to `messages` (`cnt === 1`).

### Test Suite 7: ML Delay Prediction (`ml-service/test_predict.py`)
- **High-Risk Case:**
  - Input: Complexity=8, Workload=6, Progress@Midpoint=20%, Priority=High.
  - Result: `delay_probability = 0.9967 (99.7%)`, `risk_level = "HIGH [RED]"`.
- **Low-Risk Case:**
  - Input: Complexity=2, Workload=1, Progress@Midpoint=60%, Priority=Low.
  - Result: `delay_probability = 0.0321 (3.2%)`, `risk_level = "LOW [GREEN]"`.

### Live Verification: ML Graceful Degradation & Chrome Kanban Drag
- **ML Down (Uvicorn Stopped):** Dragging Task 3 (`todo → review`) in Chrome still committed to PostgreSQL and appended `task_status_history` Row `36` (`2026-11-10 13:19:52`) with zero crash or error page.
- **ML Restored:** Running `test_drag_audit.js` after restarting Uvicorn appended Row `37` (`done → in_progress`) and updated `task_predictions` (`0.027 low`) at the exact same transaction timestamp (`2026-11-10 13:26:39.668418+05:30`).

---

## 4. Key Viva Voce Defense Answers

### Q1: Why use Random Forest when the baseline Logistic Regression scored slightly higher accuracy (90.67% vs 89.33%)?
> *"On my synthetic data, the baseline was slightly better or equal across accuracy, F1, and ROC-AUC. I kept Random Forest because it handles non-linear feature interactions in real data and provides feature importance rankings, and I report honestly that it did not beat the baseline here. With real team data, I would compare them again."*

### Q1.1: How does your pipeline prevent data leakage?
> *"We separate preprocessing leakage from target leakage:
> 1. **Preprocessing Leakage:** Prevented by scikit-learn's `Pipeline`, which ensures the `StandardScaler` and `OneHotEncoder` fit exclusively on training folds, never on test data.
> 2. **Target Leakage:** Prevented during feature design. All input variables (`complexity`, `assignee_workload`, `midpoint_progress`) are strictly point-in-time snapshots captured *before* the completion outcome occurred."*

### Q2: Why is the dataset synthetic, and what would real data change?
> *"Proprietary software companies do not publish internal sprint velocity and delay records due to confidentiality. More importantly, I had no time for a real-world multi-team pilot during the semester build timeline, so the logical next step is collecting data from real teams. Real data would introduce noisy human factors, shifting client requirements, and uneven task difficulty."*

### Q3: How do you stop one organization from seeing another's data?
> *"Foreign keys and indexes maintain referential consistency, but they do NOT isolate tenants. The JWT carries only `userId`. On organization and analytics routes, `requireRole` verifies `organization_members` (HTTP 403 on mismatch). On tasks, channels, messages, files, and Socket.IO (`channel:join` and every `message:send`), our shared helper `resolveAuthorizedResource` in `tenantAccess.js` resolves the target organization through the resource's workspace in PostgreSQL — ignoring client-supplied org IDs — checks `organization_members`, and returns HTTP 404 across tenants. Writing `test_tenant_tasks.js` first exposed a 0/5 gap, which this helper closed to 5/5."*

### Q4: How does real-time chat remain consistent after a network disconnect?
> *"We implement a **persist-then-broadcast** architecture. When an authorized user sends a message via Socket.IO, the Node.js server re-verifies channel organization membership, synchronously inserts the record into PostgreSQL's `messages` table with its sequence ID and UTC timestamp, and *then* emits `message:new` to the channel room. After disconnecting or refreshing (`F5`), the client retrieves history directly from PostgreSQL via `GET /api/chat/messages/:channelId`."*

### Q5: What does the AI Assistant actually do and how does it avoid leaking documents?
> *"Because `GEMINI_API_KEY` is unset in our demo `.env`, the assistant runs rule-based extractive summarization (`Local Extractive Engine`) and heuristic action-item extraction (`Heuristic Engine`) directly on prompt text. Configuring a server-side `GEMINI_API_KEY` enables Google Gemini through the API without exposing any key to the browser, and if a stored `document_id` is passed, `aiController.js` checks `organization_members` first."*

### Q6: How are user passwords and login endpoints protected?
> *"Passwords are hashed using `bcryptjs` with **12 salt rounds** (`await bcrypt.genSalt(12)` in `authController.js`), and `/api/auth/login` plus `/api/auth/register` are protected by `express-rate-limit` (`skipSuccessfulRequests: true`), which rate-limits repeated failed attempts with HTTP 429 without locking out legitimate users."*

---

## 5. Project Limitations & Future Scope

In the interest of academic integrity, the following limitations are explicitly documented:
1. **Synthetic Machine Learning Data:** The 3,000-record dataset was generated probabilistically; models reflect synthetic pipeline behavior rather than real-world task dynamics.
2. **Collaborative Document Editing:** Shared rich-text editing (Yjs / CRDT) was deferred to future scope to focus on multi-tenant access control, real-time messaging, and delay forecasting.
3. **AI Document Retrieval:** Without a Gemini API key, the AI Assistant uses rule-based extractive and heuristic engines on submitted text; full-text semantic search (RAG) over uploaded workspace files is future work.
4. **Mobile Delivery, Localization & Load Testing:** Mobile access is delivered via an installable Progressive Web App (PWA) with manifest and service worker, rather than a compiled native Android APK; the UI is English-only with no multi-language localization; concurrency load testing remains future work.
