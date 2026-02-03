import React, { useState, useEffect } from 'react';
import { Lock, FileText, ArrowRight, Save, Database, Trash2, CheckCircle, Clipboard } from 'lucide-react';
import { Link } from 'react-router-dom';
import { supabase } from '../services/supabase';
import { aiAgentService } from '../services/AiAgentService';
import { opportunityService } from '../services/OpportunityService';
import { Opportunity } from '../types';
import Button from '../components/Button';

const AgentScanner: React.FC = () => {
  // Auth
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authEmail, setAuthEmail] = useState('');
  const [authPass, setAuthPass] = useState('');
  const [authError, setAuthError] = useState('');

  // Tool State
  const [rawText, setRawText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [data, setData] = useState<Partial<Opportunity> | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');

  useEffect(() => {
    checkSession();
  }, []);

  const checkSession = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) setIsAuthenticated(true);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    const { error } = await supabase.auth.signInWithPassword({
        email: authEmail,
        password: authPass,
    });
    if (error) {
        setAuthError(error.message);
    } else {
        setIsAuthenticated(true);
    }
  };

  // --- CORE LOGIC ---

  const handleProcess = async () => {
      if (!rawText.trim()) return;
      setIsProcessing(true);
      setSaveStatus('idle');
      
      try {
          // 1. Send text to Service
          const result = await aiAgentService.parseOpportunityText(rawText);
          setData(result);
      } catch (e: any) {
          alert("Error organizing text: " + e.message);
      } finally {
          setIsProcessing(false);
      }
  };

  const handleSave = async () => {
      if (!data) return;
      setSaveStatus('saving');
      
      const res = await opportunityService.createOpportunity(data);
      
      if (res.success) {
          setSaveStatus('success');
          // Reset after delay
          setTimeout(() => {
              setSaveStatus('idle');
              setData(null);
              setRawText('');
          }, 2000);
      } else {
          setSaveStatus('error');
          alert("Database Error: " + res.error);
      }
  };

  const handleFieldChange = (field: keyof Opportunity, value: any) => {
      if (!data) return;
      setData({ ...data, [field]: value });
  };

  // --- LOCK SCREEN ---
  if (!isAuthenticated) {
     return (
        <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
            <div className="max-w-md w-full bg-gray-800 rounded-xl p-8 border border-gray-700">
                <div className="text-center mb-6">
                    <Lock className="text-primary mx-auto mb-4" size={32} />
                    <h1 className="text-xl font-bold text-white">Curator Access</h1>
                </div>
                <form onSubmit={handleLogin} className="space-y-4">
                    {authError && <div className="text-red-400 text-sm bg-red-900/30 p-2 rounded">{authError}</div>}
                    <input type="email" placeholder="Email" value={authEmail} onChange={e=>setAuthEmail(e.target.value)} className="w-full bg-gray-900 border border-gray-600 text-white rounded p-3" />
                    <input type="password" placeholder="Password" value={authPass} onChange={e=>setAuthPass(e.target.value)} className="w-full bg-gray-900 border border-gray-600 text-white rounded p-3" />
                    <Button type="submit" fullWidth>Login</Button>
                </form>
                <Link to="/" className="block text-center text-gray-500 mt-4 text-sm">Return Home</Link>
            </div>
        </div>
     );
  }

  // --- MAIN UI ---
  return (
    <div className="min-h-screen bg-gray-50 text-gray-800 font-sans pb-20">
      
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center sticky top-0 z-10 shadow-sm">
         <div className="flex items-center gap-3">
             <Database className="text-primary" size={24} />
             <h1 className="text-xl font-bold text-gray-900">Curator Tool</h1>
         </div>
         <button onClick={async () => { await supabase.auth.signOut(); setIsAuthenticated(false); }} className="text-sm text-red-500 font-medium">Logout</button>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-8 grid lg:grid-cols-2 gap-8">
          
          {/* LEFT COLUMN: PASTE INPUT */}
          <div className="flex flex-col bg-white rounded-xl shadow-sm border border-gray-200 h-[calc(100vh-150px)]">
              <div className="p-4 border-b border-gray-100 bg-gray-50 flex items-center">
                  <Clipboard size={18} className="text-gray-500 mr-2" />
                  <h2 className="font-bold text-gray-700">1. Paste Raw Text</h2>
              </div>
              
              <div className="flex-grow p-4 flex flex-col">
                  <textarea 
                      className="flex-grow w-full p-4 border border-gray-200 rounded resize-none focus:outline-none focus:border-primary font-mono text-sm bg-gray-50" 
                      placeholder="Paste website content, email text, or PDF summary here..." 
                      value={rawText}
                      onChange={(e) => setRawText(e.target.value)}
                  />
                  <div className="mt-4">
                      <Button 
                        onClick={handleProcess} 
                        fullWidth 
                        disabled={isProcessing || !rawText}
                        className="py-3 text-lg"
                      >
                          {isProcessing ? 'Organizing...' : 'Organize Data'} <ArrowRight size={20} className="ml-2 inline" />
                      </Button>
                  </div>
              </div>
          </div>

          {/* RIGHT COLUMN: STRUCTURED FORM */}
          <div className="flex flex-col bg-white rounded-xl shadow-sm border border-gray-200 h-[calc(100vh-150px)]">
               <div className="p-4 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
                  <div className="flex items-center">
                      <FileText size={18} className="text-gray-500 mr-2" />
                      <h2 className="font-bold text-gray-700">2. Review & Publish</h2>
                  </div>
                  {saveStatus === 'success' && <span className="text-green-600 font-bold flex items-center"><CheckCircle size={16} className="mr-1"/> Saved!</span>}
              </div>

              <div className="flex-grow p-6 overflow-y-auto">
                  {!data ? (
                      <div className="h-full flex flex-col items-center justify-center text-gray-400 opacity-50">
                          <FileText size={64} className="mb-4" />
                          <p>Waiting for text input...</p>
                      </div>
                  ) : (
                      <div className="space-y-4">
                          <div className="grid grid-cols-1 gap-4">
                              <div>
                                  <label className="label">Title</label>
                                  <input type="text" className="input" value={data.title} onChange={e => handleFieldChange('title', e.target.value)} />
                              </div>
                              <div>
                                  <label className="label">Organizer</label>
                                  <input type="text" className="input" value={data.organizer} onChange={e => handleFieldChange('organizer', e.target.value)} />
                              </div>
                              <div className="grid grid-cols-2 gap-4">
                                  <div>
                                      <label className="label">Deadline (Text)</label>
                                      <input type="text" className="input" value={data.deadline} onChange={e => handleFieldChange('deadline', e.target.value)} />
                                  </div>
                                  <div>
                                      <label className="label">Date (YYYY-MM-DD)</label>
                                      <input type="date" className="input" value={data.deadlineDate} onChange={e => handleFieldChange('deadlineDate', e.target.value)} />
                                  </div>
                              </div>
                              <div className="grid grid-cols-2 gap-4">
                                  <div>
                                      <label className="label">Grant / Prize</label>
                                      <input type="text" className="input" value={data.grantOrPrize} onChange={e => handleFieldChange('grantOrPrize', e.target.value)} />
                                  </div>
                                  <div>
                                      <label className="label">Type</label>
                                      <select className="input" value={data.type} onChange={e => handleFieldChange('type', e.target.value)}>
                                          <option value="Grant">Grant</option>
                                          <option value="Residency">Residency</option>
                                          <option value="Festival">Festival</option>
                                          <option value="Lab">Lab</option>
                                      </select>
                                  </div>
                              </div>
                              <div>
                                  <label className="label">Website URL</label>
                                  <input type="text" className="input" value={data.contact?.website} onChange={e => setData({...data, contact: {...data.contact!, website: e.target.value}})} />
                              </div>
                              <div>
                                  <label className="label">Description</label>
                                  <textarea className="input" rows={4} value={data.description} onChange={e => handleFieldChange('description', e.target.value)} />
                              </div>
                          </div>
                      </div>
                  )}
              </div>

              {data && (
                  <div className="p-4 border-t border-gray-100 bg-gray-50 flex gap-3">
                      <Button 
                          onClick={() => setData(null)} 
                          variant="secondary" 
                          className="flex-1 bg-red-100 text-red-600 hover:bg-red-200"
                      >
                          <Trash2 size={18} className="mr-2 inline" /> Discard
                      </Button>
                      <Button 
                          onClick={handleSave} 
                          disabled={saveStatus === 'saving'}
                          className={`flex-[2] ${saveStatus === 'error' ? 'bg-red-600' : 'bg-green-600 hover:bg-green-700'}`}
                      >
                          {saveStatus === 'saving' ? 'Saving...' : 'Publish to Database'}
                          <Save size={18} className="ml-2 inline" />
                      </Button>
                  </div>
              )}
          </div>
      </div>
      
      <style>{`
        .label { display: block; font-size: 0.75rem; font-weight: 700; color: #6B7280; text-transform: uppercase; margin-bottom: 0.25rem; }
        .input { width: 100%; padding: 0.5rem; border: 1px solid #D1D5DB; border-radius: 0.375rem; font-size: 0.875rem; outline: none; transition: border-color 0.2s; }
        .input:focus { border-color: #F59E0B; ring: 1px solid #F59E0B; }
      `}</style>
    </div>
  );
};

export default AgentScanner;
