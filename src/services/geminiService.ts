import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export interface Keyword {
  term: string;
  explanation: string;
}

export interface MedicalSummary {
  keywords: Keyword[];
  summary: string;
  recommendations: string[];
  riskLevel: "Low" | "Medium" | "High";
}

export interface ImageInput {
  inlineData: {
    data: string;
    mimeType: string;
  };
}

export async function summarizeMedicalReport(input: string | ImageInput): Promise<MedicalSummary> {
  const isImage = typeof input !== 'string';
  
  const contents = isImage 
    ? {
        parts: [
          { text: "Analyze this medical report image and provide a structured summary. Extract key medical terms as keywords. For each keyword, provide the technical term (for doctors) and a simple explanation (for patients). Provide a concise summary of findings, list recommendations, and assess risk level (Low, Medium, High)." },
          input
        ]
      }
    : `Analyze the following medical report text and provide a structured summary.
    Extract key medical terms as keywords. 
    For each keyword, provide:
    1. The technical term (for doctors).
    2. A simple, easy-to-understand explanation (for patients).
    
    Provide a concise summary of the findings.
    List any immediate recommendations or follow-up actions.
    Assess the general risk level based on the findings (Low, Medium, High).

    Medical Report:
    ${input}`;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: contents,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          keywords: {
            type: Type.ARRAY,
            items: { 
              type: Type.OBJECT,
              properties: {
                term: { type: Type.STRING, description: "The technical medical term." },
                explanation: { type: Type.STRING, description: "A simple explanation for the patient." }
              },
              required: ["term", "explanation"]
            },
            description: "List of key medical terms with explanations.",
          },
          summary: {
            type: Type.STRING,
            description: "A concise summary of the medical findings.",
          },
          recommendations: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "Suggested follow-up actions or recommendations.",
          },
          riskLevel: {
            type: Type.STRING,
            enum: ["Low", "Medium", "High"],
            description: "The assessed risk level of the report findings.",
          },
        },
        required: ["keywords", "summary", "recommendations", "riskLevel"],
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
