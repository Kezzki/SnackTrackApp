"""
SnackTrack Sales Forecasting & Payment API
============================================
FastAPI backend for the SnackTrack application.
- Sales forecasting: XGBoost model training/inference per product
- Payment gateway: Duitku payment integration (create, callback, check)

Dependencies: fastapi, uvicorn, supabase, pandas, numpy, xgboost,
              scikit-learn, holidays, httpx
"""

import datetime
import hashlib
import hmac
import warnings

import holidays
import numpy as np
import pandas as pd
import xgboost as xgb
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel
from sklearn.metrics import (
    mean_absolute_error,
    mean_absolute_percentage_error,
    mean_squared_error,
    r2_score,
)
from supabase import create_client, Client

warnings.filterwarnings("ignore")

# ---------------------------------------------------------------------------
# FastAPI App
# ---------------------------------------------------------------------------
app = FastAPI(
    title="SnackTrack API",
    description="ML-powered sales prediction & Duitku payment API for SnackTrack stores",
    version="2.0.0"
)

# Optional: Disable CORS restrictions depending on how you call it
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

import os
from dotenv import load_dotenv

# Load frontend Vite .env vars if testing locally
load_dotenv()

# ---------------------------------------------------------------------------
# Supabase Config (fill in your credentials)
# ---------------------------------------------------------------------------
SUPABASE_URL = os.environ.get("SUPABASE_URL")
if not SUPABASE_URL:
    raise RuntimeError("SUPABASE_URL environment variable is required")

SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY")
if not SUPABASE_SERVICE_KEY:
    raise RuntimeError("SUPABASE_SERVICE_KEY environment variable is required")

SUPABASE_VIEW = "store_daily_sales"  # the DB view we created

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
FEATURES_REFINED = [
    "is public holiday",
    "is payday week",
    "days_to_holiday",
]

XGB_PARAMS = dict(
    objective="reg:squarederror",
    n_estimators=200,
    max_depth=5,
    learning_rate=0.05,
    random_state=42,
)

def _build_feature_list(targets: list[str]) -> list[str]:
    """Return the full refined feature list (static + per-target lag/roll)."""
    features = list(FEATURES_REFINED)
    for col in targets:
        features.append(f"{col}_lag1")
        features.append(f"{col}_roll_mean_4")
    return features


def _get_supabase_client() -> Client:
    """Create and return a Supabase client."""
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        raise ValueError(
            "SUPABASE_URL and SUPABASE_SERVICE_KEY must be set. "
            "Fill them in at the top of snacktrackbackend.py"
        )
    return create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)


def load_data(store_id: str) -> tuple[pd.DataFrame, list[str], dict[str, int], list[str]]:
    """
    Fetch daily sales data for a specific store from Supabase 
    and return a cleaned/pivoted DataFrame + dynamic targets list +
    a dict of missing/zero-sales days grouped by ISO week-start.

    Returns
    -------
    pd.DataFrame, list[str], dict[str, int], list[str]
        Cleaned DataFrame with parsed dates, targets list,
        missing_days_by_week mapping week-start date -> count, and
        missing_dates_list sorted list of ISO date strings.
    """
    client = _get_supabase_client()

    # Fetch ALL rows from the store_daily_sales view for the provided store_id.
    # Supabase PostgREST caps responses at 1000 rows by default, so we
    # paginate with .range() to make sure we get everything.
    data = []
    page_size = 1000
    offset = 0
    while True:
        response = (
            client.table(SUPABASE_VIEW)
            .select("*")
            .eq("store_id", store_id)
            .order("date")
            .range(offset, offset + page_size - 1)
            .execute()
        )
        batch = response.data
        if not batch:
            break
        data.extend(batch)
        if len(batch) < page_size:
            break  # last page
        offset += page_size

    if not data:
        raise ValueError(f"No existing sales data found for store_id: {store_id}")

    print(f"DEBUG: Supabase returned {len(data)} rows")
    if data:
        print(f"DEBUG: First row date: {data[0].get('date')}, Last row date: {data[-1].get('date')}")

    df_raw = pd.DataFrame(data)
    
    # Ensure date is datetime
    df_raw["date"] = pd.to_datetime(df_raw["date"])
    
    print(f"DEBUG: df_raw date range: {df_raw['date'].min()} to {df_raw['date'].max()}")
    
    # Pivot so each product gets its own column
    # Index: date, Columns: product_name, Values: daily_quantity
    df_pivot = df_raw.pivot_table(
        index="date", 
        columns="product_name", 
        values="daily_quantity", 
        aggfunc="sum"
    ).fillna(0).reset_index()

    # The dynamic list of products for this store
    targets = [col for col in df_pivot.columns if col != "date"]

    # Filter out inactive / deleted products
    active_resp = client.table("products") \
        .select("name") \
        .eq("store_id", store_id) \
        .eq("is_active", True) \
        .execute()
    active_names = {row["name"].lower() for row in (active_resp.data or [])}
    if active_names:
        targets = [t for t in targets if t in active_names]
        df_pivot = df_pivot[["date"] + targets]

    # --- Fill in ALL missing dates with 0 so weekly aggregation has complete weeks ---
    # Days with no orders at all are absent from the DB; reindexing them to 0 prevents
    # the rolling-window feature engineering from eating those weeks.
    df_pivot = (
        df_pivot
        .set_index("date")
        .reindex(
            pd.date_range(start=df_pivot["date"].min(), end=df_pivot["date"].max(), freq="D"),
            fill_value=0,
        )
        .reset_index()
        .rename(columns={"index": "date"})
    )

    # --- Detect missing / zero-sales days and group by week ---
    # Extend range to yesterday so the gap between last data and today is caught
    yesterday = pd.Timestamp.now().normalize() - pd.Timedelta(days=1)
    range_end = max(df_pivot["date"].max(), yesterday)
    full_range = pd.date_range(start=df_pivot["date"].min(), end=range_end, freq="D")
    existing_dates = set(df_pivot["date"].dt.normalize())

    missing_dates: list[pd.Timestamp] = []
    # Days completely absent from the (extended) range
    for d in full_range:
        if d not in existing_dates:
            missing_dates.append(d)
    # Days present but every product is 0
    for _, row in df_pivot.iterrows():
        if all(row[t] == 0 for t in targets):
            missing_dates.append(row["date"])

    # Group by W-MON week start (matches the weekly aggregation)
    missing_days_by_week: dict[str, int] = {}
    for d in missing_dates:
        week_start = (d - pd.Timedelta(days=d.weekday())).strftime("%Y-%m-%d")
        missing_days_by_week[week_start] = missing_days_by_week.get(week_start, 0) + 1

    print(f"Store {store_id} data loaded: {df_pivot.shape[0]} days, Targets: {targets}")
    print(f"DEBUG: {len(missing_dates)} missing/zero days across {len(missing_days_by_week)} weeks")
    missing_dates_list = sorted(set(d.strftime("%Y-%m-%d") for d in missing_dates))
    return df_pivot, targets, missing_days_by_week, missing_dates_list


