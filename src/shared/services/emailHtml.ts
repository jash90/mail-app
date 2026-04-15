/** Injected JS to measure WebView content height and report it back. */
export const heightScript = `
  (function() {
    function postHeight() {
      var h = document.body.scrollHeight;
      window.ReactNativeWebView.postMessage(JSON.stringify({ height: h }));
    }
    postHeight();
    document.querySelectorAll('img').forEach(function(img) {
      img.addEventListener('load', postHeight);
      img.addEventListener('error', postHeight);
    });
    if (typeof ResizeObserver !== 'undefined') {
      new ResizeObserver(postHeight).observe(document.body);
    } else {
      setTimeout(postHeight, 500);
      setTimeout(postHeight, 1500);
    }
  })();
  true;
`;

/** Wrap email HTML content with dark theme styling for WebView display. */
export function wrapHtml(html: string) {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; color: #ffffff !important; background-color: #000000 !important; }
        html, body {
          background-color: #000000 !important;
          font-family: -apple-system, system-ui, sans-serif;
          font-size: 15px;
          line-height: 1.5;
          word-wrap: break-word;
          overflow-wrap: break-word;
        }
        a { color: #818cf8 !important; }
        img { max-width: 100%; height: auto; background-color: transparent !important; }
        pre { white-space: pre-wrap; }
        blockquote { border-left: 3px solid #4b5563; padding-left: 12px; margin: 8px 0; color: #9ca3af !important; }
      </style>
    </head>
    <body>${html}</body>
    </html>
  `;
}
