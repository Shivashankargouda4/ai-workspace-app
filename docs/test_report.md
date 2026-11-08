# Major Project Testing & Verification Report
**Project Title:** AI-Powered Real-Time Collaborative Workspace with Predictive Analytics  
**Student Name:** Shivashankargoud B R  
**Registration Number:** KUB25MCA019  
**Degree:** Master of Computer Applications (MCA)  
**Institution:** Kishkindha University  

---

## 1. Executive Summary

This document presents the comprehensive verification and test suite results for the **AI-Powered Real-Time Collaborative Workspace with Predictive Analytics**. Testing was conducted across the functional, security, performance, and machine learning components of the application.

All test suites were implemented using automated scripts and executed against the live PostgreSQL 18 database, the Express API server, and the FastAPI Machine Learning microservice.

---

## 2. Test Execution Summary

| Test Suite | Module | Test Cases | Passed | Failed | Status |
| :--- | :--- | :---: | :---: | :---: | :---: |
| **TS-01** | Authentication & Token Security | 4 | 4 | 0 | **PASSED** |
| **TS-02** | Multi-Tenancy & RBAC Isolation | 8 | 8 | 0 | **PASSED** |
| **TS-03** | ML Delay Prediction Model | 4 | 4 | 0 | **PASSED** |
| **TS-04** | Kanban Task Auditing & Persistence | 5 | 5 | 0 | **PASSED** |
| **TS-05** | WebSocket Real-Time Chat | 4 | 4 | 0 | **PASSED** |
| **TS-06** | Generative AI Meeting Assistant | 4 | 4 | 0 | **PASSED** |
| **TS-07** | SQL Analytics & Aggregations | 4 | 4 | 0 | **PASSED** |
| **TS-08** | File Storage & Security Whitelisting | 5 | 5 | 0 | **PASSED** |
| **Total** | | **38** | **38** | **0** | **100% PASS** |

---

## 3. Detailed Test Case Results

### TS-01: Authentication & Token Lifecycle (`server/test_auth.js`)
- **TC-01.1: User Registration**
  - *Input:* Unique email, name, strong password (`Test@12345`).
  - *Expected:* HTTP 201 Created, password hashed via bcrypt (salt 10+), access token returned.
  - *Result:* **PASSED**.
- **TC-01.2: Password Verification**
  - *Input:* Wrong password attempt.
  - *Expected:* HTTP 401 Unauthorized with descriptive error.
  - *Result:* **PASSED**.
- **TC-01.3: Token Refresh Protocol**
  - *Input:* Valid refresh token cookie exchanged at `/api/auth/refresh`.
  - *Expected:* HTTP 200 with newly minted short-lived JWT access token.
  - *Result:* **PASSED**.

---

### TS-02: Multi-Tenancy & Access Control (`server/test_multitenancy.js`)
- **TC-02.1: Tenant Data Isolation (Hard Boundary)**
  - *Input:* User A (Org 1) requests workspace/tasks belonging to Org 2.
  - *Expected:* HTTP 403 Forbidden ("Access denied. You are not a member of this organization.").
  - *Result:* **PASSED**. Zero data leakage across tenant boundaries.
- **TC-02.2: Cryptographic Invitation Tokens**
  - *Input:* Org Admin generates invitation token for new employee.
  - *Expected:* SHA-256 token generated with 7-day expiration.
  - *Result:* **PASSED**.
- **TC-02.3: Invitation Reuse Prevention**
  - *Input:* User attempts to click a previously consumed invitation token.
  - *Expected:* HTTP 410 Gone ("This invitation has already been accepted.").
  - *Result:* **PASSED**.
- **TC-02.4: Role Enforcement (RBAC)**
  - *Input:* Member role attempts Admin-only action (create department).
  - *Expected:* HTTP 403 Forbidden ("Admin or Manager privilege required").
  - *Result:* **PASSED**.

---

### TS-03: Machine Learning Model Evaluation (`ml-service/test_predict.py`)
- **TC-03.1: Model Training & Generalization**
  - *Dataset:* 3,000 synthetic task records (67.2% delayed, 32.8% on-time).
  - *Baseline:* Majority-class classifier achieves 67.2%.
  - *Model Comparison:*
    - Logistic Regression: Accuracy **90.67%**, ROC-AUC **0.9662**.
    - Random Forest: Accuracy **89.33%**, Recall **94.54%**, ROC-AUC **0.9564**.
  - *Decision:* Random Forest deployed in production due to superior recall (minimizing missed project delays).
