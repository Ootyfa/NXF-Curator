import React, { useState, useEffect, useRef } from 'react';
import { Lock, FileText, ArrowRight, Save, Database, Trash2, CheckCircle, Clipboard, Bot, Terminal, Play, Pause } from 'lucide-react';
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

  // Mode
  const [mode, setMode] = useState<'manual' | 'auto'>('manual');

  // Tool State
  const [rawText, setRawText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [data, setData] = useState<Partial<Opportunity> | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');

  // Auto-Pilot State
  const [logs, setLogs] = useState<string[]>([]);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const [foundItems, setFoundItems] = useState<Opportunity[]>([]);

  useEffect(() => {
    checkSession();
  }, []);

  useEffect(() => {
      logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

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

  const addLog = (msg: string) => setLogs(prev => [...prev, msg]);

  // --- MANUAL HANDLERS ---

  const handleManualProcess = async () => {
      if (!rawText.trim()) return;
      setIsProcessing(true);
      setSaveStatus('idle');
      
      try {
          const result = await aiAgentService.parseOpportunityText(rawText);
          setData(result);
      } catch (e: any) {
          alert("Error: " + e.message);
      } finally {
          setIsProcessing(false);
      }
  };

  const handleManualSave = async () => {
      if (!data) return;
      setSaveStatus('saving');
      const res = await opportunityService.createOpportunity(data);
      if (res.success) {
          setSaveStatus('success');
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

  // --- AUTO-PILOT HANDLERS ---

  const handleStartAutoScan = async () => {
      setIsProcessing(true);
      setLogs(['Initializing Agent...']);
      setFoundItems([]);
      
      try {
          const results = await aiAgentService.performAutoScan(addLog);
          setFoundItems(results);
      } catch (e: any) {
          addLog(`CRITICAL ERROR: ${e.message}`);
      } finally {
          setIsProcessing(false);
      }
  };

  const handleSaveFoundItem = async (opp: Opportunity, index: number) => {
      const res = await opportunityService.createOpportunity(opp);
      if (res.success) {
          // Remove from found list locally
          const newList = [...foundItems];
          newList.splice(index, 1);
          setFoundItems(newList);
          addLog(`💾 Saved to Database: ${opp.title}`);
      } else {
          alert("Save failed: " + res.error);
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
             <Bot className="text-primary" size={24} />
             <h1 className="text-xl font-bold text-gray-900">Curator Tool</h1>
         </div>
         <div className="flex items-center gap-4">
            <div className="bg-gray-100 p-1 rounded-lg flex text-sm font-medium">
                <button 
                    onClick={() => setMode('manual')}
                    className={`px-4 py-1.5 rounded-md transition-all ${mode === 'manual' ? 'bg-white shadow text-primary' : 'text-gray-500 hover:text-gray-700'}`}
                >
                    Manual Paste
                </button>
                <button 
                    onClick={() => setMode('auto')}
                    className={`px-4 py-1.5 rounded-md transition-all ${mode === 'auto' ? 'bg-white shadow text-primary' : 'text-gray-500 hover:text-gray-700'}`}
                >
                    Auto-Pilot
                </button>
            </div>
            <button onClick={async () => { await supabase.auth.signOut(); setIsAuthenticated(false); }} className="text-sm text-red-500 font-medium">Logout</button>
         </div>
      </div>

      {mode === 'manual' ? (
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
                            onClick={handleManualProcess} 
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
                            onClick={handleManualSave} 
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
      ) : (
        <div className="max-w-7xl mx-auto px-4 py-8 grid lg:grid-cols-2 gap-8">
            {/* LEFT: TERMINAL */}
            <div className="flex flex-col bg-gray-900 text-green-400 rounded-xl shadow-lg border border-gray-800 h-[calc(100vh-150px)] overflow-hidden font-mono text-sm">
                <div className="p-4 border-b border-gray-800 bg-gray-950 flex justify-between items-center">
                    <div className="flex items-center gap-2">
                        <Terminal size={16} />
                        <span className="font-bold">Agent Terminal</span>
                    </div>
                    {isProcessing ? (
                        <span className="flex items-center text-xs text-yellow-500 animate-pulse">
                            <Bot size={14} className="mr-1" /> RUNNING...
                        </span>
                    ) : (
                        <span className="text-xs text-gray-500">IDLE</span>
                    )}
                </div>
                
                <div className="flex-grow p-4 overflow-y-auto space-y-1">
                    {logs.length === 0 && <span className="text-gray-600">Ready to scan. Click Start to begin.</span>}
                    {logs.map((log, i) => (
                        <div key={i} className="break-words">{log}</div>
                    ))}
                    <div ref={logsEndRef} />
                </div>

                <div className="p-4 bg-gray-950 border-t border-gray-800">
                    <Button 
                        onClick={handleStartAutoScan}
                        disabled={isProcessing}
                        fullWidth
                        className={`font-mono ${isProcessing ? 'opacity-50 cursor-not-allowed' : 'hover:bg-green-600'}`}
                    >
                        {isProcessing ? <Pause size={16} className="mr-2 inline" /> : <Play size={16} className="mr-2 inline" />}
                        {isProcessing ? 'SCANNING IN PROGRESS...' : 'START AUTONOMOUS SCAN'}
                    </Button>
                </div>
            </div>

            {/* RIGHT: RESULTS */}
            <div className="flex flex-col bg-white rounded-xl shadow-sm border border-gray-200 h-[calc(100vh-150px)]">
                 <div className="p-4 border-b border-gray-100 bg-gray-50 flex items-center gap-2">
                    <Bot size={18} className="text-primary" />
                    <h2 className="font-bold text-gray-700">Discovered Opportunities ({foundItems.length})</h2>
                 </div>
                 
                 <div className="flex-grow p-4 overflow-y-auto bg-gray-50 space-y-4">
                    {foundItems.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-gray-400 opacity-50">
                            <Database size={48} className="mb-4" />
                            <p>No new items found yet.</p>
                        </div>
                    ) : (
                        foundItems.map((opp, idx) => (
                            <div key={idx} className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
                                <h3 className="font-bold text-gray-800 text-lg mb-1">{opp.title}</h3>
                                <p className="text-sm text-gray-600 mb-2">{opp.organizer}</p>
                                <div className="flex flex-wrap gap-2 text-xs mb-3">
                                    <span className="bg-blue-50 text-blue-700 px-2 py-1 rounded">Deadline: {opp.deadline}</span>
                                    <span className="bg-yellow-50 text-yellow-700 px-2 py-1 rounded">{opp.type}</span>
                                </div>
                                <p className="text-sm text-gray-500 line-clamp-2 mb-3">{opp.description}</p>
                                <div className="flex gap-2">
                                    <button 
                                        onClick={() => handleSaveFoundItem(opp, idx)}
                                        className="flex-1 bg-primary text-white py-2 rounded text-sm font-medium hover:bg-accent-hover transition-colors"
                                    >
                                        Approve & Publish
                                    </button>
                                    <a 
                                        href={opp.sourceUrl} 
                                        target="_blank" 
                                        rel="noreferrer"
                                        className="px-3 py-2 border border-gray-300 rounded text-gray-600 hover:bg-gray-50"
                                    >
                                        Verify
                                    </a>
                                </div>
                            </div>
                        ))
                    )}
                 </div>
            </div>
        </div>
      )}
      
      <style>{`
        .label { display: block; font-size: 0.75rem; font-weight: 700; color: #6B7280; text-transform: uppercase; margin-bottom: 0.25rem; }
        .input { width: 100%; padding: 0.5rem; border: 1px solid #D1D5DB; border-radius: 0.375rem; font-size: 0.875rem; outline: none; transition: border-color 0.2s; }
        .input:focus { border-color: #F59E0B; ring: 1px solid #F59E0B; }
      `}</style>
    </div>
  );
};

export default AgentScanner;
