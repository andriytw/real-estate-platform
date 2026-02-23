/**
 * Tour3D converter worker: POST /convert-usdz
 * Downloads USDZ, runs Blender, uploads GLB, inserts DB row. Lock + marker lifecycle.
 */

import express from 'express';
import { createClient } from '@supabase/supabase-js';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(express.json({ limit: '1mb' }));

const BUCKET = 'property-media';
const LOCK_TTL_MS = 20 * 60 * 1000; // 20 minutes
const CONVERSION_TIMEOUT_MS = 180 * 1000; // 180s

function getEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

function log(propertyId, sourceAssetId, msg, extra = {}) {
  console.log(JSON.stringify({ propertyId, sourceAssetId, ...extra, msg }));
}

function markerPath(propertyId, sourceAssetId) {
  return `property/${propertyId}/tour3d/_jobs/${sourceAssetId}.json`;
}

function lockPath(propertyId, sourceAssetId) {
  return `property/${propertyId}/tour3d/_locks/${sourceAssetId}.lock`;
}

function derivedPath(propertyId, sourceAssetId) {
  return `property/${propertyId}/tour3d/derived/${sourceAssetId}_web.glb`;
}

function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '') || req.headers['x-converter-token'];
  const expected = process.env.CONVERTER_TOKEN;
  if (!expected || token !== expected) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

