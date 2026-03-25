import marimo

__generated_with = "0.21.1"
app = marimo.App(width="medium")


@app.cell
async def _():
    """
    Prepare and return runtime utilities required by downstream cells.
    
    This cell ensures Altair is available (installing it via micropip if missing) and constructs a JST timezone. It returns a tuple of commonly used modules and classes for use in later cells.
    
    Returns:
        tuple: (
            JST (datetime.timezone) — timezone set to UTC+9,
            alt (module) — the Altair plotting library,
            datetime (class) — the `datetime` class from the `datetime` module,
            json (module) — the `json` module,
            mo (module) — the `marimo` module,
            urllib (module) — the `urllib.request` module
        )
    """
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

    JST = timezone(timedelta(hours=9))
    return JST, alt, datetime, json, mo, urllib


@app.cell
def _(mo):
    """
    Render the main Markdown header "Energy Monitor Analysis" in the app.
    
    This cell inserts a level-1 Markdown title into the Marimo app UI.
    """
    mo.md("""
    # Energy Monitor Analysis
    """)
    return


@app.cell
def _(mo):
    """
    Create a text input labeled "Workers API URL" prefilled with the default worker endpoint and return it.
    
    Returns:
        tuple: A one-element tuple containing the created text input control (`api_url`).
    """
    api_url = mo.ui.text(
        value="https://energy-monitor-workers.mh076144.workers.dev",
        label="Workers API URL",
        full_width=True,
    )
    api_url
    return (api_url,)


@app.cell
def _(mo):
    """
    Create a password-style text input labeled "API Key (X-Api-Key)" and return it.
    
    The input is rendered full-width and masks entered characters.
    
    Returns:
        tuple: A single-item tuple containing the created text input control (`api_key`).
    """
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
    """
    Create a slider UI control for selecting the recent data window in minutes.
    
    Returns:
        tuple: A single-element tuple containing the slider widget; the slider's value is the selected minutes (integer).
    """
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
    """
    Set up a JSON-fetching helper and render the latest power reading or a warning when recent data is unavailable.
    
    The function defines and returns a `fetch_json(path)` helper that performs an allowed-host HTTP GET (optionally including the API key) and parses the JSON response. It also fetches recent power readings and renders either a "Latest Reading" Markdown table (when data is a non-empty list) or a warning callout containing the returned value.
    
    Returns:
        tuple:
            - `fetch_json` (callable): A function that accepts a request path string and returns parsed JSON on success or a dictionary with an `"error"` key on failure.
            - `recent_data` (any): The raw result returned from the recent-data API call — typically a list of readings when successful, or an error dictionary otherwise.
    """
    _ALLOWED_HOSTS = {
        "localhost",
        "127.0.0.1",
        "energy-monitor-workers.mh076144.workers.dev",
        "energy-monitor-notebook.mh076144.workers.dev",
    }

    def _is_allowed_url(raw: str) -> bool:
        """
        Check whether a URL is allowed by verifying its scheme and hostname.
        
        Parameters:
            raw (str): The URL string to validate.
        
        Returns:
            True if the URL uses the "http" or "https" scheme and its hostname is listed in `_ALLOWED_HOSTS`, False otherwise.
        """
        try:
            from urllib.parse import urlparse

            parsed = urlparse(raw)
            return parsed.scheme in ("http", "https") and parsed.hostname in _ALLOWED_HOSTS
        except Exception:
            return False

    def fetch_json(path: str):
        """
        Fetch JSON from the configured API by appending `path` to the configured base URL.
        
        Parameters:
            path (str): Endpoint path to append to the API base URL (e.g., "/api/power/recent?minutes=60").
        
        Returns:
            The parsed JSON response on success (typically a dict or list). If the request is blocked or any error occurs, returns a dict containing an "error" key with a descriptive message.
        """
        base = api_url.value.rstrip("/")
        if not _is_allowed_url(base):
            return {"error": f"Blocked: '{base}' is not an allowed API host"}
        url = base + path
        headers = {"X-Api-Key": api_key.value} if api_key.value else {}
        try:
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, timeout=10) as resp:
                return json.loads(resp.read())
        except Exception as e:
            return {"error": str(e)}

    recent_data = fetch_json(f"/api/power/recent?minutes={minutes_slider.value}")
    latest = None

    if isinstance(recent_data, list) and recent_data:
        latest = recent_data[-1]
        mo.md(f"""
    ## Latest Reading
    | Metric | Value |
    |--------|-------|
    | Timestamp (UTC) | `{latest.get('ts', '-')}` |
    | Power | **{latest.get('watts', 0):.0f} W** |
    | Current | **{latest.get('ampere', 0):.1f} A** |
    | Cumulative | **{latest.get('cum_kwh', 0):.1f} kWh** |
        """)
    else:
        mo.callout(
            mo.md(f"No data - check API URL or API key.\n\n`{recent_data}`"),
            kind="warn",
        )
    return fetch_json, recent_data


