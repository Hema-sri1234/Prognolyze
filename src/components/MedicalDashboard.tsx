import React, { useState, useRef, useEffect } from 'react';
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
  User,
  Share2,
  Download,
  X,
  FileUp,
} from 'lucide-react';
import { summarizeMedicalReport, extractTextFromImage, MedicalSummary } from '../services/geminiService';
import ReactMarkdown from 'react-markdown';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import * as pdfjsLib from 'pdfjs-dist';
import * as mammoth from 'mammoth';

// Use a stable version of pdfjs-dist
const PDFJS_VERSION = '4.10.38';
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/pdf.worker.min.mjs`;

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export default function MedicalDashboard() {
  const [user, setUser] = useState<{ name: string; email: string; picture: string } | null>(null);
  const [reportText, setReportText] = useState('');
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageData, setImageData] = useState<{ data: string; mimeType: string } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<MedicalSummary | null>(null);
  const [rawOcrText, setRawOcrText] = useState<string | null>(null);
  const [showRawOcr, setShowRawOcr] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      if (imagePreview) URL.revokeObjectURL(imagePreview);
    };
  }, [imagePreview]);

  useEffect(() => {
    checkAuth();
    
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'OAUTH_AUTH_SUCCESS') {
        checkAuth();
      }
    };
    
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  useEffect(() => {
    if (user) {
      fetchHistory();
    }
  }, [user]);

  const fetchHistory = async () => {
    try {
      const res = await fetch('/api/reports');
      if (res.ok) {
        const data = await res.json();
        setHistory(data);
      }
    } catch (err) {
      console.error('Failed to fetch history:', err);
    }
  };

  const saveReport = async (reportData: MedicalSummary) => {
    if (!user) return;
    setIsSaving(true);
    try {
      const res = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: fileName || 'Manual Entry',
          summary: reportData
        })
      });
      if (res.ok) {
        fetchHistory();
      }
    } catch (err) {
      console.error('Failed to save report:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const deleteHistoryItem = async (id: number) => {
    try {
      const res = await fetch(`/api/reports/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setHistory(history.filter(h => h.id !== id));
      }
    } catch (err) {
      console.error('Failed to delete history item:', err);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      setUser(null);
      setHistory([]);
      setResult(null);
      setShowHistory(false);
    } catch (err) {
      console.error('Logout failed:', err);
    }
  };

  const checkAuth = async () => {
    try {
      const res = await fetch('/api/auth/me');
      if (res.ok) {
        const data = await res.json();
        setUser(data);
      }
    } catch (err) {
      console.error('Auth check failed:', err);
    }
  };

  const handleSignIn = async () => {
    try {
      const res = await fetch('/api/auth/url');
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.details || data.error || 'Failed to initialize sign in');
      }
      
      const { url } = data;
      
      const width = 500;
      const height = 600;
      const left = window.screenX + (window.outerWidth - width) / 2;
      const top = window.screenY + (window.outerHeight - height) / 2;
      
      window.open(
        url,
        'google_auth',
        `width=${width},height=${height},left=${left},top=${top}`
      );
    } catch (err: any) {
      console.error('SignIn Error:', err);
      alert(`Sign In Error: ${err.message}`);
    }
  };

  const handleSave = () => {
    if (!result) return;

    const reportContent = `MEDICAL ANALYSIS REPORT\n` +
      `Generated on: ${new Date().toLocaleString()}\n` +
      `-------------------------------------------\n\n` +
      `PATIENT PROFILE\n` +
      `Name: ${result.patientDetails.name || 'N/A'}\n` +
      `Age: ${result.patientDetails.age || 'N/A'}\n` +
      `Gender: ${result.patientDetails.gender || 'N/A'}\n` +
      `ID: ${result.patientDetails.patientId || 'N/A'}\n` +
      `Contact: ${result.patientDetails.contact || 'N/A'}\n` +
      `Address: ${result.patientDetails.address || 'N/A'}\n\n` +
      `VITAL PARAMETERS\n` +
      `BP: ${result.patientDetails.vitals?.bloodPressure || '--'}\n` +
      `HR: ${result.patientDetails.vitals?.heartRate || '--'}\n` +
      `Temp: ${result.patientDetails.vitals?.temperature || '--'}\n` +
      `SpO2: ${result.patientDetails.vitals?.oxygenSaturation || '--'}\n` +
      `Weight: ${result.patientDetails.vitals?.weight || '--'}\n\n` +
      `CLINICAL SNAPSHOT\n` +
      `${result.clinicalSnapshot}\n\n` +
      `DETAILED CLINICAL ANALYSIS\n` +
      `${result.detailedClinicalAnalysis}\n\n` +
      `RECOMMENDATIONS\n` +
      `${result.recommendations.join('\n')}\n\n` +
      `RISK LEVEL: ${result.riskLevel}\n` +
      `-------------------------------------------`;

    const blob = new Blob([reportContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Medical_Analysis_${result.patientDetails.name || 'Report'}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleShare = async () => {
    if (!result) return;

    const shareText = `Medical Report Analysis Summary\n\n` +
      `Patient: ${result.patientDetails.name || 'N/A'}\n` +
      `Risk Level: ${result.riskLevel}\n\n` +
      `Clinical Snapshot:\n${result.clinicalSnapshot}\n\n` +
      `Detailed Analysis:\n${result.detailedClinicalAnalysis}\n\n` +
      `Recommendations:\n${result.recommendations.join('\n')}`;

    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Medical Report Summary',
          text: shareText,
        });
      } catch (err) {
        console.error('Error sharing:', err);
      }
    } else {
      try {
        await navigator.clipboard.writeText(shareText);
        alert('Summary copied to clipboard!');
      } catch (err) {
        console.error('Error copying to clipboard:', err);
      }
    }
  };

  const extractTextFromPDF = async (file: File): Promise<{ text: string; imageData?: { data: string; mimeType: string } }> => {
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
      
      // If text is empty, try to render the first page as an image (OCR fallback)
      if (!fullText.trim() || fullText.trim().length < 20) {
        console.log("PDF appears to be a scan. Rendering first page to image...");
        const page = await pdf.getPage(1);
        const viewport = page.getViewport({ scale: 2.0 }); // High scale for better OCR
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        
        if (context) {
          canvas.height = viewport.height;
          canvas.width = viewport.width;
          
          await page.render({
            canvasContext: context,
            viewport: viewport
          }).promise;
          
          const dataUrl = canvas.toDataURL('image/png');
          const base64 = dataUrl.split(',')[1];
          
          return { 
            text: fullText, 
            imageData: { data: base64, mimeType: 'image/png' } 
          };
        }
      }
      
      return { text: fullText };
    } catch (err: any) {
      console.error("PDF Extraction Error:", err);
      throw new Error(`Could not read PDF: ${err.message || 'Unknown error'}. Try uploading a photo instead.`);
    }
  };

  const handleFileChange = async (file: File) => {
    if (!file) return;
    
    console.log("Processing file:", file.name, file.type, file.size);
    setIsLoading(true);
    setError(null);
    setFileName(file.name);
    setImageData(null);
    setImagePreview(null);
    setReportText('');
    setResult(null);
    setRawOcrText(null);
    setShowRawOcr(false);
    
    try {
      let text = '';
      const fileExt = file.name.toLowerCase().split('.').pop();
      const imageExtensions = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'heic', 'heif', 'tiff', 'tif'];
      const isImage = file.type.startsWith('image/') || imageExtensions.includes(fileExt || '');

      if (file.type === 'application/pdf' || fileExt === 'pdf') {
        console.log("Extracting PDF text...");
        try {
          const pdfResult = await extractTextFromPDF(file);
          text = pdfResult.text;
          if (pdfResult.imageData) {
            setImageData(pdfResult.imageData);
            setImagePreview(`data:${pdfResult.imageData.mimeType};base64,${pdfResult.imageData.data}`);
            console.log("PDF converted to image for analysis.");
          }
          setReportText(text || (pdfResult.imageData ? `[Scanned PDF: ${file.name}]` : ''));
        } catch (pdfErr: any) {
          console.warn("PDF processing failed:", pdfErr);
          throw pdfErr;
        }
      } else if (isImage) {
        console.log("Processing image...");
        const reader = new FileReader();
        const base64Promise = new Promise<string>((resolve, reject) => {
          reader.onload = () => {
            const result = reader.result as string;
            if (result.includes(',')) {
              resolve(result.split(',')[1]);
            } else {
              reject(new Error("Invalid image data format"));
            }
          };
          reader.onerror = () => reject(new Error("Failed to read image file"));
        });
        reader.readAsDataURL(file);
        const base64 = await base64Promise;
        const mimeType = file.type || `image/${fileExt === 'jpg' ? 'jpeg' : fileExt}`;
        setImageData({ data: base64, mimeType });
        const previewUrl = URL.createObjectURL(file);
        setImagePreview(previewUrl);
        setReportText(`[Image File: ${file.name}]`);
      } else if (file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || fileExt === 'docx') {
        console.log("Extracting Word text...");
        const arrayBuffer = await file.arrayBuffer();
        const result = await mammoth.extractRawText({ arrayBuffer });
        text = result.value;
        setReportText(text);
      } else {
        // Try reading as text for all other file types (txt, csv, etc.)
        console.log("Reading as plain text...");
        text = await file.text();
        setReportText(text);
      }
      
      console.log("File processed successfully. Text length:", text.length);
      
      // If we have no image data and the extracted text is suspiciously short
      if (!imageData && (!text || !text.trim() || text.trim().length < 10)) {
        if (file.type === 'application/pdf' || fileExt === 'pdf') {
          throw new Error('This PDF contains very little readable text. It appears to be a scanned image or a photo saved as a PDF. Please upload a clear photo (JPG or PNG) of the report instead for better results.');
        }
        if (file.type.startsWith('text/') || ['txt', 'csv', 'md'].includes(fileExt || '')) {
          throw new Error('The text file you uploaded appears to be empty or contains too little information to analyze.');
        }
        throw new Error('We could not find any readable text in this file. If this is a medical report, please try: 1. Copying and pasting the text manually. 2. Uploading a clear photo (JPG/PNG) of the document. 3. Ensuring the file is not password protected.');
      }
    } catch (err: any) {
      console.error("File Processing Error:", err);
      setError(`Error reading ${file.name}: ${err.message || 'Unknown error'}`);
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
    setRawOcrText(null);
    setShowRawOcr(false);
    try {
      const input = imageData ? { inlineData: imageData } : reportText;
      
      // Run both in parallel if it's an image
      if (imageData) {
        const [summary, ocrText] = await Promise.all([
          summarizeMedicalReport(input),
          extractTextFromImage({ inlineData: imageData })
        ]);
        setResult(summary);
        setRawOcrText(ocrText);
        if (user) {
          saveReport(summary);
        }
      } else {
        const summary = await summarizeMedicalReport(input);
        setResult(summary);
        setRawOcrText(reportText);
        if (user) {
          saveReport(summary);
        }
      }
    } catch (err: any) {
      console.error("Analysis Error:", err);
      let errorMessage = err.message || 'An unexpected error occurred during analysis';
      
      if (errorMessage.includes('API key not valid') || errorMessage.includes('400')) {
        errorMessage = "Invalid API Key: Please ensure your GEMINI_API_KEY is correctly set in the Secrets menu (Settings > Secrets) and restart the server.";
      }
      
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const clearFile = () => {
    setFileName(null);
    setReportText('');
    setImageData(null);
    setImagePreview(null);
    setResult(null);
    setRawOcrText(null);
    setShowRawOcr(false);
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
            <div className="w-10 h-10 bg-sky-600 rounded-xl flex items-center justify-center shadow-lg shadow-sky-200 cursor-pointer" onClick={() => { setShowHistory(false); setResult(null); }}>
              <Stethoscope className="text-white w-6 h-6" />
            </div>
            <div className="cursor-pointer" onClick={() => { setShowHistory(false); setResult(null); }}>
              <h1 className="font-sans font-bold text-xl tracking-tight text-slate-900">PROGNOLYZE</h1>
              <p className="text-[10px] uppercase tracking-widest font-semibold text-slate-400 leading-none">NLP Medical Analysis</p>
            </div>
          </div>
          <nav className="flex items-center gap-4 sm:gap-6">
            {user && (
              <button 
                onClick={() => setShowHistory(!showHistory)}
                className={cn(
                  "text-sm font-bold transition-colors flex items-center gap-2",
                  showHistory ? "text-sky-600" : "text-slate-600 hover:text-sky-600"
                )}
              >
                <ClipboardCheck className="w-4 h-4" />
                <span className="hidden sm:inline">History</span>
              </button>
            )}
            
            {user ? (
              <div className="flex items-center gap-3 pl-4 border-l border-slate-200">
                <div className="text-right hidden sm:block">
                  <p className="text-sm font-bold text-slate-900 leading-none">{user.name}</p>
                  <button 
                    onClick={handleLogout}
                    className="text-[10px] font-bold text-slate-400 uppercase tracking-wider hover:text-rose-500 transition-colors"
                  >
                    Sign Out
                  </button>
                </div>
                <img 
                  src={user.picture} 
                  alt={user.name} 
                  className="w-8 h-8 rounded-full border border-slate-200"
                  referrerPolicy="no-referrer"
                />
              </div>
            ) : (
              <button 
                onClick={handleSignIn}
                className="px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-medium hover:bg-slate-800 transition-all shadow-sm"
              >
                Sign In
              </button>
            )}
          </nav>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-8 md:py-12">
        <AnimatePresence mode="wait">
          {showHistory ? (
            <motion.div
              key="history"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-8"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-3xl font-bold text-slate-900">Report History</h2>
                  <p className="text-slate-500">Access your previously analyzed medical documents.</p>
                </div>
                <button 
                  onClick={() => setShowHistory(false)}
                  className="px-6 py-2 bg-sky-600 text-white rounded-xl font-bold hover:bg-sky-700 transition-all"
                >
                  New Analysis
                </button>
              </div>

              {history.length === 0 ? (
                <div className="bg-white border border-slate-200 rounded-3xl p-16 text-center">
                  <div className="w-20 h-20 bg-slate-100 rounded-3xl flex items-center justify-center mx-auto mb-6">
                    <FileText className="w-10 h-10 text-slate-400" />
                  </div>
                  <h3 className="text-xl font-bold text-slate-900 mb-2">No saved reports</h3>
                  <p className="text-slate-500 max-w-sm mx-auto">
                    Your analyzed reports will appear here automatically when you're signed in.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {history.map((item) => (
                    <motion.div
                      key={item.id}
                      layout
                      className="bg-white border border-slate-200 rounded-2xl p-6 hover:border-sky-300 hover:shadow-xl hover:shadow-sky-500/5 transition-all group relative"
                    >
                      <button 
                        onClick={() => deleteHistoryItem(item.id)}
                        className="absolute top-4 right-4 p-2 text-slate-300 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-all"
                      >
                        <X className="w-4 h-4" />
                      </button>
                      
                      <div className="flex items-center gap-4 mb-6">
                        <div className="w-12 h-12 bg-sky-50 text-sky-600 rounded-xl flex items-center justify-center">
                          <FileText className="w-6 h-6" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="font-bold text-slate-900 truncate">{item.file_name}</h4>
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                            {new Date(item.created_at).toLocaleDateString()}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 mb-6">
                        <span className={cn(
                          "px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border",
                          getRiskColor(item.summary.riskLevel)
                        )}>
                          {item.summary.riskLevel} Risk
                        </span>
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                          {item.summary.keywords.length} Terms
                        </span>
                      </div>

                      <button 
                        onClick={() => {
                          setResult(item.summary);
                          setFileName(item.file_name);
                          setShowHistory(false);
                        }}
                        className="w-full py-3 bg-slate-50 text-slate-900 rounded-xl text-sm font-bold hover:bg-sky-600 hover:text-white transition-all border border-slate-100"
                      >
                        View Full Analysis
                      </button>
                    </motion.div>
                  ))}
                </div>
              )}
            </motion.div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: Input */}
        <div className="lg:col-span-5 space-y-6">
            <div className="space-y-2">
              <h2 className="text-3xl font-bold tracking-tight text-slate-900">Medical Document Analysis</h2>
              <p className="text-slate-500 text-lg">Upload any medical file or paste report text below.</p>
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
                    <p className="text-xs text-slate-400 mt-1">All file types supported (PDF, Images, Text, etc.)</p>
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
              {imagePreview ? (
                <div className="relative w-full h-64 bg-slate-100 rounded-xl overflow-hidden border border-slate-200 group">
                  <img 
                    src={imagePreview} 
                    alt="Medical Report Preview" 
                    className="w-full h-full object-contain"
                    referrerPolicy="no-referrer"
                  />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <button 
                      onClick={clearFile}
                      className="bg-white/20 backdrop-blur-md text-white p-2 rounded-full hover:bg-white/30 transition-all"
                    >
                      <X className="w-6 h-6" />
                    </button>
                  </div>
                  <div className="absolute bottom-3 left-3 right-3 bg-white/90 backdrop-blur-sm p-2 rounded-lg border border-slate-200 flex items-center justify-between">
                    <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wider truncate mr-2">
                      {fileName}
                    </span>
                    <span className="text-[10px] font-bold text-sky-600 uppercase tracking-wider whitespace-nowrap">
                      Image Detected
                    </span>
                  </div>
                </div>
              ) : (
                <textarea
                  value={reportText}
                  onChange={(e) => setReportText(e.target.value)}
                  placeholder="Paste medical report content here..."
                  className="w-full h-48 p-4 bg-slate-50/50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 outline-none transition-all resize-none text-slate-700 leading-relaxed"
                />
              )}
              {!imagePreview && (
                <div className="absolute bottom-4 right-4 text-[10px] font-mono text-slate-400 uppercase tracking-wider">
                  {reportText.length} characters
                </div>
              )}
            </div>

            <button
              onClick={handleSummarize}
              disabled={isLoading || (!reportText.trim() && !imageData)}
              className={cn(
                "w-full py-4 rounded-xl font-bold flex items-center justify-center gap-2 transition-all shadow-lg",
                isLoading || (!reportText.trim() && !imageData)
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

            {imageData && !isLoading && (
              <button
                onClick={async () => {
                  setIsLoading(true);
                  try {
                    const text = await extractTextFromImage({ inlineData: imageData });
                    setRawOcrText(text);
                    setShowRawOcr(true);
                    setResult(null); // Clear result to show OCR view
                  } catch (err: any) {
                    setError(err.message || 'Failed to extract text');
                  } finally {
                    setIsLoading(false);
                  }
                }}
                className="w-full py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all border border-slate-200 text-slate-600 hover:bg-slate-50"
              >
                <FileText className="w-4 h-4" />
                Just Extract Text (OCR)
              </button>
            )}

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
                <p className="text-slate-500 max-w-xs mx-auto mb-6">
                  Your summarized report and extracted keywords will appear here once you click "Analyze Report".
                </p>
                
                <div className="w-full max-w-sm space-y-3 text-left">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center mb-4">Quick Instructions</p>
                  <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
                    <div className="w-6 h-6 bg-sky-100 text-sky-600 rounded-lg flex items-center justify-center text-xs font-bold">1</div>
                    <p className="text-xs text-slate-600 font-medium">Upload a PDF, Image, or paste text</p>
                  </div>
                  <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
                    <div className="w-6 h-6 bg-sky-100 text-sky-600 rounded-lg flex items-center justify-center text-xs font-bold">2</div>
                    <p className="text-xs text-slate-600 font-medium">Click the "Analyze Report" button</p>
                  </div>
                  <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
                    <div className="w-6 h-6 bg-sky-100 text-sky-600 rounded-lg flex items-center justify-center text-xs font-bold">3</div>
                    <p className="text-xs text-slate-600 font-medium">Review keywords and next steps</p>
                  </div>
                </div>
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
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => setShowRawOcr(!showRawOcr)}
                        className={cn(
                          "flex items-center gap-2 px-4 py-2 border rounded-xl text-sm font-bold transition-all shadow-sm",
                          showRawOcr ? "bg-sky-600 border-sky-600 text-white" : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                        )}
                      >
                        <Search className="w-4 h-4" />
                        {showRawOcr ? "View Analysis" : "View OCR Result"}
                      </button>
                      <button
                        onClick={handleSave}
                        className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-50 transition-colors shadow-sm"
                      >
                        <Download className="w-4 h-4" />
                        Save
                      </button>
                      <button
                        onClick={handleShare}
                        className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-50 transition-colors shadow-sm"
                      >
                        <Share2 className="w-4 h-4" />
                        Share
                      </button>
                      <div className={cn(
                        "px-4 py-1.5 rounded-full text-xs font-bold border uppercase tracking-widest flex items-center gap-2",
                        getRiskColor(result.riskLevel)
                      )}>
                        <div className="w-2 h-2 rounded-full bg-current animate-pulse" />
                        {result.riskLevel} Risk
                      </div>
                    </div>
                  </div>

                  {showRawOcr ? (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="p-8 bg-slate-900 rounded-2xl border border-slate-800 shadow-2xl"
                    >
                      <div className="flex items-center justify-between mb-6">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-sky-500/20 rounded-xl flex items-center justify-center">
                            <FileText className="text-sky-400 w-5 h-5" />
                          </div>
                          <h4 className="text-lg font-bold text-white">Extracted Text (OCR)</h4>
                        </div>
                        <button 
                          onClick={() => setShowRawOcr(false)}
                          className="text-slate-400 hover:text-white transition-colors"
                        >
                          <X className="w-5 h-5" />
                        </button>
                      </div>
                      <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700 max-h-[600px] overflow-y-auto custom-scrollbar">
                        <pre className="text-sm text-slate-300 font-mono whitespace-pre-wrap leading-relaxed">
                          {rawOcrText || "No text extracted."}
                        </pre>
                      </div>
                      <div className="mt-6 flex items-center gap-2 text-slate-500 text-xs">
                        <Info className="w-4 h-4" />
                        <span>This is the raw text extracted from the document before analysis.</span>
                      </div>
                    </motion.div>
                  ) : (
                    <>
                      {/* Patient Info & Vitals */}
                      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="lg:col-span-1 p-6 bg-slate-50/50 border border-slate-100 rounded-2xl space-y-4">
                      <div className="flex items-center gap-2 mb-2">
                        <User className="w-4 h-4 text-slate-500" />
                        <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Patient Profile</h4>
                      </div>
                      <div className="space-y-3">
                        <div className="flex justify-between items-center">
                          <span className="text-[10px] font-medium text-slate-400 uppercase">Name</span>
                          <span className="text-sm font-bold text-slate-900">{result.patientDetails.name || 'Not specified'}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-[10px] font-medium text-slate-400 uppercase">Age</span>
                          <span className="text-sm font-bold text-slate-900">{result.patientDetails.age || 'Not specified'}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-[10px] font-medium text-slate-400 uppercase">Gender</span>
                          <span className="text-sm font-bold text-slate-900">{result.patientDetails.gender || 'Not specified'}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-[10px] font-medium text-slate-400 uppercase">Patient ID</span>
                          <span className="text-sm font-bold text-slate-900">{result.patientDetails.patientId || 'Not specified'}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-[10px] font-medium text-slate-400 uppercase">Contact</span>
                          <span className="text-sm font-bold text-slate-900">{result.patientDetails.contact || 'Not specified'}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-[10px] font-medium text-slate-400 uppercase">Address</span>
                          <span className="text-sm font-bold text-slate-900 truncate max-w-[150px]">{result.patientDetails.address || 'Not specified'}</span>
                        </div>
                      </div>
                    </div>

                    <div className="lg:col-span-2 p-6 bg-slate-50/50 border border-slate-100 rounded-2xl">
                      <div className="flex items-center gap-2 mb-4">
                        <Activity className="w-4 h-4 text-slate-500" />
                        <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Vital Parameters</h4>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                        {[
                          { label: 'BP', value: result.patientDetails.vitals?.bloodPressure, icon: '💓' },
                          { label: 'HR', value: result.patientDetails.vitals?.heartRate, icon: '🫀' },
                          { label: 'Temp', value: result.patientDetails.vitals?.temperature, icon: '🌡️' },
                          { label: 'SpO2', value: result.patientDetails.vitals?.oxygenSaturation, icon: '💨' },
                          { label: 'Weight', value: result.patientDetails.vitals?.weight, icon: '⚖️' },
                        ].map((vital, idx) => (
                          <div key={idx} className="p-2 bg-white rounded-xl border border-slate-100 text-center shadow-sm">
                            <div className="text-sm mb-1">{vital.icon}</div>
                            <div className="text-[9px] font-bold text-slate-400 uppercase mb-0.5">{vital.label}</div>
                            <div className="text-xs font-bold text-slate-900 truncate">{vital.value || '--'}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-6">
                    <div className="p-6 bg-slate-900 border border-slate-800 rounded-2xl shadow-xl">
                      <div className="flex items-center gap-2 mb-4">
                        <Stethoscope className="w-5 h-5 text-sky-400" />
                        <h4 className="text-sm font-bold text-sky-100 uppercase tracking-widest">Clinical Snapshot (Keywords)</h4>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {result.clinicalSnapshot.split(/[,;\n]+/).map((item, idx) => {
                          const trimmed = item.trim();
                          if (!trimmed) return null;
                          return (
                            <span 
                              key={idx}
                              className="px-3 py-1.5 bg-sky-500/10 text-sky-300 border border-sky-500/20 rounded-lg text-xs font-mono font-bold"
                            >
                              {trimmed}
                            </span>
                          );
                        })}
                      </div>
                    </div>

                    <div className="p-6 bg-white border border-slate-200 rounded-2xl shadow-sm">
                      <div className="flex items-center gap-2 mb-4">
                        <ClipboardCheck className="w-5 h-5 text-sky-600" />
                        <h4 className="text-sm font-bold text-slate-900 uppercase tracking-widest">Detailed Clinical Analysis</h4>
                      </div>
                      <div className="prose prose-sm prose-slate max-w-none text-slate-700 leading-relaxed">
                        <ReactMarkdown>{result.detailedClinicalAnalysis}</ReactMarkdown>
                      </div>
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
                </>
              )}
            </div>

                {/* Instructions & Next Steps Card */}
                <div className="glass-card rounded-3xl p-8 border-emerald-200 bg-emerald-50/30 shadow-xl shadow-emerald-100/50">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-12 h-12 bg-emerald-600 rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-200">
                      <CheckCircle2 className="text-white w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="text-2xl font-bold text-slate-900">Simple Steps to Follow</h3>
                      <p className="text-xs font-semibold text-emerald-600 uppercase tracking-wider">Easy Instructions for You</p>
                    </div>
                  </div>
                  
                  <div className="grid gap-4">
                    {result.recommendations.map((rec, idx) => (
                      <motion.div
                        key={idx}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2 + idx * 0.1 }}
                        className="flex items-start gap-4 p-5 bg-white border border-emerald-100 rounded-2xl shadow-sm group hover:border-emerald-400 transition-all"
                      >
                        <div className="flex-shrink-0 w-10 h-10 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center font-black text-lg">
                          {idx + 1}
                        </div>
                        <p className="text-slate-800 leading-relaxed font-semibold text-lg">{rec}</p>
                      </motion.div>
                    ))}
                  </div>

                  <div className="mt-8 pt-6 border-t border-emerald-100 flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div className="flex items-center gap-2 text-emerald-700">
                      <ShieldAlert className="w-5 h-5" />
                      <p className="text-sm font-bold max-w-[400px]">
                        Note: This is just to help you understand. Please talk to your doctor before doing anything.
                      </p>
                    </div>
                    <button className="w-full sm:w-auto flex items-center justify-center gap-2 text-base font-bold bg-slate-900 text-white px-8 py-4 rounded-2xl hover:bg-slate-800 transition-all shadow-lg">
                      Save This Plan
                      <ArrowRight className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    )}
  </AnimatePresence>
</main>

      {/* Footer */}
      <footer className="w-full py-8 border-t border-slate-200 mt-auto bg-white">
        <div className="max-w-7xl mx-auto px-4 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 opacity-50">
            <Stethoscope className="w-5 h-5" />
            <span className="text-sm font-bold tracking-tight">PROGNOLYZE Analysis Engine</span>
          </div>
          <p className="text-slate-400 text-xs">
            &copy; {new Date().getFullYear()} PROGNOLYZE NLP. For informational purposes only.
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
