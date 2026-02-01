

export interface Opportunity {
  id: string;
  title: string;
  deadline: string; // Display string e.g. "March 20, 2024"
  deadlineDate?: string; // ISO Date for sorting e.g. "2024-03-20"
  daysLeft: number;
  organizer: string;
  grantOrPrize: string;
  eligibility: string[];
  type: 'Festival' | 'Lab' | 'Grant' | 'Residency';
  scope?: 'National' | 'International';
  description?: string;
  category?: string;
  applicationFee?: string; // Cost to apply
  submissionPlatform?: string; // New: e.g. "FilmFreeway", "Direct Website"
  eventDates?: string;
  requirements?: string[];
  contact?: {
    website: string;
    email: string;
    phone: string;
  };
  
  // Verification & Trust
  verificationStatus: 'verified' | 'organizer_verified' | 'draft'; // To show trust level
  sourceUrl?: string; // Where the crawler found this
  createdAt?: string;
  groundingSources?: string[]; // Array of URLs from Google Search Grounding
  
  // AI Agent & Metadata
  aiConfidenceScore?: number; // 0-100 Relevance Score
  aiReasoning?: string; // Why the AI chose this
  aiMetadata?: {
    model: string;
    discoveryQuery: string;
    discoveryDate: string;
  };
  
  // Workflow Status
  status?: 'published' | 'draft' | 'rejected' | 'removed_by_organizer';
  organizerEmailSent?: boolean;
  lastEditedBy?: 'ai' | 'admin' | 'organizer';
  organizerActionToken?: string; // Mock token for the link

  // User Feedback & Governance
  userFeedback?: {
    upvotes: number;
    downvotes: number;
    reports: number;
    applicationIntent?: number; // Count of users who said they will apply
    rejectionReasons?: {
      not_relevant?: number;
      expired?: number;
      suspicious?: number;
      not_eligible?: number;
    };
  };
}

export interface Festival {
  id: string;
  title: string;
  location: string;
  dates: string;
  deadline: string;
  awards: string;
  categories: string;
  fee: string;
  focus?: string;
}

export interface MockEmail {
  id: string;
  to: string;
  subject: string;
  body: string;
  timestamp: string;
  type: 'subscriber_alert' | 'organizer_outreach';
  actionLink?: string; // The simulation link
}

export type UserRole = 'creator' | 'organizer';