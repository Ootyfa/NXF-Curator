import React from 'react';
import { Link } from 'react-router-dom';

const Footer: React.FC = () => {
  return (
    <footer className="bg-white border-t border-gray-200 mt-auto">
      <div className="max-w-4xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex flex-col items-center justify-center space-y-4">
          <div className="flex space-x-8 text-sm font-medium text-gray-600">
            <Link to="/about" className="hover:text-primary transition-colors">About Us</Link>
            <Link to="/privacy" className="hover:text-primary transition-colors">Privacy Policy</Link>
            <Link to="/contact" className="hover:text-primary transition-colors">Contact Us</Link>
            <Link to="/agent" className="hover:text-primary transition-colors text-gray-400">Agent Access</Link>
          </div>
          <p className="text-xs text-gray-400">
            &copy; 2024 NXF Curator. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;