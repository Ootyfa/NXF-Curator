import { supabase } from './supabase';
import { Opportunity, MockEmail } from '../types';

class EmailService {
  private inMemoryLogs: MockEmail[] = [];

  // Helper for synchronous UI access (fallback)
  getLogs(): MockEmail[] {
    return this.inMemoryLogs; 
  }

  // Refresh logs from DB
  async fetchLogsFromDb(): Promise<MockEmail[]> {
      const { data } = await supabase
        .from('system_emails')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);
      
      if (data) {
          this.inMemoryLogs = data.map(row => ({
              id: row.id,
              to: row.to_address,
              subject: row.subject,
              body: row.body,
              timestamp: row.created_at,
              type: row.type,
              actionLink: row.action_link
          }));
      }
      return this.inMemoryLogs;
  }

  async clearLogs() {
      await supabase.from('system_emails').delete().neq('id', '00000000-0000-0000-0000-000000000000'); 
      this.inMemoryLogs = [];
  }

  // 1. Notify Subscribers (Users)
  async sendSubscriberAlert(opportunity: Opportunity) {
    const email: Partial<MockEmail> = {
      to: 'subscribers@nxfcurator.org (BCC: 1,240 users)',
      subject: `🔥 New Opportunity Alert: ${opportunity.title}`,
      body: `Hi Creator, a new opportunity "${opportunity.title}" offering ${opportunity.grantOrPrize} has just been added. Deadline: ${opportunity.deadline}. Apply now!`,
      timestamp: new Date().toISOString(),
      type: 'subscriber_alert'
    };

    await this.logEmailToDb(email);
  }

  // 2. Notify Organizer (Governance Flow)
  async sendOrganizerOutreach(opportunity: Opportunity) {
    const baseUrl = window.location.origin + window.location.pathname;
    const actionLink = `${baseUrl}#/organizer-feedback/${opportunity.id}`;

    const email: Partial<MockEmail> = {
      to: opportunity.contact?.email || `info@${opportunity.organizer.replace(/\s+/g, '').toLowerCase()}.com`,
      subject: `[Action Required] Listing for ${opportunity.title} on NXF Curator`,
      body: `Dear ${opportunity.organizer} Team, \n\nWe have automatically listed your opportunity "${opportunity.title}" on our platform to help Indian creators find you.\n\nPlease review your listing.\n\n1. Is it accurate? Click Verify.\n2. Want to change details? Click Edit.\n3. Want it gone? Click Remove.\n\nAccess your dashboard here: ${actionLink}`,
      timestamp: new Date().toISOString(),
      type: 'organizer_outreach',
      actionLink: actionLink
    };

    await this.logEmailToDb(email);
  }

  private async logEmailToDb(email: Partial<MockEmail>) {
      // Update memory immediately for UI responsiveness
      this.inMemoryLogs.unshift({
          id: `temp-${Date.now()}`,
          to: email.to!,
          subject: email.subject!,
          body: email.body!,
          timestamp: email.timestamp!,
          type: email.type as any,
          actionLink: email.actionLink
      });

      await supabase.from('system_emails').insert({
          to_address: email.to,
          subject: email.subject,
          body: email.body,
          type: email.type,
          action_link: email.actionLink
      });
  }
}

export const emailService = new EmailService();