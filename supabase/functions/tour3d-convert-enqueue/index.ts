// Supabase Edge Function: Enqueue USDZ → GLB conversion
// Creates job marker, calls converter worker. On worker unreachable, marks job failed.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const BUCKET = 'property-media'
const ALLOWED_ROLES = ['super_manager', 'manager', 'admin']

function markerPath(propertyId: string, sourceAssetId: string): string {
  return `property/${propertyId}/tour3d/_jobs/${sourceAssetId}.json`
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SERVICE_ROLE_KEY') ?? ''
    const converterUrl = Deno.env.get('CONVERTER_URL') ?? ''
    const converterToken = Deno.env.get('CONVERTER_TOKEN') ?? ''

    if (!supabaseUrl || !anonKey || !serviceRoleKey || !converterUrl || !converterToken) {
      return new Response(
        JSON.stringify({ error: 'Missing configuration (SUPABASE_*, CONVERTER_*)' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Authorization required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabaseUser = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const { data: { user }, error: userError } = await supabaseUser.auth.getUser()
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle()
    if (profileError || !profile?.role || !ALLOWED_ROLES.includes(profile.role)) {
      return new Response(
        JSON.stringify({ error: 'Forbidden' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const body = await req.json().catch(() => ({}))
    const { propertyId, sourceAssetId, sourceStoragePath, sourceFileName } = body
    if (!propertyId || !sourceAssetId || !sourceStoragePath) {
      return new Response(
        JSON.stringify({ error: 'propertyId, sourceAssetId, sourceStoragePath required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const path = markerPath(propertyId, sourceAssetId)
    const now = new Date().toISOString()
    const markerBody = {
      status: 'queued',
      created_at: now,
      updated_at: now,
      sourceStoragePath,
      sourceFileName: sourceFileName ?? null,
    }
    const { error: uploadError } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(path, JSON.stringify(markerBody), { upsert: false, contentType: 'application/json' })

    if (uploadError) {
      if (uploadError.message?.includes('already exists') || uploadError.message?.includes('Duplicate')) {
        return new Response(
          JSON.stringify({ status: 'already_queued' }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      return new Response(
        JSON.stringify({ error: uploadError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const workerPayload = { propertyId, sourceAssetId, sourceStoragePath, sourceFileName: sourceFileName ?? '' }
    let workerRes: Response
    try {
      workerRes = await fetch(`${converterUrl.replace(/\/+$/, '')}/convert-usdz`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${converterToken}`,
        },
        body: JSON.stringify(workerPayload),
      })
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err)
      const failedBody = {
        ...markerBody,
        status: 'failed',
        updated_at: new Date().toISOString(),
        error: `worker_unreachable: ${errMsg.slice(0, 200)}`,
      }
      await supabaseAdmin.storage.from(BUCKET).upload(path, JSON.stringify(failedBody), { upsert: true, contentType: 'application/json' })
      return new Response(
        JSON.stringify({ status: 'queued', warning: 'worker_unreachable' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!workerRes.ok) {
      const snippet = await workerRes.text().then((t) => t.slice(0, 150)).catch(() => '')
      const failedBody = {
        ...markerBody,
        status: 'failed',
        updated_at: new Date().toISOString(),
        error: `worker_unreachable: ${workerRes.status} ${snippet}`,
      }
      await supabaseAdmin.storage.from(BUCKET).upload(path, JSON.stringify(failedBody), { upsert: true, contentType: 'application/json' })
      return new Response(
        JSON.stringify({ status: 'queued', warning: 'worker_unreachable' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ status: 'queued' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error(err)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
