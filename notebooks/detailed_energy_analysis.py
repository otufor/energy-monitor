# /// script
# requires-python = ">=3.13"
# dependencies = [
#     "altair>=6.0.0",
#     "marimo>=0.22.0",
#     "pandas>=3.0.1",
#     "pyarrow>=20.0.0",
#     "pyzmq>=27.1.0",
# ]
# ///

import marimo

__generated_with = "0.22.0"
app = marimo.App(width="full")


@app.cell
def _():
    import json
    import os
    import sys
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
    hosted_default_api_url = "https://energy-monitor-workers.mh076144.workers.dev"
    local_default_api_url = "http://localhost:8787"
    is_wasm_runtime = sys.platform == "emscripten"
    fallback_api_url = hosted_default_api_url if is_wasm_runtime else local_default_api_url
    default_api_url = os.environ.get(
        "MARIMO_WORKERS_API_URL",
        notebook_env.get("MARIMO_WORKERS_API_URL", fallback_api_url),
    )
    default_api_key = os.environ.get(
        "MARIMO_API_KEY",
        notebook_env.get("MARIMO_API_KEY", ""),
    )
    weekday_labels_ja = ["月", "火", "水", "木", "金", "土", "日"]
    return (
        alt,
        datetime,
        default_api_key,
        default_api_url,
        json,
        mo,
        pd,
        sys,
        time,
        timedelta,
        timezone,
        urllib,
        weekday_labels_ja,
    )


@app.cell
def _(mo):
    title = mo.md(
        """
        # Detailed Energy Analysis

        ローカル PC から Workers API を叩いて、期間別の詳細分析を行うための marimo notebook です。
        """
    )
    title
    return


@app.cell
def _(default_api_key, default_api_url, mo):
    api_url_input = mo.ui.text(
        value=default_api_url,
        label="Workers API URL",
        full_width=True,
    )
    api_key_input = mo.ui.text(
        value=default_api_key,
        label="API Key (X-Api-Key, 任意)",
        kind="password",
        full_width=True,
    )
    controls = mo.vstack([api_url_input, api_key_input])
    controls
    return api_key_input, api_url_input


@app.cell
def _(datetime, mo):
    today = datetime.now().date().isoformat()
    start_date_input = mo.ui.date(value=today, label="開始日 (JST)")
    end_date_input = mo.ui.date(value=today, label="終了日 (JST)")
    rolling_window_input = mo.ui.slider(
        start=3,
        stop=120,
        step=3,
        value=15,
        label="移動平均ウィンドウ (分)",
    )
    top_n_input = mo.ui.slider(
        start=3,
        stop=30,
        step=1,
        value=10,
        label="表示イベント件数",
    )
    threshold_input = mo.ui.number(
        start=100,
        stop=10000,
        step=100,
        value=3000,
        label="高負荷しきい値 (W)",
        full_width=True,
    )
    filter_controls = mo.vstack(
        [
            mo.hstack([start_date_input, end_date_input]),
            mo.hstack([rolling_window_input, top_n_input], widths="equal"),
            threshold_input,
        ]
    )
    filter_controls
    return (
        end_date_input,
        rolling_window_input,
        start_date_input,
        threshold_input,
        top_n_input,
    )


@app.cell
def _(mo):
    weather_latitude_input = mo.ui.number(
        start=-90,
        stop=90,
        step=0.0001,
        value=36.3601,
        label="天気観測地点の緯度",
        full_width=True,
    )
    weather_longitude_input = mo.ui.number(
        start=-180,
        stop=180,
        step=0.0001,
        value=136.4485,
        label="天気観測地点の経度",
        full_width=True,
    )
    weather_controls = mo.vstack(
        [
            mo.md(
                """
                ## Weather Context

                Open-Meteo から同期間の天気情報を取得します。必要に応じて観測地点を調整してください。
                """
            ),
            mo.hstack([weather_latitude_input, weather_longitude_input], widths="equal"),
        ]
    )
    weather_controls
    return weather_latitude_input, weather_longitude_input


