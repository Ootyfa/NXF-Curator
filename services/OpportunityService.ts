import { supabase } from './supabase';
import { Opportunity } from '../types';
import { emailService } from './EmailService';
import { OPPORTUNITIES as MOCK_DATA } from '../constants';

class OpportunityService {
  
  // --- PUBLIC API ---

  async getAll(): Promise<Opportunity[]> {
    const { data, error } = await supabase
      .from('opportunities')
      .select('*')
      .neq('status', 'removed_by_organizer')
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

  // --- MANUAL CURATION API ---

  async createOpportunity(opp: Partial<Opportunity>): Promise<{ success: boolean; id?: string; error?: string }> {
      const row = this.mapToDb(opp);
      
      // Ensure status is published for manual entry
      row.status = 'published';
      row.verification_status = 'verified';

      const { data, error } = await supabase
          .from('opportunities')
          .insert(row)
          .select()
          .single();

      if (error) {
          console.error("DB Insert Error", error);
          return { success: false, error: error.message };
      }

      return { success: true, id: data.id };
  }

  // --- MAPPING HELPERS ---
  private mapFromDb(row: any): Opportunity {
    return {
      id: row.id,
      title: row.title || "Untitled",
      deadline: row.deadline_text || row.deadline || "TBD",
      deadlineDate: row.deadline_date,
      daysLeft: row.daysLeft || 0,
      organizer: row.organizer || "Unknown",
      grantOrPrize: row.grant_or_prize || "N/A",
      eligibility: row.eligibility || [],
      type: row.type || 'Grant',
      scope: row.scope || 'National',
      description: row.description,
      category: row.category,
      applicationFee: row.application_fee,
      submissionPlatform: row.submission_platform,
      eventDates: row.event_dates,
      requirements: row.requirements || [],
      contact: row.contact_info,
      verificationStatus: row.verification_status || 'draft',
      sourceUrl: row.source_url,
      createdAt: row.created_at,
      groundingSources: row.grounding_sources,
      aiConfidenceScore: row.ai_confidence_score,
      aiReasoning: row.ai_reasoning,
      aiMetadata: row.ai_metadata,
      status: row.status || 'draft',
      userFeedback: row.user_feedback,
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
    };
  }
  
  // Stubs for compatibility & Feedback Logic
  async getInbox() { return []; }
  async addToInbox() { return 0; }
  async approveOpportunity() {}
  async rejectOpportunity() {}
  async clearInbox() {}

  async submitDetailedFeedback(id: string, feedback: any) {
    console.log(`[OpportunityService] Submitting feedback for ${id}`, feedback);
    // In a real app, we would upsert into a feedback table or increment counters in opportunities
  }

  async organizerVerify(id: string) {
    await supabase
      .from('opportunities')
      .update({ verification_status: 'organizer_verified' })
      .eq('id', id);
  }

  async organizerRemove(id: string) {
    await supabase
      .from('opportunities')
      .update({ status: 'removed_by_organizer' })
      .eq('id', id);
  }

  async organizerUpdate(id: string, data: Partial<Opportunity>) {
    const dbData = this.mapToDb(data);
    await supabase
      .from('opportunities')
      .update(dbData)
      .eq('id', id);
  }
}

export const opportunityService = new OpportunityService();