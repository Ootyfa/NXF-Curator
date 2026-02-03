import React, { useState, useEffect, useRef } from 'react';
import { Lock, Sparkles, Save, Clipboard, Database, Search, Terminal as TerminalIcon, Bot, Zap, StopCircle, ArrowRight, Type } from 'lucide-react';
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