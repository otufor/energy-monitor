# /// script
# requires-python = ">=3.13"
# dependencies = [
#     "altair>=6.0.0",
#     "marimo>=0.20.2",
#     "pandas>=3.0.1",
#     "pyarrow>=20.0.0",
#     "pyzmq>=27.1.0",
# ]
# ///

import marimo

__generated_with = "0.20.4"
app = marimo.App(width="full")


@app.cell
def _():
    import json
    import os
    import statistics
    import urllib.parse
    import urllib.request
    from datetime import datetime, time, timedelta, timezone
    from pathlib import Path

    import altair as alt
    import marimo as mo
    import pandas as pd

    def load_notebook_env():
        env_path = Path(__file__).with_name(".env")
        loaded = {}

        if not env_path.exists():
            return loaded

        for raw_line in env_path.read_text(encoding="utf-8").splitlines():
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            loaded[key.strip()] = value.strip()

        return loaded

    notebook_env = load_notebook_env()
    default_api_url = os.environ.get(
        "MARIMO_WORKERS_API_URL",
        notebook_env.get("MARIMO_WORKERS_API_URL", "http://localhost:8787"),
    )
    default_api_key = os.environ.get(
        "MARIMO_API_KEY",
        notebook_env.get("MARIMO_API_KEY", ""),
    )

    return (
        alt,
        default_api_key,
        default_api_url,
        datetime,
        json,
        mo,
        os,
        pd,
        Path,
        statistics,
        time,
        timedelta,
        timezone,
        urllib,
    )


@app.cell
def _(mo):
    mo.md("""
    # Detailed Energy Analysis

    ローカル PC から Workers API を叩いて、期間別の詳細分析を行うための marimo notebook です。
    """)
    return


@app.cell
def _(default_api_key, default_api_url, mo):
    api_url = mo.ui.text(
        value=default_api_url,
        label="Workers API URL",
        full_width=True,
    )
    api_key = mo.ui.text(
        value=default_api_key,
        label="API Key (X-Api-Key, 任意)",
        kind="password",
        full_width=True,
    )
    mo.vstack([api_url, api_key])
    return api_key, api_url


@app.cell
def _(datetime, mo):
    today = datetime.now().date().isoformat()
    start_date = mo.ui.date(value=today, label="開始日 (JST)")
    end_date = mo.ui.date(value=today, label="終了日 (JST)")
    rolling_window = mo.ui.slider(
        start=3,
        stop=120,
        step=3,
        value=15,
        label="移動平均ウィンドウ (分)",
    )
    top_n = mo.ui.slider(
        start=3,
        stop=30,
        step=1,
        value=10,
        label="ピーク表示件数",
    )
    mo.hstack([start_date, end_date])
    mo.hstack([rolling_window, top_n], widths="equal")
    return end_date, rolling_window, start_date, top_n


@app.cell
def _(mo):
    custom_threshold = mo.ui.number(
        start=100,
        stop=10000,
        step=100,
        value=3000,
        label="高負荷しきい値 (W)",
        full_width=True,
    )
    custom_threshold
    return (custom_threshold,)


@app.cell
def _(mo):
    weather_latitude = mo.ui.number(
        start=-90,
        stop=90,
        step=0.0001,
        value=36.3601,
        label="天気観測地点の緯度",
        full_width=True,
    )
    weather_longitude = mo.ui.number(
        start=-180,
        stop=180,
        step=0.0001,
        value=136.4485,
        label="天気観測地点の経度",
        full_width=True,
    )
    mo.md(
        """
        ## Weather Context

        Open-Meteo から同期間の天気情報を取得します。必要に応じて観測地点を調整してください。
        """
    )
    mo.hstack([weather_latitude, weather_longitude], widths="equal")
    return weather_latitude, weather_longitude


