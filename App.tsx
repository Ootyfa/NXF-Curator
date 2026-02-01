import React, { useEffect } from 'react';
import { HashRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import Header from './components/Header';
import Footer from './components/Footer';
import Home from './pages/Home';
import OpportunityDetail from './pages/OpportunityDetail';
import AgentScanner from './pages/AgentScanner';
import OrganizerFeedback from './pages/OrganizerFeedback';
import Auth from './pages/Auth';
import AboutUs from './pages/AboutUs';
import PrivacyPolicy from './pages/PrivacyPolicy';
import ContactUs from './pages/ContactUs';

const ScrollToTop = () => {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return null;
};

// Layout wrapper to hide header/footer on governance pages
const Layout: React.FC<{children: React.ReactNode, hideNav?: boolean}> = ({ children, hideNav }) => {
  return (
    <div className="flex flex-col min-h-screen font-sans">
      {!hideNav && <Header />}
      <main className="flex-grow">
        {children}
      </main>
      {!hideNav && <Footer />}
    </div>
  );
}

const App: React.FC = () => {
  return (
    <Router>
      <ScrollToTop />
      <Routes>
        <Route path="/" element={<Layout><Home /></Layout>} />
        <Route path="/opportunity/:id" element={<Layout><OpportunityDetail /></Layout>} />
        <Route path="/agent" element={<Layout><AgentScanner /></Layout>} />
        <Route path="/organizer-feedback/:id" element={<Layout hideNav><OrganizerFeedback /></Layout>} />
        <Route path="/auth" element={<Layout><Auth /></Layout>} />
        <Route path="/about" element={<Layout><AboutUs /></Layout>} />
        <Route path="/privacy" element={<Layout><PrivacyPolicy /></Layout>} />
        <Route path="/contact" element={<Layout><ContactUs /></Layout>} />
      </Routes>
    </Router>
  );
};

export default App;