# Machine Learning Evaluation Report: Task Delay Prediction
**Project Title:** AI-Powered Real-Time Collaborative Workspace with Predictive Analytics  
**Candidate:** Shivashankargoud B R (Reg No: KUB25MCA019)  
**Program:** Master of Computer Applications (MCA)  
**Institution:** Kishkindha University  

---

## 1. Academic Disclosures

> **Synthetic Data Disclosure:**  
> The ML dataset is synthetic, so the scores show how the pipeline behaves, not real-world accuracy. Real-world project management tasks carry noisy human factors, unclear requirements, and team dynamics that synthetic formulas cannot fully capture.

> **AI Assistance Disclosure:**  
> AI-assisted development tools were used in building this project.

---

## 2. Dataset Specification

- **Source:** Synthetic Task Records generated via `generate_dataset.py` (Rule-based probabilistic generation).
- **Total Records:** 3,000 samples.
- **Class Distribution:**
  - `delayed = 1`: 2,015 samples (67.17%)
  - `on-time = 0`: 985 samples (32.83%)
- **Trivial Majority-Class Baseline:** **67.17%** (A naive classifier predicting "delayed" for every single task achieves 67.17% accuracy).
- **Split:** 80% Train (2,400 samples), 20% Test (600 samples), Stratified by target label.
- **Features Used (6 inputs):**
  1. `priority` (Categorical: low, medium, high -> One-Hot Encoded)
  2. `complexity` (Numeric 1-10)
  3. `estimated_days` (Numeric)
  4. `team_size` (Numeric)
  5. `assignee_workload` (Numeric: active tasks assigned)
  6. `previous_delays_ratio` (Numeric 0.0 - 1.0)
  7. `midpoint_progress` (Numeric 0% - 100% progress observed at estimated midpoint)

---

## 3. Honest Model Comparison

Both models were trained using a scikit-learn `Pipeline` incorporating `StandardScaler` for numeric features and `OneHotEncoder` for categorical features.

| Metric | Dummy Baseline | Logistic Regression | Random Forest | Model Comparison Analysis |
| :--- | :---: | :---: | :---: | :--- |
| **Accuracy** | 67.17% | **90.67%** | 89.33% | Logistic Regression is +1.34% higher due to linear synthetic generation. |
| **Precision** | 67.17% | **92.21%** | 90.07% | Logistic Regression has fewer false alarms on this dataset. |
| **Recall (Sensitivity)** | 100.00%* | 94.04% | **94.54%** | **Random Forest catches more actual delays** (381 vs 379 detected). |
| **F1-Score** | 80.36% | **93.12%** | 92.25% | Logistic Regression scores higher overall harmonic mean. |
| **ROC-AUC** | 0.5000 | **0.9662** | 0.9564 | Both models separate classes cleanly above the 0.50 random threshold. |

*\*Note: A naive dummy classifier achieving 100% recall produces zero specificity, labeling all on-time tasks as delayed.*

### Confusion Matrices (Test Set: 600 Samples)

**1. Logistic Regression (Baseline):**
```
                    Predicted On-Time (0)    Predicted Delayed (1)
Actual On-Time (0)          165                     32
Actual Delayed (1)           24                    379
```
- True Negatives: 165
- False Positives: 32
- False Negatives: 24
- True Positives: 379

**2. Random Forest (100 Estimators, max_depth=10):**
```
                    Predicted On-Time (0)    Predicted Delayed (1)
Actual On-Time (0)          155                     42
Actual Delayed (1)           22                    381
```
- True Negatives: 155
- False Positives: 42
- False Negatives: **22** (2 fewer missed project delays than baseline)
- True Positives: **381**

---

## 4. Viva Voce Defense: Why Deploy Random Forest?

In a viva examination, if the examiner asks:
> *"Why did you deploy Random Forest when the baseline Logistic Regression scored higher on Accuracy (90.67% vs 89.33%) and ROC-AUC (0.966 vs 0.956)?"*

**The Honest & Academically Sound Answer:**
1. **The Nature of the Synthetic Dataset:** Because the dataset was generated using weighted linear combinations of complexity, workload, and progress, Logistic Regression naturally fit the underlying synthetic distribution slightly more closely.
2. **Asymmetric Risk in Project Management:** In project task management, a **False Negative** (failing to flag a task that is about to blow past its deadline) is far more damaging to a project schedule than a False Positive (a warning that prompts early check-in). Random Forest achieved the highest **Recall (94.54%)**, reducing False Negatives from 24 to 22.
3. **Production Non-Linearity Readiness:** In a real-world enterprise setting, risk factors are non-linear (e.g. high workload combined with low midpoint progress creates an exponential risk cliff). Random Forest's ensemble of decision trees is architecturally equipped to model non-linear interactions without manual feature engineering.
