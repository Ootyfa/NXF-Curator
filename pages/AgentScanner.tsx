import React, { useState, useEffect, useRef } from 'react';
import { Lock, Sparkles, Save, RefreshCw, CheckCircle, ArrowRight, Clipboard, Database, ShieldAlert, Activity, Globe, Search, Link as LinkIcon, Terminal as TerminalIcon, Bot, Zap, StopCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { aiAgentService } from '../services/AiAgentService';
import { opportunityService } from '../services/OpportunityService';
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
  const [mode, setMode] = useState<'manual' | 'auto' | 'autonomous'>('manual');

  // Manual Workflow State
  const [urlInput, setUrlInput] = useState('');
  const [rawText, setRawText] = useState('');
  
  // Auto Workflow State
  const [scanTopic, setScanTopic] = useState('');
  const [logs, setLogs] = useState<AgentLog[]>([]);
  const [foundItems, setFoundItems] = useState<Partial<Opportunity>[]>([]);
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [isAutonomousRunning, setIsAutonomousRunning] = useState(false);
  
  const [extractedData, setExtractedData] = useState<Partial<Opportunity> | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [statusMsg, setStatusMsg] = useState('');
  
  const [debugInfo, setDebugInfo] = useState<any>(null);
  const logEndRef = useRef<HTMLDivElement>(null);
  
  const stopSignalRef = useRef(false);

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

  // --- AUTONOMOUS "GOD MODE" ---
  const startAutonomousCrawler = async () => {
      if (isAutonomousRunning) return;
      
      setIsAutonomousRunning(true);
      stopSignalRef.current = false;
      setLogs([]);
      setFoundItems([]);
      addLog("Starting Autonomous Crawler...", 'action');
      addLog("Mode: Search Grounding + Bulk Extraction", 'info');

      try {
          while (!stopSignalRef.current) {
              addLog("--- NEW CYCLE ---", 'action');
              const topics = await aiAgentService.generateSearchTopics();
              addLog(`Topics: ${topics.join(", ")}`, 'info');

              for (const topic of topics) {
                  if (stopSignalRef.current) break;
                  
                  addLog(`Searching: "${topic}"`, 'action');
                  const urls = await aiAgentService.discoverUrlsForTopic(topic);
                  
                  if (urls.length === 0) {
                      addLog("No valid URLs found from Search Grounding.", 'error');
                      continue;
                  }

                  addLog(`Found ${urls.length} target URLs via Google.`, 'info');

                  for (const url of urls) {
                      if (stopSignalRef.current) break;

                      // Scrape & Extract
                      const opps = await aiAgentService.processUrl(url, (log) => addLog(log.message, log.type));
                      
                      if (opps.length > 0) {
                          addLog(`Extracted ${opps.length} items from ${url}`, 'success');
                      }

                      // Save Valid Ones
                      for (const opp of opps) {
                          if (stopSignalRef.current) break;
                          
                          // Check Duplicates
                          const exists = await opportunityService.checkExists(opp.title!, opp.sourceUrl);
                          if (exists) {
                              addLog(`Duplicate skipped: ${opp.title}`, 'info');
                              continue;
                          }

                          // Save
                          const res = await opportunityService.createOpportunity(opp);
                          if (res.success) {
                              addLog(`SAVED: ${opp.title}`, 'success');
                              setFoundItems(prev => [opp, ...prev]);
                          } else {
                              addLog(`DB Save Failed: ${res.error}`, 'error');
                          }
                      }
                      
                      // Pause to be polite to servers
                      await new Promise(r => setTimeout(r, 2000));
                  }
              }
              
              if (!stopSignalRef.current) {
                addLog("Resting for 5 seconds...", 'action');
                await new Promise(r => setTimeout(r, 5000));
              }
          }
      } catch (e: any) {
          addLog(`CRITICAL CRASH: ${e.message}`, 'error');
      } finally {
          setIsAutonomousRunning(false);
          addLog("Crawler Stopped.", 'error');
      }
  };

  const stopCrawler = () => {
      stopSignalRef.current = true;
      addLog("Stopping after current operation...", 'error');
  };

  // --- MANUAL DB SAVE ---
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
        setStatusMsg(`DB Error: ${result.error}`);
      }
    } catch (e: any) {
        setSaveStatus('error');
        setStatusMsg(`Error: ${e.message}`);
    }
  };

  // LOCK SCREEN
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
          
          {/* LEFT: CONTROLS */}
          <div className="flex flex-col bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden h-full">
              
              {/* Tabs */}
              <div className="flex border-b border-gray-200">
                  <button onClick={() => setMode('manual')} className={`flex-1 py-3 text-xs md:text-sm font-bold flex items-center justify-center ${mode === 'manual' ? 'text-primary border-b-2 border-primary bg-gray-50' : 'text-gray-500'}`}>
                      <Clipboard size={14} className="mr-2" /> Manual
                  </button>
                  <button onClick={() => setMode('auto')} className={`flex-1 py-3 text-xs md:text-sm font-bold flex items-center justify-center ${mode === 'auto' ? 'text-primary border-b-2 border-primary bg-gray-50' : 'text-gray-500'}`}>
                      <Bot size={14} className="mr-2" /> Semi-Auto
                  </button>
                  <button onClick={() => setMode('autonomous')} className={`flex-1 py-3 text-xs md:text-sm font-bold flex items-center justify-center ${mode === 'autonomous' ? 'text-red-500 border-b-2 border-red-500 bg-red-50' : 'text-gray-500'}`}>
                      <Zap size={14} className="mr-2" /> Autonomous
                  </button>
              </div>

              <div className="flex-grow flex flex-col p-4 overflow-hidden relative">
                  
                  {mode === 'autonomous' ? (
                      <div className="flex flex-col h-full">
                           <div className="mb-4 text-center">
                               <h3 className="font-bold text-red-600 uppercase tracking-widest text-xs mb-2">God Mode: Autonomous Crawler</h3>
                               <p className="text-xs text-gray-500 mb-4">
                                   This agent uses Google Search Grounding to find real-time grants, scrapes the portals, extracts all data, and saves verified items automatically.
                               </p>
                               {!isAutonomousRunning ? (
                                   <button 
                                      onClick={startAutonomousCrawler}
                                      className="bg-red-600 hover:bg-red-700 text-white px-8 py-3 rounded-full font-bold shadow-lg animate-pulse"
                                   >
                                       START GOD MODE
                                   </button>
                               ) : (
                                   <button 
                                      onClick={stopCrawler}
                                      className="bg-gray-800 hover:bg-black text-white px-8 py-3 rounded-full font-bold shadow-lg flex items-center mx-auto"
                                   >
                                       <StopCircle className="mr-2" /> STOP CRAWLER
                                   </button>
                               )}
                           </div>
                           
                           {/* Terminal */}
                           <div className="flex-grow bg-gray-900 rounded-lg p-4 font-mono text-xs overflow-y-auto shadow-inner border border-gray-700">
                                {logs.length === 0 && <span className="text-gray-500">System Ready. Waiting for start command...</span>}
                                {logs.map((log, i) => (
                                    <div key={i} className={`mb-1 break-all ${
                                        log.type === 'error' ? 'text-red-400 font-bold' : 
                                        log.type === 'success' ? 'text-green-400 font-bold' : 
                                        log.type === 'action' ? 'text-yellow-400' : 'text-gray-300'
                                    }`}>
                                        <span className="opacity-40 mr-2 text-[10px]">{log.timestamp}</span>
                                        {log.type === 'action' && '> '}
                                        {log.message}
                                    </div>
                                ))}
                                <div ref={logEndRef} />
                           </div>
                      </div>
                  ) : (
                      // Manual/Semi-Auto Inputs
                      <>
                        <div className="flex gap-2 mb-4">
                            <input 
                                type="text" 
                                placeholder={mode === 'manual' ? "Paste URL..." : "Enter Topic (e.g. Dance Grants)..."}
                                className="flex-grow p-2 border border-gray-300 rounded text-sm outline-none focus:border-primary"
                                value={mode === 'manual' ? urlInput : scanTopic}
                                onChange={(e) => mode === 'manual' ? setUrlInput(e.target.value) : setScanTopic(e.target.value)}
                            />
                            <Button onClick={mode === 'manual' ? handleFetchUrl : () => {}} disabled={isProcessing} className="px-3">
                                {mode === 'manual' ? <Search size={16} /> : <Sparkles size={16} />}
                            </Button>
                        </div>
                        <textarea 
                            className="flex-grow p-3 border border-gray-200 rounded resize-none focus:outline-none text-sm font-mono text-gray-600 bg-gray-50"
                            placeholder={mode === 'manual' ? "Paste raw text here..." : "Logs will appear here..."}
                            value={rawText}
                            onChange={(e) => setRawText(e.target.value)}
                        />
                        {mode === 'manual' && (
                            <div className="mt-4">
                                <Button onClick={processManualText} disabled={!rawText || isProcessing} fullWidth>
                                    Extract Data
                                </Button>
                            </div>
                        )}
                      </>
                  )}
              </div>
          </div>

          {/* RIGHT: OUTPUT / LIVE FEED */}
          <div className="flex flex-col bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden h-full">
               <div className="p-4 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
                  <h2 className="font-bold text-gray-700 flex items-center">
                      <Save size={18} className="mr-2" /> 
                      {mode === 'autonomous' ? 'Live Capture Feed' : 'Review & Publish'}
                  </h2>
                  {mode === 'autonomous' && <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full">{foundItems.length} Captured</span>}
              </div>

              <div className="flex-grow p-6 overflow-y-auto bg-gray-50/50">
                  {mode === 'autonomous' ? (
                      <div className="space-y-3">
                          {foundItems.length === 0 && <div className="text-center text-gray-400 mt-10">No items captured yet. Start the crawler.</div>}
                          {foundItems.map((item, idx) => (
                              <div key={idx} className="bg-white p-4 rounded border border-gray-200 shadow-sm text-sm animate-pulse">
                                  <div className="flex justify-between items-start mb-1">
                                      <span className="font-bold text-green-700">{item.title}</span>
                                      <span className="text-xs text-gray-400">{item.deadline}</span>
                                  </div>
                                  <div className="text-gray-500 text-xs mb-1">{item.organizer}</div>
                                  <div className="text-xs text-blue-500 truncate">{item.sourceUrl}</div>
                              </div>
                          ))}
                      </div>
                  ) : (
                      // Manual Edit Form
                      !extractedData ? (
                          <div className="h-full flex flex-col items-center justify-center text-gray-400">
                              <ArrowRight size={48} className="mb-4 text-gray-300" />
                              <p>Waiting for data...</p>
                          </div>
                      ) : (
                          <div className="space-y-4">
                              <FormInput label="Title" value={extractedData.title} onChange={v => handleFieldChange('title', v)} />
                              <FormInput label="Organizer" value={extractedData.organizer} onChange={v => handleFieldChange('organizer', v)} />
                              <div className="grid grid-cols-2 gap-4">
                                  <FormInput label="Deadline" value={extractedData.deadline} onChange={v => handleFieldChange('deadline', v)} />
                                  <FormInput label="Grant/Prize" value={extractedData.grantOrPrize} onChange={v => handleFieldChange('grantOrPrize', v)} />
                              </div>
                              <textarea className="w-full border p-2" rows={4} value={extractedData.description} onChange={e => handleFieldChange('description', e.target.value)} />
                          </div>
                      )
                  )}
              </div>

              {mode !== 'autonomous' && (
                  <div className="p-4 border-t border-gray-100 bg-white">
                      <Button 
                        onClick={saveToDb} 
                        disabled={!extractedData || saveStatus === 'saving'}
                        fullWidth 
                        className={`py-3 text-lg ${saveStatus === 'error' ? 'bg-red-600' : 'bg-green-600'}`}
                      >
                          {saveStatus === 'saving' ? 'Publishing...' : 'Publish to Database'}
                      </Button>
                  </div>
              )}
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