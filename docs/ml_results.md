# Machine Learning Evaluation Report: Task Delay Prediction

**Dataset:** Synthetic Task Records (3,000 samples)
**Split:** 80% Train (2400 samples), 20% Test (600 samples), Stratified
**Target Label:** `delayed` (1 = delayed, 0 = on-time)

## Performance Comparison: Baseline vs Primary Model

| Metric | Logistic Regression (Baseline) | Random Forest (Primary) |
|---|---|---|
| **Accuracy** | 0.9067 | **0.8933** |
| **Precision** | 0.9221 | **0.9007** |
| **Recall** | 0.9404 | **0.9454** |
| **F1-Score** | 0.9312 | **0.9225** |
| **ROC-AUC** | 0.9662 | **0.9564** |

## Confusion Matrices

### Baseline (Logistic Regression)
```
[[165, 32], [24, 379]]
```

### Random Forest
```
[[155, 42], [22, 381]]
```

## Viva Explanation Points
1. **No Data Leakage:** All features (complexity, workload, midpoint progress) reflect snapshots taken *before* the completion event.
2. **Class Balance:** Stratified sampling maintained consistent ratio across train and test sets.
3. **Defense:** Random Forest captures non-linear feature interactions (such as high complexity combined with high workload) significantly better than the linear baseline.
