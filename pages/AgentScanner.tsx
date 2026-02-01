import React, { useState, useEffect } from 'react';
import { Terminal, Play, Cpu, Loader, CheckCircle, ExternalLink, Sparkles, Plus, XCircle, Inbox, RefreshCw, Mail, MousePointer, Target, BarChart2, TrendingUp, Users, Trash2, Lock, Key, ShieldAlert, Link as LinkIcon, Plug } from 'lucide-react';
import { aiAgentService, SearchDomain } from '../services/AiAgentService';
import { opportunityService } from '../services/OpportunityService';
import { emailService } from '../services/EmailService';
import { Opportunity, MockEmail } from '../types';
import { Link } from 'react-router-dom';
import Button from '../components/Button';

const AgentScanner: React.FC = () => {
  // --- AUTHENTICATION STATE ---
  const [isAgentAuthenticated, setIsAgentAuthenticated] = useState(false);
  const [authEmail, setAuthEmail] = useState('');
  const [authPass, setAuthPass] = useState('');
  const [authError, setAuthError] = useState('');

  // --- DASHBOARD STATE ---
  const [activeTab, setActiveTab] = useState<'inbox' | 'terminal' | 'outbox' | 'analytics'>('inbox');
  const [logs, setLogs] = useState<string[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [inbox, setInbox] = useState<Opportunity[]>([]);
  const [sentEmails, setSentEmails] = useState<MockEmail[]>([]);
  const [allOpportunities, setAllOpportunities] = useState<Opportunity[]>([]);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  
  // Mission State
  const [selectedDomain, setSelectedDomain] = useState<SearchDomain>('Surprise Me');
  const [targetUrl, setTargetUrl] = useState('');

  // Check session on mount
  useEffect(() => {
    const sessionToken = sessionStorage.getItem('nxf_agent_token');
    if (sessionToken === 'verified') {
      setIsAgentAuthenticated(true);
    }
  }, []);

  // Load Data (ONLY if authenticated)
  useEffect(() => {
    if (!isAgentAuthenticated) return;

    const loadData = async () => {
      // Inbox
      const inboxData = await opportunityService.getInbox();
      setInbox(inboxData.sort((a, b) => (b.aiConfidenceScore || 0) - (a.aiConfidenceScore || 0)));
      
      // Email Logs - Fetch from DB
      const emails = await emailService.fetchLogsFromDb();
      setSentEmails(emails);

      // All Opportunities (for Analytics)
      const allData = await opportunityService.getAll();
      setAllOpportunities(allData);
    };
    loadData();
  }, [refreshTrigger, isAgentAuthenticated]);

  const handleAgentLogin = (e: React.FormEvent) => {
    e.preventDefault();
    // Fixed Credentials Check
    if (authEmail === 'nxfindiax@gmail.com' && authPass === 'Ooty2026!"§') {
      setIsAgentAuthenticated(true);
      sessionStorage.setItem('nxf_agent_token', 'verified');
      setAuthError('');
    } else {
      setAuthError('Access Denied: Invalid Agent Credentials');
      setAuthPass(''); // Clear password on fail
    }
  };

  const addLog = (msg: string) => {
    setLogs(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev].slice(0, 50));
  };

  const handleScan = async () => {
    setActiveTab('terminal');
    setIsScanning(true);
    addLog(`Initiating Manual Scan. Target: ${selectedDomain}`);
    
    try {
      const newOpps = await aiAgentService.scanWeb(addLog, selectedDomain);
      const addedCount = await opportunityService.addToInbox(newOpps);
      addLog(`Cycle Complete. Added ${addedCount} new drafts to Inbox.`);
      setRefreshTrigger(prev => prev + 1);
      if (addedCount > 0) {
        setTimeout(() => setActiveTab('inbox'), 1500); 
      }
    } catch (e) {
      addLog("Error during scan.");
    } finally {
      setIsScanning(false);
    }
  };

  const handleUrlScan = async () => {
      if(!targetUrl) {
          alert("Please enter a URL first.");
          return;
      }
      setActiveTab('terminal');
      setIsScanning(true);
      addLog(`Analyzing Direct Link: ${targetUrl}`);

      try {
        const newOpps = await aiAgentService.analyzeSpecificUrl(addLog, targetUrl);
        const addedCount = await opportunityService.addToInbox(newOpps);
        addLog(`Analysis Complete. Draft created in Inbox.`);
        setRefreshTrigger(prev => prev + 1);
        setTargetUrl(''); // Clear input
        setTimeout(() => setActiveTab('inbox'), 1500);
      } catch (e) {
          addLog("Error analyzing URL.");
      } finally {
          setIsScanning(false);
      }
  };

  const handleApprove = async (id: string) => {
    addLog(`Approving ID: ${id}...`);
    await opportunityService.approveOpportunity(id);
    addLog(`System: Opportunity Published. Triggers fired: User Alert Email + Organizer Outreach Email.`);
    setRefreshTrigger(prev => prev + 1);
  };

  const handleReject = async (id: string) => {
    await opportunityService.rejectOpportunity(id);
    setRefreshTrigger(prev => prev + 1);
  };

  const clearInbox = async () => {
    if(confirm("Clear all drafts?")) {
        await opportunityService.clearInbox();
        setRefreshTrigger(prev => prev + 1);
    }
  }

  const clearEmailLogs = async () => {
      if(confirm("Clear all email logs?")) {
          await emailService.clearLogs();
          setRefreshTrigger(prev => prev + 1);
      }
  }

  // Analytics Helpers
  const calculateAnalytics = () => {
      let totalUpvotes = 0;
      let totalDownvotes = 0;
      let totalIntent = 0;
      let rejectionReasons: {[key: string]: number} = {};

      allOpportunities.forEach(opp => {
          if (opp.userFeedback) {
              totalUpvotes += opp.userFeedback.upvotes || 0;
              totalDownvotes += opp.userFeedback.downvotes || 0;
              totalIntent += opp.userFeedback.applicationIntent || 0;
              
              if (opp.userFeedback.rejectionReasons) {
                  Object.entries(opp.userFeedback.rejectionReasons).forEach(([key, val]) => {
                      rejectionReasons[key] = (rejectionReasons[key] || 0) + val;
                  });
              }
          }
      });

      const totalVotes = totalUpvotes + totalDownvotes;
      const helpfulnessRatio = totalVotes > 0 ? Math.round((totalUpvotes / totalVotes) * 100) : 0;
      const intentRatio = totalUpvotes > 0 ? Math.round((totalIntent / totalUpvotes) * 100) : 0;

      return { totalUpvotes, totalDownvotes, totalIntent, helpfulnessRatio, intentRatio, rejectionReasons };
  };

  const stats = calculateAnalytics();

  // --- RENDER: LOCK SCREEN ---
  if (!isAgentAuthenticated) {
    return (
      <div className="min-h-screen bg-gray-900 text-gray-100 flex flex-col items-center justify-center p-4">
        <div className="max-w-md w-full bg-gray-800 rounded-lg border border-gray-700 shadow-2xl overflow-hidden">
          <div className="bg-gray-900 p-6 border-b border-gray-700 flex flex-col items-center">
             <div className="w-16 h-16 bg-gray-800 rounded-full flex items-center justify-center border border-gray-600 mb-4 shadow-inner">
               <Lock className="text-primary h-8 w-8" />
             </div>
             <h1 className="text-xl font-bold text-white tracking-widest">RESTRICTED ACCESS</h1>
             <p className="text-xs text-red-400 font-mono mt-2 flex items-center">
               <ShieldAlert size={12} className="mr-1" /> AUTHORIZED PERSONNEL ONLY
             </p>
          </div>
          
          <div className="p-8">
            <form onSubmit={handleAgentLogin} className="space-y-6">
              {authError && (
                <div className="bg-red-900/20 border border-red-800 text-red-300 p-3 rounded text-sm text-center">
                  {authError}
                </div>
              )}
              
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Agent ID</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-2.5 text-gray-500" size={16} />
                  <input 
                    type="email" 
                    value={authEmail}
                    onChange={(e) => setAuthEmail(e.target.value)}
                    className="w-full bg-gray-900 border border-gray-700 text-white rounded pl-10 pr-3 py-2 focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none transition-colors"
                    placeholder="agent@nxfcurator.org"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Secure Passkey</label>
                <div className="relative">
                  <Key className="absolute left-3 top-2.5 text-gray-500" size={16} />
                  <input 
                    type="password" 
                    value={authPass}
                    onChange={(e) => setAuthPass(e.target.value)}
                    className="w-full bg-gray-900 border border-gray-700 text-white rounded pl-10 pr-3 py-2 focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none transition-colors"
                    placeholder="••••••••••••"
                  />
                </div>
              </div>

              <button 
                type="submit"
                className="w-full bg-primary hover:bg-yellow-500 text-gray-900 font-bold py-3 rounded transition-colors shadow-lg shadow-primary/20"
              >
                AUTHENTICATE
              </button>
            </form>
            
            <div className="mt-6 text-center">
              <Link to="/" className="text-xs text-gray-500 hover:text-gray-300 transition-colors">
                &larr; Return to Public Site
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // --- RENDER: DASHBOARD (AUTHENTICATED) ---
  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 pb-12 font-sans">
      <div className="max-w-6xl mx-auto px-4 py-8 sm:px-6">
        
        {/* Header */}
        <div className="flex flex-col xl:flex-row xl:items-center justify-between mb-8 border-b border-gray-700 pb-6 gap-6">
          <div className="flex items-center space-x-3">
            <div className="bg-gradient-to-br from-primary to-orange-500 p-2.5 rounded-lg shadow-lg">
              <Cpu className="text-white h-7 w-7" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white tracking-wide">NXF CURATOR</h1>
              <p className="text-xs text-gray-400">AI-Powered Opportunity Discovery Engine</p>
            </div>
          </div>
          
          <div className="flex flex-col md:flex-row items-stretch md:items-center gap-4 w-full xl:w-auto">
             
             {/* 1. AUTO SCANNER */}
             <div className="flex items-center bg-gray-800 rounded-md border border-gray-600 px-3 py-1.5 flex-shrink-0">
                <Target size={16} className="text-primary mr-2" />
                <span className="text-xs text-gray-400 mr-2 uppercase font-bold hidden sm:inline">Mission:</span>
                <select 
                    value={selectedDomain}
                    onChange={(e) => setSelectedDomain(e.target.value as SearchDomain)}
                    className="bg-transparent text-white text-sm font-medium focus:outline-none cursor-pointer w-28 sm:w-auto"
                    disabled={isScanning}
                >
                    <option value="Surprise Me">🎲 Surprise Me</option>
                    <option value="Film">🎬 Film & TV</option>
                    <option value="Visual Arts">🎨 Visual Arts</option>
                    <option value="Music">🎵 Music</option>
                    <option value="Literature">📚 Literature</option>
                    <option value="Performing Arts">🎭 Performing Arts</option>
                </select>
                <button 
                  onClick={handleScan}
                  disabled={isScanning}
                  className="ml-3 text-primary hover:text-white disabled:opacity-50"
                  title="Run Auto Scan"
                >
                    <Play size={18} fill="currentColor" />
                </button>
             </div>

             {/* 2. URL ANALYZER (NEW) */}
             <div className="flex items-center bg-gray-800 rounded-md border border-gray-600 px-3 py-1.5 flex-grow max-w-md">
                <LinkIcon size={16} className="text-blue-400 mr-2 flex-shrink-0" />
                <input 
                    type="text" 
                    placeholder="Or paste URL to analyze..." 
                    value={targetUrl}
                    onChange={(e) => setTargetUrl(e.target.value)}
                    className="bg-transparent text-white text-sm w-full focus:outline-none placeholder-gray-500"
                    disabled={isScanning}
                />
                <button 
                    onClick={handleUrlScan}
                    disabled={isScanning || !targetUrl}
                    className="ml-2 text-blue-400 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Analyze Link"
                >
                    {isScanning ? <Loader size={16} className="animate-spin" /> : <Plug size={18} />}
                </button>
             </div>
             
             <div className="h-8 w-px bg-gray-700 mx-1 hidden xl:block"></div>
             
             <div className="flex items-center gap-2">
                 <button 
                    onClick={() => {
                       sessionStorage.removeItem('nxf_agent_token');
                       setIsAgentAuthenticated(false);
                    }}
                    className="text-xs text-red-400 hover:text-red-300 border border-red-900/50 bg-red-900/10 px-3 py-2 rounded hover:bg-red-900/20 transition-colors whitespace-nowrap"
                 >
                    LOGOUT
                 </button>

                 <Link to="/" className="text-sm text-gray-400 hover:text-white px-3 py-2 border border-gray-700 rounded-md transition-colors whitespace-nowrap">
                    Public View
                 </Link>
             </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex space-x-1 bg-gray-800 p-1 rounded-lg w-fit mb-6 overflow-x-auto max-w-full">
            <button 
                onClick={() => setActiveTab('inbox')}
                className={`flex items-center px-4 py-2 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${activeTab === 'inbox' ? 'bg-gray-700 text-white shadow-sm' : 'text-gray-400 hover:text-gray-200'}`}
            >
                <Inbox size={16} className="mr-2" /> Inbox <span className="ml-2 bg-gray-900 text-xs px-2 py-0.5 rounded-full text-gray-300">{inbox.length}</span>
            </button>
            <button 
                onClick={() => setActiveTab('outbox')}
                className={`flex items-center px-4 py-2 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${activeTab === 'outbox' ? 'bg-gray-700 text-white shadow-sm' : 'text-gray-400 hover:text-gray-200'}`}
            >
                <Mail size={16} className="mr-2" /> System Outbox <span className="ml-2 bg-gray-900 text-xs px-2 py-0.5 rounded-full text-gray-300">{sentEmails.length}</span>
            </button>
            <button 
                onClick={() => setActiveTab('analytics')}
                className={`flex items-center px-4 py-2 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${activeTab === 'analytics' ? 'bg-gray-700 text-white shadow-sm' : 'text-gray-400 hover:text-gray-200'}`}
            >
                <BarChart2 size={16} className="mr-2" /> Analytics
            </button>
            <button 
                onClick={() => setActiveTab('terminal')}
                className={`flex items-center px-4 py-2 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${activeTab === 'terminal' ? 'bg-gray-700 text-white shadow-sm' : 'text-gray-400 hover:text-gray-200'}`}
            >
                <Terminal size={16} className="mr-2" /> Live Logs
            </button>
        </div>

        {/* ANALYTICS VIEW */}
        {activeTab === 'analytics' && (
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 animate-fadeIn">
                {/* Card 1: Intent Rate (The North Star) */}
                <div className="bg-gray-800 p-6 rounded-lg border border-gray-700">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-gray-400 text-sm font-bold uppercase tracking-wider">Application Intent</h3>
                        <Target className="text-primary" size={20} />
                    </div>
                    <div className="flex items-baseline">
                        <span className="text-4xl font-bold text-white">{stats.intentRatio}%</span>
                        <span className="ml-2 text-sm text-gray-500">of upvoters</span>
                    </div>
                    <p className="text-xs text-gray-500 mt-2">Users who clicked "Yes, Applying!"</p>
                </div>

                {/* Card 2: Satisfaction */}
                <div className="bg-gray-800 p-6 rounded-lg border border-gray-700">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-gray-400 text-sm font-bold uppercase tracking-wider">Helpfulness Ratio</h3>
                        <Users className="text-green-500" size={20} />
                    </div>
                    <div className="flex items-baseline">
                        <span className="text-4xl font-bold text-white">{stats.helpfulnessRatio}%</span>
                        <span className="ml-2 text-sm text-gray-500">Positive Feedback</span>
                    </div>
                    <p className="text-xs text-gray-500 mt-2">{stats.totalUpvotes} Upvotes vs {stats.totalDownvotes} Downvotes</p>
                </div>

                {/* Card 3: Volume */}
                <div className="bg-gray-800 p-6 rounded-lg border border-gray-700">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-gray-400 text-sm font-bold uppercase tracking-wider">Total Discoveries</h3>
                        <Sparkles className="text-purple-500" size={20} />
                    </div>
                    <div className="flex items-baseline">
                        <span className="text-4xl font-bold text-white">{allOpportunities.filter(o => o.aiMetadata).length}</span>
                        <span className="ml-2 text-sm text-gray-500">AI Found</span>
                    </div>
                    <p className="text-xs text-gray-500 mt-2">Active opportunities in database</p>
                </div>

                 {/* Card 4: Rejection Reasons */}
                 <div className="bg-gray-800 p-6 rounded-lg border border-gray-700">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-gray-400 text-sm font-bold uppercase tracking-wider">Quality Issues</h3>
                        <TrendingUp className="text-red-500" size={20} />
                    </div>
                    <div className="space-y-2">
                        {Object.entries(stats.rejectionReasons).length === 0 ? (
                            <span className="text-sm text-gray-500 italic">No negative feedback yet</span>
                        ) : (
                            Object.entries(stats.rejectionReasons).map(([reason, count]) => (
                                <div key={reason} className="flex justify-between text-sm">
                                    <span className="text-gray-300 capitalize">{reason.replace('_', ' ')}</span>
                                    <span className="text-white font-bold">{count}</span>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>
        )}

        {/* INBOX VIEW */}
        {activeTab === 'inbox' && (
            <div className="space-y-4">
                {inbox.length === 0 ? (
                    <div className="text-center py-20 bg-gray-800/50 rounded-xl border border-dashed border-gray-700">
                        <Inbox size={48} className="mx-auto text-gray-600 mb-4" />
                        <h3 className="text-xl font-bold text-gray-400">Inbox is Empty</h3>
                        <p className="text-gray-500 mb-6">Run a scan or paste a URL to find opportunities.</p>
                        <button onClick={handleScan} className="text-primary hover:underline font-medium">Run Auto Scan</button>
                    </div>
                ) : (
                    <>
                        <div className="flex justify-between items-center mb-2 px-1">
                            <span className="text-sm text-gray-400">Reviewing {inbox.length} drafts</span>
                            <button onClick={clearInbox} className="text-xs text-red-400 hover:text-red-300">Clear All</button>
                        </div>
                        <div className="grid gap-4">
                            {inbox.map(opp => (
                                <div key={opp.id} className="bg-gray-800 rounded-lg p-5 border border-gray-700 hover:border-gray-600 transition-all shadow-md group">
                                    <div className="flex flex-col md:flex-row justify-between gap-4">
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2 mb-1">
                                                <h3 className="text-lg font-bold text-white">{opp.title}</h3>
                                                {opp.aiConfidenceScore && opp.aiConfidenceScore > 80 && (
                                                    <span className="bg-green-900/50 text-green-400 text-[10px] font-bold px-2 py-0.5 rounded border border-green-800">
                                                        {opp.aiConfidenceScore}% MATCH
                                                    </span>
                                                )}
                                                <span className="bg-gray-700 text-gray-300 text-[10px] px-2 py-0.5 rounded uppercase">{opp.type}</span>
                                                {opp.category && opp.category !== 'General' && (
                                                    <span className="bg-indigo-900/50 text-indigo-300 text-[10px] px-2 py-0.5 rounded uppercase border border-indigo-800">{opp.category}</span>
                                                )}
                                            </div>
                                            <p className="text-purple-400 text-sm font-medium mb-2">{opp.organizer}</p>
                                            <p className="text-gray-400 text-sm mb-3">{opp.description}</p>
                                            
                                            {opp.aiReasoning && (
                                                <div className="bg-gray-900/50 p-2 rounded text-xs text-gray-500 mb-3 border border-gray-700/50">
                                                    <span className="text-gray-400 font-semibold mr-1">AI Note:</span>
                                                    {opp.aiReasoning}
                                                </div>
                                            )}

                                            <div className="flex flex-wrap gap-4 text-xs text-gray-500">
                                                <span className="flex items-center"><Sparkles size={12} className="mr-1 text-yellow-500"/> Value: <span className="text-gray-300 ml-1">{opp.grantOrPrize}</span></span>
                                                <span>Deadline: <span className="text-gray-300 ml-1">{opp.deadline}</span></span>
                                                {opp.contact?.website && (
                                                    <a href={opp.contact.website} target="_blank" rel="noreferrer" className="flex items-center text-blue-400 hover:text-blue-300">
                                                        Source <ExternalLink size={10} className="ml-1" />
                                                    </a>
                                                )}
                                            </div>
                                        </div>

                                        <div className="flex md:flex-col items-center justify-center gap-2 min-w-[140px] border-t md:border-t-0 md:border-l border-gray-700 pt-4 md:pt-0 md:pl-4">
                                            <button 
                                                onClick={() => handleApprove(opp.id)}
                                                className="w-full bg-green-600 hover:bg-green-500 text-white px-3 py-2 rounded text-xs font-bold flex items-center justify-center transition-colors shadow-sm"
                                            >
                                                <CheckCircle size={14} className="mr-2" /> APPROVE
                                            </button>
                                            <button 
                                                onClick={() => handleReject(opp.id)}
                                                className="w-full bg-gray-700 hover:bg-red-900/50 hover:text-red-200 text-gray-300 px-3 py-2 rounded text-xs font-bold flex items-center justify-center transition-colors"
                                            >
                                                <XCircle size={14} className="mr-2" /> REJECT
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </>
                )}
            </div>
        )}

        {/* OUTBOX VIEW (EMAIL SIMULATION) */}
        {activeTab === 'outbox' && (
            <div className="space-y-4">
                <div className="flex justify-between items-center mb-2 px-1">
                    <span className="text-sm text-gray-400">System Outbox ({sentEmails.length} messages)</span>
                    <button 
                        onClick={clearEmailLogs} 
                        className="flex items-center text-xs text-red-400 hover:text-red-300 hover:bg-red-900/20 px-2 py-1 rounded transition-colors"
                    >
                        <Trash2 size={12} className="mr-1" /> Clear Logs
                    </button>
                </div>
                {sentEmails.length === 0 ? (
                    <div className="text-center py-20 bg-gray-800/50 rounded-xl border border-dashed border-gray-700">
                        <Mail size={48} className="mx-auto text-gray-600 mb-4" />
                        <h3 className="text-xl font-bold text-gray-400">System Outbox is Empty</h3>
                        <p className="text-gray-500">Approve an opportunity to trigger subscriber alerts and organizer outreach.</p>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {sentEmails.map(email => (
                            <div key={email.id} className="bg-gray-800 rounded-lg p-5 border border-gray-700 shadow-sm">
                                <div className="flex justify-between items-start mb-3">
                                    <div>
                                        <div className="flex items-center gap-2 mb-2">
                                            <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded border ${email.type === 'subscriber_alert' ? 'bg-blue-900/30 text-blue-300 border-blue-800' : 'bg-purple-900/30 text-purple-300 border-purple-800'}`}>
                                                {email.type.replace('_', ' ')}
                                            </span>
                                            <span className="text-[10px] text-green-400 flex items-center font-bold">
                                                <CheckCircle size={10} className="mr-1" /> SENT
                                            </span>
                                            <span className="text-xs text-gray-500">{new Date(email.timestamp).toLocaleString()}</span>
                                        </div>
                                        <div className="space-y-1">
                                            <h4 className="text-gray-400 text-xs font-semibold uppercase tracking-wider">To</h4>
                                            <p className="font-mono text-gray-300 text-sm bg-gray-900/50 inline-block px-2 py-0.5 rounded">{email.to}</p>
                                        </div>
                                    </div>
                                </div>
                                
                                <div className="mb-3">
                                    <h4 className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-1">Subject</h4>
                                    <p className="text-white font-medium text-sm">{email.subject}</p>
                                </div>

                                <div className="bg-gray-900 p-4 rounded text-sm text-gray-400 whitespace-pre-wrap font-mono border border-gray-800 leading-relaxed">
                                    {email.body}
                                </div>
                                {email.actionLink && (
                                    <div className="mt-3 flex items-center justify-between bg-yellow-900/10 p-3 rounded border border-yellow-700/30">
                                        <div className="flex items-center text-yellow-500 text-xs">
                                            <MousePointer size={14} className="mr-2" />
                                            <span><strong>Simulation Mode:</strong> This email contains a magic link for the organizer.</span>
                                        </div>
                                        <a 
                                            href={email.actionLink} 
                                            target="_blank" 
                                            rel="noopener noreferrer"
                                            className="bg-yellow-600 hover:bg-yellow-500 text-gray-900 px-3 py-1.5 rounded text-xs font-bold transition-colors shadow-sm"
                                        >
                                            OPEN MAGIC LINK
                                        </a>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        )}

        {/* TERMINAL VIEW */}
        {activeTab === 'terminal' && (
            <div className="bg-black rounded-lg border border-gray-700 p-6 font-mono text-sm h-[60vh] overflow-hidden flex flex-col shadow-2xl">
                 <div className="flex-1 overflow-y-auto space-y-1 scrollbar-thin scrollbar-thumb-gray-800">
                    {logs.length === 0 && <span className="text-gray-600">Waiting for agent activity...</span>}
                    {logs.map((log, i) => (
                        <div key={i} className="text-green-500 border-l-2 border-green-900 pl-2 py-0.5">
                            {log}
                        </div>
                    ))}
                    {isScanning && <div className="text-green-500 animate-pulse mt-2">&gt; Processing...</div>}
                 </div>
            </div>
        )}
      </div>
    </div>
  );
};

export default AgentScanner;