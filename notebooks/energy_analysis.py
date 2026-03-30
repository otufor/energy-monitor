# /// script
# requires-python = ">=3.13"
# dependencies = [
#     "altair>=6.0.0",
#     "marimo>=0.20.2",
#     "pyzmq>=27.1.0",
# ]
# ///

import marimo

__generated_with = "0.20.4"
app = marimo.App(width="medium")


@app.cell
async def _():
    import json
    import urllib.request
    from datetime import datetime, timedelta, timezone

    import marimo as mo

    try:
        import altair as alt
    except ModuleNotFoundError:
        import micropip

        await micropip.install("altair")
        import altair as alt

    jst = timezone(timedelta(hours=9))
    return alt, datetime, json, jst, mo, urllib


@app.cell
def _(mo):
    mo.md(
        """
        # Energy Monitor Analysis
        """
    )
    return


@app.cell
def _(mo):
    api_url = mo.ui.text(
        value="https://energy-monitor-workers.mh076144.workers.dev",
        label="Workers API URL",
        full_width=True,
    )
    api_url
    return (api_url,)


@app.cell
def _(mo):
    api_key = mo.ui.text(
        value="",
        label="API Key (X-Api-Key)",
        full_width=True,
        kind="password",
    )
    api_key
    return (api_key,)


@app.cell
def _(mo):
    minutes_slider = mo.ui.slider(
        start=30,
        stop=1440,
        step=30,
        value=60,
        label="Recent data (minutes)",
    )
    minutes_slider
    return (minutes_slider,)


@app.cell
def _(api_key, api_url, json, minutes_slider, mo, urllib):
    allowed_hosts = {
        "localhost",
        "127.0.0.1",
        "energy-monitor-workers.mh076144.workers.dev",
        "energy-monitor-notebook.mh076144.workers.dev",
    }

    def is_allowed_url(raw: str) -> bool:
        try:
            from urllib.parse import urlparse

            parsed = urlparse(raw)
            return parsed.scheme in ("http", "https") and parsed.hostname in allowed_hosts
        except Exception:
            return False

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

        try:
            req = urllib.request.Request(base + path, headers=headers)
            with urllib.request.urlopen(req, timeout=10) as resp:
                return json.loads(resp.read())
        except Exception as exc:
            return {"error": str(exc)}

    recent_data = fetch_json(f"/api/power/recent?minutes={minutes_slider.value}")

    if isinstance(recent_data, list) and recent_data:
        latest = recent_data[-1]
        mo.md(
            f"""
            ## Latest Reading

            | Metric | Value |
            |--------|-------|
            | Timestamp (UTC) | `{latest.get('ts', '-')}` |
            | Power | **{latest.get('watts', 0):.0f} W** |
            | Current | **{latest.get('ampere', 0):.1f} A** |
            | Cumulative | **{latest.get('cum_kwh', 0):.1f} kWh** |
            """
        )
    else:
        mo.callout(
            mo.md(f"No data - check API URL or API key.\n\n`{recent_data}`"),
            kind="warn",
        )

    return fetch_json, recent_data


@app.cell
def _(alt, mo, recent_data):
    if not (isinstance(recent_data, list) and recent_data):
        mo.stop(True)

    power_chart = (
        alt.Chart(alt.Data(values=recent_data))
        .mark_area(line=True, color="#4f86c6", opacity=0.3)
        .encode(
            x=alt.X("ts:N", title="Timestamp (UTC)", axis=alt.Axis(labelAngle=-45, labelLimit=120)),
            y=alt.Y("watts:Q", title="Watts"),
            tooltip=["ts:N", "watts:Q"],
        )
        .properties(height=300, title="Power (W) over time")
    )

    mo.ui.altair_chart(power_chart)
    return


@app.cell
def _(alt, mo, recent_data):
    if not (isinstance(recent_data, list) and recent_data):
        mo.stop(True)

    ampere_chart = (
        alt.Chart(alt.Data(values=recent_data))
        .mark_line(color="#e07b39")
        .encode(
            x=alt.X("ts:N", title="Timestamp (UTC)", axis=alt.Axis(labelAngle=-45, labelLimit=120)),
            y=alt.Y("ampere:Q", title="Ampere"),
            tooltip=["ts:N", "ampere:Q"],
        )
        .properties(height=250, title="Current (A) over time")
    )

    mo.ui.altair_chart(ampere_chart)
    return


@app.cell
def _(datetime, jst, mo):
    today_jst = datetime.now(jst).strftime("%Y-%m-%d")
    date_picker = mo.ui.date(value=today_jst, label="Daily summary date (JST)")
    date_picker
    return (date_picker,)


@app.cell
def _(date_picker, fetch_json, mo):
    summary = fetch_json(f"/api/summary/{date_picker.value}")

    if "error" in summary or not summary:
        mo.callout(mo.md(f"No summary data: `{summary}`"), kind="warn")
    else:
        mo.md(
            f"""
            ## Daily Summary - {date_picker.value}

            | Metric | Value |
            |--------|-------|
            | Total consumption | **{summary.get('total_kwh', 0):.2f} kWh** |
            | Peak power | **{summary.get('peak_watts', 0):.0f} W** |
            | Peak time | `{summary.get('peak_time', '-')}` |
            | Average power | **{summary.get('avg_watts', 0):.0f} W** |
            | Estimated cost | **Yen {summary.get('cost_yen', 0):.0f}** |
            """
        )
    return


@app.cell
def _():
    return


if __name__ == "__main__":
    app.run()
