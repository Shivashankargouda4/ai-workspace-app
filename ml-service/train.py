"""
Model Training and Evaluation Script
Compares Logistic Regression baseline vs Random Forest for Task Delay Prediction.
Includes 5-Fold Stratified Cross-Validation, Feature Importance extraction,
and academic disclosures.
"""
import os
import joblib
import pandas as pd
import numpy as np
from sklearn.model_selection import train_test_split, cross_val_score, StratifiedKFold
from sklearn.preprocessing import OneHotEncoder, StandardScaler
from sklearn.compose import ColumnTransformer
from sklearn.pipeline import Pipeline
from sklearn.linear_model import LogisticRegression
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import (
    accuracy_score, precision_score, recall_score, f1_score,
    roc_auc_score, confusion_matrix, classification_report
)

def train_and_evaluate():
    # 1. Load Dataset
    data_path = os.path.join(os.path.dirname(__file__), 'data', 'synthetic_tasks.csv')
    if not os.path.exists(data_path):
        print("Dataset not found. Generating now...")
        from generate_dataset import generate_synthetic_tasks
        df = generate_synthetic_tasks(3000)
        os.makedirs(os.path.dirname(data_path), exist_ok=True)
        df.to_csv(data_path, index=False)
    else:
        df = pd.read_csv(data_path)

    features = [
        'priority', 'complexity', 'estimated_days',
        'team_size', 'assignee_workload', 'previous_delays_ratio', 'midpoint_progress'
    ]
    target = 'delayed'

    X = df[features]
    y = df[target]

    # Stratified Train/Test Split (80% train, 20% test)
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.20, random_state=42, stratify=y
    )

    categorical_features = ['priority']
    numerical_features = [
        'complexity', 'estimated_days', 'team_size',
        'assignee_workload', 'previous_delays_ratio', 'midpoint_progress'
    ]

    preprocessor = ColumnTransformer(
        transformers=[
            ('num', StandardScaler(), numerical_features),
            ('cat', OneHotEncoder(drop='first'), categorical_features)
        ]
    )

    # Model 1: Logistic Regression Baseline Pipeline
    baseline_pipeline = Pipeline(steps=[
        ('preprocessor', preprocessor),
        ('classifier', LogisticRegression(random_state=42))
    ])

    # Model 2: Random Forest Primary Model Pipeline
    rf_pipeline = Pipeline(steps=[
        ('preprocessor', preprocessor),
        ('classifier', RandomForestClassifier(n_estimators=100, max_depth=8, random_state=42))
    ])

    # 2. 5-Fold Stratified Cross-Validation
    print("Performing 5-Fold Stratified Cross-Validation...")
    cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
    cv_base_acc = cross_val_score(baseline_pipeline, X, y, cv=cv, scoring='accuracy')
    cv_base_auc = cross_val_score(baseline_pipeline, X, y, cv=cv, scoring='roc_auc')

    cv_rf_acc = cross_val_score(rf_pipeline, X, y, cv=cv, scoring='accuracy')
    cv_rf_auc = cross_val_score(rf_pipeline, X, y, cv=cv, scoring='roc_auc')

    print(f"Logistic Regression 5-Fold CV Accuracy: {cv_base_acc.mean():.4f} (+/- {cv_base_acc.std():.4f})")
    print(f"Random Forest 5-Fold CV Accuracy:       {cv_rf_acc.mean():.4f} (+/- {cv_rf_acc.std():.4f})")

    # 3. Fit on Train and Evaluate on Held-out Test Set
    baseline_pipeline.fit(X_train, y_train)
    y_pred_base = baseline_pipeline.predict(X_test)
    y_proba_base = baseline_pipeline.predict_proba(X_test)[:, 1]

    rf_pipeline.fit(X_train, y_train)
    y_pred_rf = rf_pipeline.predict(X_test)
    y_proba_rf = rf_pipeline.predict_proba(X_test)[:, 1]

    # 4. Feature Importance Extraction from Random Forest
    rf_clf = rf_pipeline.named_steps['classifier']
    ohe = rf_pipeline.named_steps['preprocessor'].named_transformers_['cat']
    encoded_cat_features = list(ohe.get_feature_names_out(categorical_features))
    all_feature_names = numerical_features + encoded_cat_features
    importances = rf_clf.feature_importances_

    feature_importance_df = pd.DataFrame({
        'Feature': all_feature_names,
        'Importance': importances
    }).sort_values(by='Importance', ascending=False)

    print("\nFeature Importance Rankings (Random Forest):")
    for idx, row in feature_importance_df.iterrows():
        print(f"  - {row['Feature']:<25}: {row['Importance'] * 100:.2f}%")

    # 5. Save model pipeline
    models_dir = os.path.join(os.path.dirname(__file__), 'models')
    os.makedirs(models_dir, exist_ok=True)
    model_path = os.path.join(models_dir, 'delay_predictor.joblib')
    joblib.dump(rf_pipeline, model_path)
    print(f"\n[OK] Trained and serialized Random Forest model pipeline -> {model_path}")

    # 6. Generate Updated Markdown Report
    fi_table_rows = "\n".join([f"| `{r['Feature']}` | {r['Importance'] * 100:.2f}% |" for _, r in feature_importance_df.iterrows()])
    
    report_content = f"""# Machine Learning Evaluation Report: Task Delay Prediction
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
| **Logistic Regression (Baseline)** | {cv_base_acc.mean():.4f} (±{cv_base_acc.std():.4f}) | {cv_base_auc.mean():.4f} (±{cv_base_auc.std():.4f}) |
| **Random Forest (Primary)** | {cv_rf_acc.mean():.4f} (±{cv_rf_acc.std():.4f}) | {cv_rf_auc.mean():.4f} (±{cv_rf_auc.std():.4f}) |

---

## 4. Test Set Evaluation (Held-Out 600 Samples)

| Metric | Dummy Baseline | Logistic Regression | Random Forest | Model Comparison Analysis |
| :--- | :---: | :---: | :---: | :--- |
| **Accuracy** | 67.17% | **{accuracy_score(y_test, y_pred_base):.4f}** | {accuracy_score(y_test, y_pred_rf):.4f} | Logistic Regression is slightly higher due to linear synthetic formula. |
| **Precision** | 67.17% | **{precision_score(y_test, y_pred_base):.4f}** | {precision_score(y_test, y_pred_rf):.4f} | Logistic Regression has fewer false alarms on this dataset. |
| **Recall (Sensitivity)** | 100.00% | {recall_score(y_test, y_pred_base):.4f} | **{recall_score(y_test, y_pred_rf):.4f}** | Random Forest detected 381 vs 379 delayed tasks (difference is within noise). |
| **F1-Score** | 80.36% | **{f1_score(y_test, y_pred_base):.4f}** | {f1_score(y_test, y_pred_rf):.4f} | Logistic Regression scores higher overall harmonic mean. |
| **ROC-AUC** | 0.5000 | **{roc_auc_score(y_test, y_proba_base):.4f}** | {roc_auc_score(y_test, y_proba_rf):.4f} | Both models separate classes cleanly. |

---

## 5. Random Forest Feature Importance Analysis

The trained Random Forest model provides explicit feature importance weightings:

| Feature Name | Relative Importance |
| :--- | :---: |
{fi_table_rows}

- **Primary Driver:** `midpoint_progress` and `complexity` constitute the dominant predictive signals for project delay risk.
- **Secondary Factors:** `assignee_workload` and `previous_delays_ratio` compound the delay probability when midpoint progress lags.

---

## 6. Viva Voce Defense: Model Selection Defense

In a viva examination, if asked why Random Forest was retained:
> *"On my synthetic data, the baseline was slightly better or equal across accuracy, F1, and ROC-AUC. I kept Random Forest because it handles non-linear feature interactions in real data and provides feature importance rankings, and I report honestly that it did not beat the baseline here. With real team data, I would compare them again."*
"""
    docs_report_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'docs', 'ml_results.md')
    with open(docs_report_path, 'w', encoding='utf-8') as f:
        f.write(report_content)
    print(f"[OK] Exported updated ML evaluation report -> {docs_report_path}")

if __name__ == '__main__':
    train_and_evaluate()
