"""
Synthetic Task Dataset Generator
Generates realistic collaboration task records for ML Delay Prediction.
Note: Data is synthetic and clearly labelled as such for academic integrity.
"""
import random
import numpy as np
import pandas as pd
from datetime import datetime, timedelta

def generate_synthetic_tasks(num_records=3000, seed=42):
    random.seed(seed)
    np.random.seed(seed)

    priorities = ['low', 'medium', 'high']
    data = []

    base_time = datetime(2026, 1, 1, 9, 0, 0)

    for i in range(1, num_records + 1):
        priority = random.choices(priorities, weights=[0.3, 0.5, 0.2])[0]
        complexity = random.randint(1, 10) # 1 to 10
        estimated_days = random.randint(1, 20)
        team_size = random.randint(1, 6)
        assignee_workload = random.randint(1, 8) # concurrent tasks
        previous_delays_ratio = round(np.clip(np.random.normal(0.25, 0.15), 0.0, 1.0), 2)
        
        # Midpoint progress snapshot (taken BEFORE completion, preventing target leakage)
        # Low progress at midpoint is strong indicator of eventual delay
        expected_midpoint_progress = 50 + np.random.normal(0, 15)
        midpoint_progress = int(np.clip(expected_midpoint_progress - (complexity * 2) - (assignee_workload * 2), 5, 95))

        # Delay probability calculated with realistic domain rules + noise
        risk_score = (
            (complexity * 0.15) +
            (assignee_workload * 0.12) +
            (previous_delays_ratio * 2.0) +
            (0.5 if priority == 'high' else (0.2 if priority == 'medium' else 0.0)) -
            (midpoint_progress * 0.03) +
            np.random.normal(0, 0.35) # random real-world noise
        )

        # Binary label: 1 if delayed, 0 if on-time
        delayed = 1 if risk_score > 0.8 else 0

        data.append({
            'task_id': i,
            'priority': priority,
            'complexity': complexity,
            'estimated_days': estimated_days,
            'team_size': team_size,
            'assignee_workload': assignee_workload,
            'previous_delays_ratio': previous_delays_ratio,
            'midpoint_progress': midpoint_progress,
            'delayed': delayed
        })

    df = pd.DataFrame(data)
    return df

if __name__ == '__main__':
    df = generate_synthetic_tasks(3000)
    output_path = 'data/synthetic_tasks.csv'
    df.to_csv(output_path, index=False)
    print(f"✅ Generated {len(df)} synthetic task records -> {output_path}")
    print(f"Class distribution:\n{df['delayed'].value_counts(normalize=True)}")
