
import React, { useEffect, useState } from 'react';
import { useParams, Link, useLocation } from 'react-router-dom';
import { ArrowLeft, Check, Globe, Share2, Bell, Bookmark, FileText, Target, ExternalLink, ShieldCheck, Sparkles, X, Search, CreditCard, Laptop, Facebook, Linkedin, Twitter, Clock, ThumbsUp, ThumbsDown, AlertOctagon, Info, ArrowRight, Heart, Frown, Edit, Save, Hash } from 'lucide-react';
import Button from '../components/Button';
import { opportunityService } from '../services/OpportunityService';
import { supabase } from '../services/supabase';
import { Opportunity } from '../types';

const OpportunityDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const [opportunity, setOpportunity] = useState<Opportunity | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  
  // Edit Mode
  const [editMode, setEditMode] = useState(false);
  const [formData, setFormData] = useState<Partial<Opportunity>>({});
  
  // Interaction States
  const [isSaved, setIsSaved] = useState(false);
  const [toast, setToast] = useState<{ message: string, visible: boolean }>({ message: '', visible: false });
  
  // Voting Logic
  const [voteStep, setVoteStep] = useState<'initial' | 'intent_check' | 'rejection_reason' | 'completed'>('initial');
  const [voteType, setVoteType] = useState<'upvote' | 'downvote' | null>(null);

  // Load Data
  useEffect(() => {
    checkAdmin();
    const loadData = async () => {
      let currentOpp: Opportunity | undefined;
      
      if (location.state?.opportunity) {
        currentOpp = location.state.opportunity;
      } else if (id) {
        currentOpp = await opportunityService.getById(id);
      }

      setOpportunity(currentOpp || null);
      if(currentOpp) {
          setFormData(currentOpp);
          const savedState = localStorage.getItem(`nxf_saved_${currentOpp.id}`);
          setIsSaved(savedState === 'true');
          const storedVote = localStorage.getItem(`nxf_vote_${currentOpp.id}`);
          if(storedVote) setVoteStep('completed');
      }
      setLoading(false);
    };
    loadData();
  }, [id, location.state]);

  const checkAdmin = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if(session) setIsAdmin(true);
  };

  const showToast = (message: string) => {
    setToast({ message, visible: true });
    setTimeout(() => setToast({ message: '', visible: false }), 3000);
  };

  const handleSave = () => {
    const currentId = opportunity?.id;
    if (!currentId) return;
    const newState = !isSaved;
    setIsSaved(newState);
    localStorage.setItem(`nxf_saved_${currentId}`, String(newState));
    showToast(newState ? 'Opportunity saved to your list' : 'Opportunity removed from list');
  };

  const handleShare = async () => {
    if (!opportunity) return;
    if (navigator.share) {
      try {
        await navigator.share({
          title: opportunity.title,
          text: `Check out this opportunity on NXF Curator: ${opportunity.title}`,
          url: window.location.href,
        });
      } catch (err) { /* User cancelled share */ }
    } else {
      await navigator.clipboard.writeText(window.location.href);
      showToast('Link copied to clipboard!');
    }
  };

  const handleAdminSave = async () => {
      if(!id || !opportunity) return;
      await opportunityService.organizerUpdate(id, formData);
      setOpportunity({...opportunity, ...formData} as Opportunity);
      setEditMode(false);
      showToast('Changes saved successfully!');
  };

  const ensureAbsoluteUrl = (url: string) => {
    if (!url) return '';
    if (url.startsWith('http://') || url.startsWith('https://')) return url;
    return `https://${url}`;
  };

  // --- SMART VOTING LOGIC ---

  const handleVoteStart = (type: 'upvote' | 'downvote') => {
      setVoteType(type);
      if (type === 'upvote') {
          setVoteStep('intent_check');
      } else {
          setVoteStep('rejection_reason');
      }
  };

  const submitVote = async (details: { intent?: 'will_apply' | 'maybe', reason?: 'not_relevant' | 'expired' | 'suspicious' | 'not_eligible' }) => {
      if(!opportunity || !voteType) return;
      
      await opportunityService.submitDetailedFeedback(opportunity.id, {
          type: voteType,
          ...details
      });

      localStorage.setItem(`nxf_vote_${opportunity.id}`, voteType);
      setVoteStep('completed');
      
      if (voteType === 'upvote') {
         showToast('Thanks! Saved to your recommendations.');
      } else {
         showToast('Thanks! We will show fewer items like this.');
      }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!opportunity) {
    return (
      <div className="min-h-screen flex items-center justify-center flex-col">
        <h2 className="text-xl font-bold text-secondary mb-4">Opportunity not found</h2>
        <Link to="/"><Button>Back to Home</Button></Link>
      </div>
    );
  }

  const DetailRow = ({ label, value, field }: { label: string, value: React.ReactNode, field?: keyof Opportunity }) => (
    <div className="mb-4">
        <span className="block text-xs font-semibold text-text uppercase tracking-wide mb-1">{label}</span>
        {editMode && field ? (
             <input 
                className="w-full border border-gray-300 rounded p-1 text-sm"
                value={formData[field] as string}
                onChange={e => setFormData({...formData, [field]: e.target.value})}
             />
        ) : (
            <div className="text-secondary font-medium">{value}</div>
        )}
    </div>
  );

  return (
    <div className="min-h-screen bg-background pb-12">
      {/* ADMIN TOOLBAR */}
      {isAdmin && (
          <div className="bg-secondary text-white px-4 py-3 sticky top-16 z-20 flex justify-between items-center shadow-md">
              <div className="flex items-center text-sm font-bold">
                  <ShieldCheck size={16} className="mr-2 text-primary" /> Admin Mode
              </div>
              <div className="flex gap-3">
                  {editMode ? (
                      <>
                        <button onClick={handleAdminSave} className="bg-primary text-white px-4 py-1.5 rounded text-sm hover:bg-accent-hover font-bold flex items-center">
                            <Save size={14} className="mr-2" /> Save Changes
                        </button>
                        <button onClick={() => setEditMode(false)} className="bg-gray-700 text-white px-4 py-1.5 rounded text-sm hover:bg-gray-600">
                            Cancel
                        </button>
                      </>
                  ) : (
                      <button onClick={() => setEditMode(true)} className="bg-white text-secondary px-4 py-1.5 rounded text-sm hover:bg-gray-100 font-bold flex items-center">
                          <Edit size={14} className="mr-2" /> Edit Page
                      </button>
                  )}
              </div>
          </div>
      )}

      <div className="max-w-3xl mx-auto px-4 py-8 sm:px-6">
        
        {/* Navigation */}
        <Link to="/" className="inline-flex items-center text-text hover:text-primary mb-6 transition-colors font-medium text-sm">
          <ArrowLeft size={16} className="mr-2" />
          Back to Opportunities
        </Link>

        {/* Title Section */}
        <div className="bg-white rounded-lg border border-border p-8 mb-6 shadow-card relative">
          <div className="flex flex-col gap-2 mb-4">
             <div className="flex items-center gap-2">
                 <span className="text-primary font-bold text-xs uppercase tracking-wide">{opportunity.type}</span>
                 {opportunity.verificationStatus === 'verified' && (
                    <span className="bg-blue-50 text-blue-700 text-[10px] font-bold px-2 py-0.5 rounded-full border border-blue-100 flex items-center">
                        <ShieldCheck size={10} className="mr-1" /> VERIFIED
                    </span>
                 )}
             </div>
             
             {editMode ? (
                 <input 
                    className="text-3xl font-bold text-secondary w-full border border-gray-300 rounded p-2"
                    value={formData.title}
                    onChange={e => setFormData({...formData, title: e.target.value})}
                 />
             ) : (
                 <h1 className="text-3xl font-bold text-secondary">{opportunity.title}</h1>
             )}
             
             {editMode ? (
                 <input 
                    className="text-lg text-text w-full border border-gray-300 rounded p-2"
                    value={formData.organizer}
                    onChange={e => setFormData({...formData, organizer: e.target.value})}
                 />
             ) : (
                 <p className="text-lg text-text">{opportunity.organizer}</p>
             )}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 border-t border-border pt-6 mt-2">
              <div>
                  <span className="text-xs text-text-light block mb-1">Deadline</span>
                  {editMode ? (
                      <input className="border rounded p-1 w-full text-sm" value={formData.deadline} onChange={e => setFormData({...formData, deadline: e.target.value})} />
                  ) : (
                      <span className={`font-semibold ${opportunity.daysLeft <= 7 ? 'text-urgent' : 'text-secondary'}`}>
                          {opportunity.deadline}
                      </span>
                  )}
              </div>
              <div>
                  <span className="text-xs text-text-light block mb-1">Value</span>
                  {editMode ? (
                      <input className="border rounded p-1 w-full text-sm" value={formData.grantOrPrize} onChange={e => setFormData({...formData, grantOrPrize: e.target.value})} />
                  ) : (
                      <span className="font-semibold text-secondary">{opportunity.grantOrPrize}</span>
                  )}
              </div>
              <div>
                  <span className="text-xs text-text-light block mb-1">Entry Fee</span>
                  <span className="font-semibold text-secondary">{opportunity.applicationFee || 'N/A'}</span>
              </div>
              <div>
                  <span className="text-xs text-text-light block mb-1">Scope</span>
                  <span className="font-semibold text-secondary">{opportunity.scope || 'National'}</span>
              </div>
          </div>
        </div>

        {/* Details Content */}
        <div className="bg-white rounded-lg border border-border p-8 mb-6">
            <h3 className="text-lg font-semibold text-secondary mb-6 border-b border-border pb-2">Opportunity Details</h3>
            
            <div className="grid md:grid-cols-2 gap-8">
                <div>
                     <div className="mb-4">
                        <span className="block text-xs font-semibold text-text uppercase tracking-wide mb-1">Description</span>
                        {editMode ? (
                            <textarea 
                                className="w-full border border-gray-300 rounded p-2 text-sm" 
                                rows={6}
                                value={formData.description}
                                onChange={e => setFormData({...formData, description: e.target.value})}
                            />
                        ) : (
                            <p className="text-sm leading-relaxed">{opportunity.description || "No description provided."}</p>
                        )}
                     </div>
                     <DetailRow label="Category" value={opportunity.category} field="category" />
                     <DetailRow label="Event Dates" value={opportunity.eventDates || "TBD"} field="eventDates" />
                </div>
                <div>
                     <div className="mb-6">
                        <span className="block text-xs font-semibold text-text uppercase tracking-wide mb-3">Eligibility</span>
                        <ul className="space-y-2">
                            {opportunity.eligibility.map((item, idx) => (
                                <li key={idx} className="flex items-start text-sm text-secondary">
                                    <Check size={16} className="text-primary mt-0.5 mr-2 flex-shrink-0" />
                                    {item}
                                </li>
                            ))}
                        </ul>
                     </div>
                     {opportunity.submissionPlatform && (
                         <DetailRow label="Submission Platform" value={opportunity.submissionPlatform} />
                     )}
                </div>
            </div>

            {/* AI Generated Content (Social Media) */}
            {opportunity.instagramCaption && (
                <div className="mt-8 bg-purple-50 p-5 rounded-md border border-purple-100">
                    <div className="flex justify-between items-center mb-2">
                        <span className="flex items-center text-xs font-bold text-purple-700 uppercase tracking-wide">
                            <Hash size={14} className="mr-1" /> AI Generated Social Post
                        </span>
                        <button 
                            onClick={() => {navigator.clipboard.writeText(opportunity.instagramCaption || ''); showToast('Caption copied!');}}
                            className="text-xs text-purple-600 hover:text-purple-800 underline"
                        >
                            Copy Caption
                        </button>
                    </div>
                    <p className="text-sm text-gray-700 italic border-l-2 border-purple-300 pl-3">
                        {opportunity.instagramCaption}
                    </p>
                </div>
            )}
        </div>

        {/* Actions */}
        <div className="mb-8">
             {opportunity.contact?.website && (
              <a 
                href={ensureAbsoluteUrl(opportunity.contact.website)} 
                target="_blank" 
                rel="noopener noreferrer"
                className="block w-full mb-8"
              >
                <Button variant="primary" fullWidth className="py-3 text-base shadow-sm">
                   Visit Website to Apply <ExternalLink size={18} className="ml-2" />
                </Button>
              </a>
            )}

            {/* Voting Widget */}
            <div className="bg-white rounded-lg border border-border p-6 text-center">
                 {voteStep !== 'completed' && (
                    <h4 className="text-sm font-semibold text-secondary mb-4">Is this relevant to you?</h4>
                 )}

                 {voteStep === 'initial' && (
                     <div className="flex justify-center gap-4">
                         <button 
                            onClick={() => handleVoteStart('upvote')}
                            className="flex items-center px-6 py-2 bg-surface border border-border rounded-md text-secondary font-medium hover:border-primary hover:text-primary transition-colors"
                         >
                             <ThumbsUp size={18} className="mr-2" /> Yes
                         </button>
                         <button 
                            onClick={() => handleVoteStart('downvote')}
                            className="flex items-center px-6 py-2 bg-surface border border-border rounded-md text-text hover:border-gray-400 hover:text-secondary transition-colors"
                         >
                             <ThumbsDown size={18} className="mr-2" /> No
                         </button>
                     </div>
                 )}

                 {voteStep === 'intent_check' && (
                     <div className="animate-fadeIn">
                         <p className="text-sm text-text mb-3">Great! Are you planning to apply?</p>
                         <div className="flex flex-wrap justify-center gap-3">
                             <button onClick={() => submitVote({ intent: 'will_apply' })} className="px-4 py-2 bg-primary text-white rounded-md text-sm font-medium hover:bg-accent-hover">Yes, Applying!</button>
                             <button onClick={() => submitVote({ intent: 'maybe' })} className="px-4 py-2 bg-white border border-border text-secondary rounded-md text-sm font-medium hover:bg-surface">Saving for later</button>
                             <button onClick={() => submitVote({})} className="px-4 py-2 text-text text-sm hover:underline">Just browsing</button>
                         </div>
                     </div>
                 )}

                {voteStep === 'rejection_reason' && (
                     <div className="animate-fadeIn">
                         <p className="text-sm text-text mb-3">Why isn't this relevant?</p>
                         <div className="flex flex-wrap justify-center gap-2">
                             {['Wrong Eligibility', 'Deadline Passed', 'Suspicious', 'Not Interested'].map(reason => (
                                 <button 
                                    key={reason}
                                    onClick={() => submitVote({ reason: reason.toLowerCase().replace(' ', '_') as any })}
                                    className="px-3 py-1 bg-white border border-border rounded-full text-xs text-text hover:border-red-300 hover:bg-red-50"
                                 >
                                     {reason}
                                 </button>
                             ))}
                         </div>
                     </div>
                 )}

                 {voteStep === 'completed' && (
                     <div className="flex flex-col items-center animate-fadeIn text-primary">
                         <Heart size={24} className="mb-2 fill-current" />
                         <span className="font-medium">Thanks for your feedback!</span>
                     </div>
                 )}
            </div>

            <div className="flex justify-center mt-6 gap-6">
                <button onClick={handleSave} className="flex items-center text-text hover:text-primary text-sm font-medium transition-colors">
                    <Bookmark size={18} className={`mr-2 ${isSaved ? 'fill-primary text-primary' : ''}`} />
                    {isSaved ? 'Saved' : 'Save for Later'}
                </button>
                <button onClick={handleShare} className="flex items-center text-text hover:text-primary text-sm font-medium transition-colors">
                    <Share2 size={18} className="mr-2" /> Share
                </button>
            </div>
        </div>

      </div>

      {/* Toast */}
      <div 
        className={`fixed bottom-6 left-1/2 transform -translate-x-1/2 bg-secondary text-white px-6 py-3 rounded-md shadow-lg flex items-center space-x-3 transition-all duration-300 z-50 ${
          toast.visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'
        }`}
      >
        <span className="text-sm font-medium">{toast.message}</span>
        <button onClick={() => setToast({ ...toast, visible: false })} className="text-gray-400 hover:text-white">
          <X size={16} />
        </button>
      </div>

       <style>{`
        .animate-fadeIn {
          animation: fadeIn 0.4s ease-out;
        }
        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(5px); }
            to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
};

export default OpportunityDetail;