@app.cell
def _(
    api_key_input,
    api_url_input,
    datetime,
    end_date_input,
    json,
    mo,
    start_date_input,
    sys,
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

    def fetch_json(path: str, timeout: int = 20):
        base = api_url_input.value.rstrip("/")
        if not is_allowed_url(base):
            return {"error": f"Blocked: '{base}' is not an allowed API host"}
        parsed_base = urllib.parse.urlparse(base)
        if sys.platform == "emscripten" and parsed_base.hostname in {"localhost", "127.0.0.1"}:
            return {
                "error": (
                    "WASM export では localhost に接続できません。"
                    " Workers URL を指定してください。"
                )
            }

        headers = {
            "Accept": "application/json",
            "User-Agent": "energy-monitor-notebook/1.0",
        }
        if api_key_input.value:
            headers["X-Api-Key"] = api_key_input.value

        request = urllib.request.Request(base + path, headers=headers)
        try:
            with urllib.request.urlopen(request, timeout=timeout) as response:
                return json.loads(response.read())
        except Exception as exc:
            return {"error": str(exc)}

    if start_date_input.value > end_date_input.value:
        mo.stop(True, mo.callout("開始日が終了日より後になっています。", kind="warn"))

    from_iso = to_iso_range(start_date_input.value.isoformat(), end_of_day=False)
    to_iso = to_iso_range(end_date_input.value.isoformat(), end_of_day=True)
    request_path = "/api/power/range?" + urllib.parse.urlencode(
        {
            "from": from_iso,
            "to": to_iso,
        }
    )
    power_dataset = fetch_json(
        request_path
    )

    if isinstance(power_dataset, dict) and power_dataset.get("error"):
        debug_md = mo.md(
            f"""
            データ取得に失敗しました: `{power_dataset['error']}`

            - API URL: `{api_url_input.value.rstrip("/")}`
            - Request Path: `{request_path}`
            - From (JST): `{start_date_input.value.isoformat()} 00:00:00+09:00`
            - To (JST): `{end_date_input.value.isoformat()} 23:59:59+09:00`
            - Runtime: `{sys.platform}`
            """
        )
        mo.stop(
            True,
            mo.callout(debug_md, kind="danger"),
        )
    return (power_dataset,)


@app.cell
def _(
    mo,
    pd,
    power_dataset,
    rolling_window_input,
    threshold_input,
    weekday_labels_ja,
):
    if not isinstance(power_dataset, list):
        mo.stop(True, mo.callout("レスポンス形式が想定外です。", kind="danger"))

    if not power_dataset:
        mo.stop(True, mo.callout("指定期間のデータがありません。", kind="warn"))

    power_df = pd.DataFrame(power_dataset).sort_values("ts").reset_index(drop=True)
    power_df["ts_utc"] = pd.to_datetime(power_df["ts"], utc=True)
    power_df["ts_jst"] = power_df["ts_utc"].dt.tz_convert("Asia/Tokyo")
    power_df["date_jst"] = power_df["ts_jst"].dt.strftime("%Y-%m-%d")
    power_df["hour_jst"] = power_df["ts_jst"].dt.hour
    power_df["weekday_index"] = power_df["ts_jst"].dt.weekday
    power_df["weekday_label_ja"] = power_df["weekday_index"].map(dict(enumerate(weekday_labels_ja)))
    power_df["watts_kw"] = power_df["watts"] / 1000.0

    raw_delta = power_df["ts_utc"].diff().dt.total_seconds().div(60)
    positive_delta = raw_delta[(raw_delta > 0) & raw_delta.notna()]
    base_interval_minutes = float(positive_delta.median()) if not positive_delta.empty else 1.0
    gap_threshold_minutes = max(base_interval_minutes * 3, 5.0)

    power_df["delta_minutes"] = raw_delta.fillna(base_interval_minutes)
    power_df["is_gap"] = power_df["delta_minutes"] > gap_threshold_minutes
    power_df["delta_minutes_valid"] = (
        power_df["delta_minutes"].where(~power_df["is_gap"], 0.0).clip(lower=0)
    )

    next_delta = (
        power_df["ts_utc"]
        .shift(-1)
        .sub(power_df["ts_utc"])
        .dt.total_seconds()
        .div(60)
        .fillna(base_interval_minutes)
    )
    power_df["span_minutes"] = next_delta
    power_df["span_is_gap"] = power_df["span_minutes"] > gap_threshold_minutes
    power_df["span_minutes_valid"] = (
        power_df["span_minutes"].where(~power_df["span_is_gap"], 0.0).clip(lower=0)
    )
    power_df["delta_kwh"] = power_df["cum_kwh"].diff().clip(lower=0).fillna(0)

    threshold_value = threshold_input.value
    load_threshold_watts = float(threshold_value if threshold_value is not None else 3000)
    power_df["is_high_load"] = power_df["watts"] >= load_threshold_watts
    power_df["high_load_span_minutes"] = power_df["span_minutes_valid"].where(
        power_df["is_high_load"], 0.0
    )

    event_start = power_df["is_high_load"] & (
        ~power_df["is_high_load"].shift(fill_value=False) | power_df["is_gap"]
    )
    power_df["event_seq"] = event_start.cumsum()
    power_df["event_id"] = power_df["event_seq"].where(power_df["is_high_load"])

    plot_power_df = power_df.copy()
    plot_power_df["rolling_watts"] = (
        plot_power_df.set_index("ts_jst")["watts"]
        .rolling(f"{max(int(rolling_window_input.value), 1)}min")
        .mean()
    ).reset_index(drop=True)
    return load_threshold_watts, plot_power_df, power_df


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
def _(
    end_date_input,
    json,
    start_date_input,
    urllib,
    weather_latitude_input,
    weather_longitude_input,
):
    params = urllib.parse.urlencode(
        {
            "latitude": weather_latitude_input.value,
            "longitude": weather_longitude_input.value,
            "start_date": start_date_input.value.isoformat(),
            "end_date": end_date_input.value.isoformat(),
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
        weather_fetch_error = None
    except Exception as exc:
        weather_payload = {}
        weather_fetch_error = str(exc)
    return weather_fetch_error, weather_payload


@app.cell
def _(describe_weather_code, pd, weather_fetch_error, weather_payload):
    weather_hourly_df = pd.DataFrame()
    weather_daily_df = pd.DataFrame()
    weather_overview = None
    daily_weather_context_df = pd.DataFrame(columns=["date_jst", "avg_temp", "precipitation_sum"])

    if not weather_fetch_error and isinstance(weather_payload, dict):
        hourly_payload = weather_payload.get("hourly", {})
        weather_hourly_df = pd.DataFrame(
            {
                "ts_jst": pd.to_datetime(hourly_payload.get("time", [])),
                "temperature_2m": hourly_payload.get("temperature_2m", []),
                "apparent_temperature": hourly_payload.get("apparent_temperature", []),
                "precipitation": hourly_payload.get("precipitation", []),
                "cloud_cover": hourly_payload.get("cloud_cover", []),
                "weather_code": hourly_payload.get("weather_code", []),
            }
        )
        if not weather_hourly_df.empty:
            weather_hourly_df["weather_label"] = weather_hourly_df["weather_code"].map(
                describe_weather_code
            )
            weather_hourly_df["ts_jst"] = pd.to_datetime(weather_hourly_df["ts_jst"]).dt.tz_localize(
                "Asia/Tokyo"
            )
            weather_hourly_df["date_jst"] = weather_hourly_df["ts_jst"].dt.strftime("%Y-%m-%d")
            daily_weather_context_df = (
                weather_hourly_df.groupby("date_jst", as_index=False)
                .agg(
                    avg_temp=("temperature_2m", "mean"),
                    precipitation_sum=("precipitation", "sum"),
                )
                .sort_values("date_jst")
            )

        daily_payload = weather_payload.get("daily", {})
        weather_daily_df = pd.DataFrame(
            {
                "date_jst": daily_payload.get("time", []),
                "weather_code": daily_payload.get("weather_code", []),
                "temp_max": daily_payload.get("temperature_2m_max", []),
                "temp_min": daily_payload.get("temperature_2m_min", []),
                "precipitation_sum": daily_payload.get("precipitation_sum", []),
            }
        )
        if not weather_daily_df.empty:
            weather_daily_df["weather_label"] = weather_daily_df["weather_code"].map(
                describe_weather_code
            )

        if not weather_hourly_df.empty:
            peak_weather_row = weather_hourly_df.loc[weather_hourly_df["temperature_2m"].idxmax()]
            weather_overview = {
                "records": int(len(weather_hourly_df)),
                "avg_temp": round(float(weather_hourly_df["temperature_2m"].mean()), 1),
                "min_temp": round(float(weather_hourly_df["temperature_2m"].min()), 1),
                "max_temp": round(float(weather_hourly_df["temperature_2m"].max()), 1),
                "total_precipitation": round(float(weather_hourly_df["precipitation"].sum()), 1),
                "peak_temp_at": peak_weather_row["ts_jst"].strftime("%Y-%m-%d %H:%M:%S %Z"),
            }
    return (
        daily_weather_context_df,
        weather_daily_df,
        weather_hourly_df,
        weather_overview,
    )


@app.cell
def _(mo, weather_fetch_error, weather_overview):
    weather_section = None

    if weather_fetch_error:
        weather_section = mo.callout(
            mo.md(f"天気データの取得に失敗しました: `{weather_fetch_error}`"),
            kind="warn",
        )
    elif not weather_overview:
        weather_section = mo.callout(
            "天気データは取得できましたが、可視化に使える時系列データがありません。",
            kind="warn",
        )
    else:
        weather_section = mo.md(
            f"""
            ## Weather Overview

            | 指標 | 値 |
            | --- | --- |
            | 取得件数 | **{weather_overview['records']}** |
            | 平均気温 | **{weather_overview['avg_temp']} °C** |
            | 最低気温 | **{weather_overview['min_temp']} °C** |
            | 最高気温 | **{weather_overview['max_temp']} °C** |
            | 降水量合計 | **{weather_overview['total_precipitation']} mm** |
            | 最高気温の時刻 | `{weather_overview['peak_temp_at']}` |
            """
        )

    weather_section
    return


@app.cell
def _(mo, pd, plot_power_df, power_df, rolling_window_input):
    watts = power_df["watts"].tolist()
    p95_watts = float(power_df["watts"].quantile(0.95))
    p99_watts = float(power_df["watts"].quantile(0.99))
    peak_power_row = power_df.loc[power_df["watts"].idxmax()]

    power_summary = {
        "records": int(len(power_df)),
        "period_start": power_df["ts_jst"].min().strftime("%Y-%m-%d %H:%M:%S %Z"),
        "period_end": power_df["ts_jst"].max().strftime("%Y-%m-%d %H:%M:%S %Z"),
        "avg_watts": round(float(power_df["watts"].mean()), 1),
        "median_watts": round(float(pd.Series(watts).median()), 1),
        "p95_watts": round(p95_watts, 1),
        "p99_watts": round(p99_watts, 1),
        "peak_watts": round(float(peak_power_row["watts"]), 1),
        "peak_at": peak_power_row["ts_jst"].strftime("%Y-%m-%d %H:%M:%S %Z"),
        "total_kwh_delta": round(float(power_df["delta_kwh"].sum()), 3),
        "high_load_minutes": round(
            float(plot_power_df.loc[plot_power_df["is_high_load"], "span_minutes_valid"].sum()),
            1,
        ),
        "gap_count": int(power_df["is_gap"].sum() + power_df["span_is_gap"].sum()),
        "rolling_window_minutes": int(rolling_window_input.value),
    }

    overview_md = mo.md(
        f"""
        ## Overview

        | 指標 | 値 |
        | --- | --- |
        | レコード数 | **{power_summary['records']}** |
        | 期間開始 | `{power_summary['period_start']}` |
        | 期間終了 | `{power_summary['period_end']}` |
        | 平均電力 | **{power_summary['avg_watts']} W** |
        | 中央値 | **{power_summary['median_watts']} W** |
        | P95 | **{power_summary['p95_watts']} W** |
        | P99 | **{power_summary['p99_watts']} W** |
        | 最大電力 | **{power_summary['peak_watts']} W** |
        | 最大発生時刻 | `{power_summary['peak_at']}` |
        | 期間内増分電力量 | **{power_summary['total_kwh_delta']} kWh** |
        | しきい値超過継続時間 | **{power_summary['high_load_minutes']} 分** |
        | 欠損疑い区間数 | **{power_summary['gap_count']}** |
        """
    )
    overview_md
    return (power_summary,)


@app.cell
def _(alt, load_threshold_watts, mo, pd, plot_power_df):
    timeseries_base = alt.Chart(plot_power_df).encode(
        x=alt.X("ts_jst:T", title="Timestamp (JST)"),
        tooltip=[
            alt.Tooltip("ts_jst:T", title="時刻"),
            alt.Tooltip("watts:Q", title="瞬時電力(W)", format=".1f"),
            alt.Tooltip("rolling_watts:Q", title="移動平均(W)", format=".1f"),
            alt.Tooltip("cum_kwh:Q", title="積算(kWh)", format=".3f"),
            alt.Tooltip("is_gap:N", title="直前欠損"),
        ],
    )

    _raw_line = timeseries_base.mark_line(color="#2d6a4f", opacity=0.35).encode(
        y=alt.Y("watts:Q", title="瞬時電力 (W)")
    )
    _rolling_line = timeseries_base.mark_line(color="#d97706", strokeWidth=2).encode(
        y="rolling_watts:Q"
    )
    _threshold_rule = (
        alt.Chart(pd.DataFrame([{"threshold": load_threshold_watts}]))
        .mark_rule(color="#dc2626", strokeDash=[6, 4])
        .encode(y="threshold:Q")
    )
    gap_points = (
        alt.Chart(plot_power_df.loc[plot_power_df["is_gap"]])
        .mark_point(color="#7c3aed", shape="diamond", size=80)
        .encode(x="ts_jst:T", y="watts:Q")
    )

    power_timeseries_chart = (_raw_line + _rolling_line + _threshold_rule + gap_points).properties(
        height=360,
        title="時系列推移と移動平均",
    )
    _chart = mo.ui.altair_chart(power_timeseries_chart)
    _chart
    return


@app.cell
def _(alt, mo, power_df):
    hourly_profile_df = (
        power_df.groupby("hour_jst", as_index=False)
        .agg(
            avg_watts=("watts", "mean"),
            max_watts=("watts", "max"),
        )
        .sort_values("hour_jst")
    )

    hourly_profile_chart = (
        alt.Chart(hourly_profile_df)
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

    _chart = mo.ui.altair_chart(hourly_profile_chart)
    _chart
    return


@app.cell
def _(alt, mo, pd, power_df, weekday_labels_ja):
    weekday_heatmap_df = (
        power_df.groupby(["weekday_index", "weekday_label_ja", "hour_jst"], as_index=False)["watts"]
        .mean()
        .rename(columns={"watts": "avg_watts"})
    )
    weekday_heatmap_df["weekday_label_ja"] = pd.Categorical(
        weekday_heatmap_df["weekday_label_ja"],
        categories=weekday_labels_ja,
        ordered=True,
    )

    weekday_heatmap_chart = (
        alt.Chart(weekday_heatmap_df)
        .mark_rect()
        .encode(
            x=alt.X("hour_jst:O", title="Hour (JST)"),
            y=alt.Y("weekday_label_ja:O", title="曜日", sort=weekday_labels_ja),
            color=alt.Color("avg_watts:Q", title="Avg W", scale=alt.Scale(scheme="goldred")),
            tooltip=[
                alt.Tooltip("weekday_label_ja:N", title="曜日"),
                alt.Tooltip("hour_jst:O", title="時"),
                alt.Tooltip("avg_watts:Q", title="平均電力(W)", format=".1f"),
            ],
        )
        .properties(height=280, title="曜日 x 時間帯ヒートマップ")
    )

    _chart = mo.ui.altair_chart(weekday_heatmap_chart)
    _chart
    return


@app.cell
def _(alt, mo, power_df):
    histogram_chart = (
        alt.Chart(power_df)
        .mark_bar(color="#3b82f6")
        .encode(
            x=alt.X("watts:Q", bin=alt.Bin(maxbins=40), title="Watts"),
            y=alt.Y("count():Q", title="Count"),
            tooltip=[alt.Tooltip("count():Q", title="件数")],
        )
        .properties(height=260, title="消費電力分布ヒストグラム")
    )
    _chart = mo.ui.altair_chart(histogram_chart)
    _chart
    return


@app.cell
def _(mo, pd, power_df, top_n_input):
    high_load_df = power_df.loc[power_df["is_high_load"]].copy()
    event_view = None

    if high_load_df.empty:
        warning = mo.callout("しきい値を超える高負荷イベントはありません。", kind="warn")
        event_summary_df = pd.DataFrame(
            columns=[
                "event_id",
                "event_label",
                "start_jst",
                "end_jst",
                "duration_minutes",
                "peak_watts",
                "peak_time_jst",
                "pre_peak_avg_watts",
                "peak_delta_watts",
                "event_kwh_delta",
            ]
        )
        event_view = mo.vstack([warning, mo.ui.table(event_summary_df, selection=None)])
    else:
        event_rows = []
        for raw_event_id, event_group_df in high_load_df.groupby("event_id"):
            ordered_event_df = event_group_df.sort_values("ts_jst")
            peak_event_row = ordered_event_df.loc[ordered_event_df["watts"].idxmax()]
            _event_peak_time = peak_event_row["ts_jst"]
            pre_window = power_df.loc[
                (power_df["ts_jst"] >= _event_peak_time - pd.Timedelta(minutes=30))
                & (power_df["ts_jst"] < _event_peak_time),
                "watts",
            ]
            pre_peak_avg = float(pre_window.mean()) if not pre_window.empty else float("nan")
            peak_delta = (
                float(peak_event_row["watts"] - pre_peak_avg)
                if pd.notna(pre_peak_avg)
                else float("nan")
            )

            event_rows.append(
                {
                    "event_id": int(raw_event_id),
                    "event_label": f"Event {int(raw_event_id):02d}",
                    "start_jst": ordered_event_df["ts_jst"].min(),
                    "end_jst": ordered_event_df["ts_jst"].max(),
                    "duration_minutes": round(
                        float(ordered_event_df["span_minutes_valid"].sum()),
                        1,
                    ),
                    "peak_watts": round(float(ordered_event_df["watts"].max()), 1),
                    "peak_time_jst": _event_peak_time,
                    "pre_peak_avg_watts": round(pre_peak_avg, 1) if pd.notna(pre_peak_avg) else None,
                    "peak_delta_watts": round(peak_delta, 1) if pd.notna(peak_delta) else None,
                    "event_kwh_delta": round(float(ordered_event_df["delta_kwh"].sum()), 3),
                }
            )

        event_summary_df = (
            pd.DataFrame(event_rows)
            .sort_values(["peak_watts", "start_jst"], ascending=[False, True])
            .head(int(top_n_input.value))
            .reset_index(drop=True)
        )

        event_table_df = event_summary_df.copy()
        for column_name in ["start_jst", "end_jst", "peak_time_jst"]:
            event_table_df[column_name] = event_table_df[column_name].dt.strftime("%Y-%m-%d %H:%M:%S")

        event_view = mo.vstack(
            [
                mo.md("## 高負荷イベント一覧"),
                mo.ui.table(
                    event_table_df[
                        [
                            "event_label",
                            "start_jst",
                            "end_jst",
                            "duration_minutes",
                            "peak_watts",
                            "pre_peak_avg_watts",
                            "peak_delta_watts",
                            "event_kwh_delta",
                        ]
                    ],
                    selection=None,
                ),
            ]
        )

    event_view
    return (event_summary_df,)


@app.cell
def _(event_summary_df, mo):
    if event_summary_df.empty:
        mo.stop(True, mo.callout("イベント前後比較に使える高負荷イベントがありません。", kind="warn"))

    event_options = {
        row["event_label"]: row["event_id"] for _, row in event_summary_df.iterrows()
    }
    event_selector = mo.ui.dropdown(
        options=event_options,
        value=event_summary_df.iloc[0]["event_id"],
        label="前後比較するイベント",
        full_width=True,
    )
    event_selector
    return (event_selector,)


@app.cell
def _(
    alt,
    event_selector,
    event_summary_df,
    load_threshold_watts,
    mo,
    pd,
    plot_power_df,
):
    selected_event_df = event_summary_df.loc[event_summary_df["event_id"] == event_selector.value]
    if selected_event_df.empty:
        mo.stop(True, mo.callout("選択したイベントが見つかりません。", kind="warn"))

    selected_event = selected_event_df.iloc[0]
    _selected_peak_time = selected_event["peak_time_jst"]
    context_window_df = plot_power_df.loc[
        (plot_power_df["ts_jst"] >= _selected_peak_time - pd.Timedelta(minutes=30))
        & (plot_power_df["ts_jst"] <= _selected_peak_time + pd.Timedelta(minutes=30))
    ].copy()
    if context_window_df.empty:
        mo.stop(True, mo.callout("ピーク前後 30 分の時系列が取得できませんでした。", kind="warn"))

    peak_marker_df = pd.DataFrame(
        [{"peak_time": _selected_peak_time, "peak_watts": selected_event["peak_watts"]}]
    )
    base = alt.Chart(context_window_df).encode(
        x=alt.X("ts_jst:T", title="Timestamp (JST)"),
        tooltip=[
            alt.Tooltip("ts_jst:T", title="時刻"),
            alt.Tooltip("watts:Q", title="瞬時電力(W)", format=".1f"),
            alt.Tooltip("rolling_watts:Q", title="移動平均(W)", format=".1f"),
        ],
    )
    _raw_line = base.mark_line(color="#1d4ed8").encode(y=alt.Y("watts:Q", title="Watts"))
    _rolling_line = base.mark_line(color="#ea580c", strokeWidth=2).encode(y="rolling_watts:Q")
    _threshold_rule = (
        alt.Chart(pd.DataFrame([{"threshold": load_threshold_watts}]))
        .mark_rule(color="#dc2626", strokeDash=[6, 4])
        .encode(y="threshold:Q")
    )
    peak_rule = alt.Chart(peak_marker_df).mark_rule(color="#111827").encode(x="peak_time:T")

    event_context_chart = (_raw_line + _rolling_line + _threshold_rule + peak_rule).properties(
        height=320,
        title=f"{selected_event['event_label']} のピーク前後 30 分",
    )
    _chart = mo.ui.altair_chart(event_context_chart)
    _chart
    return


@app.cell
def _(daily_weather_context_df, mo, power_df):
    daily_comparison_df = (
        power_df.groupby("date_jst", as_index=False)
        .agg(
            records=("ts", "count"),
            avg_watts=("watts", "mean"),
            peak_watts=("watts", "max"),
            total_kwh_delta=("delta_kwh", "sum"),
            high_load_minutes=("high_load_span_minutes", "sum"),
            p95_watts=("watts", lambda s: round(float(s.quantile(0.95)), 1)),
        )
        .sort_values("date_jst")
    )
    daily_comparison_df["coverage_pct"] = (daily_comparison_df["records"] / 1440 * 100).round(1)
    daily_comparison_df["high_load_minutes"] = daily_comparison_df["high_load_minutes"].round(1)

    if not daily_weather_context_df.empty:
        daily_comparison_df = daily_comparison_df.merge(
            daily_weather_context_df, on="date_jst", how="left"
        )
        daily_comparison_df["avg_temp"] = daily_comparison_df["avg_temp"].round(1)
        daily_comparison_df["precipitation_sum"] = daily_comparison_df["precipitation_sum"].round(1)

    daily_table_df = daily_comparison_df.rename(columns={"date_jst": "date"}).copy()
    daily_view = mo.vstack([mo.md("## 日別比較"), mo.ui.table(daily_table_df, selection=None)])
    daily_view
    return (daily_comparison_df,)


@app.cell
def _(alt, mo, power_df, weather_hourly_df):
    if weather_hourly_df.empty:
        mo.stop(
            True,
            mo.callout("天気データがないため、気温との比較チャートはスキップしました。", kind="warn"),
        )

    hourly_power_weather_df = (
        power_df.set_index("ts_jst")
        .resample("1h")
        .agg(avg_watts=("watts", "mean"), peak_watts=("watts", "max"))
        .reset_index()
    )
    hourly_power_weather_df = hourly_power_weather_df.merge(
        weather_hourly_df, on="ts_jst", how="inner"
    )
    if hourly_power_weather_df.empty:
        mo.stop(
            True,
            mo.callout("電力データと天気データを同じ時刻で結合できませんでした。", kind="warn"),
        )

    power_line = (
        alt.Chart(hourly_power_weather_df)
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
        alt.Chart(hourly_power_weather_df)
        .mark_line(color="#dc2626", strokeWidth=2)
        .encode(
            x=alt.X("ts_jst:T", title="Timestamp (JST)"),
            y=alt.Y("temperature_2m:Q", title="気温 (°C)"),
        )
    )

    weather_compare_chart = (
        alt.layer(power_line, temp_line)
        .resolve_scale(y="independent")
        .properties(height=320, title="1時間平均電力と気温の比較")
    )
    _chart = mo.ui.altair_chart(weather_compare_chart)
    _chart
    return


@app.cell
def _(alt, mo, power_df, weather_hourly_df):
    if weather_hourly_df.empty:
        mo.stop(
            True,
            mo.callout("天気データがないため、気温との散布図はスキップしました。", kind="warn"),
        )

    hourly_scatter_df = (
        power_df.set_index("ts_jst")
        .resample("1h")
        .agg(avg_watts=("watts", "mean"))
        .reset_index()
    )
    hourly_scatter_df = hourly_scatter_df.merge(weather_hourly_df, on="ts_jst", how="inner")
    if hourly_scatter_df.empty:
        mo.stop(True, mo.callout("気温との散布図を作るための結合結果が空です。", kind="warn"))

    weather_scatter_chart = (
        alt.Chart(hourly_scatter_df)
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
    _chart = mo.ui.altair_chart(weather_scatter_chart)
    _chart
    return


@app.cell
def _(
    daily_comparison_df,
    event_summary_df,
    mo,
    power_summary,
    weather_daily_df,
):
    notes = [
        f"期間内の総増分電力量は {power_summary['total_kwh_delta']} kWh です。",
        f"平均電力は {power_summary['avg_watts']} W、P95 は {power_summary['p95_watts']} W でした。",
        f"最大ピークは {power_summary['peak_watts']} W で、{power_summary['peak_at']} に観測されています。",
        f"高負荷の累積継続時間は {power_summary['high_load_minutes']} 分です。",
        f"高負荷イベントとして集約された件数は {len(event_summary_df)} 件です。",
        f"日別比較は {len(daily_comparison_df)} 日分です。",
    ]
    if not weather_daily_df.empty:
        rainy_days = int((weather_daily_df["precipitation_sum"] > 0).sum())
        notes.append(f"同期間の降水日数は {rainy_days} 日でした。")
        coldest_day_row = weather_daily_df.loc[weather_daily_df["temp_min"].idxmin()]
        notes.append(
            f"最も冷え込んだ日は {coldest_day_row['date_jst']} で、最低気温は {coldest_day_row['temp_min']:.1f} °C でした。"
        )

    findings_md = mo.md("## Quick Findings\n\n" + "\n".join([f"- {note}" for note in notes]))
    findings_md
    return


if __name__ == "__main__":
    app.run()