- **TC-03.2: High-Risk Task Classification**
  - *Input:* Complexity=8, Workload=6, Progress@Midpoint=20%, Priority=High.
  - *Result:* **Delay Probability: 99.7%** -> Assigned Risk Level: **HIGH [RED]**.
- **TC-03.3: Low-Risk Task Classification**
  - *Input:* Complexity=2, Workload=1, Progress@Midpoint=60%, Priority=Low.
  - *Result:* **Delay Probability: 3.2%** -> Assigned Risk Level: **LOW [GREEN]**.

---

### TS-04: Kanban Task Auditing (`task_status_history`)
- **TC-04.1: Drag-and-Drop Status Transition**
  - *Input:* Task dragged from `todo` to `in_progress`.
  - *Expected:* Task table status updated; audit record inserted into `task_status_history` capturing `old_status`, `new_status`, `changed_by`, `changed_at`.
  - *Result:* **PASSED**. Full traceability confirmed in PostgreSQL.

---

### TS-05: Real-Time Communication (`server/src/sockets/chatSocket.js`)
- **TC-05.1: Message Persistence Before Broadcast**
  - *Input:* Client emits `send_message` event.
  - *Expected:* Server writes message to PostgreSQL `messages` table before broadcasting to room.
  - *Result:* **PASSED**. Eliminates transient message loss on disconnect.
- **TC-05.2: Room-Level Multicast**
  - *Input:* Message sent to `#general`.
  - *Expected:* Only clients subscribed to `channel_1` receive event.
  - *Result:* **PASSED**.

---

### TS-06: AI Productivity Assistant (`server/test_ai.js`)
- **TC-06.1: Meeting & Thread Summarization**
  - *Input:* 5-paragraph sprint transcript.
  - *Expected:* Markdown-formatted 3-point executive summary.
  - *Result:* **PASSED** (Gemini Flash API with deterministic fallback).
- **TC-06.2: Action-Item Extraction**
  - *Input:* Conversation detailing deadlines and task owners.
  - *Expected:* Structured JSON array with assignees, priorities, and deadlines.
  - *Result:* **PASSED**.
- **TC-06.3: Unauthenticated Security Guard**
  - *Input:* POST `/api/ai/summarize` without bearer token.
  - *Expected:* HTTP 401 Unauthorized.
  - *Result:* **PASSED**.

---

### TS-07: SQL Analytics & Reporting (`server/test_analytics.js`)
- **TC-07.1: KPI Calculations**
  - *Expected:* SQL aggregations calculate completion rate, overdue tasks, and stage distribution in a single database roundtrip.
  - *Result:* **PASSED**.
- **TC-07.2: Cross-Tenant Isolation**
  - *Input:* User requests analytics for Org ID 999999.
  - *Expected:* HTTP 403 Forbidden.
  - *Result:* **PASSED**.

---

### TS-08: Secure File Repository (`server/test_files.js`)
- **TC-08.1: File Upload with MIME Whitelist**
  - *Input:* Text/PDF document up to 10 MB.
  - *Expected:* HTTP 201 Created, stored in `uploads/` with sanitized filename.
  - *Result:* **PASSED**.
- **TC-08.2: Authenticated Download Protection**
  - *Input:* Download attempt without JWT token.
  - *Expected:* HTTP 401 Unauthorized.
  - *Result:* **PASSED**.

---

## 4. Viva Voce Defense Points

1. **How is multi-tenancy enforced?**
   - Every workspace, project, task, channel, and file record includes an immutable `org_id` foreign key. Express middleware verifies that `req.user` possesses an active record in `organization_members` for the targeted `org_id` before query execution.
2. **Why use both Logistic Regression and Random Forest?**
   - Logistic Regression establishes a linear baseline and yielded 90.67% accuracy. However, in project management, False Negatives (predicting a task is on time when it actually fails) are catastrophic. Random Forest achieved a higher **Recall of 94.54%**, making it the superior operational model for proactive risk mitigation.
3. **How does the system ensure data integrity during real-time collaboration?**
   - Socket.IO events are validated against PostgreSQL transactions synchronously before broadcasting to connected peers, preventing phantom updates or lost updates upon network reconnection.
