import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  FileText, 
  Search, 
  Activity, 
  AlertCircle, 
  CheckCircle2, 
  ArrowRight, 
  Loader2, 
  ClipboardCheck,
  Stethoscope,
  ShieldAlert,
  Info,
  Upload,
  X,
  FileUp
} from 'lucide-react';
import { summarizeMedicalReport, MedicalSummary } from './services/geminiService';
import ReactMarkdown from 'react-markdown';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import * as pdfjsLib from 'pdfjs-dist';

// Set worker source for pdfjs using a reliable CDN version that matches the installed package
// Using a fixed version to avoid issues with pdfjsLib.version being undefined or mismatched
const PDFJS_VERSION = '4.10.38'; // A stable version often available on CDNs
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version || PDFJS_VERSION}/pdf.worker.min.mjs`;

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export default function App() {
  const [reportText, setReportText] = useState('');
  const [imageData, setImageData] = useState<{ data: string; mimeType: string } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<MedicalSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const extractTextFromPDF = async (file: File): Promise<string> => {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const loadingTask = pdfjsLib.getDocument({ 
        data: arrayBuffer,
        useWorkerFetch: false,
        isEvalSupported: false
      });
      
      const pdf = await loadingTask.promise;
      let fullText = '';
      
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items
          .map((item: any) => item.str)
          .join(' ');
        fullText += pageText + '\n';
      }
      
      return fullText;
    } catch (err: any) {
      console.error("PDF Extraction Error:", err);
      throw new Error(`Could not extract text from PDF: ${err.message || 'Unknown error'}. Please try copying and pasting the text instead.`);
    }
  };

  const handleFileChange = async (file: File) => {
    if (!file) return;
    
    setIsLoading(true);
    setError(null);
    setFileName(file.name);
    setImageData(null);
    
    try {
      let text = '';
      if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
        text = await extractTextFromPDF(file);
        setReportText(text);
      } else if (file.type === 'text/plain' || file.name.toLowerCase().endsWith('.txt')) {
        text = await file.text();
        setReportText(text);
      } else if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        const base64Promise = new Promise<string>((resolve) => {
          reader.onload = () => {
            const base64 = (reader.result as string).split(',')[1];
            resolve(base64);
          };
        });
        reader.readAsDataURL(file);
        const base64 = await base64Promise;
        setImageData({ data: base64, mimeType: file.type });
        setReportText(`[Image File: ${file.name}]`);
      } else {
        throw new Error('Unsupported file type. Please upload a PDF, TXT, or Image file.');
      }
      
      if (file.type !== 'image/' && !text.trim() && !file.type.startsWith('image/')) {
        throw new Error('The file appears to be empty or contains no readable text.');
      }
    } catch (err: any) {
      console.error("File Processing Error:", err);
      setError(err.message || 'Failed to read file');
      setFileName(null);
      setReportText('');
      setImageData(null);
    } finally {
      setIsLoading(false);
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileChange(file);
  };

  const handleSummarize = async () => {
    if (!reportText.trim() && !imageData) return;
    
    setIsLoading(true);
    setError(null);
    try {
      const input = imageData ? { inlineData: imageData } : reportText;
      const summary = await summarizeMedicalReport(input);
      setResult(summary);
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred during analysis');
    } finally {
      setIsLoading(false);
    }
  };

  const clearFile = () => {
    setFileName(null);
    setReportText('');
    setImageData(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const getRiskColor = (level: string) => {
    switch (level) {
      case 'Low': return 'text-emerald-600 bg-emerald-50 border-emerald-100';
      case 'Medium': return 'text-amber-600 bg-amber-50 border-amber-100';
      case 'High': return 'text-rose-600 bg-rose-50 border-rose-100';
      default: return 'text-slate-600 bg-slate-50 border-slate-100';
    }
  };

  return (
    <div className="min-h-screen medical-gradient flex flex-col">
      {/* Header */}
      <header className="w-full border-b border-slate-200/60 bg-white/50 backdrop-blur-md sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 bg-sky-600 rounded-xl flex items-center justify-center shadow-lg shadow-sky-200">
              <Stethoscope className="text-white w-6 h-6" />
            </div>
            <div>
              <h1 className="font-sans font-bold text-xl tracking-tight text-slate-900">MedSum</h1>
              <p className="text-[10px] uppercase tracking-widest font-semibold text-slate-400 leading-none">NLP Medical Analysis</p>
            </div>
          </div>
          <nav className="hidden md:flex items-center gap-6">
            <a href="#" className="text-sm font-medium text-slate-600 hover:text-sky-600 transition-colors">How it works</a>
            <a href="#" className="text-sm font-medium text-slate-600 hover:text-sky-600 transition-colors">Privacy</a>
            <button className="px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-medium hover:bg-slate-800 transition-all shadow-sm">
              Sign In
            </button>
          </nav>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-8 md:py-12 grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: Input */}
        <div className="lg:col-span-5 space-y-6">
          <div className="space-y-2">
            <h2 className="text-3xl font-bold tracking-tight text-slate-900">Analyze your report</h2>
            <p className="text-slate-500 text-lg">Upload a PDF/TXT/Image or paste your medical report text below.</p>
          </div>

          <div className="glass-card rounded-2xl p-6 space-y-4">
            {/* File Upload Area */}
            <div 
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={onDrop}
              onClick={() => fileInputRef.current?.click()}
              className={cn(
                "border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center gap-3 transition-all cursor-pointer",
                isDragging ? "border-sky-500 bg-sky-50" : "border-slate-200 hover:border-sky-300 hover:bg-slate-50/50",
                fileName ? "bg-sky-50/30 border-sky-200" : ""
              )}
            >
              <input 
                type="file" 
                ref={fileInputRef}
                onChange={(e) => e.target.files?.[0] && handleFileChange(e.target.files[0])}
                accept=".pdf,.txt,image/*"
                className="hidden"
              />
              
              {fileName ? (
                <div className="flex flex-col items-center gap-2">
                  <div className="w-12 h-12 bg-sky-100 rounded-full flex items-center justify-center text-sky-600">
                    <FileUp className="w-6 h-6" />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-bold text-slate-900 truncate max-w-[200px]">{fileName}</p>
                    <button 
                      onClick={(e) => { e.stopPropagation(); clearFile(); }}
                      className="text-[10px] font-bold text-rose-500 uppercase tracking-wider hover:underline mt-1"
                    >
                      Remove File
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center text-slate-400">
                    <Upload className="w-6 h-6" />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-bold text-slate-700">Click to upload or drag and drop</p>
                    <p className="text-xs text-slate-400 mt-1">PDF, TXT, or Image files supported</p>
                  </div>
                </>
              )}
            </div>

            <div className="relative">
              <div className="absolute inset-0 flex items-center" aria-hidden="true">
                <div className="w-full border-t border-slate-100"></div>
              </div>
              <div className="relative flex justify-center text-xs uppercase tracking-widest font-bold">
                <span className="bg-white px-3 text-slate-300">Or paste text</span>
              </div>
            </div>

            <div className="relative">
              <textarea
                value={reportText}
                onChange={(e) => setReportText(e.target.value)}
                placeholder="Paste medical report content here..."
                className="w-full h-48 p-4 bg-slate-50/50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 outline-none transition-all resize-none text-slate-700 leading-relaxed"
              />
              <div className="absolute bottom-4 right-4 text-[10px] font-mono text-slate-400 uppercase tracking-wider">
                {reportText.length} characters
              </div>
            </div>

            <button
              onClick={handleSummarize}
              disabled={isLoading || !reportText.trim()}
              className={cn(
                "w-full py-4 rounded-xl font-bold flex items-center justify-center gap-2 transition-all shadow-lg",
                isLoading || !reportText.trim() 
                  ? "bg-slate-100 text-slate-400 cursor-not-allowed" 
                  : "bg-sky-600 text-white hover:bg-sky-700 shadow-sky-200 active:scale-[0.98]"
              )}
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Processing Report...
                </>
              ) : (
                <>
                  <Search className="w-5 h-5" />
                  Analyze Report
                </>
              )}
            </button>

            {error && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-3 bg-rose-50 border border-rose-100 rounded-lg flex items-start gap-2 text-rose-600 text-sm"
              >
                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <p>{error}</p>
              </motion.div>
            )}

            <div className="pt-4 border-t border-slate-100 flex items-center gap-4 text-slate-400">
              <div className="flex items-center gap-1.5">
                <ShieldAlert className="w-3.5 h-3.5" />
                <span className="text-[10px] font-semibold uppercase tracking-wider">HIPAA Compliant</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Info className="w-3.5 h-3.5" />
                <span className="text-[10px] font-semibold uppercase tracking-wider">AI Analysis</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Results */}
        <div className="lg:col-span-7">
          <AnimatePresence mode="wait">
            {!result && !isLoading ? (
              <motion.div
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="h-full min-h-[400px] flex flex-col items-center justify-center text-center p-8 glass-card rounded-3xl border-dashed border-2"
              >
                <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mb-6">
                  <FileText className="text-slate-300 w-10 h-10" />
                </div>
                <h3 className="text-xl font-bold text-slate-800 mb-2">No analysis yet</h3>
                <p className="text-slate-500 max-w-xs mx-auto">
                  Your summarized report and extracted keywords will appear here once you click "Analyze Report".
                </p>
              </motion.div>
            ) : isLoading ? (
              <motion.div
                key="loading"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="h-full min-h-[400px] flex flex-col items-center justify-center text-center p-8 glass-card rounded-3xl"
              >
                <div className="relative mb-8">
                  <div className="w-24 h-24 border-4 border-sky-100 border-t-sky-600 rounded-full animate-spin" />
                  <Activity className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-sky-600 w-8 h-8 animate-pulse" />
                </div>
                <h3 className="text-xl font-bold text-slate-800 mb-2">Analyzing Medical Data</h3>
                <p className="text-slate-500 max-w-xs mx-auto">
                  Our NLP engine is extracting key terms and generating a concise summary...
                </p>
              </motion.div>
            ) : (
              <motion.div
                key="result"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                className="space-y-6"
              >
                {/* Risk & Summary Card */}
                <div className="glass-card rounded-3xl p-8 space-y-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 bg-sky-50 rounded-2xl flex items-center justify-center">
                        <ClipboardCheck className="text-sky-600 w-6 h-6" />
                      </div>
                      <h3 className="text-2xl font-bold text-slate-900">Analysis Result</h3>
                    </div>
                    <div className={cn(
                      "px-4 py-1.5 rounded-full text-xs font-bold border uppercase tracking-widest flex items-center gap-2",
                      getRiskColor(result.riskLevel)
                    )}>
                      <div className="w-2 h-2 rounded-full bg-current animate-pulse" />
                      {result.riskLevel} Risk
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h4 className="text-sm font-bold text-slate-400 uppercase tracking-widest">Summary</h4>
                    <div className="prose prose-slate max-w-none text-slate-700 leading-relaxed">
                      <ReactMarkdown>{result.summary}</ReactMarkdown>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h4 className="text-sm font-bold text-slate-400 uppercase tracking-widest">Key Medical Terms (Doctor & Patient View)</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {result.keywords.map((keyword, idx) => (
                        <motion.div
                          key={idx}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: idx * 0.05 }}
                          className="p-4 bg-slate-50 border border-slate-200 rounded-xl hover:border-sky-300 hover:bg-sky-50 transition-all group"
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <div className="w-1.5 h-1.5 rounded-full bg-sky-500" />
                            <span className="font-bold text-slate-900 group-hover:text-sky-700 transition-colors">
                              {keyword.term}
                            </span>
                          </div>
                          <p className="text-xs text-slate-500 leading-relaxed">
                            {keyword.explanation}
                          </p>
                        </motion.div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Recommendations Card */}
                <div className="glass-card rounded-3xl p-8 bg-sky-900 text-white shadow-xl shadow-sky-900/20">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center">
                      <CheckCircle2 className="text-sky-300 w-6 h-6" />
                    </div>
                    <h3 className="text-xl font-bold">Recommendations</h3>
                  </div>
                  <ul className="space-y-4">
                    {result.recommendations.map((rec, idx) => (
                      <motion.li
                        key={idx}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.2 + idx * 0.1 }}
                        className="flex items-start gap-3 group"
                      >
                        <div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-sky-400 group-hover:scale-150 transition-transform" />
                        <p className="text-sky-50 leading-relaxed">{rec}</p>
                      </motion.li>
                    ))}
                  </ul>
                  <div className="mt-8 pt-6 border-t border-white/10 flex items-center justify-between">
                    <p className="text-xs text-sky-300 font-medium max-w-[200px]">
                      Always consult with a qualified medical professional before making health decisions.
                    </p>
                    <button className="flex items-center gap-2 text-sm font-bold bg-white text-sky-900 px-4 py-2 rounded-lg hover:bg-sky-50 transition-colors">
                      Export PDF
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full py-8 border-t border-slate-200 mt-auto bg-white">
        <div className="max-w-7xl mx-auto px-4 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 opacity-50">
            <Stethoscope className="w-5 h-5" />
            <span className="text-sm font-bold tracking-tight">MedSum Analysis Engine</span>
          </div>
          <p className="text-slate-400 text-xs">
            &copy; {new Date().getFullYear()} MedSum NLP. For informational purposes only.
          </p>
          <div className="flex items-center gap-6">
            <a href="#" className="text-xs font-semibold text-slate-400 hover:text-slate-600">Terms</a>
            <a href="#" className="text-xs font-semibold text-slate-400 hover:text-slate-600">Privacy Policy</a>
            <a href="#" className="text-xs font-semibold text-slate-400 hover:text-slate-600">Contact Support</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