@app.cell
def _(alt, mo, recent_data):
    """
    Render an Altair area chart showing power (watts) over time from the provided recent data.
    
    Stops the app when `recent_data` is not a non-empty list; otherwise displays an area chart titled "Power (W) over time" with timestamps on the x-axis and watts on the y-axis.
    
    Parameters:
        recent_data (list[dict]): Recent readings where each item contains at least
            the keys `ts` (timestamp string in UTC) and `watts` (numeric power value).
    """
    if not (isinstance(recent_data, list) and recent_data):
        mo.stop(True)

    power_chart = alt.Chart(alt.Data(values=recent_data)).mark_area(
        line=True,
        color="#4f86c6",
        opacity=0.3,
    ).encode(
        x=alt.X("ts:N", title="Timestamp (UTC)", axis=alt.Axis(labelAngle=-45, labelLimit=120)),
        y=alt.Y("watts:Q", title="Watts"),
        tooltip=["ts:N", "watts:Q"],
    ).properties(
        height=300,
        title="Power (W) over time",
    )

    mo.ui.altair_chart(power_chart)
    return


@app.cell
def _(alt, mo, recent_data):
    """
    Render an Altair line chart of current (ampere) over time into the Marimo UI.
    
    If `recent_data` is not a non-empty list, stops the app. `recent_data` should be an iterable of records containing `ts` (timestamp) and `ampere` (numeric) fields; these are used for the x-axis and y-axis respectively.
     
    Parameters:
        recent_data (list): List of dict-like records with at least `ts` and `ampere` keys.
    """
    if not (isinstance(recent_data, list) and recent_data):
        mo.stop(True)

    ampere_chart = alt.Chart(alt.Data(values=recent_data)).mark_line(
        color="#e07b39"
    ).encode(
        x=alt.X("ts:N", title="Timestamp (UTC)", axis=alt.Axis(labelAngle=-45, labelLimit=120)),
        y=alt.Y("ampere:Q", title="Ampere"),
        tooltip=["ts:N", "ampere:Q"],
    ).properties(
        height=250,
        title="Current (A) over time",
    )

    mo.ui.altair_chart(ampere_chart)
    return


@app.cell
def _(JST, datetime, mo):
    """
    Create and render a date picker initialized to today's date in Japan Standard Time (JST).
    
    Parameters:
        JST: Timezone object representing JST used to compute the current date.
        datetime: The datetime module providing now() and strftime() functions.
        mo: Marimo app/module providing the UI factory used to create and render the control.
    
    Returns:
        tuple: A single-element tuple containing the created date picker control set to today's date in JST.
    """
    today_jst = datetime.now(JST).strftime("%Y-%m-%d")
    date_picker = mo.ui.date(value=today_jst, label="Daily summary date (JST)")
    date_picker
    return (date_picker,)


@app.cell
def _(date_picker, fetch_json, mo):
    """
    Render a daily energy usage summary for the selected date.
    
    Queries the backend summary endpoint for the date in `date_picker.value`. If the response contains an `"error"` key or is falsy, displays a warning callout with the raw response; otherwise renders a Markdown table showing total kWh, peak watts and time, average watts, and estimated cost using safe default values when fields are missing.
    
    Parameters:
        date_picker: UI date input whose `value` is the selected date string (e.g., "YYYY-MM-DD").
        fetch_json: Callable that accepts a path string (e.g., f"/api/summary/{date}") and returns parsed JSON.
        mo: Marimo UI context used to render Markdown and callouts.
    """
    summary = fetch_json(f"/api/summary/{date_picker.value}")

    if "error" in summary or not summary:
        mo.callout(mo.md(f"No summary data: `{summary}`"), kind="warn")
    else:
        mo.md(f"""
    ## Daily Summary - {date_picker.value}

    | Metric | Value |
    |--------|-------|
    | Total consumption | **{summary.get('total_kwh', 0):.2f} kWh** |
    | Peak power | **{summary.get('peak_watts', 0):.0f} W** |
    | Peak time | `{summary.get('peak_time', '-')}` |
    | Average power | **{summary.get('avg_watts', 0):.0f} W** |
    | Estimated cost | **Yen {summary.get('cost_yen', 0):.0f}** |
        """)
    return


if __name__ == "__main__":
    app.run()