def engineer_features(df: pd.DataFrame) -> pd.DataFrame:
    """
    Create date-based features from the raw daily data.
    """
    id_holidays = holidays.ID()

    # --- Public Holidays ---
    df["is public holiday"] = df["date"].apply(lambda x: x in id_holidays)

    # --- Weekend ---
    df["is weekend"] = df["date"].dt.dayofweek.isin([5, 6])

    # --- Payday Week ---
    df["is payday week"] = False
    unique_year_months = df["date"].dt.to_period("M").unique()
    for ym in unique_year_months:
        payday_check = datetime.date(ym.year, ym.month, 25)
        while payday_check.weekday() in [5, 6] or payday_check in id_holidays:
            payday_check += datetime.timedelta(days=1)
        payday_week_start = payday_check - datetime.timedelta(days=payday_check.weekday())
        payday_week_end = payday_week_start + datetime.timedelta(days=6)
        df.loc[
            (df["date"].dt.date >= payday_week_start)
            & (df["date"].dt.date <= payday_week_end),
            "is payday week",
        ] = True

    # --- Holiday Proximity ---
    holiday_dates = df.loc[df["is public holiday"] == True, "date"]

    def _days_to_nearest_holiday(d):
        future = holiday_dates[holiday_dates >= d]
        return (future.min() - d).days if not future.empty else 30

    df["days_to_holiday"] = df["date"].apply(_days_to_nearest_holiday)
    return df


def aggregate_weekly(df: pd.DataFrame, targets: list[str]) -> pd.DataFrame:
    """
    Resample daily data to weekly and create lag/rolling/log features.
    """
    agg_dict = {
        "is public holiday": "sum",
        "is payday week": "max",
        "days_to_holiday": "min",
    }
    # Add targets to aggregate dictionary
    for t in targets:
        agg_dict[t] = "sum"

    df_weekly = df.set_index("date").resample("W-MON").agg(agg_dict)

    for col in targets:
        # Use min_periods=1 so a short history doesn't produce NaN-filled rows.
        # The first week gets lag1=0 and roll_mean=itself (best guess with no prior data).
        df_weekly[f"{col}_lag1"] = df_weekly[col].shift(1).fillna(0)
        df_weekly[f"{col}_roll_mean_4"] = (
            df_weekly[col].shift(1).rolling(window=4, min_periods=1).mean()
        ).fillna(0)
        # Avoid log(0) issues by using log1p
        df_weekly[f"log_{col}"] = np.log1p(df_weekly[col])

    # Only drop rows where static engineered features are NaN (shouldn't happen,
    # but keeps us safe).  Do NOT drop rows purely because lag/rolling were NaN.
    static_cols = ["is public holiday", "is payday week", "days_to_holiday"]
    df_weekly = df_weekly.dropna(subset=static_cols)

    # Drop weeks where ALL products are zero (true missing-data gap weeks with no sales
    # anywhere in the week — these corrupt the model).
    if targets:
        all_zero_mask = (df_weekly[targets] == 0).all(axis=1)
        n_zero = all_zero_mask.sum()
        if n_zero > 0:
            print(f"DEBUG: Dropping {n_zero} all-zero weeks from training set")
        df_weekly = df_weekly[~all_zero_mask]

    return df_weekly


