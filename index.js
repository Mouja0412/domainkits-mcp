import express from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

const app = express();
app.use(express.json());

const UPSTREAM_URL = 'https://api.domainkits.com/v1/mcp';
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.DOMAINKITS_API_KEY || '';

app.post('/mcp', async (req, res) => {
  try {
    // 1. Set up headers for the upstream request
    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream'
    };
    if (API_KEY) {
      headers['X-API-Key'] = API_KEY;
    }

    // 2. Forward the incoming request body to DomainKits
    const upstreamResponse = await fetch(UPSTREAM_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify(req.body)
    });

    // 3. Mirror the upstream status and headers back to the client
    res.status(upstreamResponse.status);
    const contentType = upstreamResponse.headers.get('content-type');
    if (contentType) {
      res.setHeader('Content-Type', contentType);
    }

    // 4. Stream the body back
    if (upstreamResponse.body) {
      const reader = upstreamResponse.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(value);
      }
      res.end();
    } else {
      res.end();
    }
  } catch (error) {
    console.error('Proxy error:', error);
    if (!res.headersSent) {
      res.status(502).json({
        jsonrpc: '2.0',
        error: { code: -32603, message: 'Upstream proxy failed' },
        id: req.body?.id || null
      });
    }
  }
});

// Health check for deployment platforms
app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

// Also handle GET on /mcp for clients that use SSE discovery
app.get('/mcp', (req, res) => {
  res.status(405).json({
    jsonrpc: '2.0',
    error: { code: -32601, message: 'Method not allowed' },
    id: null
  });
});

app.listen(PORT, () => {
  console.log(`DomainKits MCP proxy running on port ${PORT}`);
  console.log(`Upstream: ${UPSTREAM_URL}`);
  console.log(`API Key: ${API_KEY ? 'configured' : 'not set (guest quota)'}`);
});
