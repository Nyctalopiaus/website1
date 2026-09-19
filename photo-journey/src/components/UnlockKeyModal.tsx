import React, { useState } from 'react';
import { X, Lock, AlertCircle, KeyRound } from 'lucide-react';
import { unlockVault, clearVault } from '../utils/keyVault';

interface UnlockKeyModalProps {
  isLight: boolean;
  onUnlock: (apiKey: string) => void;
  onClose: () => void;
}

export const UnlockKeyModal: React.FC<UnlockKeyModalProps> = ({ isLight, onUnlock, onClose }) => {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleUnlock = async () => {
    setError('');
    if (!pin) {
      setError('Enter your vault PIN.');
      return;
    }
    setLoading(true);
    try {
      const apiKey = await unlockVault(pin);
      setLoading(false);
      onUnlock(apiKey);
    } catch (err: any) {
      setLoading(false);
      setError(err.message || 'Incorrect PIN.');
    }
  };

  const handleForget = () => {
    if (window.confirm('This permanently deletes your saved encrypted API key. You\'ll need to paste it again from your provider afterward. Continue?')) {
      clearVault();
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-center justify-center p-4">
      <div className={`rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl border transition-colors ${
        isLight ? 'bg-white border-slate-200 text-slate-900' : 'bg-zinc-900 border-zinc-800 text-white'
      }`}>
        {/* Header */}
        <div className={`px-6 py-4 border-b flex items-center justify-between ${
          isLight ? 'bg-slate-50 border-slate-200' : 'bg-zinc-950 border-zinc-800'
        }`}>
          <div className="flex items-center gap-2.5">
            <Lock className="w-5 h-5 text-amber-500" />
            <h3 className="text-base font-bold font-serif-title">Unlock AI Engine</h3>
          </div>
          <button
            onClick={onClose}
            className={`p-1.5 rounded-xl transition-colors ${isLight ? 'text-slate-400 hover:text-slate-600 hover:bg-slate-100' : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800'}`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <p className={`text-xs leading-relaxed ${isLight ? 'text-slate-500' : 'text-zinc-400'}`}>
            Your API key is encrypted on this device. Enter your PIN to unlock it for this session — you'll need to unlock again next time you reload the app.
          </p>

          <div>
            <label htmlFor="vault-unlock-pin" className="text-xs text-slate-500 block mb-1">Vault PIN</label>
            <input
              id="vault-unlock-pin"
              type="password"
              autoFocus
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleUnlock(); }}
              className={`w-full border rounded-xl px-4 py-2.5 text-sm font-mono focus:outline-none focus:border-amber-500 ${
                isLight ? 'bg-white border-slate-300 text-slate-900' : 'bg-zinc-950 border-zinc-700 text-white'
              }`}
            />
          </div>

          {error && (
            <p className="text-xs text-red-500 flex items-center gap-1.5 font-semibold">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {error}
            </p>
          )}

          <button
            onClick={handleUnlock}
            disabled={loading}
            className="w-full font-bold text-xs py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-black transition-all flex items-center justify-center gap-2 shadow-md shadow-amber-500/20 disabled:opacity-60"
          >
            <KeyRound className="w-4 h-4" />
            {loading ? 'Unlocking...' : 'Unlock'}
          </button>

          <button
            onClick={handleForget}
            className={`w-full text-center text-[11px] transition-colors ${isLight ? 'text-slate-400 hover:text-red-500' : 'text-zinc-500 hover:text-red-400'}`}
          >
            Forgot your PIN? Remove the saved key and re-enter it in Settings.
          </button>
        </div>
      </div>
    </div>
  );
};
