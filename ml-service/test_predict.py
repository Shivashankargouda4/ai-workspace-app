import joblib
import pandas as pd

# Load the trained model pipeline
model = joblib.load('models/delay_predictor.joblib')

print("=" * 50)
print("  LIVE MACHINE LEARNING MODEL PREDICTION TEST")
print("=" * 50)

# 1. High Risk Task
high_risk_input = pd.DataFrame([{
    'priority': 'high',
    'complexity': 8,
    'estimated_days': 5,
    'team_size': 2,
    'assignee_workload': 6,
    'previous_delays_ratio': 0.5,
    'midpoint_progress': 20
}])

proba_high = float(model.predict_proba(high_risk_input)[:, 1][0])
risk_high = "HIGH [RED]" if proba_high >= 0.65 else ("MEDIUM [YELLOW]" if proba_high >= 0.35 else "LOW [GREEN]")

print("\n--- Test A: High Risk Task ---")
print("Input: Complexity=8, Workload=6, Progress@Midpoint=20%, Priority=High")
print(f"Delay Probability: {proba_high * 100:.1f}% ({proba_high:.4f})")
print(f"Assigned Risk Level: {risk_high}")

# 2. Low Risk Task
low_risk_input = pd.DataFrame([{
    'priority': 'low',
    'complexity': 2,
    'estimated_days': 3,
    'team_size': 4,
    'assignee_workload': 1,
    'previous_delays_ratio': 0.1,
    'midpoint_progress': 60
}])

proba_low = float(model.predict_proba(low_risk_input)[:, 1][0])
risk_low = "HIGH [RED]" if proba_low >= 0.65 else ("MEDIUM [YELLOW]" if proba_low >= 0.35 else "LOW [GREEN]")

print("\n--- Test B: Low Risk Task ---")
print("Input: Complexity=2, Workload=1, Progress@Midpoint=60%, Priority=Low")
print(f"Delay Probability: {proba_low * 100:.1f}% ({proba_low:.4f})")
print(f"Assigned Risk Level: {risk_low}")
print("\n" + "=" * 50)
