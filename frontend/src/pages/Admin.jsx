import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, Users, Ban, AlertTriangle, Lock, ArrowLeft, Unlock } from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

const Admin = () => {
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [authenticated, setAuthenticated] = useState(false);
  const [activeTab, setActiveTab] = useState('users');
  const [users, setUsers] = useState([]);
  const [bans, setBans] = useState([]);
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(false);

  const checkAuth = () => {
    if (password === 'admin123') {
      setAuthenticated(true);
    } else {
      alert('Password errata');
    }
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const headers = { 'x-admin-password': 'admin123' };
      if (activeTab === 'users') {
        const res = await fetch(`${API_URL}/admin/users`, { headers });
        setUsers(await res.json());
      } else if (activeTab === 'bans') {
        const res = await fetch(`${API_URL}/admin/bans`, { headers });
        setBans(await res.json());
      } else if (activeTab === 'reports') {
        const res = await fetch(`${API_URL}/admin/reports`, { headers });
        setReports(await res.json());
      }
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (authenticated) fetchData();
  }, [authenticated, activeTab]);

  const handleBan = async (sessionId, ipHash) => {
    try {
      await fetch(`${API_URL}/admin/ban`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-password': 'admin123' },
        body: JSON.stringify({ session_id: sessionId, ip_hash: ipHash, minutes: 60, reason: 'manual' })
      });
      fetchData();
    } catch (e) {
      alert('Errore nel ban');
    }
  };

  const handleUnban = async (banId) => {
    try {
      await fetch(`${API_URL}/admin/unban`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-password': 'admin123' },
        body: JSON.stringify({ ban_id: banId })
      });
      fetchData();
    } catch (e) {
      alert('Errore nell\'unban');
    }
  };

  if (!authenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-dark-900 px-4">
        <div className="bg-dark-800 border border-dark-700 rounded-xl p-8 w-full max-w-sm">
          <div className="flex items-center justify-center w-12 h-12 rounded-full bg-brand-primary/10 mx-auto mb-4">
            <Lock size={20} className="text-brand-primary" />
          </div>
          <h1 className="text-xl font-bold text-white text-center mb-2">Admin Panel</h1>
          <p className="text-gray-400 text-sm text-center mb-6">Inserisci la password per accedere</p>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && checkAuth()}
            placeholder="Password"
            className="w-full bg-dark-700 border border-dark-600 rounded-lg px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-brand-primary mb-4"
          />
          <button
            onClick={checkAuth}
            className="w-full py-2.5 bg-brand-primary hover:bg-indigo-500 text-white rounded-lg text-sm font-medium transition"
          >
            Accedi
          </button>
          <button
            onClick={() => navigate('/')}
            className="w-full mt-3 py-2 text-gray-400 hover:text-white text-sm transition"
          >
            Torna alla Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-dark-900 text-gray-200">
      {/* Header */}
      <header className="h-16 border-b border-dark-700 bg-dark-800 flex items-center justify-between px-4">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/')} className="text-gray-400 hover:text-white transition">
            <ArrowLeft size={20} />
          </button>
          <Shield size={20} className="text-brand-primary" />
          <h1 className="font-bold text-white">Admin Panel</h1>
        </div>
        <button
          onClick={() => setAuthenticated(false)}
          className="text-sm text-gray-400 hover:text-white transition"
        >
          Logout
        </button>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-6">
        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          {[
            { id: 'users', label: 'Utenti Attivi', icon: Users },
            { id: 'bans', label: 'Ban Attivi', icon: Ban },
            { id: 'reports', label: 'Segnalazioni', icon: AlertTriangle },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition ${activeTab === tab.id ? 'bg-brand-primary text-white' : 'bg-dark-800 text-gray-400 hover:text-white hover:bg-dark-700'}`}
            >
              <tab.icon size={16} />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        {loading ? (
          <div className="text-center py-12 text-gray-500">Caricamento...</div>
        ) : (
          <div className="bg-dark-800 border border-dark-700 rounded-xl overflow-hidden">
            {activeTab === 'users' && (
              <table className="w-full text-sm">
                <thead className="bg-dark-700/50 text-gray-400">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium">Session ID</th>
                    <th className="text-left px-4 py-3 font-medium">IP Hash</th>
                    <th className="text-left px-4 py-3 font-medium">Room</th>
                    <th className="text-left px-4 py-3 font-medium">Ultima attività</th>
                    <th className="text-right px-4 py-3 font-medium">Azioni</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-dark-700">
                  {users.map((u) => (
                    <tr key={u.id} className="hover:bg-dark-700/30">
                      <td className="px-4 py-3 font-mono text-xs">{u.id.substring(0, 8)}...</td>
                      <td className="px-4 py-3 font-mono text-xs">{u.ip_hash.substring(0, 12)}...</td>
                      <td className="px-4 py-3">{u.room_id ? u.room_id.substring(0, 20) + '...' : '-'}</td>
                      <td className="px-4 py-3 text-gray-400">{new Date(u.last_active).toLocaleTimeString()}</td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => handleBan(u.id, u.ip_hash)}
                          className="text-red-400 hover:text-red-300 text-xs font-medium"
                        >
                          Banna
                        </button>
                      </td>
                    </tr>
                  ))}
                  {users.length === 0 && (
                    <tr><td colSpan="5" className="px-4 py-8 text-center text-gray-500">Nessun utente attivo</td></tr>
                  )}
                </tbody>
              </table>
            )}

            {activeTab === 'bans' && (
              <table className="w-full text-sm">
                <thead className="bg-dark-700/50 text-gray-400">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium">Sessione</th>
                    <th className="text-left px-4 py-3 font-medium">IP Hash</th>
                    <th className="text-left px-4 py-3 font-medium">Motivo</th>
                    <th className="text-left px-4 py-3 font-medium">Scadenza</th>
                    <th className="text-right px-4 py-3 font-medium">Azioni</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-dark-700">
                  {bans.map((b) => (
                    <tr key={b.id} className="hover:bg-dark-700/30">
                      <td className="px-4 py-3 font-mono text-xs">{b.session_id ? b.session_id.substring(0, 8) + '...' : '-'}</td>
                      <td className="px-4 py-3 font-mono text-xs">{b.ip_hash.substring(0, 12)}...</td>
                      <td className="px-4 py-3">{b.reason}</td>
                      <td className="px-4 py-3 text-gray-400">{new Date(b.expires_at).toLocaleString()}</td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => handleUnban(b.id)}
                          className="text-green-400 hover:text-green-300 text-xs font-medium flex items-center gap-1 ml-auto"
                        >
                          <Unlock size={12} />
                          Unban
                        </button>
                      </td>
                    </tr>
                  ))}
                  {bans.length === 0 && (
                    <tr><td colSpan="5" className="px-4 py-8 text-center text-gray-500">Nessun ban attivo</td></tr>
                  )}
                </tbody>
              </table>
            )}

            {activeTab === 'reports' && (
              <table className="w-full text-sm">
                <thead className="bg-dark-700/50 text-gray-400">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium">Reporter</th>
                    <th className="text-left px-4 py-3 font-medium">Segnalato</th>
                    <th className="text-left px-4 py-3 font-medium">Motivo</th>
                    <th className="text-left px-4 py-3 font-medium">Data</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-dark-700">
                  {reports.map((r) => (
                    <tr key={r.id} className="hover:bg-dark-700/30">
                      <td className="px-4 py-3 font-mono text-xs">{r.reporter_session.substring(0, 8)}...</td>
                      <td className="px-4 py-3 font-mono text-xs">{r.reported_session.substring(0, 8)}...</td>
                      <td className="px-4 py-3">{r.reason}</td>
                      <td className="px-4 py-3 text-gray-400">{new Date(r.created_at).toLocaleString()}</td>
                    </tr>
                  ))}
                  {reports.length === 0 && (
                    <tr><td colSpan="4" className="px-4 py-8 text-center text-gray-500">Nessuna segnalazione</td></tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default Admin;
