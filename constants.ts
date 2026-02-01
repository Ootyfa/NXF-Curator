import { Opportunity, Festival } from './types';

export const OPPORTUNITIES: Opportunity[] = [
  {
    id: 'miff-2025',
    title: 'MIFF 2025 SUBMISSIONS',
    deadline: 'March 20, 2025',
    deadlineDate: '2025-03-20',
    daysLeft: 45,
    organizer: 'Mumbai International Film Festival',
    grantOrPrize: '₹5,00,000',
    eligibility: ['Short Films', 'Documentaries', 'Indian Filmmakers Only', 'Completed after Jan 2024'],
    type: 'Festival',
    scope: 'National',
    category: 'Film Festival Submission',
    applicationFee: '₹500 (Students: ₹250)',
    eventDates: 'June 1-10, 2025',
    requirements: [
      'Film Link (Vimeo/YouTube with password)',
      "Director's Statement (300 words)",
      'Film Stills (3-5 images)',
      "Director's Biography",
      'Entry Fee Payment Proof'
    ],
    contact: {
      website: 'https://miff.in',
      email: 'submissions@miff-india.com',
      phone: '+91-22-12345678'
    },
    verificationStatus: 'verified',
    sourceUrl: 'https://miff.in',
    status: 'published'
  },
  {
    id: 'nfdc-lab-2025',
    title: 'NFDC SCREENWRITERS LAB',
    deadline: 'April 15, 2025',
    deadlineDate: '2025-04-15',
    daysLeft: 72,
    organizer: 'National Film Development Corporation',
    grantOrPrize: 'Mentorship + ₹3,00,000 Grant',
    eligibility: ['Emerging Screenwriters', 'Feature Length Scripts', 'Indian Citizens'],
    type: 'Lab',
    scope: 'National',
    category: 'Mentorship Program',
    applicationFee: '₹1000',
    eventDates: 'August 2025',
    requirements: [
      'Script Synopsis (1 page)',
      'First 20 pages of screenplay',
      'Writer Bio',
      'Previous Work Link'
    ],
    contact: {
      website: 'https://www.nfdcindia.com',
      email: 'labs@nfdcindia.com',
      phone: '+91-22-87654321'
    },
    verificationStatus: 'verified',
    sourceUrl: 'https://nfdcindia.com',
    status: 'published'
  },
  {
    id: 'kerala-doc-fund-25',
    title: 'KERALA DOCUMENTARY FUND',
    deadline: 'May 10, 2025',
    deadlineDate: '2025-05-10',
    daysLeft: 98,
    organizer: 'Kerala Cultural Department',
    grantOrPrize: '₹8,00,000',
    eligibility: ['Documentary Filmmakers', 'Focus on Kerala Culture'],
    type: 'Grant',
    scope: 'National',
    category: 'Production Grant',
    applicationFee: 'Free',
    eventDates: 'Disbursement: July 2025',
    requirements: [
      'Detailed Budget',
      'Production Timeline',
      'Crew List',
      'Distribution Plan'
    ],
    contact: {
      website: 'https://keralaculture.org',
      email: 'grants@keralaculture.org',
      phone: '+91-471-1234567'
    },
    verificationStatus: 'verified',
    sourceUrl: 'https://keralaculture.org/grants',
    status: 'published'
  },
  {
    id: 'sundance-ignite-2025',
    title: 'SUNDANCE IGNITE X FELLOWSHIP',
    deadline: 'February 28, 2025',
    deadlineDate: '2025-02-28',
    daysLeft: 25,
    organizer: 'Sundance Institute',
    grantOrPrize: 'Year-long Mentorship',
    eligibility: ['Ages 18-25', 'Short Film Submission', 'Global Eligibility'],
    type: 'Lab',
    scope: 'International',
    category: 'Fellowship',
    applicationFee: '$15 USD',
    eventDates: 'Starts June 2025',
    requirements: [
      'Short Film (1-15 mins)',
      'Artist Statement',
      'Proof of Age'
    ],
    contact: {
      website: 'https://www.sundance.org/programs/ignite/',
      email: 'ignite@sundance.org',
      phone: ''
    },
    verificationStatus: 'verified',
    sourceUrl: 'https://www.sundance.org',
    status: 'published'
  }
];

export const FESTIVALS: Festival[] = [
  {
    id: 'iffi-goa-2025',
    title: 'International Film Festival of India (IFFI)',
    location: 'Goa, India',
    dates: 'Nov 20-28, 2025',
    deadline: 'August 31, 2025',
    awards: 'Golden Peacock, Silver Peacock',
    categories: 'Feature Films, Non-Feature Films',
    fee: 'Free (Selected Sections) / ₹1000',
    focus: 'World Cinema'
  },
  {
    id: 'mami-2025',
    title: 'Jio MAMI Mumbai Film Festival',
    location: 'Mumbai, India',
    dates: 'Oct 15-22, 2025',
    deadline: 'July 15, 2025',
    awards: 'Golden Gateway',
    categories: 'India Gold, International Competition',
    fee: '₹2000',
    focus: 'Independent Cinema'
  },
  {
    id: 'kiff-2025',
    title: 'Kolkata International Film Festival',
    location: 'Kolkata, India',
    dates: 'Dec 5-12, 2025',
    deadline: 'September 30, 2025',
    awards: 'Royal Bengal Tiger Award',
    categories: 'International, National, Short Films',
    fee: 'None',
    focus: 'Art House'
  },
  {
    id: 'dharamshala-diff-2025',
    title: 'Dharamshala International Film Festival',
    location: 'Dharamshala, Himachal Pradesh',
    dates: 'Nov 7-10, 2025',
    deadline: 'June 30, 2025',
    awards: 'Audience Awards',
    categories: 'Feature Docs, Narrative Features, Shorts',
    fee: '$20 - $40 USD',
    focus: 'Independent, Alternative'
  }
];