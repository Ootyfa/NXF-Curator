import React from 'react';

const AboutUs: React.FC = () => {
  return (
    <div className="min-h-screen bg-background pb-12">
      <div className="max-w-4xl mx-auto px-4 py-12 sm:px-6">
        <h1 className="text-3xl font-bold text-secondary mb-6">About NXF Curator</h1>
        <div className="bg-white p-8 rounded-lg shadow-sm border border-gray-100 space-y-6 text-gray-700 leading-relaxed">
          <p>
            Welcome to <strong>NXF Curator</strong> (Next Opportunities for Indian Creators), a curated platform connecting Indian artists with global opportunities across all creative disciplines.
          </p>
          <p>
            In today's fragmented landscape, discovering grants, residencies, festivals, and fellowships is overwhelming. Information is scattered, outdated, and difficult to verify. NXF Curator solves this by aggregating and curating relevant opportunities specifically for Indian creators across Film, Music, Visual Arts, Dance, Literature, and Theatre.
          </p>
          
          <h2 className="text-xl font-bold text-secondary mt-6">Our Mission</h2>
          <p>
            Our mission is to democratize access to creative resources for Indian artists. Every voice deserves a platform, and financial or geographical barriers should not limit creative expression. Through intelligent technology and community feedback, we empower the next generation of Indian creators.
          </p>

          <h2 className="text-xl font-bold text-secondary mt-6">What We Do</h2>
          <ul className="list-disc list-inside space-y-2 ml-2">
            <li><strong>Curated Listings:</strong> We track opportunities worldwide, including grants, residencies, festivals, labs, and competitions open to Indian citizens across all art forms.</li>
            <li><strong>AI-Powered Discovery:</strong> Our algorithms continuously scan the web for new opportunities, ensuring you never miss a deadline.</li>
            <li><strong>Quality Control:</strong> Every listing undergoes review to ensure authenticity and relevance, with a clear distinction between verified postings and AI-discovered opportunities.</li>
            <li><strong>Community Feedback:</strong> Users help improve our AI by rating opportunities, creating a self-correcting system that gets smarter over time.</li>
          </ul>

          <h2 className="text-xl font-bold text-secondary mt-6">Join Our Community</h2>
          <p>
            Whether you're a student creating your first short film, a musician seeking performance grants, a visual artist looking for residencies, or an established creator exploring co-production opportunities, NXF Curator is your companion in the creative journey.
          </p>
        </div>
      </div>
    </div>
  );
};

export default AboutUs;