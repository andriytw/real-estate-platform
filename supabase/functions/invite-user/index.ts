// Supabase Edge Function: Invite User
// Sends invitation email to new or existing users using Admin API

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Get Supabase Admin Client (uses service role key from environment)
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )

    // Parse request body
    const { email, firstName, lastName, role, department, categoryAccess, userId, emailRedirectTo } = await req.json()

    if (!email) {
      return new Response(
        JSON.stringify({ error: 'Email is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    let targetUserId = userId

    // If userId not provided, create new user
    if (!targetUserId) {
      // Check if user already exists
      const { data: existingUser } = await supabaseAdmin.auth.admin.getUserByEmail(email)
      
      if (existingUser?.user) {
        // User exists, use existing ID
        targetUserId = existingUser.user.id
      } else {
        // Create new user via invite
        const { data: inviteData, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(
          email,
          {
            data: {
              first_name: firstName || '',
              last_name: lastName || '',
            },
            redirectTo: emailRedirectTo || `${Deno.env.get('SUPABASE_URL')?.replace('/rest/v1', '')}/login`
          }
        )

        if (inviteError) {
          console.error('Error inviting user:', inviteError)
          return new Response(
            JSON.stringify({ error: `Failed to invite user: ${inviteError.message}` }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        if (!inviteData?.user) {
          return new Response(
            JSON.stringify({ error: 'Failed to create user' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        targetUserId = inviteData.user.id
      }
    } else {
      // Resend invitation for existing user
      const { error: resendError } = await supabaseAdmin.auth.admin.generateLink({
        type: 'invite',
        email: email,
        options: {
          redirectTo: emailRedirectTo || `${Deno.env.get('SUPABASE_URL')?.replace('/rest/v1', '')}/login`
        }
      })

      if (resendError) {
        console.error('Error resending invitation:', resendError)
        return new Response(
          JSON.stringify({ error: `Failed to resend invitation: ${resendError.message}` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    }

    // Create or update profile
    const profileData = {
      id: targetUserId,
      email: email,
      name: firstName && lastName ? `${firstName} ${lastName}` : (firstName || lastName || email),
      first_name: firstName || null,
      last_name: lastName || null,
      role: role || 'worker',
      department: department || 'facility',
      category_access: categoryAccess || ['properties', 'facility', 'accounting', 'sales', 'tasks'],
      is_active: true,
    }

    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .upsert(profileData, { onConflict: 'id' })
      .select()
      .single()

    if (profileError) {
      console.error('Error creating/updating profile:', profileError)
      return new Response(
        JSON.stringify({ error: `Failed to create profile: ${profileError.message}` }),
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
          role: profile.role,
          department: profile.department,
          categoryAccess: profile.category_access
        }
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error) {
    console.error('Unexpected error:', error)
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

