import React, { useState } from 'react';
import Button from '../components/Button';
import { Mail, MapPin, Send } from 'lucide-react';

const ContactUs: React.FC = () => {
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    // In a real app, you would send the form data to a backend here
  };

  return (
    <div className="min-h-screen bg-background pb-12">
      <div className="max-w-4xl mx-auto px-4 py-12 sm:px-6">
        <h1 className="text-3xl font-bold text-secondary mb-8 text-center">Contact Us</h1>
        
        <div className="grid md:grid-cols-2 gap-8">
          {/* Contact Info */}
          <div className="bg-white p-8 rounded-lg shadow-sm border border-gray-100 h-fit">
            <h2 className="text-xl font-bold text-secondary mb-6">Get in Touch</h2>
            <div className="space-y-6">
              <div className="flex items-start">
                <Mail className="text-primary mt-1 mr-4 flex-shrink-0" size={20} />
                <div>
                  <h3 className="font-semibold text-gray-800">Email Us</h3>
                  <p className="text-gray-600 text-sm mt-1">
                    General Inquiries:<br />
                    <a href="mailto:hello@nxfcurator.org" className="text-accent hover:text-primary transition-colors">hello@nxfcurator.org</a>
                  </p>
                  <p className="text-gray-600 text-sm mt-2">
                    Support:<br />
                    <a href="mailto:support@nxfcurator.org" className="text-accent hover:text-primary transition-colors">support@nxfcurator.org</a>
                  </p>
                </div>
              </div>
              
              <div className="flex items-start">
                <MapPin className="text-primary mt-1 mr-4 flex-shrink-0" size={20} />
                <div>
                  <h3 className="font-semibold text-gray-800">Location</h3>
                  <p className="text-gray-600 text-sm mt-1">
                    Mumbai, Maharashtra<br />
                    India
                  </p>
                </div>
              </div>

              <div className="mt-8 p-4 bg-gray-50 rounded-md text-sm text-gray-600 border border-gray-100">
                <p><strong>Note:</strong> We are an aggregator platform. For specific questions regarding a grant application or festival submission, please contact the organizers directly via the links provided on the opportunity details page.</p>
              </div>
            </div>
          </div>

          {/* Contact Form */}
          <div className="bg-white p-8 rounded-lg shadow-sm border border-gray-100">
            {submitted ? (
              <div className="text-center py-12 flex flex-col items-center">
                <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mb-4">
                  <Send size={28} />
                </div>
                <h3 className="text-xl font-bold text-gray-800 mb-2">Message Sent!</h3>
                <p className="text-gray-600 mb-6">Thank you for reaching out. Our team will get back to you shortly.</p>
                <Button variant="outline" onClick={() => setSubmitted(false)}>Send another message</Button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <h2 className="text-xl font-bold text-secondary mb-4">Send a Message</h2>
                <div>
                  <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">Your Name</label>
                  <input 
                    type="text" 
                    id="name" 
                    required 
                    className="w-full px-3 py-2 border border-gray-300 rounded shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors" 
                    placeholder="John Doe" 
                  />
                </div>
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
                  <input 
                    type="email" 
                    id="email" 
                    required 
                    className="w-full px-3 py-2 border border-gray-300 rounded shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors" 
                    placeholder="john@example.com" 
                  />
                </div>
                <div>
                  <label htmlFor="subject" className="block text-sm font-medium text-gray-700 mb-1">Subject</label>
                  <input 
                    type="text" 
                    id="subject" 
                    required 
                    className="w-full px-3 py-2 border border-gray-300 rounded shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors" 
                    placeholder="How can we help?" 
                  />
                </div>
                <div>
                  <label htmlFor="message" className="block text-sm font-medium text-gray-700 mb-1">Message</label>
                  <textarea 
                    id="message" 
                    rows={4} 
                    required 
                    className="w-full px-3 py-2 border border-gray-300 rounded shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors resize-none" 
                    placeholder="Your message here..."
                  ></textarea>
                </div>
                <Button type="submit" fullWidth className="mt-2">Send Message</Button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ContactUs;