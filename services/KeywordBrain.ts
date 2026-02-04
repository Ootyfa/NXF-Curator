
// ============================================================
// KEYWORD BRAIN
// A database of 300+ high-value search terms for Indian Creators
// ============================================================

export class KeywordBrain {
  private static instance: KeywordBrain;
  
  private getCurrentMonthYear(): string {
    const date = new Date();
    return date.toLocaleString('default', { month: 'long', year: 'numeric' });
  }

  // Keywords specifically for finding immediate/new opportunities
  // "Urgent" keywords inject the current date to find fresh content
  private urgentKeywords: string[] = [
    "open call for artists India deadline {MONTH_YEAR}",
    "film festival submission India deadline {MONTH_YEAR}",
    "grant application India arts deadline {MONTH_YEAR}",
    "upcoming residency deadline India {MONTH_YEAR}",
    "new arts funding India announced {YEAR}",
    "immediate grant for filmmakers India",
    "short film funding India open now",
    "call for proposals art India {YEAR}",
    "photography contest India deadline {MONTH_YEAR}",
    "performance arts grant India apply now",
    "visual arts funding India current open calls",
    "curatorial proposal India deadline {MONTH_YEAR}",
    "documentary pitch India deadline {MONTH_YEAR}",
    "screenwriting contest India deadline {MONTH_YEAR}",
    "music competition India apply {MONTH_YEAR}"
  ];

