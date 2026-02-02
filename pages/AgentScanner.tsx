import React, { useState, useEffect } from 'react';
import { Lock, Sparkles, Save, RefreshCw, CheckCircle, ArrowRight, Clipboard, Database, ShieldAlert, Activity } from 'lucide-react';
import { Link } from 'react-router-dom';
import { aiAgentService } from '../services/AiAgentService';
import { opportunityService } from '../services/OpportunityService';
import { Opportunity } from '../types';
import Button from '../components/Button';

const AgentScanner: React.FC = () => {
  // Auth State
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authEmail, setAuthEmail] = useState('');
  const [authPass, setAuthPass] = useState('');
  const [authError, setAuthError] = useState('');

  // Workflow State
  const [rawText, setRawText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [extractedData, setExtractedData] = useState<Partial<Opportunity> | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [statusMsg, setStatusMsg] = useState('');
  
  // Debug State
  const [debugInfo, setDebugInfo] = useState<any>(null);

  useEffect(() => {
    const token = sessionStorage.getItem('nxf_curator_token');
    if (token === 'verified') {
        setIsAuthenticated(true);
        setDebugInfo(aiAgentService.getDebugInfo());
    }
  }, [isAuthenticated]);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (authEmail === 'nxfindiax@gmail.com' && authPass === 'Ooty2026!"§') {
      setIsAuthenticated(true);
      sessionStorage.setItem('nxf_curator_token', 'verified');
    } else {
      setAuthError('Invalid credentials');
    }
  };

  const processText = async () => {
    if (!rawText.trim()) return;
    setIsProcessing(true);
    setSaveStatus('idle');
    setExtractedData(null);
    setStatusMsg('');
    
    try {
      const data = await aiAgentService.extractOpportunityFromText(rawText);
      setExtractedData(data);
    } catch (e: any) {
      console.error(e);
      setStatusMsg(`AI Error: ${e.message}`);
      setSaveStatus('error');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFieldChange = (field: keyof Opportunity, value: any) => {
    if (!extractedData) return;
    setExtractedData({ ...extractedData, [field]: value });
  };

  const saveToDb = async () => {
    if (!extractedData) return;
    setSaveStatus('saving');
    
    try {
      const result = await opportunityService.createOpportunity(extractedData);
      if (result.success) {
        setSaveStatus('success');
        setStatusMsg('Opportunity Published Successfully!');
        setTimeout(() => {
             setSaveStatus('idle');
             setExtractedData(null);
             setRawText('');
             setStatusMsg('');
        }, 2000);
      } else {
        setSaveStatus('error');
        setStatusMsg(`DB Error: ${result.error}`);
      }
    } catch (e: any) {
        setSaveStatus('error');
        setStatusMsg(`Error: ${e.message}`);
    }
  };

  // --- LOCK SCREEN ---
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-gray-800 rounded-xl shadow-2xl overflow-hidden border border-gray-700">
          <div className="p-8 text-center border-b border-gray-700">
             <div className="w-16 h-16 bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-4">
                 <Lock className="text-primary" size={32} />
             </div>
             <h1 className="text-xl font-bold text-white">Curator Access</h1>
             <p className="text-gray-400 text-sm mt-1">NXF Internal Tools</p>
          </div>
          <form onSubmit={handleLogin} className="p-8 space-y-6">
             {authError && <div className="text-red-400 text-sm text-center">{authError}</div>}
             <input 
                type="email" 
                placeholder="Curator ID" 
                value={authEmail}
                onChange={e => setAuthEmail(e.target.value)}
                className="w-full bg-gray-900 border border-gray-600 text-white rounded p-3 focus:border-primary focus:outline-none"
             />
             <input 
                type="password" 
                placeholder="Passkey" 
                value={authPass}
                onChange={e => setAuthPass(e.target.value)}
                className="w-full bg-gray-900 border border-gray-600 text-white rounded p-3 focus:border-primary focus:outline-none"
             />
             <Button type="submit" fullWidth className="py-3 font-bold">Authenticate</Button>
          </form>
          <div className="p-4 text-center bg-gray-900">
              <Link to="/" className="text-gray-500 text-sm hover:text-white">Return to Home</Link>
          </div>
        </div>
      </div>
    );
  }

  // --- MAIN CURATOR INTERFACE ---
  return (
    <div className="min-h-screen bg-gray-50 text-gray-800 font-sans pb-20">
      
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center sticky top-0 z-10 shadow-sm">
         <div className="flex items-center gap-3">
             <Database className="text-primary" size={24} />
             <h1 className="text-xl font-bold text-gray-900">Manual Curator Workbench</h1>
         </div>
         <div className="flex items-center gap-4">
             <Link to="/" className="text-sm font-medium text-gray-500 hover:text-primary">View Live Site</Link>
             <button onClick={() => { setIsAuthenticated(false); sessionStorage.removeItem('nxf_curator_token'); }} className="text-sm text-red-500 font-medium">Logout</button>
         </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-8 grid lg:grid-cols-2 gap-8 h-[calc(100vh-100px)]">
          
          {/* LEFT: INPUT AREA */}
          <div className="flex flex-col bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden h-full">
              <div className="p-4 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
                  <h2 className="font-bold text-gray-700 flex items-center">
                      <Clipboard size={18} className="mr-2" /> 1. Paste Raw Text
                  </h2>
                  <button 
                    onClick={() => setRawText('')}
                    className="text-xs text-gray-400 hover:text-red-500"
                  >
                    Clear
                  </button>
              </div>
              
              <div className="bg-blue-50 p-2 text-xs text-blue-800 border-b border-blue-100 flex items-center justify-between">
                  <span className="flex items-center"><Activity size={12} className="mr-1"/> System Status:</span>
                  {debugInfo && (
                      <span className="font-mono">
                          Groq: {debugInfo.groqStatus} | Google: {debugInfo.googleKeys > 0 ? 'Ready' : 'Missing Key'}
                      </span>
                  )}
                  <button onClick={() => window.location.reload()} className="hover:underline">Reload</button>
              </div>
              
              <textarea 
                  className="flex-grow p-4 resize-none focus:outline-none text-sm font-mono text-gray-600 leading-relaxed"
                  placeholder="Paste website content, email text, or raw grant details here..."
                  value={rawText}
                  onChange={(e) => setRawText(e.target.value)}
              />

              {saveStatus === 'error' && statusMsg && (
                   <div className="p-3 bg-red-100 border-t border-red-200 text-red-700 text-sm flex items-start">
                       <ShieldAlert size={16} className="mr-2 mt-0.5 flex-shrink-0" />
                       <span className="break-all">{statusMsg}</span>
                   </div>
              )}

              <div className="p-4 border-t border-gray-100 bg-gray-50">
                  <Button 
                    onClick={processText} 
                    disabled={!rawText || isProcessing}
                    fullWidth 
                    className="flex items-center justify-center py-3 text-lg"
                  >
                      {isProcessing ? (
                          <>Processing... <RefreshCw className="animate-spin ml-2" /></>
                      ) : (
                          <>Extract & Format Data <Sparkles className="ml-2" /></>
                      )}
                  </Button>
              </div>
          </div>

          {/* RIGHT: EDITOR & PREVIEW */}
          <div className="flex flex-col bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden h-full">
               <div className="p-4 border-b border-gray-100 bg-gray-50">
                  <h2 className="font-bold text-gray-700 flex items-center">
                      <Save size={18} className="mr-2" /> 2. Review & Publish
                  </h2>
              </div>

              <div className="flex-grow p-6 overflow-y-auto bg-gray-50/50">
                  {!extractedData ? (
                      <div className="h-full flex flex-col items-center justify-center text-gray-400">
                          <ArrowRight size={48} className="mb-4 text-gray-300" />
                          <p>Waiting for data extraction...</p>
                      </div>
                  ) : (
                      <div className="space-y-4">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <FormInput label="Title" value={extractedData.title} onChange={v => handleFieldChange('title', v)} />
                              <FormInput label="Organizer" value={extractedData.organizer} onChange={v => handleFieldChange('organizer', v)} />
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                              <FormInput label="Deadline (Text)" value={extractedData.deadline} onChange={v => handleFieldChange('deadline', v)} />
                              <FormInput label="Deadline (YYYY-MM-DD)" type="date" value={extractedData.deadlineDate} onChange={v => handleFieldChange('deadlineDate', v)} />
                              <FormInput label="Type" value={extractedData.type} onChange={v => handleFieldChange('type', v)} />
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <FormInput label="Prize/Grant" value={extractedData.grantOrPrize} onChange={v => handleFieldChange('grantOrPrize', v)} />
                              <FormInput label="Scope" value={extractedData.scope} onChange={v => handleFieldChange('scope', v)} />
                          </div>

                          <div>
                              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Description</label>
                              <textarea 
                                  className="w-full p-2 border border-gray-300 rounded text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                                  rows={5}
                                  value={extractedData.description || ''}
                                  onChange={(e) => handleFieldChange('description', e.target.value)}
                              />
                          </div>
                          
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                             <FormInput label="Website URL" value={extractedData.contact?.website} onChange={v => handleFieldChange('contact', { ...extractedData.contact, website: v })} />
                             <FormInput label="Application Fee" value={extractedData.applicationFee} onChange={v => handleFieldChange('applicationFee', v)} />
                          </div>
                      </div>
                  )}
              </div>

              <div className="p-4 border-t border-gray-100 bg-white">
                  {saveStatus === 'success' ? (
                      <div className="bg-green-100 text-green-700 p-3 rounded-lg flex items-center justify-center font-bold">
                          <CheckCircle className="mr-2" /> {statusMsg}
                      </div>
                  ) : (
                      <Button 
                        onClick={saveToDb} 
                        disabled={!extractedData || saveStatus === 'saving'}
                        fullWidth 
                        className={`py-3 text-lg ${saveStatus === 'error' ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'}`}
                      >
                          {saveStatus === 'saving' ? 'Publishing...' : 'Publish to Database'}
                      </Button>
                  )}
              </div>
          </div>

      </div>
    </div>
  );
};

// Helper Input Component
const FormInput = ({ label, value, onChange, type = "text" }: any) => (
    <div>
        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">{label}</label>
        <input 
            type={type}
            className="w-full p-2 border border-gray-300 rounded text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none"
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
        />
    </div>
);

export default AgentScanner;