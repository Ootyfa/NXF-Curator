
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

    if (error) {
      console.warn("Supabase fetch failed (using mock data):", error.message);
      return MOCK_DATA;
    }

    if (!data || data.length === 0) {
      return MOCK_DATA;
    }
    return data.map((row) => this.mapFromDb(row));
  }

  async getById(id: string): Promise<Opportunity | undefined> {
    // Check mock first for static data consistency during demos
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

  async checkExists(title: string | null, sourceUrl?: string): Promise<boolean> {
      try {
          if (sourceUrl) {
              const { count } = await supabase
                .from('opportunities')
                .select('id', { count: 'exact', head: true })
                .eq('source_url', sourceUrl);
              if (count !== null && count > 0) return true;
          }
          if (title && title.length > 5) {
              const { count } = await supabase
                .from('opportunities')
                .select('id', { count: 'exact', head: true })
                .ilike('title', title);
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
          
          row.status = 'published';
          row.verification_status = 'verified';

          if (!row.deadline_date || row.deadline_date.trim() === '') {
              row.deadline_date = null;
          }

          const cleanRow = Object.fromEntries(
              Object.entries(row).filter(([_, v]) => v !== undefined && v !== null)
          );

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
    // Extract social content from metadata if present
    const aiMeta = row.ai_metadata || {};
    
    // Calculate daysLeft dynamically
    let daysLeft = 0;
    if (row.deadline_date) {
        const today = new Date();
        const deadline = new Date(row.deadline_date);
        today.setHours(0,0,0,0);
        deadline.setHours(0,0,0,0);
        const diffTime = deadline.getTime() - today.getTime();
        daysLeft = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    }

    return {
      id: row.id,
      title: row.title || "Untitled",
      deadline: row.deadline_text || row.deadline || "TBD",
      deadlineDate: row.deadline_date,
      daysLeft: daysLeft,
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
      aiMetadata: aiMeta,
      instagramCaption: aiMeta.instagramCaption, // Map from metadata
      status: row.status || 'draft',
      userFeedback: row.user_feedback,
      lastEditedBy: row.last_edited_by,
    };
  }

  private mapToDb(opp: Partial<Opportunity>) {
    // Persist social content into metadata
    const combinedMetadata = {
        ...(opp.aiMetadata || {}),
        instagramCaption: opp.instagramCaption
    };

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
      ai_metadata: combinedMetadata,
      status: opp.status,
      last_edited_by: opp.lastEditedBy,
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