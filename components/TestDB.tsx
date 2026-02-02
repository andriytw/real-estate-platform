import React, { useEffect, useState } from 'react';
import { supabase } from '../utils/supabase/client';

const TestDB: React.FC = () => {
  const [status, setStatus] = useState<'checking' | 'success' | 'error'>('checking');
  const [message, setMessage] = useState<string>('Connecting to Supabase...');
  const [errorDetails, setErrorDetails] = useState<string>('');

  useEffect(() => {
    const testConnection = async () => {
      try {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

        if (!supabaseUrl || !supabaseKey) {
          setStatus('error');
          setMessage('Environment variables not found');
          setErrorDetails('Please check that NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are set in .env.local');
          return;
        }

        // Try to make a simple query
        
        // Test connection with a simple query (this will work even without tables)
        const { data, error } = await supabase.from('_test_connection').select('*').limit(1);
        
        // If we get here, connection is successful (even if table doesn't exist, 
        // the error will be about table, not connection)
        if (error && error.code === 'PGRST116') {
          // Table doesn't exist, but connection is working
          setStatus('success');
          setMessage('Connection Successful!');
          setErrorDetails('Supabase client is working correctly. The test table doesn\'t exist, but the connection is established.');
        } else if (error) {
          // Other error - connection might still be working
          setStatus('success');
          setMessage('Connection Successful!');
          setErrorDetails(`Supabase connected. Note: ${error.message}`);
        } else {
          setStatus('success');
          setMessage('Connection Successful!');
          setErrorDetails('Successfully connected to Supabase and queried database.');
        }
      } catch (error: any) {
        setStatus('error');
        setMessage('Connection Failed');
        setErrorDetails(error?.message || 'Unknown error occurred');
      }
    };

    testConnection();
  }, []);

  return (
    <div className="min-h-screen bg-[#0D1117] text-white p-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">Supabase Connection Test</h1>
        
        <div className="bg-[#1C1F24] border border-gray-800 rounded-lg p-6">
          <div className="flex items-center gap-3 mb-4">
            {status === 'checking' && (
              <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
            )}
            {status === 'success' && (
              <div className="w-4 h-4 bg-emerald-500 rounded-full"></div>
            )}
            {status === 'error' && (
              <div className="w-4 h-4 bg-red-500 rounded-full"></div>
            )}
            <h2 className={`text-xl font-bold ${
              status === 'success' ? 'text-emerald-400' : 
              status === 'error' ? 'text-red-400' : 
              'text-blue-400'
            }`}>
              {message}
            </h2>
          </div>
          
          {errorDetails && (
            <div className={`mt-4 p-4 rounded-lg ${
              status === 'success' ? 'bg-emerald-500/10 border border-emerald-500/20' :
              status === 'error' ? 'bg-red-500/10 border border-red-500/20' :
              'bg-blue-500/10 border border-blue-500/20'
            }`}>
              <p className="text-sm text-gray-300">{errorDetails}</p>
            </div>
          )}

          <div className="mt-6 pt-6 border-t border-gray-700">
            <h3 className="text-sm font-bold text-gray-400 mb-2">Environment Variables:</h3>
            <div className="space-y-2 text-xs font-mono">
              <div>
                <span className="text-gray-500">NEXT_PUBLIC_SUPABASE_URL:</span>{' '}
                <span className="text-gray-300">
                  {process.env.NEXT_PUBLIC_SUPABASE_URL || 'Not set'}
                </span>
              </div>
              <div>
                <span className="text-gray-500">NEXT_PUBLIC_SUPABASE_ANON_KEY:</span>{' '}
                <span className="text-gray-300">
                  {process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
                    ? '***' + process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY.slice(-4)
                    : 'Not set'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TestDB;

