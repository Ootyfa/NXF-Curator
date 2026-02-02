import React, { useState, useEffect } from 'react';
import { Lock, Sparkles, Save, RefreshCw, CheckCircle, ArrowRight, Clipboard, Database, ShieldAlert, Activity, Globe, Search, Link as LinkIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { aiAgentService } from '../services/AiAgentService';
import { opportunityService } from '../services/OpportunityService';
import { webScraperService } from '../services/WebScraperService';
import { supabase } from '../services/supabase';
import { Opportunity } from '../types';
import Button from '../components/Button';

const AgentScanner: React.FC = () => {
  // Auth State
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authEmail, setAuthEmail] = useState('');
  const [authPass, setAuthPass] = useState('');
  const [authError, setAuthError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // Workflow State
  const [urlInput, setUrlInput] = useState('');
  const [rawText, setRawText] = useState('');
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [isFetchingUrl, setIsFetchingUrl] = useState(false);
  
  const [extractedData, setExtractedData] = useState<Partial<Opportunity> | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [statusMsg, setStatusMsg] = useState('');
  
  // Debug State
  const [debugInfo, setDebugInfo] = useState<any>(null);

  useEffect(() => {
    // Check if we have an active Supabase session
    checkSession();
  }, []);

  const checkSession = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
        setIsAuthenticated(true);
        setDebugInfo(aiAgentService.getDebugInfo());
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setIsLoggingIn(true);

    try {
      // 1. Attempt Login
      const { data, error } = await supabase.auth.signInWithPassword({
        email: authEmail,
        password: authPass,
      });

      if (error) {
          // 2. Special Case: Auto-Provisioning for the Dev Account
          if (authEmail === 'nxfindiax@gmail.com' && authPass === 'Ooty2026!"§') {
              console.log("Dev credentials detected. Attempting auto-registration...");
              const { data: upData, error: upError } = await supabase.auth.signUp({
                  email: authEmail,
                  password: authPass,
                  options: { data: { name: 'Admin Curator' } }
              });

              if (upError) {
                  if (upError.message.includes("already registered")) {
                       throw new Error("User exists but login failed. Please check your email for a confirmation link.");
                  }
                  throw upError;
              }

              if (upData.session) {
                  setIsAuthenticated(true);
                  setDebugInfo(aiAgentService.getDebugInfo());
                  return;
              } else if (upData.user) {
                  throw new Error("Admin account created successfully! Please check your email to confirm registration, then log in.");
              }
          }
          
          throw error;
      }

      setIsAuthenticated(true);
      setDebugInfo(aiAgentService.getDebugInfo());
    } catch (err: any) {
      console.error("Login failed:", err);
      let msg = err.message;
      const env = (import.meta as any).env || {};
      if (!env.VITE_SUPABASE_URL || !env.VITE_SUPABASE_ANON_KEY) {
          msg = "Supabase API Keys are missing in Netlify/Environment variables.";
      }
      setAuthError(msg);
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleFetchUrl = async () => {
      if (!urlInput) return;
      setIsFetchingUrl(true);
      setStatusMsg('');
      setSaveStatus('idle');
      
      try {
          const content = await webScraperService.fetchUrlContent(urlInput);
          setRawText(content);
          setStatusMsg('Website content fetched! AI will now use this content.');
      } catch (e: any) {
          setStatusMsg(e.message);
          setSaveStatus('error');
      } finally {
          setIsFetchingUrl(false);
      }
  };

  const processText = async () => {
    if (!rawText.trim() && !urlInput) return;
    setIsProcessing(true);
    setSaveStatus('idle');
    setExtractedData(null);
    setStatusMsg('');
    
    try {
      // Logic: If rawText is empty but URL is present, try fetching it first
      let textToProcess = rawText;
      if (!textToProcess && urlInput) {
           setStatusMsg('Fetching URL content first...');
           try {
               textToProcess = await webScraperService.fetchUrlContent(urlInput);
               setRawText(textToProcess); // show it to user
           } catch (err) {
               console.warn("Could not fetch URL, trying AI with just URL...", err);
           }
      }

      const contextPrefix = urlInput ? `SOURCE URL: ${urlInput}\n\n` : '';
      const finalPrompt = contextPrefix + (textToProcess || `(No content fetched, please extract info from this URL if possible: ${urlInput})`);

      const data = await aiAgentService.extractOpportunityFromText(finalPrompt);
      
      // Merge URL into data if not found
      if (urlInput) {
          if (!data.contact?.website) {
            data.contact = { ...data.contact, website: urlInput } as any;
          }
          data.sourceUrl = urlInput;
      }

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
    setStatusMsg('');
    
    try {
      const result = await opportunityService.createOpportunity(extractedData);
      if (result.success) {
        setSaveStatus('success');
        setStatusMsg('Opportunity Published Successfully!');
        setTimeout(() => {
             setSaveStatus('idle');
             setExtractedData(null);
             setRawText('');
             setUrlInput('');
             setStatusMsg('');
        }, 2000);
      } else {
        setSaveStatus('error');
        // Handle "Load failed" specifically
        if (result.error?.includes("Load failed")) {
            setStatusMsg("DB Connection Failed. Check if an AdBlocker is blocking Supabase or if your network is restricted.");
        } else {
            setStatusMsg(`DB Error: ${result.error}`);
        }
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
             <p className="text-gray-400 text-sm mt-1">Login to enable Database Write Access</p>
          </div>
          <form onSubmit={handleLogin} className="p-8 space-y-6">
             {authError && <div className="text-red-400 text-sm text-center bg-red-900/30 p-2 rounded border border-red-900">{authError}</div>}
             <input 
                type="email" 
                placeholder="Email Address" 
                value={authEmail}
                onChange={e => setAuthEmail(e.target.value)}
                className="w-full bg-gray-900 border border-gray-600 text-white rounded p-3 focus:border-primary focus:outline-none"
             />
             <input 
                type="password" 
                placeholder="Password" 
                value={authPass}
                onChange={e => setAuthPass(e.target.value)}
                className="w-full bg-gray-900 border border-gray-600 text-white rounded p-3 focus:border-primary focus:outline-none"
             />
             <Button type="submit" fullWidth className="py-3 font-bold" disabled={isLoggingIn}>
                {isLoggingIn ? 'Authenticating...' : 'Authenticate'}
             </Button>
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
             <button onClick={async () => { await supabase.auth.signOut(); setIsAuthenticated(false); }} className="text-sm text-red-500 font-medium">Logout</button>
         </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-8 grid lg:grid-cols-2 gap-8 h-[calc(100vh-100px)]">
          
          {/* LEFT: INPUT AREA */}
          <div className="flex flex-col bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden h-full">
              <div className="p-4 border-b border-gray-100 bg-gray-50 flex flex-col gap-2">
                  <div className="flex justify-between items-center mb-2">
                      <h2 className="font-bold text-gray-700 flex items-center">
                          <Globe size={18} className="mr-2 text-primary" /> Source
                      </h2>
                      {debugInfo && (
                        <span className="text-xs text-gray-400 font-mono">
                            Groq: {debugInfo.groqStatus}
                        </span>
                      )}
                  </div>
                  
                  {/* URL Input Row */}
                  <div className="flex gap-2 w-full">
                       <div className="relative flex-grow">
                           <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                               <LinkIcon size={14} className="text-gray-400" />
                           </div>
                           <input 
                              type="text" 
                              placeholder="https://example.com/grant-page" 
                              className="w-full pl-9 p-2 border border-gray-300 rounded text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                              value={urlInput}
                              onChange={(e) => setUrlInput(e.target.value)}
                           />
                       </div>
                       <Button onClick={handleFetchUrl} disabled={!urlInput || isFetchingUrl} variant="secondary" className="px-3">
                           {isFetchingUrl ? <RefreshCw className="animate-spin" size={16} /> : <Search size={16} />}
                       </Button>
                  </div>
                  <p className="text-[10px] text-gray-400">
                      Paste a URL above to auto-fetch, or simply paste raw text below.
                  </p>
              </div>
              
              <div className="flex-grow flex flex-col p-4 overflow-hidden relative">
                  <label className="text-xs font-bold text-gray-500 uppercase mb-2">
                      Raw Content / Scraped Text
                  </label>
                  <textarea 
                      className="flex-grow p-3 border border-gray-200 rounded resize-none focus:outline-none text-sm font-mono text-gray-600 leading-relaxed bg-gray-50"
                      placeholder="Paste text here, or fetch from URL above..."
                      value={rawText}
                      onChange={(e) => setRawText(e.target.value)}
                  />

                  {saveStatus === 'error' && statusMsg && (
                      <div className="mt-3 p-3 bg-red-100 border-t border-red-200 text-red-700 text-sm flex items-start rounded">
                          <ShieldAlert size={16} className="mr-2 mt-0.5 flex-shrink-0" />
                          <span className="break-all">{statusMsg}</span>
                      </div>
                  )}
                  {saveStatus !== 'error' && statusMsg && (
                       <div className="mt-3 p-3 bg-green-100 text-green-700 text-sm flex items-center rounded">
                           <CheckCircle size={16} className="mr-2" /> {statusMsg}
                       </div>
                  )}
              </div>

              <div className="p-4 border-t border-gray-100 bg-gray-50">
                  <Button 
                    onClick={processText} 
                    disabled={(!rawText && !urlInput) || isProcessing}
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
                          
                          {/* New Source URL Field for Manual Override */}
                           <div className="grid grid-cols-1 gap-4">
                             <FormInput label="Source URL (Verification)" value={extractedData.sourceUrl} onChange={v => handleFieldChange('sourceUrl', v)} />
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