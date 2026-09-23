import React, { useState } from 'react';
import { X, Key, CheckCircle2, AlertCircle, HelpCircle, ExternalLink, Zap, Palette, Sun, Moon, Lock, Trash2, ShieldCheck, Smartphone, Download, Copy, Check, Sparkles } from 'lucide-react';
import { UserProfile, AIProvider, BackgroundTheme } from '../types';
import { askProfessorQuestion } from '../services/ai';
import { hasVault, createVault, clearVault } from '../utils/keyVault';
import { testNotionConnection, cleanNotionDatabaseId } from '../services/notionService';
import { downloadFile, SAMPLE_NOTION_CSV_TEMPLATE, copyToClipboard } from '../utils/notionExporter';

interface SettingsModalProps {
  userProfile: UserProfile;
  onSave: (updatedProfile: UserProfile) => void;
  onClose: () => void;
}

// Recommended default model per provider — single source of truth for both
// the provider-tab click handler (which pre-fills the model field) and the
// "(recommended)" hint shown next to the Model Name input.
const DEFAULT_MODELS: Record<AIProvider, string> = {
  gemini: 'gemini-2.0-flash',
  openai: 'gpt-4o',
  anthropic: 'claude-3-5-sonnet-latest',
  ollama: 'qwen2-vl',
  openrouter: 'google/gemini-2.0-flash-001'
};

