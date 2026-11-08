# Machine Learning Evaluation Report: Task Delay Prediction
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

---

## 2. Dataset Specification

- **Source:** Synthetic Task Records generated via `generate_dataset.py` (Rule-based probabilistic generation).
- **Total Records:** 3,000 samples.
- **Class Distribution:**
  - `delayed = 1`: 2,015 samples (67.17%)
  - `on-time = 0`: 985 samples (32.83%)
- **Trivial Majority-Class Baseline:** **67.17%** (A naive classifier predicting "delayed" for every single task achieves 67.17% accuracy).
- **Split:** 80% Train (2,400 samples), 20% Test (600 samples), Stratified by target label.
- **Features Used (7 inputs):**
  1. `priority` (Categorical: low, medium, high -> One-Hot Encoded)
  2. `complexity` (Numeric 1-10)
  3. `estimated_days` (Numeric)
  4. `team_size` (Numeric)
  5. `assignee_workload` (Numeric: active tasks assigned)
  6. `previous_delays_ratio` (Numeric 0.0 - 1.0)
  7. `midpoint_progress` (Numeric 0% - 100% progress observed at estimated midpoint)

---

## 3. 5-Fold Stratified Cross-Validation Results

To prevent fold bias, 5-Fold Stratified Cross-Validation was conducted across the entire 3,000-record dataset:

| Model | 5-Fold Mean Accuracy | 5-Fold Mean ROC-AUC |
| :--- | :---: | :---: |
| **Logistic Regression (Baseline)** | 0.9017 (±0.0097) | 0.9670 (±0.0059) |
| **Random Forest (Primary)** | 0.8903 (±0.0103) | 0.9568 (±0.0057) |

---

## 4. Test Set Evaluation (Held-Out 600 Samples)

| Metric | Dummy Baseline | Logistic Regression | Random Forest | Model Comparison Analysis |
| :--- | :---: | :---: | :---: | :--- |
| **Accuracy** | 67.17% | **0.9067** | 0.8933 | Logistic Regression is slightly higher due to linear synthetic formula. |
| **Precision** | 67.17% | **0.9221** | 0.9007 | Logistic Regression has fewer false alarms on this dataset. |
| **Recall (Sensitivity)** | 100.00% | 0.9404 | **0.9454** | Random Forest detected 381 vs 379 delayed tasks (difference is within noise). |
| **F1-Score** | 80.36% | **0.9312** | 0.9225 | Logistic Regression scores higher overall harmonic mean. |
| **ROC-AUC** | 0.5000 | **0.9662** | 0.9564 | Both models separate classes cleanly. |

---

## 5. Random Forest Feature Importance Analysis

The trained Random Forest model provides explicit feature importance weightings:

| Feature Name | Relative Importance |
| :--- | :---: |
| `midpoint_progress` | 38.96% |
| `complexity` | 27.45% |
| `assignee_workload` | 12.02% |
| `previous_delays_ratio` | 10.54% |
| `estimated_days` | 4.65% |
| `team_size` | 2.95% |
| `priority_low` | 2.31% |
| `priority_medium` | 1.12% |

- **Academic Interpretation:** Feature importance reflects the synthetic generation rules, rather than proven real-world project dynamics. In our generation formula, midpoint progress and task complexity were given higher weight, and the Random Forest model learned these synthetic rules accordingly.


---

## 6. Viva Voce Defense: Model Selection Defense

In a viva examination, if asked why Random Forest was retained:
> *"On my synthetic data, the baseline was slightly better or equal across accuracy, F1, and ROC-AUC. I kept Random Forest because it handles non-linear feature interactions in real data and provides feature importance rankings, and I report honestly that it did not beat the baseline here. With real team data, I would compare them again."*