# Minimum weeks needed to attempt XGBoost train/test split
_MIN_WEEKS_XGBOOST = 3


def _simple_mean_forecast(df_weekly: pd.DataFrame, targets: list[str]) -> dict:
    """
    Fallback forecast when there is not enough data for XGBoost.
    Returns the mean weekly sales for each product, with rough metrics.
    The model entry is None to signal the caller to use the mean directly.
    """
    results: dict = {}
    for col in targets:
        mean_val = float(df_weekly[col].mean()) if len(df_weekly) > 0 else 0.0
        # Fake-but-conservative metrics: 20 % MAPE, R²=0 (unknown accuracy)
        results[col] = (None, 0.0, 0.2, mean_val * 0.2, mean_val * 0.2, mean_val)
    print(f"DEBUG: Using simple mean fallback (only {len(df_weekly)} usable week(s))")
    return results


def _train_and_evaluate(df_weekly: pd.DataFrame, targets: list[str], train_ratio: float = 0.8) -> dict:
    """
    Train one XGBoost model per target.
    Falls back to a simple mean-based forecast when there are fewer than
    _MIN_WEEKS_XGBOOST usable weeks so the API always returns a result.
    """
    if len(df_weekly) < _MIN_WEEKS_XGBOOST:
        return _simple_mean_forecast(df_weekly, targets)

    features = _build_feature_list(targets)
    train_size = max(1, int(len(df_weekly) * train_ratio))

    train_df = df_weekly.iloc[:train_size]
    test_df = df_weekly.iloc[train_size:]

    results: dict = {}

    for col in targets:
        X_tr = train_df[features]
        y_tr_log = train_df[f"log_{col}"]

        model = xgb.XGBRegressor(**XGB_PARAMS)
        model.fit(X_tr, y_tr_log)

        # Evaluate only if we have a test set
        if len(test_df) > 0:
            X_te = test_df[features]
            y_te_actual = test_df[col]
            pred_log = model.predict(X_te)
            pred_actual = np.expm1(pred_log)

            if (y_te_actual == 0).all() and (pred_actual == 0).all():
                mape, mae, rmse, r2 = 0.0, 0.0, 0.0, 1.0
            else:
                mape = mean_absolute_percentage_error(y_te_actual, pred_actual)
                mae = mean_absolute_error(y_te_actual, pred_actual)
                rmse = np.sqrt(mean_squared_error(y_te_actual, pred_actual))
                try:
                    r2 = r2_score(y_te_actual, pred_actual)
                except Exception:
                    r2 = 0.0
        else:
            # No test set — report unknown metrics
            mape, mae, rmse, r2 = 0.2, 0.0, 0.0, 0.0

        results[col] = (model, r2, mape, mae, rmse)

    return results


def predict_sales(df: pd.DataFrame, df_weekly: pd.DataFrame, refined_results: dict, targets: list[str]) -> dict:
    """
    Forecast next-week sales for each product + stock recommendations.
    Handles both XGBoost models and the simple-mean fallback (model=None).
    """
    features = _build_feature_list(targets)

    last_date = df_weekly.index.max() if len(df_weekly) > 0 else pd.Timestamp.now().normalize()

    today = pd.Timestamp.now().normalize()
    days_to_monday = (0 - today.weekday()) % 7
    if days_to_monday == 0:
        days_to_monday = 7
    current_future_monday = today + pd.Timedelta(days=days_to_monday)

    prediction_week = max(last_date + pd.Timedelta(weeks=1), current_future_monday)

    future_row = pd.DataFrame(index=[prediction_week])
    future_row["is public holiday"] = 0
    future_row["is payday week"] = False
    last_days_to_holiday = df["days_to_holiday"].iloc[-1] if len(df) > 0 else 30
    future_row["days_to_holiday"] = max(0, last_days_to_holiday - 7)

    for col in targets:
        if len(df_weekly) > 0:
            future_row[f"{col}_lag1"] = df_weekly[col].iloc[-1]
            future_row[f"{col}_roll_mean_4"] = df_weekly[col].iloc[-4:].mean()
        else:
            future_row[f"{col}_lag1"] = 0
            future_row[f"{col}_roll_mean_4"] = 0

    future_forecasts = {}
    stock_recommendations = []
    model_metrics = {}

    for col in targets:
        result_tuple = refined_results[col]

        # Simple-mean fallback: tuple has 6 items, model is None
        if result_tuple[0] is None:
            _, r2, mape, mae, rmse, mean_val = result_tuple
            prediction = round(mean_val, 2)
        else:
            # XGBoost path: re-fit on all available data and predict
            X_all = df_weekly[features]
            y_all = df_weekly[f"log_{col}"]

            final_model = xgb.XGBRegressor(**XGB_PARAMS)
            final_model.fit(X_all, y_all)

            pred_log = final_model.predict(future_row[features])
            prediction = max(0.0, float(np.expm1(pred_log)[0]))
            _, r2, mape, mae, rmse = result_tuple

        future_forecasts[col] = round(prediction, 2)
        safety_buffer = prediction * mape

        stock_recommendations.append(
            {
                "product": col,
                "forecasted_sales": round(prediction, 2),
                "mape": round(mape, 4),
                "safety_buffer": round(safety_buffer, 2),
                "recommended_stock": int(np.ceil(prediction + safety_buffer)),
                "mae": round(mae, 2),
                "rmse": round(rmse, 2),
            }
        )

        model_metrics[col] = {
            "r2": round(r2, 4),
            "mape": round(mape, 4),
            "mae": round(mae, 2),
            "rmse": round(rmse, 2),
        }

    return {
        "forecast_week": str(prediction_week.date()),
        "forecasts": future_forecasts,
        "recommendations": stock_recommendations,
        "model_metrics": model_metrics,
    }


