# System Architecture & UML Documentation
**Project Title:** AI-Powered Real-Time Collaborative Workspace with Predictive Analytics  
**Candidate:** Shivashankargoud B R (Reg No: KUB25MCA019)  
**Program:** Master of Computer Applications (MCA)  
**Institution:** Kishkindha University  

---

## 1. High-Level System Architecture

```mermaid
graph TD
    subgraph ClientLayer ["Client Layer (Presentation)"]
        Browser["React 18 Single Page Application<br/>(Vite + Tailwind CSS + Lucide)"]
        PWA["Progressive Web App Shell<br/>(Service Worker + Manifest)"]
        State["State Management & Cache<br/>(TanStack Query + React Context)"]
        SocketClient["Socket.IO Client<br/>(Bidirectional Event Bus)"]
    end

    subgraph GatewayLayer ["Security & Access Control"]
        Gateway["Express Security Layer<br/>(Helmet, Rate-Limiting, CORS)"]
        JWTAuth["JWT & Tenant Access Layer<br/>(requireAuth, requireRole, tenantAccess.js)"]
    end

    subgraph ServiceLayer ["Backend Service Layer"]
        ExpressApp["Express.js REST API Server<br/>(Node.js LTS)"]
        SocketServer["Socket.IO WebSocket Server<br/>(Membership-Checked Channel Rooms)"]
        AIController["AI Assistant Service<br/>(Rule-Based Extractive/Heuristic + Optional Gemini API)"]
        FileService["Secure File Storage Engine<br/>(Multer v2.5 + MIME Whitelist)"]
    end

    subgraph MLLayer ["Predictive Analytics Microservice"]
        FastAPI["FastAPI Microservice<br/>(Python 3.12 + Uvicorn)"]
        MLModel["Random Forest & Logistic Regression<br/>(Task Delay Predictor v1.0)"]
    end

    subgraph PersistenceLayer ["Data & Storage Layer"]
        Postgres[("PostgreSQL 18 Relational DB<br/>(21 Normalized Tables, Multi-Tenant)")]
        DiskStorage[("Local File Storage<br/>(server/uploads/ directory)")]
    end

    Browser --> Gateway
    PWA --> Gateway
    SocketClient <--> SocketServer
    Gateway --> JWTAuth
    JWTAuth --> ExpressApp
    ExpressApp --> Postgres
    ExpressApp <--> FastAPI
    FastAPI --> MLModel
    ExpressApp --> DiskStorage
    ExpressApp --> AIController
```

---

## 2. Entity-Relationship Diagram (ERD)

```mermaid
erDiagram
    USERS ||--o{ ORGANIZATION_MEMBERS : "joins"
    ORGANIZATIONS ||--o{ ORGANIZATION_MEMBERS : "contains"
    ORGANIZATIONS ||--o{ DEPARTMENTS : "organizes"
    ORGANIZATIONS ||--o{ INVITATIONS : "issues"
    ORGANIZATIONS ||--o{ WORKSPACES : "owns"
    WORKSPACES ||--o{ WORKSPACE_MEMBERS : "assigns"
    USERS ||--o{ WORKSPACE_MEMBERS : "participates"
    WORKSPACES ||--o{ PROJECTS : "groups"
    WORKSPACES ||--o{ DOCUMENTS : "reserves"
    PROJECTS ||--o{ TASKS : "tracks"
    TASKS ||--o{ TASK_ASSIGNEES : "assigned_to"
    USERS ||--o{ TASK_ASSIGNEES : "works_on"
    TASKS ||--o{ TASK_STATUS_HISTORY : "audits"
    TASKS ||--o{ TASK_PREDICTIONS : "forecasts"
    WORKSPACES ||--o{ CHANNELS : "hosts"
    CHANNELS ||--o{ MESSAGES : "contains"
    USERS ||--o{ MESSAGES : "posts"
    WORKSPACES ||--o{ FILES : "stores"
    USERS ||--o{ NOTIFICATIONS : "receives"

    USERS {
        int id PK
        string email
        string password_hash
        string name
        string role
        timestamp created_at
    }

    ORGANIZATIONS {
        int id PK
        string name
        string slug
        timestamp created_at
    }

    ORGANIZATION_MEMBERS {
        int id PK
        int org_id FK
        int user_id FK
        string role
        timestamp joined_at
    }

    WORKSPACES {
        int id PK
        int org_id FK
        string name
        string description
    }

    PROJECTS {
        int id PK
        int workspace_id FK
        int org_id FK
        string name
        string key
    }

    TASKS {
        int id PK
        int project_id FK
        int org_id FK
        string title
        string status
        string priority
        int complexity
        int estimated_days
        timestamp due_date
    }

    TASK_STATUS_HISTORY {
        int id PK
        int task_id FK
        string old_status
        string new_status
        int changed_by FK
        timestamp changed_at
    }

    TASK_PREDICTIONS {
        int id PK
        int task_id FK
        float delay_probability
        string risk_level
        string model_version
        timestamp predicted_at
    }

    CHANNELS {
        int id PK
        int workspace_id FK
        int org_id FK
        string name
        string type
    }

    MESSAGES {
        int id PK
        int channel_id FK
        int user_id FK
        text content
        timestamp created_at
    }

    FILES {
        int id PK
        int workspace_id FK
        int org_id FK
        string name
        string path
        string mime_type
        int size
        int uploaded_by FK
    }
```

---

## 3. Use Case Diagram