@app.cell
def _(
    api_key,
    api_url,
    datetime,
    end_date,
    json,
    mo,
    start_date,
    time,
    timedelta,
    timezone,
    urllib,
):
    allowed_hosts = {
        "localhost",
        "127.0.0.1",
        "energy-monitor-workers.mh076144.workers.dev",
        "energy-monitor-notebook.mh076144.workers.dev",
    }

    def is_allowed_url(raw: str) -> bool:
        try:
            parsed = urllib.parse.urlparse(raw)
            return parsed.scheme in ("http", "https") and parsed.hostname in allowed_hosts
        except Exception:
            return False

    def to_iso_range(date_text: str, end_of_day: bool) -> str:
        selected = datetime.fromisoformat(date_text).date()
        selected_time = time(23, 59, 59) if end_of_day else time(0, 0, 0)
        return datetime.combine(
            selected,
            selected_time,
            tzinfo=timezone(timedelta(hours=9)),
        ).isoformat()

    def fetch_json(path: str):
        base = api_url.value.rstrip("/")
        if not is_allowed_url(base):
            return {"error": f"Blocked: '{base}' is not an allowed API host"}

        headers = {
            "Accept": "application/json",
            "User-Agent": "energy-monitor-notebook/1.0",
        }
        if api_key.value:
            headers["X-Api-Key"] = api_key.value

        request = urllib.request.Request(base + path, headers=headers)
        try:
            with urllib.request.urlopen(request, timeout=20) as response:
                return json.loads(response.read())
        except Exception as exc:
            return {"error": str(exc)}

    if start_date.value > end_date.value:
        mo.stop(True, mo.callout("開始日が終了日より後になっています。", kind="warn"))

    from_iso = to_iso_range(start_date.value.isoformat(), end_of_day=False)
    to_iso = to_iso_range(end_date.value.isoformat(), end_of_day=True)
    dataset = fetch_json(
        "/api/power/range?"
        + urllib.parse.urlencode(
            {
                "from": from_iso,
                "to": to_iso,
            }
        )
    )

    if isinstance(dataset, dict) and dataset.get("error"):
        mo.stop(True, mo.callout(f"データ取得に失敗しました: {dataset['error']}", kind="danger"))
    return (dataset,)


@app.cell
def _(dataset, mo, pd):
    if not isinstance(dataset, list):
        mo.stop(True, mo.callout("レスポンス形式が想定外です。", kind="danger"))

    if not dataset:
        mo.stop(True, mo.callout("指定期間のデータがありません。", kind="warn"))

    df = pd.DataFrame(dataset)
    df["ts_utc"] = pd.to_datetime(df["ts"], utc=True)
    df["ts_jst"] = df["ts_utc"].dt.tz_convert("Asia/Tokyo")
    df["date_jst"] = df["ts_jst"].dt.strftime("%Y-%m-%d")
    df["hour_jst"] = df["ts_jst"].dt.hour
    df["weekday_jst"] = df["ts_jst"].dt.day_name()
    df["watts_kw"] = df["watts"] / 1000.0
    df["delta_minutes"] = df["ts_utc"].diff().dt.total_seconds().div(60).fillna(0)
    df["delta_kwh"] = df["cum_kwh"].diff().clip(lower=0).fillna(0)
    return (df,)


@app.cell
def _(pd):
    weather_code_map = {
        0: "快晴",
        1: "晴れ",
        2: "晴れ時々曇り",
        3: "曇り",
        45: "霧",
        48: "霧氷",
        51: "弱い霧雨",
        53: "霧雨",
        55: "強い霧雨",
        61: "弱い雨",
        63: "雨",
        65: "強い雨",
        71: "弱い雪",
        73: "雪",
        75: "強い雪",
        80: "弱いにわか雨",
        81: "にわか雨",
        82: "強いにわか雨",
        95: "雷雨",
        96: "弱い雹を伴う雷雨",
        99: "強い雹を伴う雷雨",
    }

    def describe_weather_code(code: object) -> str:
        if code is None or pd.isna(code):
            return "不明"
        if not isinstance(code, (int, float, str)):
            return "不明"
        try:
            code_int = int(code)
            return weather_code_map.get(code_int, f"code={code_int}")
        except (ValueError, TypeError):
            return "不明"

    return (describe_weather_code,)


@app.cell
def _():
    return