# ---------------------------------------------------------------------------
# API Routes
# ---------------------------------------------------------------------------
class ForecastResponse(BaseModel):
    store_id: str
    forecast_week: str
    forecasts: dict[str, float]
    recommendations: list[dict]
    model_metrics: dict[str, dict]
    historical_dates: list[str] = []
    historical_sales: dict[str, list[float]] = {}
    missing_days_by_week: dict[str, int] = {}
    missing_dates: list[str] = []


@app.get("/api/forecast/{store_id}", response_model=ForecastResponse)
def get_store_forecast(store_id: str):
    """
    Generate sales forecasts for the requested store using historical Supabase data.
    """
    try:
        # 1. Load Data
        df, targets, missing_days_by_week, missing_dates_list = load_data(store_id)
        
        # 2. Engineer features
        df = engineer_features(df)
        
        # 3. Aggregate weekly
        df_weekly = aggregate_weekly(df, targets)
        
        # 4. Train & evaluate
        refined_results = _train_and_evaluate(df_weekly, targets)
        
        # 5. Forecast next week
        prediction_data = predict_sales(df, df_weekly, refined_results, targets)
        
        # 6. Extract history for graphing (extended to ~20 weeks)
        history_df = df_weekly.tail(20)
        historical_dates = history_df.index.strftime('%Y-%m-%d').tolist()
        historical_sales = {col: history_df[col].tolist() for col in targets}

        # 6b. Pad with zero-value weeks between last data and current week
        #     so the chart visualises the gap instead of jumping to prediction
        last_week = history_df.index.max()
        today = pd.Timestamp.now().normalize()
        current_monday = today - pd.Timedelta(days=today.weekday())
        gap_week = last_week + pd.Timedelta(weeks=1)
        while gap_week <= current_monday:
            week_str = gap_week.strftime('%Y-%m-%d')
            historical_dates.append(week_str)
            for col in targets:
                historical_sales[col].append(0.0)
            gap_week += pd.Timedelta(weeks=1)
        
        return {
            "store_id": store_id,
            "historical_dates": historical_dates,
            "historical_sales": historical_sales,
            "missing_days_by_week": missing_days_by_week,
            "missing_dates": missing_dates_list,
            **prediction_data
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Pipeline error: {str(e)}")

# ---------------------------------------------------------------------------
# Midtrans Payment Gateway Config
# ---------------------------------------------------------------------------
import midtransclient

MIDTRANS_SERVER_KEY = os.environ.get("MIDTRANS_SERVER_KEY", "")
MIDTRANS_CLIENT_KEY = os.environ.get("MIDTRANS_CLIENT_KEY", "")
MIDTRANS_IS_PRODUCTION = os.environ.get("MIDTRANS_IS_PRODUCTION", "false").lower() == "true"

# Initialize Midtrans Snap client
snap = midtransclient.Snap(
    is_production=MIDTRANS_IS_PRODUCTION,
    server_key=MIDTRANS_SERVER_KEY,
    client_key=MIDTRANS_CLIENT_KEY,
)


# ---------------------------------------------------------------------------
# Midtrans Payment Pydantic Models
# ---------------------------------------------------------------------------
class PaymentCreateRequest(BaseModel):
    """Request body for creating a Midtrans Snap transaction."""
    order_id: str
    amount: int
    product_details: str = ""
    customer_name: str = ""
    customer_email: str = ""
    customer_phone: str = ""
    item_details: list[dict] = []
    # These fields are ignored by Midtrans but kept for frontend compatibility
    payment_method: str = ""
    action: str = ""


class PaymentCheckRequest(BaseModel):
    """Request body for checking a Midtrans transaction status."""
    order_id: str
    action: str = ""


# ---------------------------------------------------------------------------
# Midtrans Payment API Routes
# ---------------------------------------------------------------------------
@app.post("/api/payment/create-transaction")
async def create_midtrans_transaction(req: PaymentCreateRequest):
    """
    Create a Snap transaction token via the Midtrans API.
    Returns a token and redirect_url for the Snap payment popup/page.
    """
    if not MIDTRANS_SERVER_KEY:
        raise HTTPException(
            status_code=500,
            detail="Midtrans credentials not configured. Set MIDTRANS_SERVER_KEY."
        )

    # Split customer name into first/last
    name_parts = req.customer_name.strip().split(" ", 1)
    first_name = name_parts[0] if name_parts else "Customer"
    last_name = name_parts[1] if len(name_parts) > 1 else ""

    # Build Midtrans transaction parameters
    param = {
        "transaction_details": {
            "order_id": req.order_id,
            "gross_amount": req.amount,
        },
        "customer_details": {
            "first_name": first_name,
            "last_name": last_name,
            "email": req.customer_email,
            "phone": req.customer_phone,
        },
        "expiry": {
            "start_time": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d %H:%M:%S +0000"),
            "unit": "hours",
            "duration": 24,
        },
    }

    # Add item details if provided
    if req.item_details:
        midtrans_items = []
        items_total = 0
        for item in req.item_details:
            price = int(item.get("price", 0))
            qty = int(item.get("quantity", 1))
            midtrans_items.append({
                "id": item.get("id", item.get("name", "item")[:50]),
                "name": item.get("name", "Product")[:50],
                "price": price,
                "quantity": qty,
            })
            items_total += price * qty

        # If there's a difference (e.g. delivery fee), add a misc line item
        diff = req.amount - items_total
        if diff > 0:
            midtrans_items.append({
                "id": "delivery_fee",
                "name": "Ongkos Kirim",
                "price": diff,
                "quantity": 1,
            })

        param["item_details"] = midtrans_items

    print(f"[Midtrans] Creating transaction: order={req.order_id}, amount={req.amount}")

    try:
        transaction = snap.create_transaction(param)
        snap_token = transaction.get("token", "")
        redirect_url = transaction.get("redirect_url", "")

        print(f"[Midtrans] Token created: {snap_token[:20]}..., redirect={redirect_url[:60]}...")

        # Update the transaction record in Supabase
        supabase_client = _get_supabase_client()
        supabase_client.table("transactions").update({
            "duitku_reference": snap_token,  # Reuse column for Midtrans snap token
            "duitku_payment_url": redirect_url,  # Reuse column for redirect URL
            "payment_status": "pending",
        }).eq("order_id", req.order_id).execute()

        return {
            "success": True,
            "snap_token": snap_token,
            "redirect_url": redirect_url,
            "client_key": MIDTRANS_CLIENT_KEY,
        }

    except Exception as e:
        print(f"[Midtrans] Error creating transaction: {e}")
        raise HTTPException(status_code=502, detail=f"Midtrans error: {str(e)}")


@app.post("/api/payment/callback")
async def midtrans_notification(request: Request):
    """
    Notification/webhook endpoint that Midtrans calls (server-to-server)
    when a payment status changes. Content-Type is application/json.

    Must return HTTP 200 to acknowledge receipt.
    """
    try:
        payload = await request.json()
    except Exception:
        return PlainTextResponse("Bad Request", status_code=400)

    order_id = payload.get("order_id", "")
    transaction_status = payload.get("transaction_status", "")
    fraud_status = payload.get("fraud_status", "accept")
    payment_type = payload.get("payment_type", "")
    gross_amount = payload.get("gross_amount", "0")
    signature_key = payload.get("signature_key", "")
    status_code = payload.get("status_code", "")

    print(f"[Midtrans Callback] order={order_id}, status={transaction_status}, "
          f"fraud={fraud_status}, type={payment_type}")

    # Verify signature: SHA512(order_id + status_code + gross_amount + server_key)
    raw_sig = f"{order_id}{status_code}{gross_amount}{MIDTRANS_SERVER_KEY}"
    expected_sig = hashlib.sha512(raw_sig.encode()).hexdigest()

    if signature_key != expected_sig:
        print(f"[Midtrans Callback] Bad signature! Ignoring.")
        return PlainTextResponse("Bad Signature", status_code=403)

    print(f"[Midtrans Callback] Signature valid. Processing...")

    supabase_client = _get_supabase_client()

    # Map Midtrans statuses to our payment/order statuses
    if transaction_status in ("capture", "settlement"):
        if fraud_status == "accept":
            new_payment_status = "paid"
            new_order_status = "menunggu"
            print(f"[Midtrans Callback] Payment SUCCESS for {order_id}")
        else:
            new_payment_status = "failed"
            new_order_status = "dibatalkan"
            print(f"[Midtrans Callback] Payment FRAUD DENIED for {order_id}")
    elif transaction_status == "pending":
        new_payment_status = "pending"
        new_order_status = None
        print(f"[Midtrans Callback] Payment PENDING for {order_id}")
    elif transaction_status in ("cancel", "deny", "expire"):
        new_payment_status = "failed"
        new_order_status = "dibatalkan"
        print(f"[Midtrans Callback] Payment {transaction_status.upper()} for {order_id}")
    else:
        new_payment_status = "pending"
        new_order_status = None
        print(f"[Midtrans Callback] Unknown status '{transaction_status}' for {order_id}")

    try:
        # Update transaction
        supabase_client.table("transactions").update({
            "payment_status": new_payment_status,
            "payment_code": payment_type,
        }).eq("order_id", order_id).execute()

        # Update order status if applicable
        if new_order_status:
            order_update = {
                "status": new_order_status,
                "updated_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            }
            # When payment succeeds, give seller 24h to process the order
            if new_order_status == "menunggu":
                order_update["deadline"] = (
                    datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(hours=24)
                ).isoformat()
            supabase_client.table("orders").update(order_update).eq("id", order_id).execute()

        # Notify seller AND buyer on successful payment
        if new_payment_status == "paid":
            tx_response = supabase_client.table("transactions").select(
                "seller_id, buyer_id, amount"
            ).eq("order_id", order_id).execute()

            if tx_response.data:
                seller_id = tx_response.data[0]["seller_id"]
                buyer_id = tx_response.data[0]["buyer_id"]
                tx_amount = tx_response.data[0]["amount"]

                # Fetch order items for a summary in the notification
                order_number = f"TRX-{order_id[:8].upper()}"
                items_summary = ""
                store_name = ""
                try:
                    items_resp = supabase_client.table("order_items").select(
                        "quantity, product:product_id(name)"
                    ).eq("order_id", order_id).execute()
                    if items_resp.data:
                        item_parts = []
                        for item in items_resp.data:
                            pname = item.get("product", {}).get("name", "Produk") if isinstance(item.get("product"), dict) else "Produk"
                            qty = item.get("quantity", 1)
                            item_parts.append(f"{pname} x{qty}")
                        items_summary = ", ".join(item_parts)

                    # Fetch store name for buyer notification
                    order_resp = supabase_client.table("orders").select(
                        "store:store_id(name)"
                    ).eq("id", order_id).execute()
                    if order_resp.data:
                        store_data = order_resp.data[0].get("store")
                        if isinstance(store_data, dict):
                            store_name = store_data.get("name", "")
                except Exception as detail_err:
                    print(f"[Midtrans Callback] Error fetching order details: {detail_err}")

                amount_str = f"Rp {int(tx_amount):,}".replace(",", ".")

                # Notify seller — include items summary
                seller_msg = f"Pembayaran {amount_str} untuk pesanan {order_number} telah berhasil."
                if items_summary:
                    seller_msg += f" Item: {items_summary}."
                supabase_client.table("notifications").insert({
                    "user_id": seller_id,
                    "title": f"Pesanan Baru — {order_number}",
                    "message": seller_msg,
                    "type": "payment",
                    "action_url": "/orders",
                    "order_id": order_id,
                }).execute()

                # Notify buyer — include store name
                buyer_msg = f"Pembayaran {amount_str} telah dikonfirmasi."
                if store_name:
                    buyer_msg += f" Pesananmu di {store_name} sedang diproses."
                else:
                    buyer_msg += " Pesananmu sedang diproses oleh penjual."
                supabase_client.table("notifications").insert({
                    "user_id": buyer_id,
                    "title": f"Pembayaran Berhasil — {order_number}",
                    "message": buyer_msg,
                    "type": "payment",
                    "action_url": "/transaksi",
                    "order_id": order_id,
                }).execute()

        print(f"[Midtrans Callback] Database updated successfully")

    except Exception as e:
        print(f"[Midtrans Callback] Error updating database: {e}")

    return PlainTextResponse("OK", status_code=200)


@app.post("/api/payment/check-status")
async def check_midtrans_transaction(req: PaymentCheckRequest):
    """
    Check the status of a Midtrans transaction.
    Useful as a fallback if notifications are delayed.
    """
    if not MIDTRANS_SERVER_KEY:
        raise HTTPException(
            status_code=500,
            detail="Midtrans credentials not configured."
        )

    try:
        # Use the Core API client for status checks
        core = midtransclient.CoreApi(
            is_production=MIDTRANS_IS_PRODUCTION,
            server_key=MIDTRANS_SERVER_KEY,
            client_key=MIDTRANS_CLIENT_KEY,
        )
        status = core.transactions.status(req.order_id)

        return {
            "order_id": status.get("order_id"),
            "transaction_status": status.get("transaction_status"),
            "fraud_status": status.get("fraud_status"),
            "payment_type": status.get("payment_type"),
            "gross_amount": status.get("gross_amount"),
            "status_code": status.get("status_code"),
            "status_message": status.get("status_message"),
        }

    except Exception as e:
        print(f"[Midtrans] Error checking status: {e}")
        raise HTTPException(status_code=502, detail=f"Midtrans error: {str(e)}")


class RefundRequest(BaseModel):
    order_id: str
    refund_request_id: str
    reason: str

@app.post("/api/payment/refund")
async def process_refund(body: RefundRequest, request: Request):
    """
    Attempt a Midtrans refund for a paid order.
    - If Midtrans supports it (card/GoPay): marks refund_requests row as 'refunded'
    - If Midtrans returns error (QRIS/VA/transfer): marks as 'pending_manual' for admin
    """
    api_secret = os.environ.get("INTERNAL_API_SECRET", "")
    if not api_secret:
        raise HTTPException(status_code=500, detail="Server misconfiguration")

    request_secret = request.headers.get("x-api-secret", "")
    if not hmac.compare_digest(api_secret, request_secret):
        raise HTTPException(status_code=401, detail="Tidak diizinkan")

    if not MIDTRANS_SERVER_KEY:
        raise HTTPException(status_code=500, detail="Midtrans credentials not configured.")

    supabase_client = _get_supabase_client()

    # Fetch the transaction to get the Midtrans order_id and amount
    tx_response = supabase_client.table("transactions").select(
        "id, amount, payment_status, payment_method, duitku_reference"
    ).eq("order_id", body.order_id).execute()

    if not tx_response.data:
        raise HTTPException(status_code=404, detail="Transaction not found.")

    tx = tx_response.data[0]

    if tx["payment_status"] != "paid":
        raise HTTPException(status_code=400, detail="Order has not been paid — cannot refund.")

    # 1. Verify the refund_request row exists and belongs to the order
    rr_check = supabase_client.table("refund_requests") \
        .select("id, order_id, buyer_id, status") \
        .eq("id", body.refund_request_id) \
        .eq("order_id", body.order_id) \
        .single() \
        .execute()

    if not rr_check.data:
        raise HTTPException(status_code=404, detail="Permintaan pengembalian tidak ditemukan atau tidak sesuai dengan order")

    if rr_check.data["status"] not in ("pending", "pending_manual"):
        raise HTTPException(status_code=409, detail="Permintaan pengembalian tidak dalam status yang dapat diproses")

    # Mark request as processing
    supabase_client.table("refund_requests").update({
        "status": "processing",
        "updated_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    }).eq("id", body.refund_request_id).execute()

    try:
        core = midtransclient.CoreApi(
            is_production=MIDTRANS_IS_PRODUCTION,
            server_key=MIDTRANS_SERVER_KEY,
            client_key=MIDTRANS_CLIENT_KEY,
        )

        refund_key = f"refund-{body.order_id[:8]}-{int(datetime.datetime.now().timestamp())}"
        refund_result = core.transactions.refund(body.order_id, {
            "refund_key": refund_key,
            "amount": int(tx["amount"]),
            "reason": body.reason,
        })

        refund_id = refund_result.get("refund_transaction_id") or refund_result.get("transaction_id") or refund_key

        # Success — mark as refunded
        supabase_client.table("refund_requests").update({
            "status": "refunded",
            "midtrans_refund_id": str(refund_id),
            "refund_amount": tx["amount"],
            "updated_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        }).eq("id", body.refund_request_id).execute()

        # Cancel the order
        supabase_client.table("orders").update({
            "status": "dibatalkan",
            "updated_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        }).eq("id", body.order_id).execute()

        return {"status": "refunded", "refund_id": refund_id, "amount": tx["amount"]}

    except Exception as e:
        error_msg = str(e)
        print(f"[Refund] Midtrans error: {error_msg}")

        # Midtrans doesn't support API refund for this payment method — flag for manual admin action
        supabase_client.table("refund_requests").update({
            "status": "pending_manual",
            "admin_note": f"Midtrans API error: {error_msg}",
            "updated_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        }).eq("id", body.refund_request_id).execute()

        # Still cancel the order so buyer isn't stuck
        supabase_client.table("orders").update({
            "status": "dibatalkan",
            "updated_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        }).eq("id", body.order_id).execute()

        return {
            "status": "pending_manual",
            "message": "Refund tidak dapat diproses otomatis. Admin akan memproses pengembalian dana secara manual.",
        }


# ---------------------------------------------------------------------------
# Admin Data Management API Routes
# ---------------------------------------------------------------------------

class AdminClearItemsRequest(BaseModel):
    user_id: str


class AdminClearTransactionsRequest(BaseModel):
    user_id: str
    role: str  # "buyer" or "seller"


def _verify_admin_secret(request: Request):
    """Verify the internal API secret header."""
    api_secret = os.environ.get("INTERNAL_API_SECRET", "")
    if not api_secret:
        raise HTTPException(status_code=500, detail="Server misconfiguration")
    request_secret = request.headers.get("x-api-secret", "")
    if not hmac.compare_digest(api_secret, request_secret):
        raise HTTPException(status_code=401, detail="Tidak diizinkan")


@app.post("/api/admin/clear-items")
async def admin_clear_items(body: AdminClearItemsRequest, request: Request):
    """
    Admin action: deactivate all products for a seller, cancel ongoing orders,
    create refund requests for paid orders, and notify affected buyers.
    Uses the service key so RLS is bypassed.
    """
    _verify_admin_secret(request)
    client = _get_supabase_client()

    # 1. Find user's stores
    stores_resp = client.table("stores").select("id").eq("seller_id", body.user_id).execute()
    stores = stores_resp.data or []
    if not stores:
        raise HTTPException(status_code=404, detail="Pengguna tidak memiliki toko")

    cancelled_count = 0
    refund_count = 0
    product_count = 0

    for store in stores:
        store_id = store["id"]

        # 2. Find ongoing orders
        orders_resp = client.table("orders") \
            .select("id, buyer_id, total_amount") \
            .eq("store_id", store_id) \
            .in_("status", ["pending", "menunggu", "diproses"]) \
            .execute()

        for order in (orders_resp.data or []):
            order_id = order["id"]
            buyer_id = order["buyer_id"]

            # Check if paid
            tx_resp = client.table("transactions") \
                .select("payment_status, amount") \
                .eq("order_id", order_id) \
                .execute()

            tx = tx_resp.data[0] if tx_resp.data else None
            is_paid = tx and tx.get("payment_status") == "paid"

            if is_paid:
                # Create refund request
                client.table("refund_requests").insert({
                    "order_id": order_id,
                    "buyer_id": buyer_id,
                    "reason": "Admin: Pembersihan item toko",
                    "status": "pending_manual",
                    "refund_amount": tx["amount"] or order["total_amount"],
                }).execute()

                # Mark transaction as refunded
                client.table("transactions") \
                    .update({"payment_status": "refunded"}) \
                    .eq("order_id", order_id).execute()
                refund_count += 1

            # Cancel the order
            client.table("orders").update({
                "status": "dibatalkan",
                "updated_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            }).eq("id", order_id).execute()
            cancelled_count += 1

            # Notify buyer
            msg = "Pesanan Anda dibatalkan oleh admin."
            if is_paid:
                msg += " Refund sedang diproses."
            client.table("notifications").insert({
                "user_id": buyer_id,
                "title": "Pesanan Dibatalkan",
                "message": msg,
                "type": "order",
                "order_id": order_id,
            }).execute()

        # 3. Get product IDs for cart cleanup
        products_resp = client.table("products").select("id").eq("store_id", store_id).execute()
        product_ids = [p["id"] for p in (products_resp.data or [])]
        product_count += len(product_ids)

        if product_ids:
            # Delete cart items referencing these products
            client.table("cart_items").delete().in_("product_id", product_ids).execute()

            # Deactivate all products
            client.table("products") \
                .update({"is_active": False, "stock": 0}) \
                .eq("store_id", store_id).execute()

    return {
        "success": True,
        "products_deactivated": product_count,
        "orders_cancelled": cancelled_count,
        "refunds_created": refund_count,
    }


@app.post("/api/admin/clear-transactions")
async def admin_clear_transactions(body: AdminClearTransactionsRequest, request: Request):
    """
    Admin action: cascade-delete all orders + dependent records for a user.
    Both /transaksi and /orders pages are driven by the orders table.
    Uses the service key so RLS is bypassed.
    """
    _verify_admin_secret(request)

    if body.role not in ("buyer", "seller"):
        raise HTTPException(status_code=400, detail="role must be 'buyer' or 'seller'")

    client = _get_supabase_client()

    # 1. Find all order IDs for this user
    order_ids = []
    if body.role == "buyer":
        resp = client.table("orders").select("id").eq("buyer_id", body.user_id).execute()
        order_ids = [o["id"] for o in (resp.data or [])]
    else:
        stores_resp = client.table("stores").select("id").eq("seller_id", body.user_id).execute()
        store_ids = [s["id"] for s in (stores_resp.data or [])]
        if store_ids:
            resp = client.table("orders").select("id").in_("store_id", store_ids).execute()
            order_ids = [o["id"] for o in (resp.data or [])]

    if not order_ids:
        return {"success": True, "orders_deleted": 0, "message": "Tidak ada pesanan ditemukan"}

    # 2. Cascade-delete dependent records in batches
    batch_size = 100
    for i in range(0, len(order_ids), batch_size):
        batch = order_ids[i:i + batch_size]
        # Delete all FK dependents first
        for table in ["order_items", "transactions", "notifications",
                       "refund_requests", "reviews", "seller_balance_transactions"]:
            client.table(table).delete().in_("order_id", batch).execute()
        # Then delete the orders
        client.table("orders").delete().in_("id", batch).execute()

    # 3. Clean up seller balance transactions not tied to orders
    if body.role == "seller":
        client.table("seller_balance_transactions").delete().eq("seller_id", body.user_id).execute()

    return {
        "success": True,
        "orders_deleted": len(order_ids),
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("snacktrackbackend:app", host="0.0.0.0", port=8000, reload=True)