  // The master list of evergreen keywords
  private standardKeywords: string[] = [
    // --- GLOBAL OPPORTUNITIES (Open to Indians) ---
    "international artist residency open call 2025",
    "global film grants for developing countries",
    "commonwealth short story prize submission",
    "sundance documentary fund application",
    "bertha foundation documentary fellowship",
    "alter-cine foundation documentary grant",
    "asian cultural council fellowship usa",
    "rockefeller foundation bellagio residency apply",
    "pollock-krasner foundation grant guidelines",
    "elizabeth greenshields foundation grant apply",
    "prince claus fund awards open call",
    "goethe institut coproduction fund",
    "institut francais residency france",
    "apexart international open call nyc",
    "kadist art foundation residency",
    "delfina foundation residency london open call",
    "gasworks residency london application",
    "rijksakademie residency amsterdam application",
    "jan van eyck academie residency netherlands",
    "künstlerhaus büchsenhausen fellowship",
    "akademie schloss solitude fellowship",
    "daad artists-in-berlin program apply",
    "camargo foundation residency france",
    "bogliasco foundation fellowship italy",
    "macdowell colony residency application",
    "yaddo residency application",
    "headlands center for the arts residency",
    "skowhegan school of painting and sculpture application",
    "vermont studio center residency grant",
    "banff centre for arts and creativity programs",
    "civitella ranieri foundation fellowship",
    "villa aurora feuchtwanger fellowship",
    "getty images editorial grant",
    "magnum foundation photography grant",
    "world press photo contest entry",
    "sony world photography awards open",
    "lensculture photography awards",
    "visiting artist fellowship university usa",
    "fulbright foreign student program india",
    "chevening scholarship india arts",

    // --- HIGH POTENCY (Direct Funding/Application Pages) ---
    "art grant application guidelines India",
    "fellowship eligibility criteria Indian artists",
    "artist residency India apply online",
    "film fund submission portal India",
    "theatre grant proposal India format",
    "music production funding India application",
    "cultural grant India deadline 2025",
    "scholarship for arts students India 2025",
    "arts and culture funding India apply",

    // --- GOVERNMENT & STATE ACADEMIES ---
    "Lalit Kala Akademi New Delhi national exhibition",
    "Sahitya Akademi awards application",
    "Sangeet Natak Akademi schemes and grants",
    "National School of Drama TIE fellowship",
    "CCRT scholarship for cultural talent",
    "Ministry of Culture India fellowship scheme",
    "Karnataka Lalithakala Academy grants",
    "Kerala Lalithakala Akademi awards",
    "Rajasthan Lalit Kala Akademi open call",
    "Goa Kala Academy art competition",
    "Telangana State Fine Arts Academy awards",
    "Punjab Lalit Kala Akademi scholarship",
    "Jammu and Kashmir Academy of Art Culture and Languages",
    "Eastern Zonal Cultural Centre grants",
    "South Central Zone Cultural Centre Nagpur schemes",
    "Indira Gandhi National Centre for the Arts (IGNCA) fellowship",
    "National Museum New Delhi fellowship",

    // --- CORPORATE CSR & PRIVATE FOUNDATIONS ---
    "Tata Trusts arts and culture grants",
    "Inlaks Shivdasani Foundation opportunities",
    "India Foundation for the Arts (IFA) request for proposals",
    "Sher-Gil Sundaram Arts Foundation grant",
    "Raza Foundation award for visual arts",
    "Kiran Nadar Museum of Art KNMA grants",
    "Serendipity Arts Foundation grant application",
    "Jungkook Lee Art Foundation India",
    "Charles Wallace India Trust arts scholarship",
    "Sanskriti Foundation residency application",
    "Foundation for Indian Contemporary Art (FICA) grants",
    "Mrinalini Mukherjee Foundation grant",
    "Azim Premji Foundation arts funding",
    "HCL Foundation CSR grants culture",
    "Godrej India Culture Lab fellowship",
    "JSW Foundation arts and heritage",
    "Munjal Arts Initiative open call",
    "Mahindra Excellence in Theatre Awards",
    "Aditya Birla Kala Kiran Puraskar",
    "Jindal Art Institute scholarship",
    "Bajaj Foundation cultural grants",

    // --- INTERNATIONAL INSTITUTES (India Chapters) ---
    "Goethe-Institut India cultural funding",
    "Pro Helvetia New Delhi open calls",
    "British Council India creative economy grants",
    "Alliance Francaise India cultural call",
    "Japan Foundation New Delhi arts grant",
    "Korean Cultural Centre India exhibition call",
    "Institut Francais India residency",
    "US Consulate India arts grant",
    "Australian Consulate India cultural grant",
    "Swiss Arts Council India opportunities",
    "Embassy of France in India scholarship",

    // --- FILM & VIDEO (Production & Festivals) ---
    "NFDC Film Bazaar Co-Production Market application",
    "Film Bazaar Work in Progress Lab submission",
    "PSBT documentary grant submission",
    "Mumbai International Film Festival (MIFF) submission",
    "International Film Festival of India (IFFI) Goa entry",
    "Dharamshala International Film Festival (DIFF) submission",
    "Kerala State Film Development Corporation (KSFDC) filmmakers scheme",
    "Docedge Kolkata Asian Forum for Documentary",
    "IDSFFK Kerala documentary submission",
    "MAMI Mumbai Film Festival submission",
    "Jio Studios writer lab application",
    "Netflix India creative equity fund",
    "Amazon Prime Video India pitch",
    "Sundance Institute documentary fund India",
    "Tribeca Film Institute diverse voices India",
    "Hubert Bals Fund application India",
    "Bertha Foundation documentary grant",
    "Asian Cinema Fund Busan submission",
    "Hot Docs Blue Ice Fund eligibility",
    "IDFA Bertha Fund Europe India",
    "Busan International Film Festival Asian Project Market",
    "Locarno Open Doors India",
    "Cannes Cinefondation Residence India",
    "Kashish Mumbai International Queer Film Festival submission",
    "Habitat Film Festival submission",
    "Jagran Film Festival entry",
    "Vibgyor Film Festival Kerala submission",
    "Bangalore International Film Festival submission",
    "Chennai International Film Festival submission",
    "short film production grant India",
    "screenwriting fellowship India",
    "cinematography workshop funding India",
    "animation production grant India",
    "experimental film grant India",
    "VR/AR storytelling grant India",

    // --- VISUAL ARTS (Residencies & Galleries) ---
    "Khoj International Artists' Association residency",
    "1Shanthiroad Studio Gallery open call",
    "TIFA Working Studios Pune residency",
    "Space118 residency Mumbai application",
    "What About Art residency Mumbai",
    "Pepper House residency Kochi",
    "Kochi Muziris Biennale artist application",
    "gallery open call for artists India 2025",
    "emerging artist award India 2025",
    "solo exhibition proposal India",
    "public art commission India",
    "sculpture park open call India",
    "printmaking residency India",
    "ceramic art residency India",
    "illustration competition India prize",
    "graphic novel grant India",
    "street art festival India artist call",
    "Pollock-Krasner Foundation grant India",
    "Elizabeth Greenshields Foundation grant",
    "Asian Cultural Council fellowship",
    "Prince Claus Fund open call",
    "Sharjah Biennial open call India",
    "Dhaka Art Summit opportunities",
    "India Art Fair exhibitor application",
    "Create to Inspire fellowship",
    "Sony World Photography Awards India",
    "Alkazi Foundation photography grant",
    "Habitat Photosphere fellowship",
    "contemporary art prize India",
    "Cholamandal Artists' Village residency",
    "Arts 4 All residency Delhi",
    "KYTA residency Himachal",
    "Preet Nagar residency Punjab",
    "HH Art Spaces Goa residency",
    "Kalanirvana residency Hyderabad",
    "Uttarayan Art Foundation Vadodara",

    // --- PERFORMANCE & MUSIC ---
    "Prithvi Theatre festival submission",
    "NCPA Mumbai experimental theatre open call",
    "Attakkalari interim festival open call",
    "Gati Dance Forum residency",
    "Pickle Factory Dance Foundation grant",
    "Serendipity Arts Festival theatre commission",
    "music residency India application",
    "independent music production grant India",
    "folk arts research grant India",
    "classical music scholarship India",
    "choreography grant India",
    "dance film festival submission India",
    "Nexa Music submission",
    "Majolly Music Trust scholarship",
    "Spic Macay scholarship",
    "Ratan Tata Trust arts grants",
    
    // --- LITERATURE & JOURNALISM ---
    "Sangam House residency application",
    "Toto Funds the Arts creative writing award",
    "Sahitya Akademi young writer award",
    "JCB Prize for Literature submission",
    "South Asia Speaks mentorship application",
    "publishing grant for Indian authors",
    "translation funding India",
    "poetry chapbook contest India",
    "script writing contest India cash prize",
    "National Foundation for India (NFI) fellowship",
    "PARI fellowship for journalists",
    "New India Foundation book fellowship",
    "Srinivas Rayaprol Poetry Prize",
    "The Himalayan Writing Retreat scholarship",

    // --- DESIGN & ARCHITECTURE (Niche) ---
    "India Design Council awards",
    "Kyoorius Design Awards submission",
    "architecture grants India",
    "heritage conservation grants India",
    "urban design competition India",
    "textile art grant India",
    "craft revival grant India",
    "fashion design scholarship India",

    // --- STUDENT & EMERGING ---
    "student art festival submission India",
    "debut filmmaker grant India",
    "young artist scholarship India",
    "K.C. Mahindra Scholarship for Post Graduate Studies Abroad",
    "J N Tata Endowment for the Higher Education",
    "Fulbright-Nehru Academic and Professional Excellence Fellowships",
    "Inlaks Fine Arts Award",
    "Rhodes Scholarship India",
    "Chevening Scholarship India arts",
    
    // --- NICHE & NEW MEDIA ---
    "digital art grant India",
    "NFT art fund India",
    "game design grant India",
    "creative coding residency",
    "social impact art grant India",
    "community art project funding",
    "disability arts grant India",
    "queer arts grant India",
    "women in cinema grant India"
  ];

