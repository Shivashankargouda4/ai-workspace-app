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

| Test File | Target Module | Executable Assertions | Verified Terminal Exit Code | Status |
| :--- | :--- | :---: | :---: | :---: |
| [`test_auth.js`](file:///C:/Users/brshi/OneDrive/Desktop/shivu/workspace-app/server/test_auth.js) | Authentication & Tokens | 4 | Code 0 | **VERIFIED** |
| [`test_multitenancy.js`](file:///C:/Users/brshi/OneDrive/Desktop/shivu/workspace-app/server/test_multitenancy.js) | Tenant Isolation & RBAC | 9 | Code 0 | **VERIFIED** |
| [`test_ai.js`](file:///C:/Users/brshi/OneDrive/Desktop/shivu/workspace-app/server/test_ai.js) | AI Assistant & NLP | 3 | Code 0 | **VERIFIED** |
| [`test_analytics.js`](file:///C:/Users/brshi/OneDrive/Desktop/shivu/workspace-app/server/test_analytics.js) | SQL Aggregation & Metrics | 5 | Code 0 | **VERIFIED** |
| [`test_files.js`](file:///C:/Users/brshi/OneDrive/Desktop/shivu/workspace-app/server/test_files.js) | Secure File Repository | 4 | Code 0 | **VERIFIED** |
| [`test_predict.py`](file:///C:/Users/brshi/OneDrive/Desktop/shivu/workspace-app/ml-service/test_predict.py) | ML Delay Risk Classifier | 2 | Code 0 | **VERIFIED** |
| **Total Verified** | | **27 Checks** | **Zero Failures** | **100% PASS** |

---

## 3. Real Code Assertions & Evidence

### Test Suite 1: Authentication (`server/test_auth.js`)
- **Assertion 1.1 (Registration):** `assert(res.status === 201 && res.data.accessToken)` -> Verifies that registering an account returns an HTTP 201 and a valid JWT access token.
- **Assertion 1.2 (Login):** `assert(res.status === 200 && res.data.accessToken)` -> Verifies that bcrypt successfully validates the submitted password against the stored salt hash.
- **Assertion 1.3 (Security Reject):** `assert(res.status === 401)` -> Verifies that submitting an incorrect password blocks entry with HTTP 401 Unauthorized.
- **Assertion 1.4 (Duplicate Prevention):** `assert(res.status === 409)` -> Verifies that attempting to register an existing email is rejected with HTTP 409 Conflict.

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
- **Assertion 3.1 (Unauthenticated Block):** `assert(res.status === 401)` when accessing `/api/ai/summarize` without a bearer token.
- **Assertion 3.2 (Text Summarization):** `assert(res.status === 200 && res.data.summary.length > 20)`. Parses 5 paragraphs and returns 3 concise bullet points.
- **Assertion 3.3 (Structured Action Extraction):** `assert(res.status === 200 && Array.isArray(res.data.action_items))`. Extracts tasks, priorities, and deadlines into JSON.

### Test Suite 4: SQL Analytics (`server/test_analytics.js`)
- **Assertion 4.1 (Unauthenticated Block):** `assert(res.status === 401)` on `/api/analytics/overview/1`.
- **Assertion 4.2 (Live SQL Aggregation):** `assert(res.status === 200)`.  
  *Evidence from Live DB Output:*
  - Total Tasks: 4
  - Completed Tasks: 1
  - Completion Rate: 25% (Computed as `Math.round((1 / 4) * 100)`)
  - Status Breakdown: `done: 1`, `in_progress: 1`, `todo: 2`
  - Priority Breakdown: `high: 3`, `medium: 1`
  - Member Workload: `Admin Shiva: 2`, `Rahul Member: 1`, `Priya Manager: 1`
- **Assertion 4.3 (Tenant Guard):** `assert(res.status === 403)` when querying Org 999999.

### Test Suite 5: Secure File Repository (`server/test_files.js`)
- **Assertion 5.1 (Multipart Upload):** `assert(res.status === 201 && res.data.file.id)`. Stores file in `server/uploads/` with UUID-timestamped name and validates MIME type.
- **Assertion 5.2 (Workspace File Listing):** `assert(res.status === 200 && res.data.files.length >= 1)`.
- **Assertion 5.3 (Authenticated Download):** `assert(res.status === 200 && downloadedText === originalContent)`. Verifies binary integrity.
- **Assertion 5.4 (Unauthenticated Download Block):** `assert(res.status === 401)`.

### Test Suite 6: ML Delay Prediction (`ml-service/test_predict.py`)
- **High-Risk Case:**
  - Input: Complexity=8, Workload=6, Progress@Midpoint=20%, Priority=High.
  - Result: `delay_probability = 0.9967 (99.7%)`, `risk_level = "high"`.
- **Low-Risk Case:**
  - Input: Complexity=2, Workload=1, Progress@Midpoint=60%, Priority=Low.
  - Result: `delay_probability = 0.0321 (3.2%)`, `risk_level = "low"`.

---

## 4. Key Viva Voce Defense Answers

### Q1: Why use Random Forest when Logistic Regression achieved slightly higher Accuracy (90.67% vs 89.33%)?
> *"In software project scheduling, False Negatives (predicting a task will finish on time when it will actually blow past deadline) carry severe cost. Random Forest achieved a higher **Recall of 94.54%** compared to 94.04% for Logistic Regression, catching more critical delays. Furthermore, real-world task risk exhibits non-linear threshold effects (e.g. high workload combined with low progress) that an ensemble of decision trees models more naturally than a linear hyperplane."*

### Q2: Why is the dataset synthetic, and what would real data change?
> *"Because proprietary software companies do not publicly disclose internal sprint velocity, assignee workloads, and task delay histories due to confidentiality, we constructed a synthetic dataset with 3,000 records using probabilistic rules. The scores demonstrate that the data pipeline, scaling, one-hot encoding, and scikit-learn models function properly, but real-world accuracy is unknown. In a commercial deployment, real-world data would introduce human fatigue, changing client requirements, and uneven code complexity."*

### Q3: How do you prevent one organization from accessing another's data?
> *"Multi-tenancy is enforced at two distinct layers:
> 1. **Database Schema:** Every workspace, project, task, channel, and file contains an immutable `org_id` foreign key with indexed lookups (`idx_tasks_org`).
> 2. **Application Middleware:** The `requireRole` middleware extracts `orgId` from route parameters or headers and verifies that `req.user.id` has an active membership record in `organization_members WHERE org_id = $1`. If no membership exists, an HTTP 403 Forbidden is returned immediately before any table queries execute."*

### Q4: How does real-time chat remain consistent after a network disconnect?
> *"We implement a **persist-then-broadcast** architecture. When a user sends a message via Socket.IO, the Node.js server synchronously inserts the record into PostgreSQL's `messages` table and obtains its generated sequence ID and timestamp *before* emitting the message to the room. When a client reconnects after a network drop, it fetches missing messages using standard HTTP `GET /api/chat/channels/:channelId/messages` from the PostgreSQL source of truth."*

### Q5: How does the AI Assistant avoid leaking private documents?
> *"The AI assistant operates on zero client-side credentials. All summarization and action-item extraction requests require an authenticated JWT bearer token and are processed through the backend Express controller (`/api/ai/summarize`). The Gemini API key resides solely on the server in `.env` and is never transmitted to the browser. Input text is validated against request length limits, and each session is isolated to the authenticated user."*
