import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { opportunityService } from '../services/OpportunityService';
import { Opportunity } from '../types';
import Button from '../components/Button';
import { CheckCircle, XCircle, Edit, Save, Trash2, ShieldCheck, AlertTriangle } from 'lucide-react';

const OrganizerFeedback: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [opportunity, setOpportunity] = useState<Opportunity | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewState, setViewState] = useState<'review' | 'edit' | 'success_verify' | 'success_remove' | 'success_edit'>('review');
  
  // Edit Form State
  const [formData, setFormData] = useState<Partial<Opportunity>>({});

  useEffect(() => {
    const load = async () => {
      if (!id) return;
      const data = await opportunityService.getById(id);
      setOpportunity(data || null);
      if (data) {
          setFormData({
              title: data.title,
              deadline: data.deadline,
              grantOrPrize: data.grantOrPrize,
              description: data.description,
              organizer: data.organizer
          });
      }
      setLoading(false);
    };
    load();
  }, [id]);

  const handleVerify = async () => {
      if(!id) return;
      await opportunityService.organizerVerify(id);
      setViewState('success_verify');
  };

  const handleRemove = async () => {
      if(!id) return;
      if(confirm("Are you sure you want to remove this listing? It will be taken down immediately.")) {
        await opportunityService.organizerRemove(id);
        setViewState('success_remove');
      }
  };

  const handleUpdate = async (e: React.FormEvent) => {
      e.preventDefault();
      if(!id) return;
      await opportunityService.organizerUpdate(id, formData);
      setViewState('success_edit');
  };

  if (loading) return <div className="p-10 text-center">Loading portal...</div>;
  if (!opportunity) return <div className="p-10 text-center">Invalid Link or Opportunity Not Found.</div>;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center py-12 px-4">
       {/* Logo */}
       <div className="mb-8 text-center">
            <Link to="/" className="text-3xl font-bold text-secondary tracking-tight">
              NXF <span className="font-light">Curator</span>
            </Link>
            <p className="text-sm text-gray-500 mt-2">Organizer Governance Portal</p>
       </div>

       <div className="max-w-2xl w-full bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
           
           {/* Header Stripe */}
           <div className="bg-secondary p-6 text-white">
               <h1 className="text-xl font-bold">Listing Management for "{opportunity.title}"</h1>
           </div>

           <div className="p-8">
               
               {/* VIEW: REVIEW */}
               {viewState === 'review' && (
                   <div className="space-y-6">
                       <div className="bg-blue-50 border border-blue-100 p-4 rounded-lg flex items-start">
                           <ShieldCheck className="text-blue-600 mt-1 mr-3 flex-shrink-0" />
                           <p className="text-sm text-blue-800">
                               We have detected this opportunity and listed it on our platform. 
                               Please verify the details below. As the organizer, you have full control.
                           </p>
                       </div>

                       <div className="grid grid-cols-2 gap-4 text-sm bg-gray-50 p-6 rounded-lg">
                           <div>
                               <span className="block text-gray-500 font-bold mb-1">Title</span>
                               {opportunity.title}
                           </div>
                           <div>
                               <span className="block text-gray-500 font-bold mb-1">Deadline</span>
                               {opportunity.deadline}
                           </div>
                           <div>
                               <span className="block text-gray-500 font-bold mb-1">Prize/Grant</span>
                               {opportunity.grantOrPrize}
                           </div>
                           <div>
                               <span className="block text-gray-500 font-bold mb-1">Description</span>
                               {opportunity.description || "N/A"}
                           </div>
                       </div>

                       <div className="flex flex-col sm:flex-row gap-4 pt-4 border-t border-gray-100">
                           <button onClick={handleVerify} className="flex-1 bg-green-600 hover:bg-green-700 text-white py-3 rounded-lg font-bold flex items-center justify-center transition-colors">
                               <CheckCircle size={18} className="mr-2" /> Verify & Approve
                           </button>
                           <button onClick={() => setViewState('edit')} className="flex-1 bg-white border-2 border-secondary text-secondary hover:bg-gray-50 py-3 rounded-lg font-bold flex items-center justify-center transition-colors">
                               <Edit size={18} className="mr-2" /> Edit Details
                           </button>
                           <button onClick={handleRemove} className="flex-1 bg-red-50 text-red-600 hover:bg-red-100 py-3 rounded-lg font-bold flex items-center justify-center transition-colors">
                               <Trash2 size={18} className="mr-2" /> Remove
                           </button>
                       </div>
                   </div>
               )}

               {/* VIEW: EDIT */}
               {viewState === 'edit' && (
                   <form onSubmit={handleUpdate} className="space-y-4">
                       <div>
                           <label className="block text-sm font-bold text-gray-700 mb-1">Opportunity Title</label>
                           <input 
                                className="w-full border border-gray-300 rounded p-2"
                                value={formData.title} 
                                onChange={e => setFormData({...formData, title: e.target.value})}
                           />
                       </div>
                       <div>
                           <label className="block text-sm font-bold text-gray-700 mb-1">Deadline</label>
                           <input 
                                className="w-full border border-gray-300 rounded p-2"
                                value={formData.deadline} 
                                onChange={e => setFormData({...formData, deadline: e.target.value})}
                           />
                       </div>
                       <div>
                           <label className="block text-sm font-bold text-gray-700 mb-1">Prize / Grant</label>
                           <input 
                                className="w-full border border-gray-300 rounded p-2"
                                value={formData.grantOrPrize} 
                                onChange={e => setFormData({...formData, grantOrPrize: e.target.value})}
                           />
                       </div>
                       <div>
                           <label className="block text-sm font-bold text-gray-700 mb-1">Description</label>
                           <textarea 
                                className="w-full border border-gray-300 rounded p-2"
                                rows={4}
                                value={formData.description} 
                                onChange={e => setFormData({...formData, description: e.target.value})}
                           />
                       </div>
                       <div className="flex gap-4 pt-4">
                           <Button type="submit" fullWidth>Save Changes</Button>
                           <button type="button" onClick={() => setViewState('review')} className="text-gray-500 hover:text-gray-800 px-4">Cancel</button>
                       </div>
                   </form>
               )}

               {/* VIEW: SUCCESS STATES */}
               {viewState === 'success_verify' && (
                   <div className="text-center py-8">
                       <CheckCircle size={64} className="text-green-500 mx-auto mb-4" />
                       <h2 className="text-2xl font-bold text-gray-800 mb-2">Listing Verified!</h2>
                       <p className="text-gray-600">Thank you for confirming. Your listing now has a "Verified by Organizer" badge.</p>
                       <Link to={`/opportunity/${id}`} className="block mt-6 text-primary font-bold hover:underline">View Live Listing</Link>
                   </div>
               )}

               {viewState === 'success_remove' && (
                   <div className="text-center py-8">
                       <div className="bg-red-100 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4">
                            <Trash2 size={32} className="text-red-500" />
                       </div>
                       <h2 className="text-2xl font-bold text-gray-800 mb-2">Listing Removed</h2>
                       <p className="text-gray-600">We have respected your request and removed this opportunity from our public database immediately.</p>
                   </div>
               )}

               {viewState === 'success_edit' && (
                   <div className="text-center py-8">
                       <CheckCircle size={64} className="text-primary mx-auto mb-4" />
                       <h2 className="text-2xl font-bold text-gray-800 mb-2">Updates Published!</h2>
                       <p className="text-gray-600">Our system has automatically updated the listing with your new information.</p>
                       <Link to={`/opportunity/${id}`} className="block mt-6 text-primary font-bold hover:underline">View Updated Listing</Link>
                   </div>
               )}

           </div>
       </div>
    </div>
  );
};

export default OrganizerFeedback;