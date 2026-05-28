import pandas as pd
import numpy as np
import xgboost as xgb
import holidays
import datetime
from sklearn.metrics import mean_absolute_percentage_error

# ==========================================
# 0. Load the Dataset
# ==========================================
# Replace 'snacktrack_processed_data.csv' with the actual path to your file if it's in a different folder.
df = pd.read_csv('snacktrack_processed_data.csv')

# ==========================================
# 1. Feature Engineering (Date-based)
# ==========================================
df['date'] = pd.to_datetime(df['date'])
id_holidays = holidays.ID()
df['is public holiday'] = df['date'].apply(lambda x: x in id_holidays)
df['is weekend'] = df['date'].dt.dayofweek.isin([5, 6])

# Payday Week Logic
df['is payday week'] = False
unique_year_months = df['date'].dt.to_period('M').unique()
for ym in unique_year_months:
    payday_check = datetime.date(ym.year, ym.month, 25)
    # If payday falls on a weekend or public holiday, shift to the next working day
    while payday_check.weekday() in [5, 6] or payday_check in id_holidays:
        payday_check += datetime.timedelta(days=1)
    
    # Define payday week from Monday to Sunday
    payday_week_start = payday_check - datetime.timedelta(days=payday_check.weekday())
    payday_week_end = payday_week_start + datetime.timedelta(days=6)
    
    # Apply to dataframe
    df.loc[(df['date'].dt.date >= payday_week_start) & (df['date'].dt.date <= payday_week_end), 'is payday week'] = True

# Holiday Proximity
holiday_dates = df[df['is public holiday'] == True]['date']
def days_to_holiday(d):
    future = holiday_dates[holiday_dates >= d]
    return (future.min() - d).days if not future.empty else 30

df['days_to_holiday'] = df['date'].apply(days_to_holiday)

# ==========================================
# 2. Weekly Aggregation
# ==========================================
targets = ['original pie sales', 'choco pie sales', 'keju pie sales']

# Resample data to a weekly frequency, starting on Monday ('W-MON')
df_weekly = df.set_index('date').resample('W-MON').agg({
    'original pie sales': 'sum', 
    'choco pie sales': 'sum', 
    'keju pie sales': 'sum',
    'is public holiday': 'sum', 
    'is payday week': 'max', 
    'rainfall_mm': 'mean',
    'avg_temperature_c': 'mean', 
    'days_to_holiday': 'min'
})

# ==========================================
# 3. Lag and Rolling Features
# ==========================================
for col in targets:
    # 1-week lag
    df_weekly[f'{col}_lag1'] = df_weekly[col].shift(1)
    # 4-week rolling mean of the lag
    df_weekly[f'{col}_roll_mean_4'] = df_weekly[col].shift(1).rolling(4).mean()
    # Log transformation of targets
    df_weekly[f'log_{col}'] = np.log1p(df_weekly[col])

# Drop NaN rows created by shifting and rolling operations
df_weekly = df_weekly.dropna()

# ==========================================
# 4. Model Training & Forecasting
# ==========================================
features = ['is public holiday', 'is payday week', 'rainfall_mm', 'avg_temperature_c', 'days_to_holiday'] + \
           [f'{c}_lag1' for c in targets] + [f'{c}_roll_mean_4' for c in targets]

# Forecast parameters for next week
last_date = df_weekly.index.max()
next_week = last_date + pd.Timedelta(weeks=1)
future_row = pd.DataFrame(index=[next_week])

# Populate future row with estimates/known variables
future_row['is public holiday'] = 0
future_row['is payday week'] = False
future_row['rainfall_mm'] = df_weekly['rainfall_mm'].iloc[-4:].mean()  # using a 4-week average for weather
future_row['avg_temperature_c'] = df_weekly['avg_temperature_c'].iloc[-4:].mean()
future_row['days_to_holiday'] = max(0, df_weekly['days_to_holiday'].iloc[-1] - 7)

for col in targets:
    future_row[f'{col}_lag1'] = df_weekly[col].iloc[-1]
    future_row[f'{col}_roll_mean_4'] = df_weekly[col].iloc[-4:].mean()

stock_recommendations = []

for col in targets:
    # Initialize XGBoost model
    model = xgb.XGBRegressor(n_estimators=200, max_depth=5, learning_rate=0.05, random_state=42)
    model.fit(df_weekly[features], df_weekly[f'log_{col}'])
    
    # Calculate error (MAPE) on training data to establish a safety buffer
    preds_train = np.expm1(model.predict(df_weekly[features]))
    mape = mean_absolute_percentage_error(df_weekly[col], preds_train)
    
    # Predict the target for next week using the future row (ensure column order matches)
    prediction = np.expm1(model.predict(future_row[features]))[0]
    
    stock_recommendations.append({
        'Product': col,
        'Forecast': round(prediction, 2),
        'Safety Buffer Volume': round(prediction * mape, 2),
        'Recommended Stock': int(np.ceil(prediction * (1 + mape)))
    })

# ==========================================
# 5. Output Results
# ==========================================
final_df = pd.DataFrame(stock_recommendations)
print(f"Forecast for week starting: {next_week.date()}")

# Print final_df in standard python, or use display(final_df) if in a Jupyter Notebook
try:
    display(final_df)
except NameError:
    print(final_df.to_string())