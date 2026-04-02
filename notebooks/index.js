export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path.startsWith("/health")) {
      return new Response(JSON.stringify({ made: "with marimo" }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    if (path === "/") {
      const html = `<!doctype html>
<html lang="ja">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Energy Monitor Notebooks</title>
    <style>
      :root {
        color-scheme: light;
      }
      body {
        margin: 0;
        font-family: "Hiragino Sans", "Noto Sans JP", sans-serif;
        background: #f4f7fb;
        color: #1b2733;
      }
      main {
        max-width: 720px;
        margin: 0 auto;
        padding: 32px 20px 40px;
      }
      h1 {
        margin: 0 0 10px;
        font-size: 28px;
      }
      p {
        margin: 0 0 20px;
        line-height: 1.6;
      }
      .links {
        display: grid;
        gap: 12px;
      }
      a {
        display: block;
        padding: 14px 16px;
        border-radius: 10px;
        border: 1px solid #c9d8ea;
        background: #ffffff;
        color: inherit;
        text-decoration: none;
      }
      a:hover {
        background: #ecf4ff;
      }
      .title {
        font-weight: 700;
        margin-bottom: 2px;
      }
      .desc {
        font-size: 14px;
        opacity: 0.9;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>Energy Monitor Notebook Hub</h1>
      <p>公開中の marimo notebook を選択してください。</p>
      <div class="links">
        <a href="/energy/">
          <div class="title">Energy Analysis</div>
          <div class="desc">軽量なサマリー分析ノートブック</div>
        </a>
        <a href="/detailed/">
          <div class="title">Detailed Energy Analysis</div>
          <div class="desc">期間・曜日・天気相関まで見る詳細分析ノートブック</div>
        </a>
      </div>
    </main>
  </body>
</html>`;
      return new Response(html, {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    if (path === "/energy") {
      return Response.redirect(`${url.origin}/energy/`, 308);
    }

    if (path === "/detailed") {
      return Response.redirect(`${url.origin}/detailed/`, 308);
    }

    if (path === "/energy/" || path === "/energy/index.html") {
      return env.ASSETS.fetch(new Request(`${url.origin}/energy/index.html`, request));
    }

    if (path === "/detailed/" || path === "/detailed/index.html") {
      return env.ASSETS.fetch(new Request(`${url.origin}/detailed/index.html`, request));
    }

    return env.ASSETS.fetch(request);
  },
};
