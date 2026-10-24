import React, { useState } from 'react';
import { CommunityView } from './components/CommunityView';
import { DeveloperView } from './components/DeveloperView';
import { AdminView } from './components/AdminView';
import { JointView } from './components/joint/JointView';
import { Lock } from 'lucide-react';

type ViewMode = 'landing' | 'community' | 'developer' | 'joint' | 'admin';

function App() {
  const [viewMode, setViewMode] = useState<ViewMode>('landing');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');

  const handlePinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    if (pin === '1234') {
      setViewMode('community');
    } else if (pin === '5678') {
      setViewMode('developer');
    } else if (pin === '9999') {
      setViewMode('joint');
    } else if (pin === '5555') {
      setViewMode('admin');
    } else {
      setError('Invalid Access Code');
      setPin('');
    }
  };

  if (viewMode === 'landing') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 flex items-center justify-center p-8">
        <div className="bg-white p-8 rounded-2xl shadow-2xl w-96 flex flex-col items-center">
          <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mb-6">
            <Lock size={40} className="text-gray-700" />
          </div>
          
          <h1 className="text-2xl font-bold text-gray-800">Aurelean Mountain</h1>
          <p className="text-sm font-medium text-gray-600 mb-2">Mining Stakeholder Portal</p>
          <p className="text-sm text-gray-500 mb-8 text-center">
            Please enter your designated access code to enter the negotiation workspace.
          </p>

          <form onSubmit={handlePinSubmit} className="w-full">
            <input
              type="password"
              placeholder="Access Code"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              className="w-full p-4 border rounded-xl mb-4 text-center text-2xl tracking-widest focus:ring-2 focus:ring-blue-500 outline-none transition-all"
              autoFocus
            />
            
            {error && (
              <p className="text-red-500 text-sm text-center mb-4 font-medium animate-pulse">
                {error}
              </p>
            )}

            <button 
              type="submit"
              className="w-full py-3 bg-gray-800 text-white rounded-xl font-bold shadow-lg hover:bg-black transition-colors"
            >
              Enter Workspace
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col p-4 gap-4 font-sans text-gray-900 overflow-hidden">
      {/* Header / Navigation */}
      <div className="flex justify-between items-center bg-white p-4 rounded-xl shadow-sm border border-gray-200 shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">
            {viewMode === 'community' ? 'Social Teams Matrix' :
             viewMode === 'developer' ? 'Technical Teams Matrix' :
             viewMode === 'joint' ? 'Joint Negotiation Workspace' :
             'Administrator Dashboard'}
          </h1>
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
            Aurelean Mountain
          </p>
        </div>
        <button 
          onClick={() => {
            setViewMode('landing');
            setPin('');
          }}
          className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors flex items-center gap-2"
        >
          <Lock size={14} /> Exit Session
        </button>
      </div>

      {/* Main Content Area */}
      {viewMode === 'community' && <CommunityView />}
      {viewMode === 'developer' && <DeveloperView />}
      {viewMode === 'joint' && <JointView />}
      {viewMode === 'admin' && <AdminView />}
    </div>
  );
}

export default App;
