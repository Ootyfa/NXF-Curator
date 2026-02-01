import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Menu, X } from 'lucide-react';

const Header: React.FC = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const location = useLocation();

  const isActive = (path: string) => location.pathname === path;
  
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
            <Link to="/auth?mode=login" className="text-sm font-medium text-text hover:text-primary transition-colors">
              Sign In
            </Link>
            <Link to="/auth?mode=register">
              <button className="bg-primary text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-accent-hover transition-colors shadow-sm">
                Register
              </button>
            </Link>
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