export const SettingsModal: React.FC<SettingsModalProps> = ({ userProfile, onSave, onClose }) => {
  const [profile, setProfile] = useState<UserProfile>(JSON.parse(JSON.stringify(userProfile)));
  const [showGuide, setShowGuide] = useState<boolean>(false);
  const [testStatus, setTestStatus] = useState<{ loading: boolean; success?: boolean; message?: string }>({ loading: false });
  const [vaultPin, setVaultPin] = useState<string>('');
  const [vaultPinConfirm, setVaultPinConfirm] = useState<string>('');
  const [pinError, setPinError] = useState<string>('');
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [vaultJustCleared, setVaultJustCleared] = useState<boolean>(false);
  const vaultExists = hasVault() && !vaultJustCleared;

  const themeOptions: { id: BackgroundTheme; label: string; desc: string; type: 'light' | 'dark' }[] = [
    { id: 'golden-landscape', label: '🌄 Golden Hour Mountain & Tripod (Recommended)', desc: 'Warm sunset vista overlooking mountain valley with camera tripod silhouette', type: 'light' },
    { id: 'camera-lens', label: '📷 Macro Camera Lens & Bokeh', desc: 'Detailed camera lens glass with warm golden bokeh flares', type: 'light' },
    { id: 'photo-studio', label: '💡 Minimalist Photo Studio', desc: 'Airy studio space with softbox lighting & tripod silhouette backdrop', type: 'light' },
    { id: 'vintage-film', label: '🎞️ Vintage 35mm Film Camera', desc: 'Classic analog camera on a warm wooden workbench with natural light', type: 'light' },
    { id: 'camera-optics', label: '🔬 Camera Glass Optics & Prisms', desc: 'Subtle optical glass elements, aperture blades and soft light refractions', type: 'light' },
    { id: 'natural-daylight', label: '☀️ Natural Daylight Studio', desc: 'Soft off-white linen, gentle window sunlight & camera optics grid', type: 'light' },
    { id: 'gallery-white', label: '🖼️ Fine-Art Photography Gallery', desc: 'Crisp museum gallery wall with ambient lighting', type: 'light' },
    { id: 'analog-pastel', label: '🎨 Analog Pastel Darkroom', desc: 'Soft rose & amber pastel wash with a vintage camera-dot texture', type: 'light' },
    { id: 'studio-dark', label: '🌙 Classic Dark Studio', desc: 'Cinematic dark photography studio backdrop', type: 'dark' }
  ];

  const handleTestConnection = async () => {
    setTestStatus({ loading: true });
    try {
      const result = await askProfessorQuestion(profile, 'Hello Professor ISO, test system connection!');
      if (result && !result.includes('Please set your')) {
        setTestStatus({ loading: false, success: true, message: 'Connected successfully to Prof. ISO!' });
      } else {
        setTestStatus({ loading: false, success: false, message: result });
      }
    } catch (err: any) {
      setTestStatus({ loading: false, success: false, message: err.message || 'Connection test failed.' });
    }
  };

  const handleRemoveSavedKey = () => {
    if (window.confirm('This permanently deletes the encrypted API key saved on this device. Continue?')) {
      clearVault();
      setVaultJustCleared(true);
      setVaultPin('');
      setVaultPinConfirm('');
      setPinError('');
    }
  };

  const handleSave = async () => {
    setPinError('');
    const keyEntered = profile.aiSettings.provider !== 'ollama' && Boolean(profile.aiSettings.apiKey);

    if (keyEntered) {
      if (!vaultPin || vaultPin.length < 4) {
        setPinError('Enter a vault PIN of at least 4 characters to encrypt this key before saving.');
        return;
      }
      if (!vaultExists && vaultPin !== vaultPinConfirm) {
        setPinError('PINs do not match.');
        return;
      }
      setIsSaving(true);
      try {
        await createVault(vaultPin, profile.aiSettings.apiKey);
      } catch (err: any) {
        setIsSaving(false);
        setPinError(`Could not encrypt key: ${err.message || err}`);
        return;
      }
      setIsSaving(false);
    }

    onSave(profile);
    onClose();
  };

  const isLight = profile.backgroundTheme !== 'studio-dark';

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
      <div className={`rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl border transition-colors ${
        isLight ? 'bg-white border-slate-200 text-slate-900' : 'bg-zinc-900 border-zinc-800 text-white'
      }`}>
        {/* Header */}
        <div className={`px-6 py-4 border-b flex items-center justify-between ${
          isLight ? 'bg-slate-50 border-slate-200' : 'bg-zinc-950 border-zinc-800'
        }`}>
          <div className="flex items-center gap-2.5">
            <Zap className="w-5 h-5 text-amber-500" />
            <h2 className="text-lg font-bold font-serif-title">AI Engine & Studio Atmosphere</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6 max-h-[80vh] overflow-y-auto">
          {/* Background Theme Selector Section */}
          <section className={`space-y-4 p-5 rounded-2xl border ${
            isLight ? 'bg-slate-50/80 border-slate-200' : 'bg-zinc-950/70 border-zinc-800'
          }`}>
            <h3 className="text-sm font-bold flex items-center gap-2">
              <Palette className="w-4 h-4 text-amber-500" />
              Studio Atmosphere & Background Theme
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {themeOptions.map((th) => (
                <button
                  key={th.id}
                  type="button"
                  onClick={() => setProfile({ ...profile, backgroundTheme: th.id })}
                  className={`p-3.5 rounded-xl text-xs text-left transition-all border ${
                    profile.backgroundTheme === th.id
                      ? 'bg-amber-500/10 border-amber-500 text-amber-600 font-bold shadow-sm'
                      : isLight
                        ? 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'
                        : 'bg-zinc-900 text-zinc-300 border-zinc-800 hover:border-zinc-700'
                  }`}
                >
                  <div className="font-bold flex items-center justify-between">
                    <span>{th.label}</span>
                    {th.type === 'light' ? <Sun className="w-3.5 h-3.5 text-amber-500" /> : <Moon className="w-3.5 h-3.5 text-indigo-400" />}
                  </div>
                  <div className={`text-[10px] font-normal mt-1 leading-snug ${isLight ? 'text-slate-500' : 'text-zinc-500'}`}>
                    {th.desc}
                  </div>
                </button>
              ))}
            </div>
          </section>

          {/* AI Connection Provider Section */}
          <section className={`space-y-4 p-5 rounded-2xl border ${
            isLight ? 'bg-slate-50/80 border-slate-200' : 'bg-zinc-950/70 border-zinc-800'
          }`}>
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold flex items-center gap-2">
                <Key className="w-4 h-4 text-amber-500" />
                Select AI Engine Connection
              </span>
              <button
                type="button"
                onClick={() => setShowGuide(!showGuide)}
                className="text-xs text-amber-600 hover:underline flex items-center gap-1 font-medium"
              >
                <HelpCircle className="w-3.5 h-3.5" />
                {showGuide ? 'Hide Setup Instructions' : 'How to set up your AI key?'}
              </button>
            </div>

            {/* Provider Tabs */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              {(['gemini', 'openai', 'anthropic', 'openrouter', 'ollama'] as AIProvider[]).map((prov) => (
                <button
                  key={prov}
                  type="button"
                  onClick={() => setProfile({
                    ...profile,
                    aiSettings: {
                      ...profile.aiSettings,
                      provider: prov,
                      model: DEFAULT_MODELS[prov]
                    }
                  })}
                  className={`py-2 px-3 rounded-xl text-xs font-bold uppercase tracking-wider transition-all border ${
                    profile.aiSettings.provider === prov
                      ? 'bg-amber-500 text-black border-amber-400 shadow-md'
                      : isLight
                        ? 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'
                        : 'bg-zinc-900 text-zinc-300 border-zinc-800 hover:border-zinc-700'
                  }`}
                >
                  {prov}
                </button>
              ))}
            </div>

            {/* Interactive Step-by-Step Guide */}
            {showGuide && (
              <div className={`p-4 rounded-xl text-xs space-y-2 border ${
                isLight ? 'bg-amber-50/80 border-amber-200 text-slate-700' : 'bg-zinc-900 border-amber-500/30 text-zinc-200'
              }`}>
                <h4 className="font-bold text-amber-600 flex items-center gap-2">
                  <ExternalLink className="w-3.5 h-3.5" />
                  Setup Instructions for {profile.aiSettings.provider.toUpperCase()}:
                </h4>
                {profile.aiSettings.provider === 'gemini' && (
                  <ol className="list-decimal list-inside space-y-1 leading-relaxed">
                    <li>Visit <a href="https://aistudio.google.com/" target="_blank" rel="noreferrer" className="text-amber-600 underline font-bold">Google AI Studio (aistudio.google.com)</a></li>
                    <li>Log in with your Google Account.</li>
                    <li>Click <strong>"Get API key"</strong> then <strong>"Create API key in new project"</strong>.</li>
                    <li>Copy your API key (starts with <code>AIza...</code>) and paste it below.</li>
                  </ol>
                )}
                {profile.aiSettings.provider === 'openai' && (
                  <ol className="list-decimal list-inside space-y-1 leading-relaxed">
                    <li>Go to <a href="https://platform.openai.com/api-keys" target="_blank" rel="noreferrer" className="text-amber-600 underline font-bold">OpenAI API Platform (platform.openai.com)</a></li>
                    <li>Sign in and ensure API credits are active under Billing.</li>
                    <li>Click <strong>"Create new secret key"</strong> and copy the key (starts with <code>sk-proj...</code>).</li>
                    <li>Paste the secret key below and select <code>gpt-4o</code>.</li>
                  </ol>
                )}
                {profile.aiSettings.provider === 'anthropic' && (
                  <ol className="list-decimal list-inside space-y-1 leading-relaxed">
                    <li>Go to <a href="https://console.anthropic.com/" target="_blank" rel="noreferrer" className="text-amber-600 underline font-bold">Anthropic Console (console.anthropic.com)</a></li>
                    <li>Generate a new API key (starts with <code>sk-ant...</code>).</li>
                    <li>Paste below and select <code>claude-3-5-sonnet-latest</code>.</li>
                  </ol>
                )}
                {profile.aiSettings.provider === 'openrouter' && (
                  <ol className="list-decimal list-inside space-y-1 leading-relaxed">
                    <li>Visit <a href="https://openrouter.ai/keys" target="_blank" rel="noreferrer" className="text-amber-600 underline font-bold">OpenRouter Keys (openrouter.ai)</a></li>
                    <li>Create an API key (starts with <code>sk-or-v1...</code>).</li>
                    <li>OpenRouter routes requests to Gemini, Claude, GPT, or LLaVA with one key!</li>
                  </ol>
                )}
                {profile.aiSettings.provider === 'ollama' && (
                  <ol className="list-decimal list-inside space-y-1 leading-relaxed">
                    <li>Download & install <a href="https://ollama.com/" target="_blank" rel="noreferrer" className="text-amber-600 underline font-bold">Ollama (ollama.com)</a></li>
                    <li>Run a Vision model in terminal: <code>ollama run qwen2-vl</code></li>
                    <li>Ensure environment variable <code>OLLAMA_ORIGINS="*"</code> is set to allow browser requests.</li>
                    <li>Default endpoint is <code>http://localhost:11434/v1</code>. No API key needed!</li>
                  </ol>
                )}
              </div>
            )}

            {/* Key Input */}
            {profile.aiSettings.provider !== 'ollama' && (
              <div>
                <label htmlFor="ai-api-key" className="text-xs text-slate-500 block mb-1">API Key</label>
                <input
                  id="ai-api-key"
                  type="password"
                  value={profile.aiSettings.apiKey || ''}
                  onChange={(e) => setProfile({
                    ...profile,
                    aiSettings: { ...profile.aiSettings, apiKey: e.target.value }
                  })}
                  placeholder={
                    vaultExists && !profile.aiSettings.apiKey
                      ? 'A key is already saved & encrypted — leave blank to keep it, or paste a new one to replace it'
                      : `Paste your ${profile.aiSettings.provider.toUpperCase()} API key here...`
                  }
                  className={`w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-amber-500 font-mono ${
                    isLight ? 'bg-white border-slate-300 text-slate-900' : 'bg-zinc-900 border-zinc-700 text-white'
                  }`}
                />
                {vaultExists && !profile.aiSettings.apiKey && (
                  <p className={`text-[11px] mt-1.5 flex items-center gap-1.5 ${isLight ? 'text-slate-500' : 'text-zinc-500'}`}>
                    <Lock className="w-3 h-3 text-amber-500 shrink-0" />
                    Locked. Close this and use the "Unlock" banner to use your saved key, or paste a new one above to replace it.
                  </p>
                )}
              </div>
            )}

            {/* Vault PIN — only relevant when there's a key on this screen to encrypt */}
            {profile.aiSettings.provider !== 'ollama' && Boolean(profile.aiSettings.apiKey) && (
              <div className={`p-4 rounded-xl border space-y-3 ${
                isLight ? 'bg-sky-50/70 border-sky-200' : 'bg-sky-500/5 border-sky-500/20'
              }`}>
                <h4 className={`text-xs font-bold flex items-center gap-2 ${isLight ? 'text-sky-800' : 'text-sky-300'}`}>
                  <ShieldCheck className="w-3.5 h-3.5" />
                  {vaultExists ? 'Re-encrypt with your Vault PIN' : 'Set a Vault PIN to encrypt this key'}
                </h4>
                <p className={`text-[11px] leading-relaxed ${isLight ? 'text-slate-600' : 'text-zinc-400'}`}>
                  Your key is encrypted with AES-GCM and stored locally — never in plain text. You'll enter this PIN once per session to unlock it. This protects against casual local snooping, not a compromised browser session.
                </p>
                <div className={`grid gap-3 ${vaultExists ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2'}`}>
                  <div>
                    <label htmlFor="vault-pin" className="text-xs text-slate-500 block mb-1">
                      {vaultExists ? 'Vault PIN' : 'New Vault PIN (4+ characters)'}
                    </label>
                    <input
                      id="vault-pin"
                      type="password"
                      value={vaultPin}
                      onChange={(e) => setVaultPin(e.target.value)}
                      className={`w-full border rounded-xl px-4 py-2.5 text-sm font-mono ${
                        isLight ? 'bg-white border-slate-300 text-slate-900' : 'bg-zinc-900 border-zinc-700 text-white'
                      }`}
                    />
                  </div>
                  {!vaultExists && (
                    <div>
                      <label htmlFor="vault-pin-confirm" className="text-xs text-slate-500 block mb-1">Confirm PIN</label>
                      <input
                        id="vault-pin-confirm"
                        type="password"
                        value={vaultPinConfirm}
                        onChange={(e) => setVaultPinConfirm(e.target.value)}
                        className={`w-full border rounded-xl px-4 py-2.5 text-sm font-mono ${
                          isLight ? 'bg-white border-slate-300 text-slate-900' : 'bg-zinc-900 border-zinc-700 text-white'
                        }`}
                      />
                    </div>
                  )}
                </div>
                {pinError && (
                  <p className="text-xs text-red-500 flex items-center gap-1.5 font-semibold">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {pinError}
                  </p>
                )}
              </div>
            )}

            {/* Remove saved key */}
            {profile.aiSettings.provider !== 'ollama' && vaultExists && (
              <button
                type="button"
                onClick={handleRemoveSavedKey}
                className={`text-[11px] flex items-center gap-1.5 transition-colors ${isLight ? 'text-slate-400 hover:text-red-500' : 'text-zinc-500 hover:text-red-400'}`}
              >
                <Trash2 className="w-3 h-3" />
                Remove saved encrypted key from this device
              </button>
            )}

            {/* Custom Endpoint Base URL */}
            {(profile.aiSettings.provider === 'ollama' || profile.aiSettings.provider === 'openrouter') && (
              <div>
                <label htmlFor="ai-base-url" className="text-xs text-slate-500 block mb-1">Endpoint Base URL</label>
                <input
                  id="ai-base-url"
                  type="text"
                  value={profile.aiSettings.baseUrl || (profile.aiSettings.provider === 'ollama' ? 'http://localhost:11434/v1' : 'https://openrouter.ai/api/v1')}
                  onChange={(e) => setProfile({
                    ...profile,
                    aiSettings: { ...profile.aiSettings, baseUrl: e.target.value }
                  })}
                  className={`w-full border rounded-xl px-4 py-2.5 text-sm font-mono ${
                    isLight ? 'bg-white border-slate-300 text-slate-900' : 'bg-zinc-900 border-zinc-700 text-white'
                  }`}
                />
              </div>
            )}

            {/* Model Name */}
            <div>
              <label htmlFor="ai-model-name" className="text-xs text-slate-500 block mb-1">
                Model Name <span className="opacity-70">(optional — defaults to {DEFAULT_MODELS[profile.aiSettings.provider]}, recommended)</span>
              </label>
              <input
                id="ai-model-name"
                type="text"
                value={profile.aiSettings.model || ''}
                onChange={(e) => setProfile({
                  ...profile,
                  aiSettings: { ...profile.aiSettings, model: e.target.value }
                })}
                placeholder="e.g. gemini-2.0-flash, gpt-4o, claude-3-5-sonnet-latest, qwen2-vl"
                className={`w-full border rounded-xl px-4 py-2.5 text-sm font-mono ${
                  isLight ? 'bg-white border-slate-300 text-slate-900' : 'bg-zinc-900 border-zinc-700 text-white'
                }`}
              />
            </div>

            {/* Test Connection Button */}
            <div className="pt-2 flex items-center justify-between">
              <button
                type="button"
                onClick={handleTestConnection}
                disabled={testStatus.loading}
                className={`text-xs font-semibold px-4 py-2.5 rounded-xl border transition-colors flex items-center gap-2 ${
                  isLight ? 'bg-white border-slate-300 text-slate-800 hover:bg-slate-100' : 'bg-zinc-800 border-zinc-700 text-zinc-200 hover:bg-zinc-700'
                }`}
              >
                {testStatus.loading ? 'Testing Connection...' : 'Test Connection with Prof. ISO'}
              </button>

              {testStatus.success && (
                <span className="text-xs text-emerald-600 flex items-center gap-1 font-bold">
                  <CheckCircle2 className="w-4 h-4" /> {testStatus.message}
                </span>
              )}
              {testStatus.success === false && (
                <span className="text-xs text-red-600 flex items-center gap-1 font-bold">
                  <AlertCircle className="w-4 h-4" /> {testStatus.message}
                </span>
              )}
            </div>
          </section>

          {/* Notion Mobile App Integration Section */}
          <NotionSettingsSection
            profile={profile}
            setProfile={setProfile}
            isLight={isLight}
          />
        </div>

        {/* Footer */}
        <div className={`px-6 py-4 border-t flex items-center justify-between ${
          isLight ? 'bg-slate-50 border-slate-200' : 'bg-zinc-950 border-zinc-800'
        }`}>
          <span className="text-xs text-slate-500 flex items-center gap-1.5">
            <Lock className="w-3 h-3" />
            API keys are encrypted on this device. Everything else saves in LocalStorage.
          </span>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl text-xs font-medium text-slate-500 hover:text-slate-800 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="px-6 py-2.5 rounded-xl text-xs font-bold bg-amber-500 text-black hover:bg-amber-400 transition-colors shadow-lg shadow-amber-500/20 disabled:opacity-60"
            >
              {isSaving ? 'Encrypting...' : 'Save AI Settings & Atmosphere'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

interface NotionSettingsSectionProps {
  profile: UserProfile;
  setProfile: React.Dispatch<React.SetStateAction<UserProfile>>;
  isLight: boolean;
}

const NotionSettingsSection: React.FC<NotionSettingsSectionProps> = ({ profile, setProfile, isLight }) => {
  const [showGuide, setShowGuide] = useState<boolean>(false);
  const [copiedTemplate, setCopiedTemplate] = useState<boolean>(false);
  const [testStatus, setTestStatus] = useState<{ loading: boolean; success?: boolean; message?: string }>({ loading: false });

  const notionSettings = profile.notionSettings || { apiKey: '', databaseId: '' };

  const handleTestConnection = async () => {
    setTestStatus({ loading: true });
    const res = await testNotionConnection(notionSettings.apiKey, notionSettings.databaseId);
    setTestStatus({ loading: false, success: res.success, message: res.message });
  };

  const handleCopyTemplate = async () => {
    const ok = await copyToClipboard(SAMPLE_NOTION_CSV_TEMPLATE);
    if (ok) {
      setCopiedTemplate(true);
      setTimeout(() => setCopiedTemplate(false), 2500);
    }
  };

  const handleDownloadSampleCSV = () => {
    downloadFile(SAMPLE_NOTION_CSV_TEMPLATE, 'photo-journey-notion-template.csv', 'text/csv');
  };

  return (
    <section className={`space-y-4 p-5 rounded-2xl border ${
      isLight ? 'bg-slate-50/80 border-slate-200' : 'bg-zinc-950/70 border-zinc-800'
    }`}>
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold flex items-center gap-2">
          <Smartphone className="w-4 h-4 text-emerald-500" />
          Notion Mobile App Sync & Field Tracker
        </span>
        <button
          type="button"
          onClick={() => setShowGuide(!showGuide)}
          className="text-xs text-amber-600 hover:underline flex items-center gap-1 font-medium"
        >
          <HelpCircle className="w-3.5 h-3.5" />
          {showGuide ? 'Hide Notion Guide' : 'How to setup Notion integration?'}
        </button>
      </div>

      <p className={`text-xs leading-relaxed ${isLight ? 'text-slate-600' : 'text-zinc-400'}`}>
        Sync your photo missions directly to your Notion account (<code className="text-amber-600">apps.notion.com</code>) so you can view checklists and log field notes on your mobile device while out shooting.
      </p>

      {/* Interactive Step-by-Step Setup Guide */}
      {showGuide && (
        <div className={`p-4 rounded-xl text-xs space-y-3 border ${
          isLight ? 'bg-amber-50/90 border-amber-200 text-slate-800' : 'bg-zinc-900 border-amber-500/30 text-zinc-200'
        }`}>
          <h4 className="font-bold text-amber-600 flex items-center gap-2">
            <Sparkles className="w-4 h-4" />
            Explicit Step-by-Step Notion Integration Setup Guide:
          </h4>

          <div className="space-y-3">
            <div className="p-2.5 rounded-lg bg-white/70 border border-amber-200/60 dark:bg-zinc-800/60 dark:border-zinc-700">
              <span className="font-bold text-amber-700 dark:text-amber-400 block mb-0.5">
                Step 1: Create your Notion Integration Token
              </span>
              <p className="leading-relaxed">
                Open <a href="https://www.notion.so/my-integrations" target="_blank" rel="noreferrer" className="text-amber-600 underline font-bold">www.notion.so/my-integrations</a> in your browser. Click <strong>"+ New integration"</strong>, name it <em>"Photo Journey"</em>, select your workspace, and save. Copy the generated <strong>"Internal Integration Secret"</strong> (starts with <code>secret_...</code>).
              </p>
            </div>

            <div className="p-2.5 rounded-lg bg-white/70 border border-amber-200/60 dark:bg-zinc-800/60 dark:border-zinc-700">
              <span className="font-bold text-amber-700 dark:text-amber-400 block mb-0.5">
                Step 2: Create a Notion Database Page
              </span>
              <p className="leading-relaxed mb-2">
                In Notion, create a new Full Page Database or Table. You can download our ready-made CSV template or copy it to import directly into Notion:
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleDownloadSampleCSV}
                  className="px-3 py-1.5 rounded-lg bg-slate-900 text-white hover:bg-slate-800 text-[11px] font-bold flex items-center gap-1.5 transition-colors"
                >
                  <Download className="w-3 h-3 text-amber-400" />
                  Download Notion CSV Template
                </button>
                <button
                  type="button"
                  onClick={handleCopyTemplate}
                  className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 hover:bg-slate-50 text-[11px] font-semibold flex items-center gap-1.5 transition-colors"
                >
                  {copiedTemplate ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3 text-slate-500" />}
                  {copiedTemplate ? 'Copied CSV!' : 'Copy CSV Text'}
                </button>
              </div>
            </div>

            <div className="p-2.5 rounded-lg bg-white/70 border border-amber-200/60 dark:bg-zinc-800/60 dark:border-zinc-700">
              <span className="font-bold text-amber-700 dark:text-amber-400 block mb-0.5">
                Step 3: Share/Connect your Database with the Integration
              </span>
              <p className="leading-relaxed">
                Open your Notion Database page. In the top right corner, click the <code>...</code> (three dots) menu, select <strong>"Add connections"</strong> (or <strong>"Connect to"</strong>), search for your <strong>"Photo Journey"</strong> integration, and click Confirm.
              </p>
            </div>

            <div className="p-2.5 rounded-lg bg-white/70 border border-amber-200/60 dark:bg-zinc-800/60 dark:border-zinc-700">
              <span className="font-bold text-amber-700 dark:text-amber-400 block mb-0.5">
                Step 4: Copy your Database ID from the Notion Page URL
              </span>
              <p className="leading-relaxed">
                Look at your browser's address bar when viewing the Notion database page:<br />
                <code className="text-[11px] bg-slate-100 dark:bg-zinc-900 px-1.5 py-0.5 rounded border">https://www.notion.so/workspace/<strong>32_CHARACTER_DATABASE_ID</strong>?v=...</code><br />
                Copy the 32-character alphanumeric ID right before the <code>?v=</code> parameters (or just paste the full URL below and we will extract it for you!).
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Credentials Inputs */}
      <div className="space-y-3">
        <div>
          <label htmlFor="notion-secret" className="text-xs text-slate-500 block mb-1">
            Notion Integration Secret (starts with <code>secret_...</code>)
          </label>
          <input
            id="notion-secret"
            type="password"
            value={notionSettings.apiKey}
            onChange={(e) => setProfile({
              ...profile,
              notionSettings: { ...notionSettings, apiKey: e.target.value }
            })}
            placeholder="secret_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
            className={`w-full border rounded-xl px-4 py-2.5 text-sm font-mono ${
              isLight ? 'bg-white border-slate-300 text-slate-900' : 'bg-zinc-900 border-zinc-700 text-white'
            }`}
          />
        </div>

        <div>
          <label htmlFor="notion-db-id" className="text-xs text-slate-500 block mb-1">
            Notion Database ID (or paste Full Database Page URL)
          </label>
          <input
            id="notion-db-id"
            type="text"
            value={notionSettings.databaseId}
            onChange={(e) => setProfile({
              ...profile,
              notionSettings: { ...notionSettings, databaseId: cleanNotionDatabaseId(e.target.value) }
            })}
            placeholder="e.g. 32-character Database ID or https://notion.so/workspace/..."
            className={`w-full border rounded-xl px-4 py-2.5 text-sm font-mono ${
              isLight ? 'bg-white border-slate-300 text-slate-900' : 'bg-zinc-900 border-zinc-700 text-white'
            }`}
          />
        </div>
      </div>

      {/* Connection Test */}
      <div className="pt-2 flex items-center justify-between">
        <button
          type="button"
          onClick={handleTestConnection}
          disabled={testStatus.loading}
          className={`text-xs font-semibold px-4 py-2.5 rounded-xl border transition-colors flex items-center gap-2 ${
            isLight ? 'bg-white border-slate-300 text-slate-800 hover:bg-slate-100' : 'bg-zinc-800 border-zinc-700 text-zinc-200 hover:bg-zinc-700'
          }`}
        >
          {testStatus.loading ? 'Connecting to Notion...' : 'Test Notion API Connection'}
        </button>

        {testStatus.success && (
          <span className="text-xs text-emerald-600 flex items-center gap-1 font-bold">
            <CheckCircle2 className="w-4 h-4" /> {testStatus.message}
          </span>
        )}
        {testStatus.success === false && (
          <span className="text-xs text-red-600 flex items-center gap-1 font-bold">
            <AlertCircle className="w-4 h-4" /> {testStatus.message}
          </span>
        )}
      </div>
    </section>
  );
};

