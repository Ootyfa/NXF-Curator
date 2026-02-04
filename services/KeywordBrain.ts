
// ============================================================
// KEYWORD BRAIN
// A database of 100+ high-value search terms for Indian Creators
// ============================================================

export class KeywordBrain {
  private static instance: KeywordBrain;
  
  // The master list of keywords
  private keywords: string[] = [
    // --- FILM & VIDEO ---
    "film grants India 2025 deadline",
    "documentary funding India open call",
    "short film funding India 2025",
    "NFDC film bazaar application",
    "PSBT documentary grant submission",
    "Mumbai International Film Festival submission 2025",
    "IFFI Goa submission deadline",
    "Dharamshala International Film Festival submit",
    "Kerala State Film Development Corporation grants",
    "screenwriting labs India 2025",
    "cinematography workshops India free",
    "women filmmakers grant India",
    "student film festival India submission",
    "animation production grant India",
    "web series funding India pitch",
    "feature film completion fund India",
    "docedge kolkata application",
    "IDSFFK submission 2025",
    "film independent global media makers india",
    "Asian cinema fund submission",
    "Busan film festival asian project market",
    "Rotterdam film festival Hubert Bals Fund India",
    "Sundance documentary fund India eligibility",
    "Bertha Foundation documentary grant",
    "IDFA Bertha Fund submission",
    "Hot Docs Blue Ice Fund",
    "Tribeca All Access India",
    "Netflix India creative equity fund",
    "Amazon Prime Video India pitch",
    "VR filmmaking grant India",
    "immersive storytelling funding India",
    "screenplay contest India cash prize",
    
    // --- VISUAL ARTS ---
    "artist residency India 2025 open call",
    "Kochi Muziris Biennale application",
    "Serendipity Arts Festival grants",
    "Inlaks Shivdasani Foundation art awards",
    "Raza Foundation award for visual arts",
    "Khoj International Artists' Association residency",
    "TIFA Working Studios Pune residency",
    "1Shanthiroad Studio Gallery residency",
    "What About Art residency Mumbai",
    "Space118 residency Mumbai application",
    "Kalanirvana international art residency",
    "Pepper House residency Kochi",
    "Sanskriti Museums residency Delhi",
    "Kalakriti Art Gallery fellowship",
    "visual arts exhibition grant India government",
    "Lalit Kala Akademi scholarship",
    "Pollock-Krasner Foundation grant India",
    "Elizabeth Greenshields Foundation grant",
    "curatorial fellowship India",
    "public art grant India",
    "sculpture park commission India",
    "illustration awards India 2025",
    "photography grant India 2025",
    "Alkazi Foundation photography grant",
    "India Habitat Centre photography fellowship",
    "art curator grant India",
    "graphic novel grant India",
    "street art festival open call India",
    "ceramic residency India",
    "printmaking workshop funding India",
    "call for artists India 2025",
    "emerging artist award India",

    // --- PERFORMING ARTS (DANCE/THEATRE/MUSIC) ---
    "theatre production grant India",
    "dance residency India 2025",
    "classical music scholarship India",
    "Sangeet Natak Akademi awards application",
    "India Foundation for the Arts grants",
    "Ratan Tata Trust arts grants",
    "Aditya Birla Kala Kiran Puraskar",
    "Mahindra Excellence in Theatre Awards submission",
    "Prithvi Theatre festival submission",
    "NCPA Mumbai experimental theatre open call",
    "Attakkalari interim festival open call",
    "Gati Dance Forum residency",
    "music production grant India independent",
    "folk arts grant ministry of culture India",
    "travel grant for indian artists",
    "British Council India arts grant",
    "Goethe-Institut India arts funding",
    "Alliance Francaise India cultural grant",
    "Pro Helvetia India residency",
    "performing arts tour grant",
    "contemporary dance funding India",
    "theatre residency open call India",
    "music residency India application",
    "folk music research grant India",
    "puppetry arts grant India",
    "choreography grant India",
    "indie music festival submission India",

    // --- LITERATURE & WRITING ---
    "creative writing residency India",
    "Sangam House residency application",
    "Toto Funds the Arts creative writing",
    "Sahitya Akademi young writer award",
    "poetry chapbook contest India",
    "short story competition India prize",
    "translation grants India",
    "script writing contest India 2025",
    "playwriting competition India",
    "publishing grant for indian authors",
    "Jaipur Literature Festival speaking pitch",
    "debut novel prize India",
    "poetry residency India",
    "literary translation funding India",
    "writer in residence India",
    
    // --- GENERAL & GOVERNMENT ---
    "Ministry of Culture India fellowship scheme",
    "CCRT scholarship for young artists",
    "National Scholarship for Culture India",
    "Junior Research Fellowship for Arts UGC",
    "Fulbright-Nehru Academic and Professional Excellence Fellowships",
    "Charles Wallace India Trust Awards",
    "Inlaks Fine Arts Award",
    "K.C. Mahindra Scholarship for Post Graduate Studies Abroad",
    "J N Tata Endowment for the Higher Education",
    "Aga Khan Music Awards",
    "Prince Claus Fund open call",
    "Asian Cultural Council grant",
    "Ford Foundation grants India",
    "Rockefeller Foundation Bellagio Center residency",
    "social impact art grant India",
    "community art project funding",
    "digital art grant India",
    "NFT art fund India",
    "arts management fellowship India",
    "museum curation course scholarship",
    "heritage preservation grant India",
    "cultural entrepreneurship grant India",
    "museum fellowship India",
    "archival research grant India",
    "craft revival grant India",
    "Zonal Cultural Centre schemes India",
    "corporate CSR arts grants India"
  ];

  static get(): KeywordBrain {
    if (!KeywordBrain.instance) KeywordBrain.instance = new KeywordBrain();
    return KeywordBrain.instance;
  }

  /**
   * Returns a random set of keywords to try for a scan session.
   */
  getBatch(count: number = 3): string[] {
    const shuffled = [...this.keywords].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, count);
  }

  /**
   * Adds new keywords to the system (learning behavior).
   */
  learn(newKeywords: string[]) {
    newKeywords.forEach(k => {
      const clean = k.trim().toLowerCase();
      if (clean && !this.keywords.includes(clean)) {
        this.keywords.push(clean);
      }
    });
    console.log(`🧠 Brain updated. Total keywords: ${this.keywords.length}`);
  }

  getCount(): number {
    return this.keywords.length;
  }
}
