# SnackTrack: Sales Trend Forecasting System for Snack Distribution

**Live Demo:** [https://snacktrack.conradium.my.id/](https://snacktrack.conradium.my.id/)

SnackTrack is a predictive analytics and inventory optimization system designed to transition distribution operations from intuition-driven guessing to data-informed strategy...

---

## Repository Structure

The project structure is strictly organized as follows:
* **`app/`**: Contains the frontend interactive dashboard implementation.
    * `slit.py`: Streamlit-based graphical user interface (GUI) displaying predictive trajectories and order management.
* **`data/`**: Storage folder for foundational data arrays.
    * `snacktrack_processed_data.csv`: Cleaned, weekly aggregated transaction records spanning from Jan 2024 to March 2026 (114 week cycles).
    * `Bakery sales.csv`: Raw, legacy daily transaction logs used for early feature extraction and baseline benchmarking.
    * `bulk_products_template.csv` & `bulk_sales_template.csv`: Standardized templates for handling external localized operations.
* **`src/`**: Core machine learning execution scripts.
    * `pipeline.py`: Comprehensive feature engineering, chronological train-test data splitting, hyperparameter-locked modeling, and error evaluation script.
* **`.gitignore`**: Prevents runtime localized binaries (such as `__pycache__/` and compiled `.pyc` files) from polluting the repository.
* **`requirements.txt`**: Complete manifest of pinned dependencies required to reproduce the environment.

---

## 🛠️ Methodological Framework & Core Features

### 1. Context-Aware Feature Engineering
The ingestion pipeline automatically engineers localized context layers to maximize training variance handling:
* **Indonesian Calendar Alignment**: Integrates national public holidays natively using `holidays.ID()`.
* **Dynamic Payday Shift Engine**: Automates salary week mapping (targeting the 25th of each month) and programmatically shifts dates downstream if the payment threshold overlaps with weekends or bank holidays.
* **Time-Series Lagging**: Dynamically generates historical indicators including `lag1` (prior week sales volume) and `roll_mean_4` (a rolling 4-week smoothed moving average).

### 2. Variance Stabilization & XGBoost Engine
To counteract non-linear spikes, target vectors are transformed via natural log scaling before model submission:
$$y_{trans} = \ln(y + 1)$$
Predictions are fed into an Extreme Gradient Boosting (**XGBoost Regressor**) architecture locked at optimal hyperparameters derived during empirical validation:
* `n_estimators=200`
* `max_depth=5`
* `learning_rate=0.05`

The final output is mapped back to actual scale values using the inverse exponential function (`np.expm1`).

### 3. Safety Buffer & Inventory Optimizer
Rather than outputting raw point forecasts, the engine actively ingests model error rates (Training Mean Absolute Percentage Error) to form non-zero risk margins. The inventory recommendation uses a ceiling function to guarantee integers representing real unfragmented physical products:
$$\text{Recommended Stock} = \lceil \text{Forecast} \times (1 + \text{MAPE}) \rceil$$

---

## Execution & Deployment Guide

### 1. Environment Setup
Clone the workspace and establish the necessary execution libraries:
```bash
git clone [https://github.com/your-username/snacktrack.git](https://github.com/your-username/snacktrack.git)
cd snacktrack
pip install -r requirements.txt
