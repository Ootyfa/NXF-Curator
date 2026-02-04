
import { supabase } from './supabase';
import { Opportunity } from '../types';
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
      // Fallback to mock data only if DB is empty or fails, mostly for demo purposes
      // In a real app, you might prefer returning [] on error after logging
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

  /**
   * Checks if an opportunity exists by URL (exact) or Title (fuzzy/case-insensitive).
   * Used by AI Agent to prevent duplicate API costs.
   */
  async checkExists(title: string | null, sourceUrl?: string): Promise<boolean> {
      try {
          // 1. Check URL first (Fastest & Most Accurate)
          if (sourceUrl) {
              const { count } = await supabase
                .from('opportunities')
                .select('id', { count: 'exact', head: true })
                .eq('source_url', sourceUrl);
              
              if (count !== null && count > 0) return true;
          }

          // 2. Check Title if provided (Fuzzy)
          if (title && title.length > 5) {
              const { count } = await supabase
                .from('opportunities')
                .select('id', { count: 'exact', head: true })
                .ilike('title', title); // Case-insensitive match
              
              if (count !== null && count > 0) return true;
          }
      } catch (e) {
          console.warn("Check exists failed, assuming false to proceed", e);
      }

      return false;
  }

  async createOpportunity(opp: Partial<Opportunity>): Promise<{ success: boolean; id?: string; error?: string }> {
      try {
          const row = this.mapToDb(opp);
          
          // Force Clean Data for Insert
          row.status = 'published';
          row.verification_status = 'verified';

          // Handle Dates strictly
          if (!row.deadline_date || row.deadline_date.trim() === '') {
              row.deadline_date = null;
          }

          // Remove undefined keys entirely to prevent JSON serialization issues
          // This often causes "TypeError: Load failed" in fetch if body is malformed
          const cleanRow = Object.fromEntries(
              Object.entries(row).filter(([_, v]) => v !== undefined && v !== null)
          );

          // Insert
          const { data, error } = await supabase
              .from('opportunities')
              .insert(cleanRow)
              .select()
              .single();

          if (error) {
              console.error("DB Insert Error:", error);
              return { success: false, error: error.message };
          }

          return { success: true, id: data.id };
      } catch (err: any) {
          console.error("OpportunityService Unexpected Error:", err);
          return { success: false, error: err.message || "Network/Client Error" };
      }
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
  
  async getInbox() { return []; }
  async addToInbox() { return 0; }
  async approveOpportunity() {}
  async rejectOpportunity() {}
  async clearInbox() {}

  async submitDetailedFeedback(id: string, feedback: any) {
    console.log(`[OpportunityService] Submitting feedback for ${id}`, feedback);
  }

  async organizerVerify(id: string) {
    await supabase.from('opportunities').update({ verification_status: 'organizer_verified' }).eq('id', id);
  }

  async organizerRemove(id: string) {
    await supabase.from('opportunities').update({ status: 'removed_by_organizer' }).eq('id', id);
  }

  async organizerUpdate(id: string, data: Partial<Opportunity>) {
    const dbData = this.mapToDb(data);
    await supabase.from('opportunities').update(dbData).eq('id', id);
  }
}

export const opportunityService = new OpportunityService();
