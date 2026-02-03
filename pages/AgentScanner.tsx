import React, { useState, useEffect, useRef } from 'react';
import { Lock, Sparkles, Save, RefreshCw, CheckCircle, ArrowRight, Clipboard, Database, ShieldAlert, Activity, Globe, Search, Link as LinkIcon, Terminal as TerminalIcon, Bot } from 'lucide-react';
import { Link } from 'react-router-dom';
import { aiAgentService } from '../services/AiAgentService';
import { opportunityService } from '../services/OpportunityService';
import { webScraperService } from '../services/WebScraperService';
import { supabase } from '../services/supabase';
import { Opportunity } from '../types';
import Button from '../components/Button';

// Types for Terminal Logs
interface AgentLog {
    message: string;
    type: 'info' | 'success' | 'error' | 'action';
    timestamp: string;
}

const AgentScanner: React.FC = () => {
  // Auth State
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authEmail, setAuthEmail] = useState('');
  const [authPass, setAuthPass] = useState('');
  const [authError, setAuthError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // Mode State
  const [mode, setMode] = useState<'manual' | 'auto'>('manual');

  // Manual Workflow State
  const [urlInput, setUrlInput] = useState('');
  const [rawText, setRawText] = useState('');
  
  // Auto Workflow State
  const [scanTopic, setScanTopic] = useState('');
  const [logs, setLogs] = useState<AgentLog[]>([]);
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [extractedData, setExtractedData] = useState<Partial<Opportunity> | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [statusMsg, setStatusMsg] = useState('');
  
  const [debugInfo, setDebugInfo] = useState<any>(null);
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    checkSession();
  }, []);

  useEffect(() => {
      // Auto-scroll logs
      logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const checkSession = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
        setIsAuthenticated(true);
        setDebugInfo(aiAgentService.getDebugInfo());
    }
  };

  const addLog = (msg: string, type: AgentLog['type'] = 'info') => {
      setLogs(prev => [...prev, { message: msg, type, timestamp: new Date().toLocaleTimeString() }]);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setIsLoggingIn(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: authEmail,
        password: authPass,
      });

      if (error) {
          // Dev Account Backdoor/Auto-provision
          if (authEmail === 'nxfindiax@gmail.com' && authPass === 'Ooty2026!"§') {
              const { data: upData, error: upError } = await supabase.auth.signUp({
                  email: authEmail,
                  password: authPass,
                  options: { data: { name: 'Admin Curator' } }
              });
              if (upData.session) {
                  setIsAuthenticated(true);
                  setDebugInfo(aiAgentService.getDebugInfo());
                  return;
              }
          }
          throw error;
      }
      setIsAuthenticated(true);
      setDebugInfo(aiAgentService.getDebugInfo());
    } catch (err: any) {
      setAuthError(err.message || "Authentication failed");
    } finally {
      setIsLoggingIn(false);
    }
  };

  // --- MANUAL ACTIONS ---
  const handleFetchUrl = async () => {
      if (!urlInput) return;
      setIsProcessing(true);
      setSaveStatus('idle');
      setExtractedData(null);
      
      try {
          // Use Agent's logic which combines scrape + analyze
          const data = await aiAgentService.analyzeSpecificUrl(urlInput);
          setExtractedData(data);
          setStatusMsg('Data extracted successfully from URL.');
      } catch (e: any) {
          setStatusMsg(e.message);
          setSaveStatus('error');
      } finally {
          setIsProcessing(false);
      }
  };

  const processManualText = async () => {
      if (!rawText) return;
      setIsProcessing(true);
      setSaveStatus('idle');
      try {
          const data = await aiAgentService.extractOpportunityFromText(rawText, urlInput);
          setExtractedData(data);
      } catch(e: any) {
          setStatusMsg(e.message);
          setSaveStatus('error');
      } finally {
          setIsProcessing(false);
      }
  };

  // --- AUTO ACTIONS ---
  const handleAutoScan = async () => {
      if (!scanTopic) return;
      setIsProcessing(true);
      setLogs([]); // Clear logs
      setExtractedData(null);
      setSaveStatus('idle');

      try {
          addLog(`Starting scan for: ${scanTopic}`, 'action');
          
          const opportunities = await aiAgentService.scanWeb(scanTopic, (log) => {
              addLog(log.message, log.type);
          });

          if (opportunities.length > 0) {
              setExtractedData(opportunities[0]); // Load the first one into editor
              addLog(`Loaded "${opportunities[0].title}" into editor for review.`, 'success');
              if (opportunities.length > 1) {
                  addLog(`(Note: ${opportunities.length - 1} other items found but only showing first one)`, 'info');
              }
          } else {
              addLog("Scan finished but found no valid opportunities.", 'error');
          }

      } catch (e: any) {
          addLog(`Critical Error: ${e.message}`, 'error');
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
        setStatusMsg('Published!');
        // Reset after delay
        setTimeout(() => {
             setSaveStatus('idle');
             setExtractedData(null);
             if(mode === 'manual') {
                setRawText('');
                setUrlInput('');
             }
        }, 2000);
      } else {
        setSaveStatus('error');
        if (result.error?.includes("Load failed")) {
            setStatusMsg("DB Connection Blocked (AdBlocker?)");
        } else {
            setStatusMsg(`DB Error: ${result.error}`);
        }
      }
    } catch (e: any) {
        setSaveStatus('error');
        setStatusMsg(`Error: ${e.message}`);
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
        {/* Same Lock Screen as before */}
        <div className="max-w-md w-full bg-gray-800 rounded-xl p-8 border border-gray-700">
             <div className="text-center mb-6">
                 <Lock className="text-primary mx-auto mb-4" size={32} />
                 <h1 className="text-xl font-bold text-white">Curator Access</h1>
             </div>
             <form onSubmit={handleLogin} className="space-y-4">
                 {authError && <div className="text-red-400 text-sm bg-red-900/30 p-2 rounded">{authError}</div>}
                 <input type="email" placeholder="Email" value={authEmail} onChange={e=>setAuthEmail(e.target.value)} className="w-full bg-gray-900 border border-gray-600 text-white rounded p-3" />
                 <input type="password" placeholder="Password" value={authPass} onChange={e=>setAuthPass(e.target.value)} className="w-full bg-gray-900 border border-gray-600 text-white rounded p-3" />
                 <Button type="submit" fullWidth disabled={isLoggingIn}>{isLoggingIn ? '...' : 'Login'}</Button>
             </form>
             <Link to="/" className="block text-center text-gray-500 mt-4 text-sm">Return Home</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-800 font-sans pb-20">
      
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center sticky top-0 z-10 shadow-sm">
         <div className="flex items-center gap-3">
             <Database className="text-primary" size={24} />
             <h1 className="text-xl font-bold text-gray-900">Curator Workbench</h1>
         </div>
         <div className="flex items-center gap-4">
             {debugInfo && <span className="text-xs font-mono text-gray-400 hidden md:inline">Keys: {debugInfo.googleKeys}</span>}
             <button onClick={async () => { await supabase.auth.signOut(); setIsAuthenticated(false); }} className="text-sm text-red-500 font-medium">Logout</button>
         </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-8 grid lg:grid-cols-2 gap-8 h-[calc(100vh-100px)]">
          
          {/* LEFT: INPUT AREA */}
          <div className="flex flex-col bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden h-full">
              
              {/* Tabs */}
              <div className="flex border-b border-gray-200">
                  <button 
                    onClick={() => setMode('manual')}
                    className={`flex-1 py-3 text-sm font-bold flex items-center justify-center ${mode === 'manual' ? 'text-primary border-b-2 border-primary bg-gray-50' : 'text-gray-500 hover:bg-gray-50'}`}
                  >
                      <Clipboard size={16} className="mr-2" /> Manual Paste
                  </button>
                  <button 
                    onClick={() => setMode('auto')}
                    className={`flex-1 py-3 text-sm font-bold flex items-center justify-center ${mode === 'auto' ? 'text-primary border-b-2 border-primary bg-gray-50' : 'text-gray-500 hover:bg-gray-50'}`}
                  >
                      <Bot size={16} className="mr-2" /> Auto-Pilot Agent
                  </button>
              </div>

              <div className="flex-grow flex flex-col p-4 overflow-hidden relative">
                  
                  {mode === 'manual' ? (
                      <>
                        <div className="flex gap-2 mb-4">
                            <input 
                                type="text" 
                                placeholder="Paste URL to analyze..." 
                                className="flex-grow p-2 border border-gray-300 rounded text-sm outline-none focus:border-primary"
                                value={urlInput}
                                onChange={(e) => setUrlInput(e.target.value)}
                            />
                            <Button onClick={handleFetchUrl} disabled={!urlInput || isProcessing} className="px-3">
                                <Search size={16} />
                            </Button>
                        </div>
                        <textarea 
                            className="flex-grow p-3 border border-gray-200 rounded resize-none focus:outline-none text-sm font-mono text-gray-600 bg-gray-50"
                            placeholder="Or paste raw text here..."
                            value={rawText}
                            onChange={(e) => setRawText(e.target.value)}
                        />
                        <div className="mt-4">
                            <Button onClick={processManualText} disabled={!rawText || isProcessing} fullWidth>
                                {isProcessing ? 'Processing...' : 'Extract Data'}
                            </Button>
                        </div>
                      </>
                  ) : (
                      <>
                        <div className="mb-4">
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Discovery Topic</label>
                            <div className="flex gap-2">
                                <input 
                                    type="text" 
                                    placeholder="e.g. Documentary Grants for Indian Women" 
                                    className="flex-grow p-2 border border-gray-300 rounded text-sm outline-none focus:border-primary"
                                    value={scanTopic}
                                    onChange={(e) => setScanTopic(e.target.value)}
                                />
                                <Button onClick={handleAutoScan} disabled={!scanTopic || isProcessing} className="px-4">
                                    {isProcessing ? <RefreshCw className="animate-spin" /> : <Sparkles size={16} />}
                                </Button>
                            </div>
                        </div>
                        
                        {/* Terminal Log View */}
                        <div className="flex-grow bg-gray-900 rounded-lg p-4 font-mono text-xs overflow-y-auto">
                            {logs.length === 0 && <span className="text-gray-600">Agent logs will appear here...</span>}
                            {logs.map((log, i) => (
                                <div key={i} className={`mb-1 ${
                                    log.type === 'error' ? 'text-red-400' : 
                                    log.type === 'success' ? 'text-green-400' : 
                                    log.type === 'action' ? 'text-yellow-400' : 'text-gray-300'
                                }`}>
                                    <span className="opacity-50 mr-2">[{log.timestamp}]</span>
                                    {log.type === 'action' && '> '}
                                    {log.message}
                                </div>
                            ))}
                            <div ref={logEndRef} />
                        </div>
                      </>
                  )}

                  {/* Status Messages */}
                  {saveStatus === 'error' && statusMsg && (
                      <div className="mt-3 p-3 bg-red-100 text-red-700 text-sm flex items-center rounded">
                          <ShieldAlert size={16} className="mr-2" /> {statusMsg}
                      </div>
                  )}
                  {saveStatus === 'success' && (
                       <div className="mt-3 p-3 bg-green-100 text-green-700 text-sm flex items-center rounded">
                           <CheckCircle size={16} className="mr-2" /> Published!
                       </div>
                  )}
              </div>
          </div>

          {/* RIGHT: EDITOR (Same as before) */}
          <div className="flex flex-col bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden h-full">
               <div className="p-4 border-b border-gray-100 bg-gray-50">
                  <h2 className="font-bold text-gray-700 flex items-center">
                      <Save size={18} className="mr-2" /> Review & Publish
                  </h2>
              </div>

              <div className="flex-grow p-6 overflow-y-auto bg-gray-50/50">
                  {!extractedData ? (
                      <div className="h-full flex flex-col items-center justify-center text-gray-400">
                          <ArrowRight size={48} className="mb-4 text-gray-300" />
                          <p>Waiting for extraction...</p>
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
                                  className="w-full p-2 border border-gray-300 rounded text-sm outline-none focus:border-primary"
                                  rows={5}
                                  value={extractedData.description || ''}
                                  onChange={(e) => handleFieldChange('description', e.target.value)}
                              />
                          </div>
                          
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                             <FormInput label="Website URL" value={extractedData.contact?.website} onChange={v => handleFieldChange('contact', { ...extractedData.contact, website: v })} />
                             <FormInput label="Application Fee" value={extractedData.applicationFee} onChange={v => handleFieldChange('applicationFee', v)} />
                          </div>

                          {/* Grounding Sources View */}
                          {extractedData.groundingSources && extractedData.groundingSources.length > 0 && (
                              <div className="p-3 bg-blue-50 border border-blue-100 rounded text-xs">
                                  <span className="font-bold text-blue-800">Verified Sources Found:</span>
                                  <ul className="list-disc ml-4 text-blue-700 mt-1">
                                      {extractedData.groundingSources.map((s,i) => <li key={i}>{s}</li>)}
                                  </ul>
                              </div>
                          )}
                      </div>
                  )}
              </div>

              <div className="p-4 border-t border-gray-100 bg-white">
                  <Button 
                    onClick={saveToDb} 
                    disabled={!extractedData || saveStatus === 'saving'}
                    fullWidth 
                    className={`py-3 text-lg ${saveStatus === 'error' ? 'bg-red-600' : 'bg-green-600 hover:bg-green-700'}`}
                  >
                      {saveStatus === 'saving' ? 'Publishing...' : 'Publish to Database'}
                  </Button>
              </div>
          </div>
      </div>
    </div>
  );
};

const FormInput = ({ label, value, onChange, type = "text" }: any) => (
    <div>
        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">{label}</label>
        <input 
            type={type}
            className="w-full p-2 border border-gray-300 rounded text-sm outline-none focus:border-primary"
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
        />
    </div>
);

export default AgentScanner;