import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'text';
  fullWidth?: boolean;
}

const Button: React.FC<ButtonProps> = ({ 
  children, 
  variant = 'primary', 
  fullWidth = false, 
  className = '', 
  ...props 
}) => {
  // Radius: rounded-md (6px)
  const baseStyles = "px-6 py-2.5 rounded-md font-medium transition-all duration-200 text-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary";
  
  const variants = {
    // Gold background, white text
    primary: "bg-primary text-white hover:bg-accent-hover border border-transparent",
    // Dark background, white text
    secondary: "bg-secondary text-white hover:bg-gray-800 border border-transparent",
    // Transparent background, Gold border
    outline: "border border-primary text-primary hover:bg-primary hover:text-white",
    // Text only
    text: "text-text hover:text-primary px-0 py-0"
  };

  const widthStyle = fullWidth ? "w-full" : "w-auto";

  return (
    <button 
      className={`${baseStyles} ${variants[variant]} ${widthStyle} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
};

export default Button;