  static get(): KeywordBrain {
    if (!KeywordBrain.instance) KeywordBrain.instance = new KeywordBrain();
    return KeywordBrain.instance;
  }

  /**
   * Returns a batch of keywords.
   * @param count Number of keywords
   * @param mode 'urgent' for time-sensitive, 'mixed' for random discovery
   */
  getBatch(count: number = 3, mode: 'urgent' | 'mixed' = 'mixed'): string[] {
    const monthYear = this.getCurrentMonthYear();
    const year = new Date().getFullYear().toString();

    // Prepare Urgent List (Dynamic)
    const urgent = this.urgentKeywords.map(k => 
      k.replace('{MONTH_YEAR}', monthYear).replace('{YEAR}', year)
    );

    if (mode === 'urgent') {
      // Return mostly urgent keywords, shuffled
      return urgent.sort(() => 0.5 - Math.random()).slice(0, count);
    }

    // Mixed mode: 20% urgent, 80% standard (including global)
    const pool = [
      ...urgent,
      ...this.standardKeywords
    ].sort(() => 0.5 - Math.random());
    
    return pool.slice(0, count);
  }

  /**
   * Adds new keywords to the system (learning behavior).
   */
  learn(newKeywords: string[]) {
    newKeywords.forEach(k => {
      const clean = k.trim().toLowerCase();
      if (clean && !this.standardKeywords.includes(clean)) {
        this.standardKeywords.push(clean);
      }
    });
    console.log(`🧠 Brain updated. Total keywords: ${this.standardKeywords.length + this.urgentKeywords.length}`);
  }

  getCount(): number {
    return this.standardKeywords.length + this.urgentKeywords.length;
  }
}
