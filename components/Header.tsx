import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Menu, X, User, LogOut } from 'lucide-react';
import { supabase } from '../services/supabase';

const Header: React.FC = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [user, setUser] = useState<any>(null);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    // Check active session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });

    // Listen for changes (login/logout)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    navigate('/');
    setIsMenuOpen(false);
  };
  
  return (
    <header className="sticky top-0 z-50 bg-white border-b border-border">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16 relative z-50">
          {/* Logo */}
          <Link to="/" className="flex flex-col leading-none group">
            <span className="text-xl md:text-2xl font-bold text-secondary tracking-tight flex items-center group-hover:text-primary transition-colors">
              NXF <span className="font-light ml-1 text-primary">Curator</span>
            </span>
          </Link>

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center space-x-6">
            {user ? (
              <>
                <div className="flex items-center text-sm font-medium text-secondary">
                  <User size={16} className="mr-2 text-primary" />
                  <span>{user.user_metadata?.name || user.email}</span>
                </div>
                <button 
                  onClick={handleSignOut}
                  className="flex items-center text-sm font-medium text-text hover:text-red-500 transition-colors"
                >
                  <LogOut size={16} className="mr-1" />
                  Sign Out
                </button>
              </>
            ) : (
              <>
                <Link to="/auth?mode=login" className="text-sm font-medium text-text hover:text-primary transition-colors">
                  Sign In
                </Link>
                <Link to="/auth?mode=register">
                  <button className="bg-primary text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-accent-hover transition-colors shadow-sm">
                    Register
                  </button>
                </Link>
              </>
            )}
          </nav>

          {/* Mobile Menu Button */}
          <button 
            className="md:hidden text-secondary hover:text-primary focus:outline-none p-2"
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            aria-label={isMenuOpen ? "Close menu" : "Open menu"}
          >
            {isMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </div>

      {/* Mobile Nav Overlay */}
      {isMenuOpen && (
        <>
          <div 
            className="fixed inset-0 bg-black/20 z-30 md:hidden backdrop-blur-sm"
            onClick={() => setIsMenuOpen(false)}
          />
          <div className="md:hidden bg-white border-t border-border shadow-xl absolute top-full left-0 w-full z-40 animate-slideDown">
            <div className="px-4 py-6 space-y-4 flex flex-col">
              {user ? (
                <>
                  <div className="block text-base font-bold text-secondary border-b border-gray-100 pb-2 mb-2">
                     Hi, {user.user_metadata?.name || 'Creator'}
                  </div>
                  <button 
                    onClick={handleSignOut}
                    className="flex items-center text-base font-medium text-red-500 hover:text-red-600"
                  >
                    <LogOut size={18} className="mr-2" /> Sign Out
                  </button>
                </>
              ) : (
                <>
                  <Link 
                    to="/auth?mode=login" 
                    onClick={() => setIsMenuOpen(false)}
                    className="block text-base font-medium text-text hover:text-primary"
                  >
                    Sign In
                  </Link>
                  <Link 
                    to="/auth?mode=register" 
                    onClick={() => setIsMenuOpen(false)}
                    className="block w-full text-center bg-primary text-white px-4 py-3 rounded-md font-bold hover:bg-accent-hover"
                  >
                    Register
                  </Link>
                </>
              )}
            </div>
          </div>
        </>
      )}

      <style>{`
        @keyframes slideDown {
          from { opacity: 0; transform: translateY(-10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-slideDown {
          animation: slideDown 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        }
      `}</style>
    </header>
  );
};

export default Header;