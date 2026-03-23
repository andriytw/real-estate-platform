/**
 * Supabase Edge Function: admin-create-user
 *
 * Primary admin user-creation path (replaces the old invite-user `skipInvite` flow for UI):
 * - Validates caller JWT and enforces profiles.can_manage_users === true
 * - Creates Auth user with admin-provided password (never stored in profiles; never logged)
 * - Upserts profiles with Pass 1 fields; rolls back Auth user if profile upsert fails
 *
 * Legacy: invite-user remains for invite/resend flows; skipInvite branch there is transitional only.
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type Role = 'super_manager' | 'manager' | 'worker'
type DepartmentScope = 'facility' | 'accounting' | 'sales' | 'properties' | 'all'

const validRoles = new Set<Role>(['super_manager', 'manager', 'worker'])
const validScopes = new Set<DepartmentScope>(['facility', 'accounting', 'sales', 'properties', 'all'])

function mirrorLegacyDepartmentFromScope(scope: DepartmentScope): 'facility' | 'accounting' | 'sales' {
  switch (scope) {
    case 'facility':
      return 'facility'
    case 'accounting':
      return 'accounting'
    case 'sales':
      return 'sales'
    case 'properties':
      return 'sales' // Temporary technical bridge only.
    case 'all':
      return 'facility' // Temporary technical bridge only.
    default:
      return 'facility'
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const serviceRoleKey = Deno.env.get('SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(
        JSON.stringify({ error: 'Server configuration error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const authHeader = req.headers.get('Authorization') || req.headers.get('authorization')
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
    if (!token) {
      return new Response(
        JSON.stringify({ error: 'Missing Authorization bearer token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })

    // Mandatory server-side authz: validate caller and enforce can_manage_users.
    const { data: callerAuth, error: callerAuthError } = await supabaseAdmin.auth.getUser(token)
    const callerId = callerAuth?.user?.id
    if (callerAuthError || !callerId) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized caller' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { data: callerProfile, error: callerProfileError } = await supabaseAdmin
      .from('profiles')
      .select('id, can_manage_users, is_active')
      .eq('id', callerId)
      .single()

    if (callerProfileError || !callerProfile) {
      return new Response(
        JSON.stringify({ error: 'Caller profile not found' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (callerProfile.is_active === false || callerProfile.can_manage_users !== true) {
      return new Response(
        JSON.stringify({ error: 'Insufficient permissions to create users' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const body = await req.json()
    const email = String(body?.email ?? '').trim().toLowerCase()
    const firstName = String(body?.firstName ?? '').trim()
    const lastName = String(body?.lastName ?? '').trim()
    const phone = body?.phone == null ? null : String(body.phone).trim()
    const role = String(body?.role ?? '') as Role
    const departmentScope = String(body?.departmentScope ?? '') as DepartmentScope
    const canManageUsers = body?.canManageUsers === true
    const canBeTaskAssignee = body?.canBeTaskAssignee !== false
    const isActive = body?.isActive !== false
    const password = String(body?.password ?? '')

    if (!email || !firstName || !lastName || !password) {
      return new Response(
        JSON.stringify({ error: 'email, firstName, lastName and password are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    if (!validRoles.has(role)) {
      return new Response(
        JSON.stringify({ error: 'Invalid role' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    if (!validScopes.has(departmentScope)) {
      return new Response(
        JSON.stringify({ error: 'Invalid department_scope' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
      return new Response(
        JSON.stringify({ error: 'Password must be at least 8 chars and include letters and digits' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Security rule: never log/store password outside Auth.
    const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        first_name: firstName,
        last_name: lastName,
      },
    })

    if (createError || !created?.user?.id) {
      return new Response(
        JSON.stringify({ error: createError?.message || 'Failed to create auth user' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const newUserId = created.user.id
    const legacyDepartment = mirrorLegacyDepartmentFromScope(departmentScope)
    const fullName = `${firstName} ${lastName}`.trim()

    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .upsert({
        id: newUserId,
        email,
        name: fullName || email,
        first_name: firstName,
        last_name: lastName,
        phone,
        role,
        department_scope: departmentScope,
        department: legacyDepartment,
        can_manage_users: canManageUsers,
        can_be_task_assignee: canBeTaskAssignee,
        is_active: isActive,
      }, { onConflict: 'id' })
      .select()
      .single()

    if (profileError) {
      // Avoid half-created users: rollback Auth user if profile persistence fails.
      await supabaseAdmin.auth.admin.deleteUser(newUserId)
      return new Response(
        JSON.stringify({ error: `Profile upsert failed: ${profileError.message}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({
        success: true,
        user: {
          id: profile.id,
          email: profile.email,
          name: profile.name,
          firstName: profile.first_name,
          lastName: profile.last_name,
          phone: profile.phone,
          role: profile.role,
          departmentScope: profile.department_scope,
          canManageUsers: profile.can_manage_users,
          canBeTaskAssignee: profile.can_be_task_assignee,
          isActive: profile.is_active,
        },
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
