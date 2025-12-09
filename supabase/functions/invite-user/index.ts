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
    // Try both SUPABASE_SERVICE_ROLE_KEY (system) and SERVICE_ROLE_KEY (editable) for flexibility
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceRoleKey = Deno.env.get('SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    
    console.log('🔧 Edge Function started');
    console.log('📋 Supabase URL:', supabaseUrl ? 'present' : 'MISSING');
    console.log('📋 Supabase URL value:', supabaseUrl);
    console.log('🔑 Service Role Key:', serviceRoleKey ? 'present' : 'MISSING');
    console.log('🔑 Service Role Key length:', serviceRoleKey.length);
    console.log('🔑 Service Role Key first 30 chars:', serviceRoleKey.substring(0, 30));
    console.log('🔑 Service Role Key is JWT (starts with eyJ):', serviceRoleKey.startsWith('eyJ'));
    
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
    const requestBody = await req.json();
    const { email, firstName, lastName, role, department, categoryAccess, userId, emailRedirectTo, skipInvite } = requestBody;
    
    console.log('📥 Request body received:', {
      email,
      firstName: firstName ? `"${firstName}"` : 'undefined/null',
      lastName: lastName ? `"${lastName}"` : 'undefined/null',
      role,
      department,
      skipInvite
    });

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
        // Build correct Admin API URL
        let baseUrl = supabaseUrl.trim();
        if (baseUrl.includes('/rest/v1')) {
          baseUrl = baseUrl.replace('/rest/v1', '');
        }
        baseUrl = baseUrl.replace(/\/+$/, '');
        if (!baseUrl.startsWith('http')) {
          baseUrl = `https://${baseUrl}`;
        }
        const adminApiUrl = `${baseUrl}/auth/v1/admin/users`;
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
        // Only include first_name and last_name in metadata if they are provided and not empty
        const userMetadata: any = {};
        if (firstName && firstName.trim() !== '') {
          userMetadata.first_name = firstName.trim();
        }
        if (lastName && lastName.trim() !== '') {
          userMetadata.last_name = lastName.trim();
        }
        
        // Build correct Admin API URL
        let baseUrl = supabaseUrl.trim();
        if (baseUrl.includes('/rest/v1')) {
          baseUrl = baseUrl.replace('/rest/v1', '');
        }
        baseUrl = baseUrl.replace(/\/+$/, '');
        if (!baseUrl.startsWith('http')) {
          baseUrl = `https://${baseUrl}`;
        }
        const adminApiUrl = `${baseUrl}/auth/v1/admin/users`;
        
        if (skipInvite) {
          // Create user without sending invitation using JS SDK (works with both new sb_secret and legacy JWT keys)
          console.log('👤 Creating user without invitation:', email);
          console.log('📝 User metadata:', userMetadata);
          console.log('📋 Request body firstName:', firstName);
          console.log('📋 Request body lastName:', lastName);
          
          // Generate a random temporary password (user won't use it, will set via invitation)
          // Using crypto.getRandomValues for Deno compatibility
          const randomBytes = new Uint8Array(32);
          crypto.getRandomValues(randomBytes);
          const tempPassword = Array.from(randomBytes, byte => byte.toString(16).padStart(2, '0')).join('');
          
          console.log('🔧 Using JS SDK createUser (supports both new sb_secret and legacy JWT keys)');
          
          // Use JS SDK createUser method - this works with both new sb_secret and legacy JWT keys
          const { data: createData, error: createError } = await supabaseAdmin.auth.admin.createUser({
            email: email,
            user_metadata: userMetadata,
            email_confirm: false, // User needs to confirm email and set password via invitation later
            password: tempPassword, // Long random password
          });

          if (createError) {
            console.error('❌ Error creating user with JS SDK:', createError);
            console.error('❌ Error details:', JSON.stringify(createError, null, 2));
            return new Response(
              JSON.stringify({ 
                error: `Failed to create user: ${createError.message || 'Unknown error'}`,
                details: createError
              }),
              { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
          }
          
          if (!createData?.user?.id) {
            console.error('❌ No user ID in JS SDK response:', JSON.stringify(createData));
            return new Response(
              JSON.stringify({ error: 'Failed to create user: No user ID returned from JS SDK' }),
              { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
          }

          console.log('✅ User created successfully (no invitation) via JS SDK:', createData.user.id);
          targetUserId = createData.user.id
        } else {
          // Create new user via invite using JS SDK
          console.log('📧 Attempting to invite user:', email);
          console.log('📝 User metadata:', userMetadata);
          
          const { data: inviteData, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
            data: userMetadata,
            redirectTo: emailRedirectTo || `${baseUrl}/login`
          });

          if (inviteError) {
            console.error('❌ Error inviting user with JS SDK:', inviteError);
            return new Response(
              JSON.stringify({ error: `Failed to invite user: ${inviteError.message || 'Unknown error'}` }),
              { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
          }
          
          if (!inviteData?.user?.id) {
            console.error('❌ No user ID in JS SDK invite response:', JSON.stringify(inviteData));
            return new Response(
              JSON.stringify({ error: 'Failed to create user: No user ID returned from JS SDK' }),
              { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
          }

          console.log('✅ User invited successfully via JS SDK:', inviteData.user.id);
          targetUserId = inviteData.user.id
          
          // Update last_invite_sent_at after successful invitation
          try {
            await supabaseAdmin
              .from('profiles')
              .update({ last_invite_sent_at: new Date().toISOString() })
              .eq('id', targetUserId);
            console.log('✅ Updated last_invite_sent_at for user:', targetUserId);
          } catch (updateError) {
            console.error('⚠️ Failed to update last_invite_sent_at:', updateError);
            // Don't fail the request if this update fails
          }
        }
      }
    } else {
      // Resend invitation for existing user
      // For existing users, we need to use generateLink with type 'invite' or 'recovery'
      // Only include first_name and last_name in metadata if they are provided and not empty
      const userMetadata: any = {};
      if (firstName && firstName.trim() !== '') {
        userMetadata.first_name = firstName.trim();
      }
      if (lastName && lastName.trim() !== '') {
        userMetadata.last_name = lastName.trim();
      }
      
      // Use JS SDK to resend invitation
      console.log('📧 Attempting to resend invitation to:', email);
      console.log('📝 User metadata:', userMetadata);
      
      // Build correct redirect URL
      let baseUrl = supabaseUrl.trim();
      if (baseUrl.includes('/rest/v1')) {
        baseUrl = baseUrl.replace('/rest/v1', '');
      }
      baseUrl = baseUrl.replace(/\/+$/, '');
      if (!baseUrl.startsWith('http')) {
        baseUrl = `https://${baseUrl}`;
      }
      
      // For existing users, try to generate an invite link
      // First, check if user exists and get their ID
      let existingUser: any = null;
      try {
        console.log('🔍 Checking if user exists in auth system...');
        const { data: usersData, error: listError } = await supabaseAdmin.auth.admin.listUsers();
        
        if (listError) {
          console.error('❌ Error listing users:', listError);
        } else {
          console.log('📋 Total users found:', usersData?.users?.length || 0);
          if (usersData?.users) {
            existingUser = usersData.users.find((u: any) => u.email?.toLowerCase() === email.toLowerCase());
            if (existingUser) {
              console.log('✅ User found in auth system:', existingUser.id, existingUser.email);
            } else {
              console.log('⚠️ User not found in auth system, will try to create new user');
            }
          }
        }
      } catch (err) {
        console.error('❌ Error checking existing users:', err);
      }
      
      if (existingUser) {
        // User exists - use generateLink with type 'invite' to create invitation link
        // generateLink automatically sends the email
        console.log('👤 User exists, generating invite link for:', existingUser.id);
        
        const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
          type: 'invite',
          email: email,
          options: {
            data: userMetadata,
            redirectTo: emailRedirectTo || `${baseUrl}/login`
          }
        });

        if (linkError) {
          console.error('❌ Error generating invite link:', linkError);
          console.error('❌ Link error details:', JSON.stringify(linkError, null, 2));
          return new Response(
            JSON.stringify({ error: `Failed to generate invite link: ${linkError.message || 'Unknown error'}` }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }
        
        console.log('✅ Invite link generated successfully, email should be sent automatically');
        console.log('📧 Link data:', JSON.stringify(linkData, null, 2));
        targetUserId = existingUser.id;
      } else {
        // User doesn't exist in auth - try inviteUserByEmail (creates new user)
        console.log('👤 User not found in auth, attempting to create new user with invitation');
        
        const { data: inviteData, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
          data: userMetadata,
          redirectTo: emailRedirectTo || `${baseUrl}/login`
        });

        if (inviteError) {
          console.error('❌ Error creating user with invitation:', inviteError);
          console.error('❌ Invite error details:', JSON.stringify(inviteError, null, 2));
          
          // If user already exists error, try generateLink instead
          if (inviteError.message?.includes('already been registered') || inviteError.message?.includes('already registered')) {
            console.log('🔄 User already registered, trying generateLink instead...');
            
            // Try to get user by email using listUsers with filter
            try {
              const { data: usersData, error: listError } = await supabaseAdmin.auth.admin.listUsers();
              if (!listError && usersData?.users) {
                const foundUser = usersData.users.find((u: any) => u.email?.toLowerCase() === email.toLowerCase());
                if (foundUser) {
                  console.log('✅ Found user after error, generating invite link:', foundUser.id);
                  
                  const { data: linkData, error: linkError2 } = await supabaseAdmin.auth.admin.generateLink({
                    type: 'invite',
                    email: email,
                    options: {
                      data: userMetadata,
                      redirectTo: emailRedirectTo || `${baseUrl}/login`
                    }
                  });

                  if (linkError2) {
                    console.error('❌ Error generating invite link (retry):', linkError2);
                    return new Response(
                      JSON.stringify({ error: `Failed to generate invite link: ${linkError2.message || 'Unknown error'}` }),
                      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                    )
                  }
                  
                  console.log('✅ Invite link generated successfully (retry)');
                  targetUserId = foundUser.id;
                } else {
                  return new Response(
                    JSON.stringify({ error: `User with email ${email} already exists but could not be found` }),
                    { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                  )
                }
              } else {
                return new Response(
                  JSON.stringify({ error: `Failed to resend invitation: ${inviteError.message || 'Unknown error'}` }),
                  { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                )
              }
            } catch (retryErr) {
              console.error('❌ Error in retry logic:', retryErr);
              return new Response(
                JSON.stringify({ error: `Failed to resend invitation: ${inviteError.message || 'Unknown error'}` }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
              )
            }
          } else {
            return new Response(
              JSON.stringify({ error: `Failed to resend invitation: ${inviteError.message || 'Unknown error'}` }),
              { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
          }
        } else {
          console.log('✅ Invitation sent successfully via JS SDK (new user)');
          targetUserId = inviteData?.user?.id || targetUserId;
        }
      }
      
      // Update last_invite_sent_at after successful resend
      if (targetUserId) {
        try {
          await supabaseAdmin
            .from('profiles')
            .update({ last_invite_sent_at: new Date().toISOString() })
            .eq('id', targetUserId);
          console.log('✅ Updated last_invite_sent_at for user:', targetUserId);
        } catch (updateError) {
          console.error('⚠️ Failed to update last_invite_sent_at:', updateError);
          // Don't fail the request if this update fails
        }
      }
    }

    // Create or update profile (only if userId was not provided or if we have user data)
    // For resend, we might not have all user data, so only update if provided
    if (firstName || lastName || role || department || categoryAccess) {
      // Validate and clean firstName/lastName - ensure email is NOT saved as first_name
      const cleanFirstName = firstName && typeof firstName === 'string' && firstName.trim() !== '' && firstName.trim() !== email 
        ? firstName.trim() 
        : null;
      const cleanLastName = lastName && typeof lastName === 'string' && lastName.trim() !== '' && lastName.trim() !== email
        ? lastName.trim()
        : null;
      
      console.log('📝 Preparing profile data:');
      console.log('  - cleanFirstName:', cleanFirstName);
      console.log('  - cleanLastName:', cleanLastName);
      console.log('  - email:', email);
      console.log('  - role:', role);
      console.log('  - department:', department);
      
      // Validate that email is not being saved as first_name
      if (cleanFirstName === email || cleanLastName === email) {
        console.error('❌ CRITICAL: Email detected in firstName or lastName! Preventing save.');
        console.error('  - firstName:', firstName);
        console.error('  - lastName:', lastName);
        console.error('  - email:', email);
      }
      
      const profileData: any = {
        id: targetUserId,
        email: email,
        is_active: true,
      }
      
      // Only set name and first_name/last_name if they are valid (not email, not empty)
      if (cleanFirstName || cleanLastName) {
        if (cleanFirstName && cleanLastName) {
          profileData.name = `${cleanFirstName} ${cleanLastName}`;
        } else if (cleanFirstName) {
          profileData.name = cleanFirstName;
        } else if (cleanLastName) {
          profileData.name = cleanLastName;
        } else {
          profileData.name = email; // Fallback to email only if both are empty
        }
        
        // Only set first_name/last_name if they are valid (not email)
        if (cleanFirstName && cleanFirstName !== email) {
          profileData.first_name = cleanFirstName;
        }
        if (cleanLastName && cleanLastName !== email) {
          profileData.last_name = cleanLastName;
        }
      }
      
      if (role) profileData.role = role
      if (department) profileData.department = department
      if (categoryAccess) profileData.category_access = categoryAccess

      console.log('💾 Profile data to save:', JSON.stringify(profileData, null, 2));

      const { data: profile, error: profileError } = await supabaseAdmin
        .from('profiles')
        .upsert(profileData, { onConflict: 'id' })
        .select()
        .single()

      if (profileError) {
        console.error('❌ Error creating/updating profile:', profileError)
        // Don't fail if profile update fails - invitation was sent
        console.warn('⚠️ Profile update failed, but user was created')
      } else {
        console.log('✅ Profile saved successfully:', {
          id: profile.id,
          email: profile.email,
          first_name: profile.first_name,
          last_name: profile.last_name,
          name: profile.name
        });
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
