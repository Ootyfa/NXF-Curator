import React from 'react';

const PrivacyPolicy: React.FC = () => {
  return (
    <div className="min-h-screen bg-background pb-12">
      <div className="max-w-4xl mx-auto px-4 py-12 sm:px-6">
        <h1 className="text-3xl font-bold text-secondary mb-6">Privacy Policy</h1>
        <div className="bg-white p-8 rounded-lg shadow-sm border border-gray-100 space-y-6 text-gray-700 text-sm leading-relaxed">
          <p className="text-xs text-gray-500 mb-4">Last Updated: March 2024</p>
          
          <p>
            At NXF Curator, we value your privacy and are committed to protecting your personal data. This Privacy Policy explains how we collect, use, and safeguard your information when you visit our website.
          </p>

          <h3 className="text-lg font-bold text-secondary">1. Information We Collect</h3>
          <p>
            We may collect personal information that you voluntarily provide to us when you register for an account, subscribe to our newsletter, or contact us. This may include your name, email address, and professional details (e.g., filmmaker portfolio links).
          </p>

          <h3 className="text-lg font-bold text-secondary">2. How We Use Your Information</h3>
          <p>
            We use the information we collect to:
          </p>
          <ul className="list-disc list-inside ml-2 space-y-1">
            <li>Provide, operate, and maintain our website.</li>
            <li>Send you updates, newsletters, and opportunity alerts relevant to your interests (only if you opt-in).</li>
            <li>Improve user experience and analyze website traffic patterns.</li>
            <li>Verify your identity for accessing exclusive features.</li>
          </ul>

          <h3 className="text-lg font-bold text-secondary">3. Data Security</h3>
          <p>
            We implement appropriate technical and organizational security measures to protect your personal information from unauthorized access, disclosure, alteration, or destruction. However, please note that no method of transmission over the Internet is 100% secure.
          </p>

          <h3 className="text-lg font-bold text-secondary">4. Third-Party Links</h3>
          <p>
            Our website contains links to third-party websites (e.g., film festival submission pages, grant application portals). We are not responsible for the privacy practices or content of these external sites. We encourage you to review their privacy policies before providing any personal data.
          </p>

          <h3 className="text-lg font-bold text-secondary">5. Cookies</h3>
          <p>
            We use cookies to enhance your experience on our site. You can choose to disable cookies through your browser settings, though this may affect your ability to use certain features of the website.
          </p>

          <h3 className="text-lg font-bold text-secondary">6. Contact Us</h3>
          <p>
            If you have any questions about this Privacy Policy, please contact us at <a href="mailto:privacy@nxfcurator.org" className="text-primary hover:underline">privacy@nxfcurator.org</a>.
          </p>
        </div>
      </div>
    </div>
  );
};

export default PrivacyPolicy;