app.post('/convert-usdz', authMiddleware, async (req, res) => {
  const { propertyId, sourceAssetId, sourceStoragePath, sourceFileName } = req.body || {};
  if (!propertyId || !sourceAssetId || !sourceStoragePath) {
    return res.status(400).json({ error: 'propertyId, sourceAssetId, sourceStoragePath required' });
  }

  const supabaseUrl = getEnv('SUPABASE_URL');
  const serviceRoleKey = getEnv('SUPABASE_SERVICE_ROLE_KEY');
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const markerP = markerPath(propertyId, sourceAssetId);
  const lockP = lockPath(propertyId, sourceAssetId);
  const derivedP = derivedPath(propertyId, sourceAssetId);

  const updateMarker = async (status, extra = {}) => {
    let body = {};
    try {
      const { data } = await supabase.storage.from(BUCKET).download(markerP);
      if (data) {
        const raw = data instanceof Buffer ? data.toString('utf8') : await data.text();
        if (raw) body = JSON.parse(raw);
      }
    } catch (_) {}
    body = { ...body, status, updated_at: new Date().toISOString(), ...extra };
    await supabase.storage.from(BUCKET).upload(markerP, JSON.stringify(body), { upsert: true, contentType: 'application/json' });
  };

  const acquireLock = async () => {
    const lockBody = { started_at: new Date().toISOString(), sourceAssetId, propertyId };
    const { error } = await supabase.storage.from(BUCKET).upload(lockP, JSON.stringify(lockBody), { upsert: false, contentType: 'application/json' });
    if (!error) return true;
    if (error.message?.includes('already exists') || error.message?.includes('Duplicate')) {
      const { data: lockData } = await supabase.storage.from(BUCKET).download(lockP);
      if (!lockData) return false;
      const raw = lockData instanceof Buffer ? lockData.toString('utf8') : await lockData.text();
      let lockJson = {};
      try { lockJson = JSON.parse(raw); } catch (_) {}
      const started = lockJson.started_at ? new Date(lockJson.started_at).getTime() : 0;
      const age = Date.now() - started;
      if (age > LOCK_TTL_MS) {
        await supabase.storage.from(BUCKET).remove([lockP]);
        return acquireLock();
      }
      return false;
    }
    throw error;
  };

  const releaseLock = async () => {
    try {
      await supabase.storage.from(BUCKET).remove([lockP]);
    } catch (e) {
      log(propertyId, sourceAssetId, 'lock remove failed', { err: e?.message });
    }
  };

  let tmpDir;
  try {
    const gotLock = await acquireLock();
    if (!gotLock) {
      log(propertyId, sourceAssetId, 'already_running');
      return res.status(200).json({ status: 'already_running' });
    }

    await updateMarker('processing');
    log(propertyId, sourceAssetId, 'conversion started', { sourceStoragePath: sourceStoragePath, derivedPath: derivedP });

    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tour3d-'));
    const inputPath = path.join(tmpDir, 'input.usdz');
    const outputPath = path.join(tmpDir, 'output.glb');

    const { data: downloadData, error: downloadError } = await supabase.storage.from(BUCKET).download(sourceStoragePath);
    if (downloadError || !downloadData) {
      await updateMarker('failed', { error: `download failed: ${downloadError?.message || 'no data'}` });
      return res.status(500).json({ error: 'Download failed' });
    }
    const buf = downloadData instanceof Buffer ? downloadData : Buffer.from(await downloadData.arrayBuffer());
    fs.writeFileSync(inputPath, buf);

    const scriptDir = path.dirname(new URL(import.meta.url).pathname);
    const blenderScript = path.join(scriptDir, 'convert_usdz_to_glb.py');
    const runBlender = path.join(scriptDir, 'run_blender.sh');

    const runBlenderPromise = new Promise((resolve, reject) => {
      const proc = spawn('bash', [runBlender, inputPath, outputPath], {
        cwd: scriptDir,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let stdout = '';
      let stderr = '';
      proc.stdout?.on('data', (c) => { stdout += c.toString(); });
      proc.stderr?.on('data', (c) => { stderr += c.toString(); });
      const t = setTimeout(() => {
        proc.kill('SIGKILL');
        reject(new Error('timeout'));
      }, CONVERSION_TIMEOUT_MS);
      proc.on('close', (code) => {
        clearTimeout(t);
        log(propertyId, sourceAssetId, 'blender exit', { code, stdout: stdout.slice(0, 500), stderr: stderr.slice(0, 500) });
        if (code !== 0) reject(new Error(`blender exit ${code}`));
        else resolve();
      });
      proc.on('error', (err) => reject(err));
    });

    try {
      await runBlenderPromise;
    } catch (e) {
      await updateMarker('failed', { error: e?.message === 'timeout' ? 'timeout' : (e?.message || 'Blender failed') });
      return res.status(500).json({ error: e?.message });
    }

    if (!fs.existsSync(outputPath)) {
      await updateMarker('failed', { error: 'GLB file not produced' });
      return res.status(500).json({ error: 'GLB not produced' });
    }

    const glbBuffer = fs.readFileSync(outputPath);
    const { error: uploadError } = await supabase.storage.from(BUCKET).upload(derivedP, glbBuffer, {
      contentType: 'model/gltf-binary',
      upsert: true,
    });
    if (uploadError) {
      await updateMarker('failed', { error: `upload failed: ${uploadError.message}` });
      return res.status(500).json({ error: 'Upload failed' });
    }

    const { data: existing } = await supabase.from('property_media_assets').select('id').eq('storage_path', derivedP).limit(1).maybeSingle();
    if (!existing) {
      const baseName = (sourceFileName || 'model').replace(/\.usdz$/i, '');
      const { error: insertError } = await supabase.from('property_media_assets').insert({
        id: crypto.randomUUID(),
        property_id: propertyId,
        type: 'tour3d',
        file_name: `${baseName}_web.glb`,
        storage_path: derivedP,
        mime_type: 'model/gltf-binary',
        size_bytes: glbBuffer.length,
        external_url: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      if (insertError) {
        log(propertyId, sourceAssetId, 'db insert error', { err: insertError.message });
      }
    }

    await updateMarker('done', { derivedStoragePath: derivedP });
    await releaseLock();
    log(propertyId, sourceAssetId, 'conversion done');
    return res.status(200).json({ status: 'done' });
  } catch (err) {
    log(propertyId, sourceAssetId, 'conversion error', { err: err?.message });
    try {
      await updateMarker('failed', { error: (err?.message || 'Unknown error').slice(0, 500) });
    } catch (_) {}
    await releaseLock().catch(() => {});
    return res.status(500).json({ error: err?.message || 'Internal error' });
  } finally {
    if (tmpDir && fs.existsSync(tmpDir)) {
      try {
        fs.rmSync(tmpDir, { recursive: true });
      } catch (_) {}
    }
  }
});

app.get('/health', (_, res) => res.status(200).json({ ok: true }));

const port = Number(process.env.PORT) || 8080;
app.listen(port, () => {
  console.log(`tour3d-converter listening on ${port}`);
});