@app.cell
def _(
    end_date,
    json,
    mo,
    start_date,
    urllib,
    weather_latitude,
    weather_longitude,
):
    params = urllib.parse.urlencode(
        {
            "latitude": weather_latitude.value,
            "longitude": weather_longitude.value,
            "start_date": start_date.value.isoformat(),
            "end_date": end_date.value.isoformat(),
            "timezone": "Asia/Tokyo",
            "hourly": ",".join(
                [
                    "temperature_2m",
                    "apparent_temperature",
                    "precipitation",
                    "cloud_cover",
                    "weather_code",
                ]
            ),
            "daily": ",".join(
                [
                    "weather_code",
                    "temperature_2m_max",
                    "temperature_2m_min",
                    "precipitation_sum",
                ]
            ),
        }
    )
    url = f"https://archive-api.open-meteo.com/v1/archive?{params}"
    request = urllib.request.Request(
        url,
        headers={
            "Accept": "application/json",
            "User-Agent": "energy-monitor-notebook/1.0",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            weather_payload = json.loads(response.read())
    except Exception as exc:
        weather_payload = {"error": str(exc)}
        mo.callout(
            mo.md(f"天気データの取得に失敗しました: `{weather_payload['error']}`"),
            kind="warn",
        )
    return (weather_payload,)


@app.cell
def _(describe_weather_code, mo, pd, weather_payload):
    if not isinstance(weather_payload, dict) or weather_payload.get("error"):
        weather_df = pd.DataFrame()
        weather_daily = pd.DataFrame()
        weather_summary = None
        mo.stop(True)

    _hourly_weather_payload = weather_payload.get("hourly", {})
    weather_df = pd.DataFrame(
        {
            "ts_jst": pd.to_datetime(_hourly_weather_payload.get("time", [])),
            "temperature_2m": _hourly_weather_payload.get("temperature_2m", []),
            "apparent_temperature": _hourly_weather_payload.get("apparent_temperature", []),
            "precipitation": _hourly_weather_payload.get("precipitation", []),
            "cloud_cover": _hourly_weather_payload.get("cloud_cover", []),
            "weather_code": _hourly_weather_payload.get("weather_code", []),
        }
    )
    if not weather_df.empty:
        weather_df["weather_label"] = weather_df["weather_code"].map(describe_weather_code)
        weather_df["ts_jst"] = pd.to_datetime(weather_df["ts_jst"]).dt.tz_localize("Asia/Tokyo")

    _weather_daily_payload = weather_payload.get("daily", {})
    weather_daily = pd.DataFrame(
        {
            "date_jst": _weather_daily_payload.get("time", []),
            "weather_code": _weather_daily_payload.get("weather_code", []),
            "temp_max": _weather_daily_payload.get("temperature_2m_max", []),
            "temp_min": _weather_daily_payload.get("temperature_2m_min", []),
            "precipitation_sum": _weather_daily_payload.get("precipitation_sum", []),
        }
    )
    if not weather_daily.empty:
        weather_daily["weather_label"] = weather_daily["weather_code"].map(describe_weather_code)

    weather_summary = None
    if weather_df.empty:
        mo.stop(True)

    peak_weather = weather_df.loc[weather_df["temperature_2m"].idxmax()]
    weather_summary = {
        "records": int(len(weather_df)),
        "avg_temp": round(float(weather_df["temperature_2m"].mean()), 1),
        "min_temp": round(float(weather_df["temperature_2m"].min()), 1),
        "max_temp": round(float(weather_df["temperature_2m"].max()), 1),
        "total_precipitation": round(float(weather_df["precipitation"].sum()), 1),
        "peak_temp_at": peak_weather["ts_jst"].strftime("%Y-%m-%d %H:%M:%S %Z"),
    }
    return weather_daily, weather_df, weather_summary


@app.cell
def _(mo, weather_summary):
    if not weather_summary:
        mo.stop(True)

    mo.md(
        f"""
        ## Weather Overview

        | 指標 | 値 |
        | --- | --- |
        | 取得件数 | **{weather_summary['records']}** |
        | 平均気温 | **{weather_summary['avg_temp']} °C** |
        | 最低気温 | **{weather_summary['min_temp']} °C** |
        | 最高気温 | **{weather_summary['max_temp']} °C** |
        | 降水量合計 | **{weather_summary['total_precipitation']} mm** |
        | 最高気温の時刻 | `{weather_summary['peak_temp_at']}` |
        """
    )
    return


@app.cell
def _(custom_threshold, df, mo, rolling_window, statistics):
    watts = df["watts"].tolist()
    threshold_value = custom_threshold.value
    threshold = float(threshold_value if threshold_value is not None else 3000)
    p95 = float(df["watts"].quantile(0.95))
    p99 = float(df["watts"].quantile(0.99))
    peak_row = df.loc[df["watts"].idxmax()]

    summary = {
        "records": len(df),
        "period_start": df["ts_jst"].min().strftime("%Y-%m-%d %H:%M:%S %Z"),
        "period_end": df["ts_jst"].max().strftime("%Y-%m-%d %H:%M:%S %Z"),
        "avg_watts": round(float(df["watts"].mean()), 1),
        "median_watts": round(float(statistics.median(watts)), 1),
        "p95_watts": round(p95, 1),
        "p99_watts": round(p99, 1),
        "peak_watts": round(float(peak_row["watts"]), 1),
        "peak_at": peak_row["ts_jst"].strftime("%Y-%m-%d %H:%M:%S %Z"),
        "total_kwh_delta": round(float(df["delta_kwh"].sum()), 3),
        "high_load_minutes": int((df["watts"] >= threshold).sum()),
        "rolling_window_minutes": int(rolling_window.value),
    }

    mo.md(
        f"""
        ## Overview

        | 指標 | 値 |
        | --- | --- |
        | レコード数 | **{summary["records"]}** |
        | 期間開始 | `{summary["period_start"]}` |
        | 期間終了 | `{summary["period_end"]}` |
        | 平均電力 | **{summary["avg_watts"]} W** |
        | 中央値 | **{summary["median_watts"]} W** |
        | P95 | **{summary["p95_watts"]} W** |
        | P99 | **{summary["p99_watts"]} W** |
        | 最大電力 | **{summary["peak_watts"]} W** |
        | 最大発生時刻 | `{summary["peak_at"]}` |
        | 期間内増分電力量 | **{summary["total_kwh_delta"]} kWh** |
        | しきい値超過分数 | **{summary["high_load_minutes"]} 分** |
        """
    )
    return p95, summary, threshold


@app.cell
def _(alt, df, mo, rolling_window, threshold):
    plot_df = df.copy()
    plot_df["rolling_watts"] = (
        plot_df["watts"].rolling(window=max(int(rolling_window.value), 1), min_periods=1).mean()
    )

    timeseries_base = alt.Chart(plot_df).encode(
        x=alt.X("ts_jst:T", title="Timestamp (JST)"),
        tooltip=[
            alt.Tooltip("ts_jst:T", title="時刻"),
            alt.Tooltip("watts:Q", title="瞬時電力(W)", format=".1f"),
            alt.Tooltip("rolling_watts:Q", title="移動平均(W)", format=".1f"),
            alt.Tooltip("cum_kwh:Q", title="積算(kWh)", format=".3f"),
        ],
    )

    raw_line = timeseries_base.mark_line(color="#2d6a4f", opacity=0.35).encode(
        y=alt.Y("watts:Q", title="瞬時電力 (W)")
    )
    rolling_line = timeseries_base.mark_line(color="#d97706", strokeWidth=2).encode(
        y="rolling_watts:Q"
    )
    threshold_rule = alt.Chart([{"threshold": threshold}]).mark_rule(
        color="#dc2626",
        strokeDash=[6, 4],
    ).encode(y="threshold:Q")

    timeseries_chart = (raw_line + rolling_line + threshold_rule).properties(
        height=360,
        title="時系列推移と移動平均",
    )
    mo.ui.altair_chart(timeseries_chart)
    return


@app.cell
def _(alt, df, mo):
    hourly = (
        df.groupby("hour_jst", as_index=False)
        .agg(
            avg_watts=("watts", "mean"),
            max_watts=("watts", "max"),
            avg_delta_kwh=("delta_kwh", "mean"),
        )
        .sort_values("hour_jst")
    )

    hourly_chart = (
        alt.Chart(hourly)
        .transform_fold(["avg_watts", "max_watts"], as_=["metric", "value"])
        .mark_line(point=True)
        .encode(
            x=alt.X("hour_jst:O", title="Hour (JST)"),
            y=alt.Y("value:Q", title="Watts"),
            color=alt.Color("metric:N", title="集計"),
            tooltip=[
                alt.Tooltip("hour_jst:O", title="時"),
                alt.Tooltip("metric:N", title="指標"),
                alt.Tooltip("value:Q", title="値", format=".1f"),
            ],
        )
        .properties(height=280, title="時間帯別の平均 / 最大電力")
    )

    mo.ui.altair_chart(hourly_chart)
    return


@app.cell
def _(alt, df, mo, pd):
    weekday_order = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
    heatmap = (
        df.groupby(["weekday_jst", "hour_jst"], as_index=False)["watts"]
        .mean()
        .rename(columns={"watts": "avg_watts"})
    )
    heatmap["weekday_jst"] = pd.Categorical(
        heatmap["weekday_jst"],
        categories=weekday_order,
        ordered=True,
    )

    heatmap_chart = (
        alt.Chart(heatmap)
        .mark_rect()
        .encode(
            x=alt.X("hour_jst:O", title="Hour (JST)"),
            y=alt.Y("weekday_jst:O", title="Weekday", sort=weekday_order),
            color=alt.Color("avg_watts:Q", title="Avg W", scale=alt.Scale(scheme="goldred")),
            tooltip=[
                alt.Tooltip("weekday_jst:N", title="曜日"),
                alt.Tooltip("hour_jst:O", title="時"),
                alt.Tooltip("avg_watts:Q", title="平均電力(W)", format=".1f"),
            ],
        )
        .properties(height=280, title="曜日 x 時間帯ヒートマップ")
    )

    mo.ui.altair_chart(heatmap_chart)
    return


@app.cell
def _(df, mo, p95, threshold, top_n):
    peaks = (
        df.loc[df["watts"] >= max(p95, threshold), ["ts_jst", "watts", "ampere", "cum_kwh"]]
        .sort_values("watts", ascending=False)
        .head(int(top_n.value))
        .copy()
    )
    peaks["ts_jst"] = peaks["ts_jst"].dt.strftime("%Y-%m-%d %H:%M:%S")
    peaks = peaks.rename(columns={"ts_jst": "timestamp_jst"})

    mo.md("## High Load Events")
    mo.ui.table(peaks, selection=None)
    return (peaks,)


@app.cell
def _(alt, df, mo):
    histogram = (
        alt.Chart(df)
        .mark_bar(color="#3b82f6")
        .encode(
            x=alt.X("watts:Q", bin=alt.Bin(maxbins=40), title="Watts"),
            y=alt.Y("count():Q", title="Count"),
            tooltip=[alt.Tooltip("count():Q", title="件数")],
        )
        .properties(height=260, title="消費電力分布ヒストグラム")
    )
    mo.ui.altair_chart(histogram)
    return


@app.cell
def _(alt, df, mo, weather_df):
    if weather_df.empty:
        mo.stop(True)

    _power_hourly = (
        df.set_index("ts_jst")
        .resample("1h")
        .agg(avg_watts=("watts", "mean"), peak_watts=("watts", "max"))
        .reset_index()
    )
    _merged = _power_hourly.merge(weather_df, on="ts_jst", how="inner")
    if _merged.empty:
        mo.stop(True, mo.callout("電力データと天気データを同じ時刻で結合できませんでした。", kind="warn"))

    power_line = (
        alt.Chart(_merged)
        .mark_line(color="#2563eb", strokeWidth=2)
        .encode(
            x=alt.X("ts_jst:T", title="Timestamp (JST)"),
            y=alt.Y("avg_watts:Q", title="平均電力 (W)"),
            tooltip=[
                alt.Tooltip("ts_jst:T", title="時刻"),
                alt.Tooltip("avg_watts:Q", title="平均電力(W)", format=".1f"),
                alt.Tooltip("temperature_2m:Q", title="気温(°C)", format=".1f"),
                alt.Tooltip("precipitation:Q", title="降水量(mm)", format=".1f"),
                alt.Tooltip("weather_label:N", title="天気"),
            ],
        )
    )
    temp_line = (
        alt.Chart(_merged)
        .mark_line(color="#dc2626", strokeWidth=2)
        .encode(
            x=alt.X("ts_jst:T", title="Timestamp (JST)"),
            y=alt.Y("temperature_2m:Q", title="気温 (°C)"),
        )
    )

    combined_chart = (
        alt.layer(power_line, temp_line)
        .resolve_scale(y="independent")
        .properties(height=320, title="1時間平均電力と気温の比較")
    )
    mo.ui.altair_chart(combined_chart)
    return


@app.cell
def _(alt, df, mo, weather_df):
    if weather_df.empty:
        mo.stop(True)

    _power_hourly = (
        df.set_index("ts_jst")
        .resample("1h")
        .agg(avg_watts=("watts", "mean"))
        .reset_index()
    )
    _merged = _power_hourly.merge(weather_df, on="ts_jst", how="inner")
    if _merged.empty:
        mo.stop(True)

    scatter = (
        alt.Chart(_merged)
        .mark_circle(size=80, opacity=0.7, color="#0f766e")
        .encode(
            x=alt.X("temperature_2m:Q", title="気温 (°C)"),
            y=alt.Y("avg_watts:Q", title="1時間平均電力 (W)"),
            tooltip=[
                alt.Tooltip("ts_jst:T", title="時刻"),
                alt.Tooltip("temperature_2m:Q", title="気温(°C)", format=".1f"),
                alt.Tooltip("avg_watts:Q", title="平均電力(W)", format=".1f"),
                alt.Tooltip("weather_label:N", title="天気"),
            ],
        )
        .properties(height=280, title="気温と1時間平均電力の散布図")
    )
    mo.ui.altair_chart(scatter)
    return


@app.cell
def _(df, mo):
    daily = (
        df.groupby("date_jst", as_index=False)
        .agg(
            records=("ts", "count"),
            avg_watts=("watts", "mean"),
            peak_watts=("watts", "max"),
            total_kwh_delta=("delta_kwh", "sum"),
        )
        .sort_values("date_jst")
    )
    daily["coverage_pct"] = (daily["records"] / 1440 * 100).round(1)
    daily = daily[
        ["date_jst", "records", "coverage_pct", "avg_watts", "peak_watts", "total_kwh_delta"]
    ].copy()
    daily = daily.rename(columns={"date_jst": "date"})

    mo.md("## Daily Aggregation")
    mo.ui.table(daily, selection=None)
    return (daily,)


@app.cell
def _(daily, mo, peaks, summary, weather_daily):
    notes = [
        f"期間内の総増分電力量は {summary['total_kwh_delta']} kWh です。",
        f"平均電力は {summary['avg_watts']} W、P95 は {summary['p95_watts']} W でした。",
        f"最大ピークは {summary['peak_watts']} W で、{summary['peak_at']} に観測されています。",
        f"高負荷イベントとして抽出された件数は {len(peaks)} 件です。",
        f"日別集計行数は {len(daily)} 日分です。",
    ]
    if not weather_daily.empty:
        rainy_days = int((weather_daily["precipitation_sum"] > 0).sum())
        notes.append(f"同期間の降水日数は {rainy_days} 日でした。")
        coldest = weather_daily.loc[weather_daily["temp_min"].idxmin()]
        notes.append(
            f"最も冷え込んだ日は {coldest['date_jst']} で、最低気温は {coldest['temp_min']:.1f} °C でした。"
        )

    mo.md("## Quick Findings\n\n" + "\n".join([f"- {note}" for note in notes]))
    return


@app.cell
def _():
    return


if __name__ == "__main__":
    app.run()
