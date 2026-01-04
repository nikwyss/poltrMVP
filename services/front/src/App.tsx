import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './lib/AuthContext';
import Login from './pages/Login';
import Register from './pages/Register';
import Callback from './pages/Callback';
import MagicLinkSent from './pages/MagicLinkSent';
import VerifyMagicLink from './pages/VerifyMagicLink';
import Home from './pages/Home';
// import ProposalsFeed from './pages/votings/ProposalsListFeed';
import ProposalsSearch from './pages/votings/ProposalsListRecords';

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/callback" element={<Callback />} />
          <Route path="/magic-link-sent" element={<MagicLinkSent />} />
          <Route path="/verify" element={<VerifyMagicLink />} />
          <Route path="/home" element={<Home />} />
          <Route path="/proposals" element={<ProposalsSearch />} />
          {/* <Route path="/feed" element={<ProposalsFeed />} /> */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
