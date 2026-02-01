import React from 'react';
import { FESTIVALS } from '../constants';
import Button from '../components/Button';
import { MapPin, Calendar, Film } from 'lucide-react';

const Festivals: React.FC = () => {
  return (
    <div className="min-h-screen bg-background pb-12">
      <div className="max-w-4xl mx-auto px-4 py-8 sm:px-6">
        
        <div className="mb-8 border-b border-gray-200 pb-4">
          <div className="flex items-center space-x-2 text-secondary mb-1">
            <Film size={24} className="text-primary" />
            <h1 className="text-2xl font-bold">FILM FESTIVALS FOR INDIAN CREATORS</h1>
          </div>
        </div>

        <div className="space-y-8">
          {FESTIVALS.map((festival) => (
            <div key={festival.id} className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
              <div className="p-6 md:p-8">
                <div className="flex flex-col md:flex-row justify-between md:items-start mb-4">
                  <div>
                    <h2 className="text-xl font-bold text-secondary mb-1">{festival.title}</h2>
                    <div className="flex items-center text-gray-500 text-sm mb-4 md:mb-0">
                      <MapPin size={14} className="mr-1" /> {festival.location}
                      <span className="mx-2">•</span>
                      <Calendar size={14} className="mr-1" /> {festival.dates}
                    </div>
                  </div>
                </div>

                <hr className="border-gray-100 my-4" />

                <div className="grid md:grid-cols-2 gap-4 text-sm text-gray-700">
                  <div className="space-y-2">
                    <p><span className="font-semibold text-gray-500">Submission Deadline:</span> {festival.deadline}</p>
                    <p><span className="font-semibold text-gray-500">Awards:</span> {festival.awards}</p>
                  </div>
                  <div className="space-y-2">
                    <p><span className="font-semibold text-gray-500">Categories:</span> {festival.categories}</p>
                    <p><span className="font-semibold text-gray-500">Fee:</span> {festival.fee}</p>
                  </div>
                </div>

                <div className="mt-6">
                  <Button variant="outline" className="border-accent text-accent hover:bg-accent hover:text-white w-full md:w-auto">
                    View Festival Details
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-12 flex justify-center">
            <Button variant="text" className="text-gray-500 hover:text-accent">View All Festivals</Button>
        </div>

      </div>
    </div>
  );
};

export default Festivals;