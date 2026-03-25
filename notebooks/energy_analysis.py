import marimo

__generated_with = "0.21.1"
app = marimo.App(width="medium", title="Energy Monitor Analysis")


@app.cell
def _():
    import marimo as mo
    import urllib.request
    import json
    from datetime import datetime, timedelta, timezone

    JST = timezone(timedelta(hours=9))
    return JST, datetime, json, mo, timedelta, timezone, urllib


@app.cell
def _(mo):
    mo.md("# Energy Monitor Analysis")


@app.cell
def _(mo):
    api_url = mo.ui.text(
        value="https://energy-monitor-workers.mh076144.workers.dev",
        label="Workers API URL",
        full_width=True,
    )
    api_url


@app.cell
def _(mo):
    api_key = mo.ui.text(
        value="",
        label="API Key (X-Api-Key)",
        full_width=True,
        kind="password",
    )
    api_key


@app.cell
def _(mo):
    minutes_slider = mo.ui.slider(
        start=30, stop=1440, step=30, value=60,
        label="Recent data (minutes)",
    )
    minutes_slider


@app.cell
def _(JST, api_key, api_url, datetime, json, minutes_slider, mo, urllib):
    _ALLOWED_HOSTS = {
        "localhost",
        "127.0.0.1",
        "energy-monitor-workers.mh076144.workers.dev",
        "energy-monitor-notebook.mh076144.workers.dev",
    }

    def _is_allowed_url(raw: str) -> bool:
        try:
            from urllib.parse import urlparse
            parsed = urlparse(raw)
            return parsed.scheme in ("http", "https") and parsed.hostname in _ALLOWED_HOSTS
        except Exception:
            return False

    def fetch_json(path):
        base = api_url.value.rstrip("/")
        if not _is_allowed_url(base):
            return {"error": f"Blocked: '{base}' is not an allowed API host"}
        url = base + path
        try:
            req = urllib.request.Request(url, headers={"X-Api-Key": api_key.value})
            with urllib.request.urlopen(req, timeout=10) as resp:
                return json.loads(resp.read())
        except Exception as e:
            return {"error": str(e)}

    recent_data = fetch_json(f"/api/power/recent?minutes={minutes_slider.value}")

    if isinstance(recent_data, list) and recent_data:
        # Parse timestamps (UTC → JST)
        for row in recent_data:
            row["ts_jst"] = datetime.strptime(
                row["ts"], "%Y-%m-%d %H:%M:%S"
            ).replace(tzinfo=datetime.now(JST).tzinfo.__class__(
                datetime.now(JST).utcoffset()
            ))

        ts_list = [r["ts"] for r in recent_data]
        watts_list = [r["watts"] for r in recent_data]
        ampere_list = [r["ampere"] for r in recent_data]
        cum_kwh_list = [r["cum_kwh"] for r in recent_data]

        latest = recent_data[-1]
        mo.md(f"""
## Latest Reading
| Metric | Value |
|--------|-------|
| Timestamp (UTC) | `{latest['ts']}` |
| Power | **{latest['watts']:.0f} W** |
| Current | **{latest['ampere']:.1f} A** |
| Cumulative | **{latest['cum_kwh']:.1f} kWh** |
        """)
    else:
        mo.callout(
            mo.md(f"No data — check API URL or start dev server.\n\n`{recent_data}`"),
            kind="warn",
        )
    return (
        ampere_list,
        cum_kwh_list,
        fetch_json,
        latest,
        recent_data,
        ts_list,
        watts_list,
    )


@app.cell
def _(mo, recent_data, ts_list, watts_list):
    if isinstance(recent_data, list) and recent_data:
        mo.md("## Power (W) over time")
    else:
        mo.stop(True)

    mo.ui.altair_chart(
        __import__("altair").Chart(
            __import__("altair").Data(values=[
                {"ts": ts, "watts": w}
                for ts, w in zip(ts_list, watts_list)
            ])
        ).mark_area(
            line=True, color="#4f86c6", opacity=0.3
        ).encode(
            x=__import__("altair").X("ts:N", title="Timestamp (UTC)", axis=__import__("altair").Axis(labelAngle=-45, labelLimit=120)),
            y=__import__("altair").Y("watts:Q", title="Watts"),
            tooltip=["ts:N", "watts:Q"],
        ).properties(height=300)
    )
    return


@app.cell
def _(ampere_list, mo, recent_data, ts_list):
    if isinstance(recent_data, list) and recent_data:
        mo.md("## Current (A) over time")
    else:
        mo.stop(True)

    mo.ui.altair_chart(
        __import__("altair").Chart(
            __import__("altair").Data(values=[
                {"ts": ts, "ampere": a}
                for ts, a in zip(ts_list, ampere_list)
            ])
        ).mark_line(color="#e07b39").encode(
            x=__import__("altair").X("ts:N", title="Timestamp (UTC)", axis=__import__("altair").Axis(labelAngle=-45, labelLimit=120)),
            y=__import__("altair").Y("ampere:Q", title="Ampere"),
            tooltip=["ts:N", "ampere:Q"],
        ).properties(height=250)
    )
    return


@app.cell
def _(JST, datetime, fetch_json, mo):
    today_jst = datetime.now(JST).strftime("%Y-%m-%d")
    date_picker = mo.ui.date(value=today_jst, label="Daily summary date (JST)")
    date_picker


@app.cell
def _(date_picker, fetch_json, mo):
    summary = fetch_json(f"/api/summary/{date_picker.value}")

    if "error" in summary or not summary:
        mo.callout(mo.md(f"No summary data: `{summary}`"), kind="warn")
    else:
        mo.md(f"""
## Daily Summary — {date_picker.value}

| Metric | Value |
|--------|-------|
| Total consumption | **{summary.get('total_kwh', 0):.2f} kWh** |
| Peak power | **{summary.get('peak_watts', 0):.0f} W** |
| Peak time | `{summary.get('peak_time', '-')}` |
| Average power | **{summary.get('avg_watts', 0):.0f} W** |
| Estimated cost | **¥{summary.get('cost_yen', 0):.0f}** |
        """)
    return (summary,)


if __name__ == "__main__":
    app.run()
