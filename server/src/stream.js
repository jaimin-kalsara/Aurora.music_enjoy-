// Audio stream proxy. YouTube's media URLs are bound to the requesting IP and expire after a few
// hours, so the browser never talks to them directly: it streams `/api/stream/:id` and we relay
// the requested range upstream in bounded chunks (the way real players do).
import { Router } from 'express';
import { once } from 'node:events';
import { resolveStream, invalidateStream, ytFetch, UA } from './ytmusic.js';

const router = Router();
const QUALITIES = new Set(['low', 'medium', 'high']);
const CHUNK = 8 * 1024 * 1024;

function parseRange(header, size) {
  const m = /^bytes=(\d*)-(\d*)$/.exec(String(header || '').trim());
  if (!m) return { start: 0, end: size - 1, partial: false };
  let start = m[1] === '' ? undefined : parseInt(m[1], 10);
  let end = m[2] === '' ? undefined : parseInt(m[2], 10);
  if (start === undefined) {
    // suffix range: last N bytes
    start = Math.max(0, size - (end || 0));
    end = size - 1;
  }
  if (end === undefined || end >= size) end = size - 1;
  return { start, end, partial: true };
}

function fetchChunk(format, start, end, signal) {
  return ytFetch(format.url, { headers: { Range: `bytes=${start}-${end}`, 'User-Agent': UA, Accept: '*/*' }, signal, redirect: 'follow' });
}

/** Learn the total size when the format did not advertise one. */
async function probeSize(format, signal) {
  const r = await fetchChunk(format, 0, 0, signal);
  await r.body?.cancel().catch(() => undefined);
  const total = parseInt((r.headers.get('content-range') || '').split('/')[1], 10);
  return Number.isFinite(total) ? total : 0;
}

router.get('/stream/:id', async (req, res, next) => {
  const id = String(req.params.id || '');
  if (!/^[\w-]{11}$/.test(id)) return res.status(400).json({ error: 'Invalid track id' });
  const quality = QUALITIES.has(req.query.q) ? req.query.q : 'high';
  const fmt = req.query.fmt === 'm4a' ? 'm4a' : 'webm';

  const controller = new AbortController();
  res.on('close', () => controller.abort());
  const signal = controller.signal;

  try {
    let format = await resolveStream(id, quality, fmt);
    let size = format.size || (await probeSize(format, signal));

    // First upstream request doubles as validation: expired/IP-bound URLs come back 403, so refresh once.
    const { start, end, partial } = parseRange(req.headers.range, size);
    if (size && (start >= size || start > end)) {
      res.set('Content-Range', `bytes */${size}`);
      return res.status(416).end();
    }
    let upstream = await fetchChunk(format, start, Math.min(end, start + CHUNK - 1), signal);
    if (upstream.status === 403 || upstream.status === 404 || upstream.status === 410) {
      await upstream.body?.cancel().catch(() => undefined);
      invalidateStream(id);
      format = await resolveStream(id, quality, fmt, { force: true });
      size = format.size || size || (await probeSize(format, signal));
      upstream = await fetchChunk(format, start, Math.min(end, start + CHUNK - 1), signal);
    }
    if (!upstream.ok) {
      await upstream.body?.cancel().catch(() => undefined);
      // Fresh URLs still refused: YouTube is blocking this server's IP, not this track.
      if (upstream.status === 403 || upstream.status === 429) {
        return res.status(503).json({ error: `Upstream responded ${upstream.status}`, code: 'BLOCKED' });
      }
      return res.status(502).json({ error: `Upstream responded ${upstream.status}` });
    }
    if (!size) size = parseInt((upstream.headers.get('content-range') || '').split('/')[1], 10) || 0;
    const last = size ? Math.min(end, size - 1) : end;
    const length = last - start + 1;

    res.status(partial ? 206 : 200);
    res.set({
      'Content-Type': format.mime || upstream.headers.get('content-type') || (fmt === 'm4a' ? 'audio/mp4' : 'audio/webm'),
      'Accept-Ranges': 'bytes',
      'Content-Length': String(length),
      'Cache-Control': 'private, max-age=0, no-transform',
      'X-Aurora-Bitrate': String(format.bitrate || ''),
      'X-Aurora-Itag': String(format.itag || ''),
    });
    if (partial) res.set('Content-Range', `bytes ${start}-${last}/${size || '*'}`);
    if (req.method === 'HEAD') {
      await upstream.body?.cancel().catch(() => undefined);
      return res.end();
    }

    // Relay the range as consecutive ≤1 MiB upstream chunks, honoring backpressure and client aborts.
    let pos = start;
    let response = upstream;
    while (pos <= last && !signal.aborted) {
      const chunkEnd = Math.min(last, pos + CHUNK - 1);
      if (!response) {
        response = await fetchChunk(format, pos, chunkEnd, signal);
        if (!response.ok) break;
      }
      for await (const bytes of response.body) {
        if (signal.aborted) break;
        if (!res.write(bytes)) await Promise.race([once(res, 'drain'), once(res, 'close')]);
      }
      response = null;
      pos = chunkEnd + 1;
    }
    res.end();
  } catch (err) {
    if (signal.aborted) return;
    if (res.headersSent) return res.end();
    next(err);
  }
});

export default router;
