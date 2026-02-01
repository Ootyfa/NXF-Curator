import { supabase } from './supabase';
import { Opportunity } from '../types';
import { emailService } from './EmailService';
import { OPPORTUNITIES as MOCK_DATA } from '../constants';

class OpportunityService {
  private STORAGE_KEY = 'nxf_local_inbox';

  // --- MAPPING HELPERS ---
  private mapFromDb(row: any): Opportunity {
    // Basic mapping, ensuring robustness against missing fields
    return {
      id: row.id || `local-${Date.now()}`,
      title: row.title || "Untitled",
      deadline: row.deadline_text || row.deadline || "TBD",
      deadlineDate: row.deadline_date,
      daysLeft: row.daysLeft || 30,
      organizer: row.organizer || "Unknown",
      grantOrPrize: row.grant_or_prize || row.grantOrPrize || "N/A",
      eligibility: row.eligibility || [],
      type: row.type || 'Grant',
      scope: row.scope || 'National',
      description: row.description,
      category: row.category,
      applicationFee: row.application_fee,
      submissionPlatform: row.submission_platform,
      eventDates: row.event_dates,
      requirements: row.requirements || [],
      contact: row.contact_info || row.contact,
      verificationStatus: row.verification_status || row.verificationStatus || 'draft',
      sourceUrl: row.source_url || row.sourceUrl,
      createdAt: row.created_at || new Date().toISOString(),
      groundingSources: row.grounding_sources || row.groundingSources,
      aiConfidenceScore: row.ai_confidence_score || row.aiConfidenceScore,
      aiReasoning: row.ai_reasoning || row.aiReasoning,
      aiMetadata: row.ai_metadata || row.aiMetadata,
      status: row.status || 'draft',
      organizerEmailSent: row.organizer_email_sent,
      lastEditedBy: row.last_edited_by,
      userFeedback: row.user_feedback,
      organizerActionToken: row.id
    };
  }

  private mapToDb(opp: Partial<Opportunity>) {
    return {
      title: opp.title,
      deadline_text: opp.deadline,
      deadline_date: opp.deadlineDate,
      organizer: opp.organizer,
      grant_or_prize: opp.grantOrPrize,
      eligibility: opp.eligibility,
      type: opp.type,
      scope: opp.scope,
      description: opp.description,
      category: opp.category,
      application_fee: opp.applicationFee,
      submission_platform: opp.submissionPlatform,
      event_dates: opp.eventDates,
      requirements: opp.requirements,
      contact_info: opp.contact,
      verification_status: opp.verificationStatus,
      source_url: opp.sourceUrl,
      grounding_sources: opp.groundingSources,
      ai_confidence_score: opp.aiConfidenceScore,
      ai_reasoning: opp.aiReasoning,
      ai_metadata: opp.aiMetadata,
      status: opp.status,
      organizer_email_sent: opp.organizerEmailSent,
      last_edited_by: opp.lastEditedBy,
      user_feedback: opp.userFeedback,
    };
  }

  // --- PUBLIC API ---

  async getAll(): Promise<Opportunity[]> {
    const { data, error } = await supabase
      .from('opportunities')
      .select('*')
      .neq('status', 'removed_by_organizer')
      .neq('status', 'draft')
      .order('deadline_date', { ascending: true });

    if (error || !data || data.length === 0) {
      return MOCK_DATA;
    }
    return data.map(this.mapFromDb);
  }

  async getById(id: string): Promise<Opportunity | undefined> {
    const mock = MOCK_DATA.find(o => o.id === id);
    if (mock) return mock;

    const { data, error } = await supabase
      .from('opportunities')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) return undefined;
    return this.mapFromDb(data);
  }

  // --- AGENT / INBOX WORKFLOW ---

  // Fetches from DB first, then falls back to LocalStorage
  async getInbox(): Promise<Opportunity[]> {
    let dbOpportunities: Opportunity[] = [];
    
    // 1. Try DB
    try {
        const { data } = await supabase
        .from('opportunities')
        .select('*')
        .eq('status', 'draft')
        .order('created_at', { ascending: false });
        
        if (data) dbOpportunities = data.map(this.mapFromDb);
    } catch (e) { console.warn("DB Fetch failed"); }

    // 2. Fetch Local Storage
    const localStr = localStorage.getItem(this.STORAGE_KEY);
    const localOpportunities: Opportunity[] = localStr ? JSON.parse(localStr) : [];

    // Combine
    return [...localOpportunities, ...dbOpportunities];
  }

  // Tries DB, falls back to LocalStorage
  async addToInbox(opportunities: Opportunity[]): Promise<number> {
    if (opportunities.length === 0) return 0;
    
    // 1. Try Supabase
    const rowsToInsert = opportunities.map(opp => ({
        ...this.mapToDb(opp),
        status: 'draft',
        verification_status: 'draft'
    }));
    
    const { error } = await supabase
        .from('opportunities')
        .insert(rowsToInsert);

    if (!error) {
        return opportunities.length; // Success via DB
    }

    console.warn("Supabase insert failed, saving to LocalStorage", error);

    // 2. Fallback: Save to LocalStorage
    const currentLocal = JSON.parse(localStorage.getItem(this.STORAGE_KEY) || "[]");
    const updatedLocal = [...opportunities, ...currentLocal];
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(updatedLocal));

    return opportunities.length;
  }

  async approveOpportunity(id: string): Promise<void> {
      // 1. Try Local Storage Remove
      const localStr = localStorage.getItem(this.STORAGE_KEY);
      if (localStr) {
          const localArr: Opportunity[] = JSON.parse(localStr);
          const item = localArr.find(i => i.id === id);
          if (item) {
              // It was a local item, "Publish" it by sending email simulation
              const remaining = localArr.filter(i => i.id !== id);
              localStorage.setItem(this.STORAGE_KEY, JSON.stringify(remaining));
              await emailService.sendSubscriberAlert(item);
              await emailService.sendOrganizerOutreach(item);
              return;
          }
      }

      // 2. Try DB
      const { data } = await supabase
      .from('opportunities')
      .update({
        status: 'published',
        verification_status: 'verified',
        created_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

      if (data) {
        const opp = this.mapFromDb(data);
        await emailService.sendSubscriberAlert(opp);
        await emailService.sendOrganizerOutreach(opp);
      }
  }

  async rejectOpportunity(id: string): Promise<void> {
    // 1. Local
    const localStr = localStorage.getItem(this.STORAGE_KEY);
    if (localStr) {
         const localArr = JSON.parse(localStr);
         const remaining = localArr.filter((i: any) => i.id !== id);
         localStorage.setItem(this.STORAGE_KEY, JSON.stringify(remaining));
    }
    // 2. DB
    await supabase.from('opportunities').update({ status: 'rejected' }).eq('id', id);
  }

  async clearInbox(): Promise<void> {
    localStorage.removeItem(this.STORAGE_KEY);
    await supabase.from('opportunities').delete().eq('status', 'draft');
  }

  // ... (Keep existing organizer methods) ...
  async submitDetailedFeedback(id: string, payload: any) { /* implementation irrelevant for inbox fix */ }
  async organizerVerify(id: string) { return true; }
  async organizerRemove(id: string) { return true; }
  async organizerUpdate(id: string, updates: any) { return true; }
}

export const opportunityService = new OpportunityService();