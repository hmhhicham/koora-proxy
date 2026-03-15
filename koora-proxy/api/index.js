export default async function handler(req, res) {
  const { url: targetUrl, headers: customHeadersStr } = req.query;

  if (!targetUrl || !targetUrl.startsWith('http')) {
    return res.status(400).send('Invalid or missing target URL. Use ?url=http://...');
  }

  try {
    const fetchHeaders = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    };

    if (customHeadersStr) {
      try {
        const customHeaders = JSON.parse(decodeURIComponent(customHeadersStr));
        Object.assign(fetchHeaders, customHeaders);
      } catch (e) {}
    }

    const response = await fetch(targetUrl, {
      headers: fetchHeaders,
      redirect: 'follow',
    });

    if (!response.ok) {
       return res.status(response.status).send(`Target Error: ${response.statusText}`);
    }

    const contentType = response.headers.get('content-type') || '';
    const isM3u8 = contentType.includes('mpegurl') || contentType.includes('m3u8') || targetUrl.includes('.m3u8');

    if (isM3u8) {
      let text = await response.text();
      const baseUrl = new URL(response.url);

      const rewritten = text.split('\n').map(line => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) return trimmed;
        try {
          // Re-proxy child links
          const proxyUrl = new URL(`https://${req.headers.host}${req.url.split('?')[0]}`);
          proxyUrl.searchParams.set('url', new URL(trimmed, baseUrl.href).href);
          if (customHeadersStr) proxyUrl.searchParams.set('headers', customHeadersStr);
          return proxyUrl.toString();
        } catch { return trimmed; }
      }).join('\n');

      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cache-Control', 'no-cache, no-store');
      return res.status(200).send(rewritten);
    }

    // Proxy segments
    const data = await response.arrayBuffer();
    res.setHeader('Content-Type', response.headers.get('content-type'));
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    return res.status(200).send(Buffer.from(data));

  } catch (error) {
    return res.status(500).send('Proxy Error: ' + error.message);
  }
}
