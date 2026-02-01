import { supabase } from './supabase';
import { Opportunity } from '../types';
import { emailService } from './EmailService';
import { OPPORTUNITIES as MOCK_DATA } from '../constants';

class OpportunityService {
  // --- MAPPING HELPERS ---
  private mapFromDb(row: any): Opportunity {
    const today = new Date();
    const dDate = row.deadline_date ? new Date(row.deadline_date) : new Date();
    const daysLeft = Math.ceil((dDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    return {
      id: row.id,
      title: row.title,
      deadline: row.deadline_text,
      deadlineDate: row.deadline_date,
      daysLeft: daysLeft,
      organizer: row.organizer,
      grantOrPrize: row.grant_or_prize,
      eligibility: row.eligibility || [],
      type: row.type,
      scope: row.scope,
      description: row.description,
      category: row.category,
      applicationFee: row.application_fee,
      submissionPlatform: row.submission_platform,
      eventDates: row.event_dates,
      requirements: row.requirements || [],
      contact: row.contact_info,
      verificationStatus: row.verification_status,
      sourceUrl: row.source_url,
      createdAt: row.created_at,
      groundingSources: row.grounding_sources,
      aiConfidenceScore: row.ai_confidence_score,
      aiReasoning: row.ai_reasoning,
      aiMetadata: row.ai_metadata,
      status: row.status as any,
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

    if (error) {
      console.error('Error fetching opportunities:', error);
      console.warn('Using mock data. If you see 401 errors, check your VITE_SUPABASE_ANON_KEY in .env');
      // Fallback to mock data if DB is empty or fails (e.g. invalid key)
      if (!data) return MOCK_DATA;
      return [];
    }
    
    // If DB is empty, return MOCK_DATA for the demo to look good
    if (data.length === 0) return MOCK_DATA;

    return data.map(this.mapFromDb);
  }

  async getById(id: string): Promise<Opportunity | undefined> {
    // Check mock data first for hardcoded IDs
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

  // --- FEEDBACK & VOTING ---

  async submitDetailedFeedback(id: string, payload: { 
      type: 'upvote' | 'downvote' | 'report', 
      intent?: 'will_apply' | 'maybe',
      reason?: 'not_relevant' | 'expired' | 'suspicious' | 'not_eligible'
  }): Promise<void> {
    
    // 1. Fetch current feedback object
    const { data: currentData } = await supabase
      .from('opportunities')
      .select('user_feedback')
      .eq('id', id)
      .single();

    let feedback = currentData?.user_feedback || { upvotes: 0, downvotes: 0, reports: 0 };

    // 2. Modify counters
    if (payload.type === 'upvote') feedback.upvotes = (feedback.upvotes || 0) + 1;
    if (payload.type === 'downvote') feedback.downvotes = (feedback.downvotes || 0) + 1;
    if (payload.type === 'report') feedback.reports = (feedback.reports || 0) + 1;

    // 3. Modify Detailed Metrics
    if (payload.intent === 'will_apply') {
        feedback.applicationIntent = (feedback.applicationIntent || 0) + 1;
    }

    if (payload.reason) {
        if (!feedback.rejectionReasons) feedback.rejectionReasons = {};
        feedback.rejectionReasons[payload.reason] = (feedback.rejectionReasons[payload.reason] || 0) + 1;
    }

    // 4. Update DB
    const updatePayload: any = { user_feedback: feedback };
    
    if (feedback.reports >= 5) {
        updatePayload.status = 'rejected';
    }

    await supabase
      .from('opportunities')
      .update(updatePayload)
      .eq('id', id);
  }

  // --- AGENT / INBOX WORKFLOW ---

  async getInbox(): Promise<Opportunity[]> {
    const { data, error } = await supabase
      .from('opportunities')
      .select('*')
      .eq('status', 'draft')
      .order('created_at', { ascending: false });

    if (error) return [];
    return (data || []).map(this.mapFromDb);
  }

  async addToInbox(opportunities: Opportunity[]): Promise<number> {
    if (opportunities.length === 0) return 0;
    
    const rowsToInsert = opportunities.map(opp => ({
        ...this.mapToDb(opp),
        // Ensure status is draft
        status: 'draft',
        verification_status: 'draft'
    }));
    
    const { error } = await supabase
        .from('opportunities')
        .insert(rowsToInsert);

    if (error) {
        console.error("Failed to add to inbox", error);
        return 0;
    }
    return opportunities.length;
  }

  async approveOpportunity(id: string): Promise<void> {
    // 1. Update Status in DB
    const { data, error } = await supabase
      .from('opportunities')
      .update({
        status: 'published',
        verification_status: 'verified',
        last_edited_by: 'admin',
        organizer_email_sent: true,
        created_at: new Date().toISOString() // Bump timestamp to now so it appears at top
      })
      .eq('id', id)
      .select()
      .single();

    if (error || !data) return;

    const opp = this.mapFromDb(data);

    // 2. Trigger External Actions
    await emailService.sendSubscriberAlert(opp);
    await emailService.sendOrganizerOutreach(opp);
  }

  async rejectOpportunity(id: string): Promise<void> {
    await supabase
      .from('opportunities')
      .update({ status: 'rejected' })
      .eq('id', id);
  }

  async clearInbox(): Promise<void> {
    await supabase
      .from('opportunities')
      .delete()
      .eq('status', 'draft');
  }

  // --- ORGANIZER ACTIONS (Called from Feedback Page) ---

  async organizerVerify(id: string): Promise<boolean> {
      const { error } = await supabase
        .from('opportunities')
        .update({ verification_status: 'organizer_verified' })
        .eq('id', id);

      return !error;
  }

  async organizerRemove(id: string): Promise<boolean> {
      const { error } = await supabase
        .from('opportunities')
        .update({ status: 'removed_by_organizer' })
        .eq('id', id);
        
      return !error;
  }

  async organizerUpdate(id: string, updates: Partial<Opportunity>): Promise<boolean> {
      const dbUpdates = this.mapToDb(updates);
      
      const { error } = await supabase
        .from('opportunities')
        .update({
            ...dbUpdates,
            last_edited_by: 'organizer',
            verification_status: 'organizer_verified'
        })
        .eq('id', id);

      return !error;
  }
}

export const opportunityService = new OpportunityService();