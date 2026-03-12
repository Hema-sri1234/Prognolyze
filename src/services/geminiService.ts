import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export interface Keyword {
  term: string;
  explanation: string;
}

export interface PatientDetails {
  name?: string;
  age?: string;
  gender?: string;
  patientId?: string;
  contact?: string;
  address?: string;
  vitals?: {
    bloodPressure?: string;
    heartRate?: string;
    temperature?: string;
    oxygenSaturation?: string;
    weight?: string;
  };
}

export interface MedicalSummary {
  patientDetails: PatientDetails;
  keywords: Keyword[];
  clinicalSnapshot: string; // High-density technical keywords
  detailedClinicalAnalysis: string; // Elaborated technical analysis for doctors
  recommendations: string[];
  riskLevel: "Low" | "Medium" | "High";
}

export interface ImageInput {
  inlineData: {
    data: string;
    mimeType: string;
  };
}

export async function extractTextFromImage(input: ImageInput): Promise<string> {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: {
      parts: [
        { text: "Perform high-precision OCR on this medical document. Extract all text exactly as it appears, including patient details, vital signs, laboratory values with units, clinical notes, and physician signatures. Maintain the structural layout and tabular data integrity. If there are handwritten notes, attempt to transcribe them accurately." },
        input
      ]
    }
  });

  return response.text || "No text found in image.";
}

export async function summarizeMedicalReport(input: string | ImageInput): Promise<MedicalSummary> {
  const isImage = typeof input !== 'string';
  
  const contents = isImage 
    ? {
        parts: [
          { text: "Analyze this medical document for a professional clinical review. Provide: 1. Comprehensive Patient Personal Information (Name, Age, Gender, Patient ID, Contact, Address if available). 2. Vital Parameters. 3. 'Clinical Snapshot': A high-density list of technical keywords and clinical markers. 4. 'Detailed Clinical Analysis': A comprehensive list of ALL important points from the report, formatted as clear, professional bullet points. Focus on pathophysiology, diagnostic implications, and clinical significance. 5. Key medical terms with technical explanations. 6. Professional clinical recommendations. 7. Risk level." },
          input
        ]
      }
    : `Analyze the following medical document text for a professional clinical review.
    
    REQUIRED OUTPUTS:
    1. Patient Personal Information: Extract Name, Age, Gender, Patient ID, Contact, and Address if present.
    2. Vital Parameters: Extract Blood Pressure, Heart Rate, Temperature, Oxygen Saturation, Weight.
    3. Clinical Snapshot: Provide a high-density list of technical keywords and short clinical phrases. Focus on abnormal values and diagnostic markers.
    4. Detailed Clinical Analysis: Provide a comprehensive list of ALL important points from the report, formatted as clear, professional bullet points. Focus on clinical significance, diagnostic correlations, and technical details suitable for a physician.
    5. Key Medical Terms: Extract important clinical markers with technical explanations.
    6. Clinical Recommendations: Professional next steps and follow-up actions.
    7. Risk Level: Low, Medium, or High.

    Medical Document Content:
    ${input}`;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: contents,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          patientDetails: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING },
              age: { type: Type.STRING },
              gender: { type: Type.STRING },
              patientId: { type: Type.STRING },
              contact: { type: Type.STRING },
              address: { type: Type.STRING },
              vitals: {
                type: Type.OBJECT,
                properties: {
                  bloodPressure: { type: Type.STRING },
                  heartRate: { type: Type.STRING },
                  temperature: { type: Type.STRING },
                  oxygenSaturation: { type: Type.STRING },
                  weight: { type: Type.STRING }
                }
              }
            }
          },
          keywords: {
            type: Type.ARRAY,
            items: { 
              type: Type.OBJECT,
              properties: {
                term: { type: Type.STRING },
                explanation: { type: Type.STRING }
              },
              required: ["term", "explanation"]
            },
          },
          clinicalSnapshot: {
            type: Type.STRING,
            description: "High-density technical keywords for quick review.",
          },
          detailedClinicalAnalysis: {
            type: Type.STRING,
            description: "Elaborated professional medical analysis for doctors.",
          },
          recommendations: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
          riskLevel: {
            type: Type.STRING,
            enum: ["Low", "Medium", "High"],
          },
        },
        required: ["patientDetails", "keywords", "clinicalSnapshot", "detailedClinicalAnalysis", "recommendations", "riskLevel"],
      },
    },
  });

  try {
    return JSON.parse(response.text || "{}") as MedicalSummary;
  } catch (error) {
    console.error("Failed to parse Gemini response:", error);
    throw new Error("Failed to process the medical report. Please try again.");
  }
}
