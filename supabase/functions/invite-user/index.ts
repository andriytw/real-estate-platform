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
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    
    console.log('🔧 Edge Function started');
    console.log('📋 Supabase URL:', supabaseUrl ? 'present' : 'MISSING');
    console.log('🔑 Service Role Key:', serviceRoleKey ? 'present' : 'MISSING');
    
    if (!supabaseUrl || !serviceRoleKey) {
      console.error('❌ Missing environment variables!');
      return new Response(
        JSON.stringify({ error: 'Server configuration error: Missing environment variables' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    const supabaseAdmin = createClient(
      supabaseUrl,
      serviceRoleKey,
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
      // Check if user already exists - use direct HTTP request to Admin API
      let existingUserId: string | null = null;
      try {
        const adminApiUrl = `${supabaseUrl.replace('/rest/v1', '')}/auth/v1/admin/users`;
        const listResponse = await fetch(`${adminApiUrl}?per_page=1000`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${serviceRoleKey}`,
            'apikey': serviceRoleKey,
          }
        });
        
        if (listResponse.ok) {
          const usersData = await listResponse.json();
          if (usersData?.users) {
            const existingUser = usersData.users.find((u: any) => u.email === email);
            if (existingUser) {
              existingUserId = existingUser.id;
            }
          }
        }
      } catch (err) {
        console.log('Error checking existing users:', err);
        // Continue to create new user if check fails
      }
      
      if (existingUserId) {
        // User exists, use existing ID
        targetUserId = existingUserId;
      } else {
        // Create new user via invite
        // Only include first_name and last_name in metadata if they are provided and not empty
        const userMetadata: any = {};
        if (firstName && firstName.trim() !== '') {
          userMetadata.first_name = firstName.trim();
        }
        if (lastName && lastName.trim() !== '') {
          userMetadata.last_name = lastName.trim();
        }
        
        // Use direct HTTP request to Admin API instead of JS SDK
        console.log('📧 Attempting to invite user:', email);
        console.log('📝 User metadata:', userMetadata);
        
        const adminApiUrl = `${supabaseUrl.replace('/rest/v1', '')}/auth/v1/admin/users`;
        const inviteResponse = await fetch(`${adminApiUrl}/invite`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${serviceRoleKey}`,
            'apikey': serviceRoleKey,
          },
          body: JSON.stringify({
            email: email,
            data: userMetadata,
            redirect_to: emailRedirectTo || `${supabaseUrl.replace('/rest/v1', '')}/login`
          })
        });

        if (!inviteResponse.ok) {
          const errorText = await inviteResponse.text();
          console.error('❌ Error inviting user:', errorText);
          let errorData;
          try {
            errorData = JSON.parse(errorText);
          } catch {
            errorData = { message: errorText };
          }
          return new Response(
            JSON.stringify({ error: `Failed to invite user: ${errorData.message || errorData.error_description || 'Unknown error'}` }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }
        
        const inviteData = await inviteResponse.json();
        console.log('✅ User invited successfully:', inviteData?.id);
        
        if (!inviteData?.id) {
          return new Response(
            JSON.stringify({ error: 'Failed to create user' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        targetUserId = inviteData.id
      }
    } else {
      // Resend invitation for existing user - use inviteUserByEmail again (it works for existing users too)
      // Only include first_name and last_name in metadata if they are provided and not empty
      const userMetadata: any = {};
      if (firstName && firstName.trim() !== '') {
        userMetadata.first_name = firstName.trim();
      }
      if (lastName && lastName.trim() !== '') {
        userMetadata.last_name = lastName.trim();
      }
      
      // Use direct HTTP request to Admin API instead of JS SDK
      console.log('📧 Attempting to resend invitation to:', email);
      console.log('📝 User metadata:', userMetadata);
      
      const adminApiUrl = `${supabaseUrl.replace('/rest/v1', '')}/auth/v1/admin/users`;
      const inviteResponse = await fetch(`${adminApiUrl}/invite`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${serviceRoleKey}`,
          'apikey': serviceRoleKey,
        },
        body: JSON.stringify({
          email: email,
          data: userMetadata,
          redirect_to: emailRedirectTo || `${supabaseUrl.replace('/rest/v1', '')}/login`
        })
      });

      if (!inviteResponse.ok) {
        const errorText = await inviteResponse.text();
        console.error('❌ Error resending invitation:', errorText);
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          errorData = { message: errorText };
        }
        return new Response(
          JSON.stringify({ error: `Failed to resend invitation: ${errorData.message || errorData.error_description || 'Unknown error'}` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      
      console.log('✅ Invitation resent successfully');
    }

    // Create or update profile (only if userId was not provided or if we have user data)
    // For resend, we might not have all user data, so only update if provided
    if (firstName || lastName || role || department || categoryAccess) {
      const profileData: any = {
        id: targetUserId,
        email: email,
        is_active: true,
      }
      
      // Only set name and first_name/last_name if they are provided and not empty
      if (firstName && firstName.trim() !== '' || lastName && lastName.trim() !== '') {
        const cleanFirstName = firstName && firstName.trim() !== '' ? firstName.trim() : null;
        const cleanLastName = lastName && lastName.trim() !== '' ? lastName.trim() : null;
        
        if (cleanFirstName && cleanLastName) {
          profileData.name = `${cleanFirstName} ${cleanLastName}`;
        } else if (cleanFirstName) {
          profileData.name = cleanFirstName;
        } else if (cleanLastName) {
          profileData.name = cleanLastName;
        } else {
          profileData.name = email; // Fallback to email only if both are empty
        }
        
        profileData.first_name = cleanFirstName;
        profileData.last_name = cleanLastName;
      }
      
      if (role) profileData.role = role
      if (department) profileData.department = department
      if (categoryAccess) profileData.category_access = categoryAccess

      const { data: profile, error: profileError } = await supabaseAdmin
        .from('profiles')
        .upsert(profileData, { onConflict: 'id' })
        .select()
        .single()

      if (profileError) {
        console.error('Error creating/updating profile:', profileError)
        // Don't fail if profile update fails - invitation was sent
        console.warn('Profile update failed, but invitation was sent')
      } else {
        // Return updated profile
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
      }
    }

    // If no profile update needed (resend only), fetch existing profile
    const { data: existingProfile } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('id', targetUserId)
      .single()

    if (existingProfile) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          user: {
            id: existingProfile.id,
            email: existingProfile.email,
            name: existingProfile.name,
            firstName: existingProfile.first_name,
            lastName: existingProfile.last_name,
            role: existingProfile.role,
            department: existingProfile.department,
            categoryAccess: existingProfile.category_access
          }
        }),
        { 
          status: 200, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // If no profile exists, return success anyway (invitation was sent)
    return new Response(
      JSON.stringify({ 
        success: true, 
        user: {
          id: targetUserId,
          email: email
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
