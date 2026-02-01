import React, { useEffect, useState } from 'react';
import { useSearchParams, Link, useNavigate } from 'react-router-dom';
import Button from '../components/Button';
import { supabase } from '../services/supabase';
import { AlertCircle, CheckCircle } from 'lucide-react';

const Auth: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const initialMode = searchParams.get('mode') === 'register' ? 'register' : 'login';
  const [mode, setMode] = useState<'login' | 'register'>(initialMode);
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    setMode(searchParams.get('mode') === 'register' ? 'register' : 'login');
    setError(null);
    setSuccessMsg(null);

    // Handle Supabase Auth Redirects
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN') {
        navigate('/');
      }
    });

    // Check for errors in the URL hash
    const hash = window.location.hash;
    if (hash && hash.includes('error=')) {
      const params = new URLSearchParams(hash.substring(1));
      const errDesc = params.get('error_description');
      const errCode = params.get('error_code');
      if (errDesc) {
        setError(decodeURIComponent(errDesc.replace(/\+/g, ' ')));
      } else if (errCode) {
         setError(`Authentication error: ${errCode}`);
      }
    }

    return () => subscription.unsubscribe();
  }, [searchParams, navigate]);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccessMsg(null);

    try {
      if (mode === 'register') {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              name: fullName,
            },
          },
        });
        
        if (error) throw error;

        // IMMEDIATE LOGIN CHECK:
        // If "Confirm email" is disabled in Supabase, data.session will be present.
        // We can redirect immediately.
        if (data.session) {
          navigate('/');
        } else {
          // If no session, the server requires email confirmation.
          setSuccessMsg("Registration successful! Please check your email to verify your account.");
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        navigate('/'); // Redirect to home on success
      }
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
        
        {/* Header */}
        <div className="bg-primary/10 p-6 text-center border-b border-primary/20">
          <h2 className="text-xl font-bold text-secondary uppercase tracking-wide">
            {mode === 'login' ? 'Welcome Back' : 'Create Account'}
          </h2>
        </div>

        <div className="p-8">
          
          {error && (
            <div className="mb-4 bg-red-50 text-red-600 p-3 rounded-md text-sm flex items-start break-words">
              <AlertCircle size={16} className="mt-0.5 mr-2 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {successMsg && (
            <div className="mb-4 bg-green-50 text-green-700 p-3 rounded-md text-sm flex items-start">
              <CheckCircle size={16} className="mt-0.5 mr-2 flex-shrink-0" />
              {successMsg}
            </div>
          )}

          <form className="space-y-6" onSubmit={handleAuth}>
            
            {mode === 'register' && (
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
                <input 
                  id="name" 
                  name="name" 
                  type="text" 
                  required 
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded shadow-sm placeholder-gray-400 focus:outline-none focus:ring-primary focus:border-primary sm:text-sm"
                  placeholder="John Doe"
                />
              </div>
            )}

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
              <input 
                id="email" 
                name="email" 
                type="email" 
                required 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded shadow-sm placeholder-gray-400 focus:outline-none focus:ring-primary focus:border-primary sm:text-sm"
                placeholder="you@example.com"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <input 
                id="password" 
                name="password" 
                type="password" 
                required 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded shadow-sm placeholder-gray-400 focus:outline-none focus:ring-primary focus:border-primary sm:text-sm"
                placeholder="••••••••"
              />
            </div>

            {mode === 'register' && (
              <div className="flex items-center">
                <input 
                  id="alerts" 
                  name="alerts" 
                  type="checkbox" 
                  className="h-4 w-4 text-primary focus:ring-primary border-gray-300 rounded"
                />
                <label htmlFor="alerts" className="ml-2 block text-sm text-gray-600">
                  I want to receive opportunity alerts
                </label>
              </div>
            )}

            <div>
              <Button type="submit" fullWidth variant="primary" disabled={loading}>
                {loading ? 'Processing...' : (mode === 'login' ? 'Sign In' : 'Register')}
              </Button>
            </div>
          </form>

          <div className="mt-6 text-center text-sm">
            {mode === 'login' ? (
              <>
                <p className="text-gray-600">
                  New user? <Link to="/auth?mode=register" onClick={() => setMode('register')} className="font-medium text-accent hover:text-primary">Create Account</Link>
                </p>
              </>
            ) : (
              <p className="text-gray-600">
                Already have an account? <Link to="/auth?mode=login" onClick={() => setMode('login')} className="font-medium text-accent hover:text-primary">Sign In</Link>
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Auth;