import React, { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, ShieldAlert, Key, Globe, Lock, RefreshCw } from 'lucide-react';
import { GoogleGenAI } from "@google/genai";

interface ConfigStatus {
  geminiKey: boolean;
  googleClientId: boolean;
  googleClientSecret: boolean;
  appUrl: boolean;
  sessionSecret: boolean;
}

export default function ApiStatus() {
  const [status, setStatus] = useState<ConfigStatus | null>(null);
  const [geminiValid, setGeminiValid] = useState<boolean | 'loading' | 'error'>('loading');
  const [geminiError, setGeminiError] = useState<string | null>(null);
  const [urlMatch, setUrlMatch] = useState<boolean>(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkStatus = async () => {
      try {
        const res = await fetch('/api/config-check');
        if (res.ok) {
          const data = await res.json();
          setStatus(data);
          
          const configRes = await fetch('/api/config-values');
          if (configRes.ok) {
            const { appUrl } = await configRes.json();
            if (appUrl && !window.location.origin.includes(appUrl.replace('https://', '').replace('http://', ''))) {
              setUrlMatch(false);
            }
          }
        }
      } catch (err) {
        console.error('Failed to check config:', err);
      } finally {
        setLoading(false);
      }
    };
    checkStatus();
  }, []);

  useEffect(() => {
    if (status?.geminiKey) {
      validateGeminiKey();
    } else if (status) {
      setGeminiValid('error');
      setGeminiError("GEMINI_API_KEY is not set in Secrets.");
    }
  }, [status]);

  const validateGeminiKey = async () => {
    setGeminiValid('loading');
    setGeminiError(null);
    try {
      const key = process.env.GEMINI_API_KEY;
      if (!key || key.trim() === "") {
        setGeminiValid('error');
        setGeminiError("API key is empty. Please check your Secrets.");
        return;
      }

      const ai = new GoogleGenAI({ apiKey: key });
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: "hi",
      });
      if (response.text) {
        setGeminiValid(true);
      } else {
        setGeminiValid('error');
        setGeminiError("Received empty response from Gemini.");
      }
    } catch (err: any) {
      console.error('Gemini validation failed:', err);
      setGeminiValid('error');
      // Extract the message from the error object if possible
      const msg = err.message || (typeof err === 'object' ? JSON.stringify(err) : String(err));
      setGeminiError(msg);
    }
  };

  if (loading) return null;
  if (!status) return null;

  const allValid = Object.values(status).every(v => v === true) && geminiValid === true && urlMatch;

  if (allValid) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-md animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="bg-white/95 backdrop-blur-xl border border-slate-200 rounded-2xl p-6 shadow-2xl shadow-slate-200/50 overflow-hidden">
        <div className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-amber-50 rounded-xl flex items-center justify-center text-amber-600">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900">Configuration Required</h3>
              <p className="text-xs text-slate-500">Validation for your application link.</p>
            </div>
          </div>

          <div className="space-y-3">
            <StatusItem 
              label="Gemini API Key" 
              isValid={status.geminiKey && geminiValid === true} 
              isLoading={geminiValid === 'loading'}
              icon={<Key className="w-3.5 h-3.5" />}
              desc={geminiValid === 'error' ? "Key is missing or invalid." : "Required for report analysis."}
            />
            {geminiError && (
              <div className="ml-8 p-2 bg-rose-50 rounded-lg border border-rose-100">
                <p className="text-[10px] text-rose-700 font-mono break-words leading-tight">
                  {geminiError}
                </p>
              </div>
            )}
            <StatusItem 
              label="App URL Match" 
              isValid={status.appUrl && urlMatch} 
              icon={<Globe className="w-3.5 h-3.5" />}
              desc={!urlMatch ? "APP_URL doesn't match this link." : "Required for OAuth redirects."}
            />
            <StatusItem 
              label="Google OAuth" 
              isValid={status.googleClientId && status.googleClientSecret} 
              icon={<Globe className="w-3.5 h-3.5" />}
              desc="Required for user sign-in."
            />
            <StatusItem 
              label="Session Security" 
              isValid={status.sessionSecret} 
              icon={<Lock className="w-3.5 h-3.5" />}
              desc="Required for persistent login."
            />
          </div>

          {!urlMatch && (
            <div className="mt-4 p-3 bg-rose-50 rounded-xl border border-rose-100">
              <p className="text-[10px] font-bold text-rose-600 uppercase tracking-widest mb-1">URL Mismatch Error:</p>
              <p className="text-[11px] text-rose-700 leading-relaxed">
                The <code>APP_URL</code> secret must be set to:<br/>
                <span className="font-mono font-bold">{window.location.origin}</span>
              </p>
            </div>
          )}

          <div className="mt-6 p-3 bg-slate-50 rounded-xl border border-slate-100">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">How to fix:</p>
            <p className="text-[11px] text-slate-600 leading-relaxed">
              1. Go to <strong>Settings &gt; Secrets</strong>.<br/>
              2. Add/Update the missing variables.<br/>
              3. <strong>Restart</strong> the dev server to apply.
            </p>
          </div>
          
          <button 
            onClick={() => window.location.reload()}
            className="mt-4 w-full py-2 bg-slate-900 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 hover:bg-slate-800 transition-all"
          >
            <RefreshCw className="w-3 h-3" />
            Check Again
          </button>
        </div>
      </div>
    </div>
  );
}

function StatusItem({ 
  label, 
  isValid, 
  isLoading, 
  icon, 
  desc 
}: { 
  label: string; 
  isValid: boolean; 
  isLoading?: boolean;
  icon: React.ReactNode; 
  desc: string 
}) {
  return (
    <div className="flex items-start gap-3 p-2 rounded-lg transition-colors hover:bg-slate-50">
      <div className={`mt-0.5 w-5 h-5 rounded-full flex items-center justify-center ${
        isLoading ? 'bg-slate-100 text-slate-400' : 
        isValid ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600'
      }`}>
        {isLoading ? <RefreshCw className="w-3 h-3 animate-spin" /> : 
         isValid ? <CheckCircle2 className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-bold text-slate-900">{label}</span>
          <span className="text-slate-300">{icon}</span>
        </div>
        <p className="text-[10px] text-slate-400 truncate">{desc}</p>
      </div>
    </div>
  );
}