```mermaid
flowchart LR
    subgraph Actors
        Admin((Org Admin))
        Manager((Project Manager))
        Member((Team Member))
        ML((ML Engine))
        AI((AI Assistant))
    end

    subgraph SystemBoundary ["AI Collaborative Workspace System"]
        UC1[Manage Organization & Departments]
        UC2[Invite & Assign Roles]
        UC3[Create Projects & Workspaces]
        UC4[Manage Kanban Tasks & Drag-Drop]
        UC5[Receive Task Delay Risk Forecast]
        UC6[Real-time Channel Chat & Typing]
        UC7[Upload & Securely Download Files]
        UC8[Summarize Threads & Extract Action Items]
        UC9[Inspect Team Workload & Analytics]
    end

    Admin --> UC1
    Admin --> UC2
    Admin --> UC3
    Admin --> UC9

    Manager --> UC3
    Manager --> UC4
    Manager --> UC6
    Manager --> UC7
    Manager --> UC8
    Manager --> UC9

    Member --> UC4
    Member --> UC6
    Member --> UC7
    Member --> UC8

    UC4 -.->|Triggers| ML
    ML -.->|Updates Risk Badge| UC5
    UC8 -.->|Extracts Actions| AI
```

---

## 4. Sequence Diagram: Task Creation & ML Delay Prediction

```mermaid
sequenceDiagram
    autonumber
    actor User as Team Lead / Member
    participant Client as React Client (Kanban)
    participant Server as Express Server
    participant DB as PostgreSQL 18
    participant ML as FastAPI ML Service (Port 8000)

    User->>Client: Drag card / Move task to new status
    Client->>Server: PATCH /api/tasks/:taskId/status (JWT Auth Header)
    Server->>DB: Resolve task via workspace & check organization_members (tenantAccess.js)
    Server->>DB: BEGIN + UPDATE tasks + INSERT INTO task_status_history

    opt ML Delay Forecast Dispatch (5s Timeout + Graceful Fallback)
        Server->>ML: POST /predict {priority, complexity, estimated_days, ...}
        ML->>ML: Pipeline Scaler + Random Forest Model
        ML-->>Server: 200 OK {delay_probability, risk_level, model_version}
        Server->>DB: INSERT/UPDATE task_predictions
    end

    Server->>DB: COMMIT
    Server-->>Client: 200 OK {task}
    Client-->>User: Persist card in destination column & show toast
```

---

## 5. Sequence Diagram: Real-Time WebSocket Chat

```mermaid
sequenceDiagram
    autonumber
    actor Alice as User Alice (Sender)
    participant ClientA as Alice Browser (Socket.IO)
    participant WS as Socket.IO Server (Node.js)
    participant DB as PostgreSQL 18
    participant ClientB as Bob Browser (Socket.IO)
    actor Bob as User Bob (Recipient)

    Alice->>ClientA: Sends message in channel: "Sprint review tomorrow at 10 AM"
    ClientA->>WS: socket.emit("message:send", {channelId: 1, content: "..."})
    WS->>DB: Verify JWT & channel membership via tenantAccess.js
    WS->>DB: INSERT INTO messages (channel_id, user_id, content) VALUES (...)
    DB-->>WS: Message saved with ID & UTC Timestamp
    WS->>ClientA: io.to("channel:1").emit("message:new", savedMsg)
    WS->>ClientB: io.to("channel:1").emit("message:new", savedMsg)
    ClientB-->>Bob: UI displays incoming message without refresh
```

---

## 6. Data Flow Diagrams (DFD)

### Level 0 DFD (Context Diagram)

```mermaid
flowchart TD
    User([Authenticated User])
    System[[AI-Powered Real-Time Collaborative Workspace]]
    MLService[[FastAPI ML Delay Predictor]]
    AIService[[Rule-Based NLP / Optional Gemini API]]
    DBServer[(PostgreSQL 18 - 21 Tables)]

    User -- "Login credentials, task events, chat messages, file uploads" --> System
    System -- "Auth tokens, live board updates, alerts, analytics, summaries" --> User
    System -- "Task features (complexity, workload, progress)" --> MLService
    MLService -- "Delay probability & risk classification" --> System
    System -- "Notes / text payload (if GEMINI_API_KEY set)" --> AIService
    AIService -- "Executive summary & action items" --> System
    System -- "CRUD transactions & audit history" --> DBServer
    DBServer -- "Persisted records & SQL aggregations" --> System
```

### Level 1 DFD (Decomposed Functional Modules)

```mermaid
flowchart TD
    User([User])
    
    subgraph P1 ["1.0 Authentication & RBAC"]
        AuthProc[Verify Credentials & Generate JWT]
    end

    subgraph P2 ["2.0 Project & Task Engine"]
        TaskProc[Manage Tasks & Drag-and-Drop]
        AuditProc[Log Status Change in History]
    end

    subgraph P3 ["3.0 ML Delay Forecasting"]
        MLProc[Feature Extraction & Prediction]
    end

    subgraph P4 ["4.0 Real-Time Communication"]
        ChatProc[Broadcast WebSocket Messages]
    end

    subgraph P5 ["5.0 AI Productivity & NLP"]
        AIProc[Summarize & Extract Action Items]
    end

    subgraph P6 ["6.0 Analytics & Reporting"]
        AnalyticProc[SQL Aggregations & Recharts]
    end

    User -->|Credentials| AuthProc
    AuthProc -->|User Identity| TaskProc
    AuthProc -->|User Identity| ChatProc
    TaskProc -->|Task State| AuditProc
    TaskProc -->|Task Parameters| MLProc
    MLProc -->|Risk Badge| TaskProc
    ChatProc -->|Chat Transcript| AIProc
    AuditProc -->|History Data| AnalyticProc
    TaskProc -->|Task Status| AnalyticProc
    AnalyticProc -->|Interactive Charts| User
```
