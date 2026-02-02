import React, { useState, useMemo, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Search, Sparkles, ShieldCheck, Globe, MapPin, Calendar, CreditCard, Users, ArrowRight } from 'lucide-react';
import { opportunityService } from '../services/OpportunityService';
import { Opportunity } from '../types';

const SCOPES = ['All', 'National', 'International'];

const Home: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedScope, setSelectedScope] = useState('All');
  
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const data = await opportunityService.getAll();
        setOpportunities(data);
      } catch (err) {
        console.error("Failed to load opportunities", err);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []);

  const filteredOpportunities = useMemo(() => {
    return opportunities.filter(opp => {
      const lowerTerm = searchTerm.toLowerCase();
      const matchesSearch = 
        opp.title.toLowerCase().includes(lowerTerm) || 
        opp.organizer.toLowerCase().includes(lowerTerm) ||
        opp.grantOrPrize.toLowerCase().includes(lowerTerm) ||
        (opp.description && opp.description.toLowerCase().includes(lowerTerm)) ||
        opp.eligibility.some(tag => tag.toLowerCase().includes(lowerTerm));
      
      const oppScope = opp.scope || 'National'; 
      const matchesScope = selectedScope === 'All' || oppScope === selectedScope;

      return matchesSearch && matchesScope;
    });
  }, [searchTerm, selectedScope, opportunities]);

  const clearFilters = () => {
    setSearchTerm('');
    setSelectedScope('All');
    setSearchParams({});
  };

  const SkeletonCard = () => (
    <div className="bg-white rounded-lg border border-border p-6 animate-pulse h-48">
      <div className="h-4 bg-gray-100 rounded w-1/4 mb-4"></div>
      <div className="h-6 bg-gray-100 rounded w-3/4 mb-4"></div>
      <div className="h-4 bg-gray-100 rounded w-full mb-2"></div>
      <div className="h-4 bg-gray-100 rounded w-2/3"></div>
    </div>
  );

  // Reusable Filter Button Component
  const FilterButton: React.FC<{ label: string, isActive: boolean, onClick: () => void }> = ({ label, isActive, onClick }) => (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-sm font-medium rounded-md transition-colors border ${
        isActive 
        ? 'bg-primary text-white border-primary' 
        : 'bg-white text-text border-border hover:border-primary hover:text-primary'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="min-h-screen bg-background text-secondary font-sans pb-16">
      
      {/* Hero Section */}
      <div className="bg-surface border-b border-border">
        <div className="max-w-4xl mx-auto px-4 py-16 text-center">
          <h1 className="text-3xl md:text-4xl font-bold mb-4">
            Curated Opportunities for Indian Creators
          </h1>
          <p className="text-text mb-8 text-lg">
             Discover verified grants, festivals, and residencies.
          </p>

          {/* Search Bar */}
          <div className="relative max-w-xl mx-auto mb-8">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
              <Search className="h-5 w-5 text-gray-400" />
            </div>
            <input
              type="text"
              placeholder="Search grants, residencies, and festivals..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="block w-full pl-11 pr-4 py-3 rounded-md border border-border bg-white text-secondary placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-shadow shadow-sm"
            />
          </div>

           {/* Scope Filters */}
           <div className="flex justify-center gap-2">
            {SCOPES.map(scope => (
              <FilterButton 
                key={scope}
                label={scope} 
                isActive={selectedScope === scope} 
                onClick={() => setSelectedScope(scope)} 
              />
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-12 sm:px-6">
        
        {/* Results Count */}
        <div className="mb-6 text-sm text-text-light flex justify-between items-center">
             <span>{loading ? 'Scanning...' : `Showing ${filteredOpportunities.length} opportunities`}</span>
             {searchTerm && (
                 <button onClick={clearFilters} className="text-primary hover:underline">Clear Search</button>
             )}
        </div>

        {/* Opportunities Grid (Single Column) */}
        <div className="grid grid-cols-1 gap-6">
          {loading ? (
            <>
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
            </>
          ) : filteredOpportunities.length > 0 ? (
            filteredOpportunities.map((opp) => {
              const isUrgent = opp.daysLeft <= 7;
              
              return (
                <Link to={`/opportunity/${opp.id}`} key={opp.id} className="group block">
                  <div className="bg-white rounded-lg border border-border p-6 transition-all duration-200 hover:border-primary hover:shadow-card flex flex-col relative overflow-hidden">
                    
                    {/* Top Row: Type & Verification */}
                    <div className="flex justify-between items-start mb-2">
                        <span className="text-xs font-bold text-primary uppercase tracking-wide">
                            {opp.type}
                        </span>
                        
                        <div className="flex gap-2">
                            {opp.verificationStatus === 'verified' && (
                                <span className="text-[10px] font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full flex items-center">
                                    <ShieldCheck size={10} className="mr-1" /> VERIFIED
                                </span>
                            )}
                        </div>
                    </div>

                    {/* Title & Organizer */}
                    <div className="mb-4">
                        <h3 className="text-xl font-semibold text-secondary mb-1 group-hover:text-primary transition-colors">
                            {opp.title}
                        </h3>
                        <p className="text-sm text-text">{opp.organizer}</p>
                    </div>

                    {/* Meta Data Row - Horizontal on larger screens */}
                    <div className="flex flex-wrap gap-y-3 gap-x-8 text-sm mb-6 pb-6 border-b border-border">
                        <div className="flex flex-col">
                            <span className="text-xs font-semibold text-text-light uppercase">Deadline</span>
                            <span className={`font-medium ${isUrgent ? 'text-urgent' : 'text-secondary'}`}>
                                {opp.deadline}
                            </span>
                        </div>
                         <div className="flex flex-col">
                            <span className="text-xs font-semibold text-text-light uppercase">Value</span>
                            <span className="font-medium text-secondary truncate max-w-[150px]" title={opp.grantOrPrize}>{opp.grantOrPrize}</span>
                        </div>
                        <div className="flex flex-col">
                            <span className="text-xs font-semibold text-text-light uppercase">Scope</span>
                            <span className="font-medium text-secondary flex items-center">
                                {opp.scope === 'International' ? <Globe size={14} className="mr-1 text-gray-400" /> : <MapPin size={14} className="mr-1 text-gray-400" />}
                                {opp.scope || 'National'}
                            </span>
                        </div>
                         <div className="flex flex-col">
                            <span className="text-xs font-semibold text-text-light uppercase">Fee</span>
                            <span className="font-medium text-secondary">{opp.applicationFee || 'Unknown'}</span>
                        </div>
                    </div>

                    {/* Footer: Tags & Arrow */}
                    <div className="flex items-center justify-between">
                        <div className="flex flex-wrap gap-2">
                             {opp.eligibility.slice(0, 3).map((tag, i) => (
                                <span key={i} className="text-xs bg-surface text-text px-2 py-1 rounded border border-border whitespace-nowrap">
                                    {tag}
                                </span>
                             ))}
                             {opp.eligibility.length > 3 && (
                                 <span className="text-xs text-text-light self-center">+{opp.eligibility.length - 3}</span>
                             )}
                        </div>
                        <div className="flex items-center text-sm font-medium text-primary opacity-0 group-hover:opacity-100 transition-opacity transform translate-x-[-10px] group-hover:translate-x-0 duration-200">
                            View Details <ArrowRight size={16} className="ml-1" />
                        </div>
                    </div>

                  </div>
                </Link>
              );
            })
          ) : (
             <div className="col-span-full text-center py-16 border border-dashed border-border rounded-lg bg-surface">
              <Search className="mx-auto h-12 w-12 text-gray-300 mb-4" />
              <h3 className="text-lg font-medium text-secondary mb-1">No opportunities found</h3>
              <p className="text-text-light mb-6">Try adjusting your search or filters.</p>
              <button 
                onClick={clearFilters}
                className="text-primary hover:text-accent-hover font-semibold text-sm hover:underline"
              >
                Clear all filters
              </button>
            </div>
          )}
        </div>

      </div>
    </div>
  );
};

export default Home;